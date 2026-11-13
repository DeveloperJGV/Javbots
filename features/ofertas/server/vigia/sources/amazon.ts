/**
 * Amazon México has no free search API and its conditions do not allow automatic reading. This source reads the
 * plain results page only for personal use, very spaced out (6 h minimum), one try, and stops at the first captcha.
 */
import { amazonInstallments } from '../msi.js';
import type { Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { SourceBlocked } from '../types.js';
import {
  decodeEntities,
  fetchText,
  HOUR_MS,
  htmlText,
  looksLikeCaptcha,
  MAX_OFFERS,
  parsePrice,
} from './http.js';

const ID = 'amazon';
const NAME = 'Amazon';
const ORIGIN = 'https://www.amazon.com.mx';

/** Opening tag of one organic result card. */
const RESULT_RE =
  /<div\b[^>]*\bdata-asin="([A-Z0-9]{10})"[^>]*\bdata-component-type="s-search-result"[^>]*>/g;
const TITLE_RE = /<h2\b[^>]*>([\s\S]*?)<\/h2>/;
/** The current price: class exactly "a-price" (the "before" one adds a-text-price). */
const PRICE_RE = /<span class="a-price"[^>]*>\s*<span class="a-offscreen">([^<]+)<\/span>/;
/** The struck "before" price (installments use a-text-price too, but never strike). */
const LIST_PRICE_RE =
  /<span class="a-price a-text-price"[^>]*data-a-strike="true"[^>]*>\s*<span class="a-offscreen">([^<]+)<\/span>/;
const IMAGE_RE = /<img\b[^>]*class="s-image"[^>]*\bsrc="([^"]+)"/;

export function amazonSource(opts: SourceOptions = {}): Source {
  const searchUrl = (query: string): string => `${ORIGIN}/s?k=${encodeURIComponent(query)}`;
  return {
    id: ID,
    name: NAME,
    fragile: true,
    access:
      'Página de resultados; Amazon no da API gratuita y no permite lectura automática: uso personal, muy espaciado',
    minIntervalMs: 6 * HOUR_MS,
    ready: () => true,
    searchUrl,
    async search(query, signal): Promise<SourceAnswer> {
      const { text } = await fetchText(opts.fetch ?? fetch, searchUrl(query), signal);
      return { offers: parseAmazonPage(text), deals: [] };
    },
  };
}

export function parseAmazonPage(html: string): Offer[] {
  const starts = [...html.matchAll(RESULT_RE)];
  if (starts.length === 0) {
    if (looksLikeCaptcha(html)) throw new SourceBlocked('Amazon pidió captcha');
    // A real search with no results still has the results slot.
    if (html.includes('s-main-slot') || html.includes('s-search-results')) return [];
    throw new Error('La página de Amazon cambió: no trae resultados');
  }
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length; i++) {
    const asin = starts[i][1];
    const from = starts[i].index ?? 0;
    // The card ends where the next block of the result grid starts (another result or an ad widget).
    const next = html.indexOf('data-asin="', from + starts[i][0].length);
    const card = html.slice(from, next === -1 ? html.length : next);
    if (seen.has(asin) || /AdHolder|puis-sponsored-label|sp-sponsored-result/.test(card)) continue;
    const title = htmlText(TITLE_RE.exec(card)?.[1] ?? '');
    const price = parsePrice(PRICE_RE.exec(card)?.[1]);
    if (!title || !price) continue;
    seen.add(asin);
    const listPrice = parsePrice(LIST_PRICE_RE.exec(card)?.[1]);
    const image = IMAGE_RE.exec(card)?.[1];
    offers.push({
      sourceId: ID,
      store: NAME,
      id: asin,
      title,
      price,
      listPrice: listPrice && listPrice > price ? listPrice : undefined,
      // Only when the card says so. The results page usually names no seller at all: then it is unknown, not a
      // reseller.
      official: /Vendido por Amazon/i.test(card),
      sellerUnknown: /Vendido por/i.test(card) ? undefined : true,
      url: `${ORIGIN}/dp/${asin}`,
      image: image ? decodeEntities(image) : undefined,
      installments: amazonInstallments(card),
    });
    if (offers.length >= MAX_OFFERS) break;
  }
  return offers;
}
