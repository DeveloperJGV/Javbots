/**
 * Mercado Libre: the official search API. It answers 403 without a token, so this source needs a key: an access
 * token pasted by hand, or the client id + secret of an app (then it asks for a client_credentials token and keeps
 * it in memory until it expires). Its website is not read: it sends automated visits to a "suspicious traffic" page.
 */
import { mercadolibreInstallments } from '../msi.js';
import type { OfertasKeys, Offer, Source, SourceAnswer, SourceOptions } from '../types.js';
import { SourceBlocked } from '../types.js';
import { asRecord, asString, fetchJson, MAX_OFFERS, parsePrice } from './http.js';

const ID = 'mercadolibre';
const NAME = 'Mercado Libre';
const API = 'https://api.mercadolibre.com';
const SITE = 'MLM';
/** Ask for a new token this long before the old one expires. */
const TOKEN_MARGIN_MS = 60_000;

export function mercadolibreSource(opts: SourceOptions = {}): Source {
  const keys = (): NonNullable<OfertasKeys['mercadolibre']> => opts.keys?.().mercadolibre ?? {};
  let cached: { token: string; expiresAt: number; clientId: string } | undefined;

  async function token(fetchFn: typeof fetch, signal?: AbortSignal): Promise<string> {
    const k = keys();
    if (k.accessToken) return k.accessToken;
    if (!k.clientId || !k.clientSecret) throw new Error('Falta la llave de Mercado Libre');
    if (cached && cached.clientId === k.clientId && cached.expiresAt > Date.now())
      return cached.token;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: k.clientId,
      client_secret: k.clientSecret,
    }).toString();
    let data: Record<string, unknown> | undefined;
    try {
      data = asRecord(
        await fetchJson(fetchFn, `${API}/oauth/token`, signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        }),
      );
    } catch (err) {
      if (err instanceof SourceBlocked) throw new Error('Mercado Libre rechazó la llave');
      throw err;
    }
    const access = asString(data?.access_token);
    if (!access) throw new Error('Mercado Libre no dio el permiso (revisa la llave)');
    const seconds = typeof data?.expires_in === 'number' ? data.expires_in : 6 * 60 * 60;
    cached = {
      token: access,
      expiresAt: Date.now() + seconds * 1000 - TOKEN_MARGIN_MS,
      clientId: k.clientId,
    };
    return access;
  }

  return {
    id: ID,
    name: NAME,
    fragile: false,
    access: 'API oficial de Mercado Libre; necesita una llave (app de desarrollador)',
    ready: () => {
      const k = keys();
      return Boolean(k.accessToken || (k.clientId && k.clientSecret));
    },
    searchUrl: (query) => `https://listado.mercadolibre.com.mx/${slugQuery(query)}`,
    async search(query, signal): Promise<SourceAnswer> {
      const fetchFn = opts.fetch ?? fetch;
      const bearer = await token(fetchFn, signal);
      const url = `${API}/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=${MAX_OFFERS}`;
      let data: Record<string, unknown> | undefined;
      try {
        data = asRecord(
          await fetchJson(fetchFn, url, signal, { headers: { Authorization: `Bearer ${bearer}` } }),
        );
      } catch (err) {
        if (err instanceof SourceBlocked && /HTTP 403/.test(err.message)) {
          cached = undefined;
          throw new Error('Mercado Libre rechazó la llave');
        }
        if (err instanceof Error && /HTTP 401/.test(err.message)) {
          cached = undefined;
          throw new Error('Mercado Libre rechazó la llave');
        }
        throw err;
      }
      if (!data || !Array.isArray(data.results))
        throw new Error('Mercado Libre cambió la forma de su búsqueda');
      return { offers: parseMercadolibreResults(data.results), deals: [] };
    },
  };
}

/** "audífonos bluetooth" → "audífonos-bluetooth" (encoded), the way its listing URLs read. */
export function slugQuery(query: string): string {
  return encodeURIComponent(query.trim().replace(/\s+/g, '-'));
}

export function parseMercadolibreResults(results: unknown[]): Offer[] {
  const offers: Offer[] = [];
  for (const raw of results) {
    const r = asRecord(raw);
    if (!r) continue;
    const id = asString(r.id);
    const title = asString(r.title);
    const price = parsePrice(r.price);
    const url = asString(r.permalink);
    if (!id || !title || !price || !url) continue;
    const original = parsePrice(r.original_price);
    const thumb = asString(r.thumbnail);
    offers.push({
      sourceId: ID,
      store: NAME,
      id,
      title,
      price,
      listPrice: original && original > price ? original : undefined,
      seller: asString(r.official_store_name) ?? asString(asRecord(r.seller)?.nickname),
      official: r.official_store_id !== null && r.official_store_id !== undefined,
      freeShipping: asRecord(r.shipping)?.free_shipping === true ? true : undefined,
      url,
      image: thumb ? thumb.replace(/^http:/, 'https:') : undefined,
      // From its documentation; not checked against a real answer (no key yet)
      installments: mercadolibreInstallments(r.installments),
    });
    if (offers.length >= MAX_OFFERS) break;
  }
  return offers;
}
