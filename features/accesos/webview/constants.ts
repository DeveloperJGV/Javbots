import type { AccesoState } from '../../../core/src/messages.js';

/** The piece that opens the pages panel (features/accesos/assets/furniture/ACCESOS_MAP_TABLE). */
export const ACCESOS_TABLE_TYPE = 'ACCESOS_MAP_TABLE';
export const ACCESOS_PANEL_TYPES: readonly string[] = [ACCESOS_TABLE_TYPE];

/** Opening the office with this hash opens the panel (a link, or a check script, without the furniture). */
export const ACCESOS_OPEN_HASH = '#accesos';

/** Only these addresses become a link (the server already checks it; this is the page's own guard). */
export const LOCAL_URL_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}(\/|$)/;

// ── Texts ──────────────────────────────────────────────────────────────────────────────────
export const PANEL_TITLE = 'Accesos';
/** The hover sign: "<name>: abrir" with one page, this with several (or before the list arrives). */
export const HINT_MANY = 'Accesos';
export const HINT_OPEN_SUFFIX = ': abrir';

export const STATE_LABEL: Record<AccesoState, string> = {
  on: 'Prendida',
  off: 'Apagada',
  starting: 'Prendiendo…',
  unknown: 'Revisando…',
};
export const STATE_COLOR: Record<AccesoState, string> = {
  on: 'var(--color-status-success)',
  off: 'var(--color-text-muted)',
  starting: 'var(--color-status-permission)',
  unknown: 'var(--color-text-muted)',
};
export const ERROR_COLOR = 'var(--color-warning)';

// ── The candle on the table ────────────────────────────────────────────────────────────────
/** One pixel the page paints over the table's sprite: x, y and a #RRGGBB(AA) color. */
export type FlamePixel = readonly [number, number, string];

/** Tall flame (the wick is at 26,3 in arte/armar.py). */
export const ACCESOS_FLAME_A: readonly FlamePixel[] = [
  [26, 0, '#fff2a8'],
  [25, 1, '#ff9a2e'],
  [26, 1, '#ffd24a'],
  [27, 1, '#ff9a2e'],
  [26, 2, '#ff7a1e'],
];
/** Short flame, leaning a little: the other frame of the flicker. */
export const ACCESOS_FLAME_B: readonly FlamePixel[] = [
  [27, 1, '#fff2a8'],
  [25, 2, '#ff9a2e'],
  [26, 2, '#ffd24a'],
  [26, 1, '#ff9a2e'],
];
/** Warm light around the flame, only on transparent pixels. */
export const ACCESOS_FLAME_GLOW: readonly FlamePixel[] = [
  [24, 2, '#ffd24a40'],
  [28, 2, '#ffd24a40'],
  [25, 0, '#ffd24a30'],
  [27, 0, '#ffd24a30'],
  [23, 5, '#ffd24a28'],
  [29, 5, '#ffd24a28'],
];
/** Which frame shows on each furniture tick (0 = tall, 1 = short): uneven, so it reads as a candle, not a blink. */
export const FLICKER_PATTERN: readonly number[] = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0];
/** Seconds per step of the flicker (the furniture redraws every FURNITURE_ANIM_INTERVAL_SEC). */
export const FLICKER_STEP_SEC = 0.2;
/** While a page is being started the flame sputters: on and off every this many seconds. */
export const SPUTTER_STEP_SEC = 0.4;

// ── The panel ──────────────────────────────────────────────────────────────────────────────
/** The little candle next to each page's name: rows of the icon, one character per pixel ('.' = empty). */
export const CANDLE_ICON_ROWS: readonly string[] = [
  '..t..',
  '.oyo.',
  '..r..',
  '..k..',
  '.wwS.',
  'wwwS.',
  '.wwS.',
  '.wwS.',
  'bBBBd',
  '.ddd.',
];
/** The flame's rows (0-2): drawn only when the page answers. */
export const CANDLE_FLAME_ROWS = 3;
export const CANDLE_ICON_PX = 4;
export const CANDLE_ICON_COLORS: Record<string, string> = {
  t: '#fff2a8',
  o: '#ff9a2e',
  y: '#ffd24a',
  r: '#ff7a1e',
  k: '#2a2220',
  w: '#efe6d2',
  S: '#c8bca2',
  b: '#ecc66a',
  B: '#c99a3c',
  d: '#7d5a22',
};

/** The panel's own styles: the flame flickers, a page being started blinks. Injected by the panel. */
export const ACCESOS_CSS = `
@keyframes accesos-flicker { 0%, 100% { transform: translateY(0); opacity: 1; } 30% { transform: translateY(1px); }
  55% { opacity: .75; } 70% { transform: translateY(-1px); } }
@keyframes accesos-sputter { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.accesos-flame-on { animation: accesos-flicker 1.1s steps(4) infinite; }
.accesos-flame-starting { animation: accesos-sputter .8s steps(1) infinite; }
@media (prefers-reduced-motion: reduce) { .accesos-flame-on, .accesos-flame-starting { animation: none; } }
`;
