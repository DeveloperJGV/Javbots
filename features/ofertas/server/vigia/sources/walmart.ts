/**
 * Walmart México: its results page is a Next.js page whose __NEXT_DATA__ script carries the search result. The
 * site sits behind a bot wall (PerimeterX): when it answers with a captcha the source reports a block and the
 * watch leaves it alone for a long while.
 */
import type { Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { SourceBlocked } from '../types.js';
import {
  absoluteUrl,
  asRecord,
  asString,
  fetchText,
  HOUR_MS,
  looksLikeCaptcha,
  MAX_OFFERS,
  parsePrice,
} from './http.js';

const ID = 'walmart';
const NAME = 'Walmart';
const ORIGIN = 'https://www.walmart.com.mx';
const NEXT_DATA_RE = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;

export function walmartSource(opts: SourceOptions = {}): Source {
  const searchUrl = (query: string): string => `${ORIGIN}/search?q=${encodeURIComponent(query)}`;
  return {
    id: ID,
    name: NAME,
    fragile: true,
    access: 'Lee su página de resultados; tiene protección contra robots y puede bloquear',
    minIntervalMs: 3 * HOUR_MS,
    ready: () => true,
    searchUrl,
    async search(query, signal): Promise<SourceAnswer> {
      const { text } = await fetchText(opts.fetch ?? fetch, searchUrl(query), signal);
      return { offers: parseWalmartPage(text), deals: [] };
    },
  };
}

export function parseWalmartPage(html: string): Offer[] {
  const match = NEXT_DATA_RE.exec(html);
  let stacks: unknown[] | undefined;
  if (match) {
    try {
      const data = asRecord(JSON.parse(match[1]));
      const result = asRecord(
        asRecord(asRecord(asRecord(data?.props)?.pageProps)?.initialData)?.searchResult,
      );
      stacks = Array.isArray(result?.itemStacks) ? result.itemStacks : undefined;
    } catch {
      stacks = undefined;
    }
  }
  if (!stacks) {
    if (looksLikeCaptcha(html) || !match) throw new SourceBlocked('Walmart pidió captcha');
    throw new Error('La página de Walmart cambió: no trae resultados');
  }
  const offers: Offer[] = [];
  for (const stack of stacks) {
    const items = asRecord(stack)?.items;
    if (!Array.isArray(items)) continue;
    for (const raw of items) {
      const it = asRecord(raw);
      if (!it || it.isSponsoredFlag === true) continue;
      const price = parsePrice(it.price) ?? parsePrice(asRecord(it.priceInfo)?.linePrice);
      const title = asString(it.name);
      const path = asString(it.canonicalUrl);
      const availability = asString(asRecord(it.availabilityStatusV2)?.value);
      if (!price || !title || !path || availability === 'OUT_OF_STOCK') continue;
      const was = parsePrice(asRecord(it.priceInfo)?.wasPrice);
      const seller = asString(it.sellerName);
      const image = asString(asRecord(it.imageInfo)?.thumbnailUrl);
      const url = absoluteUrl(path, ORIGIN);
      offers.push({
        sourceId: ID,
        store: NAME,
        id: asString(it.usItemId) ?? asString(it.id) ?? url,
        title,
        price,
        listPrice: was && was > price ? was : undefined,
        brand: asString(it.brand),
        seller,
        official: !seller || /walmart/i.test(seller),
        url,
        image: image ? absoluteUrl(image, ORIGIN) : undefined,
      });
      if (offers.length >= MAX_OFFERS) return offers;
    }
  }
  return offers;
}
