/**
 * Promodescuentos: deals the community posts and votes ("temperature"). Its search page embeds each deal as JSON
 * in a data-vue3 attribute (HTML-escaped). Gives deals, not store offers.
 */
import { titleInstallments } from '../msi.js';
import type { CommunityDeal, Source, SourceAnswer, SourceOptions } from '../types.js';
import { SourceBlocked } from '../types.js';
import {
  asRecord,
  asString,
  decodeEntities,
  fetchText,
  looksLikeCaptcha,
  MAX_OFFERS,
  parsePrice,
} from './http.js';

const ID = 'promodescuentos';
const NAME = 'Promodescuentos';
const ORIGIN = 'https://www.promodescuentos.com';
const VUE_RE = /data-vue3='([^']*)'/g;

export function promodescuentosSource(opts: SourceOptions = {}): Source {
  const searchUrl = (query: string): string => `${ORIGIN}/search?q=${encodeURIComponent(query)}`;
  return {
    id: ID,
    name: NAME,
    fragile: true,
    access: 'Lee su página de búsqueda (ofertas que publica la comunidad), sin cuenta',
    ready: () => true,
    searchUrl,
    async search(query, signal): Promise<SourceAnswer> {
      const { text } = await fetchText(opts.fetch ?? fetch, searchUrl(query), signal);
      return { offers: [], deals: parsePromodescuentosPage(text) };
    },
  };
}

export function parsePromodescuentosPage(html: string): CommunityDeal[] {
  const deals: CommunityDeal[] = [];
  const seen = new Set<string>();
  let blocks = 0;
  for (const match of html.matchAll(VUE_RE)) {
    blocks++;
    let data: unknown;
    try {
      data = JSON.parse(decodeEntities(match[1]));
    } catch {
      continue;
    }
    const t = asRecord(asRecord(asRecord(data)?.props)?.thread);
    if (!t) continue;
    const id = asString(t.threadId);
    const title = asString(t.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const slug = asString(t.titleSlug);
    const published =
      typeof t.publishedAt === 'number' ? new Date(t.publishedAt * 1000).toISOString() : undefined;
    deals.push({
      id,
      title,
      price: parsePrice(t.price),
      merchant: asString(asRecord(t.merchant)?.merchantName),
      temperature: typeof t.temperature === 'number' ? t.temperature : 0,
      url: `${ORIGIN}/ofertas/${slug ? `${slug}-` : ''}${id}`,
      publishedAt: published,
      expired: t.isExpired === true,
      installments: titleInstallments(title),
    });
    if (deals.length >= MAX_OFFERS) break;
  }
  if (blocks === 0) {
    if (looksLikeCaptcha(html)) throw new SourceBlocked('Promodescuentos pidió captcha');
    throw new Error('La página de Promodescuentos cambió: no trae ofertas');
  }
  return deals;
}
