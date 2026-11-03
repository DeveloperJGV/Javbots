import type { UsageLimit } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import { officesStore } from '../../../webview-ui/src/offices.js';
import {
  USAGE_COLOR_DANGER,
  USAGE_COLOR_EMPTY,
  USAGE_COLOR_OK,
  USAGE_COLOR_UNKNOWN,
  USAGE_COLOR_WARN,
  USAGE_METER_BARS,
  USAGE_METER_TYPE,
} from './constants.js';
import type { UsageState } from './usageStore.js';
import {
  mainProfile,
  officeUsage,
  spotlightLimit,
  type UsageLevel,
  usageLevel,
} from './usageText.js';

const LEVEL_COLOR: Record<UsageLevel, string> = {
  ok: USAGE_COLOR_OK,
  warn: USAGE_COLOR_WARN,
  danger: USAGE_COLOR_DANGER,
};

const baseType = (type: string | undefined): string => (type ?? '').split(':')[0];

/** Whether a furniture instance is the usage meter (a click on it opens the detail). */
export function isUsageMeter(f: FurnitureInstance): boolean {
  return baseType(f.type) === USAGE_METER_TYPE;
}

/** Filled rows of a bar `h` tall: at least one when anything is used, so a little still shows. */
export function filledRows(pct: number, h: number): number {
  if (pct <= 0) return 0;
  return Math.max(1, Math.min(h, Math.round((pct / 100) * h)));
}

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();

/** The meter with its three bars (5 hours, week, Fable) filled from the bottom; unknown limits stay dark. */
export function meterSprite(
  sprite: SpriteData,
  limits: readonly (UsageLimit | undefined)[],
): SpriteData {
  const key = limits.map((l) => (l ? Math.round(l.pct) : '-')).join('/');
  let byKey = cache.get(sprite);
  if (!byKey) {
    byKey = new Map();
    cache.set(sprite, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const out = sprite.map((row) => row.slice());
  USAGE_METER_BARS.forEach((bar, i) => {
    const limit = limits[i];
    const filled = limit ? filledRows(limit.pct, bar.h) : 0;
    const color = limit ? LEVEL_COLOR[usageLevel(limit.pct)] : USAGE_COLOR_EMPTY;
    for (let dy = 0; dy < bar.h; dy++) {
      const row = out[bar.y + dy];
      if (!row) continue;
      const lit = dy >= bar.h - filled;
      for (let dx = 0; dx < bar.w && bar.x + dx < row.length; dx++) {
        row[bar.x + dx] = lit ? color : USAGE_COLOR_EMPTY;
      }
    }
    // Nothing known yet: a dim line across the middle says "no data", not "0 %"
    if (!limit) {
      const row = out[bar.y + Math.floor(bar.h / 2)];
      if (row) for (let dx = 0; dx < bar.w; dx++) row[bar.x + dx] = USAGE_COLOR_UNKNOWN;
    }
  });
  byKey.set(key, out);
  return out;
}

/** Every usage meter in the office shows the main profile's limits. */
export function applyUsageFurniture(
  instances: FurnitureInstance[],
  state: UsageState,
): FurnitureInstance[] {
  if (!instances.some(isUsageMeter)) return instances;
  const { current, offices } = officesStore.get();
  const here = state.profiles ? officeUsage(state.profiles, current, offices) : undefined;
  const main = here ? mainProfile(here.profiles, here.preferred) : undefined;
  const limits = [main?.fiveHour, main?.sevenDay, spotlightLimit(main)];
  return instances.map((f) =>
    isUsageMeter(f) ? { ...f, sprite: meterSprite(f.sprite, limits) } : f,
  );
}
