import type {
  AgendaPlanPrefs,
  AgendaPlanRange,
  AgendaPlanRule,
} from '../../../core/src/messages.js';
import {
  MINUTES_PER_DAY,
  PLAN_BLOCK_STEP,
  PLAN_MAX_BLOCK_MINUTES,
  PLAN_MAX_GARDEN_LIST,
  PLAN_MAX_GARDEN_MINUTES,
  PLAN_MAX_GARDEN_RULES,
  PLAN_MAX_GARDEN_SETUP,
  PLAN_MAX_REST_RANGES,
  PLAN_MAX_RULE_WORD,
  PLAN_MAX_RULES,
  PLAN_MAX_TASK_MINUTES,
  PLAN_MIN_BLOCK_MINUTES,
  PLAN_MIN_GARDEN_MINUTES,
  PLAN_MIN_TASK_MINUTES,
} from './constants.js';
import { parseHhmm } from './planTime.js';

const RULE_MINUTES = 10;
const RULE_CHECK_MINUTES = 15;
const RULE_CHORE_MINUTES = 30;

export const DEFAULT_PLAN_PREFS: AgendaPlanPrefs = {
  blockMinutes: 30,
  dailyBlocks: 3,
  smallMinutes: 15,
  marginMinutes: 10,
  soonDays: 2,
  workDays: [1, 2, 3, 4, 5],
  morning: { from: '07:00', to: '09:00' },
  work: { from: '09:00', to: '18:00' },
  evening: { from: '18:00', to: '20:00' },
  weekend: { from: '10:00', to: '13:00' },
  rest: [{ from: '14:00', to: '15:00' }],
  rules: [
    { word: 'regar', minutes: RULE_MINUTES },
    { word: 'llamar', minutes: RULE_MINUTES },
    { word: 'pagar', minutes: RULE_MINUTES },
    { word: 'mandar', minutes: RULE_MINUTES },
    { word: 'enviar', minutes: RULE_MINUTES },
    { word: 'contestar', minutes: RULE_MINUTES },
    { word: 'agendar', minutes: RULE_MINUTES },
    { word: 'revisar', minutes: RULE_CHECK_MINUTES },
    { word: 'limpiar', minutes: RULE_CHORE_MINUTES },
    { word: 'lavar', minutes: RULE_CHORE_MINUTES },
    { word: 'ordenar', minutes: RULE_CHORE_MINUTES },
    { word: 'comprar', minutes: RULE_CHORE_MINUTES },
  ],
  gardenList: 'Jardín',
  gardenMinutes: 5,
  gardenRules: [
    { word: 'regar', minutes: 3 },
    { word: 'limpiar', minutes: 5 },
    { word: 'abonar', minutes: 2 },
    { word: 'podar', minutes: 15 },
  ],
  gardenSetupMinutes: 3,
  morningNotice: true,
  morningAt: '08:00',
  remindMinutes: 0,
};

/** Integer bounds of each numeric preference. */
const LIMITS = {
  dailyBlocks: [1, 24],
  smallMinutes: [0, 240],
  marginMinutes: [0, 120],
  soonDays: [0, 30],
  gardenMinutes: [PLAN_MIN_GARDEN_MINUTES, PLAN_MAX_GARDEN_MINUTES],
  gardenSetupMinutes: [0, PLAN_MAX_GARDEN_SETUP],
  remindMinutes: [0, 120],
} as const;

type NumberKey = keyof typeof LIMITS;

function int(v: unknown, fallback: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function range(v: unknown): AgendaPlanRange | null {
  if (!v || typeof v !== 'object') return null;
  const { from, to } = v as Record<string, unknown>;
  const a = parseHhmm(from);
  const b = parseHhmm(to);
  if (a === null || b === null || a >= b || b > MINUTES_PER_DAY) return null;
  return { from: (from as string).trim(), to: (to as string).trim() };
}

function rules(
  v: unknown,
  most = PLAN_MAX_RULES,
  min = PLAN_MIN_TASK_MINUTES,
  max = PLAN_MAX_TASK_MINUTES,
): AgendaPlanRule[] | null {
  if (!Array.isArray(v)) return null;
  const out: AgendaPlanRule[] = [];
  for (const r of v) {
    if (out.length >= most) break;
    if (!r || typeof r !== 'object') continue;
    const { word, minutes } = r as Record<string, unknown>;
    if (typeof word !== 'string') continue;
    const w = word.trim();
    if (!w || w.length > PLAN_MAX_RULE_WORD) continue;
    if (typeof minutes !== 'number' || !Number.isFinite(minutes)) continue;
    out.push({ word: w, minutes: int(minutes, 0, min, max) });
  }
  return out;
}

function workDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(days)].sort((a, b) => a - b);
}

/** Saved (or sent) preferences filled with the factory values and made safe. Never throws. */
export function readPlanPrefs(raw: unknown): AgendaPlanPrefs {
  const d = DEFAULT_PLAN_PREFS;
  const src: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: AgendaPlanPrefs = {
    ...d,
    workDays: workDays(src['workDays']) ?? [...d.workDays],
    morning: range(src['morning']) ?? { ...d.morning },
    work: range(src['work']) ?? { ...d.work },
    evening: range(src['evening']) ?? { ...d.evening },
    weekend: range(src['weekend']) ?? { ...d.weekend },
    rest: Array.isArray(src['rest'])
      ? src['rest']
          .map(range)
          .filter((r): r is AgendaPlanRange => r !== null)
          .slice(0, PLAN_MAX_REST_RANGES)
      : d.rest.map((r) => ({ ...r })),
    rules: rules(src['rules']) ?? d.rules.map((r) => ({ ...r })),
    gardenRules:
      rules(
        src['gardenRules'],
        PLAN_MAX_GARDEN_RULES,
        PLAN_MIN_GARDEN_MINUTES,
        PLAN_MAX_GARDEN_MINUTES,
      ) ?? d.gardenRules.map((r) => ({ ...r })),
    gardenList:
      typeof src['gardenList'] === 'string'
        ? src['gardenList'].trim().slice(0, PLAN_MAX_GARDEN_LIST)
        : d.gardenList,
    morningNotice:
      typeof src['morningNotice'] === 'boolean' ? src['morningNotice'] : d.morningNotice,
    morningAt:
      parseHhmm(src['morningAt']) !== null ? (src['morningAt'] as string).trim() : d.morningAt,
  };
  // A block is a whole number of quarter hours between 15 and 120 min; anything else is the default.
  const block = src['blockMinutes'];
  out.blockMinutes =
    typeof block === 'number' &&
    Number.isInteger(block) &&
    block % PLAN_BLOCK_STEP === 0 &&
    block >= PLAN_MIN_BLOCK_MINUTES &&
    block <= PLAN_MAX_BLOCK_MINUTES
      ? block
      : d.blockMinutes;
  for (const key of Object.keys(LIMITS) as NumberKey[]) {
    const [min, max] = LIMITS[key];
    out[key] = int(src[key], d[key], min, max);
  }
  // A small thing never takes more than a block.
  out.smallMinutes = Math.min(out.smallMinutes, out.blockMinutes);
  return out;
}
