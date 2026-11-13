import { describe, expect, it } from 'vitest';

import { bestPerStore, groupOffers } from '../../server/vigia/grouping.js';
import { isRelevant, modelTokens, normalize } from '../../server/vigia/relevance.js';
import { alertsFor, describeTrend, money, suspiciousListPrice } from '../../server/vigia/rules.js';
import { defaultSettings } from '../../server/vigia/storage.js';
import type { CommunityDeal, Offer, PricePoint, Watch } from '../../server/vigia/types.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Local noon on 2026-11-20 (independent of the machine's time zone). */
const NOW = new Date(2026, 10, 20, 12, 0).getTime();

const offer = (o: Partial<Offer> & { title: string; price: number }): Offer => ({
  sourceId: 'a',
  store: 'Tienda A',
  id: o.title + o.price,
  official: true,
  url: 'https://tienda.example/p',
  ...o,
});

const watch = (w: Partial<Watch> = {}): Watch => ({
  id: 'w1',
  query: 'audífonos sony wh-1000xm5',
  mustHave: [],
  exclude: [],
  createdAt: new Date(NOW - 10 * DAY).toISOString(),
  others: [],
  history: [],
  reached: false,
  seenDeals: [],
  ...w,
});

const pts = (...pairs: [number, number][]): PricePoint[] =>
  pairs.map(([agoMs, price]) => ({ at: new Date(NOW - agoMs).toISOString(), price }));

const deal = (d: Partial<CommunityDeal> & { id: string; title: string }): CommunityDeal => ({
  temperature: 100,
  url: 'https://comunidad.example/d',
  expired: false,
  ...d,
});

describe('ofertas: relevance', () => {
  it('normalizes accents, case and signs', () => {
    expect(normalize('  Audífonos  WH-1000XM5!! ')).toBe('audifonos wh 1000xm5');
    expect(modelTokens('Sony WH-1000XM5')).toEqual(['wh1000xm5']);
    expect(modelTokens('sony wh 1000xm5 128 GB 40h')).toEqual(['wh1000xm5', '128gb']);
  });

  it('keeps the product and drops accessories', () => {
    const q = { query: 'audífonos sony wh-1000xm5' };
    expect(isRelevant('Audífonos Inalámbricos Sony WH-1000XM5 Negro', q)).toBe(true);
    expect(isRelevant('Sony WH1000XM5 audifonos con estuche de carga', q)).toBe(true);
    expect(isRelevant('Funda para audífonos Sony WH-1000XM5', q)).toBe(false);
    expect(isRelevant('Almohadillas compatibles con audífonos Sony WH-1000XM5', q)).toBe(false);
    expect(isRelevant('Audífonos de repuesto Sony WH-1000XM5', q)).toBe(false);
    const b = { query: 'bocina jbl flip 6' };
    expect(isRelevant('Bocina JBL Flip 6 para exteriores', b)).toBe(true);
    expect(isRelevant('Cubierta de silicón para bocina JBL Flip 6', { query: 'jbl flip 6' })).toBe(
      false,
    );
    expect(isRelevant('Control inalámbrico para PS5', { query: 'ps5' })).toBe(false);
    expect(isRelevant('Control inalámbrico para PS5', { query: 'control ps5' })).toBe(true);
  });

  it('models must match exactly, with or without hyphen or space', () => {
    const q = { query: 'sony wh-1000xm5' };
    expect(isRelevant('Sony WH 1000XM5', q)).toBe(true);
    expect(isRelevant('Sony WH1000XM5', q)).toBe(true);
    expect(isRelevant('Sony WH-1000XM4', q)).toBe(false);
    expect(isRelevant('Samsung Galaxy S24 256GB', { query: 'galaxy s24' })).toBe(true);
    expect(isRelevant('Samsung Galaxy S23 256GB', { query: 'galaxy s24' })).toBe(false);
    expect(isRelevant('Samsung Galaxy S245', { query: 'galaxy s24' })).toBe(false);
  });

  it('every meaningful word, plurals alike, articles ignored', () => {
    expect(isRelevant('Bocinas Bluetooth portátiles', { query: 'las bocinas bluetooth' })).toBe(
      true,
    );
    expect(isRelevant('Bocina portátil', { query: 'bocinas bluetooth' })).toBe(false);
  });

  it('mustHave and exclude of the watch', () => {
    const rule = { query: 'audifonos sony', mustHave: ['inalámbricos'], exclude: ['niños'] };
    expect(isRelevant('Audífonos Sony inalámbricos', rule)).toBe(true);
    expect(isRelevant('Audífonos Sony con cable', rule)).toBe(false);
    expect(isRelevant('Audífonos Sony inalámbricos para niños', rule)).toBe(false);
  });

  it('a built-in exclusion does not apply when the query asks for it', () => {
    expect(isRelevant('Funda iPhone 15 transparente', { query: 'funda iphone 15' })).toBe(true);
    expect(isRelevant('Funda iPhone 15 transparente', { query: 'iphone 15' })).toBe(false);
    expect(isRelevant('Fundas iPhone 15 pack', { query: 'funda iphone 15' })).toBe(true);
  });

  it('drops the feminine and plural forms of the built-in exclusions too', () => {
    const q = { query: 'jbl bar 1000' };
    expect(isRelevant('Barra de sonido JBL Bar 1000', q)).toBe(true);
    for (const title of [
      'Barra de sonido JBL Bar 1000 Reacondicionada',
      'Barra de sonido JBL Bar 1000 reacondicionadas',
      'Barra de sonido JBL Bar 1000 reacondicionados',
      'Barra de sonido JBL Bar 1000 usada',
      'Barras de sonido JBL Bar 1000 usadas',
      'Fundas para JBL Bar 1000',
      'Cajas vacías JBL Bar 1000',
    ]) {
      expect(isRelevant(title, q), title).toBe(false);
    }
    expect(isRelevant('Vidrios templados iPhone 15', { query: 'iphone 15' })).toBe(false);
    // Asked for in the query (any form): kept
    expect(
      isRelevant('JBL Bar 1000 reacondicionada', { query: 'jbl bar 1000 reacondicionada' }),
    ).toBe(true);
  });
});

describe('ofertas: grouping', () => {
  it('joins the same product of three stores, cheapest first', () => {
    const groups = groupOffers([
      offer({
        sourceId: 'b',
        store: 'Tienda B',
        title: 'Sony WH-1000XM5 Audífonos inalámbricos negro',
        price: 6999,
        brand: 'Sony',
      }),
      offer({
        sourceId: 'a',
        store: 'Tienda A',
        title: 'Audífonos Sony WH1000XM5 inalámbricos',
        price: 6499,
        brand: 'SONY',
      }),
      offer({
        sourceId: 'c',
        store: 'Tienda C',
        title: 'Audífonos inalámbricos Sony WH 1000XM5 cancelación de ruido',
        price: 7200,
      }),
      offer({
        sourceId: 'c',
        store: 'Tienda C',
        title: 'Audífonos inalámbricos Sony WH-1000XM4',
        price: 4999,
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.title).toContain('XM4');
    expect(groups[1]!.offers.map((o) => o.price)).toEqual([6499, 6999, 7200]);
    expect(groups[1]!.title).toBe('Audífonos Sony WH1000XM5 inalámbricos');
  });

  it('different brands or storage stay apart; bestPerStore keeps one per store', () => {
    const groups = groupOffers([
      offer({ title: 'Galaxy S24 128GB negro', price: 12000, brand: 'Samsung' }),
      offer({ title: 'Galaxy S24 256GB negro', price: 14000, brand: 'Samsung' }),
    ]);
    expect(groups).toHaveLength(2);
    const best = bestPerStore([
      offer({ store: 'A', title: 'x', price: 30 }),
      offer({ store: 'A', title: 'y', price: 20 }),
      offer({ store: 'B', title: 'z', price: 25 }),
    ]);
    expect(best.map((o) => o.price)).toEqual([20, 25]);
  });
});

describe('ofertas: trend and list price', () => {
  it('describes the trend in Spanish', () => {
    expect(money(1499)).toBe('$1,499');
    expect(money(1234567.5)).toBe('$1,234,567.50');
    expect(describeTrend(pts([DAY, 1000], [0, 820]), NOW)).toBe('Bajó 18 % desde ayer');
    expect(describeTrend(pts([HOUR, 1000], [0, 1050]), NOW)).toBe(
      'Subió 5 % desde la última revisión',
    );
    expect(describeTrend(pts([3 * DAY, 900], [2 * DAY, 900], [0, 900]), NOW)).toBe(
      'Sin cambio desde hace 3 días',
    );
    expect(describeTrend(pts([5 * DAY, 1000], [2 * DAY, 950], [HOUR, 900], [0, 800]), NOW)).toBe(
      'Bajó 11 % desde la última revisión; el más bajo que ha visto la oficina',
    );
    expect(describeTrend(pts([0, 900]), NOW)).toBeUndefined();
  });

  it('flags a "before" price the office never saw', () => {
    const hist = pts([3 * DAY, 1000], [2 * DAY, 1100], [DAY, 1050]);
    const sus = suspiciousListPrice(offer({ title: 'x', price: 999, listPrice: 1999 }), hist);
    expect(sus.suspicious).toBe(true);
    expect(sus.note).toBe(
      'El «antes» de la tienda ($1,999) nunca lo vio la oficina; lo más caro que vio fue $1,100',
    );
    expect(
      suspiciousListPrice(offer({ title: 'x', price: 999, listPrice: 1090 }), hist).suspicious,
    ).toBe(false);
    expect(
      suspiciousListPrice(offer({ title: 'x', price: 999, listPrice: 1999 }), hist.slice(0, 1))
        .suspicious,
    ).toBe(false);
  });
});

describe('ofertas: alert rules', () => {
  const settings = defaultSettings();
  const best = (price: number) =>
    offer({
      title: 'Audífonos Sony WH-1000XM5',
      price,
      store: 'Tienda A',
      url: 'https://tienda.example/x',
    });
  const checked = new Date(NOW - HOUR).toISOString();

  it('target alerts only when it is crossed', () => {
    const w = watch({ target: 1600, history: pts([HOUR, 1700]), checkedAt: checked });
    const a = alertsFor(w, { best: best(1499), deals: [] }, settings, NOW);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'target', price: 1499, store: 'Tienda A' });
    expect(a[0]!.text).toBe(
      'Audífonos sony wh-1000xm5: $1,499 en Tienda A (tu objetivo era $1,600)',
    );
    // Still under the target on the next check: nothing.
    const again = alertsFor(
      { ...w, reached: true, history: pts([2 * HOUR, 1700], [HOUR, 1499]) },
      { best: best(1499), deals: [] },
      settings,
      NOW,
    );
    expect(again).toEqual([]);
  });

  it('drop by percent against the previous check', () => {
    const w = watch({ history: pts([2 * HOUR, 800], [HOUR, 1000]), checkedAt: checked });
    const drop = alertsFor(w, { best: best(880), deals: [] }, settings, NOW);
    expect(drop.map((x) => x.kind)).toEqual(['drop']);
    expect(drop[0]!.text).toBe(
      'Audífonos sony wh-1000xm5: bajó 12 % a $880 en Tienda A (antes $1,000)',
    );
  });

  it('drop needs dropPercent; lowest needs two earlier points', () => {
    const w = watch({ history: pts([2 * HOUR, 900], [HOUR, 1000]), checkedAt: checked });
    expect(alertsFor(w, { best: best(950), deals: [] }, settings, NOW)).toEqual([]);
    const lowest = alertsFor(w, { best: best(850), deals: [] }, settings, NOW);
    expect(lowest.map((x) => x.kind)).toEqual(['lowest']);
    const one = watch({ history: pts([HOUR, 1000]), checkedAt: checked });
    expect(
      alertsFor(one, { best: best(850), deals: [] }, settings, NOW).map((x) => x.kind),
    ).toEqual(['drop']);
  });

  it('community: once per deal, relevant and alive, never on the first check', () => {
    const deals = [
      deal({
        id: 'd1',
        title: 'Audífonos Sony WH-1000XM5 a precio de locura',
        price: 5000,
        merchant: 'Tienda B',
      }),
      deal({ id: 'd2', title: 'Funda para audífonos Sony WH-1000XM5', price: 100 }),
      deal({ id: 'd3', title: 'Audífonos Sony WH-1000XM5 otra vez', expired: true }),
    ];
    expect(alertsFor(watch(), { deals }, settings, NOW)).toEqual([]);
    const w = watch({ checkedAt: checked });
    const a = alertsFor(w, { deals }, settings, NOW);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: 'community', price: 5000, store: 'Tienda B' });
    expect(alertsFor({ ...w, seenDeals: ['d1'] }, { deals }, settings, NOW)).toEqual([]);
  });
});
