/** Small guards for the model's answer: it is untrusted data, so every field is checked, trimmed and capped. */
import { PRICE_MAX, PRICE_SANITY_FACTOR, URL_MAX } from './constants.js';

export type Rec = Record<string, unknown>;

export const rec = (v: unknown): Rec | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;

/** Control characters, zero-width marks and bidi overrides (code point ranges, so the source stays plain ASCII). */
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const INVISIBLE = new RegExp(
  `[${INVISIBLE_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join('')}]`,
  'g',
);

/** One line of plain text: control characters out, spaces collapsed, cut at max (with an ellipsis). */
export function text(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') {
    return undefined;
  }
  const t = v.replace(INVISIBLE, ' ');
  const s = t.replace(/\s+/g, ' ').trim();
  if (!s) {
    return undefined;
  }
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Only absolute http(s) links, with no user:password, at most URL_MAX long. */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') {
    return undefined;
  }
  const raw = v.trim();
  if (!raw || raw.length > URL_MAX) {
    return undefined;
  }
  try {
    const u = new URL(raw);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) {
      return undefined;
    }
    if (!u.hostname.includes('.')) {
      return undefined;
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

/**
 * A price in MXN: a positive finite number (or a string like "$1,299.00"), below PRICE_MAX and, when a reference
 * price is known, within PRICE_SANITY_FACTOR of it. Rounded to cents.
 */
export function price(v: unknown, reference?: number): number | undefined {
  let n: number | undefined;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    const clean = v.replace(/[$\s]|MXN|mxn/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    n = /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : undefined;
  }
  if (n === undefined || !Number.isFinite(n) || n <= 0 || n > PRICE_MAX) {
    return undefined;
  }
  if (reference !== undefined && reference > 0) {
    if (n > reference * PRICE_SANITY_FACTOR || n < reference / PRICE_SANITY_FACTOR) {
      return undefined;
    }
  }
  return Math.round(n * 100) / 100;
}

/** A date "YYYY-MM-DD" or "YYYY-MM" that exists and is not in the future. */
export function pastDate(v: unknown, now: Date): string | undefined {
  if (typeof v !== 'string') {
    return undefined;
  }
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v.trim());
  if (!m) {
    return undefined;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = m[3] ? Number(m[3]) : 1;
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) {
    return undefined;
  }
  if (y < 2000 || at.getTime() > now.getTime() + 24 * 3600_000) {
    return undefined;
  }
  return v.trim();
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
