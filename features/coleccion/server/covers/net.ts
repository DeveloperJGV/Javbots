import { COVER_HOSTS, COVER_USER_AGENT, NET_PROBLEM_TEXT, type NetProblem } from './constants.js';

/**
 * A failed request, said without the address or what the network library reported: neither ever reaches a message,
 * an error or a log (the Twitch secret travels in a request body, but an address can still say more than needed).
 */
export class NetError extends Error {
  constructor(
    readonly problem: NetProblem,
    readonly status?: number,
  ) {
    super(NET_PROBLEM_TEXT[problem] + (status ? ` (${status})` : ''));
    this.name = 'NetError';
  }
}

export interface SafeRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Most bytes read from the body; more is an error (counted while reading, not trusted from a header). */
  maxBytes: number;
  /** For the whole request, body included. */
  timeoutMs: number;
}

export interface SafeResponse {
  status: number;
  contentType: string;
  bytes: Uint8Array;
}

export type SafeFetch = (url: string, req: SafeRequest) => Promise<SafeResponse>;

/** Only https, only the fixed hosts, on the default port, with no user in the address. */
export function allowedUrl(url: string): URL | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !COVER_HOSTS.has(u.hostname)) return null;
  if (u.username || u.password || (u.port !== '' && u.port !== '443')) return null;
  return u;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let step: Awaited<ReturnType<typeof reader.read>>;
    try {
      step = await reader.read();
    } catch {
      throw new NetError('sin-respuesta');
    }
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new NetError('demasiado-grande');
    }
    chunks.push(step.value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * The one way the covers feature reaches the network: https to the fixed hosts only, no redirects (one is an
 * error), a time limit over the whole request and a byte cap counted while reading. Never says the address.
 */
export function createSafeFetch(fetchImpl: typeof fetch = globalThis.fetch): SafeFetch {
  return async (url, req) => {
    const u = allowedUrl(url);
    if (!u) throw new NetError('no-permitido');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new NetError('sin-respuesta'));
      }, req.timeoutMs);
    });
    const work = (async (): Promise<SafeResponse> => {
      let res: Response;
      try {
        res = await fetchImpl(u.toString(), {
          method: req.method ?? 'GET',
          headers: { 'User-Agent': COVER_USER_AGENT, ...req.headers },
          body: req.body,
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch {
        throw new NetError('sin-respuesta');
      }
      if ((res.status >= 300 && res.status < 400) || res.type === 'opaqueredirect') {
        void res.body?.cancel().catch(() => {});
        throw new NetError('redireccion', res.status);
      }
      const bytes = await readCapped(res, req.maxBytes);
      return { status: res.status, contentType: res.headers.get('content-type') ?? '', bytes };
    })();
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
      // A request that lost the race must not surface later as an unhandled rejection
      work.catch(() => {});
    }
  };
}

export interface RateQueue {
  /** Runs `job` when its turn comes, at least the interval after the previous one started. */
  run<T>(job: () => Promise<T>): Promise<T>;
}

/** One request at a time per source, at most one per `intervalMs` (shared by one-game searches and the run). */
export function createRateQueue(
  intervalMs: number,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
): RateQueue {
  let tail: Promise<unknown> = Promise.resolve();
  let last = Number.NEGATIVE_INFINITY;
  return {
    run<T>(job: () => Promise<T>): Promise<T> {
      const next = tail.then(async () => {
        const wait = last + intervalMs - now();
        if (wait > 0) await sleep(wait);
        last = now();
        return job();
      });
      tail = next.catch(() => {});
      return next;
    },
  };
}
