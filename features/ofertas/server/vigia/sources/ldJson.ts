/**
 * Stores whose results page carries schema.org data (<script type="application/ld+json">) with an ItemList of
 * Products. One reader serves the three shapes seen: an @graph with an ItemList (ListItem → item), a
 * CollectionPage whose mainEntity is the ItemList, and items that are the Products themselves. Offers may be an
 * Offer (price) or an AggregateOffer (lowPrice).
 */
import type { Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { SourceBlocked } from '../types.js';
import {
  absoluteUrl,
  asRecord,
  asString,
  decodeEntities,
  fetchText,
  looksLikeCaptcha,
  MAX_OFFERS,
  parsePrice,
} from './http.js';

export interface LdJsonStore {
  id: string;
  name: string;
  /** The results page for a query. */
  url: (query: string) => string;
  /** The page a person opens (defaults to url). */
  humanUrl?: (query: string) => string;
}

const LD_JSON_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export function ldJsonSource(store: LdJsonStore, opts: SourceOptions = {}): Source {
  return {
    id: store.id,
    name: store.name,
    fragile: true,
    access: 'Lee los datos estructurados de su página de resultados, sin llave',
    ready: () => true,
    searchUrl: store.humanUrl ?? store.url,
    async search(query, signal): Promise<SourceAnswer> {
      const url = store.url(query);
      const { text } = await fetchText(opts.fetch ?? fetch, url, signal);
      const products = findLdJsonProducts(text);
      if (products === null) {
        if (looksLikeCaptcha(text)) throw new SourceBlocked('La tienda pidió captcha');
        throw new Error('La página de la tienda cambió: no trae la lista de productos');
      }
      return { offers: productsToOffers(products, store, url), deals: [] };
    },
  };
}

/** The Products of the first ItemList in the page; null when the page has none (changed or blocked). */
export function findLdJsonProducts(html: string): Record<string, unknown>[] | null {
  for (const match of html.matchAll(LD_JSON_RE)) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const roots = Array.isArray(data) ? data : [data];
    for (const root of roots) {
      const r = asRecord(root);
      if (!r) continue;
      const nodes = Array.isArray(r['@graph']) ? (r['@graph'] as unknown[]) : [r];
      for (const node of nodes) {
        const list = itemList(asRecord(node));
        if (list) {
          return list
            .map((el) => {
              const e = asRecord(el);
              return asRecord(e?.item) ?? e;
            })
            .filter((p): p is Record<string, unknown> => p !== undefined && hasType(p, 'Product'));
        }
      }
    }
  }
  return null;
}

function itemList(node: Record<string, unknown> | undefined): unknown[] | undefined {
  if (!node) return undefined;
  if (hasType(node, 'ItemList') && Array.isArray(node.itemListElement)) return node.itemListElement;
  const main = asRecord(node.mainEntity);
  if (main && hasType(main, 'ItemList') && Array.isArray(main.itemListElement))
    return main.itemListElement;
  return undefined;
}

function hasType(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

function productsToOffers(
  products: Record<string, unknown>[],
  store: LdJsonStore,
  pageUrl: string,
): Offer[] {
  const offers: Offer[] = [];
  for (const p of products) {
    const rawOffers = p.offers;
    const offer = asRecord(Array.isArray(rawOffers) ? rawOffers[0] : rawOffers);
    const price = parsePrice(offer?.price) ?? parsePrice(offer?.lowPrice);
    const name = asString(p.name);
    const url = asString(p.url) ?? asString(offer?.url);
    const availability = asString(offer?.availability) ?? '';
    if (!price || !name || !url || /OutOfStock|Discontinued|SoldOut/i.test(availability)) continue;
    const image = asString(
      Array.isArray(p.image) ? p.image[0] : (asRecord(p.image)?.url ?? p.image),
    );
    const brand = asString(asRecord(p.brand)?.name ?? p.brand);
    const absolute = absoluteUrl(decodeEntities(url), pageUrl);
    offers.push({
      sourceId: store.id,
      store: store.name,
      id: asString(p.sku) ?? absolute,
      title: decodeEntities(name),
      price,
      brand,
      seller: asString(asRecord(offer?.seller)?.name),
      official: true,
      url: absolute,
      image: image ? absoluteUrl(decodeEntities(image), pageUrl) : undefined,
    });
    if (offers.length >= MAX_OFFERS) break;
  }
  return offers;
}
