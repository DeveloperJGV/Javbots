import {
  FURNITURE_SHADOW_BASE_ROWS,
  SHADOW_CORE_COLOR,
  SHADOW_EDGE_COLOR,
  WALL_SHADOW_COLOR,
  WALL_SHADOW_SOFT_COLOR,
} from '../../constants.js';
import { isSeated } from '../engine/posture.js';
import type { Character, SpriteData } from '../types.js';
import { TILE_SIZE } from '../types.js';

/**
 * Pixel-art drop shadows, drawn on the floor BEFORE the z-sorted scene so
 * anything standing in front of a shadow covers it. Light comes from the
 * top-left: furniture shadows fall one pixel to the right and below the base.
 */

// ── Sprite builders (pure, DOM-free) ───────────────────────────

const ellipseCache = new Map<number, SpriteData>();

/** A 3-row pixel ellipse: soft rim, darker core. */
export function ellipseShadowSprite(width: number): SpriteData {
  const cached = ellipseCache.get(width);
  if (cached) return cached;
  const row = (inset: number, rim: boolean): string[] =>
    Array.from({ length: width }, (_, x) => {
      if (x < inset || x >= width - inset) return '';
      if (rim) return SHADOW_EDGE_COLOR;
      return x === inset || x === width - inset - 1 ? SHADOW_EDGE_COLOR : SHADOW_CORE_COLOR;
    });
  const sprite = [row(2, true), row(0, false), row(2, true)];
  ellipseCache.set(width, sprite);
  return sprite;
}

export interface FurnitureShadow {
  sprite: SpriteData;
  /** Offset of the shadow's top-left from the furniture sprite's top-left, in sprite px. */
  dx: number;
  dy: number;
}

const furnitureShadowCache = new WeakMap<SpriteData, FurnitureShadow | null>();
const mirroredShadowCache = new WeakMap<SpriteData, FurnitureShadow | null>();

/**
 * Contact shadow under a furniture sprite's base: as wide as the bottom
 * FURNITURE_SHADOW_BASE_ROWS rows, shifted one pixel right, two rows showing
 * below the base. Null for a fully transparent sprite.
 */
export function furnitureShadowFor(sprite: SpriteData, mirrored = false): FurnitureShadow | null {
  const cache = mirrored ? mirroredShadowCache : furnitureShadowCache;
  const hit = cache.get(sprite);
  if (hit !== undefined) return hit;

  const h = sprite.length;
  const w = h > 0 ? sprite[0].length : 0;
  let bottom = -1;
  for (let r = h - 1; r >= 0 && bottom < 0; r--) {
    if (sprite[r].some((px) => px !== '')) bottom = r;
  }
  if (bottom < 0) {
    cache.set(sprite, null);
    return null;
  }
  let minX = w;
  let maxX = -1;
  for (let r = Math.max(0, bottom - FURNITURE_SHADOW_BASE_ROWS + 1); r <= bottom; r++) {
    for (let c = 0; c < w; c++) {
      if (sprite[r][c] === '') continue;
      if (c < minX) minX = c;
      if (c > maxX) maxX = c;
    }
  }
  if (mirrored) {
    [minX, maxX] = [w - 1 - maxX, w - 1 - minX];
  }

  const width = maxX - minX + 2;
  const rows: SpriteData = [];
  for (let r = 0; r < 3; r++) {
    rows.push(
      Array.from({ length: width }, (_, x) => {
        if (r === 2) return x >= 1 && x < width - 1 ? SHADOW_EDGE_COLOR : '';
        if (x === 0) return '';
        if (r === 1 && x === width - 1) return SHADOW_EDGE_COLOR;
        return SHADOW_CORE_COLOR;
      }),
    );
  }
  const shadow: FurnitureShadow = { sprite: rows, dx: minX, dy: bottom };
  cache.set(sprite, shadow);
  return shadow;
}

/** Strip darkening the top of a floor tile that sits right under a wall. */
export const WALL_BASE_SHADOW: SpriteData = [
  new Array<string>(TILE_SIZE).fill(WALL_SHADOW_COLOR),
  new Array<string>(TILE_SIZE).fill(WALL_SHADOW_SOFT_COLOR),
  Array.from({ length: TILE_SIZE }, (_, x) => (x % 2 === 0 ? WALL_SHADOW_SOFT_COLOR : '')),
];

/** Whether a character casts its own shadow (seated ones sit on the chair's). */
export function characterCastsShadow(ch: Character): boolean {
  if (ch.matrixEffect) return false;
  if (!isSeated(ch)) return true;
  return ch.seatId === null && !ch.zoneSpot?.seatUid;
}
