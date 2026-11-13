/** Costco México: the JSON search its own site uses (SAP Commerce), no key. */
import type { Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { absoluteUrl, asRecord, asString, fetchJson, MAX_OFFERS, parsePrice } from './http.js';

const ID = 'costco';
const NAME = 'Costco';
const ORIGIN = 'https://www.costco.com.mx';

export function costcoSource(opts: SourceOptions = {}): Source {
  return {
    id: ID,
    name: NAME,
    fragile: false,
    access: 'JSON público de la búsqueda de la tienda, sin llave',
    ready: () => true,
    searchUrl: (query) => `${ORIGIN}/search?text=${encodeURIComponent(query)}`,
    async search(query, signal): Promise<SourceAnswer> {
      const url =
        `${ORIGIN}/rest/v2/mexico/products/search?query=${encodeURIComponent(query)}` +
        `&fields=FULL&pageSize=${MAX_OFFERS}&lang=es_MX&curr=MXN`;
      const data = asRecord(await fetchJson(opts.fetch ?? fetch, url, signal));
      if (!data || !Array.isArray(data.products))
        throw new Error('La tienda cambió la forma de su búsqueda');
      return { offers: parseCostcoProducts(data.products), deals: [] };
    },
  };
}

export function parseCostcoProducts(products: unknown[]): Offer[] {
  const offers: Offer[] = [];
  for (const raw of products) {
    const p = asRecord(raw);
    if (!p) continue;
    const price = parsePrice(asRecord(p.price)?.value);
    const title = asString(p.name);
    const url = asString(p.url);
    const stock = asString(asRecord(p.stock)?.stockLevelStatus);
    if (!price || !title || !url || stock === 'outOfStock') continue;
    const base = parsePrice(asRecord(p.basePrice)?.value);
    const image = asString(asRecord((p.images as unknown[] | undefined)?.[0])?.url);
    offers.push({
      sourceId: ID,
      store: NAME,
      id: asString(p.code) ?? url,
      title,
      price,
      listPrice: base && base > price ? base : undefined,
      brand: asString(p.manufacturer),
      official: true,
      url: absoluteUrl(url, ORIGIN),
      image: image ? absoluteUrl(image, ORIGIN) : undefined,
    });
    if (offers.length >= MAX_OFFERS) break;
  }
  return offers;
}
