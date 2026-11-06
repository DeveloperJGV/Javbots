/** The wall screen (features/perfil/arte/armar.py): opens the panel and shows the result. */
export const PERFIL_SCREEN_TYPE = 'PERFIL_SCREEN';

/** The screen inside the frame, inclusive (as in arte/armar.py). */
export const PERFIL_SCREEN_AREA = { x0: 4, y0: 4, x1: 27, y1: 27 } as const;

/** Where the code is written (top-left of its first letter) and how many letters fit. */
export const PERFIL_CODE_POS = { x: 4, y: 5 } as const;
export const PERFIL_CODE_MAX = 6;

/** The trait bars: first row, rows apart, bar height, left edge and full width (100%). */
export const PERFIL_BARS = { y: 12, step: 3, height: 2, x: 5, width: 22, max: 5 } as const;

/** The blinking cursor under the bars (or alone, when there's no profile). */
export const PERFIL_CURSOR = { x: 5, y: 27, width: 3 } as const;
export const PERFIL_CURSOR_IDLE = { x: 5, y: 9, width: 3 } as const;
export const PERFIL_CURSOR_BLINK_SEC = 0.5;

/** Green phosphor, like the freelance room's padlock screen. */
export const PERFIL_TEXT_COLOR = '#63E36E';
export const PERFIL_BAR_COLOR = '#2A955D';
export const PERFIL_TRACK_COLOR = '#1A4020';

/** Cached screens per base sprite (code × bars × cursor): a handful at most. */
export const PERFIL_CACHE_MAX = 8;

/** 3×5 letters for the code ('#' = lit). Letters outside the table leave a gap. */
export const PERFIL_GLYPHS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  '-': ['...', '...', '###', '...', '...'],
};
