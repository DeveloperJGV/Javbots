import type { DayNightMode } from '../../../../core/src/messages.js';
import {
  DAY_NIGHT_REFRESH_SEC,
  FIRE_LIGHT_COLOR,
  FIRE_LIGHT_INTENSITY,
  FIRE_LIGHT_RADIUS_PX,
  FLUX_LIGHT_COLOR,
  FLUX_LIGHT_INTENSITY,
  FLUX_LIGHT_RADIUS_PX,
  IDLE_SCREEN_LIGHT_INTENSITY,
  IDLE_SCREEN_LIGHT_RADIUS_PX,
  JEDI_LIGHT_COLOR,
  JEDI_LIGHT_INTENSITY,
  JEDI_LIGHT_RADIUS_PX,
  LAMP_LIGHT_COLOR,
  LAMP_LIGHT_INTENSITY,
  LAMP_LIGHT_RADIUS_PX,
  LAVA_LIGHT_COLOR,
  LAVA_LIGHT_INTENSITY,
  LAVA_LIGHT_RADIUS_PX,
  LIGHT_LEVELS,
  LIGHT_TINT_ALPHA,
  MATRIX_LIGHT_COLOR,
  MATRIX_LIGHT_INTENSITY,
  MATRIX_LIGHT_RADIUS_PX,
  MOON_BEAM_HALF_WIDTH_BOTTOM_PX,
  MOON_BEAM_HALF_WIDTH_TOP_PX,
  MOON_BEAM_INTENSITY,
  MOON_BEAM_LENGTH_PX,
  MOON_BEAM_SKEW,
  MOON_LIGHT_COLOR,
  MOONSTONE_LIGHT_COLOR,
  MOONSTONE_LIGHT_INTENSITY,
  MOONSTONE_LIGHT_RADIUS_PX,
  NEON_LIGHT_COLOR,
  NEON_LIGHT_INTENSITY,
  NEON_LIGHT_RADIUS_PX,
  PET_LIGHT_COLOR,
  PET_LIGHT_INTENSITY,
  PET_LIGHT_RADIUS_PX,
  PORTAL_BLUE_LIGHT_COLOR,
  PORTAL_LIGHT_INTENSITY,
  PORTAL_LIGHT_RADIUS_PX,
  PORTAL_ORANGE_LIGHT_COLOR,
  RING_LIGHT_COLOR,
  RING_LIGHT_INTENSITY,
  RING_LIGHT_RADIUS_PX,
  SCREEN_LIGHT_COLOR,
  SCREEN_LIGHT_INTENSITY,
  SCREEN_LIGHT_RADIUS_PX,
  TELEPORT_BEAM_HEIGHT_PX,
  TELEPORT_LIGHT_COLOR,
  TELEPORT_LIGHT_INTENSITY,
  TELEPORT_LIGHT_RADIUS_PX,
  TRON_LIGHT_COLOR,
  TRON_LIGHT_INTENSITY,
  TRON_LIGHT_RADIUS_PX,
  WORK_LIGHT_COLOR,
  WORK_LIGHT_INTENSITY,
  WORK_LIGHT_RADIUS_PX,
} from '../../constants.js';
import { getPetLightColor } from '../sprites/petSpriteData.js';
import type { Character, FurnitureInstance, Pet } from '../types.js';
import { CharacterState, Direction } from '../types.js';
import type { Ambient, Rgb } from './dayNight.js';
import { ambientFor, hexToRgb } from './dayNight.js';
import type { TeleportBeam } from './particles.js';
import { beamStrength } from './particles.js';

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
const FLUX_RGB = hexToRgb(FLUX_LIGHT_COLOR);
const RING_RGB = hexToRgb(RING_LIGHT_COLOR);
const FIRE_RGB = hexToRgb(FIRE_LIGHT_COLOR);
const JEDI_RGB = hexToRgb(JEDI_LIGHT_COLOR);
const NEON_RGB = hexToRgb(NEON_LIGHT_COLOR);
const LAVA_RGB = hexToRgb(LAVA_LIGHT_COLOR);
const PET_RGB = hexToRgb(PET_LIGHT_COLOR);
const TELEPORT_RGB = hexToRgb(TELEPORT_LIGHT_COLOR);
/** Wall pieces that glow at night: light center (sprite px) plus color, radius and strength. */
const GLOW_SPECS: Record<string, { y: number; color: Rgb; radius: number; intensity: number }> = {
  TRON_DISC: {
    y: 16,
    color: hexToRgb(TRON_LIGHT_COLOR),
    radius: TRON_LIGHT_RADIUS_PX,
    intensity: TRON_LIGHT_INTENSITY,
  },
  MATRIX_SCREEN: {
    y: 16,
    color: hexToRgb(MATRIX_LIGHT_COLOR),
    radius: MATRIX_LIGHT_RADIUS_PX,
    intensity: MATRIX_LIGHT_INTENSITY,
  },
};
const PORTAL_RGB: Record<string, Rgb> = {
  PORTAL_BLUE: hexToRgb(PORTAL_BLUE_LIGHT_COLOR),
  PORTAL_ORANGE: hexToRgb(PORTAL_ORANGE_LIGHT_COLOR),
};
const WORK_RGB = hexToRgb(WORK_LIGHT_COLOR);

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
export function lightBounds(l: LightSource): [number, number, number, number] {
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
  SENKU_BULB: { x: 8, y: 7 },
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

/** The light of each teleporter beam in progress, centered halfway up its column.
 *  It steps down with the column, so the lightmap is rebuilt only a few times per beam. */
export function collectBeamLights(beams: Iterable<TeleportBeam>): LightSource[] {
  const lights: LightSource[] = [];
  for (const b of beams) {
    const strength = beamStrength(b.age);
    if (strength <= 0) continue;
    lights.push({
      x: Math.round(b.x),
      y: Math.round(b.y - TELEPORT_BEAM_HEIGHT_PX / 2),
      radius: TELEPORT_LIGHT_RADIUS_PX,
      intensity: TELEPORT_LIGHT_INTENSITY * strength,
      color: TELEPORT_RGB,
    });
  }
  return lights;
}

/** The small glow each pet carries, so it can be seen walking around at night,
 *  in the color its manifest's `lightColor` asks for (else PET_LIGHT_COLOR).
 *  Kept apart from collectLights: pets move every frame, so the renderer only
 *  recomputes a patch around them instead of the whole lightmap. */
export function collectPetLights(
  pets: Iterable<Pet>,
  colorOf: (petType: number) => string | null = getPetLightColor,
): LightSource[] {
  const lights: LightSource[] = [];
  for (const pet of pets) {
    const custom = colorOf(pet.petType);
    lights.push({
      // Centered on the body (pet.y is the feet)
      x: Math.round(pet.x),
      y: Math.round(pet.y) - 6,
      radius: PET_LIGHT_RADIUS_PX,
      intensity: PET_LIGHT_INTENSITY,
      color: custom ? hexToRgb(custom) : PET_RGB,
    });
  }
  return lights;
}

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
    if (type === 'JEDI_BRAZIER' || type === 'HOLO_TABLE') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 6,
        radius: JEDI_LIGHT_RADIUS_PX,
        intensity: JEDI_LIGHT_INTENSITY,
        color: JEDI_RGB,
      });
      continue;
    }
    if (type === 'BASEMENT_FIRE' || type === 'BASEMENT_TORCH') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + (type === 'BASEMENT_TORCH' ? 8 : 10),
        radius: FIRE_LIGHT_RADIUS_PX,
        intensity: FIRE_LIGHT_INTENSITY,
        color: FIRE_RGB,
      });
      continue;
    }
    if (type === 'RING_PEDESTAL') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 8,
        radius: RING_LIGHT_RADIUS_PX,
        intensity: RING_LIGHT_INTENSITY,
        color: RING_RGB,
      });
      continue;
    }
    if (type === 'FLUX_CAPACITOR') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 14,
        radius: FLUX_LIGHT_RADIUS_PX,
        intensity: FLUX_LIGHT_INTENSITY,
        color: FLUX_RGB,
      });
      continue;
    }
    if (PORTAL_RGB[type]) {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 18,
        radius: PORTAL_LIGHT_RADIUS_PX,
        intensity: PORTAL_LIGHT_INTENSITY,
        color: PORTAL_RGB[type],
      });
      continue;
    }
    const glow = GLOW_SPECS[type];
    if (glow) {
      lights.push({
        x: f.x + w / 2,
        y: f.y + glow.y,
        radius: glow.radius,
        intensity: glow.intensity,
        color: glow.color,
      });
      continue;
    }
    if (type === 'LAVA_LAMP') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 16,
        radius: LAVA_LIGHT_RADIUS_PX,
        intensity: LAVA_LIGHT_INTENSITY,
        color: LAVA_RGB,
      });
      continue;
    }
    if (type === 'NEON_88') {
      lights.push({
        x: f.x + w / 2,
        y: f.y + 8,
        radius: NEON_LIGHT_RADIUS_PX,
        intensity: NEON_LIGHT_INTENSITY,
        color: NEON_RGB,
      });
      continue;
    }
    if (type === 'WORK_LIGHT') {
      lights.push({
        x: f.x + 8,
        y: f.y + 9,
        radius: WORK_LIGHT_RADIUS_PX,
        intensity: WORK_LIGHT_INTENSITY,
        color: WORK_RGB,
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
 * RGBA lightmap for a width×height area of the map (sprite px) whose top-left
 * pixel is (originX, originY). `isVoid` marks pixels outside the office, which
 * stay untouched. Any sub-rectangle comes out identical to the same pixels of
 * the full map (the dither is anchored to map coordinates), so a patch can be
 * pasted over a cached full map.
 */
export function computeLightmap(
  width: number,
  height: number,
  originY: number,
  ambient: Ambient,
  lights: LightSource[],
  isVoid: (x: number, y: number) => boolean,
  originX = 0,
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
      const x0 = Math.max(0, Math.floor(bx0 - originX));
      const x1 = Math.min(width - 1, Math.ceil(bx1 - originX));
      const y0 = Math.max(0, Math.floor(by0 - originY));
      const y1 = Math.min(height - 1, Math.ceil(by1 - originY));
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const f = lightStrengthAt(l, px + originX + 0.5, py + originY + 0.5);
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
      if (isVoid(px + originX, py + originY)) continue;
      const raw = light[i];
      const lit = raw > 0 ? quantizeLight(raw, px + originX, py + originY) * ambient.lights : 0;
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
