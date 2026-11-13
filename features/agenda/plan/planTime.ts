// Wall-clock helpers for one IANA zone. Pure: every instant is passed in, never read from the machine.
import { MINUTES_PER_HOUR, MS_PER_DAY, MS_PER_MINUTE } from './constants.js';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallParts(ms: number, timeZone: string): WallParts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(ms)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out['year'],
    month: out['month'],
    day: out['day'],
    hour: out['hour'] % 24,
    minute: out['minute'],
    second: out['second'],
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** 'YYYY-MM-DD' of the instant in the zone. */
export function wallDay(ms: number, timeZone: string): string {
  const p = wallParts(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since the zone's midnight (seconds dropped). */
export function wallMinutes(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  return p.hour * MINUTES_PER_HOUR + p.minute;
}

/** Zone offset at the instant, in ms (wall time read as UTC minus the instant). */
function offsetAt(ms: number, timeZone: string): number {
  const p = wallParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

function dayUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcDay(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The instant the zone's clock shows `minutes` on `day` (two passes over the offset, for DST days). */
export function wallToMs(day: string, minutes: number, timeZone: string): number {
  const target = dayUtc(day) + minutes * MS_PER_MINUTE;
  const first = target - offsetAt(target, timeZone);
  return target - offsetAt(first, timeZone);
}

export function addDays(day: string, n: number): string {
  return utcDay(dayUtc(day) + n * MS_PER_DAY);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function dayDiff(a: string, b: string): number {
  return Math.round((dayUtc(b) - dayUtc(a)) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(day: string): number {
  return new Date(dayUtc(day)).getUTCDay();
}

/** 'HH:MM' (24 h). */
export function hhmm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${pad(Math.floor(m / MINUTES_PER_HOUR))}:${pad(m % MINUTES_PER_HOUR)}`;
}

/** Minutes of a valid 'HH:MM' (00:00–23:59), else null. */
export function parseHhmm(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * MINUTES_PER_HOUR + min;
}

/** True for a well-formed 'YYYY-MM-DD' that is a real date. */
export function isDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && utcDay(dayUtc(s)) === s;
}
