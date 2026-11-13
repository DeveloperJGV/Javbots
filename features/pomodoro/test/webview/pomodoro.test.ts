import { describe, expect, it } from 'vitest';

import type { PomodoroStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../../webview-ui/src/office/types.js';
import {
  HOURGLASS_BIG_TYPE,
  HOURGLASS_GRAIN_COLOR,
  HOURGLASS_GRAIN_PATH,
  POMODORO_CLOCK_TYPE,
} from '../../webview/constants.js';
import { applyPomodoroFurniture, hourglassSprite } from '../../webview/pomodoroFurniture.js';
import { isPomodoroFurniture } from '../../webview/pomodoroStore.js';
import { minutesSeconds, mmss, remainingMs, todayText } from '../../webview/pomodoroText.js';

const NOW = Date.UTC(2026, 10, 4, 15, 0, 0);
const status = (s: Partial<PomodoroStatus>): PomodoroStatus => ({
  type: 'pomodoroStatus',
  phase: 'idle',
  running: false,
  totalMs: 0,
  doneToday: 0,
  untilLong: 4,
  suggested: 'focus',
  ...s,
});
const blank = (w: number, h: number, fill = ''): SpriteData =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
const piece = (type: string, sprite: SpriteData): FurnitureInstance =>
  ({ type, sprite, x: 0, y: 0, zY: 0 }) as unknown as FurnitureInstance;

describe('pomodoro (page)', () => {
  it('counts down from the server time, rounding up, and holds when paused', () => {
    const running = status({
      phase: 'focus',
      running: true,
      endsAt: new Date(NOW + 24 * 60_000 + 30_500).toISOString(),
    });
    expect(mmss(remainingMs(running, NOW))).toBe('24:31');
    expect(mmss(remainingMs(running, NOW + 99 * 60_000))).toBe('00:00');
    expect(remainingMs(status({ phase: 'short', remainingMs: 61_000 }), NOW)).toBe(61_000);
    expect(remainingMs(status({}), NOW)).toBe(0);
    expect(minutesSeconds(25 * 60_000)).toEqual({ minutes: 25, seconds: 0 });
  });

  it('says how the day goes and when the long break comes', () => {
    expect(todayText(status({}))).toBe(
      'Hoy todavía no hay pomodoros · faltan 4 para el descanso largo',
    );
    expect(todayText(status({ doneToday: 3, untilLong: 1 }))).toBe(
      'Hoy: 3 pomodoros · el siguiente descanso es el largo',
    );
    expect(todayText(status({ doneToday: 4, untilLong: 4, suggested: 'long' }))).toBe(
      'Hoy: 4 pomodoros · te toca el descanso largo',
    );
  });

  it('only the tomato timer (wall or table) opens the panel', () => {
    expect(isPomodoroFurniture('POMODORO_TIMER_WALL')).toBe(true);
    expect(isPomodoroFurniture('POMODORO_TIMER')).toBe(true);
    expect(isPomodoroFurniture('POMODORO_HOURGLASS')).toBe(false);
    expect(isPomodoroFurniture('POMODORO_HOURGLASS_BIG:left')).toBe(false);
    expect(isPomodoroFurniture('POMODORO_YOGA_MAT')).toBe(false);
  });

  it('the clock shows the countdown only while a block exists; the grain falls only while focus runs', () => {
    const clock = piece(POMODORO_CLOCK_TYPE, blank(32, 32));
    const glass = piece(HOURGLASS_BIG_TYPE, blank(16, 32, '#000000'));
    const [idleClock, idleGlass] = applyPomodoroFurniture([clock, glass], status({}), 0, NOW);
    expect(idleClock).toBe(clock);
    expect(idleGlass).toBe(glass);

    const focus = status({
      phase: 'focus',
      running: true,
      endsAt: new Date(NOW + 5 * 60_000).toISOString(),
    });
    const [countdown, falling] = applyPomodoroFurniture([clock, glass], focus, 0, NOW);
    expect(countdown.sprite).not.toBe(clock.sprite);
    const [x, y] = HOURGLASS_GRAIN_PATH[0];
    expect(falling.sprite[y][x]).toBe(HOURGLASS_GRAIN_COLOR);

    const paused = status({ phase: 'focus', remainingMs: 5 * 60_000 });
    expect(applyPomodoroFurniture([glass], paused, 0, NOW)[0]).toBe(glass);
    // The grain only lands on painted pixels (inside the glass)
    expect(hourglassSprite(blank(16, 32), 0)[y][x]).toBe('');
  });
});
