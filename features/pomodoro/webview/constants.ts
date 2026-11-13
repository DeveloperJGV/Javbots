/** The pieces that open the pomodoro panel: the tomato timer, on the wall or on a table (the hourglasses are
 *  decoration). */
export const POMODORO_PANEL_TYPES: readonly string[] = ['POMODORO_TIMER_WALL', 'POMODORO_TIMER'];

/** The wall clock that shows the countdown (an ambient digital clock otherwise). */
export const POMODORO_CLOCK_TYPE = 'POMODORO_TIMER_WALL';

/** The DESCANSO sign: lit during a break, its off look otherwise. */
export const BREAK_SIGN_TYPE = 'POMODORO_BREAK_SIGN';
export const BREAK_SIGN_OFF_TYPE = 'POMODORO_BREAK_SIGN_OFF';

/** The focus lamp (if placed): on during a focus block. */
export const FOCUS_LAMP_OFF_TYPE = 'POMODORO_FOCUS_LAMP_OFF';
export const FOCUS_LAMP_ON_TYPE = 'POMODORO_FOCUS_LAMP_ON';

/** The big hourglass: a grain of sand falls through the neck while a focus block runs. */
export const HOURGLASS_BIG_TYPE = 'POMODORO_HOURGLASS_BIG';
/** Where the grain shows, in order (sprite px, inside the glass below the neck). */
export const HOURGLASS_GRAIN_PATH: ReadonlyArray<readonly [number, number]> = [
  [8, 21],
  [8, 22],
];
export const HOURGLASS_GRAIN_COLOR = '#F8C556';
/** Seconds per step of the grain (one empty step closes the loop). */
export const HOURGLASS_GRAIN_STEP_SEC = 0.4;

/** The panel's clock refreshes this often. */
export const PANEL_TICK_MS = 500;
