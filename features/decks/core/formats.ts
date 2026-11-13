import { YDK_EXTRA, YDK_HEADER, YDK_MAIN, YDK_SIDE, YDKE_PREFIX } from './constants.js';
import { toCardId } from './deck.js';
import type { Deck } from './types.js';

/** The three zones of a deck, without the rest of it. */
export interface DeckLists {
  main: number[];
  extra: number[];
  side: number[];
}

// ── base64 (own code: no Buffer, no atob, so it runs the same in Node, a browser or React Native) ──────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

/** The bytes of a base64 string (standard or URL alphabet, padding optional), or null when it is not base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  const clean = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (clean.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) return null;
    buffer = ((buffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

// ── ydke:// ────────────────────────────────────────────────────────────────────────────────

function idsToBase64(ids: readonly number[]): string {
  const bytes = new Uint8Array(ids.length * 4);
  ids.forEach((id, i) => {
    bytes[i * 4] = id & 0xff;
    bytes[i * 4 + 1] = (id >>> 8) & 0xff;
    bytes[i * 4 + 2] = (id >>> 16) & 0xff;
    bytes[i * 4 + 3] = (id >>> 24) & 0xff;
  });
  return bytesToBase64(bytes);
}

function base64ToIds(text: string): number[] | null {
  const bytes = base64ToBytes(text);
  if (!bytes || bytes.length % 4 !== 0) return null;
  const ids: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const id = (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    if (id > 0) ids.push(id);
  }
  return ids;
}

/** `ydke://<main>!<extra>!<side>!`: each part is base64 of little-endian uint32 card codes. */
export function toYdke(lists: DeckLists): string {
  return `${YDKE_PREFIX}${idsToBase64(lists.main)}!${idsToBase64(lists.extra)}!${idsToBase64(lists.side)}!`;
}

export function isYdke(text: string): boolean {
  return text.trim().toLowerCase().startsWith(YDKE_PREFIX);
}

/** The zones of a ydke:// link, or null when it is not one. */
export function parseYdke(text: string): DeckLists | null {
  const trimmed = text.trim();
  if (!isYdke(trimmed)) return null;
  const parts = trimmed.slice(YDKE_PREFIX.length).split('!');
  if (parts.length < 3) return null;
  const main = base64ToIds(parts[0]);
  const extra = base64ToIds(parts[1]);
  const side = base64ToIds(parts[2]);
  if (!main || !extra || !side) return null;
  return { main, extra, side };
}

// ── .ydk ───────────────────────────────────────────────────────────────────────────────────

/** True when the text has a .ydk section header on a line of its own. */
export function isYdk(text: string): boolean {
  return /^\s*(#main|#extra|!side)\s*$/im.test(text);
}

export interface YdkParse extends DeckLists {
  /** Lines that were not a card code (in Spanish). */
  problems: string[];
}

/** The zones of a .ydk text. Lines before the first section, comments and blank lines are skipped. */
export function parseYdk(text: string): YdkParse {
  const out: YdkParse = { main: [], extra: [], side: [], problems: [] };
  let zone: keyof DeckLists | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const lower = line.toLowerCase();
    if (lower === YDK_MAIN) zone = 'main';
    else if (lower === YDK_EXTRA) zone = 'extra';
    else if (lower === YDK_SIDE) zone = 'side';
    else if (!line || line.startsWith('#') || line.startsWith('!') || !zone) return;
    else {
      const id = toCardId(line);
      if (id === null) out.problems.push(`Línea ${i + 1}: "${line}" no es un código de carta.`);
      else out[zone].push(id);
    }
  });
  return out;
}

/** A .ydk text (EDOPro, YGOPRODeck, ...). */
export function toYdk(deck: Pick<Deck, 'main' | 'extra' | 'side'>): string {
  return [
    YDK_HEADER,
    YDK_MAIN,
    ...deck.main.map(String),
    YDK_EXTRA,
    ...deck.extra.map(String),
    YDK_SIDE,
    ...deck.side.map(String),
    '',
  ].join('\n');
}
