import { BOARD_AREA, BOARD_MARK_ROWS, BOARD_MARK_START_X, BOARD_WHITE } from '../../constants.js';
import type { SpriteData } from '../types.js';
import type { BoardMark } from './activityLog.js';

/**
 * The hallway whiteboard with the activity marks: its writing area wiped clean
 * and one marker line per agent (a color dot, then a line that grows with its
 * work). With no activity yet it keeps its original scribbles. Variants are
 * cached, so the same marks give the same sprite object (the sprite cache is
 * keyed by object).
 */

const variants = new WeakMap<SpriteData, Map<string, SpriteData>>();

export function boardSprite(base: SpriteData, marks: readonly BoardMark[]): SpriteData {
  if (marks.length === 0) return base;
  const key = marks.map((m) => `${m.color}:${m.length}`).join('|');
  let cache = variants.get(base);
  if (!cache) {
    cache = new Map();
    variants.set(base, cache);
  }
  const hit = cache.get(key);
  if (hit) return hit;

  const sprite = base.map((row) => [...row]);
  const { x0, y0, x1, y1 } = BOARD_AREA;
  for (let y = y0; y <= y1 && y < sprite.length; y++) {
    for (let x = x0; x <= x1 && x < sprite[y].length; x++) sprite[y][x] = BOARD_WHITE;
  }
  marks.forEach((m, i) => {
    const y = BOARD_MARK_ROWS[i];
    if (y === undefined || !sprite[y]) return;
    sprite[y][x0 + 1] = m.color;
    for (let x = BOARD_MARK_START_X; x < BOARD_MARK_START_X + m.length && x <= x1; x++) {
      sprite[y][x] = m.color;
    }
  });
  cache.set(key, sprite);
  return sprite;
}
