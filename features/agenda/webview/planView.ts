import type {
  AgendaPlan,
  AgendaPlanBlock,
  AgendaPlanDay,
  AgendaPlanPrefs,
  AgendaPlanRange,
  AgendaPlanTask,
  AgendaStatus,
} from '../../../core/src/messages.js';
import { minutesText } from '../plan/planText.js';
import {
  HOURS_PER_DAY,
  PLAN_BLOCK_MULTIPLES,
  PLAN_GARDEN_OPTIONS,
  PLAN_QUICK_OPTIONS,
} from './constants.js';

/** The plan to show: only while Google is connected. */
export function planOf(status: AgendaStatus | undefined): AgendaPlan | undefined {
  return status?.connected ? status.plan : undefined;
}

/** Every task id in a block ("Hecho" / "Hoy no" act on all of them). */
export function blockIds(block: AgendaPlanBlock): string[] {
  return block.tasks.map((t) => t.id);
}

/** Which choices a task's "cuánto tarda" offers: a whole task, a small thing, or a plant care. */
export type MinuteKind = 'task' | 'quick' | 'garden';

/**
 * The minute choices for a task, plus its current value when it is not among them, sorted. A task of whole blocks
 * gets 1-4 blocks; a small one alone gets the small choices and then the blocks.
 */
export function minuteOptions(current: number, kind: MinuteKind, blockMinutes: number): number[] {
  const blocks = PLAN_BLOCK_MULTIPLES.map((n) => n * blockMinutes);
  const list =
    kind === 'garden'
      ? [...PLAN_GARDEN_OPTIONS]
      : kind === 'quick'
        ? [...PLAN_QUICK_OPTIONS]
        : current >= blockMinutes
          ? blocks
          : [...PLAN_QUICK_OPTIONS, ...blocks];
  if (current > 0 && !list.includes(current)) list.push(current);
  return [...new Set(list)].sort((a, b) => a - b);
}

/** Label of a minute option: "30 min", and "30 min (auto)" for the task's own value when the rules chose it. */
export function minuteLabel(minutes: number, task: AgendaPlanTask): string {
  const auto = task.source !== 'manual' && minutes === task.minutes;
  return auto ? `${minutesText(minutes)} (auto)` : minutesText(minutes);
}

/** "parte 1 de 2" when the block is a piece of a longer task and its reason does not say so already. */
export function partText(block: AgendaPlanBlock): string {
  if (!block.parts || block.parts < 2 || !block.part) return '';
  const text = `parte ${block.part} de ${block.parts}`;
  return block.why.toLowerCase().includes(text) ? '' : text;
}

/** The days after today that have something planned. */
export function weekDays(plan: AgendaPlan): AgendaPlanDay[] {
  return plan.days.slice(1).filter((d) => d.blocks.length > 0);
}

/** The empty-today message, or null when today has blocks. */
export function emptyPlanText(plan: AgendaPlan): string | null {
  if (plan.days[0]?.blocks.length) return null;
  const later = weekDays(plan).length > 0 || plan.leftover.length > 0;
  return later
    ? 'Por hoy ya no toca nada. Lo pendiente quedó repartido en los próximos días. Descansa.'
    : 'Hoy no toca nada. Descansa.';
}

/** "07:15 · 30 min · Regar helecho — porque …" (a line of the week list). */
export function weekLine(block: AgendaPlanBlock): string {
  const head = `${block.start} · ${minutesText(block.minutes)} · ${block.title}`;
  return block.why ? `${head} — ${block.why}` : head;
}

/** Deep equality of two preference sets (order matters in lists). */
export function prefsEqual(a: AgendaPlanPrefs, b: AgendaPlanPrefs): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(p: AgendaPlanPrefs): unknown[] {
  const keys = Object.keys(p).sort() as (keyof AgendaPlanPrefs)[];
  return keys.map((k) => [k, k === 'workDays' ? [...p.workDays].sort((x, y) => x - y) : p[k]]);
}

/** Toggle one week day (0 = Sunday) in the work days, kept sorted. */
export function toggleDay(days: readonly number[], day: number): number[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return next.sort((a, b) => a - b);
}

/** A whole number from an input; falls back when empty or not a number, never below `min`. */
export function numberFrom(text: string, fallback: number, min = 0): number {
  const n = Math.round(Number(text));
  return text.trim() === '' || !Number.isFinite(n) ? fallback : Math.max(min, n);
}

/** A typed 24 h time as "HH:MM": accepts "7:30", "07:30", "730", "0730" and "7"; null when it is not 00:00–23:59. */
export function normalizeTime(text: string): string | null {
  const t = text.trim();
  const m =
    /^(\d{1,2}):(\d{2})$/.exec(t) ?? /^(\d{1,2})(\d{2})$/.exec(t) ?? /^(\d{1,2})()$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Both ends are valid times and the range starts before it ends. */
export function rangeOk(range: AgendaPlanRange): boolean {
  const from = normalizeTime(range.from);
  const to = normalizeTime(range.to);
  return !!from && !!to && from < to;
}

/** Every time in the preferences is a valid "HH:MM" and every range goes forward (ready to save). */
export function prefsValid(prefs: AgendaPlanPrefs): boolean {
  const ranges = [prefs.morning, prefs.work, prefs.evening, prefs.weekend, ...prefs.rest];
  const exact = (t: string) => normalizeTime(t) === t;
  return ranges.every((r) => exact(r.from) && exact(r.to) && rangeOk(r)) && exact(prefs.morningAt);
}

/** A typed time is fine when it is already "HH:MM" (24 h), or empty where a time is optional. */
export function timeFieldOk(value: string, optional = false): boolean {
  return value === '' ? optional : normalizeTime(value) === value;
}

/** "00:00", "00:30" … "23:30": the times suggested when adding an event (the plan thinks in half hours). */
export function halfHours(): string[] {
  const out: string[] = [];
  for (let h = 0; h < HOURS_PER_DAY; h++) {
    const hh = String(h).padStart(2, '0');
    out.push(`${hh}:00`, `${hh}:30`);
  }
  return out;
}
