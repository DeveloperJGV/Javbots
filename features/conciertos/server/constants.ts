export const LOG_PREFIX = '[Conciertos]';

/** ~/.pixel-agents/conciertos.json: keys (filled by hand) and the calendar's id (written by the server). */
export const CONCERTS_CONFIG_FILE = 'conciertos.json';

/** Only events whose title starts with this (case-insensitive) are concerts. */
export const CONCERT_PREFIX = 'Concierto:';
/**
 * The calendar the concerts are read from and added to, when conciertos.json doesn't name one (`calendario`). An
 * existing calendar of the owner: the office never creates or shares calendars.
 */
export const DEFAULT_CALENDAR_NAME = 'Conciertos';
export const CONCERTS_TIME_ZONE = 'America/Mexico_City';

export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

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
