import { describe, expect, it } from 'vitest';

import type {
  OfertasSource,
  OfertasStoreCheck,
  OfertasWatch,
} from '../../../../core/src/messages.js';
import {
  bestOfGroup,
  cleanGroupName,
  groupNames,
  existingGroup,
  moveGroup,
  sameGroup,
  suggestForWatch,
  suggestGroup,
  watchGroups,
} from '../../webview/ofertasGrupos.js';
import {
  fewerWords,
  noPriceSentence,
  searchedCount,
  sourceChip,
  storeMark,
  storeSentence,
  storeWhen,
} from '../../webview/ofertasText.js';

const NOW = new Date(2026, 10, 16, 21, 0, 0).getTime();

const offer = (price: number, title = 'Producto', store = 'Tienda A') => ({
  sourceId: 'a',
  store,
  title,
  price,
  official: true,
  url: `https://a.example/${price}`,
});

const watch = (id: string, extra: Partial<OfertasWatch> = {}): OfertasWatch => ({
  id,
  query: `busqueda ${id}`,
  mustHave: [],
  exclude: [],
  history: [],
  reached: false,
  ...extra,
});

describe('ofertas panel: suggested group (a suggestion, from the title words)', () => {
  it.each([
    ['Bocina Marca B20 Canal Central', 'Bocinas'],
    ['Marca Serie 5 - Altavoz para estantería', 'Bocinas'],
    ['Parlante portátil', 'Bocinas'],
    ['Marca SW8 Home Subwoofer, bocina de 8 pulgadas', 'Subwoofer'],
    ['Barra de sonido con bocinas Dolby', 'Barra de sonido'],
    ['Receptor AV de Cine en casa 5.2 canales', 'Receptor'],
    ['Amplificador estéreo de 100 W', 'Receptor'],
    ['TP-Link Modelo AX20 Router WiFi 6', 'Red'],
    ['JBL Bocina portátil Bluetooth', 'Bocinas'],
    ['Apple iPad 10 WiFi 64 GB pantalla Retina', 'Tableta'],
    ['Laptop Marca 15 pulgadas pantalla Full HD', 'Computadora'],
    ['Sistema Wi-Fi de malla', 'Red'],
    ['Audífonos inalámbricos con cancelación', 'Audífonos'],
    ['Pantalla 55" 4K Smart TV', 'Televisión'],
    ['Consola de videojuegos', 'Consola'],
  ])('«%s» → %s', (title, group) => {
    expect(suggestGroup(title)).toBe(group);
  });

  it('nothing to suggest stays undefined (never a made-up group)', () => {
    expect(suggestGroup('Licuadora de 10 velocidades')).toBeUndefined();
    expect(suggestGroup('')).toBeUndefined();
    // Whole words only: "tvs" or "ampolla" do not hit "tv" or "amp"
    expect(suggestGroup('Ampolleta tvs')).toBeUndefined();
  });

  it('what the product IS decides; a word in passing does not, and in doubt nothing', () => {
    // "pantalla" describes a laptop, a watch or a phone
    expect(suggestGroup('Laptop Marca 14 pulgadas pantalla táctil')).toBe('Computadora');
    expect(suggestGroup('Reloj inteligente con pantalla AMOLED')).toBeUndefined();
    expect(suggestGroup('Smartwatch Marca pantalla 1.4 pulgadas')).toBeUndefined();
    expect(suggestGroup('Celular Marca A15 pantalla 6.5 pulgadas')).toBe('Celular');
    // "wifi" describes an iPad, a camera or a projector
    expect(suggestGroup('Apple iPad 9 WiFi 64 GB')).toBe('Tableta');
    expect(suggestGroup('Cámara de seguridad WiFi 1080p')).toBeUndefined();
    expect(suggestGroup('Proyector portátil WiFi 4K')).toBe('Televisión');
    // "malla" of a watch strap
    expect(suggestGroup('Correa de malla para reloj')).toBeUndefined();
    expect(suggestGroup('Marca Correa de malla milanesa 42 mm')).toBeUndefined();
    // An accessory names the product it is for
    expect(suggestGroup('Cargador rápido iPhone 15')).toBeUndefined();
    expect(suggestGroup('Soporte de pared para pantalla')).toBeUndefined();
    // What comes first decides
    expect(suggestGroup('Barra de sonido con subwoofer inalámbrico')).toBe('Barra de sonido');
    // An accessory title does not fall back to the search words
    expect(suggestGroup('Funda para iPad', 'ipad')).toBeUndefined();
  });

  it('a watch is judged by the store title before its own words', () => {
    const w = watch('1', {
      query: 'Marca SW8',
      best: offer(4000, 'Marca SW8 Home Subwoofer, woofer de 8 pulgadas'),
    });
    expect(suggestForWatch(w)).toBe('Subwoofer');
    expect(suggestForWatch(watch('2', { query: 'router mesh marca' }))).toBe('Red');
  });

  it('accents and capitals never make two groups', () => {
    expect(sameGroup('Audífonos', 'audifonos')).toBe(true);
    expect(sameGroup('Bocinas', 'Receptor')).toBe(false);
    expect(existingGroup(['Bocinas', 'Red'], 'bocinas')).toBe('Bocinas');
    expect(existingGroup(['Bocinas'], 'Sala')).toBe('Sala');
    const ws = [
      watch('1', { group: 'Audifonos' }),
      watch('2', { group: 'Audífonos' }),
      watch('3', { group: 'AUDÍFONOS' }),
    ];
    expect(groupNames(ws)).toEqual(['Audifonos']);
    expect(watchGroups(ws)).toHaveLength(1);
    expect(watchGroups(ws)[0]!.watches).toHaveLength(3);
  });

  it('a name typed by hand is cleaned and capped', () => {
    expect(cleanGroupName('  Bocinas   de  la sala ')).toBe('Bocinas de la sala');
    expect(cleanGroupName('   ')).toBe('');
    expect(cleanGroupName('x'.repeat(80))).toHaveLength(40);
  });
});

describe('ofertas panel: watches by group', () => {
  const good = (price: number) => ({
    best: offer(price),
    verdict: { kind: 'good' as const, reason: 'barato' },
  });
  const ws = [
    watch('a', { group: 'Receptor', ...good(9000) }),
    watch('b', { group: 'Bocinas', best: offer(1000), verdict: { kind: 'normal', reason: '' } }),
    watch('c'),
    watch('d', { group: 'bocinas', ...good(3000) }),
    watch('e', { group: 'Bocinas', ...good(2500) }),
    watch('f', { group: 'Red' }),
  ];

  it('alphabetical without an order, the same name in any case is one group, "Sin grupo" last', () => {
    const groups = watchGroups(ws);
    expect(groups.map((g) => g.name)).toEqual(['Bocinas', 'Receptor', 'Red', undefined]);
    expect(groups[0]!.watches.map((w) => w.id)).toEqual(['b', 'd', 'e']);
    expect(groups[3]!.watches.map((w) => w.id)).toEqual(['c']);
  });

  it('the best of a group is the cheapest with a good verdict (not just the cheapest)', () => {
    const groups = watchGroups(ws);
    expect(groups[0]!.best?.watch.id).toBe('e');
    expect(groups[0]!.best?.offer.price).toBe(2500);
    expect(groups[2]!.best).toBeUndefined();
    expect(bestOfGroup([])).toBeUndefined();
  });

  it('the person’s order first, then the rest alphabetically; groups no longer used drop out', () => {
    expect(groupNames(ws, ['Red', 'Ya no existe', 'bocinas'])).toEqual([
      'Red',
      'Bocinas',
      'Receptor',
    ]);
  });

  it('moving a group up or down gives the whole order', () => {
    const names = ['Bocinas', 'Receptor', 'Red'];
    expect(moveGroup(names, 'Red', -1)).toEqual(['Bocinas', 'Red', 'Receptor']);
    expect(moveGroup(names, 'Bocinas', 1)).toEqual(['Receptor', 'Bocinas', 'Red']);
    expect(moveGroup(names, 'Bocinas', -1)).toEqual(names);
    expect(moveGroup(names, 'Red', 1)).toEqual(names);
  });

  it('moving keeps the place of groups saved in the order that have no watches today', () => {
    const saved = ['Bocinas', 'Tocadiscos', 'Receptor', 'Red', 'Sala'];
    const shown = ['Bocinas', 'Receptor', 'Red'];
    expect(moveGroup(shown, 'Red', -1, saved)).toEqual([
      'Bocinas',
      'Tocadiscos',
      'Red',
      'Receptor',
      'Sala',
    ]);
    // A visible group not in the saved order yet goes after the saved ones
    expect(moveGroup(['Bocinas', 'Nuevo'], 'Nuevo', -1, ['Bocinas', 'Sala'])).toEqual([
      'Nuevo',
      'Sala',
      'Bocinas',
    ]);
    // "Tocadiscos" comes back where it was
    expect(
      groupNames(
        [
          watch('1', { group: 'Receptor' }),
          watch('2', { group: 'Tocadiscos' }),
          watch('3', { group: 'Bocinas' }),
        ],
        moveGroup(shown, 'Red', -1, saved),
      ),
    ).toEqual(['Bocinas', 'Tocadiscos', 'Receptor']);
  });
});

describe('ofertas panel: "dónde buscó"', () => {
  const at = new Date(NOW - 5 * 60_000).toISOString();
  const stores: OfertasStoreCheck[] = [
    { id: 'amazon', name: 'Amazon', result: 'none', returned: 24, discarded: 24, at },
    { id: 'costco', name: 'Costco', result: 'none', returned: 0, discarded: 0, at },
    { id: 'elektra', name: 'Elektra', result: 'blocked', detail: 'Bloqueó la consulta', at },
    { id: 'walmart', name: 'Walmart', result: 'link', detail: 'Solo con liga' },
    { id: 'ml', name: 'Mercado Libre', result: 'nokey', detail: 'Falta la llave' },
    { id: 'od', name: 'Office Depot', result: 'off', detail: 'Apagada' },
  ];

  it('every result has a sign that reads without color', () => {
    const marks = (['found', 'none', 'error', 'blocked', 'off', 'nokey', 'link'] as const).map(
      (r) => storeMark(r).mark,
    );
    expect(marks).toEqual(['✓', '–', '✗', '✗', '○', '!', '↗']);
    expect(storeMark('found').tone).toBe('ok');
  });

  it('"Ninguna tienda lo tiene" says which store answered what, with the words searched', () => {
    expect(noPriceSentence(stores, 'Marca Router AX20')).toBe(
      'Amazon contestó 24 resultados, ninguno coincide con «Marca Router AX20»; Costco contestó sin resultados; Elektra no contestó',
    );
    expect(noPriceSentence(undefined, 'x')).toBeUndefined();
    expect(noPriceSentence([stores[3]!, stores[5]!], 'x')).toContain(
      'Ninguna tienda se pudo consultar',
    );
  });

  it('a store that found it without a usable price is said as such, never "ninguna se pudo consultar"', () => {
    const found: OfertasStoreCheck = { id: 'a', name: 'Tienda A', result: 'found', at };
    expect(noPriceSentence([found, stores[3]!], 'x')).toBe(
      'Tienda A lo tiene, pero sin un precio que se pueda usar',
    );
    expect(noPriceSentence([found, { ...found, id: 'b', name: 'Tienda B' }, stores[2]!], 'x')).toBe(
      'Tienda A y Tienda B lo tienen, pero sin un precio que se pueda usar; Elektra no contestó',
    );
  });

  it('one store, in a sentence and with its time', () => {
    expect(
      storeSentence(
        { id: 'a', name: 'A', result: 'found', price: 3600, returned: 20, discarded: 19 },
        'q',
      ),
    ).toBe('Lo tiene desde $3,600 (1 de 20 resultados)');
    expect(storeSentence(stores[0]!, 'Router AX20')).toBe(
      'Contestó 24 resultados; ninguno coincide con «Router AX20»',
    );
    expect(storeSentence(stores[1]!, 'x')).toBe('Contestó sin resultados');
    expect(storeSentence(stores[2]!, 'x')).toBe('Bloqueó la consulta');
    expect(storeWhen(stores[0]!, NOW)).toBe('a las 20:55');
    expect(storeWhen({ ...stores[0]!, reused: true }, NOW)).toBe('respuesta de antes, a las 20:55');
    expect(storeWhen(stores[3]!, NOW)).toBe('');
    expect(searchedCount(stores)).toBe('Contestaron 2 de 5 tiendas que lee · 1 para abrir tú');
    expect(searchedCount([{ id: 'a', name: 'A', result: 'found' }])).toBe(
      'Contestó 1 de 1 tienda que lee · 1 lo tiene',
    );
  });

  it('suggests the search without its first word only when there are 3 words or more', () => {
    expect(fewerWords('TP-Link Archer AX20')).toBe('Archer AX20');
    expect(fewerWords('Archer AX20')).toBeUndefined();
  });

  it('a link-only source is never "apagada" in a search', () => {
    const s: OfertasSource = {
      id: 'w',
      name: 'W',
      state: 'off',
      fragile: true,
      enabled: false,
      linkOnly: true,
    };
    expect(sourceChip(s).text).toBe('↗ ábrela tú');
    // Turned on with the browser, it is read: its chip says what it answered
    expect(sourceChip({ ...s, state: 'ok', enabled: true, viaBrowser: true, count: 7 })).toEqual({
      text: '✓ 7',
      tone: 'ok',
    });
  });

  it('a store read with the browser says so in its sentence (the row, its tooltip and its aria-label)', () => {
    expect(
      storeSentence(
        {
          id: 'a',
          name: 'A',
          result: 'found',
          price: 3600,
          returned: 20,
          discarded: 19,
          viaBrowser: true,
        },
        'q',
      ),
    ).toBe('Lo tiene desde $3,600 (1 de 20 resultados) · con el navegador');
    expect(
      storeSentence(
        { id: 'a', name: 'A', result: 'blocked', detail: 'Bloqueó la consulta', viaBrowser: true },
        'q',
      ),
    ).toBe('Bloqueó la consulta · con el navegador');
  });
});
