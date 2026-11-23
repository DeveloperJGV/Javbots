import { NetError, type RateQueue, type SafeFetch } from '../../../coleccion/server/covers/net.js';
import { type LookupFound, parseBooksApi, parseSearch, type SearchDoc } from '../../core/lookup.js';
import {
  API_MAX_BYTES,
  booksApiUrl,
  idCoverUrl,
  IMAGE_MAX_BYTES,
  isbnCoverUrl,
  REQUEST_TIMEOUT_MS,
  searchUrl,
} from './constants.js';

/** Open Library, the only place the library talks to. Every request waits its turn in one queue. */
export interface OpenLibrary {
  /** What it knows of an ISBN; null when it does not know it. Throws NetError when it does not answer. */
  lookup(isbn: string): Promise<LookupFound | null>;
  /** The cover of an ISBN; null when it has none (404). Throws NetError. */
  isbnCover(isbn: string, size: 'M' | 'L'): Promise<Uint8Array | null>;
  /** Books with a cover whose title (and author) look like these. Throws NetError. */
  search(title: string, author: string): Promise<SearchDoc[]>;
  /** A cover by its Open Library id. Throws NetError. */
  coverById(id: string, size: 'M' | 'L'): Promise<Uint8Array>;
  /** ISO time of the last request that worked. */
  lastOkAt(): string | undefined;
  /** What went wrong the last time, if the last request failed. */
  lastProblem(): string | undefined;
}

export function createOpenLibrary(opts: {
  net: SafeFetch;
  queue: RateQueue;
  now: () => number;
}): OpenLibrary {
  let okAt: string | undefined;
  let problem: string | undefined;

  const once = (url: string, maxBytes: number) =>
    opts.queue.run(() => opts.net(url, { maxBytes, timeoutMs: REQUEST_TIMEOUT_MS }));

  /**
   * One request through the queue; the answer's status is the caller's to read. Open Library now and then drops a
   * connection (seen on 2026-11-23, with curl and with Node): a request that got no answer is tried once more, in
   * its turn in the queue.
   */
  async function get(url: string, maxBytes: number) {
    try {
      let res;
      try {
        res = await once(url, maxBytes);
      } catch (err) {
        if (!(err instanceof NetError) || err.problem !== 'sin-respuesta') throw err;
        res = await once(url, maxBytes);
      }
      if (res.status >= 500 || res.status === 429) throw new NetError('http', res.status);
      okAt = new Date(opts.now()).toISOString();
      problem = undefined;
      return res;
    } catch (err) {
      problem = err instanceof NetError ? err.message : 'falló';
      throw err instanceof NetError ? err : new NetError('sin-respuesta');
    }
  }

  async function json(url: string): Promise<unknown> {
    const res = await get(url, API_MAX_BYTES);
    if (res.status !== 200) throw new NetError('http', res.status);
    try {
      return JSON.parse(new TextDecoder().decode(res.bytes));
    } catch {
      problem = 'contestó algo que no se entiende';
      throw new NetError('http');
    }
  }

  async function image(url: string, missingIsNull: boolean): Promise<Uint8Array | null> {
    const res = await get(url, IMAGE_MAX_BYTES);
    if (res.status === 404 && missingIsNull) return null;
    if (res.status !== 200) throw new NetError('http', res.status);
    return res.bytes;
  }

  return {
    lookup: async (isbn) => parseBooksApi(await json(booksApiUrl(isbn)), isbn),
    isbnCover: (isbn, size) => image(isbnCoverUrl(isbn, size), true),
    search: async (title, author) => parseSearch(await json(searchUrl(title, author))),
    coverById: async (id, size) => (await image(idCoverUrl(id, size), false)) as Uint8Array,
    lastOkAt: () => okAt,
    lastProblem: () => problem,
  };
}
