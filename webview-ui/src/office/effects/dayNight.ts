import type { DayNightMode } from '../../../../core/src/messages.js';
import {
  DAWN_TINT_ALPHA,
  DAWN_TINT_COLOR,
  DAY_TINT_COLOR,
  DUSK_TINT_ALPHA,
  DUSK_TINT_COLOR,
  NIGHT_TINT_ALPHA,
  NIGHT_TINT_COLOR,
} from '../../constants.js';

/**
 * Ambient light over the office for a time of day. Pure: the renderer asks
 * for the current moment, tests pass any Date.
 */

export type Rgb = [number, number, number];

export interface Ambient {
  /** Tint drawn over the scene. */
  color: Rgb;
  /** Strength of that tint (0 = untouched daylight). */
  alpha: number;
  /** How much lamps and screens light up (0 by day, 1 at night). */
  lights: number;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

interface Keyframe {
  /** Hour of the day, 0–24. */
  hour: number;
  ambient: Ambient;
}

const NIGHT: Ambient = { color: hexToRgb(NIGHT_TINT_COLOR), alpha: NIGHT_TINT_ALPHA, lights: 1 };
const DAY: Ambient = { color: hexToRgb(DAY_TINT_COLOR), alpha: 0, lights: 0 };
const DAWN: Ambient = { color: hexToRgb(DAWN_TINT_COLOR), alpha: DAWN_TINT_ALPHA, lights: 0.5 };
const DUSK: Ambient = { color: hexToRgb(DUSK_TINT_COLOR), alpha: DUSK_TINT_ALPHA, lights: 0.6 };

/** Night until 5:30, dawn at 6:30, full day 8:00–17:30, dusk at 18:45, night from 20:00. */
const KEYFRAMES: Keyframe[] = [
  { hour: 0, ambient: NIGHT },
  { hour: 5.5, ambient: NIGHT },
  { hour: 6.5, ambient: DAWN },
  { hour: 8, ambient: DAY },
  { hour: 17.5, ambient: DAY },
  { hour: 18.75, ambient: DUSK },
  { hour: 20, ambient: NIGHT },
  { hour: 24, ambient: NIGHT },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Blend two ambients. The color fades toward whichever side has the tint, so
 *  day (alpha 0) → dusk doesn't pass through a white wash. */
function mix(a: Ambient, b: Ambient, t: number): Ambient {
  const colorT = a.alpha + b.alpha === 0 ? t : (b.alpha * t) / (a.alpha * (1 - t) + b.alpha * t);
  return {
    color: [
      Math.round(lerp(a.color[0], b.color[0], colorT)),
      Math.round(lerp(a.color[1], b.color[1], colorT)),
      Math.round(lerp(a.color[2], b.color[2], colorT)),
    ],
    alpha: lerp(a.alpha, b.alpha, t),
    lights: lerp(a.lights, b.lights, t),
  };
}

export function ambientForHour(hour: number): Ambient {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (h >= a.hour && h <= b.hour) {
      const t = b.hour === a.hour ? 0 : (h - a.hour) / (b.hour - a.hour);
      return mix(a.ambient, b.ambient, t);
    }
  }
  return NIGHT;
}

export function ambientFor(mode: DayNightMode, now: Date): Ambient {
  if (mode === 'day') return DAY;
  if (mode === 'night') return NIGHT;
  return ambientForHour(now.getHours() + now.getMinutes() / 60);
}
