import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import type { AccesosStatusView } from './accesosStore.js';
import { candleState } from './accesosText.js';
import {
  ACCESOS_FLAME_A,
  ACCESOS_FLAME_B,
  ACCESOS_FLAME_GLOW,
  ACCESOS_TABLE_TYPE,
  type FlamePixel,
  FLICKER_PATTERN,
  FLICKER_STEP_SEC,
  SPUTTER_STEP_SEC,
} from './constants.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];
/** Lit sprites per base sprite and frame (the table's sprite only changes with its color). */
const cache = new WeakMap<SpriteData, SpriteData[]>();

/** The table with the candle lit: frame 0 the tall flame, 1 the short one. Glow only over transparent pixels. */
export function candleLitSprite(base: SpriteData, frame: 0 | 1): SpriteData {
  const out = base.map((row) => [...row]);
  const paint = (pixels: readonly FlamePixel[], onlyEmpty: boolean) => {
    for (const [x, y, color] of pixels) {
      if (!out[y] || x >= out[y].length) continue;
      if (onlyEmpty && out[y][x]) continue;
      out[y][x] = color;
    }
  };
  paint(ACCESOS_FLAME_GLOW, true);
  paint(frame === 0 ? ACCESOS_FLAME_A : ACCESOS_FLAME_B, false);
  return out;
}

function litFrame(base: SpriteData, frame: 0 | 1): SpriteData {
  let frames = cache.get(base);
  if (!frames) {
    frames = [candleLitSprite(base, 0), candleLitSprite(base, 1)];
    cache.set(base, frames);
  }
  return frames[frame];
}

/**
 * The candle on the map table (features/accesos): it burns, flickering, while one of the pages answers, and
 * sputters while one is being started. The layout keeps the plain table.
 */
export function applyAccesosFurniture(
  instances: FurnitureInstance[],
  status: AccesosStatusView | undefined,
  timeSec: number,
): FurnitureInstance[] {
  const candle = candleState(status);
  if (candle === 'out') return instances;
  let frame: 0 | 1;
  if (candle === 'sputter') {
    if (Math.floor(timeSec / SPUTTER_STEP_SEC) % 2 === 1) return instances;
    frame = 1;
  } else {
    const step = Math.floor(timeSec / FLICKER_STEP_SEC);
    frame = FLICKER_PATTERN[step % FLICKER_PATTERN.length] === 1 ? 1 : 0;
  }
  if (!instances.some((f) => baseType(f.type) === ACCESOS_TABLE_TYPE)) return instances;
  return instances.map((f) =>
    baseType(f.type) === ACCESOS_TABLE_TYPE ? { ...f, sprite: litFrame(f.sprite, frame) } : f,
  );
}
