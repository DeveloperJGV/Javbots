/** Furniture of the agenda room. */
export const AGENDA_WEEK_MAP_TYPE = 'AGENDA_WEEK_MAP';
export const AGENDA_CONSOLE_TYPE = 'AGENDA_CONSOLE';
export const AGENDA_RADAR_TYPE = 'AGENDA_RADAR';
export const AGENDA_TASKS_TYPE = 'AGENDA_TASKS';
/** The one piece a click opens the panel from (the week map, radar and task board are decoration that follows the
 *  agenda, without a click of their own). */
export const AGENDA_FURNITURE_TYPES: readonly string[] = [AGENDA_CONSOLE_TYPE];

/**
 * The title's first word with a colon says the event's type (the owner's rule). Buttons in the panel, in order;
 * `prefix` empty = a plain event, `task` = Google Tasks.
 */
export const AGENDA_KINDS: ReadonlyArray<{
  id: string;
  label: string;
  prefix: string;
  kind: 'event' | 'task';
}> = [
  { id: 'concierto', label: 'Concierto:', prefix: 'Concierto:', kind: 'event' },
  { id: 'salida', label: 'Salida:', prefix: 'Salida:', kind: 'event' },
  { id: 'evento', label: 'Evento', prefix: '', kind: 'event' },
  { id: 'tarea', label: 'Tarea (solo tuya)', prefix: '', kind: 'task' },
];

// ── Week map (must match features/agenda/arte/armar.py) ──
export const WEEK_MAP_X0 = 4;
export const WEEK_MAP_STEP = 8;
export const WEEK_MAP_COL_W = 7;
export const WEEK_MAP_HEADER_Y = 6;
export const WEEK_MAP_ALARM_Y = 9;
export const WEEK_MAP_BOTTOM_Y = 26;
/** Each item is a block this tall plus a 1 px gap; at most this many per day. */
export const WEEK_MAP_BLOCK_H = 2;
export const WEEK_MAP_MAX_BLOCKS = 5;

// ── Console light ──
export const CONSOLE_LED = { x: 42, y: 18 } as const;
// ── Task list (5 boxes of 2×2) ──
export const TASK_BOXES: ReadonlyArray<{ x: number; y: number }> = [0, 1, 2, 3, 4].map((i) => ({
  x: 6,
  y: 8 + 4 * i,
}));
// ── Radar ──
export const RADAR_CENTER = { x: 16, y: 17 } as const;
export const RADAR_RADIUS = 11;
export const RADAR_SWEEP_SEC = 3;
export const RADAR_STEPS = 24;
export const RADAR_FLOOR_COLOR = '#062b1a';

export const AGENDA_COLORS = {
  event: '#22d3ee',
  eventShine: '#a5f3fc',
  task: '#fbbf24',
  taskShine: '#fde68a',
  today: '#4ade80',
  conflict: '#ef4444',
  ok: '#4ade80',
  sweep: '#4ade80',
  sweepTail: '#16a34a',
} as const;

/** The console's light blinks red while there are clashes. */
export const AGENDA_BLINK_SEC = 0.5;

// ── Plan of the day (panel) ──
/** Choices of "how long it takes" (0 = let the rules decide): a normal task in whole blocks ("ratos")... */
export const PLAN_BLOCK_MULTIPLES: readonly number[] = [1, 2, 3, 4];
/** ...a small thing (in "Pendientes rápidos" or alone)... */
export const PLAN_QUICK_OPTIONS: readonly number[] = [5, 10, 15];
/** ...and one plant care inside the garden round. */
export const PLAN_GARDEN_OPTIONS: readonly number[] = [1, 2, 3, 5, 10, 15];
export const PLAN_AUTO_MINUTES = 0;
/** Week days for the work-days buttons, Sunday first (JS `getDay()` order). */
export const PLAN_WEEK_LETTERS: readonly string[] = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const PLAN_WEEK_NAMES: readonly string[] = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
/** A new rest range / word rule in the preferences form. */
export const PLAN_NEW_REST = { from: '14:00', to: '15:00' } as const;
export const PLAN_NEW_RULE_MINUTES = 10;
/** Id of the <datalist> with the half hours suggested in the "Agregar" form. */
export const HALF_HOURS_LIST_ID = 'agenda-half-hours';
export const HOURS_PER_DAY = 24;
