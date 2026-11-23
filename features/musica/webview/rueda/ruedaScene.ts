import { RUEDA_SCENE_COLORS } from '../constants.js';
import type { SceneTarget } from './ruedaText.js';

/**
 * The knob scene of the volume wheel (features/musica/rueda), drawn in pixel art on a canvas: an amp with a knob
 * and its ring of lights, a digital readout, and a cable to where the wheel goes (a speaker or the computer).
 * Logical pixels; the canvas scales them up with no smoothing.
 */
export const SCENE_W = 120;
export const SCENE_H = 48;
export const SCENE_SCALE = 3;

const KNOB = { x: 22, y: 25, r: 10 };
const LED_R = 15;
const LEDS = 11;
/** The knob turns from -135° (0) to +135° (100). */
export const KNOB_MIN_DEG = -135;
export const KNOB_MAX_DEG = 135;

const C = RUEDA_SCENE_COLORS;

/** Knob angle (degrees, 0 = up, clockwise) for a volume 0-100. */
export function knobAngle(volume: number | undefined): number {
  const v = Math.max(0, Math.min(100, volume ?? 0));
  return KNOB_MIN_DEG + ((KNOB_MAX_DEG - KNOB_MIN_DEG) * v) / 100;
}

/** How many of the ring's lights are on (the first one lights as soon as there's any volume). */
export function ledsLit(volume: number | undefined): number {
  const v = Math.max(0, Math.min(100, volume ?? 0));
  return v <= 0 ? 0 : Math.max(1, Math.round((v / 100) * LEDS));
}

/** The knob eases toward its target: fast enough to follow a wheel, smooth enough to see it turn. */
export function easeAngle(current: number, target: number, dtMs: number): number {
  const k = 1 - Math.exp(-dtMs / 90);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < 0.3 ? target : next;
}

/** 3×5 digits for the readout (digital, like every clock in the office). */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '011', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'],
};

const px = (ctx: CanvasRenderingContext2D, x: number, y: number, w = 1, h = 1) =>
  ctx.fillRect(Math.round(x), Math.round(y), w, h);

/** A filled pixel circle (no anti-aliasing). */
function disc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y) + 0.35);
    px(ctx, cx - half, cy + y, half * 2 + 1, 1);
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  on: string,
  off: string,
): void {
  // Three cells always: unlit segments show like a real readout
  const cells = s.padStart(3, ' ').slice(-3);
  for (let i = 0; i < 3; i++) {
    const g = DIGITS[cells[i]!] ?? null;
    const base = DIGITS['8']!;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        const lit = g?.[r]?.[c] === '1';
        if (!lit && base[r]![c] !== '1') continue;
        ctx.fillStyle = lit ? on : off;
        px(ctx, x + i * 5 + c, y + r);
      }
  }
}

function note(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.note;
  px(ctx, x + 2, y, 1, 4); // stem
  px(ctx, x + 3, y, 1, 1); // flag
  px(ctx, x, y + 3, 2, 2); // head
  ctx.globalAlpha = 1;
}

export interface SceneFrame {
  target: SceneTarget;
  /** The knob's drawn angle (eased by the caller). */
  angle: number;
  /** Milliseconds since the scene opened (notes, pulse). */
  t: number;
  /** ms since the volume last changed: the ring flashes for a moment. */
  sinceChange: number;
}

export function drawScene(ctx: CanvasRenderingContext2D, f: SceneFrame): void {
  const { target, t } = f;
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);

  // amp box
  ctx.fillStyle = C.ampEdge;
  px(ctx, 3, 5, 60, 40);
  ctx.fillStyle = C.amp;
  px(ctx, 4, 6, 58, 38);
  ctx.fillStyle = C.ampTop;
  px(ctx, 4, 6, 58, 2);
  // feet
  ctx.fillStyle = C.ampEdge;
  px(ctx, 7, 45, 4, 2);
  px(ctx, 55, 45, 4, 2);

  // ring of lights
  const lit = target.on ? ledsLit(target.volume) : 0;
  const flash = target.on && f.sinceChange < 220;
  for (let i = 0; i < LEDS; i++) {
    const deg = KNOB_MIN_DEG + ((KNOB_MAX_DEG - KNOB_MIN_DEG) * i) / (LEDS - 1);
    const a = (deg * Math.PI) / 180;
    const x = KNOB.x + LED_R * Math.sin(a);
    const y = KNOB.y - LED_R * Math.cos(a);
    ctx.fillStyle = i < lit ? (flash && i === lit - 1 ? C.ledHot : C.led) : C.ledOff;
    px(ctx, x - 1, y - 1, 2, 2);
  }

  // knob
  disc(ctx, KNOB.x, KNOB.y + 1, KNOB.r, C.ampEdge);
  disc(ctx, KNOB.x, KNOB.y, KNOB.r, C.knobDark);
  disc(ctx, KNOB.x, KNOB.y - 1, KNOB.r - 2, C.knob);
  ctx.fillStyle = C.knobLight;
  px(ctx, KNOB.x - 4, KNOB.y - 7, 4, 1);
  const a = (f.angle * Math.PI) / 180;
  ctx.fillStyle = target.on ? C.mark : C.knobLight;
  for (let d = 3; d <= KNOB.r - 2; d++)
    px(ctx, KNOB.x + d * Math.sin(a), KNOB.y - 1 - d * Math.cos(a));

  // readout (digital)
  ctx.fillStyle = C.ampEdge;
  px(ctx, 40, 15, 20, 11);
  ctx.fillStyle = C.screen;
  px(ctx, 41, 16, 18, 9);
  const shown = target.on && target.volume !== undefined ? String(Math.round(target.volume)) : '-';
  text(
    ctx,
    target.on ? shown : '',
    43,
    18,
    target.to === 'spotify' ? C.digit : C.cableWindows,
    C.digitOff,
  );
  // where-to lamp under the readout
  ctx.fillStyle = !target.on ? C.ledOff : target.to === 'spotify' ? C.led : C.cableWindows;
  px(ctx, 41, 30, 3, 2);
  ctx.fillStyle = C.ampTop;
  px(ctx, 46, 30, 13, 2);

  // cable from the amp to the target, with a pulse running along it
  const cableColor = !target.on
    ? C.cableOff
    : target.to === 'spotify'
      ? C.cableSpotify
      : C.cableWindows;
  const endX = target.to === 'spotify' ? 72 : 96;
  const y = 38;
  for (let x = 63; x < endX; x++) {
    const pulse = target.on && Math.floor(t / 60) % 12 === (x - 63) % 12;
    ctx.fillStyle = pulse ? C.ledHot : cableColor;
    if (target.on || x % 2 === 0) px(ctx, x, y);
  }

  // speaker (a Spotify device)
  const beat = target.on && target.playing ? (Math.floor(t / 420) % 2 === 0 ? 1 : 0) : 0;
  ctx.fillStyle = C.ampEdge;
  px(ctx, 72, 9, 22, 34);
  ctx.fillStyle = C.cabinet;
  px(ctx, 73, 10, 20, 32);
  disc(ctx, 83, 30, 7 + beat, C.coneRing);
  disc(ctx, 83, 30, 5 + beat, C.cone);
  disc(ctx, 83, 30, 1, C.coneRing);
  disc(ctx, 83, 17, 3, C.coneRing);
  disc(ctx, 83, 17, 1, C.cone);
  if (target.on && target.playing) {
    for (let i = 0; i < 2; i++) {
      const p = (((t / 1600 + i * 0.5) % 1) + 1) % 1;
      note(ctx, 88 + i * 4 + Math.round(Math.sin(p * 6) * 1.5), 6 - Math.round(p * 6) + i, 1 - p);
    }
  }

  // laptop (this computer: Windows)
  ctx.fillStyle = C.ampEdge;
  px(ctx, 98, 25, 18, 12);
  ctx.fillStyle = target.on && target.to === 'windows' ? C.screenOn : C.screenDim;
  px(ctx, 99, 26, 16, 10);
  ctx.fillStyle = C.laptop;
  px(ctx, 96, 37, 22, 2);
  ctx.fillStyle = C.ampEdge;
  px(ctx, 96, 39, 22, 1);
  if (target.on && target.to === 'windows') {
    ctx.fillStyle = C.screenText;
    px(ctx, 101, 28, 6, 1);
    px(ctx, 101, 31, 9, 1);
  }

  // dim whatever the wheel doesn't move
  ctx.fillStyle = C.dim;
  if (!target.on) px(ctx, 0, 0, SCENE_W, SCENE_H);
  else if (target.to === 'spotify') px(ctx, 95, 22, 25, 20);
  else px(ctx, 70, 4, 25, 40);
}
