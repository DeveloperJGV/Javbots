import { NetError, type RateQueue, type SafeFetch } from '../../coleccion/server/covers/net.js';
import { type AniDoc, ANILIST_IMAGE_PATTERN, ANILIST_QUERY, parseAniList } from '../core/lookup.js';
import { ANILIST_URL } from './constants.js';

const TIMEOUT_MS = 15_000;
const API_MAX_BYTES = 512 * 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;

export interface AniList {
  /** Manga with a title like this, best first. Throws NetError when it does not answer. */
  search(title: string): Promise<AniDoc[]>;
  /** A cover image by its address (AniList's image host only). Throws NetError. */
  image(url: string): Promise<Uint8Array>;
  lastOkAt(): string | undefined;
  lastProblem(): string | undefined;
}

export function createAniList(opts: {
  net: SafeFetch;
  queue: RateQueue;
  now: () => number;
}): AniList {
  let okAt: string | undefined;
  let problem: string | undefined;
  const track = async <T>(job: () => Promise<T>): Promise<T> => {
    try {
      const out = await opts.queue.run(job);
      okAt = new Date(opts.now()).toISOString();
      problem = undefined;
      return out;
    } catch (err) {
      problem = err instanceof NetError ? err.message : 'falló';
      throw err instanceof NetError ? err : new NetError('sin-respuesta');
    }
  };
  return {
    search: (title) =>
      track(async () => {
        const res = await opts.net(ANILIST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: ANILIST_QUERY, variables: { s: title } }),
          maxBytes: API_MAX_BYTES,
          timeoutMs: TIMEOUT_MS,
        });
        if (res.status !== 200) throw new NetError('http', res.status);
        try {
          return parseAniList(JSON.parse(new TextDecoder().decode(res.bytes)));
        } catch {
          throw new NetError('http');
        }
      }),
    image: (url) =>
      track(async () => {
        if (!ANILIST_IMAGE_PATTERN.test(url)) throw new NetError('no-permitido');
        const res = await opts.net(url, { maxBytes: IMAGE_MAX_BYTES, timeoutMs: TIMEOUT_MS });
        if (res.status !== 200) throw new NetError('http', res.status);
        return res.bytes;
      }),
    lastOkAt: () => okAt,
    lastProblem: () => problem,
  };
}
