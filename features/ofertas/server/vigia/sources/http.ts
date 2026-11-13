/**
 * What every source shares: one polite request (generic browser User-Agent, no cookies, one try, 15 s limit), the
 * block detection, and the small parsers for prices, URLs and HTML text. Plain Node: global fetch (Node 20+).
 */
import { SourceBlocked } from '../types.js';

/** A generic desktop browser. Never a name, an email or anything that points to a person. */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export const ACCEPT_LANGUAGE = 'es-MX,es;q=0.9';
export const REQUEST_TIMEOUT_MS = 15_000;
/** Most offers one source gives for one search. */
export const MAX_OFFERS = 20;
export const HOUR_MS = 60 * 60 * 1000;

/** Status codes that mean "the store refused us", not "it broke". */
const BLOCK_STATUSES = new Set([403, 429, 503]);

/** Bot walls and captcha pages of the stores we read. */
const CAPTCHA_MARKERS = [
  'px-captcha',
  'Robot or human',
  'Enter the characters you see below',
  'api-services-support@amazon.com',
  'captcha-delivery.com',
  '/errors/validateCaptcha',
];

export interface FetchedText {
  status: number;
  text: string;
}

export interface RequestInit2 {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * One request, no retries. Throws SourceBlocked on 403/429/503, an Error in Spanish on any other failure. The
 * caller's signal and the 15 s limit both abort it.
 */
export async function fetchText(
  fetchFn: typeof fetch,
  url: string,
  signal?: AbortSignal,
  init: RequestInit2 = {},
  accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
): Promise<FetchedText> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: init.method ?? 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': ACCEPT_LANGUAGE,
        Accept: accept,
        ...init.headers,
      },
      body: init.body,
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        signal?.aborted ? 'Búsqueda cancelada' : 'La tienda tardó demasiado en contestar',
      );
    }
    throw new Error(`Sin conexión con la tienda (${(err as Error).message})`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  if (BLOCK_STATUSES.has(res.status)) {
    throw new SourceBlocked(`La tienda rechazó la consulta (HTTP ${res.status})`);
  }
  const text = await res.text();
  if (!res.ok && res.status !== 206) {
    throw new Error(`La tienda contestó con error (HTTP ${res.status})`);
  }
  return { status: res.status, text };
}

/** fetchText + JSON.parse, with a Spanish error when the answer is not JSON. */
export async function fetchJson(
  fetchFn: typeof fetch,
  url: string,
  signal?: AbortSignal,
  init: RequestInit2 = {},
): Promise<unknown> {
  const { text } = await fetchText(fetchFn, url, signal, init, 'application/json');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (looksLikeCaptcha(text)) throw new SourceBlocked('La tienda pidió captcha');
    throw new Error('La tienda no contestó con datos legibles');
  }
}

export function looksLikeCaptcha(text: string): boolean {
  return CAPTCHA_MARKERS.some((marker) => text.includes(marker));
}

/** "$1,234.50", "1234.5", 1234.5 → 1234.5. Anything without a positive amount → undefined. */
export function parsePrice(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Relative or protocol-less URL → absolute against the store's origin. Drops the redundant :443. */
export function absoluteUrl(url: string, base: string): string {
  try {
    const abs = new URL(url, base);
    if (abs.port === '443' && abs.protocol === 'https:') abs.port = '';
    return abs.toString();
  } catch {
    return url;
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Inner HTML → plain text on one line. */
export function htmlText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
}
