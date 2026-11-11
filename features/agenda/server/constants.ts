export const LOG_PREFIX = '[Agenda]';

/** ~/.pixel-agents/agenda.json: optional, filled by hand ({ "calendario": "…" }). */
export const AGENDA_CONFIG_FILE = 'agenda.json';
/**
 * The shared calendar the events are read from and added to, when agenda.json doesn't name one. It must already
 * exist: the office never creates or shares calendars.
 */
export const DEFAULT_AGENDA_CALENDAR = 'Familia';
/** The owner's own calendar for house things (services, chores), when agenda.json doesn't name one (`casa`). */
export const DEFAULT_HOME_CALENDAR = 'Casa';
/** Title shown for a block of a calendar the owner can only see as free/busy (e.g. work). */
export const BUSY_TITLE = 'Ocupado';
export const AGENDA_TIME_ZONE = 'America/Mexico_City';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
/** The owner's default task list ("Mis tareas"). */
export const TASK_LIST = '@default';

/** Today and the six days after it. */
export const AGENDA_DAYS = 7;
/** A timed event without an end time lasts this long. */
export const DEFAULT_EVENT_MINUTES = 60;
export const MAX_TITLE_LENGTH = 200;

/** Re-read Google while a page is open. */
export const AGENDA_REFRESH_MS = 5 * 60_000;
export const AGENDA_TICK_MS = 60_000;

/** The agenda's own floor of the main office (core/src/offices.ts): first floor up, "1 · Agenda" in the elevator. */
export const AGENDA_FLOOR_ID = 'agenda';
export const AGENDA_FLOOR_LEVEL = 1;
export const AGENDA_FLOOR_LABEL = 'Personal';
/** Where the build copies its layout (esbuild.js: features/<name>/planos → dist/<name>/planos). */
export const AGENDA_FLOOR_LAYOUT_FILE = 'piso.json';
