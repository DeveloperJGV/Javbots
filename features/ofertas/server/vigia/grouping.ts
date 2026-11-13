/** The same product across stores. In doubt, two offers stay apart: a wrong join hides a price. */
import { GROUP_SIMILARITY_NO_MODEL, GROUP_SIMILARITY_WITH_MODEL, STOP_WORDS } from './constants.js';
import { modelTokens, normalize, tokens } from './relevance.js';
import type { Offer, OfferGroup } from './types.js';

interface Shape {
  brand: string;
  models: string;
  words: Set<string>;
}

function shape(offer: Offer): Shape {
  const models = [...new Set(modelTokens(offer.title))].sort().join(' ');
  const words = new Set(
    tokens(offer.title.replace(/([A-Za-z0-9])[-/.]([A-Za-z0-9])/g, '$1$2')).filter(
      (t) => !STOP_WORDS.includes(t),
    ),
  );
  return { brand: offer.brand ? normalize(offer.brand) : '', models, words };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let both = 0;
  for (const w of a) {
    if (b.has(w)) {
      both++;
    }
  }
  const all = a.size + b.size - both;
  return all === 0 ? 0 : both / all;
}

function sameProduct(a: Shape, b: Shape): boolean {
  if (a.brand && b.brand && a.brand !== b.brand) {
    return false;
  }
  if (a.models !== b.models) {
    return false;
  }
  const need = a.models ? GROUP_SIMILARITY_WITH_MODEL : GROUP_SIMILARITY_NO_MODEL;
  return jaccard(a.words, b.words) >= need;
}

const byPrice = (a: Offer, b: Offer) => a.price - b.price;

/** Groups of the same product, cheapest offer first; the groups go by their best price. */
export function groupOffers(offers: readonly Offer[]): OfferGroup[] {
  const seen = new Set<string>();
  const sorted = [...offers]
    .filter((o) => Number.isFinite(o.price) && o.price > 0)
    .sort(byPrice)
    .filter((o) => {
      const k = `${o.sourceId}:${o.id}`;
      if (seen.has(k)) {
        return false;
      }
      seen.add(k);
      return true;
    });
  const groups: { head: Shape; group: OfferGroup }[] = [];
  for (const offer of sorted) {
    const s = shape(offer);
    const home = groups.find((g) => sameProduct(g.head, s));
    if (home) {
      // One price per store: the list is sorted, so a second offer of the same store is the dearer one. The
      // exception is the store's own offer when the cheaper one was a reseller's: "esta es la mejor" needs it.
      const fromStore = home.group.offers.filter((o) => o.store === offer.store);
      if (fromStore.length === 0 || (offer.official && !fromStore.some((o) => o.official))) {
        home.group.offers.push(offer);
      }
    } else {
      const key = `${offer.sourceId}:${offer.id}`;
      groups.push({ head: s, group: { key, title: offer.title, offers: [offer] } });
    }
  }
  return groups.map((g) => g.group);
}

/** The cheapest offer of each store, cheapest first. */
export function bestPerStore(offers: readonly Offer[]): Offer[] {
  const best = new Map<string, Offer>();
  for (const o of offers) {
    const k = normalize(o.store);
    const cur = best.get(k);
    if (!cur || o.price < cur.price) {
      best.set(k, o);
    }
  }
  return [...best.values()].sort(byPrice);
}
