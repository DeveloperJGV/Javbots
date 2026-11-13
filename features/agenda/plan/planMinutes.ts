// How long a task takes: by hand, by a mark in its text, by a rule, or the default block.
import type { AgendaPlanMinutesSource, AgendaPlanPrefs } from '../../../core/src/messages.js';
import {
  GARDEN_CARE_WORDS,
  MINUTES_PER_HOUR,
  PLAN_MAX_GARDEN_MINUTES,
  PLAN_MAX_TASK_MINUTES,
  PLAN_MIN_GARDEN_MINUTES,
  PLAN_MIN_TASK_MINUTES,
  PLAN_MINUTES_STEP,
} from './constants.js';
import type { PlanTaskInput } from './plan.js';

// "(1 h)", "(1h)", "(2 horas)", "(1.5 h)", "(1 h 30)", "(1h30)", "(1 h 30 min)".
const HOURS_MARK =
  /\(\s*(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|h)\s*(?:(\d{1,2})\s*(?:minutos?|mins?|m)?\s*)?\)/i;
// "(15 min)", "(15m)", "(20 minutos)". A bare number like "(2)" is not a mark.
const MINUTES_MARK = /\(\s*(\d+)\s*(?:minutos?|mins?|m)\s*\)/i;

/** Lower case without accents ("Jardín" → "jardin"). */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function words(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function findMark(text: string): { minutes: number; index: number; length: number } | null {
  const h = HOURS_MARK.exec(text);
  if (h) {
    const minutes = Number(h[1].replace(',', '.')) * MINUTES_PER_HOUR + (h[2] ? Number(h[2]) : 0);
    return { minutes, index: h.index, length: h[0].length };
  }
  const m = MINUTES_MARK.exec(text);
  if (m) return { minutes: Number(m[1]), index: m.index, length: m[0].length };
  return null;
}

/** The duration written in the text, in minutes, or null. */
export function markMinutes(text: string | undefined): number | null {
  if (!text) return null;
  const mark = findMark(text);
  return mark && mark.minutes > 0 ? mark.minutes : null;
}

/** The title without its duration mark ("Pintar la reja (1 h)" → "Pintar la reja"). */
export function cleanTitle(title: string): string {
  const mark = findMark(title);
  if (!mark) return title.trim();
  const out = (title.slice(0, mark.index) + ' ' + title.slice(mark.index + mark.length))
    .replace(/\s+/g, ' ')
    .trim();
  return out || title.trim();
}

/** A care of the garden list ("Regar helecho"), as opposed to "Comprar fertilizante". */
export function isGardenCare(task: PlanTaskInput, prefs: AgendaPlanPrefs): boolean {
  const list = fold(prefs.gardenList.trim());
  if (!list || !task.listName || fold(task.listName.trim()) !== list) return false;
  const first = words(task.title)[0];
  return first !== undefined && GARDEN_CARE_WORDS.includes(first);
}

/** Bounded and rounded up to the step. */
export function roundMinutes(minutes: number): number {
  const up = Math.ceil(minutes / PLAN_MINUTES_STEP) * PLAN_MINUTES_STEP;
  return Math.min(PLAN_MAX_TASK_MINUTES, Math.max(PLAN_MIN_TASK_MINUTES, up));
}

/** A garden care keeps its real minutes (at least 1, never rounded to the step). */
export function gardenRound(minutes: number): number {
  const m = Math.ceil(minutes);
  return Math.min(PLAN_MAX_GARDEN_MINUTES, Math.max(PLAN_MIN_GARDEN_MINUTES, m));
}

/** A garden care: by hand > mark > first garden rule that starts its first word > gardenMinutes. */
function gardenMinutes(
  task: PlanTaskInput,
  prefs: AgendaPlanPrefs,
  manual: number | null,
): { minutes: number; source: AgendaPlanMinutesSource } {
  if (manual !== null) return { minutes: gardenRound(manual), source: 'manual' };
  const mark = markMinutes(task.title) ?? markMinutes(task.notes);
  if (mark !== null) return { minutes: gardenRound(mark), source: 'mark' };
  const first = words(task.title)[0] ?? '';
  for (const rule of prefs.gardenRules) {
    const word = fold(rule.word.trim());
    if (word && first.startsWith(word)) {
      return { minutes: gardenRound(rule.minutes), source: 'rule' };
    }
  }
  return { minutes: gardenRound(prefs.gardenMinutes), source: 'default' };
}

export function taskMinutes(
  task: PlanTaskInput,
  prefs: AgendaPlanPrefs,
  overrides?: Record<string, number>,
  garden?: boolean,
): { minutes: number; source: AgendaPlanMinutesSource } {
  const set = overrides?.[task.id];
  const manual = typeof set === 'number' && Number.isFinite(set) && set > 0 ? set : null;
  if (garden ?? isGardenCare(task, prefs)) return gardenMinutes(task, prefs, manual);
  if (manual !== null) return { minutes: roundMinutes(manual), source: 'manual' };
  const mark = markMinutes(task.title) ?? markMinutes(task.notes);
  if (mark !== null) return { minutes: roundMinutes(mark), source: 'mark' };
  const titleWords = words(task.title);
  for (const rule of prefs.rules) {
    const word = fold(rule.word.trim());
    if (word && titleWords.some((w) => w.startsWith(word))) {
      return { minutes: roundMinutes(rule.minutes), source: 'rule' };
    }
  }
  return { minutes: roundMinutes(prefs.blockMinutes), source: 'default' };
}
