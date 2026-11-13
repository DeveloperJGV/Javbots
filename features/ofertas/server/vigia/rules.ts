/** Pure rules of the watch: the trend note, the inflated "before" price and which alerts a check deserves. */
import { DAY_MS, HOUR_MS, LIST_PRICE_MIN_HISTORY, LOWEST_MIN_HISTORY, TEXT } from './constants.js';
import { isRelevant } from './relevance.js';
import type { Alert, CommunityDeal, Offer, PricePoint, Settings, Watch } from './types.js';

/** "$1,499" (pesos, cents only when there are any). */
export function money(value: number): string {
  const whole = Math.round(value * 100) % 100 === 0;
  const [int, dec] = (whole ? Math.round(value).toFixed(0) : value.toFixed(2)).split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}${dec ? `.${dec}` : ''}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Digital local time: "21:40". */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const daysBetween = (from: number, to: number) =>
  Math.round((dayStart(to) - dayStart(from)) / DAY_MS);

/** "las 21:40", "mañana a las 09:10", "el 14/11 a las 09:10". */
export function untilText(ms: number, nowMs: number): string {
  const days = daysBetween(nowMs, ms);
  if (days <= 0) {
    return `las ${clock(ms)}`;
  }
  if (days === 1) {
    return `mañana a las ${clock(ms)}`;
  }
  const d = new Date(ms);
  return `el ${pad(d.getDate())}/${pad(d.getMonth() + 1)} a las ${clock(ms)}`;
}

/** How long ago a point was, as the end of a sentence: "desde la última revisión", "desde ayer", "desde hace 3 días". */
function since(atMs: number, nowMs: number, lastCheck: boolean): string {
  const days = daysBetween(atMs, nowMs);
  if (days <= 0) {
    if (lastCheck) {
      return 'desde la última revisión';
    }
    const hours = Math.max(1, Math.floor((nowMs - atMs) / HOUR_MS));
    return `desde hace ${hours} h`;
  }
  if (days === 1) {
    return 'desde ayer';
  }
  return `desde hace ${days} días`;
}

const pct = (from: number, to: number) => Math.round((Math.abs(from - to) / from) * 100);

/** The note of a watch from its history (oldest first; the last point is the check that just ended). */
export function describeTrend(history: readonly PricePoint[], nowMs: number): string | undefined {
  if (history.length < 2) {
    return undefined;
  }
  const cur = history[history.length - 1]!;
  const prev = history[history.length - 2]!;
  const earlier = history.slice(0, -1);
  const lowestEver =
    earlier.length >= LOWEST_MIN_HISTORY && cur.price < Math.min(...earlier.map((p) => p.price));
  if (cur.price < prev.price) {
    const prevMs = Date.parse(prev.at);
    const fall = `Bajó ${pct(prev.price, cur.price)} % ${since(prevMs, nowMs, true)}`;
    return lowestEver ? `${fall}; ${TEXT.lowestEver.toLowerCase()}` : fall;
  }
  if (cur.price > prev.price) {
    return `Subió ${pct(prev.price, cur.price)} % ${since(Date.parse(prev.at), nowMs, true)}`;
  }
  // Same price: how long it has stayed.
  let i = history.length - 1;
  while (i > 0 && history[i - 1]!.price === cur.price) {
    i--;
  }
  const fromMs = Date.parse(history[i]!.at);
  if (nowMs - fromMs < HOUR_MS) {
    return 'Sin cambio desde la última revisión';
  }
  return `Sin cambio ${since(fromMs, nowMs, false)}`;
}

/**
 * The store's "before" price is suspicious when it is higher than anything the watch ever saw (a price raised just
 * to show a big discount). Needs some history to judge.
 */
export function suspiciousListPrice(
  offer: Offer,
  history: readonly PricePoint[],
): { suspicious: boolean; note?: string } {
  const list = offer.listPrice;
  if (list === undefined || !(list > offer.price) || history.length < LIST_PRICE_MIN_HISTORY) {
    return { suspicious: false };
  }
  const maxSeen = Math.max(...history.map((p) => p.price), offer.price);
  if (list <= maxSeen) {
    return { suspicious: false };
  }
  return {
    suspicious: true,
    note: `El «antes» de la tienda (${money(list)}) nunca lo vio la oficina; lo más caro que vio fue ${money(maxSeen)}`,
  };
}

/** An alert before it gets its id. */
export type AlertDraft = Omit<Alert, 'id' | 'seen'>;

/** "Audífonos bluetooth" from "audífonos bluetooth". */
export function label(query: string): string {
  const q = query.trim();
  return q.charAt(0).toUpperCase() + q.slice(1);
}

/**
 * Which alerts a check deserves. `prev` is the watch before the check (its history does not have the new point).
 * At most one alert per kind; one price alert per check (target, else lowest, else drop). Community deals alert
 * once each, and never on the first check of a watch (those are only noted).
 */
export function alertsFor(
  prev: Watch,
  next: { best?: Offer; deals: readonly CommunityDeal[] },
  settings: Settings,
  nowMs: number,
): AlertDraft[] {
  const at = new Date(nowMs).toISOString();
  const name = label(prev.query);
  const out: AlertDraft[] = [];
  const best = next.best;
  if (best) {
    const base = { watchId: prev.id, at, price: best.price, store: best.store, url: best.url };
    const last = prev.history[prev.history.length - 1];
    const lowestBefore =
      prev.history.length >= LOWEST_MIN_HISTORY
        ? Math.min(...prev.history.map((p) => p.price))
        : undefined;
    if (prev.target !== undefined && best.price <= prev.target && !prev.reached) {
      out.push({
        ...base,
        kind: 'target',
        text: `${name}: ${money(best.price)} en ${best.store} (tu objetivo era ${money(prev.target)})`,
      });
    } else if (lowestBefore !== undefined && best.price < lowestBefore) {
      out.push({
        ...base,
        kind: 'lowest',
        text: `${name}: ${money(best.price)} en ${best.store}, el más bajo que ha visto la oficina (antes ${money(lowestBefore)})`,
      });
    } else if (
      last &&
      best.price < last.price &&
      pct(last.price, best.price) >= settings.dropPercent
    ) {
      out.push({
        ...base,
        kind: 'drop',
        text: `${name}: bajó ${pct(last.price, best.price)} % a ${money(best.price)} en ${best.store} (antes ${money(last.price)})`,
      });
    }
  }

  const firstCheck = prev.checkedAt === undefined;
  const fresh = next.deals
    .filter((d) => !d.expired && !prev.seenDeals.includes(d.id) && isRelevant(d.title, prev))
    .sort((a, b) => b.temperature - a.temperature);
  const top = fresh[0];
  if (!firstCheck && top) {
    const price = top.price !== undefined ? ` a ${money(top.price)}` : '';
    const where = top.merchant ? ` en ${top.merchant}` : '';
    const more = fresh.length > 1 ? ` y ${fresh.length - 1} más` : '';
    out.push({
      watchId: prev.id,
      at,
      kind: 'community',
      text: `${name}: la comunidad publicó «${top.title}»${price}${where} (${Math.round(top.temperature)}°)${more}`,
      price: top.price,
      store: top.merchant,
      url: top.url,
    });
  }
  return out;
}
