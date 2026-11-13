import {
  PICK_EXTRA_HOPS,
  PICK_HOP_BASE_MS,
  PICK_HOP_SLOWDOWN_MS,
  PICK_MIN_HOPS,
  ROW_WINDOW_BACK,
  ROW_WINDOW_FRONT,
  RULER_MAX_TICKS,
} from './constants.js';

/** The row of boxes, as plain math: which box is chosen, which ones are drawn, where each sits, the random pick. */

export const clampIndex = (i: number, count: number): number =>
  count <= 0 ? 0 : Math.max(0, Math.min(count - 1, Math.round(i)));

/** The boxes that are in the page: a few behind the chosen one, more in front (the rest of a long row is not). */
export function visibleRange(
  selected: number,
  count: number,
  back = ROW_WINDOW_BACK,
  front = ROW_WINDOW_FRONT,
): { from: number; to: number } {
  if (count <= 0) return { from: 0, to: -1 };
  const s = clampIndex(selected, count);
  return { from: Math.max(0, s - back), to: Math.min(count - 1, s + front) };
}

/** Where a box sits, by its distance `k` to the chosen one: out in front, up the diagonal (k > 0) or down it. */
export function boxPlacement(k: number): {
  transform: string;
  brightness: number;
  hidden: boolean;
} {
  if (k === 0)
    return {
      transform: 'translate3d(100px, 10px, 130px) rotateY(-16deg) rotateX(3deg)',
      brightness: 1,
      hidden: false,
    };
  if (k > 0)
    return {
      transform: `translate3d(${k * 24}px, ${-k * 20}px, ${-k * 46}px) rotateY(62deg)`,
      brightness: Math.max(0.45, 1 - k * 0.05),
      hidden: false,
    };
  return {
    transform: `translate3d(${k * 30 - 40}px, ${-k * 26 + 16}px, ${-k * 24}px) rotateY(62deg)`,
    brightness: 0.7,
    hidden: k < -ROW_WINDOW_BACK,
  };
}

/** The box under a point of the ruler (0 = left end, 1 = right end). */
export const rulerIndexAt = (fraction: number, count: number): number =>
  clampIndex(Math.max(0, Math.min(1, fraction)) * (count - 1), count);

/** Where the ruler's marker goes for the chosen box (0-1). */
export const rulerFraction = (selected: number, count: number): number =>
  count > 1 ? clampIndex(selected, count) / (count - 1) : 0.5;

/** The ruler's ticks: one per box up to a cap; each with its height (px) and whether it is the chosen one's. */
export function rulerTicks(
  selected: number,
  count: number,
  max = RULER_MAX_TICKS,
): { height: number; on: boolean }[] {
  const n = Math.min(count, max);
  const pos = rulerFraction(selected, count);
  return Array.from({ length: n }, (_, t) => {
    const tp = n > 1 ? t / (n - 1) : 0.5;
    const dist = Math.abs(tp - pos) * n;
    return { height: Math.round(Math.max(6, 26 - dist * 4)), on: dist < 0.6 };
  });
}

/**
 * "Escoge uno": the boxes the row runs through, slowing down, until it lands on `target`. It always moves forward
 * (wrapping around the end), at least once around a short row, so it never looks like it did nothing.
 */
export function pickPath(from: number, target: number, count: number, hops: number): number[] {
  if (count <= 1) return [0];
  const s = clampIndex(from, count);
  const t = clampIndex(target, count);
  let distance = (t - s + count) % count;
  if (distance < Math.min(hops, count)) distance += count;
  const steps = Math.max(1, Math.min(hops, distance));
  const path: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const eased = 1 - Math.pow(1 - i / steps, 2.2);
    const at = (s + Math.round(distance * eased)) % count;
    if (path[path.length - 1] !== at) path.push(at);
  }
  if (path[path.length - 1] !== t) path.push(t);
  return path;
}

/** How many hops a pick takes, from a random number in [0, 1). */
export const pickHops = (random: number): number =>
  PICK_MIN_HOPS + Math.floor(random * PICK_EXTRA_HOPS);

/** Delay before hop `i` (1-based): quick at first, slower at the end. */
export const pickHopDelay = (i: number): number => PICK_HOP_BASE_MS + i * i * PICK_HOP_SLOWDOWN_MS;

/** Wheel: accumulates deltas and returns whole steps, keeping the rest. */
export function wheelSteps(
  acc: number,
  delta: number,
  step: number,
): { steps: number; rest: number } {
  const total = acc + delta;
  const steps = Math.trunc(total / step);
  return { steps, rest: total - steps * step };
}
