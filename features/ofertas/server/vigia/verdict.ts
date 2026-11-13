/**
 * "¿Es oferta de verdad?": which option to buy of a product ("esta es la mejor") and whether its price is good,
 * normal or expensive, with one line saying why. Pure rules over what the office saw itself (its own history), the
 * other stores right now, and a price the person saw by hand. The store's "before" price is never believed.
 */
import {
  DAY_MS,
  VERDICT_ASSISTANT_PCT,
  VERDICT_ASSISTANT_WEIGHT,
  VERDICT_EXPENSIVE_ABOVE_AVG_PCT,
  VERDICT_GOOD_BELOW_AVG_PCT,
  VERDICT_LONG_DAYS,
  VERDICT_LOWEST_MIN_PCT,
  VERDICT_MIN_DAYS,
  VERDICT_MIN_POINTS,
  VERDICT_MIN_STORES,
  VERDICT_RAISE_DAYS,
  VERDICT_RAISE_PCT,
  VERDICT_REASON_FACTS,
  VERDICT_REFERENCE_PCT,
  VERDICT_SHORT_DAYS,
  VERDICT_STORES_EXPENSIVE_PCT,
  VERDICT_STORES_GOOD_PCT,
} from './constants.js';
import { normalize } from './relevance.js';
import { money, suspiciousListPrice } from './rules.js';
import type {
  AssistantFacts,
  ManualReference,
  Offer,
  Pick,
  PricePoint,
  Verdict,
  VerdictKind,
} from './types.js';

/** Two prices this close are the same price (cents of rounding between stores). */
const SAME_PRICE_PESOS = 0.5;

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "9 nov" (local day). */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** Calendar days from one moment to another (local), 0 when both fall on the same day. */
const daysBetween = (from: number, to: number) =>
  Math.round((dayStart(to) - dayStart(from)) / DAY_MS);

const pctOf = (base: number, diff: number) => Math.round((Math.abs(diff) / base) * 100);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const same = (a: number, b: number) => Math.abs(a - b) <= SAME_PRICE_PESOS;

// ── "Esta es la mejor" ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The one option to buy: the cheapest sold by the store itself (not a reseller). A tie goes to free shipping when
 * one says so; otherwise the reason says they cost the same. No store is preferred for any other reason.
 */
export function pickOffer(offers: readonly Offer[]): Pick | undefined {
  const sorted = offers
    .filter((o) => Number.isFinite(o.price) && o.price > 0)
    .sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  if (!cheapest) return undefined;
  const own = sorted.filter((o) => o.official);
  if (own.length === 0) {
    // Nobody says the store sells it: an offer that does not say who sells it goes before a known reseller
    const unknown = sorted.find((o) => o.sellerUnknown);
    if (unknown) {
      const cheaper =
        cheapest.price < unknown.price - SAME_PRICE_PESOS
          ? `; un revendedor la tiene en ${money(cheapest.price)}`
          : '';
      return {
        offer: unknown,
        reason: `La más barata; ${unknown.store} no dice si la vende ella o un revendedor${cheaper}`,
      };
    }
    return {
      offer: cheapest,
      reason: 'Ninguna la vende la tienda misma: es la más barata, de un revendedor',
    };
  }
  const low = own[0]!.price;
  const tied = own.filter((o) => same(o.price, low));
  const offer = tied.find((o) => o.freeShipping) ?? tied[0]!;
  const parts = [`La más barata que vende la tienda misma (${offer.store})`];
  const otherStores = [...new Set(tied.filter((o) => o.store !== offer.store).map((o) => o.store))];
  if (otherStores.length > 0) {
    parts.push(
      offer.freeShipping && tied.some((o) => !o.freeShipping)
        ? `mismo precio en ${otherStores.join(', ')}; esta dice envío gratis`
        : `mismo precio en ${otherStores.join(', ')}`,
    );
  }
  if (cheapest.price < offer.price - SAME_PRICE_PESOS) {
    parts.push(
      cheapest.sellerUnknown
        ? `${cheapest.store} la tiene en ${money(cheapest.price)} sin decir quién la vende`
        : `un revendedor la tiene en ${money(cheapest.price)}`,
    );
  }
  return { offer, reason: parts.join('; ') };
}

// ── The verdict ──────────────────────────────────────────────────────────────────────────────────────────────

export interface VerdictInput {
  /** The option judged (normally the pick). */
  offer: Offer;
  /** What the office saw before this price (oldest first). Empty or absent outside a watched search. */
  history?: readonly PricePoint[];
  /** Offers of the same product right now (any store; the judged one may be among them). */
  peers?: readonly Offer[];
  reference?: ManualReference;
  /** Prices the optional assistant found on the web: one more fact, weaker than the office's own. */
  assistant?: AssistantFacts;
  nowMs: number;
}

interface Signal {
  kind: Exclude<VerdictKind, 'unknown'>;
  fact: string;
  /** Votes count 1; the assistant's counts less. */
  weight?: number;
}

interface Point {
  ms: number;
  price: number;
}

/**
 * The series to judge against. For an option the store sells itself, only what stores sold themselves (a dip of a
 * reseller is not a dip of the store); a history saved before that was tracked uses the best price of each check.
 */
function seriesFor(offer: Offer, history: readonly PricePoint[]): Point[] {
  const at = (p: PricePoint) => Date.parse(p.at);
  const tracked = history.some((p) => p.storePrice !== undefined);
  if (offer.official && tracked) {
    return history
      .filter((p) => p.storePrice !== undefined)
      .map((p) => ({ ms: at(p), price: p.storePrice! }));
  }
  return history.map((p) => ({ ms: at(p), price: p.price }));
}

/** Average of the daily averages: a day checked twenty times weighs the same as a day checked once. */
function dailyAverage(points: readonly Point[]): number {
  const days = new Map<number, number[]>();
  for (const p of points) {
    const k = dayStart(p.ms);
    days.set(k, [...(days.get(k) ?? []), p.price]);
  }
  const avgs = [...days.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  return avgs.reduce((a, b) => a + b, 0) / avgs.length;
}

/** The own-history signal, or a fact saying it is too early (info only). */
function fromHistory(
  price: number,
  series: readonly Point[],
  nowMs: number,
): { signal?: Signal; info?: string } {
  if (series.length === 0) return {};
  const first = Math.min(...series.map((p) => p.ms));
  const days = daysBetween(first, nowMs);
  if (days < VERDICT_MIN_DAYS || series.length < VERDICT_MIN_POINTS) {
    return {
      info:
        days <= 0 ? 'apenas hoy empecé a verlo' : `llevo ${plural(days, 'día', 'días')} viéndolo`,
    };
  }
  const inLast = (n: number) => series.filter((p) => nowMs - p.ms <= n * DAY_MS);
  const short = inLast(VERDICT_SHORT_DAYS);
  const long = inLast(VERDICT_LONG_DAYS);
  if (long.length === 0) return { info: 'hace mucho que no lo veía' };
  const shortSet = short.length > 0 ? short : long;
  const shortDays = Math.min(VERDICT_SHORT_DAYS, days);
  const longDays = Math.min(VERDICT_LONG_DAYS, days);
  const avg = dailyAverage(shortSet);
  const diff = avg - price;
  const pct = pctOf(avg, diff);
  const min = Math.min(...long.map((p) => p.price));
  const max = Math.max(...long.map((p) => p.price));
  const avgText = `su promedio de ${plural(shortDays, 'día', 'días')}`;
  const pctText = `${pct} % ${diff > 0 ? 'abajo' : 'arriba'} de ${avgText}`;

  if (price <= min + SAME_PRICE_PESOS && diff > 0 && pct >= VERDICT_LOWEST_MIN_PCT) {
    const lowest = same(price, min)
      ? `igual a lo más bajo en ${longDays} días`
      : `el más bajo en ${longDays} días`;
    return { signal: { kind: 'good', fact: `${lowest}, ${pctText}` } };
  }
  if (diff > 0 && pct >= VERDICT_GOOD_BELOW_AVG_PCT) {
    return { signal: { kind: 'good', fact: pctText } };
  }
  if (diff < 0 && pct >= VERDICT_EXPENSIVE_ABOVE_AVG_PCT) {
    const highest = price > max + SAME_PRICE_PESOS ? `el más alto en ${longDays} días, ` : '';
    return { signal: { kind: 'expensive', fact: `${highest}${pctText}` } };
  }
  return { signal: { kind: 'normal', fact: `cerca de ${avgText} (${money(Math.round(avg))})` } };
}

/** The other stores right now (one price per store, the cheapest), or a fact when there are too few (info). */
function fromStores(offer: Offer, peers: readonly Offer[]): { signal?: Signal; info?: string } {
  const store = normalize(offer.store);
  const others = new Map<string, number>();
  for (const p of peers) {
    const k = normalize(p.store);
    if (k === store || !(p.price > 0)) continue;
    others.set(k, Math.min(others.get(k) ?? Infinity, p.price));
  }
  const n = others.size + 1;
  if (n < VERDICT_MIN_STORES) {
    return { info: n === 1 ? 'solo una tienda lo tiene' : 'solo dos tiendas lo tienen' };
  }
  const prices = [...others.values(), offer.price].sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid]! : (prices[mid - 1]! + prices[mid]!) / 2;
  const cheapest = offer.price <= Math.min(...others.values()) + SAME_PRICE_PESOS;
  const diff = median - offer.price;
  const pct = pctOf(median, diff);
  if (diff > 0 && pct >= VERDICT_STORES_GOOD_PCT) {
    const lead = cheapest ? `el más barato de ${n} tiendas, ` : '';
    return {
      signal: { kind: 'good', fact: `${lead}${pct} % abajo del precio típico entre tiendas` },
    };
  }
  if (diff < 0 && pct >= VERDICT_STORES_EXPENSIVE_PCT) {
    return {
      signal: { kind: 'expensive', fact: `${pct} % arriba del precio típico entre ${n} tiendas` },
    };
  }
  return {
    signal: {
      kind: 'normal',
      fact: cheapest
        ? `el más barato de ${n} tiendas, pero casi igual que las demás`
        : `cerca del precio típico entre ${n} tiendas (${money(Math.round(median))})`,
    },
  };
}

/** The price the person saw by hand. */
function fromReference(price: number, ref: ManualReference): Signal {
  const seen = `los ${money(ref.price)} que viste el ${dayLabel(ref.at)}`;
  const diff = ref.price - price;
  const pct = pctOf(ref.price, diff);
  if (pct < VERDICT_REFERENCE_PCT) return { kind: 'normal', fact: `casi igual a ${seen}` };
  return diff > 0
    ? { kind: 'good', fact: `${pct} % abajo de ${seen}` }
    : { kind: 'expensive', fact: `${pct} % arriba de ${seen}` };
}

/** The assistant's typical price (or, without it, the lowest it saw), marked "(asistente)". */
export function fromAssistant(price: number, a: AssistantFacts): Signal | undefined {
  const weight = VERDICT_ASSISTANT_WEIGHT;
  const mark = '(asistente)';
  if (a.typical !== undefined && a.typical > 0) {
    const seen = `precio típico que encontró el asistente (${money(a.typical)}) ${mark}`;
    const diff = a.typical - price;
    const pct = pctOf(a.typical, diff);
    if (pct < VERDICT_ASSISTANT_PCT) return { kind: 'normal', fact: `cerca del ${seen}`, weight };
    return diff > 0
      ? { kind: 'good', fact: `${pct} % abajo del ${seen}`, weight }
      : { kind: 'expensive', fact: `${pct} % arriba del ${seen}`, weight };
  }
  if (a.low !== undefined && a.low > 0) {
    const seen = `mínimo que encontró el asistente (${money(a.low)}) ${mark}`;
    if (price <= a.low + SAME_PRICE_PESOS) {
      return {
        kind: 'good',
        fact: same(price, a.low) ? `igual al ${seen}` : `abajo del ${seen}`,
        weight,
      };
    }
    return { kind: 'normal', fact: `${pctOf(a.low, a.low - price)} % arriba del ${seen}`, weight };
  }
  return undefined;
}

/** One warning at most: a rise before the "sale", an invented "before" price, or a reseller. */
function warningFor(
  offer: Offer,
  series: readonly Point[],
  history: readonly PricePoint[],
  nowMs: number,
) {
  if (offer.listPrice !== undefined && offer.listPrice > offer.price) {
    const recent = series.filter((p) => nowMs - p.ms <= VERDICT_RAISE_DAYS * DAY_MS);
    const before = series.filter(
      (p) =>
        nowMs - p.ms > VERDICT_RAISE_DAYS * DAY_MS &&
        nowMs - p.ms <= (VERDICT_RAISE_DAYS + VERDICT_SHORT_DAYS) * DAY_MS,
    );
    if (recent.length > 0 && before.length > 0) {
      const base = dailyAverage(before);
      const peak = Math.max(...recent.map((p) => p.price));
      const pct = pctOf(base, peak - base);
      if (peak > base && pct >= VERDICT_RAISE_PCT) {
        return `ojo: subió ${pct} % en la última semana y hoy dice rebaja`;
      }
    }
    if (suspiciousListPrice(offer, history).suspicious) {
      return `ojo: el «antes» de ${money(offer.listPrice)} nunca lo vio la oficina`;
    }
  }
  if (!offer.official && !offer.sellerUnknown) return 'ojo: lo vende un revendedor, no la tienda';
  return undefined;
}

const LABEL: Record<VerdictKind, string> = {
  good: 'Buen precio',
  normal: 'Precio normal',
  expensive: 'Caro',
  unknown: 'Todavía no sé',
};

/** What a verdict says on its label. */
export const verdictLabel = (kind: VerdictKind): string => LABEL[kind];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Good, normal, expensive or "todavía no sé", and one line with the reason. Each source of facts votes (own
 * history, the price seen by hand, the other stores, and with half a vote the assistant's prices); more good than
 * expensive votes = good, the reverse = expensive, a tie or only "normal" votes = normal, no vote at all = unknown.
 */
export function judge(input: VerdictInput): Verdict {
  const { offer, nowMs } = input;
  const history = input.history ?? [];
  const series = seriesFor(offer, history);
  const signals: Signal[] = [];
  const info: string[] = [];

  const own = fromHistory(offer.price, series, nowMs);
  if (own.signal) signals.push(own.signal);
  if (own.info) info.push(own.info);
  if (history.length === 0) info.push('aún no lo vigilo');
  if (input.reference) signals.push(fromReference(offer.price, input.reference));
  const stores = fromStores(offer, input.peers ?? []);
  if (stores.signal) signals.push(stores.signal);
  if (stores.info) info.push(stores.info);
  // Last: weaker than what the office saw, so it comes after it in the reason too
  const assistant = input.assistant ? fromAssistant(offer.price, input.assistant) : undefined;
  if (assistant) signals.push(assistant);

  const warning = warningFor(offer, series, history, nowMs);
  if (signals.length === 0) {
    const reason = [info.join(' y ')].concat(warning ? [warning] : []).join(' · ');
    return { kind: 'unknown', reason: capital(reason) };
  }
  const votes = (kind: Signal['kind']) =>
    signals.filter((s) => s.kind === kind).reduce((n, s) => n + (s.weight ?? 1), 0);
  const good = votes('good');
  const bad = votes('expensive');
  const kind: VerdictKind = good > bad ? 'good' : bad > good ? 'expensive' : 'normal';
  // The facts that agree first; on a tie, everything (each side said its part)
  const agree = kind === 'normal' ? signals : signals.filter((s) => s.kind === kind);
  // Then, if there is room, what the other facts said (the price seen by hand is never hidden by a vote)
  const ordered = [...agree, ...signals.filter((s) => !agree.includes(s))];
  const facts = ordered.slice(0, VERDICT_REASON_FACTS).map((s) => s.fact);
  if (facts.length < VERDICT_REASON_FACTS && own.info) facts.push(own.info);
  if (warning) facts.push(warning);
  return { kind, reason: capital(facts.join(' · ')) };
}
