import type { DayNightMode } from '../../../../core/src/messages.js';
import {
  DAY_NIGHT_REFRESH_SEC,
  IDLE_SCREEN_LIGHT_INTENSITY,
  IDLE_SCREEN_LIGHT_RADIUS_PX,
  LAMP_LIGHT_COLOR,
  LAMP_LIGHT_INTENSITY,
  LAMP_LIGHT_RADIUS_PX,
  LIGHT_LEVELS,
  LIGHT_TINT_ALPHA,
  MOON_BEAM_HALF_WIDTH_BOTTOM_PX,
  MOON_BEAM_HALF_WIDTH_TOP_PX,
  MOON_BEAM_INTENSITY,
  MOON_BEAM_LENGTH_PX,
  MOON_BEAM_SKEW,
  MOON_LIGHT_COLOR,
  MOONSTONE_LIGHT_COLOR,
  MOONSTONE_LIGHT_INTENSITY,
  MOONSTONE_LIGHT_RADIUS_PX,
  SCREEN_LIGHT_COLOR,
  SCREEN_LIGHT_INTENSITY,
  SCREEN_LIGHT_RADIUS_PX,
} from '../../constants.js';
import type { Character, FurnitureInstance } from '../types.js';
import { CharacterState, Direction } from '../types.js';
import type { Ambient, Rgb } from './dayNight.js';
import { ambientFor, hexToRgb } from './dayNight.js';

/**
 * Day/night tint with light pools, computed at sprite-pixel resolution and
 * scaled up nearest-neighbour, so it is pixelated like everything else:
 * light falls off in LIGHT_LEVELS hard bands, blended by a 4×4 ordered
 * dither. The map is recomputed only when the ambient or the light set
 * changes, never per frame.
 */

export interface LightSource {
  /** Center (or, for a beam, the middle of its top edge), in sprite px (map space). */
  x: number;
  y: number;
  radius: number;
  intensity: number;
  color: Rgb;
  /** A slanted beam falling down from (x, y) instead of a round pool. */
  beam?: { length: number; halfTop: number; halfBottom: number; skew: number };
}

const SCREEN_RGB = hexToRgb(SCREEN_LIGHT_COLOR);
const LAMP_RGB = hexToRgb(LAMP_LIGHT_COLOR);
const MOON_RGB = hexToRgb(MOON_LIGHT_COLOR);
const MOONSTONE_RGB = hexToRgb(MOONSTONE_LIGHT_COLOR);

/** Strength (0–1) of a light at a map pixel center. */
export function lightStrengthAt(l: LightSource, wx: number, wy: number): number {
  if (l.beam) {
    const down = wy - l.y;
    if (down < 0 || down > l.beam.length) return 0;
    const t = down / l.beam.length;
    const half = l.beam.halfTop + (l.beam.halfBottom - l.beam.halfTop) * t;
    const across = Math.abs(wx - (l.x + down * l.beam.skew));
    if (across > half) return 0;
    return (1 - t) * (1 - 0.4 * (across / half)) * l.intensity;
  }
  const d = Math.hypot(wx - l.x, wy - l.y);
  return d >= l.radius ? 0 : (1 - d / l.radius) * l.intensity;
}

/** Map-space bounding box a light can reach: [x0, y0, x1, y1]. */
function lightBounds(l: LightSource): [number, number, number, number] {
  if (l.beam) {
    const endX = l.x + l.beam.length * l.beam.skew;
    const reach = Math.max(l.beam.halfTop, l.beam.halfBottom);
    return [Math.min(l.x, endX) - reach, l.y, Math.max(l.x, endX) + reach, l.y + l.beam.length];
  }
  return [l.x - l.radius, l.y - l.radius, l.x + l.radius, l.y + l.radius];
}

/** Furniture that glows, and where its light comes from (sprite px from the top-left). */
const LAMP_SPECS: Record<string, { x: number; y: number }> = {
  LAMP: { x: 8, y: 12 },
};

function baseType(type: string): string {
  const colon = type.indexOf(':');
  return colon < 0 ? type : type.slice(0, colon);
}

const FACING: Record<number, [number, number]> = {
  [Direction.DOWN]: [0, 1],
  [Direction.UP]: [0, -1],
  [Direction.LEFT]: [-1, 0],
  [Direction.RIGHT]: [1, 0],
};

/** Every light in the office right now: a strong screen glow in front of each
 *  agent working at its desk, a faint one on every other screen, lamps, and
 *  moonlight through the windows (only once it is properly dark outside). */
export function collectLights(
  characters: Iterable<Character>,
  furniture: FurnitureInstance[],
  moonlight = 1,
): LightSource[] {
  const lights: LightSource[] = [];
  for (const ch of characters) {
    if (ch.matrixEffect || !ch.isActive || ch.state !== CharacterState.TYPE) continue;
    const [dx, dy] = FACING[ch.dir] ?? [0, 1];
    lights.push({
      x: ch.x + dx * 10,
      y: ch.y + dy * 10 - 4,
      radius: SCREEN_LIGHT_RADIUS_PX,
      intensity: SCREEN_LIGHT_INTENSITY,
      color: SCREEN_RGB,
    });
  }
  for (const f of furniture) {
    if (!f.type) continue;
    const type = baseType(f.type);
    const w = f.sprite[0]?.length ?? 0;
    if (type.startsWith('PC_')) {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 8,
        radius: IDLE_SCREEN_LIGHT_RADIUS_PX,
        intensity: IDLE_SCREEN_LIGHT_INTENSITY,
        color: SCREEN_RGB,
      });
      continue;
    }
    if (type === 'WINDOW') {
      if (moonlight <= 0) continue;
      lights.push({
        // The beam starts on the floor right under the wall the window hangs on
        x: f.x + w / 2,
        y: f.y + f.sprite.length,
        radius: MOON_BEAM_LENGTH_PX,
        intensity: MOON_BEAM_INTENSITY * moonlight,
        color: MOON_RGB,
        beam: {
          length: MOON_BEAM_LENGTH_PX,
          halfTop: MOON_BEAM_HALF_WIDTH_TOP_PX,
          halfBottom: MOON_BEAM_HALF_WIDTH_BOTTOM_PX,
          skew: MOON_BEAM_SKEW,
        },
      });
      continue;
    }
    if (type === 'MOONSTONES') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 10,
        radius: MOONSTONE_LIGHT_RADIUS_PX,
        intensity: MOONSTONE_LIGHT_INTENSITY,
        color: MOONSTONE_RGB,
      });
      continue;
    }
    const spec = LAMP_SPECS[type];
    if (!spec) continue;
    lights.push({
      x: f.x + (f.mirrored ? w - 1 - spec.x : spec.x),
      y: f.y + spec.y,
      radius: LAMP_LIGHT_RADIUS_PX,
      intensity: LAMP_LIGHT_INTENSITY,
      color: LAMP_RGB,
    });
  }
  return lights;
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

/** Quantize a 0–1 light value into LIGHT_LEVELS bands, dithered at band edges. */
export function quantizeLight(value: number, x: number, y: number): number {
  const steps = LIGHT_LEVELS - 1;
  const q = Math.min(1, Math.max(0, value)) * steps;
  const base = Math.floor(q);
  const frac = q - base;
  const level = base + (frac > BAYER_4[y & 3][x & 3] ? 1 : 0);
  return Math.min(steps, level) / steps;
}

/**
 * RGBA lightmap for a width×height area of the map (sprite px). `isVoid`
 * marks pixels outside the office, which stay untouched.
 */
export function computeLightmap(
  width: number,
  height: number,
  originY: number,
  ambient: Ambient,
  lights: LightSource[],
  isVoid: (x: number, y: number) => boolean,
): Uint8ClampedArray<ArrayBuffer> {
  const n = width * height;
  const light = new Float32Array(n);
  const tintR = new Float32Array(n);
  const tintG = new Float32Array(n);
  const tintB = new Float32Array(n);
  const weight = new Float32Array(n);

  if (ambient.lights > 0) {
    for (const l of lights) {
      const [bx0, by0, bx1, by1] = lightBounds(l);
      const x0 = Math.max(0, Math.floor(bx0));
      const x1 = Math.min(width - 1, Math.ceil(bx1));
      const y0 = Math.max(0, Math.floor(by0 - originY));
      const y1 = Math.min(height - 1, Math.ceil(by1 - originY));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const f = lightStrengthAt(l, px + 0.5, py + originY + 0.5);
          if (f <= 0) continue;
          const i = py * width + px;
          // Screen-blend overlapping pools so they never exceed full light
          light[i] = 1 - (1 - light[i]) * (1 - f);
          tintR[i] += l.color[0] * f;
          tintG[i] += l.color[1] * f;
          tintB[i] += l.color[2] * f;
          weight[i] += f;
        }
      }
    }
  }

  const out = new Uint8ClampedArray(new ArrayBuffer(n * 4));
  const [ar, ag, ab] = ambient.color;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      if (isVoid(px, py + originY)) continue;
      const raw = light[i];
      const lit = raw > 0 ? quantizeLight(raw, px, py) * ambient.lights : 0;
      const dark = ambient.alpha * (1 - lit);
      const tint = lit * LIGHT_TINT_ALPHA;
      const total = dark + tint;
      if (total <= 0) continue;
      let r = ar;
      let g = ag;
      let b = ab;
      if (tint > 0) {
        // Light color at this pixel: the pools' colors weighted by their strength
        const lr = tintR[i] / weight[i];
        const lg = tintG[i] / weight[i];
        const lb = tintB[i] / weight[i];
        r = (ar * dark + lr * tint) / total;
        g = (ag * dark + lg * tint) / total;
        b = (ab * dark + lb * tint) / total;
      }
      const o = i * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = Math.min(1, total) * 255;
    }
  }
  return out;
}

// ── Renderer glue ──────────────────────────────────────────────

let cachedAmbient: { mode: DayNightMode; at: number; ambient: Ambient } | null = null;

/** How much moonlight comes in: none by day or at dusk, full at night. */
export function moonlightFor(ambient: Ambient): number {
  return Math.max(0, Math.min(1, (ambient.lights - 0.6) / 0.4));
}

/** Current ambient, re-read from the clock every DAY_NIGHT_REFRESH_SEC. */
export function currentAmbient(mode: DayNightMode, nowMs = Date.now()): Ambient {
  if (
    !cachedAmbient ||
    cachedAmbient.mode !== mode ||
    nowMs - cachedAmbient.at > DAY_NIGHT_REFRESH_SEC * 1000
  ) {
    cachedAmbient = { mode, at: nowMs, ambient: ambientFor(mode, new Date(nowMs)) };
  }
  return cachedAmbient.ambient;
}
