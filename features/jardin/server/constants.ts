export const LOG_PREFIX = '[Jardín]';

/** ~/.pixel-agents/jardin.json: the plants, the supplies, the inbox and what the office made in Google. */
export const JARDIN_DATA_FILE = 'jardin.json';
/** ~/.pixel-agents/jardin/: the photos (fotos/) and the computer's drop folder (entrada/). */
export const JARDIN_DIR = 'jardin';
export const JARDIN_PHOTOS_DIR = 'fotos';
/** Notes and photos left on this computer (by the skill, or by hand); processed like the Drive ones. */
export const JARDIN_LOCAL_INBOX_DIR = 'entrada';
/** Where a processed local file goes, so it is read only once. */
export const JARDIN_LOCAL_DONE_DIR = 'leidos';

// ── Names the owner may change in jardin.json ("ajustes"); these are the defaults ──
/** The calendar of the reminders. The owner creates it: the office never creates calendars. */
export const DEFAULT_PLANTS_CALENDAR = 'Plantas';
/** The Google Tasks list of the checkboxes. The office creates it when it's missing (a list is not a calendar). */
export const DEFAULT_GARDEN_TASK_LIST = 'Jardín';
/** The Drive folder the phone leaves notes and photos in. */
export const DEFAULT_GARDEN_FOLDER = 'Jardín';
/** First word of every reminder's title, with its colon (the calendar's title rule). */
export const DEFAULT_EVENT_PREFIX = 'Jardín:';
/** Time of a care's reminder when the owner gives none. */
export const DEFAULT_CARE_TIME = '09:00';

export const JARDIN_TIME_ZONE = 'America/Mexico_City';
/** How long a reminder event lasts on the calendar. */
export const REMINDER_EVENT_MINUTES = 15;
/** The phone's popup, this many minutes before the event (0 = at its time). */
export const REMINDER_POPUP_MINUTES = 0;

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
export const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/**
 * Marks what the office made, so it never touches anything else: events carry it as a private extended property,
 * tasks at the end of their notes. The value is "<plant id>:<care>" or "compra:<supply id>".
 */
export const OWNER_MARK_KEY = 'javbotsJardin';
export const taskMark = (key: string): string => `[${OWNER_MARK_KEY}:${key}]`;

/** Sync with Google this often (and once at start, to catch up). */
export const JARDIN_SYNC_MS = 5 * 60_000;
/** First sync after the server starts (lets the Google session load). */
export const JARDIN_FIRST_SYNC_MS = 5_000;

/** Photos bigger than this are left in the inbox without copying them. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_NOTE_BYTES = 64 * 1024;
/** Files read from Drive per sync (the rest wait for the next one). */
export const MAX_DRIVE_FILES_PER_SYNC = 20;
/** How many recent automatic changes the panel shows. */
export const MAX_RECENT = 15;
export const MAX_TEXT = 200;
export const MAX_EVERY_DAYS = 365;

export const PHOTO_ROUTE = '/api/jardin/fotos/:file';

/** The roof floor of the main office (core/src/offices.ts): always the top one, "R" in the elevator. */
export const JARDIN_FLOOR_ID = 'azotea';
export const JARDIN_FLOOR_LABEL = 'Roof garden';
/** Where the build copies its layout (esbuild.js: features/<name>/planos → dist/<name>/planos). */
export const JARDIN_FLOOR_LAYOUT_FILE = 'azotea.json';
