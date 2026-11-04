import type { PomodoroPhase, PomodoroStatus } from '../../../core/src/messages.js';

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  idle: 'Listo',
  focus: 'Enfoque',
  short: 'Descanso',
  long: 'Descanso largo',
};

/** The start buttons, in order. */
export const BLOCK_BUTTONS: ReadonlyArray<{
  phase: Exclude<PomodoroPhase, 'idle'>;
  label: string;
}> = [
  { phase: 'focus', label: 'Enfoque 25 min' },
  { phase: 'short', label: 'Descanso 5 min' },
  { phase: 'long', label: 'Descanso largo 15 min' },
];

/** What is left of the current block (ms), never below zero; 0 when idle. */
export function remainingMs(status: PomodoroStatus, nowMs: number): number {
  if (status.phase === 'idle') return 0;
  if (status.remainingMs !== undefined && !status.running) return status.remainingMs;
  const ends = status.endsAt ? Date.parse(status.endsAt) : NaN;
  return Number.isNaN(ends) ? 0 : Math.max(0, ends - nowMs);
}

/** Minutes and seconds left, rounded up (25:00 right after starting, 00:01 in the last second). */
export function minutesSeconds(ms: number): { minutes: number; seconds: number } {
  const total = Math.ceil(ms / 1000);
  return { minutes: Math.min(99, Math.floor(total / 60)), seconds: total % 60 };
}

export function mmss(ms: number): string {
  const { minutes, seconds } = minutesSeconds(ms);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function todayText(status: PomodoroStatus): string {
  const n = status.doneToday;
  const done = n === 0 ? 'Hoy todavía no hay pomodoros' : `Hoy: ${n} pomodoro${n === 1 ? '' : 's'}`;
  const long =
    status.suggested === 'long'
      ? 'te toca el descanso largo'
      : status.untilLong === 1
        ? 'el siguiente descanso es el largo'
        : `faltan ${status.untilLong} para el descanso largo`;
  return `${done} · ${long}`;
}
