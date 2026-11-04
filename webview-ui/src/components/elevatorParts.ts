/**
 * Pure pieces of the elevator plate (Elevator.tsx): the pixel discs of the round floor buttons, which arrow the
 * display lights, the caption under it and the order of the floor buttons. Kept apart so they're testable without
 * React (webview-ui/test/elevator.test.ts).
 */
import { floorButton } from '../../../core/src/offices.js';

/** [x, y, width] runs of one sprite-pixel row each, like the toolbar icons. */
export type PixelRuns = Array<[number, number, number]>;

/** A filled pixel circle `d` pixels across, offset by (`ox`, `oy`): one run per row, symmetric both ways. */
export function pixelDisc(d: number, ox = 0, oy = 0): PixelRuns {
  const r = d / 2;
  const runs: PixelRuns = [];
  for (let y = 0; y < d; y++) {
    const dy = y + 0.5 - r;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    const x0 = Math.round(r - half);
    const w = d - 2 * x0;
    if (w > 0) runs.push([ox + x0, oy + y, w]);
  }
  return runs;
}

export type DisplayArrow = 'up' | 'down' | null;

/** The display lights ▲ above the ground floor, ▼ below it, nothing on it. */
export function displayArrow(level: number): DisplayArrow {
  if (level > 0) return 'up';
  if (level < 0) return 'down';
  return null;
}

/** "1 · Personal": the button and the floor's name, as the plate and the tooltips say it. */
export function floorCaption(floor: { level: number; button?: string; label: string }): string {
  return `${floorButton(floor)} · ${floor.label}`;
}

/**
 * Floor buttons in rows of `cols` (one per row by default: a single column, like a real elevator panel), top floor
 * first (R / 1 / PB / S). With only the ground floor
 * there's nothing to pick, so no buttons: the display alone says where you are.
 */
export function floorRows<T extends { level: number }>(topDown: readonly T[], cols = 1): T[][] {
  if (topDown.length <= 1) return [];
  const rows: T[][] = [];
  for (let i = 0; i < topDown.length; i += cols) rows.push(topDown.slice(i, i + cols));
  return rows;
}

/** 5×3 arrows for the display. */
export const ARROW_UP: PixelRuns = [
  [2, 0, 1],
  [1, 1, 3],
  [0, 2, 5],
];
export const ARROW_DOWN: PixelRuns = [
  [0, 0, 5],
  [1, 1, 3],
  [2, 2, 1],
];

/** 5×7 LED glyphs for the display and the floor buttons ('#' = lit). */
const LED_GLYPHS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  S: ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
  // The roof's button ("R", core/src/offices.ts ROOF_BUTTON)
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
};
export const LED_GLYPH_W = 5;
export const LED_GLYPH_H = 7;

/**
 * A floor button's text ("PB", "1", "S2") in LED pixels, one blank column between letters. Null when a letter has
 * no glyph (a pack's custom button like "TL"): the caller falls back to the pixel font.
 */
export function ledText(text: string): { runs: PixelRuns; w: number } | null {
  const chars = [...text.toUpperCase()];
  if (chars.length === 0 || chars.some((c) => !LED_GLYPHS[c])) return null;
  const runs: PixelRuns = [];
  chars.forEach((c, i) => {
    const ox = i * (LED_GLYPH_W + 1);
    LED_GLYPHS[c].forEach((line, y) => {
      for (const m of line.matchAll(/#+/g)) runs.push([ox + (m.index ?? 0), y, m[0].length]);
    });
  });
  return { runs, w: chars.length * (LED_GLYPH_W + 1) - 1 };
}
