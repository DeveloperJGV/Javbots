import type { Game } from '../core/types.js';
import { COVER_COLORS as K, DISC_COLORS, hsl, PAD_COLORS, type PlatformLook } from './constants.js';

/**
 * Everything drawn by code for the collection: no box art, no logos. A game's "cover" is a little pixel scene picked
 * from its title (the same title always gives the same scene), and its disc or cartridge.
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

/** A cartridge from the front, its label showing the cover. */
export function drawCartridge(
  target: HTMLCanvasElement | null,
  game: Game,
  look: PlatformLook,
): void {
  if (!target) return;
  target.width = 40;
  target.height = 44;
  const x = target.getContext('2d');
  if (!x) return;
  x.fillStyle = look.box;
  x.fillRect(2, 0, 36, 44);
  x.fillStyle = K.dim;
  x.fillRect(36, 0, 2, 44);
  x.fillStyle = K.shine;
  x.fillRect(2, 0, 2, 44);
  x.drawImage(cover(game.title, 28, 22), 6, 6);
  x.fillStyle = look.band;
  x.fillRect(6, 28, 28, 4);
  x.fillStyle = K.groove;
  for (let i = 0; i < 8; i++) x.fillRect(8 + i * 3, 36, 2, 6);
}

/** One gamepad, as SVG markup (pixel rects). */
export const PAD_SVG = `<svg class="col-pad" viewBox="0 0 24 14" shape-rendering="crispEdges" aria-hidden="true"><rect x="2" y="2" width="20" height="8" fill="${PAD_COLORS.body}"/><rect x="0" y="5" width="6" height="8" fill="${PAD_COLORS.body}"/><rect x="18" y="5" width="6" height="8" fill="${PAD_COLORS.body}"/><rect x="4" y="4" width="4" height="1" fill="${PAD_COLORS.dpad}"/><rect x="5" y="3" width="1" height="3" fill="${PAD_COLORS.dpad}"/><rect x="17" y="3" width="2" height="2" fill="${PAD_COLORS.a}"/><rect x="19" y="5" width="2" height="2" fill="${PAD_COLORS.b}"/><rect x="15" y="5" width="2" height="2" fill="${PAD_COLORS.x}"/><rect x="17" y="7" width="2" height="2" fill="${PAD_COLORS.y}"/></svg>`;
