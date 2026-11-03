import type { GoogleApi } from '../../google/server/googleAccount.js';
import { CONCERT_PREFIX, CONCERTS_TIME_ZONE, GOOGLE_CALENDAR_API } from './constants.js';

/** A concert as the panel shows it: an event of the configured calendar whose title starts with "Concierto:". */
export interface CalendarConcert {
  id: string;
  /** The title without the "Concierto:" prefix. */
  title: string;
  /** Best guess at the artist: the title up to " – " / " - " / ":". */
  artist: string;
  /** ISO date-time, or YYYY-MM-DD for an all-day event. */
  start: string;
  allDay: boolean;
  location?: string;
  link?: string;
}

/** No calendar by that name among the ones the owner can write to. */
export class CalendarNotFound extends Error {}

/** Strips the prefix (any case) and guesses the artist from the rest. Null when it isn't a concert. */
export function parseConcertTitle(summary: string): { title: string; artist: string } | null {
  const s = summary.trim();
  if (s.slice(0, CONCERT_PREFIX.length).toLowerCase() !== CONCERT_PREFIX.toLowerCase()) return null;
  const title = s.slice(CONCERT_PREFIX.length).trim();
  if (!title) return null;
  const artist = title.split(/\s+[–—-]\s+|:\s/)[0].trim() || title;
  return { title, artist };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Google Calendar events → concerts (cancelled and non-"Concierto:" events left out), soonest first. */
export function parseConcertEvents(raw: unknown): CalendarConcert[] {
  const out: CalendarConcert[] = [];
  for (const item of Array.isArray(obj(raw).items) ? (obj(raw).items as unknown[]) : []) {
    const e = obj(item);
    if (e.status === 'cancelled') continue;
    const parsed = parseConcertTitle(str(e.summary));
    const start = obj(e.start);
    const when = str(start.dateTime) || str(start.date);
    if (!parsed || !when) continue;
    const concert: CalendarConcert = {
      id: str(e.id),
      ...parsed,
      start: when,
      allDay: !start.dateTime,
    };
    if (str(e.location)) concert.location = str(e.location);
    if (str(e.htmlLink)) concert.link = str(e.htmlLink);
    out.push(concert);
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/**
 * The concerts' side of the owner's Google Calendar, through the shared Google session (features/google): find the
 * calendar, read its concerts and add one.
 */
export function createGoogleCalendar(api: GoogleApi) {
  return {
    /**
     * An existing calendar the owner can write to: the remembered id if it is still there, else the one with this
     * name (case-insensitive). Never creates one: the office works on the owner's own calendars.
     */
    async findCalendar(name: string, knownId?: string): Promise<string> {
      const list = await api(
        `${GOOGLE_CALENDAR_API}/users/me/calendarList?minAccessRole=writer&maxResults=250`,
      );
      const items = Array.isArray(list.items) ? list.items.map(obj) : [];
      const found =
        items.find((c) => knownId && c.id === knownId) ??
        items.find((c) => str(c.summary).toLowerCase() === name.toLowerCase());
      if (!found) throw new CalendarNotFound(name);
      return str(found.id);
    },

    async listConcerts(
      calendarId: string,
      fromMs: number,
      toMs: number,
    ): Promise<CalendarConcert[]> {
      const q = new URLSearchParams({
        timeMin: new Date(fromMs).toISOString(),
        timeMax: new Date(toMs).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      });
      return parseConcertEvents(
        await api(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
        ),
      );
    },

    /** Adds a concert ("Concierto: <title>") found on Ticketmaster. */
    async addConcert(
      calendarId: string,
      c: { title: string; start: string; allDay: boolean; location?: string; url?: string },
    ): Promise<void> {
      const startDate = new Date(c.start);
      const event: Raw = {
        summary: `${CONCERT_PREFIX} ${c.title}`,
        location: c.location,
        description: c.url ? `Boletos: ${c.url}` : undefined,
      };
      if (c.allDay) {
        const day = c.start.slice(0, 10);
        const next = new Date(`${day}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        event.start = { date: day };
        event.end = { date: next.toISOString().slice(0, 10) };
      } else {
        event.start = { dateTime: startDate.toISOString(), timeZone: CONCERTS_TIME_ZONE };
        event.end = {
          dateTime: new Date(startDate.getTime() + 3 * 3600_000).toISOString(),
          timeZone: CONCERTS_TIME_ZONE,
        };
      }
      await api(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: event,
      });
    },
  };
}

export type GoogleCalendar = ReturnType<typeof createGoogleCalendar>;
