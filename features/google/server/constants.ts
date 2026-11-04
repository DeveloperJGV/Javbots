export const LOG_PREFIX = '[Google]';

/** ~/.pixel-agents/google.json: the app's keys (filled by hand) and the session (written by the server). */
export const GOOGLE_CONFIG_FILE = 'google.json';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
/**
 * Read the owner's Drive (features/jardin reads the notes and photos a phone leaves in a folder). `drive.file` is not
 * enough: it only sees files this app created or the owner opened with it, and those files come from another app.
 * Read only: the office never writes, moves or deletes anything in Drive.
 */
export const GOOGLE_DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
/** Everything any feature needs, asked once: one login serves them all. */
export const GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE, GOOGLE_DRIVE_READ_SCOPE];

export const GOOGLE_LOGIN_PATH = '/api/google/login';
export const GOOGLE_CALLBACK_PATH = '/api/google/callback';
/** A login that never comes back is forgotten after this. */
export const GOOGLE_PENDING_LOGIN_MS = 10 * 60_000;
/**
 * The app stays in Google's "Testing" status (publishing needs public homepage and privacy pages), where a refresh
 * token dies 7 days after the login. Warn a day before so a reconnect can happen on the user's time.
 */
export const GOOGLE_TESTING_TOKEN_DAYS = 7;
export const GOOGLE_RECONNECT_WARN_DAYS = 1;

export const FETCH_TIMEOUT_MS = 15_000;
