/** Refresh the "resets in" countdowns. */
export const CLOCK_MS = 30_000;

/** The office piece that shows the plan limits; a click on it opens the detail. */
export const USAGE_METER_TYPE = 'USAGE_METER';
/**
 * Where the three bars go on its sprite (sprite px): 5 hours, week, Fable's week. They fill from the bottom.
 * They must match the empty windows drawn on USAGE_METER.png.
 */
export const USAGE_METER_BARS = [
  { x: 6, y: 7, w: 4, h: 16 },
  { x: 14, y: 7, w: 4, h: 16 },
  { x: 22, y: 7, w: 4, h: 16 },
] as const;
/** The model with its own weekly limit, shown next to the general ones (bar, meter, per-model list). */
export const SPOTLIGHT_MODEL = 'Fable';
/** Bar colors by how full the limit is (same thresholds as the statusline: 50 / 80) and the empty part. */
export const USAGE_COLOR_OK = '#89d185';
export const USAGE_COLOR_WARN = '#ff8d14';
export const USAGE_COLOR_DANGER = '#d14249';
export const USAGE_COLOR_EMPTY = '#181828';
/** Limit unknown (no session yet): the windows stay dark with a dim line across. */
export const USAGE_COLOR_UNKNOWN = '#3a3a5c';
