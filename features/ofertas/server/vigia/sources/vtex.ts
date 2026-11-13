/**
 * Stores built on VTEX expose the public catalog search as JSON, no key. One factory serves any of them.
 */
import { vtexInstallments } from '../msi.js';
import type { Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { absoluteUrl, asRecord, asString, fetchJson, MAX_OFFERS, parsePrice } from './http.js';

export interface VtexStore {
  id: string;
  name: string;
  /** "www.elektra.mx" */
  host: string;
}

/** VTEX gives the store's own seller the id "1". */
const VTEX_MAIN_SELLER_ID = '1';

export function vtexSource(store: VtexStore, opts: SourceOptions = {}): Source {
  const origin = `https://${store.host}`;
  return {
    id: store.id,
    name: store.name,
    fragile: false,
    access: 'JSON público del catálogo de la tienda (VTEX), sin llave',
    ready: () => true,
    searchUrl: (query) =>
      `${origin}/${encodeURIComponent(query)}?_q=${encodeURIComponent(query)}&map=ft`,
    async search(query, signal): Promise<SourceAnswer> {
      const url =
        `${origin}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(query)}` +
        `&_from=0&_to=${MAX_OFFERS - 1}`;
      const data = await fetchJson(opts.fetch ?? fetch, url, signal);
      if (!Array.isArray(data)) throw new Error('La tienda cambió la forma de su catálogo');
      return { offers: parseVtexProducts(data, store), deals: [] };
    },
  };
}

export function parseVtexProducts(products: unknown[], store: VtexStore): Offer[] {
  const origin = `https://${store.host}`;
  const offers: Offer[] = [];
  for (const raw of products) {
    const p = asRecord(raw);
    if (!p) continue;
    const item = asRecord((p.items as unknown[] | undefined)?.[0]);
    const sellers =
      (item?.sellers as unknown[] | undefined)?.map(asRecord).filter((s) => s !== undefined) ?? [];
    // The default seller is the one the store page shows.
    const seller = sellers.find((s) => s.sellerDefault === true) ?? sellers[0];
    const deal = asRecord(seller?.commertialOffer);
    const price = parsePrice(deal?.Price);
    const available = typeof deal?.AvailableQuantity === 'number' ? deal.AvailableQuantity : 0;
    const title = asString(p.productName);
    const link = asString(p.link);
    if (!price || available <= 0 || !title || !link) continue;
    const listPrice = parsePrice(deal?.ListPrice);
    const sellerName = asString(seller?.sellerName);
    const sellerId = asString(seller?.sellerId);
    const image = asString(asRecord((item?.images as unknown[] | undefined)?.[0])?.imageUrl);
    offers.push({
      sourceId: store.id,
      store: store.name,
      id: asString(p.productId) ?? link,
      title,
      price,
      listPrice: listPrice && listPrice > price ? listPrice : undefined,
      brand: asString(p.brand),
      seller: sellerName,
      official:
        sellerId === VTEX_MAIN_SELLER_ID ||
        (sellerName ?? '').toLowerCase() === store.name.toLowerCase(),
      url: absoluteUrl(link, origin),
      image: image ? absoluteUrl(image, origin) : undefined,
      installments: vtexInstallments(deal?.Installments),
    });
    if (offers.length >= MAX_OFFERS) break;
  }
  return offers;
}
