export const LOG_PREFIX = '[Conciertos]';

/** ~/.pixel-agents/conciertos.json: keys (filled by hand) and the Google session (written by the server). */
export const CONCERTS_CONFIG_FILE = 'conciertos.json';

/** Only events whose title starts with this (case-insensitive) are concerts. */
export const CONCERT_PREFIX = 'Concierto:';
/**
 * The calendar the concerts are read from and added to, when conciertos.json doesn't name one (`calendario`). An
 * existing calendar of the owner: the office never creates or shares calendars.
 */
export const DEFAULT_CALENDAR_NAME = 'Conciertos';
export const CONCERTS_TIME_ZONE = 'America/Mexico_City';

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
/** Read and write calendars (find the calendar, read and add concerts). */
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar';
export const GOOGLE_LOGIN_PATH = '/api/conciertos/google/login';
export const GOOGLE_CALLBACK_PATH = '/api/conciertos/google/callback';
/** A login that never comes back is forgotten after this. */
export const GOOGLE_PENDING_LOGIN_MS = 10 * 60_000;
/**
 * The app stays in Google's "Testing" status (publishing needs public homepage and privacy pages), where a refresh
 * token dies 7 days after the login. Warn a day before so a reconnect can happen on the user's time.
 */
export const GOOGLE_TESTING_TOKEN_DAYS = 7;
export const GOOGLE_RECONNECT_WARN_DAYS = 1;

export const TICKETMASTER_EVENTS_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
export const TICKETMASTER_COUNTRY = 'MX';
/** Ticketmaster's free tier allows 5 calls per second; stay well under it. */
export const TICKETMASTER_GAP_MS = 300;

export const FETCH_TIMEOUT_MS = 15_000;
/** How far ahead the panel looks. */
export const CONCERTS_HORIZON_DAYS = 400;
/** Re-read the calendar while a page is open. */
export const CONCERTS_REFRESH_MS = 15 * 60_000;
export const CONCERTS_TICK_MS = 60_000;
