import {
  FIRE_FLICKER_FRACTION,
  FIRE_FLICKER_PERIOD_SEC,
  FIRE_FLICKER_SWAPS,
  FLUX_BRIGHT_FRACTION,
  FLUX_CORE,
  FLUX_DIM_CORE,
  FLUX_DIM_GLOW,
  FLUX_GLOW,
  FLUX_PULSE_PERIOD_SEC,
  LAVA_BANDS,
  LAVA_CYCLE_STEP_SEC,
  MATRIX_BANDS,
  MATRIX_CYCLE_STEP_SEC,
  NEON_CORE,
  NEON_DIM_CORE,
  NEON_DIM_GLOW,
  NEON_FLICKER_FRACTION,
  NEON_FLICKER_PERIOD_SEC,
  NEON_GLOW,
  PLANT_SWAY_FOLIAGE_FRACTION,
  PLANT_SWAY_STEP_SEC,
  PORTAL_BLUE_BANDS,
  PORTAL_CYCLE_STEP_SEC,
  PORTAL_ORANGE_BANDS,
  RACK_BLINK_FRACTION,
  RACK_BLINK_PERIOD_SEC,
  RACK_LED_AMBER,
  RACK_LED_AMBER_DIM,
  RACK_LED_GREEN,
  RACK_LED_GREEN_DIM,
  RING_GLINT,
  RING_GLINT_FRACTION,
  RING_GLINT_PERIOD_SEC,
  RING_GLINT_SOFT,
  RING_GOLD,
  RING_GOLD_SOFT,
  STANDBY_LED_COLOR,
  STANDBY_LED_ON_FRACTION,
  STANDBY_LED_PERIOD_SEC,
  TORCH_FLICKER_SWAPS,
  WINDOW_CLOUD,
  WINDOW_DUSK_CLOUD,
  WINDOW_DUSK_LOWER,
  WINDOW_DUSK_UPPER,
  WINDOW_MOON,
  WINDOW_NIGHT_LOWER,
  WINDOW_NIGHT_UPPER,
  WINDOW_SKY_LOWER,
  WINDOW_SKY_UPPER,
  WINDOW_STAR,
} from '../../constants.js';
import type { FurnitureInstance, SpriteData } from '../types.js';
import { TILE_SIZE } from '../types.js';
import type { Ambient } from './dayNight.js';

/**
 * Always-on furniture animation, driven by code on top of the bundled art
 * (which has a single frame for these items). Specs point at pixels of the
 * CURRENT sprites, so they belong to that art: when our own furniture lands
 * (Fase 4) it should bring real frames instead.
 */

type AmbientSpec =
  | {
      kind: 'clock';
      /** Pivot of the hands, in sprite px. */
      cx: number;
      cy: number;
      /** A pixel of the bare face, and one of a hand, to read their colors. */
      face: [number, number];
      hand: [number, number];
      minuteLen: number;
      hourLen: number;
    }
  | { kind: 'sway'; hanging: boolean }
  | { kind: 'led'; x: number; y: number }
  | {
      /** Swap some colors for others during part of a loop (glows, pulses, glints). */
      kind: 'pulse';
      swaps: ReadonlyArray<readonly [string, string]>;
      periodSec: number;
      /** Fraction of the loop, from its start, that shows the swapped colors. */
      swapFraction: number;
    }
  | {
      /** Rotate a ring of colors one step at a time (portal swirls). */
      kind: 'cycle';
      colors: readonly string[];
      stepSec: number;
    }
  | {
      kind: 'window';
      /** Glass rows above this one are the upper pane (where the moon rises). */
      splitY: number;
      /** Pixels that become stars at night. */
      stars: Array<[number, number]>;
    };

const AMBIENT_SPECS: Record<string, AmbientSpec> = {
  CLOCK: { kind: 'clock', cx: 7, cy: 16, face: [5, 16], hand: [7, 14], minuteLen: 3, hourLen: 2 },
  PLANT: { kind: 'sway', hanging: false },
  PLANT_2: { kind: 'sway', hanging: false },
  LARGE_PLANT: { kind: 'sway', hanging: false },
  HANGING_PLANT: { kind: 'sway', hanging: true },
  PC_FRONT_OFF: { kind: 'led', x: 12, y: 12 },
  // Bright as drawn, dim between pulses
  FLUX_CAPACITOR: {
    kind: 'pulse',
    swaps: [
      [FLUX_CORE, FLUX_DIM_CORE],
      [FLUX_GLOW, FLUX_DIM_GLOW],
    ],
    periodSec: FLUX_PULSE_PERIOD_SEC,
    swapFraction: 1 - FLUX_BRIGHT_FRACTION,
  },
  // Flames flicker (fast, desynced only by the global clock: fine at this scale)
  BASEMENT_FIRE: {
    kind: 'pulse',
    swaps: FIRE_FLICKER_SWAPS,
    periodSec: FIRE_FLICKER_PERIOD_SEC,
    swapFraction: FIRE_FLICKER_FRACTION,
  },
  BASEMENT_TORCH: {
    kind: 'pulse',
    swaps: TORCH_FLICKER_SWAPS,
    periodSec: FIRE_FLICKER_PERIOD_SEC,
    swapFraction: FIRE_FLICKER_FRACTION,
  },
  // Plain gold, with a short glint now and then
  RING_PEDESTAL: {
    kind: 'pulse',
    swaps: [
      [RING_GOLD, RING_GLINT],
      [RING_GOLD_SOFT, RING_GLINT_SOFT],
    ],
    periodSec: RING_GLINT_PERIOD_SEC,
    swapFraction: RING_GLINT_FRACTION,
  },
  // Neon "88": on as drawn, a short flicker off now and then
  NEON_88: {
    kind: 'pulse',
    swaps: [
      [NEON_CORE, NEON_DIM_CORE],
      [NEON_GLOW, NEON_DIM_GLOW],
    ],
    periodSec: NEON_FLICKER_PERIOD_SEC,
    swapFraction: NEON_FLICKER_FRACTION,
  },
  LAVA_LAMP: { kind: 'cycle', colors: LAVA_BANDS, stepSec: LAVA_CYCLE_STEP_SEC },
  // Matrix rain falls; server LEDs blink
  MATRIX_SCREEN: { kind: 'cycle', colors: MATRIX_BANDS, stepSec: MATRIX_CYCLE_STEP_SEC },
  SERVER_RACK: {
    kind: 'pulse',
    swaps: [
      [RACK_LED_GREEN, RACK_LED_GREEN_DIM],
      [RACK_LED_AMBER, RACK_LED_AMBER_DIM],
    ],
    periodSec: RACK_BLINK_PERIOD_SEC,
    swapFraction: RACK_BLINK_FRACTION,
  },
  // Portals: the swirl bands turn round and round
  PORTAL_BLUE: { kind: 'cycle', colors: PORTAL_BLUE_BANDS, stepSec: PORTAL_CYCLE_STEP_SEC },
  PORTAL_ORANGE: { kind: 'cycle', colors: PORTAL_ORANGE_BANDS, stepSec: PORTAL_CYCLE_STEP_SEC },
  WINDOW: {
    kind: 'window',
    splitY: 19,
    stars: [
      [10, 13],
      [12, 16],
      [4, 17],
      [5, 22],
      [12, 24],
    ],
  },
};

/** Furniture type without the virtual mirrored-orientation suffix. */
function baseType(type: string): string {
  const colon = type.indexOf(':');
  return colon < 0 ? type : type.slice(0, colon);
}

export function getAmbientSpec(type: string | undefined): AmbientSpec | undefined {
  return type ? AMBIENT_SPECS[baseType(type)] : undefined;
}

// ── Clock ──────────────────────────────────────────────────────

/** Pixels of one hand, from the pivot outward. Angle 0 = 12 o'clock, clockwise. */
export function handPixels(
  cx: number,
  cy: number,
  angle: number,
  length: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let t = 1; t <= length; t++) {
    out.push([cx + Math.round(t * Math.sin(angle)), cy - Math.round(t * Math.cos(angle))]);
  }
  return out;
}

const clockCache = new WeakMap<SpriteData, Map<number, SpriteData>>();

/** The clock face showing hours:minutes (minute hand snaps to 5-minute marks,
 *  the closest a 3-pixel hand can show). */
export function clockSprite(
  sprite: SpriteData,
  spec: Extract<AmbientSpec, { kind: 'clock' }>,
  hours: number,
  minutes: number,
): SpriteData {
  const minuteMark = Math.round(minutes / 5) % 12;
  const key = (hours % 12) * 12 + minuteMark;
  let variants = clockCache.get(sprite);
  if (!variants) {
    variants = new Map();
    clockCache.set(sprite, variants);
  }
  const hit = variants.get(key);
  if (hit) return hit;

  const faceColor = sprite[spec.face[1]]?.[spec.face[0]] ?? '';
  const handColor = sprite[spec.hand[1]]?.[spec.hand[0]] ?? '';
  if (!faceColor || !handColor) return sprite;

  const out = sprite.map((row) => row.slice());
  // Erase the painted hands
  const reach = Math.max(spec.minuteLen, spec.hourLen) + 1;
  for (let y = spec.cy - reach; y <= spec.cy + reach; y++) {
    for (let x = spec.cx - reach; x <= spec.cx + reach; x++) {
      if (out[y]?.[x] === handColor) out[y][x] = faceColor;
    }
  }
  const paint = ([x, y]: [number, number]) => {
    if (out[y]?.[x] === faceColor) out[y][x] = handColor;
  };
  const minuteAngle = (minuteMark / 12) * Math.PI * 2;
  const hourAngle = (((hours % 12) + minutes / 60) / 12) * Math.PI * 2;
  handPixels(spec.cx, spec.cy, minuteAngle, spec.minuteLen).forEach(paint);
  handPixels(spec.cx, spec.cy, hourAngle, spec.hourLen).forEach(paint);
  out[spec.cy][spec.cx] = handColor;

  variants.set(key, out);
  return out;
}

// ── Plants ─────────────────────────────────────────────────────

/** Sway offset in px for this moment: a slow 0 → +1 → 0 → −1 loop. */
export function swayOffset(timeSec: number, phase: number): number {
  const step = Math.floor(timeSec / PLANT_SWAY_STEP_SEC + phase);
  return [0, 1, 0, -1][((step % 4) + 4) % 4];
}

const swayCache = new WeakMap<SpriteData, Map<number, SpriteData>>();

/** The plant with its foliage shifted `offset` px sideways: the top of a
 *  standing plant, the bottom of a hanging one. The pot (or hook) stays put. */
export function swaySprite(sprite: SpriteData, offset: number, hanging: boolean): SpriteData {
  if (offset === 0) return sprite;
  let variants = swayCache.get(sprite);
  if (!variants) {
    variants = new Map();
    swayCache.set(sprite, variants);
  }
  const key = hanging ? offset * 10 : offset;
  const hit = variants.get(key);
  if (hit) return hit;

  let top = -1;
  let bottom = -1;
  for (let r = 0; r < sprite.length; r++) {
    if (sprite[r].some((px) => px !== '')) {
      if (top < 0) top = r;
      bottom = r;
    }
  }
  const foliageRows = Math.round((bottom - top + 1) * PLANT_SWAY_FOLIAGE_FRACTION);
  const moves = (r: number) =>
    top >= 0 && (hanging ? r > bottom - foliageRows : r < top + foliageRows);
  const out = sprite.map((row, r) => {
    if (!moves(r)) return row.slice();
    return row.map((_, c) => row[c - offset] ?? '');
  });
  variants.set(key, out);
  return out;
}

// ── Standby LED ────────────────────────────────────────────────

const ledCache = new WeakMap<SpriteData, SpriteData>();

export function ledOn(timeSec: number): boolean {
  return (timeSec % STANDBY_LED_PERIOD_SEC) / STANDBY_LED_PERIOD_SEC < STANDBY_LED_ON_FRACTION;
}

export function ledSprite(sprite: SpriteData, x: number, y: number): SpriteData {
  const hit = ledCache.get(sprite);
  if (hit) return hit;
  const out = sprite.map((row) => row.slice());
  if (out[y]?.[x]) out[y][x] = STANDBY_LED_COLOR;
  ledCache.set(sprite, out);
  return out;
}

// ── Pulses (flux capacitor, ring) ──────────────────────────────

type PulseSpec = Extract<AmbientSpec, { kind: 'pulse' }>;

export function pulseSwapped(timeSec: number, spec: PulseSpec): boolean {
  return (timeSec % spec.periodSec) / spec.periodSec < spec.swapFraction;
}

const pulseCache = new WeakMap<SpriteData, SpriteData>();

/** The sprite with the spec's colors swapped (sprites carry upper-case hex). */
export function pulseSprite(sprite: SpriteData, spec: PulseSpec): SpriteData {
  const hit = pulseCache.get(sprite);
  if (hit) return hit;
  const swaps = new Map(spec.swaps.map(([from, to]) => [from.toLowerCase(), to]));
  const out = sprite.map((row) => row.map((px) => swaps.get(px.toLowerCase()) ?? px));
  pulseCache.set(sprite, out);
  return out;
}

// ── Color cycles (portals) ─────────────────────────────────────

type CycleSpec = Extract<AmbientSpec, { kind: 'cycle' }>;

/** Which step of its loop a cycle is on. */
export function cycleStep(timeSec: number, spec: CycleSpec): number {
  return Math.floor(timeSec / spec.stepSec) % spec.colors.length;
}

const cycleCache = new WeakMap<SpriteData, Map<number, SpriteData>>();

/** The sprite with each listed color moved `step` places along the list. */
export function cycleSprite(sprite: SpriteData, spec: CycleSpec, step: number): SpriteData {
  let variants = cycleCache.get(sprite);
  if (!variants) {
    variants = new Map();
    cycleCache.set(sprite, variants);
  }
  const hit = variants.get(step);
  if (hit) return hit;
  const n = spec.colors.length;
  const to = new Map(spec.colors.map((c, i) => [c.toLowerCase(), spec.colors[(i + step) % n]]));
  const out = sprite.map((row) => row.map((px) => to.get(px.toLowerCase()) ?? px));
  variants.set(step, out);
  return out;
}

// ── Windows ────────────────────────────────────────────────────

export type SkyPhase = 'day' | 'dusk' | 'night';

/** What the sky outside looks like under this ambient light. */
export function skyPhase(ambient: Ambient): SkyPhase {
  if (ambient.lights >= 0.75) return 'night';
  if (ambient.alpha > 0) return 'dusk';
  return 'day';
}

const windowCache = new WeakMap<SpriteData, Map<SkyPhase, SpriteData>>();

/** The window with its glass repainted for dusk or night (clouds turn into
 *  the moon up top, stars come out). Day is the sprite as drawn. */
export function windowSprite(
  sprite: SpriteData,
  spec: Extract<AmbientSpec, { kind: 'window' }>,
  phase: SkyPhase,
): SpriteData {
  if (phase === 'day') return sprite;
  let variants = windowCache.get(sprite);
  if (!variants) {
    variants = new Map();
    windowCache.set(sprite, variants);
  }
  const hit = variants.get(phase);
  if (hit) return hit;

  const night = phase === 'night';
  const upper = night ? WINDOW_NIGHT_UPPER : WINDOW_DUSK_UPPER;
  const lower = night ? WINDOW_NIGHT_LOWER : WINDOW_DUSK_LOWER;
  const out = sprite.map((row, y) =>
    row.map((px) => {
      const c = px.toLowerCase();
      if (c === WINDOW_SKY_UPPER) return upper;
      if (c === WINDOW_SKY_LOWER) return lower;
      if (c === WINDOW_CLOUD) {
        if (!night) return WINDOW_DUSK_CLOUD;
        return y < spec.splitY ? WINDOW_MOON : lower;
      }
      return px;
    }),
  );
  if (night) {
    for (const [x, y] of spec.stars) {
      if (out[y]?.[x] === upper || out[y]?.[x] === lower) out[y][x] = WINDOW_STAR;
    }
  }
  variants.set(phase, out);
  return out;
}

// ── Apply ──────────────────────────────────────────────────────

/** Swap in this moment's ambient variant for every animated instance. */
export function applyAmbientAnimation(
  instances: FurnitureInstance[],
  timeSec: number,
  now: Date,
  ambient?: Ambient,
): FurnitureInstance[] {
  const phase = ambient ? skyPhase(ambient) : 'day';
  return instances.map((f) => {
    const spec = getAmbientSpec(f.type);
    if (!spec) return f;
    let sprite = f.sprite;
    if (spec.kind === 'clock') {
      sprite = clockSprite(f.sprite, spec, now.getHours(), now.getMinutes());
    } else if (spec.kind === 'sway') {
      // Desync neighbours by their position
      const phase = (f.x + f.y * 3) / TILE_SIZE;
      sprite = swaySprite(f.sprite, swayOffset(timeSec, phase), spec.hanging);
    } else if (spec.kind === 'window') {
      sprite = windowSprite(f.sprite, spec, phase);
    } else if (spec.kind === 'pulse') {
      if (pulseSwapped(timeSec, spec)) sprite = pulseSprite(f.sprite, spec);
    } else if (spec.kind === 'cycle') {
      const step = cycleStep(timeSec, spec);
      if (step) sprite = cycleSprite(f.sprite, spec, step);
    } else if (ledOn(timeSec)) {
      sprite = ledSprite(f.sprite, spec.x, spec.y);
    }
    return sprite === f.sprite ? f : { ...f, sprite };
  });
}
