import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { AgendaPlanPrefs } from '../../../core/src/messages.js';
import { readPlanPrefs } from '../plan/planPrefs.js';
import { AGENDA_PLAN_FILE, LOG_PREFIX } from './constants.js';

export function agendaPlanPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', AGENDA_PLAN_FILE);
}

/** agenda-plan.json: written by the office only (agenda.json stays read-only). */
export interface PlanState {
  prefs: AgendaPlanPrefs;
  /** Minutes set by hand, by task id. */
  minutes: Record<string, number>;
  /** "Not today": task id → the day (YYYY-MM-DD) it was said on. */
  skipped: Record<string, string>;
  /** The day the morning summary was last given (once a day, across restarts). */
  morningDay?: string;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The plan's state; never throws (a missing or broken file reads as empty, with the factory prefs). */
export function readPlanState(file = agendaPlanPath()): PlanState {
  let raw: Raw = {};
  try {
    raw = obj(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  const minutes: Record<string, number> = {};
  for (const [id, n] of Object.entries(obj(raw.minutes)))
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) minutes[id] = n;
  const skipped: Record<string, string> = {};
  for (const [id, day] of Object.entries(obj(raw.skipped)))
    if (typeof day === 'string' && DAY_RE.test(day)) skipped[id] = day;
  const state: PlanState = { prefs: readPlanPrefs(raw.prefs ?? {}), minutes, skipped };
  if (typeof raw.morningDay === 'string' && DAY_RE.test(raw.morningDay))
    state.morningDay = raw.morningDay;
  return state;
}

/** Writes the whole state at once (temp file + rename), creating the folder. */
export function writePlanState(file: string, state: PlanState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

/** The machine's own time zone. */
export const machineTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The day (YYYY-MM-DD) and the time (HH:MM, 24 h) of an instant in a time zone (the machine's if it's unknown). */
export function zonedClock(ms: number, timeZone: string): { day: string; time: string } {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  };
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone });
  } catch {
    fmt = new Intl.DateTimeFormat('en-CA', opts);
  }
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(ms)) p[part.type] = part.value;
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
