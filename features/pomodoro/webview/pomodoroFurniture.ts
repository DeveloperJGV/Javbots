import type { PomodoroStatus } from '../../../core/src/messages.js';
import {
  digitalClockSprite,
  getAmbientSpec,
} from '../../../webview-ui/src/office/effects/ambientFurniture.js';
import { getCatalogEntry } from '../../../webview-ui/src/office/layout/furnitureCatalog.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  BREAK_SIGN_OFF_TYPE,
  BREAK_SIGN_TYPE,
  FOCUS_LAMP_OFF_TYPE,
  FOCUS_LAMP_ON_TYPE,
  HOURGLASS_BIG_TYPE,
  HOURGLASS_GRAIN_COLOR,
  HOURGLASS_GRAIN_PATH,
  HOURGLASS_GRAIN_STEP_SEC,
  POMODORO_CLOCK_TYPE,
} from './constants.js';
import { minutesSeconds, remainingMs } from './pomodoroText.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];

const grainCache = new WeakMap<SpriteData, SpriteData[]>();

/** The hourglass with its grain at step `step` of the path (painted only inside the glass). */
export function hourglassSprite(sprite: SpriteData, step: number): SpriteData {
  if (step < 0 || step >= HOURGLASS_GRAIN_PATH.length) return sprite;
  let variants = grainCache.get(sprite);
  if (!variants) {
    variants = HOURGLASS_GRAIN_PATH.map(([x, y]) => {
      const out = sprite.map((row) => row.slice());
      if (out[y]?.[x]) out[y][x] = HOURGLASS_GRAIN_COLOR;
      return out;
    });
    grainCache.set(sprite, variants);
  }
  return variants[step];
}

/**
 * The pomodoro corner follows the timer: the tomato wall clock counts down MM:SS (minutes on top, seconds below)
 * while a block runs or is paused; the DESCANSO sign is lit only during a break; the focus lamp (if placed) is on
 * during focus; a grain of sand falls through the big hourglass while focus runs. Idle, everything looks as drawn
 * (the clock keeps showing the time). Runs after the ambient step, so it paints over the time.
 */
export function applyPomodoroFurniture(
  instances: FurnitureInstance[],
  status: PomodoroStatus | undefined,
  timeSec: number,
  nowMs: number = Date.now(),
): FurnitureInstance[] {
  const phase = status?.phase ?? 'idle';
  const onBreak = phase === 'short' || phase === 'long';
  const focusRunning = phase === 'focus' && status?.running === true;
  return instances.map((f) => {
    const type = baseType(f.type);
    if (type === POMODORO_CLOCK_TYPE && status && phase !== 'idle') {
      const spec = getAmbientSpec(POMODORO_CLOCK_TYPE);
      if (spec?.kind !== 'digital') return f;
      const { minutes, seconds } = minutesSeconds(remainingMs(status, nowMs));
      return { ...f, sprite: digitalClockSprite(f.sprite, spec, minutes, seconds, true) };
    }
    if (type === BREAK_SIGN_TYPE && !onBreak) {
      const off = getCatalogEntry(BREAK_SIGN_OFF_TYPE)?.sprite;
      return off ? { ...f, sprite: off } : f;
    }
    if (type === FOCUS_LAMP_OFF_TYPE && phase === 'focus') {
      const on = getCatalogEntry(FOCUS_LAMP_ON_TYPE)?.sprite;
      return on ? { ...f, sprite: on } : f;
    }
    if (type === HOURGLASS_BIG_TYPE && focusRunning) {
      const step =
        Math.floor(timeSec / HOURGLASS_GRAIN_STEP_SEC) % (HOURGLASS_GRAIN_PATH.length + 1);
      const sprite = hourglassSprite(f.sprite, step);
      return sprite === f.sprite ? f : { ...f, sprite };
    }
    return f;
  });
}
