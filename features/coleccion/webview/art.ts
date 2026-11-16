import type { Game } from '../core/types.js';
import {
  CART_COLORS,
  COVER_COLORS as K,
  DISC_COLORS,
  hsl,
  PAD_COLORS,
  type PlatformLook,
} from './constants.js';
import { CART_ART, type CartShape } from './pieces.js';

/**
 * Everything drawn by code for the collection: no logos. A game without its real cover gets a little pixel scene
 * picked from its title (the same title always gives the same scene); boxes, cartridges, cards and discs are drawn
 * here too. A real cover only comes in already pixelated (coverPixels.ts).
 */

/** A number from a text that is always the same for the same text. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

const MOTIFS = [
  'stars',
  'hills',
  'sun',
  'waves',
  'city',
  'sword',
  'ball',
  'car',
  'moon',
  'ship',
] as const;
export type Motif = (typeof MOTIFS)[number];

/** The scene and hue of a game's cover. */
export function coverLook(title: string): { motif: Motif; hue: number } {
  const h = hashText(title.trim().toLowerCase());
  return { motif: MOTIFS[h % MOTIFS.length], hue: Math.floor(h / MOTIFS.length) % 360 };
}

const cache = new Map<string, HTMLCanvasElement>();

/** One flat rectangle of a drawing, in art pixels. */
export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

/**
 * Below this (art pixels, either side) the scene does not fit: a cartridge label (7 to 14) gets the small design
 * instead. Box covers start at 23, so they always keep their scene.
 */
export const SMALL_LABEL_MAX = 16;

/**
 * A small label for a cartridge or card without its cover (7 to 14 art pixels): light, in the game's hue, with a
 * dark title bar and a mark in the middle, so it reads as a printed label and never as a dark hole. Every rectangle
 * lies inside W×H and is at least 1×1.
 */
export function smallLabelRects(title: string, W: number, H: number): ArtRect[] {
  const { hue } = coverLook(title);
  const rects: ArtRect[] = [];
  const add = (x: number, y: number, w: number, h: number, color: string) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    if (x1 - x0 >= 1 && y1 - y0 >= 1) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, color });
  };
  add(0, 0, W, H, hsl(hue, 50, 70));
  // The title: a dark bar on top with a light stroke of "letters"
  const bar = Math.max(2, Math.round(H * 0.3));
  add(0, 0, W, bar, hsl(hue, 55, 26));
  add(
    1,
    Math.floor(bar / 2),
    Math.min(W - 2, Math.max(2, title.trim().length)),
    1,
    hsl(hue, 60, 85),
  );
  // The mark: a square in the other color, in the middle of what is left
  const room = H - bar;
  const side = Math.max(1, Math.min(W - 4, room - 2));
  add((W - side) / 2, bar + (room - side) / 2, side, side, hsl((hue + 180) % 360, 65, 45));
  return rects;
}

/** The cover as a small canvas (cached; draw a copy with copyCanvas). */
export function cover(title: string, W = 48, H = 64): HTMLCanvasElement {
  const key = `${title}|${W}x${H}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return cv;
  if (W < SMALL_LABEL_MAX || H < SMALL_LABEL_MAX) {
    for (const q of smallLabelRects(title, W, H)) {
      c.fillStyle = q.color;
      c.fillRect(q.x, q.y, q.w, q.h);
    }
    cache.set(key, cv);
    return cv;
  }
  const { motif, hue: h } = coverLook(title);
  const r = (x: number, y: number, w: number, hh: number, col: string) => {
    c.fillStyle = col;
    c.fillRect(Math.round(x), Math.round(y), w, hh);
  };
  for (let y = 0; y < H; y++) r(0, y, W, 1, hsl(h, 55, 18 + Math.floor((y / H) * 4) * 6));
  let s = hashText(title) || 3;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const hor = Math.floor(H * 0.62);
  switch (motif) {
    case 'stars':
      for (let i = 0; i < 28; i++) r(rnd() * W, rnd() * H, 1, 1, K.white);
      r(W * 0.55, H * 0.3, 6, 6, hsl((h + 180) % 360, 70, 65));
      break;
    case 'hills':
      for (let x = 0; x < W; x++) {
        const y = hor - Math.abs(((x * 3) % 36) - 18) * 0.9;
        r(x, y, 1, H - y, hsl((h + 30) % 360, 40, 30));
      }
      r(W * 0.7, 8, 6, 6, K.warm);
      break;
    case 'sun':
      r(W / 2 - 9, hor - 14, 18, 14, hsl((h + 40) % 360, 90, 60));
      for (let i = 0; i < 4; i++) r(0, hor + 3 + i * 4, W, 2, hsl(h, 60, 30 + i * 6));
      break;
    case 'waves':
      for (let i = 0; i < 6; i++)
        for (let x = 0; x < W; x += 6)
          r(x + (i % 2) * 3, hor + i * 4, 4, 2, hsl((h + 190) % 360, 60, 55));
      break;
    case 'city':
      for (let x = 0; x < W; x += 6) {
        const hh = 10 + rnd() * 24;
        r(x, hor - hh, 5, hh + 20, hsl(h, 30, 12));
        for (let y = hor - hh + 2; y < hor; y += 4) if (rnd() < 0.5) r(x + 2, y, 1, 1, K.warm);
      }
      break;
    case 'sword':
      r(W / 2 - 1, 10, 3, 32, K.steel);
      r(W / 2 - 6, 40, 13, 3, K.gold);
      r(W / 2 - 1, 43, 3, 8, K.wood);
      break;
    case 'ball':
      r(0, hor, W, H, hsl(110, 45, 30));
      r(W / 2 - 8, hor - 18, 16, 16, K.ball);
      r(W / 2 - 3, hor - 13, 6, 6, K.dark);
      break;
    case 'car': {
      const body = hsl((h + 150) % 360, 70, 50);
      r(0, hor + 6, W, 10, K.road);
      for (let x = 2; x < W; x += 8) r(x, hor + 10, 4, 1, K.warm);
      r(W / 2 - 12, hor - 4, 24, 8, body);
      r(W / 2 - 7, hor - 9, 12, 5, hsl((h + 150) % 360, 60, 40));
      r(W / 2 - 10, hor + 4, 5, 4, K.tire);
      r(W / 2 + 5, hor + 4, 5, 4, K.tire);
      break;
    }
    case 'moon':
      r(W * 0.3, 10, 14, 14, K.moon);
      r(W * 0.3 + 5, 9, 12, 12, hsl(h, 55, 18));
      for (let i = 0; i < 14; i++) r(rnd() * W, rnd() * hor, 1, 1, K.white);
      break;
    case 'ship':
      for (let i = 0; i < 18; i++) r(rnd() * W, rnd() * H, 1, 1, K.white);
      r(W / 2 - 3, 20, 6, 16, K.steel);
      r(W / 2 - 8, 30, 16, 4, hsl((h + 180) % 360, 70, 55));
      r(W / 2 - 2, 36, 4, 6, K.flame);
      break;
  }
  // The title as a bar of "letters" (no real text at this size)
  r(4, 4, W - 8, 9, K.shade);
  r(6, 7, Math.min(W - 12, title.length * 2), 3, hsl((h + 60) % 360, 80, 75));
  cache.set(key, cv);
  return cv;
}

/** Copies a cached canvas into a visible one. */
export function paint(target: HTMLCanvasElement | null, source: HTMLCanvasElement): void {
  if (!target) return;
  target.width = source.width;
  target.height = source.height;
  target.getContext('2d')?.drawImage(source, 0, 0);
}

/** A disc seen from above: silver with a band of the game's color (smaller for GameCube). */
export function drawDisc(target: HTMLCanvasElement | null, game: Game, small: boolean): void {
  if (!target) return;
  const S = 46;
  target.width = S;
  target.height = S;
  const x = target.getContext('2d');
  if (!x) return;
  const { hue } = coverLook(game.title);
  const R = small ? 15 : 22;
  const c = S / 2;
  for (let y = 0; y < S; y++)
    for (let xx = 0; xx < S; xx++) {
      const d = Math.hypot(xx - c + 0.5, y - c + 0.5);
      if (d > R || d < 3) continue;
      let col: string =
        d < 6
          ? DISC_COLORS.hub
          : Math.floor(Math.atan2(y - c, xx - c) * 4) % 2
            ? DISC_COLORS.light
            : DISC_COLORS.dark;
      if (d >= 7 && d < R - 1 && y < c - 2) col = hsl(hue, 55, 40 + (Math.floor(d) % 3) * 4);
      if (d >= R - 1) col = DISC_COLORS.rim;
      x.fillStyle = col;
      x.fillRect(xx, y, 1, 1);
    }
}

// ── Pieces on the shelf: a box from the front, a loose cartridge or card ───────────────────

type Px = (x: number, y: number, w: number, h: number, col: string) => void;

/** A canvas of w×h art pixels, cleared, and its pixel painter (null when the canvas has no 2D context). */
function artCanvas(target: HTMLCanvasElement, w: number, h: number): Px | null {
  target.width = w;
  target.height = h;
  const c = target.getContext('2d');
  if (!c) return null;
  c.clearRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  return (x, y, ww, hh, col) => {
    c.fillStyle = col;
    c.fillRect(x, y, ww, hh);
  };
}

/** Cuts single pixels out (a corner or a notch of the plastic). */
function cut(target: HTMLCanvasElement, cells: readonly (readonly [number, number])[]): void {
  const c = target.getContext('2d');
  if (c) for (const [x, y] of cells) c.clearRect(x, y, 1, 1);
}

/**
 * A box seen from the front: the console's plastic around it (a wider edge on the left, the spine) and, inside,
 * the cover pixelated, or the game's drawn scene when it has none.
 */
export function drawBoxFront(
  target: HTMLCanvasElement | null,
  game: Game,
  look: PlatformLook,
  size: { w: number; h: number; cover: { x: number; y: number; w: number; h: number } },
  art: HTMLCanvasElement | null,
): void {
  if (!target) return;
  const r = artCanvas(target, size.w, size.h);
  if (!r) return;
  const { x, y, w, h } = size.cover;
  r(0, 0, size.w, size.h, look.box);
  const c = target.getContext('2d');
  c?.drawImage(art ?? cover(game.title, w, h), x, y, w, h);
  // The spine's edge, a lit top and a shaded bottom: it reads as a box, not a picture
  r(0, 0, 1, size.h, K.dim);
  r(0, 0, size.w, 1, K.shine);
  r(0, size.h - 1, size.w, 1, K.dim);
}

/**
 * A loose cartridge or card, with the real shape of its console's (NES grey and tall with its ridges, SNES with its
 * cut corners, N64 with its grip on top, Game Boy with the corner cut, 3DS with its tab on the top right…) and its
 * label: a piece of the cover pixelated, or the drawn scene.
 */
export function drawLooseCart(
  target: HTMLCanvasElement | null,
  game: Game,
  look: PlatformLook,
  shape: CartShape,
  label: HTMLCanvasElement | null,
): void {
  if (!target) return;
  const a = CART_ART[shape];
  const r = artCanvas(target, a.w, a.h);
  if (!r) return;
  const own = shape === 'cart' ? null : CART_COLORS[shape];
  const body = own?.body ?? look.box;
  const light = own?.light ?? K.shine;
  const dark = own?.dark ?? K.groove;
  const L = a.label;
  const frame = () => r(L.x - 1, L.y - 1, L.w + 2, L.h + 2, dark);
  const ridges = (x: number, from: number, to: number, w: number, step = 2) => {
    for (let y = from; y <= to; y += step) r(x, y, w, 1, dark);
  };
  switch (shape) {
    case 'nes':
      r(0, 1, a.w, a.h - 1, body);
      // The top lip with its notch in the middle
      r(1, 0, 8, 1, body);
      r(11, 0, 8, 1, body);
      r(0, 1, 1, a.h - 1, light);
      frame();
      ridges(2, 15, 20, 16);
      r(0, a.h - 1, a.w, 1, dark);
      break;
    case 'snes':
      r(0, 0, a.w, a.h, body);
      cut(target, [
        [0, 0],
        [1, 0],
        [0, 1],
        [22, 0],
        [23, 0],
        [23, 1],
        [0, 18],
        [1, 18],
        [22, 18],
        [23, 18],
      ]);
      r(2, 0, 20, 1, light);
      ridges(0, 7, 15, 3);
      ridges(21, 7, 15, 3);
      frame();
      r(5, 15, 14, 1, dark);
      break;
    case 'n64':
      // The wide grip on top, with its ridges; the body below it, a little narrower
      r(0, 0, a.w, 5, body);
      ridges(1, 1, 3, 22);
      r(2, 5, 20, a.h - 5, body);
      r(0, 0, a.w, 1, light);
      frame();
      break;
    case 'gb':
    case 'gbc':
      r(0, 0, a.w, a.h, body);
      // The corner cut on the top right, like the real one
      cut(target, [
        [12, 0],
        [13, 0],
        [13, 1],
      ]);
      ridges(1, 1, 3, 10);
      frame();
      r(0, a.h - 1, a.w, 1, dark);
      break;
    case 'gba':
      r(0, 1, a.w, a.h - 1, body);
      r(5, 0, 6, 1, body);
      frame();
      r(0, a.h - 1, a.w, 1, dark);
      break;
    case 'genesis':
      r(0, 0, a.w, 4, body);
      ridges(1, 1, 2, 18, 1);
      r(1, 4, a.w - 2, a.h - 4, body);
      frame();
      r(1, a.h - 1, a.w - 2, 1, dark);
      break;
    case 'sms':
      r(0, 0, a.w, a.h, body);
      // The white band on top of the label
      r(1, 1, a.w - 2, 2, light);
      frame();
      ridges(2, 19, 20, 14, 1);
      break;
    case 'a2600':
      r(0, 0, a.w, a.h, body);
      r(0, 0, a.w, 1, light);
      frame();
      ridges(1, 12, 16, 16);
      break;
    case 'vboy':
      r(0, 0, a.w, a.h, body);
      cut(target, [
        [16, 0],
        [17, 0],
        [17, 1],
      ]);
      r(0, a.h - 3, a.w, 1, light);
      frame();
      break;
    case 'ds':
      // A small card, almost square, with its little lip on top
      r(0, 1, a.w, a.h - 1, body);
      r(1, 0, 5, 1, body);
      frame();
      break;
    case '3ds':
      // The same card, with the tab on the top right that tells them apart
      r(0, 1, a.w, a.h - 1, body);
      r(8, 0, 4, 2, body);
      r(9, 0, 3, 1, light);
      frame();
      r(0, a.h - 1, a.w, 1, dark);
      break;
    case 'switch':
      r(0, 0, a.w, a.h, body);
      cut(target, [[0, 0]]);
      r(1, 1, a.w - 2, 1, dark);
      break;
    case 'card':
      r(0, 0, a.w, a.h, body);
      frame();
      r(2, a.h - 1, a.w - 4, 1, dark);
      break;
    case 'cart':
      r(0, 0, a.w, a.h, body);
      r(0, 0, 1, a.h, light);
      frame();
      ridges(2, 15, 17, 14);
      break;
  }
  // The label is paper: what a cover leaves transparent shows paper, not the plastic's dark frame
  r(L.x, L.y, L.w, L.h, K.paper);
  target.getContext('2d')?.drawImage(label ?? cover(game.title, L.w, L.h), L.x, L.y, L.w, L.h);
}

/** One gamepad, as SVG markup (pixel rects). */
export const PAD_SVG = `<svg class="col-pad" viewBox="0 0 24 14" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="20" height="8" fill="${PAD_COLORS.body}"/><rect x="0" y="5" width="6" height="8" fill="${PAD_COLORS.body}"/><rect x="18" y="5" width="6" height="8" fill="${PAD_COLORS.body}"/><rect x="4" y="4" width="4" height="1" fill="${PAD_COLORS.dpad}"/><rect x="5" y="3" width="1" height="3" fill="${PAD_COLORS.dpad}"/><rect x="17" y="3" width="2" height="2" fill="${PAD_COLORS.a}"/><rect x="19" y="5" width="2" height="2" fill="${PAD_COLORS.b}"/><rect x="15" y="5" width="2" height="2" fill="${PAD_COLORS.x}"/><rect x="17" y="7" width="2" height="2" fill="${PAD_COLORS.y}"/></svg>`;
