import { shownCondition } from '../core/cover.js';
import type { SampleMode } from '../core/pixelate.js';
import { platformById } from '../core/platforms.js';
import type { Game } from '../core/types.js';

/**
 * What stands on the shelf for each game, and how big: its box (from the front, with its cover pixelated, or by its
 * spine when there is no cover), or the loose cartridge, card or disc. Pure: no DOM (tested in Node).
 */

/** Cartridge and card shapes that look like the real piece of their console. */
export const CART_SHAPES = [
  'nes',
  'snes',
  'n64',
  'gb',
  'gbc',
  'gba',
  'genesis',
  'sms',
  'a2600',
  'vboy',
  'ds',
  '3ds',
  'switch',
  'card',
  'cart',
] as const;
export type CartShape = (typeof CART_SHAPES)[number];
/** A loose game: a cartridge or card of some shape, or a disc. */
export type Media = CartShape | 'disc';

/** The loose piece of each console (anything not here: a generic cartridge for cartridge consoles, else a disc). */
const LOOSE_MEDIA: Readonly<Record<string, Media>> = {
  a2600: 'a2600',
  a7800: 'a2600',
  nes: 'nes',
  sms: 'sms',
  gb: 'gb',
  genesis: 'genesis',
  '32x': 'genesis',
  tg16: 'card',
  snes: 'snes',
  gbc: 'gbc',
  vboy: 'vboy',
  n64: 'n64',
  gba: 'gba',
  ds: 'ds',
  '3ds': '3ds',
  psvita: 'card',
  // Switch games are cards, though its boxes stand on the shelf like discs' cases
  switch: 'switch',
  switch2: 'switch',
};

export function looseMedia(platform: string): Media {
  const own = LOOSE_MEDIA[platform];
  if (own) return own;
  return platformById(platform)?.cartridge ? 'cart' : 'disc';
}

/**
 * The piece of a game:
 * - with its box (completo / sellado, or its console's default): the box from the front with the cover pixelated
 *   when it has one; without a cover, a disc console's case by its spine (as always) and a cartridge console's box
 *   from the front with its drawn scene;
 * - suelto: the loose cartridge, card or disc of its console.
 */
export type Piece =
  { kind: 'spine' } | { kind: 'box'; art: 'cover' | 'drawn' } | { kind: 'loose'; media: Media };

export function pieceOf(game: Pick<Game, 'condition' | 'platform'>, hasCover: boolean): Piece {
  if (shownCondition(game) === 'suelto') return { kind: 'loose', media: looseMedia(game.platform) };
  if (hasCover) return { kind: 'box', art: 'cover' };
  return platformById(game.platform)?.cartridge ? { kind: 'box', art: 'drawn' } : { kind: 'spine' };
}

/**
 * The games «Todos con caja / Todos sueltos» would change: the owned ones not already shown so, counting their
 * console's default (an NES game with no condition is already loose: nothing to write). «Sueltos» never takes a
 * sealed one out of its box: those are left as they are (see `sealedOf`), and the button says so.
 */
export function batchIds(
  games: readonly Pick<Game, 'id' | 'wanted' | 'condition' | 'platform'>[],
  target: 'completo' | 'suelto',
): string[] {
  return games
    .filter((g) => !g.wanted)
    .filter((g) => {
      const shown = shownCondition(g);
      return target === 'suelto' ? shown !== 'suelto' && shown !== 'sellado' : shown === 'suelto';
    })
    .map((g) => g.id);
}

/** The sealed games among these: «Todos sueltos» leaves them alone. */
export const sealedOf = (games: readonly Pick<Game, 'wanted' | 'condition'>[]): number =>
  games.filter((g) => !g.wanted && g.condition === 'sellado').length;

// ── How the pixelated covers are made ────────────────────────────────────────────────────────

/** Width of a DVD case's cover in art pixels, how many colors, and how each pixel is sampled. */
export interface CoverStyle {
  w: number;
  colors: number;
  mode: SampleMode;
}

/**
 * The chosen look (see README «Portadas en la repisa»): 40 art pixels and 32 colors. In the screenshots 24x8 and
 * 32x16 turned a 500 px box scan into noise; at 40x32 the logo and the main figure still read, in hard pixels.
 */
export const COVER_STYLE_DEFAULT: CoverStyle = { w: 40, colors: 32, mode: 'nearest' };
/** Bounds for the comparison mode (?portadas=WxC). */
export const COVER_STYLE_W_MIN = 12;
export const COVER_STYLE_W_MAX = 64;
export const COVER_STYLE_COLORS_MAX = 64;
/** The page's address parameter that switches the look, for side-by-side screenshots. */
export const COVER_STYLE_PARAM = 'portadas';

/**
 * The look from the page's address: `?portadas=24x8` (art width × colors), with an optional last letter `m` for
 * the block average instead of the nearest pixel (`?portadas=32x16m`). Anything else: the default.
 */
export function parseCoverStyle(search: string): CoverStyle {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get(COVER_STYLE_PARAM);
  } catch {
    return COVER_STYLE_DEFAULT;
  }
  const m = /^(\d{1,2})x(\d{1,2})([mn]?)$/i.exec(raw?.trim() ?? '');
  if (!m) return COVER_STYLE_DEFAULT;
  const w = Number(m[1]);
  const colors = Number(m[2]);
  if (
    w < COVER_STYLE_W_MIN ||
    w > COVER_STYLE_W_MAX ||
    colors < 2 ||
    colors > COVER_STYLE_COLORS_MAX
  )
    return COVER_STYLE_DEFAULT;
  return { w, colors, mode: m[3].toLowerCase() === 'm' ? 'average' : 'nearest' };
}

/** `32x16` (and `m` for the average): how a style is written in the address and in cache keys. */
export const coverStyleKey = (s: CoverStyle): string =>
  `${s.w}x${s.colors}${s.mode === 'average' ? 'm' : ''}`;

// ── Sizes ────────────────────────────────────────────────────────────────────────────────────

/** A box's front: its shape (width / height) and how tall it stands on the shelf (px). */
export interface BoxShape {
  ratio: number;
  h: number;
}

/** A DVD case (PS2 to PS5, Xbox, Wii, Wii U, PC): the reference the others are measured against. */
export const DVD_BOX: BoxShape = { ratio: 0.71, h: 132 };
/** How wide a DVD case's front shows on the shelf (px): the pixel size comes from it. */
export const DVD_FRONT_PX = 94;

const TALL_CARDBOARD: BoxShape = { ratio: 0.72, h: 120 };
const WIDE_CARDBOARD: BoxShape = { ratio: 1.38, h: 92 };
const SMALL_CARDBOARD: BoxShape = { ratio: 0.95, h: 78 };
const JEWEL: BoxShape = { ratio: 1, h: 100 };

const BOX_SHAPES: Readonly<Record<string, BoxShape>> = {
  a2600: TALL_CARDBOARD,
  intv: TALL_CARDBOARD,
  coleco: TALL_CARDBOARD,
  a7800: TALL_CARDBOARD,
  nes: TALL_CARDBOARD,
  sms: TALL_CARDBOARD,
  genesis: TALL_CARDBOARD,
  '32x': TALL_CARDBOARD,
  jaguar: TALL_CARDBOARD,
  neogeo: { ratio: 0.72, h: 132 },
  snes: WIDE_CARDBOARD,
  n64: WIDE_CARDBOARD,
  vboy: WIDE_CARDBOARD,
  gb: SMALL_CARDBOARD,
  gbc: SMALL_CARDBOARD,
  gba: SMALL_CARDBOARD,
  gg: SMALL_CARDBOARD,
  ngpc: SMALL_CARDBOARD,
  tg16: SMALL_CARDBOARD,
  segacd: JEWEL,
  '3do': JEWEL,
  saturn: JEWEL,
  ps1: JEWEL,
  dreamcast: JEWEL,
  gc: { ratio: 0.7, h: 124 },
  ds: { ratio: 0.9, h: 86 },
  '3ds': { ratio: 0.9, h: 86 },
  psp: { ratio: 0.58, h: 108 },
  psvita: { ratio: 0.6, h: 100 },
  switch: { ratio: 0.62, h: 112 },
  switch2: { ratio: 0.62, h: 112 },
};

export const boxShapeOf = (platform: string): BoxShape => BOX_SHAPES[platform] ?? DVD_BOX;

/** Console plastic around the cover, in art pixels: a wider strip on the left (the spine's edge). */
export const BOX_FRAME = { left: 2, right: 1, top: 1, bottom: 1 } as const;

/** Screen pixels per art pixel for boxes: the same on every shelf for one style. */
export const boxScale = (style: CoverStyle): number =>
  Math.max(1, Math.round(DVD_FRONT_PX / style.w));

/** A box's size in art pixels (frame included) and the cover's place inside it. */
export function boxArt(
  platform: string,
  style: CoverStyle,
): { w: number; h: number; cover: { x: number; y: number; w: number; h: number } } {
  const shape = boxShapeOf(platform);
  const dvdH = style.w / DVD_BOX.ratio;
  const h = Math.max(8, Math.round((dvdH * shape.h) / DVD_BOX.h));
  const w = Math.max(6, Math.round(h * shape.ratio));
  return {
    w,
    h,
    cover: {
      x: BOX_FRAME.left,
      y: BOX_FRAME.top,
      w: w - BOX_FRAME.left - BOX_FRAME.right,
      h: h - BOX_FRAME.top - BOX_FRAME.bottom,
    },
  };
}

/** A cartridge's size in art pixels and where its label is. */
export interface CartArt {
  w: number;
  h: number;
  label: { x: number; y: number; w: number; h: number };
}

/** Each shape, in art pixels (roughly the real piece's proportions, a DS card next to an NES cartridge). */
export const CART_ART: Readonly<Record<CartShape, CartArt>> = {
  nes: { w: 20, h: 22, label: { x: 3, y: 3, w: 14, h: 10 } },
  snes: { w: 24, h: 19, label: { x: 5, y: 4, w: 14, h: 9 } },
  n64: { w: 24, h: 17, label: { x: 5, y: 6, w: 14, h: 9 } },
  gb: { w: 14, h: 16, label: { x: 2, y: 5, w: 10, h: 9 } },
  gbc: { w: 14, h: 16, label: { x: 2, y: 5, w: 10, h: 9 } },
  gba: { w: 16, h: 10, label: { x: 3, y: 2, w: 10, h: 6 } },
  genesis: { w: 20, h: 23, label: { x: 3, y: 5, w: 14, h: 14 } },
  sms: { w: 18, h: 22, label: { x: 2, y: 4, w: 14, h: 13 } },
  a2600: { w: 18, h: 18, label: { x: 2, y: 2, w: 14, h: 8 } },
  vboy: { w: 18, h: 18, label: { x: 3, y: 4, w: 12, h: 9 } },
  ds: { w: 12, h: 12, label: { x: 2, y: 3, w: 8, h: 7 } },
  '3ds': { w: 12, h: 12, label: { x: 2, y: 3, w: 8, h: 7 } },
  switch: { w: 9, h: 12, label: { x: 1, y: 2, w: 7, h: 8 } },
  card: { w: 12, h: 14, label: { x: 2, y: 2, w: 8, h: 9 } },
  cart: { w: 18, h: 20, label: { x: 3, y: 3, w: 12, h: 10 } },
};
/** Screen pixels per art pixel for loose cartridges and cards. */
export const CART_SCALE = 4;
/** A loose disc: drawn at this many pixels, shown this much bigger. */
export const DISC_ART = 46;
export const DISC_SCALE = 2;

/** How tall and wide a piece shows on the shelf (px). `spine` is the console's own spine size. */
export function pieceSize(
  piece: Piece,
  platform: string,
  style: CoverStyle,
  spine: { w: number; h: number },
): { w: number; h: number } {
  if (piece.kind === 'spine') return { w: spine.w, h: spine.h };
  if (piece.kind === 'box') {
    const a = boxArt(platform, style);
    const k = boxScale(style);
    return { w: a.w * k, h: a.h * k };
  }
  if (piece.media === 'disc') return { w: DISC_ART * DISC_SCALE, h: DISC_ART * DISC_SCALE };
  const c = CART_ART[piece.media];
  return { w: c.w * CART_SCALE, h: c.h * CART_SCALE };
}

/** Which part of a box cover becomes a cartridge's label: the upper middle, where the logo and art usually are. */
export const LABEL_ANCHOR_Y = 0.3;

/**
 * A label is 7 to 14 art pixels wide: the nearest pixel of a 500 px cover there is noise, the block average keeps
 * the label's main colors (checked on the shelf screenshots).
 */
export const labelStyle = (style: CoverStyle): CoverStyle => ({ ...style, mode: 'average' });
