import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PomodoroStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { POMODORO_BLOCK_MS } from '../../server/constants.js';
import { parseData, pomodoroPath } from '../../server/pomodoroData.js';
import { createPomodoroFeature, finishedText } from '../../server/pomodoroFeature.js';

const MIN = 60_000;
/** Local times on 2026-11-04 (independent of the machine's time zone). */
const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 4, h, m, s);

describe('pomodoro (server)', () => {
  let home: string;
  let now: Date;
  let notes: string[];
  let sent: PomodoroStatus[];
  const client = (privileged: boolean): FeatureClient => ({
    privileged,
    send: (m) => {
      if (m.type === 'pomodoroStatus') sent.push(m as unknown as PomodoroStatus);
    },
  });
  const feature = () =>
    createPomodoroFeature({
      home,
      now: () => now,
      notify: (_t, m) => notes.push(m),
      timers: false,
    });
  const last = () => sent[sent.length - 1]!;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-pomodoro-'));
    now = at(9);
    notes = [];
    sent = [];
  });

  it('a focus block counts down on the server, rings once and suggests the break', () => {
    const p = feature();
    const page = client(true);
    p.connect!(page);
    p.handleClientMessage!({ type: 'webviewReady' }, page);
    expect(last()).toMatchObject({
      phase: 'idle',
      running: false,
      doneToday: 0,
      untilLong: 4,
      suggested: 'focus',
    });

    p.handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, page);
    expect(last()).toMatchObject({ phase: 'focus', running: true, totalMs: 25 * MIN });
    expect(last().endsAt).toBe(at(9, 25).toISOString());

    now = at(9, 24, 59);
    p.tick();
    expect(notes).toEqual([]);
    now = at(9, 25);
    p.tick();
    expect(notes).toEqual(['Terminó tu pomodoro: toma 5 minutos.']);
    expect(last()).toMatchObject({ phase: 'idle', doneToday: 1, untilLong: 3, suggested: 'short' });
    p.tick(); // nothing runs: no second ring
    expect(notes).toHaveLength(1);

    // It never starts the next block by itself; the break ends with its own note and suggests focus again
    p.handleClientMessage!({ type: 'startPomodoro', phase: 'short' }, page);
    now = at(9, 30);
    p.tick();
    expect(notes[1]).toBe('Se acabó el descanso: ¿otro pomodoro?');
    expect(last()).toMatchObject({ phase: 'idle', doneToday: 1, suggested: 'focus' });
  });

  it('pauses, resumes and stops; a stopped block does not count', () => {
    const p = feature();
    const page = client(true);
    p.connect!(page);
    p.handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, page);
    now = at(9, 10);
    p.handleClientMessage!({ type: 'pausePomodoro' }, page);
    expect(last()).toMatchObject({ phase: 'focus', running: false, remainingMs: 15 * MIN });
    expect(last().endsAt).toBeUndefined();
    now = at(10); // a paused block does not run out
    p.tick();
    expect(notes).toEqual([]);
    p.handleClientMessage!({ type: 'resumePomodoro' }, page);
    expect(last().endsAt).toBe(at(10, 15).toISOString());
    p.handleClientMessage!({ type: 'stopPomodoro' }, page);
    expect(last()).toMatchObject({ phase: 'idle', doneToday: 0 });
  });

  it('suggests the long break after four focus blocks, and the long break starts the count again', () => {
    const p = feature();
    const page = client(true);
    p.connect!(page);
    for (let i = 0; i < 4; i++) {
      p.handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, page);
      now = new Date(now.getTime() + POMODORO_BLOCK_MS.focus);
      p.tick();
    }
    expect(notes[3]).toBe('Terminó tu pomodoro: toma 15 minutos (te toca el descanso largo).');
    expect(last()).toMatchObject({ doneToday: 4, suggested: 'long' });
    p.handleClientMessage!({ type: 'startPomodoro', phase: 'long' }, page);
    now = new Date(now.getTime() + POMODORO_BLOCK_MS.long);
    p.tick();
    expect(last()).toMatchObject({ doneToday: 4, untilLong: 4, suggested: 'focus' });
  });

  it('keeps the timer across a restart, and finishes a block that ended while the office was closed', () => {
    const p = feature();
    p.handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, client(true));
    const file = pomodoroPath(home);
    // Windows has no POSIX mode bits (it always reports 0o666)
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    // Back before it ended: still running
    now = at(9, 20);
    const again = feature();
    const page = client(true);
    again.handleClientMessage!({ type: 'webviewReady' }, page);
    expect(last()).toMatchObject({ phase: 'focus', running: true });

    // Back two minutes after it ended: counted and rung (late, but recent)
    now = at(9, 27);
    feature().handleClientMessage!({ type: 'webviewReady' }, page);
    expect(last()).toMatchObject({ phase: 'idle', doneToday: 1 });
    expect(notes).toHaveLength(1);

    // An old block is counted quietly
    feature().handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, page);
    now = at(12);
    feature();
    expect(notes).toHaveLength(1);
  });

  it('a new day starts the count again; untokened pages neither see it nor change it', () => {
    const p = feature();
    const stranger = client(false);
    p.connect!(stranger);
    expect(p.handleClientMessage!({ type: 'startPomodoro', phase: 'focus' }, stranger)).toBe(true);
    p.handleClientMessage!({ type: 'webviewReady' }, stranger);
    expect(sent).toEqual([]);

    expect(parseData({ day: '2026-11-03', done: 7, streak: 3 }, '2026-11-04')).toMatchObject({
      done: 0,
      streak: 0,
    });
    expect(
      parseData({ day: '2026-11-04', done: 2, streak: 2, block: 'nap', endsAt: 5 }, '2026-11-04'),
    ).toEqual({
      day: '2026-11-04',
      done: 2,
      streak: 2,
    });
    expect(finishedText('long', 'focus')).toBe('Se acabó el descanso: ¿otro pomodoro?');
  });
});
