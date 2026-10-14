import {
  COVER_CACHE_SIZE,
  COVER_FETCH_TIMEOUT_MS,
  COVER_MAX_BYTES,
  COVER_URL_PREFIX,
  LOG_PREFIX,
} from './constants.js';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * Downloads album covers as data URLs. Data URLs keep the office canvas
 * untainted (an image from another origin drawn on it would break the PNG
 * capture). Only Spotify's CDN, size-capped, with a small memory cache.
 */
export class CoverCache {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string | undefined>>();

  constructor(private readonly fetcher: Fetcher = (url, init) => fetch(url, init)) {}

  get(url: string): Promise<string | undefined> {
    if (!url.startsWith(COVER_URL_PREFIX)) return Promise.resolve(undefined);
    const hit = this.cache.get(url);
    if (hit) return Promise.resolve(hit);
    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;
    const job = this.download(url).finally(() => this.pending.delete(url));
    this.pending.set(url, job);
    return job;
  }

  private async download(url: string): Promise<string | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COVER_FETCH_TIMEOUT_MS);
    try {
      const res = await this.fetcher(url, { signal: controller.signal });
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!res.ok || !ALLOWED_TYPES.has(type)) return undefined;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > COVER_MAX_BYTES) return undefined;
      const dataUrl = `data:${type};base64,${bytes.toString('base64')}`;
      this.cache.set(url, dataUrl);
      while (this.cache.size > COVER_CACHE_SIZE) {
        this.cache.delete(this.cache.keys().next().value as string);
      }
      return dataUrl;
    } catch (err) {
      console.warn(`${LOG_PREFIX} No se pudo bajar la carátula:`, (err as Error).message);
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
