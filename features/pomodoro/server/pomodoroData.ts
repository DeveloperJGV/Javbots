import * as fs from 'fs';
import * as path from 'path';

import type { PomodoroBlock, PomodoroStatus } from '../../../core/src/messages.js';
import { LAYOUT_FILE_DIR } from '../../../server/src/constants.js';
import {
  LOG_PREFIX,
  POMODORO_BLOCK_MS,
  POMODORO_LONG_EVERY,
  POMODORO_STATE_FILE,
} from './constants.js';

/** What pomodoro.json keeps. */
export interface PomodoroData {
  /** The current block; absent when idle. */
  block?: PomodoroBlock;
  /** Running: when it ends (ms). */
  endsAt?: number;
  /** Paused: what is left (ms). */
  remainingMs?: number;
  /** The local day the counts belong to (YYYY-MM-DD). */
  day: string;
  /** Focus blocks finished that day. */
  done: number;
  /** Focus blocks finished since the last long break. */
  streak: number;
  /** The last block that finished (the panel suggests what follows it). */
  lastFinished?: PomodoroBlock;
}

const BLOCKS: readonly PomodoroBlock[] = ['focus', 'short', 'long'];
export const isBlock = (v: unknown): v is PomodoroBlock => BLOCKS.includes(v as PomodoroBlock);

export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const count = (v: unknown): number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
const ms = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

/** pomodoro.json checked field by field; anything odd is dropped (never throws). */
export function parseData(raw: unknown, today: string): PomodoroData {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const day = typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : today;
  const data: PomodoroData = { day, done: count(r.done), streak: count(r.streak) };
  if (isBlock(r.block)) {
    const endsAt = ms(r.endsAt);
    const remainingMs = ms(r.remainingMs);
    const max = POMODORO_BLOCK_MS[r.block];
    if (endsAt !== undefined) Object.assign(data, { block: r.block, endsAt });
    else if (remainingMs !== undefined)
      Object.assign(data, { block: r.block, remainingMs: Math.min(remainingMs, max) });
  }
  if (isBlock(r.lastFinished)) data.lastFinished = r.lastFinished;
  return rollDay(data, today);
}

/** A new day starts the count again (the streak to the long break too). */
export function rollDay(data: PomodoroData, today: string): PomodoroData {
  return data.day === today ? data : { ...data, day: today, done: 0, streak: 0 };
}

/** What the panel offers first: focus, or the break that follows a finished focus block. */
export function suggested(data: PomodoroData): PomodoroBlock {
  if (data.lastFinished !== 'focus') return 'focus';
  return data.streak > 0 && data.streak % POMODORO_LONG_EVERY === 0 ? 'long' : 'short';
}

export function toStatus(data: PomodoroData): PomodoroStatus {
  const status: PomodoroStatus = {
    type: 'pomodoroStatus',
    phase: data.block ?? 'idle',
    running: data.block !== undefined && data.endsAt !== undefined,
    totalMs: data.block ? POMODORO_BLOCK_MS[data.block] : 0,
    doneToday: data.done,
    untilLong: POMODORO_LONG_EVERY - (data.streak % POMODORO_LONG_EVERY),
    suggested: suggested(data),
  };
  if (data.endsAt !== undefined) status.endsAt = new Date(data.endsAt).toISOString();
  if (data.remainingMs !== undefined) status.remainingMs = Math.round(data.remainingMs);
  return status;
}

export function pomodoroPath(home: string): string {
  return path.join(home, LAYOUT_FILE_DIR, POMODORO_STATE_FILE);
}

export function readData(home: string, today: string): PomodoroData {
  try {
    return parseData(JSON.parse(fs.readFileSync(pomodoroPath(home), 'utf-8')), today);
  } catch {
    return { day: today, done: 0, streak: 0 };
  }
}

/** Atomic write (tmp + rename), private to the user. Failures are logged, never thrown. */
export function writeData(home: string, data: PomodoroData): void {
  const file = pomodoroPath(home);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`${LOG_PREFIX} No se pudo guardar ${POMODORO_STATE_FILE}:`, err);
  }
}
