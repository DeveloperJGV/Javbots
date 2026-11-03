import type { AgendaItem } from '../../../core/src/messages.js';
import type { GoogleApi } from '../../google/server/googleAccount.js';
import {
  AGENDA_TIME_ZONE,
  CALENDAR_API,
  DEFAULT_EVENT_MINUTES,
  MAX_TITLE_LENGTH,
  TASK_LIST,
  TASKS_API,
} from './constants.js';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const items = (raw: unknown): Raw[] =>
  Array.isArray(obj(raw).items) ? (obj(raw).items as unknown[]).map(obj) : [];

/** No calendar by that name among the ones the owner can write to. */
export class CalendarNotFound extends Error {}

const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD of a Date in local time. */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local midnight of the day `n` days after `d`. */
export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Calendar events → agenda items (cancelled ones left out), in Google's order. */
export function parseEvents(raw: unknown): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const e of items(raw)) {
    if (e.status === 'cancelled') continue;
    const start = obj(e.start);
    const end = obj(e.end);
    const when = str(start.dateTime) || str(start.date);
    if (!str(e.id) || !when) continue;
    const item: AgendaItem = {
      id: str(e.id),
      kind: 'event',
      title: str(e.summary).trim() || '(sin título)',
      start: when,
      allDay: !start.dateTime,
    };
    const until = str(end.dateTime) || str(end.date);
    if (until) item.end = until;
    if (str(e.location)) item.location = str(e.location);
    if (str(e.htmlLink)) item.link = str(e.htmlLink);
    out.push(item);
  }
  return out;
}

/**
 * Pending tasks → agenda items: the ones due before `untilDay` (overdue included) and the ones without a date.
 * A task's due date is a day: Google keeps no time for it.
 */
export function parseTasks(raw: unknown, untilDay: string): AgendaItem[] {
  const out: AgendaItem[] = [];
  for (const t of items(raw)) {
    if (t.status === 'completed' || t.deleted === true || t.hidden === true) continue;
    const title = str(t.title).trim();
    if (!str(t.id) || !title) continue;
    const day = str(t.due).slice(0, 10);
    if (day && day >= untilDay) continue;
    const item: AgendaItem = { id: str(t.id), kind: 'task', title, allDay: true };
    if (day) item.start = day;
    if (str(t.webViewLink)) item.link = str(t.webViewLink);
    out.push(item);
  }
  return out;
}

/** What the panel sends to add, already checked. */
export interface NewAgendaItem {
  kind: 'event' | 'task';
  title: string;
  date?: string;
  time?: string;
  endTime?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks a client message; null when something is missing or malformed (nothing is sent to Google then). */
export function readNewItem(msg: Record<string, unknown>): NewAgendaItem | null {
  const kind = msg.kind;
  const title = typeof msg.title === 'string' ? msg.title.trim() : '';
  if ((kind !== 'event' && kind !== 'task') || !title || title.length > MAX_TITLE_LENGTH)
    return null;
  const opt = (v: unknown, re: RegExp): string | undefined | false =>
    v === undefined || v === '' ? undefined : typeof v === 'string' && re.test(v) ? v : false;
  const date = opt(msg.date, DAY_RE);
  const time = opt(msg.time, TIME_RE);
  const endTime = opt(msg.endTime, TIME_RE);
  if (date === false || time === false || endTime === false) return null;
  if (kind === 'event' && !date) return null;
  if (!date && time) return null;
  return { kind, title, date, time: time || undefined, endTime: time ? endTime : undefined };
}

/** "YYYY-MM-DD" + "HH:MM" (+ minutes) → local "YYYY-MM-DDTHH:MM:00" (rolls over midnight). */
function localDateTime(day: string, time: string, plusMinutes = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm + plusMinutes);
  return `${localDay(t)}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
}

/** The Google Calendar event body for a new event (all-day without a time; one hour without an end time). */
export function eventBody(item: NewAgendaItem): Raw {
  const day = item.date as string;
  if (!item.time) {
    const [y, m, d] = day.split('-').map(Number);
    return {
      summary: item.title,
      start: { date: day },
      end: { date: localDay(new Date(y, m - 1, d + 1)) },
    };
  }
  let end = item.endTime
    ? localDateTime(day, item.endTime)
    : localDateTime(day, item.time, DEFAULT_EVENT_MINUTES);
  // An end before the start means it goes past midnight.
  if (end <= localDateTime(day, item.time)) {
    const [y, m, d] = day.split('-').map(Number);
    end = localDateTime(localDay(new Date(y, m - 1, d + 1)), item.endTime as string);
  }
  return {
    summary: item.title,
    start: { dateTime: localDateTime(day, item.time), timeZone: AGENDA_TIME_ZONE },
    end: { dateTime: end, timeZone: AGENDA_TIME_ZONE },
  };
}

/** The calendar and the tasks, through the shared Google session (features/google). */
export function createAgendaGoogle(api: GoogleApi) {
  return {
    /** An existing calendar the owner can write to, by id or by name (any case). Never creates one. */
    async findCalendar(name: string, knownId?: string): Promise<string> {
      const list = await api(
        `${CALENDAR_API}/users/me/calendarList?minAccessRole=writer&maxResults=250`,
      );
      const all = items(list);
      const found =
        all.find((c) => knownId && c.id === knownId) ??
        all.find((c) => str(c.summary).toLowerCase() === name.toLowerCase());
      if (!found) throw new CalendarNotFound(name);
      return str(found.id);
    },

    async listEvents(calendarId: string, from: Date, to: Date): Promise<AgendaItem[]> {
      const q = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
      });
      return parseEvents(
        await api(
          `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
        ),
      );
    },

    async addEvent(calendarId: string, item: NewAgendaItem): Promise<void> {
      await api(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: eventBody(item),
      });
    },

    async listTasks(untilDay: string): Promise<AgendaItem[]> {
      const q = new URLSearchParams({
        showCompleted: 'false',
        showHidden: 'false',
        maxResults: '100',
      });
      return parseTasks(
        await api(`${TASKS_API}/lists/${TASK_LIST}/tasks?${q.toString()}`),
        untilDay,
      );
    },

    async addTask(item: NewAgendaItem): Promise<void> {
      const body: Raw = { title: item.title };
      // Tasks keep only the day: midnight UTC is how Google writes it.
      if (item.date) body.due = `${item.date}T00:00:00.000Z`;
      await api(`${TASKS_API}/lists/${TASK_LIST}/tasks`, { method: 'POST', body });
    },

    async completeTask(id: string): Promise<void> {
      await api(`${TASKS_API}/lists/${TASK_LIST}/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status: 'completed' },
      });
    },
  };
}

export type AgendaGoogle = ReturnType<typeof createAgendaGoogle>;
