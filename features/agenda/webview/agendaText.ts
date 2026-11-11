import type { AgendaCalendar, AgendaItem } from '../../../core/src/messages.js';

const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD of a Date in local time. */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-07" → that day at local midnight. */
export function dayDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const addDay = (day: string, n: number): string => {
  const d = dayDate(day);
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

/** The `n` days shown, from `from` (YYYY-MM-DD). */
export const daysFrom = (from: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => addDay(from, i));

/** "hoy", "mañana", or "vie 7 nov". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Hoy';
  if (day === addDay(today, 1)) return 'Mañana';
  const text = dayDate(day).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The local day an item falls on (a timed event: its start in local time). Undefined: a task without a date. */
export function itemDay(item: AgendaItem): string | undefined {
  if (!item.start) return undefined;
  if (item.allDay || item.start.length <= 10) return item.start.slice(0, 10);
  return localDay(new Date(item.start));
}

/** Days an all-day event covers (its end is exclusive). */
function allDayCovers(item: AgendaItem, day: string): boolean {
  const start = item.start?.slice(0, 10);
  if (!start) return false;
  const end = item.end?.slice(0, 10) ?? addDay(start, 1);
  return start <= day && day < end;
}

/** "20:00" (local) of a timed event; empty for all-day ones and tasks. */
export function timeText(item: AgendaItem): string {
  if (item.allDay || !item.start || item.start.length <= 10) return '';
  const d = new Date(item.start);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "09:00–18:00" of a timed event (just the start when it has no end). */
export function rangeText(item: AgendaItem): string {
  const start = timeText(item);
  if (!start || !item.end || item.end.length <= 10) return start;
  const e = new Date(item.end);
  return `${start}–${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

/** The type word of a title ("Salida" for "Salida: Cena") and the rest; no type when there's no "Word:" start. */
export function splitPrefix(title: string): { prefix?: string; rest: string } {
  const m = /^\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+):\s*(.*)$/.exec(title);
  if (!m || !m[2]) return { rest: title.trim() };
  return { prefix: m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(), rest: m[2].trim() };
}

/** Start and end (ms) of a timed event; null for all-day events and tasks. */
function span(item: AgendaItem): [number, number] | null {
  if (item.kind !== 'event' || item.allDay || !item.start || item.start.length <= 10) return null;
  const a = Date.parse(item.start);
  const b = item.end ? Date.parse(item.end) : a;
  return Number.isFinite(a) && Number.isFinite(b) ? [a, Math.max(a, b)] : null;
}

/** Pairs of timed events that overlap (touching ends don't count). */
export function findConflicts(items: readonly AgendaItem[]): Array<[AgendaItem, AgendaItem]> {
  const timed = items
    .map((i) => ({ i, s: span(i) }))
    .filter((x): x is { i: AgendaItem; s: [number, number] } => x.s !== null)
    .sort((x, y) => x.s[0] - y.s[0]);
  const out: Array<[AgendaItem, AgendaItem]> = [];
  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length && timed[b].s[0] < timed[a].s[1]; b++) {
      out.push([timed[a].i, timed[b].i]);
    }
  }
  return out;
}

/** Ids (kind:id) of the events that clash with another one. */
export function conflictKeys(items: readonly AgendaItem[]): Set<string> {
  const out = new Set<string>();
  for (const [a, b] of findConflicts(items)) {
    out.add(itemKey(a));
    out.add(itemKey(b));
  }
  return out;
}

export const itemKey = (i: AgendaItem): string =>
  `${i.kind}:${i.calendar ? `${i.calendar}:` : ''}${i.id}`;

/** The calendar a new event goes to by default: the shared one for things for both, the owner's own for the rest. */
export function defaultCalendar(
  kindId: string,
  shared: string | undefined,
  home: string | undefined,
): string | undefined {
  return kindId === 'concierto' || kindId === 'salida' ? shared : (home ?? shared);
}

/** What the owner is about to add, as the panel holds it. */
export interface AgendaDraft {
  kind: 'event' | 'task';
  title: string;
  date?: string;
  time?: string;
  endTime?: string;
  /** Calendar id for an event. */
  calendar?: string;
}

/** The draft as an item (to check clashes before saving); the end defaults to one hour later. */
export function draftItem(d: AgendaDraft): AgendaItem | null {
  if (d.kind !== 'event' || !d.date) return null;
  if (!d.time) return { id: 'nuevo', kind: 'event', title: d.title, start: d.date, allDay: true };
  const [y, m, day] = d.date.split('-').map(Number);
  const [hh, mm] = d.time.split(':').map(Number);
  const start = new Date(y, m - 1, day, hh, mm);
  let end = new Date(start.getTime() + 3_600_000);
  if (d.endTime) {
    const [eh, em] = d.endTime.split(':').map(Number);
    end = new Date(y, m - 1, day, eh, em);
    if (end <= start) end = new Date(y, m - 1, day + 1, eh, em);
  }
  return {
    id: 'nuevo',
    kind: 'event',
    title: d.title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
  };
}

/** Existing events the draft would clash with. */
export function draftConflicts(d: AgendaDraft, items: readonly AgendaItem[]): AgendaItem[] {
  const draft = draftItem(d);
  if (!draft || draft.allDay) return [];
  return findConflicts([draft, ...items])
    .filter(([a, b]) => a === draft || b === draft)
    .map(([a, b]) => (a === draft ? b : a));
}

/** One line saying what will be saved and where ("Salida: Cena · sáb 7 nov, 20:00 → Familia"). */
export function draftSummary(
  d: AgendaDraft,
  today: string,
  calendars: readonly AgendaCalendar[] = [],
): string {
  const when = d.date
    ? `${dayLabel(d.date, today).toLowerCase()}${d.time ? `, ${d.time}${d.endTime ? `–${d.endTime}` : ''}` : d.kind === 'event' ? ', todo el día' : ''}`
    : 'sin fecha';
  const cal = calendars.find((c) => c.id === d.calendar);
  const where =
    d.kind === 'task'
      ? 'tus tareas (solo tú las ves)'
      : cal
        ? `el calendario "${cal.name}"`
        : 'el calendario';
  return `"${d.title}" · ${when} → ${where}`;
}

export interface AgendaDay {
  day: string;
  events: AgendaItem[];
  tasks: AgendaItem[];
}

/**
 * The items by day, from `from` for `n` days. Overdue tasks go on today (the panel marks them); tasks without a
 * date come back apart. Timed events are sorted by start, all-day ones first.
 */
export function groupByDay(
  items: readonly AgendaItem[],
  from: string,
  n: number,
): { days: AgendaDay[]; undated: AgendaItem[] } {
  const days = daysFrom(from, n).map((day) => ({
    day,
    events: [] as AgendaItem[],
    tasks: [] as AgendaItem[],
  }));
  const undated: AgendaItem[] = [];
  for (const item of items) {
    if (item.kind === 'task') {
      const day = itemDay(item);
      if (!day) undated.push(item);
      else (days.find((d) => d.day === (day < from ? from : day)) ?? null)?.tasks.push(item);
      continue;
    }
    for (const d of days) {
      if (item.allDay ? allDayCovers(item, d.day) : itemDay(item) === d.day) d.events.push(item);
    }
  }
  for (const d of days) {
    d.events.sort((a, b) =>
      a.allDay !== b.allDay
        ? a.allDay
          ? -1
          : 1
        : Date.parse(a.start ?? '') - Date.parse(b.start ?? ''),
    );
  }
  return { days, undated };
}
