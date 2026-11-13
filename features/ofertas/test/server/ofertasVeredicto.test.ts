import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { groupOffers } from '../../server/vigia/grouping.js';
import {
  amazonInstallments,
  mercadolibreInstallments,
  titleInstallments,
  vtexInstallments,
} from '../../server/vigia/msi.js';
import { parseMercadolibreResults } from '../../server/vigia/sources/mercadolibre.js';
import { parseVtexProducts } from '../../server/vigia/sources/vtex.js';
import { readData } from '../../server/vigia/storage.js';
import type { Offer, PricePoint, Source, SourceAnswer } from '../../server/vigia/types.js';
import { judge, pickOffer, verdictLabel } from '../../server/vigia/verdict.js';
import { createVigia } from '../../server/vigia/vigia.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Local noon on 2026-11-20 (independent of the machine's time zone). */
const NOW = new Date(2026, 10, 20, 12, 0).getTime();

const offer = (store: string, price: number, o: Partial<Offer> = {}): Offer => ({
  sourceId: store.toLowerCase(),
  store,
  id: `${store}-${price}`,
  title: 'Bocina Marca X200 negra',
  price,
  official: true,
  url: `https://${store.toLowerCase()}.example/p`,
  ...o,
});

/** One point a day for `days` days before NOW, at this price (or from a function of the day index). */
function daily(
  days: number,
  price: number | ((i: number) => number),
  storePrice = true,
): PricePoint[] {
  const out: PricePoint[] = [];
  for (let i = days; i >= 1; i--) {
    const p = typeof price === 'number' ? price : price(i);
    out.push({
      at: new Date(NOW - i * DAY).toISOString(),
      price: p,
      ...(storePrice ? { storePrice: p } : {}),
    });
  }
  return out;
}

describe('ofertas: "esta es la mejor"', () => {
  it('picks the cheapest sold by the store itself and says a reseller is cheaper', () => {
    const pick = pickOffer([
      offer('Tienda A', 950, { official: false }),
      offer('Tienda B', 1000),
      offer('Tienda C', 1100),
    ])!;
    expect(pick.offer.store).toBe('Tienda B');
    expect(pick.reason).toBe(
      'La más barata que vende la tienda misma (Tienda B); un revendedor la tiene en $950',
    );
  });

  it('a tie goes to free shipping when one says so, and the reason says it', () => {
    const pick = pickOffer([
      offer('Tienda A', 1000),
      offer('Tienda B', 1000, { freeShipping: true }),
    ])!;
    expect(pick.offer.store).toBe('Tienda B');
    expect(pick.reason).toContain('mismo precio en Tienda A; esta dice envío gratis');
  });

  it('a tie with nothing to tell them apart is said as is', () => {
    const pick = pickOffer([offer('Tienda A', 1000), offer('Tienda B', 1000.2)])!;
    expect(pick.offer.store).toBe('Tienda A');
    expect(pick.reason).toBe(
      'La más barata que vende la tienda misma (Tienda A); mismo precio en Tienda B',
    );
  });

  it('with only resellers the cheapest one is picked and the reason says so', () => {
    const pick = pickOffer([
      offer('Tienda A', 900, { official: false }),
      offer('Tienda B', 800, { official: false }),
    ])!;
    expect(pick.offer.store).toBe('Tienda B');
    expect(pick.reason).toMatch(/^Ninguna la vende la tienda misma/);
    expect(pickOffer([])).toBeUndefined();
  });

  it('an offer that does not say who sells it is neither the store nor a reseller', () => {
    const unknown = offer('Tienda A', 900, { official: false, sellerUnknown: true });
    // With a store-sold option, that one is the pick, and the cheaper unknown one is said as such
    expect(pickOffer([unknown, offer('Tienda B', 1000)])!.reason).toBe(
      'La más barata que vende la tienda misma (Tienda B); Tienda A la tiene en $900 sin decir quién la vende',
    );
    // Without one, the unknown goes before a known reseller
    const pick = pickOffer([offer('Tienda C', 850, { official: false }), unknown])!;
    expect(pick.offer.store).toBe('Tienda A');
    expect(pick.reason).toBe(
      'La más barata; Tienda A no dice si la vende ella o un revendedor; un revendedor la tiene en $850',
    );
    // And it is not warned about as a reseller
    expect(judge({ offer: unknown, nowMs: NOW }).reason).toBe(
      'Aún no lo vigilo y solo una tienda lo tiene',
    );
  });

  it("grouping keeps the store's own offer when a reseller of the same store is cheaper", () => {
    const groups = groupOffers([
      offer('Tienda A', 900, { official: false, id: 'r' }),
      offer('Tienda A', 1000, { id: 'o' }),
      offer('Tienda A', 1050, { id: 'o2' }),
    ]);
    expect(groups[0]!.offers.map((o) => o.price)).toEqual([900, 1000]);
  });
});

describe('ofertas: the verdict', () => {
  it('few days: "todavía no sé" and how long it has been watched', () => {
    const v = judge({ offer: offer('Tienda A', 1000), history: daily(2, 1000), nowMs: NOW });
    expect(v).toEqual({
      kind: 'unknown',
      reason: 'Llevo 2 días viéndolo y solo una tienda lo tiene',
    });
    const fresh = judge({ offer: offer('Tienda A', 1000), nowMs: NOW });
    expect(fresh.reason).toBe('Aún no lo vigilo y solo una tienda lo tiene');
    expect(verdictLabel(fresh.kind)).toBe('Todavía no sé');
  });

  it('the lowest in its window and under its average is a good price', () => {
    const v = judge({ offer: offer('Tienda A', 880), history: daily(34, 1000), nowMs: NOW });
    expect(v.kind).toBe('good');
    expect(v.reason).toBe('El más bajo en 34 días, 12 % abajo de su promedio de 30 días');
    expect(verdictLabel(v.kind)).toBe('Buen precio');
  });

  it('under its average but not its lowest is still good; over it is expensive; near it is normal', () => {
    const wavy = daily(20, (i) => (i % 2 ? 900 : 1100)); // average 1000, low 900
    expect(judge({ offer: offer('Tienda A', 940), history: wavy, nowMs: NOW })).toEqual({
      kind: 'good',
      reason: '6 % abajo de su promedio de 20 días',
    });
    expect(judge({ offer: offer('Tienda A', 1200), history: wavy, nowMs: NOW })).toEqual({
      kind: 'expensive',
      reason: 'El más alto en 20 días, 20 % arriba de su promedio de 20 días',
    });
    expect(judge({ offer: offer('Tienda A', 1010), history: wavy, nowMs: NOW })).toEqual({
      kind: 'normal',
      reason: 'Cerca de su promedio de 20 días ($1,000)',
    });
  });

  it('the other stores: the cheapest of 5 and under the typical price is good', () => {
    const peers = [offer('B', 1100), offer('C', 1220), offer('D', 1250), offer('E', 1400)];
    const v = judge({ offer: offer('A', 1000), peers, nowMs: NOW });
    expect(v.kind).toBe('good');
    expect(v.reason).toBe('El más barato de 5 tiendas, 18 % abajo del precio típico entre tiendas');
    const dear = judge({ offer: offer('A', 1500), peers, nowMs: NOW });
    expect(dear).toEqual({
      kind: 'expensive',
      reason: '20 % arriba del precio típico entre 5 tiendas',
    });
    // Only two stores: not enough to say
    expect(judge({ offer: offer('A', 1000), peers: [offer('B', 2000)], nowMs: NOW }).kind).toBe(
      'unknown',
    );
  });

  it("a price seen by hand is one more fact, marked as the person's", () => {
    const ref = { price: 7139.05, at: new Date(2026, 10, 9).toISOString() };
    expect(judge({ offer: offer('A', 6800), reference: ref, nowMs: NOW })).toEqual({
      kind: 'good',
      reason: '5 % abajo de los $7,139.05 que viste el 9 nov',
    });
    expect(judge({ offer: offer('A', 7600), reference: ref, nowMs: NOW }).reason).toBe(
      '6 % arriba de los $7,139.05 que viste el 9 nov',
    );
    expect(judge({ offer: offer('A', 7150), reference: ref, nowMs: NOW })).toEqual({
      kind: 'normal',
      reason: 'Casi igual a los $7,139.05 que viste el 9 nov',
    });
  });

  it('facts that disagree tie into "precio normal" and both are said', () => {
    const v = judge({
      offer: offer('A', 880),
      history: daily(34, 1000),
      reference: { price: 800, at: new Date(2026, 10, 9).toISOString() },
      nowMs: NOW,
    });
    expect(v.kind).toBe('normal');
    expect(v.reason).toBe(
      'El más bajo en 34 días, 12 % abajo de su promedio de 30 días · 10 % arriba de los $800 que viste el 9 nov',
    );
  });

  it('a fact that lost the vote is still said when there is room (the price seen by hand first)', () => {
    const v = judge({
      offer: offer('A', 880),
      history: daily(34, 1000),
      reference: { price: 880, at: new Date(2026, 10, 9).toISOString() },
      nowMs: NOW,
    });
    expect(v.kind).toBe('good');
    expect(v.reason).toBe(
      'El más bajo en 34 días, 12 % abajo de su promedio de 30 días · casi igual a los $880 que viste el 9 nov',
    );
  });

  it('the store raised the price last week and now says "sale": it is said', () => {
    // 30 days at 1000, the last 5 at 1250, today 1000 with "before $1,400"
    const history = daily(35, (i) => (i <= 5 ? 1250 : 1000));
    const v = judge({ offer: offer('A', 1000, { listPrice: 1400 }), history, nowMs: NOW });
    expect(v.reason).toContain('ojo: subió 25 % en la última semana y hoy dice rebaja');
  });

  it('a "before" price the office never saw is said when there was no rise', () => {
    const v = judge({
      offer: offer('A', 1000, { listPrice: 2000 }),
      history: daily(10, 1000),
      nowMs: NOW,
    });
    expect(v.reason).toContain('ojo: el «antes» de $2,000 nunca lo vio la oficina');
  });

  it("a reseller's dip is not the store's: the store is judged on what stores sold themselves", () => {
    // Every day a reseller was cheapest (500) while the store sold it at 1000
    const history = daily(30, 500).map((p) => ({ ...p, storePrice: 1000 }));
    const store = judge({ offer: offer('A', 1000), history, nowMs: NOW });
    expect(store.kind).toBe('normal');
    expect(store.reason).toBe('Cerca de su promedio de 30 días ($1,000)');
    // The reseller itself is judged on the best price, and warned about
    const reseller = judge({ offer: offer('A', 500, { official: false }), history, nowMs: NOW });
    expect(reseller.reason).toContain('ojo: lo vende un revendedor, no la tienda');
  });
});

describe('ofertas: MSI by source', () => {
  it('Amazon: a card that names no seller is "unknown", not a reseller', async () => {
    const { parseAmazonPage } = await import('../../server/vigia/sources/amazon.js');
    const card = (asin: string, extra: string) =>
      `<div data-asin="${asin}" data-component-type="s-search-result"><h2><span>Bocina Marca X200</span></h2>` +
      `<span class="a-price"><span class="a-offscreen">$1,000.00</span></span>${extra}</div>`;
    const offers = parseAmazonPage(
      '<div class="s-main-slot">' +
        card('B000000001', '') +
        card('B000000002', '<span>Vendido por Amazon</span>') +
        card('B000000003', '<span>Vendido por Otra Tienda</span>') +
        '</div>',
    );
    expect(offers.map((o) => [o.official, o.sellerUnknown])).toEqual([
      [false, true],
      [true, undefined],
      [false, undefined],
    ]);
  });

  it('Amazon: "x N meses sin intereses" on the card, no bank', () => {
    const card =
      '<span class="a-price a-text-price"><span class="a-offscreen">$369.50</span></span>' +
      '<span class="a-size-base a-color-secondary"> x 4 meses sin intereses</span>';
    expect(amazonInstallments(card)).toEqual({ months: 4 });
    expect(amazonInstallments('<span>Envío gratis</span>')).toBeUndefined();
  });

  it('VTEX: the most payments at 0 % interest (shape of a real answer, 2026-11-13)', () => {
    const rows = [
      { PaymentSystemName: 'Visa', NumberOfInstallments: 1, InterestRate: 0, Value: 974 },
      { PaymentSystemName: 'Visa', NumberOfInstallments: 3, InterestRate: 0, Value: 324.66 },
      { PaymentSystemName: 'Visa', NumberOfInstallments: 12, InterestRate: 1.5, Value: 95 },
    ];
    expect(vtexInstallments(rows)).toEqual({ months: 3 });
    expect(vtexInstallments([rows[0]])).toBeUndefined();
    const offers = parseVtexProducts(
      [
        {
          productId: '1',
          productName: 'Bocina Marca X200',
          link: '/bocina/p',
          items: [
            {
              sellers: [
                {
                  sellerId: '1',
                  sellerDefault: true,
                  commertialOffer: { Price: 974, AvailableQuantity: 5, Installments: rows },
                },
              ],
            },
          ],
        },
      ],
      { id: 'tienda', name: 'Tienda', host: 'tienda.example' },
    );
    expect(offers[0]!.installments).toEqual({ months: 3 });
  });

  it('Mercado Libre: installments with rate 0 (from its documentation; not checked with a key)', () => {
    expect(mercadolibreInstallments({ quantity: 12, amount: 100, rate: 0 })).toEqual({
      months: 12,
    });
    expect(mercadolibreInstallments({ quantity: 12, amount: 120, rate: 35.5 })).toBeUndefined();
    const offers = parseMercadolibreResults([
      {
        id: 'MLM1',
        title: 'Bocina Marca X200',
        price: 1200,
        permalink: 'https://ml.example/p',
        installments: { quantity: 6, amount: 200, rate: 0, currency_id: 'MXN' },
      },
    ]);
    expect(offers[0]!.installments).toEqual({ months: 6 });
  });

  it('community titles: months and the bank only when named', () => {
    expect(titleInstallments('Bocina Marca X200 a 12 MSI')).toEqual({ months: 12 });
    expect(titleInstallments('Pantalla 55" | 18msi con BBVA')).toEqual({
      months: 18,
      bank: 'BBVA',
    });
    expect(titleInstallments('Laptop en 6 meses sin intereses con Citibanamex')).toEqual({
      months: 6,
      bank: 'Citibanamex',
    });
    expect(titleInstallments('Audífonos con MSI')).toEqual({});
    expect(titleInstallments('Audífonos de oferta en Tienda A')).toBeUndefined();
    // "Nu" only as a whole word
    expect(titleInstallments('Nuevos audífonos a 3 MSI')).toEqual({ months: 3 });
  });
});

describe('ofertas: verdict in the watch', () => {
  const answer = (offers: Offer[]): SourceAnswer => ({ offers, deals: [] });
  const fake = (id: string, get: () => SourceAnswer): Source => ({
    id,
    name: id,
    fragile: false,
    access: 'prueba',
    ready: () => true,
    searchUrl: () => `https://${id}.example`,
    search: async () => get(),
  });
  const title = 'Bocina Marca X200 negra';

  it('a check keeps the store price, the pick and the verdict; a reference persists and counts at once', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-ofertas-v-'));
    let now = NOW;
    const a = fake('a', () =>
      answer([
        offer('Tienda A', 900, { title, official: false, sourceId: 'a' }),
        offer('Tienda A', 1000, { title, sourceId: 'a', id: 'a-own' }),
      ]),
    );
    const b = fake('b', () => answer([offer('Tienda B', 1100, { title, sourceId: 'b' })]));
    const v = createVigia({
      home,
      sources: [a, b],
      now: () => now,
      random: () => 0.5,
      timers: false,
    });
    const w = v.saveWatch({ query: 'bocina marca x200' });
    await v.check(w.id);
    let got = v.state().watches[0]!;
    expect(got.best!.price).toBe(900);
    expect(got.history.at(-1)).toMatchObject({ price: 900, storePrice: 1000 });
    expect(got.pick!.offer.price).toBe(1000);
    expect(got.verdict).toEqual({
      kind: 'unknown',
      reason: 'Aún no lo vigilo y solo dos tiendas lo tienen',
    });

    now += HOUR;
    v.saveWatch({
      id: w.id,
      query: 'bocina marca x200',
      reference: { price: 1200, at: new Date(2026, 10, 9).toISOString() },
    });
    got = v.state().watches[0]!;
    expect(got.reference).toEqual({ price: 1200, at: new Date(2026, 10, 9).toISOString() });
    expect(got.verdict).toEqual({
      kind: 'good',
      reason: '17 % abajo de los $1,200 que viste el 9 nov',
    });
    // Saved to disk and read back
    expect(readData(home).watches[0]!.reference!.price).toBe(1200);
    expect(readData(home).watches[0]!.verdict!.kind).toBe('good');
    expect(readData(home).watches[0]!.history.at(-1)!.storePrice).toBe(1000);

    // A live search of the same words gives the group the same pick, with the watch's reference
    const r = await v.search('bocina marca x200');
    expect(r.groups[0]!.pick!.offer.price).toBe(1000);
    expect(r.groups[0]!.verdict!.reason).toContain('que viste el 9 nov');

    // An edit without the reference removes it (like the target)
    v.saveWatch({ id: w.id, query: 'bocina marca x200' });
    expect(v.state().watches[0]!.reference).toBeUndefined();
  });
});
