import {
  ISAAC_AFRO_DARK,
  ISAAC_AFRO_LIGHT,
  ISAAC_AFRO_PINK,
  ISAAC_AFRO_ROWS,
  ISAAC_AFRO_SIDE,
  ISAAC_CLICK_RESET_SEC,
  ISAAC_CLICKS_TO_DANCE,
  ISAAC_DANCE_SEC,
  ISAAC_DANCE_STEP_SEC,
  ISAAC_GLASSES_COLOR,
  ISAAC_GLASSES_GLINT,
  ISAAC_GLASSES_LENSES,
  ISAAC_GLASSES_ROWS,
  ISAAC_HAIRLINE_ROW,
} from '../../constants.js';
import type { SpriteData } from '../types.js';

/**
 * Easter egg (fork): click the crying Isaac in the basement ISAAC_CLICKS_TO_DANCE
 * times in a row and he puts on a pink afro and dances for a while. Pure state and
 * sprite math, DOM-free; OfficeState owns the clock and the furniture, OfficeCanvas
 * the clicks and the sound.
 */

export interface IsaacDanceState {
  /** Clicks in the current streak (a pause longer than ISAAC_CLICK_RESET_SEC starts over). */
  clicks: number;
  lastClickAt: number;
  /** Clock time the dance started, or null when he is just crying. */
  danceStartedAt: number | null;
}

export function createIsaacDance(): IsaacDanceState {
  return { clicks: 0, lastClickAt: -Infinity, danceStartedAt: null };
}

export type IsaacPoke = 'count' | 'dance' | 'dancing';

/** One click at clock time `now`. 'dance' = this click started the dance. */
export function pokeIsaac(state: IsaacDanceState, now: number): IsaacPoke {
  if (isIsaacDancing(state, now)) return 'dancing';
  if (now - state.lastClickAt > ISAAC_CLICK_RESET_SEC) state.clicks = 0;
  state.clicks += 1;
  state.lastClickAt = now;
  if (state.clicks < ISAAC_CLICKS_TO_DANCE) return 'count';
  state.clicks = 0;
  state.danceStartedAt = now;
  return 'dance';
}

export function isIsaacDancing(state: IsaacDanceState, now: number): boolean {
  return state.danceStartedAt !== null && now - state.danceStartedAt < ISAAC_DANCE_SEC;
}

/** Dance step counter while dancing (changes every ISAAC_DANCE_STEP_SEC), null otherwise. */
export function isaacDanceFrame(state: IsaacDanceState, now: number): number | null {
  if (!isIsaacDancing(state, now)) return null;
  return Math.floor((now - (state.danceStartedAt as number)) / ISAAC_DANCE_STEP_SEC);
}

/** How the dancing sprite sits relative to the crying one: a hop every other
 *  step and a turn (mirror) every four. */
export function isaacDancePose(frame: number): { dy: number; mirrored: boolean } {
  return { dy: frame % 2 === 1 ? -1 : 0, mirrored: frame % 4 >= 2 };
}

const variants = new WeakMap<SpriteData, Map<number, SpriteData>>();

/**
 * The crying sprite with a pink afro grown ISAAC_AFRO_ROWS px above it and
 * ISAAC_AFRO_SIDE px to each side (the afro sways one px side to side with the
 * step) and round dark glasses over the eyes. The result is bigger than the base,
 * so the caller raises `y` by ISAAC_AFRO_ROWS and moves `x` left by ISAAC_AFRO_SIDE.
 */
export function isaacDanceSprite(base: SpriteData, frame: number): SpriteData {
  const sway = frame % 4 < 2 ? 0 : 1;
  let cache = variants.get(base);
  if (!cache) {
    cache = new Map();
    variants.set(base, cache);
  }
  const hit = cache.get(sway);
  if (hit) return hit;

  const baseWidth = base[0]?.length ?? 0;
  const width = baseWidth + 2 * ISAAC_AFRO_SIDE;
  const pad = (): string[] => Array.from({ length: ISAAC_AFRO_SIDE }, () => '');
  const blank = (): string[] => Array.from({ length: width }, () => '');
  const sprite: SpriteData = [
    ...Array.from({ length: ISAAC_AFRO_ROWS }, blank),
    ...base.map((row) => [...pad(), ...row, ...pad()]),
  ];
  const headTop = ISAAC_AFRO_ROWS;
  // Afro: a round puff over the skull that hangs down both sides of the face.
  const cx = (width - 1) / 2 + sway;
  const cy = headTop + ISAAC_HAIRLINE_ROW;
  const rx = width / 2 - 0.5;
  const ry = ISAAC_AFRO_ROWS + ISAAC_HAIRLINE_ROW + 0.5;
  const puff = (x: number, y: number): boolean => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  const faceHalfWidth = baseWidth / 2 - ISAAC_AFRO_SIDE - 1;
  for (let y = 0; y < sprite.length; y++) {
    for (let x = 0; x < width; x++) {
      if (!puff(x, y)) continue;
      // Below the hairline only the sides are hair: the face shows through
      if (y >= cy && Math.abs(x - cx) < faceHalfWidth) continue;
      const edge = !puff(x - 1, y) || !puff(x + 1, y) || !puff(x, y - 1) || !puff(x, y + 1);
      const curl = (x + y + sway) % 3 === 0;
      sprite[y][x] = edge ? ISAAC_AFRO_DARK : curl ? ISAAC_AFRO_LIGHT : ISAAC_AFRO_PINK;
    }
  }
  // Glasses: two lenses, a bridge between them, a glint on each.
  const [y0, y1] = ISAAC_GLASSES_ROWS;
  for (const [x0, x1] of ISAAC_GLASSES_LENSES) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const row = sprite[headTop + y];
        if (row) row[ISAAC_AFRO_SIDE + x] = ISAAC_GLASSES_COLOR;
      }
    }
    sprite[headTop + y0][ISAAC_AFRO_SIDE + x0] = ISAAC_GLASSES_GLINT;
  }
  const bridgeRow = sprite[headTop + y0];
  for (let x = ISAAC_GLASSES_LENSES[0][1] + 1; x < ISAAC_GLASSES_LENSES[1][0]; x++) {
    if (bridgeRow && bridgeRow[ISAAC_AFRO_SIDE + x] !== '') {
      bridgeRow[ISAAC_AFRO_SIDE + x] = ISAAC_GLASSES_COLOR;
    }
  }
  cache.set(sway, sprite);
  return sprite;
}
