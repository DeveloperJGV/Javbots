import { beforeEach, describe, expect, it } from 'vitest';

import type {
  OfertasAlert,
  OfertasResults,
  OfertasSource,
  OfertasStatus,
} from '../../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../../webview-ui/src/office/types.js';
import { OFERTAS_KIOSK_ON_TYPE, OFERTAS_KIOSK_TYPE } from '../../webview/constants.js';
import { applyOfertasFurniture } from '../../webview/ofertasFurniture.js';
import { asistenteKey, isOfertasFurniture, ofertasStore } from '../../webview/ofertasStore.js';
import {
  ago,
  allSourcesFailed,
  ASISTENTE_ERROR_TEXT,
  asistenteFooter,
  confianzaTag,
  elapsedText,
  fuenteText,
  precioFacts,
  similarTag,
  chartShape,
  checkedText,
  clock,
  keepaUrl,
  money,
  msiText,
  parsePrice,
  profecoLink,
  rangeText,
  realDiscount,
  referenceFromFields,
  referenceText,
  searchingText,
  sellerTag,
  shortDate,
  sourceChip,
  sourcesSentence,
  splitWords,
  verdictTag,
  watchEditMessage,
  watchFormFields,
} from '../../webview/ofertasText.js';

const NOW = new Date(2026, 10, 12, 21, 0, 0).getTime();
const at = (minutesFromNow: number) => new Date(NOW + minutesFromNow * 60_000).toISOString();

const source = (name: string, state: OfertasSource['state'], extra: Partial<OfertasSource> = {}) =>
  ({
    id: name.toLowerCase(),
    name,
    state,
    fragile: false,
    enabled: true,
    ...extra,
  }) as OfertasSource;

const alert = (seen: boolean): OfertasAlert => ({
  id: 'a1',
  watchId: 'w1',
  at: at(-5),
  kind: 'target',
  text: 'Bajó de tu precio',
  seen,
});

const status = (alerts: OfertasAlert[]): OfertasStatus => ({
  type: 'ofertasStatus',
  watches: [],
  alerts,
  sources: [],
  settings: { everyMinutes: 60, buenFin: false, dropPercent: 10, disabledSources: [] },
  checking: false,
});

const results = (requestId: string, query: string): OfertasResults => ({
  type: 'ofertasResults',
  requestId,
  query,
  searching: false,
  groups: [],
  deals: [],
  sources: [],
  links: [],
});

const sprite = (fill: string): SpriteData => [[fill]];
const piece = (type: string, s: SpriteData): FurnitureInstance =>
  ({ type, sprite: s, x: 0, y: 0, zY: 0 }) as unknown as FurnitureInstance;

describe('ofertas text', () => {
  it('writes pesos like a store', () => {
    expect(money(1499)).toBe('$1,499');
    expect(money(1499.5)).toBe('$1,499.50');
    expect(money(25999)).toBe('$25,999');
    expect(money(1234567)).toBe('$1,234,567');
    expect(money(89)).toBe('$89');
  });

  it('says times digitally and how long ago', () => {
    expect(clock(at(40))).toBe('21:40');
    expect(ago(at(-12), NOW)).toBe('hace 12 min');
    expect(ago(at(0), NOW)).toBe('hace un momento');
    expect(ago(at(-180), NOW)).toBe('hace 3 h');
    expect(ago(at(-60 * 48), NOW)).toBe('hace 2 días');
    expect(shortDate(at(-5), NOW)).toBe('hoy');
    expect(shortDate(new Date(2026, 10, 11, 9).toISOString(), NOW)).toBe('ayer');
    expect(shortDate(new Date(2026, 9, 3, 9).toISOString(), NOW)).toBe('3 oct');
  });

  it('says when it checked and when it checks next', () => {
    const watch = {
      id: 'w',
      query: 'audífonos bluetooth',
      mustHave: [],
      exclude: [],
      history: [],
      reached: false,
      checkedAt: at(-12),
      nextCheckAt: at(40),
    };
    expect(checkedText(watch, NOW)).toBe('Revisó hace 12 min · próxima 21:40');
    expect(checkedText({ ...watch, checkedAt: undefined, nextCheckAt: undefined }, NOW)).toBe(
      'Aún no revisa',
    );
  });

  it('puts the failed sources in one sentence', () => {
    expect(sourcesSentence([source('Mercado Libre', 'error'), source('Amazon', 'ok')])).toBe(
      'Mercado Libre no contestó; lo demás sí',
    );
    expect(sourcesSentence([source('Walmart', 'blocked')])).toBe('Walmart bloqueó la consulta');
    expect(sourcesSentence([source('Mercado Libre', 'nokey')])).toBe(
      'Falta la llave de Mercado Libre',
    );
    expect(sourcesSentence([source('A', 'error'), source('B', 'error'), source('C', 'off')])).toBe(
      'A y B no contestaron',
    );
    expect(sourcesSentence([source('Amazon', 'ok'), source('C', 'off')])).toBeUndefined();
    expect(
      allSourcesFailed([source('A', 'error'), source('B', 'blocked'), source('C', 'off')]),
    ).toBe(true);
    expect(allSourcesFailed([source('A', 'error'), source('B', 'ok')])).toBe(false);
    expect(sourceChip(source('A', 'ok', { count: 12 }))).toEqual({ text: '✓ 12', tone: 'ok' });
    expect(sourceChip(source('A', 'nokey')).text).toBe('falta llave');
    expect(searchingText([source('A', 'idle'), source('B', 'idle'), source('C', 'off')])).toBe(
      'Buscando en 2 tiendas…',
    );
  });

  it('works out the real discount against the stated price', () => {
    expect(realDiscount(800, 1000)).toBe(20);
    expect(realDiscount(1000, 1000)).toBeUndefined();
    expect(realDiscount(1000, undefined)).toBeUndefined();
  });

  it('draws the history as a stepped line with the lowest point', () => {
    expect(chartShape([], 100, 20)).toBeUndefined();
    expect(chartShape([{ at: at(0), price: 5 }], 100, 20)).toBeUndefined();
    const shape = chartShape(
      [
        { at: at(-120), price: 200 },
        { at: at(-60), price: 100 },
        { at: at(0), price: 150 },
      ],
      100,
      20,
    );
    expect(shape?.points).toBe('0,0 50,0 50,20 100,20 100,10');
    expect(shape?.low).toEqual({ x: 50, y: 20 });
    // A flat history sits in the middle
    const flat = chartShape(
      [
        { at: at(-1), price: 9 },
        { at: at(0), price: 9 },
      ],
      10,
      10,
    );
    expect(flat?.points).toBe('0,5 10,5 10,5');
  });

  it('reads the form fields', () => {
    expect(splitWords(' bluetooth, negro ,, ')).toEqual(['bluetooth', 'negro']);
    expect(parsePrice('$1,499.50')).toBe(1499.5);
    expect(parsePrice('')).toBeUndefined();
    expect(parsePrice('abc')).toBeUndefined();
    expect(parsePrice('0')).toBeUndefined();
  });
});

describe('ofertas store', () => {
  beforeEach(() => ofertasStore.close());

  it('keeps only the answer of the last search', () => {
    const first = ofertasStore.startSearch('audífonos');
    const second = ofertasStore.startSearch('audífonos bluetooth');
    expect(first).not.toBe(second);
    expect(ofertasStore.get().results?.searching).toBe(true);

    ofertasStore.setResults(results(first, 'audífonos'));
    expect(ofertasStore.get().results?.query).toBe('audífonos bluetooth');
    expect(ofertasStore.get().results?.searching).toBe(true);

    ofertasStore.setResults(results(second, 'audífonos bluetooth'));
    expect(ofertasStore.get().results?.searching).toBe(false);
  });

  it('forgets the search when the field is emptied, and ignores its late answer', () => {
    const id = ofertasStore.startSearch('lentes');
    ofertasStore.setResults(results(id, 'lentes'));
    expect(ofertasStore.get().results?.query).toBe('lentes');

    ofertasStore.clearSearch();
    expect(ofertasStore.get().results).toBeUndefined();

    const late = ofertasStore.startSearch('audífonos');
    ofertasStore.clearSearch();
    ofertasStore.setResults(results(late, 'audífonos'));
    expect(ofertasStore.get().results).toBeUndefined();
  });

  it('opens on a tab and closes', () => {
    ofertasStore.open('avisos');
    expect(ofertasStore.get()).toMatchObject({ open: true, tab: 'avisos' });
    ofertasStore.close();
    expect(ofertasStore.get().open).toBe(false);
  });

  it('the kiosk (off or on) opens the panel', () => {
    expect(isOfertasFurniture(OFERTAS_KIOSK_TYPE)).toBe(true);
    expect(isOfertasFurniture(`${OFERTAS_KIOSK_ON_TYPE}:left`)).toBe(true);
    expect(isOfertasFurniture('POMODORO_TIMER')).toBe(false);
    expect(isOfertasFurniture(undefined)).toBe(false);
  });
});

describe('ofertas furniture', () => {
  const off = sprite('off');
  const lit = sprite('lit');
  const kiosk = piece(OFERTAS_KIOSK_TYPE, off);
  const other = piece('DESK', off);

  it('lights the kiosk only while there are unseen alerts', () => {
    const list = [kiosk, other];
    expect(applyOfertasFurniture(list, undefined, () => lit)).toBe(list);
    expect(applyOfertasFurniture(list, status([alert(true)]), () => lit)).toBe(list);
    const [shown, desk] = applyOfertasFurniture(list, status([alert(false)]), () => lit);
    expect(shown.sprite).toBe(lit);
    expect(desk).toBe(other);
    // The stored piece keeps its off look
    expect(kiosk.sprite).toBe(off);
  });

  it('does nothing when the catalog has no lit kiosk yet', () => {
    const list = [kiosk];
    expect(applyOfertasFurniture(list, status([alert(false)]), () => undefined)).toBe(list);
    // The real catalog (empty in tests) does not break it either
    expect(applyOfertasFurniture(list, status([alert(false)]))).toBe(list);
  });
});

describe('editing a saved search', () => {
  const watch = { id: 'w1', query: 'bocina jbl', target: 1499, mustHave: ['negro'], exclude: [] };

  const TODAY = new Date(2026, 10, 13, 18).getTime();
  const noRef = { refPrice: '', refDate: '2026-11-13' };

  it('starts the form with what the search has', () => {
    expect(watchFormFields(watch, TODAY)).toEqual({
      target: '1499',
      mustHave: 'negro',
      exclude: '',
      ...noRef,
    });
    expect(watchFormFields({ mustHave: [], exclude: ['funda', 'usado'] }, TODAY)).toEqual({
      target: '',
      mustHave: '',
      exclude: 'funda, usado',
      ...noRef,
    });
    const seen = { price: 999.5, at: new Date(2026, 10, 9, 12).toISOString() };
    expect(watchFormFields({ ...watch, reference: seen }, TODAY)).toMatchObject({
      refPrice: '999.5',
      refDate: '2026-11-09',
    });
  });

  it('the price seen by hand goes with its day, and an empty one removes it', () => {
    const msg = watchEditMessage(
      watch,
      { target: '', mustHave: '', exclude: '', refPrice: '$1,250.50', refDate: '2026-11-09' },
      TODAY,
    );
    expect(msg.reference).toEqual({
      price: 1250.5,
      at: new Date(2026, 10, 9, 12).toISOString(),
    });
    expect(referenceFromFields({ refPrice: 'abc', refDate: '2026-11-09' })).toBeUndefined();
    // No valid day: today
    expect(referenceFromFields({ refPrice: '100', refDate: '' }, TODAY)!.at).toBe(
      new Date(TODAY).toISOString(),
    );
    expect(
      'reference' in watchEditMessage(watch, { ...noRef, target: '', mustHave: '', exclude: '' }),
    ).toBe(false);
  });

  it('saves with the same id and query, and an empty target removes it', () => {
    expect(
      watchEditMessage(watch, {
        target: '$1,299',
        mustHave: 'negro, bluetooth',
        exclude: 'funda',
        ...noRef,
      }),
    ).toEqual({
      type: 'saveOfertasWatch',
      id: 'w1',
      query: 'bocina jbl',
      target: 1299,
      mustHave: ['negro', 'bluetooth'],
      exclude: ['funda'],
    });
    const cleared = watchEditMessage(watch, { target: '', mustHave: '', exclude: '', ...noRef });
    expect('target' in cleared).toBe(false);
    expect(cleared).toMatchObject({ id: 'w1', mustHave: [], exclude: [] });
  });
});

describe('is it a real deal', () => {
  const NOW2 = new Date(2026, 10, 13, 18).getTime();
  const day = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();

  it('labels the verdict', () => {
    expect(verdictTag('good')).toEqual({ text: 'Buen precio', tone: 'ok' });
    expect(verdictTag('normal')).toEqual({ text: 'Precio normal', tone: 'warn' });
    expect(verdictTag('expensive')).toEqual({ text: 'Caro', tone: 'bad' });
    expect(verdictTag('unknown')).toEqual({ text: 'Todavía no sé', tone: 'muted' });
  });

  it('says who sells it, with what it means on hover', () => {
    expect(sellerTag({ official: true }).text).toBe('Lo vende la tienda');
    expect(sellerTag({ official: false }).text).toBe('Revendedor');
    expect(sellerTag({ official: true }).title).toMatch(/tienda misma/);
    expect(sellerTag({ official: false, sellerUnknown: true }).text).toBe('No dice quién lo vende');
  });

  it('says MSI only with what the store gave', () => {
    expect(msiText({ months: 12 })).toBe('MSI: hasta 12 meses');
    expect(msiText({ months: 18, bank: 'BBVA' })).toBe('MSI: hasta 18 meses con BBVA');
    expect(msiText({})).toBe('MSI');
  });

  it('links Keepa for Amazon only, and the Profeco comparator by date', () => {
    expect(keepaUrl({ sourceId: 'amazon', url: 'https://www.amazon.com.mx/dp/B0ABCDEF12' })).toBe(
      'https://keepa.com/#!product/11-B0ABCDEF12',
    );
    expect(
      keepaUrl({ sourceId: 'elektra', url: 'https://x.example/dp/B0ABCDEF12' }),
    ).toBeUndefined();
    expect(profecoLink(new Date(2026, 10, 17, 23).getTime()).url).toBe(
      'https://elbuenfin.profeco.gob.mx/',
    );
    expect(profecoLink(new Date(2026, 10, 18, 0).getTime()).url).toBe(
      'https://qqp.profeco.gob.mx/',
    );
  });

  it('says the lowest and highest the office saw, with their days', () => {
    const history = [
      { at: day(3), price: 1300 },
      { at: day(8), price: 1100 },
      { at: day(12), price: 999 },
      { at: day(13), price: 1050 },
    ];
    expect(rangeText(history, NOW2)).toBe('mínimo $999 (ayer) · máximo $1,300 (3 nov) · 11 días');
    expect(rangeText([], NOW2)).toBeUndefined();
    expect(rangeText([{ at: day(13), price: 5 }], NOW2)).toBe(
      'mínimo $5 (hoy) · máximo $5 (hoy) · 1 día',
    );
  });

  it('says the price seen by hand', () => {
    expect(referenceText({ price: 7139.05, at: day(9) }, NOW2)).toBe(
      'Lo viste en $7,139.05 el 9 nov',
    );
    expect(referenceText({ price: 100, at: day(13, 9) }, NOW2)).toBe('Lo viste en $100 hoy');
  });
});

describe('ofertas: the optional assistant on the page', () => {
  const precio = {
    precioTipico: 1899,
    minimoVisto: 1599,
    nota: 'Precio normal alrededor de $1,899.',
    confianza: 'alta' as const,
    fuentes: [
      {
        titulo: 'Tienda A',
        url: 'https://tienda-a.example/p/1',
        fecha: '2026-11-09',
        precio: 1899,
      },
      { titulo: 'Tienda B', url: 'https://tienda-b.example/p/2' },
    ],
    revisado: new Date(2026, 10, 13, 21, 40).toISOString(),
  };

  it('says where an answer belongs', () => {
    expect(asistenteKey({ watchId: 'w1' })).toBe('w:w1');
    expect(asistenteKey({ requestId: 'r1', groupKey: 'g1' })).toBe('g:r1:g1');
    expect(asistenteKey({ requestId: 'r1' })).toBeUndefined();
  });

  it('keeps each answer by product; an error stays until the same job works', () => {
    ofertasStore.setAsistente({
      type: 'ofertasAsistenteEstado',
      installed: true,
      enabled: true,
      available: true,
      model: 'haiku',
      busy: false,
    });
    expect(ofertasStore.get().asistente?.available).toBe(true);
    ofertasStore.setAsistenteResult({
      type: 'ofertasAsistenteResultado',
      job: 'precio',
      product: 'Bocina',
      ok: false,
      reason: 'timeout',
      requestId: 'r9',
      groupKey: 'g1',
    });
    expect(ofertasStore.get().asistenteResults['g:r9:g1']?.error?.reason).toBe('timeout');
    ofertasStore.setAsistenteResult({
      type: 'ofertasAsistenteResultado',
      job: 'precio',
      product: 'Bocina',
      ok: true,
      precio,
      requestId: 'r9',
      groupKey: 'g1',
    });
    const entry = ofertasStore.get().asistenteResults['g:r9:g1']!;
    expect(entry.error).toBeUndefined();
    expect(entry.precio?.precioTipico).toBe(1899);
    // Without a place to go, an answer is ignored
    ofertasStore.setAsistenteResult({
      type: 'ofertasAsistenteResultado',
      job: 'precio',
      product: 'Bocina',
      ok: true,
      precio,
    });
    expect(Object.keys(ofertasStore.get().asistenteResults)).toEqual(['g:r9:g1']);
  });

  it("takes the search's results again with the assistant's verdict (same search id)", () => {
    const id = ofertasStore.startSearch('bocina');
    const group = {
      key: 'g1',
      title: 'Bocina X',
      offers: [],
      verdict: { kind: 'unknown' as const, reason: 'Aún no lo vigilo y solo una tienda lo tiene' },
    };
    ofertasStore.setResults({ ...results(id, 'bocina'), groups: [group] });
    ofertasStore.setResults({
      ...results(id, 'bocina'),
      groups: [
        {
          ...group,
          verdict: {
            kind: 'good',
            reason: '10 % abajo del precio típico que encontró el asistente ($1,899) (asistente)',
          },
        },
      ],
    });
    const v = ofertasStore.get().results!.groups[0]!.verdict!;
    expect(verdictTag(v.kind).text).toBe('Buen precio');
    expect(v.reason).toContain('(asistente)');
  });

  it('every failure has a plain sentence, no technical words', () => {
    const reasons = [
      'no-cli',
      'off',
      'busy',
      'no-subscription',
      'timeout',
      'cancelled',
      'bad-output',
      'failed',
    ] as const;
    for (const r of reasons) {
      expect(ASISTENTE_ERROR_TEXT[r], r).toMatch(/^[A-ZÁÉÍÓÚC]/);
      expect(ASISTENTE_ERROR_TEXT[r], r).not.toMatch(/CLI|JSON|timeout|stderr|exit|API/);
    }
    expect(ASISTENTE_ERROR_TEXT.timeout).toBe(
      'El asistente tardó demasiado y se detuvo. Intenta de nuevo en un rato.',
    );
  });

  it('the footer, the clock while it works and the numbers it found', () => {
    expect(asistenteFooter(precio.revisado)).toBe('Lo investigó un asistente el 13 nov · 21:40');
    expect(asistenteFooter(precio.revisado, 'Los buscó')).toBe(
      'Los buscó un asistente el 13 nov · 21:40',
    );
    const start = new Date(2026, 10, 13, 21, 0, 0).toISOString();
    expect(elapsedText(start, new Date(2026, 10, 13, 21, 0, 42).getTime())).toBe('0:42');
    expect(elapsedText(start, new Date(2026, 10, 13, 21, 1, 5).getTime())).toBe('1:05');
    expect(elapsedText(undefined)).toBe('0:00');
    expect(precioFacts(precio)).toEqual([
      { label: 'Precio típico', value: '$1,899' },
      { label: 'Mínimo visto', value: '$1,599' },
    ]);
    expect(precioFacts({ ...precio, precioTipico: undefined, minimoVisto: undefined })).toEqual([]);
    expect(confianzaTag('alta')).toEqual({ text: 'Confianza alta', tone: 'ok' });
    expect(confianzaTag('baja').tone).toBe('muted');
    expect(fuenteText(precio.fuentes[0]!)).toBe('Tienda A · $1,899 · 9 nov');
    expect(fuenteText(precio.fuentes[1]!)).toBe('Tienda B');
    expect(similarTag('compa')).toBe('Su compa');
  });
});
