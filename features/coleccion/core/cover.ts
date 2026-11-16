import { COVER_KEY_MAX, COVER_MAX_PIXELS, COVER_MAX_SIDE } from './constants.js';
import { platformById } from './platforms.js';
import type { Condition, Game } from './types.js';

/** Where a cover came from: a source found it, or the person uploaded it. */
export const COVER_SOURCES = ['libretro', 'igdb', 'subida'] as const;
export type CoverSource = (typeof COVER_SOURCES)[number];

/** Image formats a cover may have (checked by their first bytes, never by a name). */
export const COVER_TYPES = ['png', 'jpg', 'webp'] as const;
export type CoverType = (typeof COVER_TYPES)[number];

/**
 * A game's cover as the collection file keeps it: where it came from and when, never a path. The image itself is
 * <home>/.pixel-agents/coleccion/portadas/<game id>.<type>. Written only by the server.
 */
export interface CoverArt {
  source: CoverSource;
  /** libretro: the file name in its folder; igdb: the image_id; subida: "". */
  key: string;
  /** ISO time it was set. */
  at: string;
  type: CoverType;
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/;

/** An ISO time as the server writes it ("2026-11-16T06:00:00.000Z"). */
export const isIsoTime = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && ISO_PATTERN.test(v);

/** A cover from anything (the file, the wire); null when any part of it is not right. */
export function normalizeCoverArt(raw: unknown): CoverArt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!(COVER_SOURCES as readonly unknown[]).includes(r.source)) return null;
  if (!(COVER_TYPES as readonly unknown[]).includes(r.type)) return null;
  if (typeof r.key !== 'string' || r.key.length > COVER_KEY_MAX) return null;
  // No control characters and no path separators in a key: it is a name, never a place
  if (/[\u0000-\u001f\u007f/\\]/.test(r.key)) return null;
  if (!isIsoTime(r.at)) return null;
  return {
    source: r.source as CoverSource,
    key: r.key,
    at: r.at,
    type: r.type as CoverType,
  };
}

/** The image format from its first bytes: PNG, JPEG or WEBP; null for anything else. */
export function imageTypeOf(bytes: Uint8Array): CoverType | null {
  const b = bytes;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  )
    return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  )
    return 'webp';
  return null;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) =>
  ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** JPEG start-of-frame markers (C0 to CF but C4 = DHT, C8 = JPG and CC = DAC): they carry the size. */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    // Fill bytes: any number of 0xFF before a marker
    while (m === 0xff && i + 2 < b.length) {
      i++;
      m = b[i + 1];
    }
    // Markers without a length: TEM and RST0 to RST7
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      i += 2;
      continue;
    }
    // End of image, or the scan began without a frame header
    if (m === 0xd9 || m === 0xda) return null;
    if (i + 3 >= b.length) return null;
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    if (isSof(m)) {
      if (i + 8 >= b.length) return null;
      return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** WebP (RFC 9649): a lossy "VP8 ", lossless "VP8L" or extended "VP8X" first chunk. */
function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), then the start code 9D 01 2A, then 14-bit width and height
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  return null;
}

/**
 * An image's size from its header only (PNG IHDR, JPEG SOF, WebP VP8/VP8L/VP8X), without decoding it; null when the
 * header cannot be read.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const type = imageTypeOf(bytes);
  if (type === 'png') {
    if (bytes.length < 24) return null;
    if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null;
    return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (type === 'jpg') return jpegSize(bytes);
  if (type === 'webp') return webpSize(bytes);
  return null;
}

/** An image size a page can decode and draw without trouble. */
export const sizeAllowed = (s: { width: number; height: number }): boolean =>
  s.width > 0 &&
  s.height > 0 &&
  s.width <= COVER_MAX_SIDE &&
  s.height <= COVER_MAX_SIDE &&
  s.width * s.height <= COVER_MAX_PIXELS;

export const COVER_MIME: Record<CoverType, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** Year the Nintendo DS came out in America: cartridges older than it are kept loose by default. */
const LOOSE_BEFORE_YEAR = 2004;

/**
 * How a game of this console is shown when its condition was never said: old cartridges loose ("suelto"), modern
 * handhelds' cards and every disc console in their box ("completo").
 */
export function defaultCondition(platformId: string): 'suelto' | 'completo' {
  const p = platformById(platformId);
  return p && p.cartridge && p.year > 0 && p.year < LOOSE_BEFORE_YEAR ? 'suelto' : 'completo';
}

/** The condition to draw: the game's own, or its console's default. Never written to the file. */
export function shownCondition(game: Pick<Game, 'condition' | 'platform'>): Exclude<Condition, ''> {
  return game.condition || defaultCondition(game.platform);
}

/** What «Buscar las que faltan» needs to know of a game's last search (ColeccionCoverState). */
export interface LastSearch {
  state: string;
  reason?: string;
  needsKey?: boolean;
}

/**
 * Whether «Buscar las que faltan» looks for this game: owned, without a cover, and not already settled. Settled:
 * the person said «Ninguna», a choice is waiting for them, or a search already knew it is not there (no source has
 * that console, or nothing looked like it). A source that did not answer is tried again; one that needed the IGDB
 * key, again once there is a key. The page counts with this same rule.
 */
export function runSearches(
  game: Pick<Game, 'wanted' | 'coverArt' | 'coverNone'>,
  last: LastSearch | undefined,
  hasKey: boolean,
): boolean {
  if (game.wanted || game.coverArt || game.coverNone) return false;
  if (!last) return true;
  if (last.state === 'elige') return false;
  if (last.state !== 'nada') return true;
  if (last.reason === 'sin-respuesta' || last.reason === 'cambio') return true;
  if (last.needsKey || last.reason === 'sin-llave' || last.reason === 'pocas') return hasKey;
  return last.reason !== 'sin-coincidencia' && last.reason !== 'sin-cobertura';
}

/** Why a cover was not found, in words for the page (ColeccionCoverReason). */
export const COVER_REASON_TEXT: Readonly<Record<string, string>> = {
  'sin-cobertura': 'Ninguna fuente tiene portadas de esa consola.',
  pocas: 'libretro casi no tiene portadas de esa consola.',
  'sin-llave': 'Solo IGDB la tendría, y no hay llave puesta (o no funcionó).',
  'sin-respuesta': 'La fuente no contestó o la imagen no se pudo bajar.',
  'sin-coincidencia': 'No apareció nada parecido.',
  cambio: 'Cambió el título o la consola: hay que buscarla de nuevo.',
};

/** IGDB's terms (free for non-commercial use under the Twitch Developer Services Agreement). */
export const IGDB_TERMS_URL = 'https://www.twitch.tv/p/legal/developer-agreement/';
export const IGDB_TERMS_TEXT =
  'IGDB es gratis para uso no comercial, bajo el acuerdo de desarrolladores de Twitch. Léelo antes de sacar la llave.';
/** Where a Twitch app is registered to get the key. */
export const IGDB_APP_URL = 'https://dev.twitch.tv/console/apps/create';
/** How to get the IGDB key, step by step. */
export const IGDB_KEY_STEPS: readonly string[] = [
  'Entra a tu cuenta de Twitch (o crea una) y activa la verificación en dos pasos.',
  'Registra una app en dev.twitch.tv/console/apps/create: cualquier nombre, OAuth Redirect URL http://localhost, categoría la que quieras y Client Type «Confidential».',
  'Abre la app, copia el Client ID y pulsa «New Secret» para sacar el Client Secret.',
  'Pega los dos aquí. Se guardan solo en esta computadora y no se vuelven a enseñar.',
];
