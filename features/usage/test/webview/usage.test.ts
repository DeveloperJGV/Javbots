import { describe, expect, it } from 'vitest';

import { USAGE_METER_BARS } from '../../webview/constants.js';
import { filledRows, meterSprite } from '../../webview/usageFurniture.js';
import {
  costByModel,
  levelClass,
  limitLabel,
  limitText,
  mainProfile,
  officeUsage,
  spotlightLimit,
  untilText,
} from '../../webview/usageText.js';

const NOW = new Date('2026-10-16T15:00:00.000Z');

describe('usage text', () => {
  it('colors and countdowns', () => {
    expect(levelClass(10)).toBe('bg-status-success');
    expect(levelClass(60)).toBe('bg-warning');
    expect(levelClass(90)).toBe('bg-danger');
    expect(untilText('2026-10-16T17:15:00Z', NOW)).toBe('2 h 15 min');
    expect(untilText('2026-10-19T19:00:00Z', NOW)).toBe('3 d 4 h');
    expect(limitText('5 horas', { pct: 23.5, resetsAt: '2026-10-16T15:40:00Z' }, NOW)).toBe(
      '5 horas 24% · se reinicia en 40 min',
    );
  });

  it('the bar shows the personal profile, else the first one with limits', () => {
    const personal = { profile: 'personal', sessions: [] };
    const trabajo = { profile: 'trabajo', sessions: [], fiveHour: { pct: 9 } };
    expect(mainProfile([personal, trabajo])).toBe(trabajo);
    expect(mainProfile([{ ...personal, sevenDay: { pct: 3 } }, trabajo])?.profile).toBe('personal');
    expect(mainProfile([personal])).toBe(personal);
    expect(mainProfile([])).toBeUndefined();
  });

  it('each office shows only its own profiles, its main one first', () => {
    const personal = { profile: 'personal', sessions: [], fiveHour: { pct: 5 } };
    const otro = { profile: 'otro', sessions: [], fiveHour: { pct: 9 } };
    const ambos = { profile: 'ambos', sessions: [] };
    const offices = [
      {
        id: 'taller',
        label: 'Taller',
        profiles: ['otro', 'ambos'],
        alsoInMain: ['ambos'],
        mainProfile: 'otro',
      },
    ];
    // No extra offices: everything, personal first
    expect(officeUsage([personal, otro])).toEqual({
      profiles: [personal, otro],
      preferred: 'personal',
    });
    const main = officeUsage([personal, otro, ambos], 'principal', offices);
    expect(main.profiles).toEqual([personal, ambos]);
    const taller = officeUsage([personal, otro, ambos], 'taller', offices);
    expect(taller).toEqual({ profiles: [otro, ambos], preferred: 'otro' });
    expect(mainProfile(taller.profiles, taller.preferred)).toBe(otro);
  });
});

describe('limits and models beyond the two windows', () => {
  it('names extra limits and groups cost by model family', () => {
    expect(limitLabel('five_hour')).toBe('5 horas');
    expect(limitLabel('seven_day_fable')).toBe('Semana · Fable');
    expect(limitLabel('monthly_extra')).toBe('monthly extra');
    const rows = costByModel({
      profile: 'personal',
      sessions: [
        { id: 'a', model: 'Fable 5.1', costUsd: 1.25, tokens: 1000 },
        { id: 'b', model: 'Opus 5.5', costUsd: 3 },
        { id: 'c', model: 'claude-fable-5-1', costUsd: 1, tokens: 500 },
      ],
    });
    expect(rows).toEqual([
      { model: 'Opus', costUsd: 3, tokens: 0, sessions: 1 },
      { model: 'Fable', costUsd: 2.25, tokens: 1500, sessions: 2 },
    ]);
  });

  it('Fable always has its row and its weekly limit is found among the extra ones', () => {
    const p = { profile: 'personal', sessions: [{ id: 'b', model: 'Opus 5.5', costUsd: 3 }] };
    expect(costByModel(p).map((r) => r.model)).toEqual(['Opus', 'Fable']);
    expect(spotlightLimit(p)).toBeUndefined();
    const fable = { key: 'seven_day_fable', pct: 12 };
    expect(spotlightLimit({ ...p, otherLimits: [{ key: 'seven_day_opus', pct: 1 }, fable] })).toBe(
      fable,
    );
  });
});

describe('usage meter in the office', () => {
  const blank = (): string[][] =>
    Array.from({ length: 32 }, () => new Array<string>(32).fill('#ffffff'));

  it('fills each bar from the bottom, at least one row when anything is used', () => {
    expect(filledRows(0, 14)).toBe(0);
    expect(filledRows(1, 14)).toBe(1);
    expect(filledRows(50, 14)).toBe(7);
    expect(filledRows(120, 14)).toBe(14);
    const [five, week, fable] = USAGE_METER_BARS;
    const out = meterSprite(blank(), [{ pct: 50 }, { pct: 90 }, undefined]);
    const column = (bar: typeof five) =>
      Array.from({ length: bar.h }, (_, dy) => out[bar.y + dy][bar.x]);
    const fiveCol = column(five);
    expect(fiveCol[five.h - 1]).toBe(fiveCol[five.h - 7]); // lit
    expect(fiveCol[0]).not.toBe(fiveCol[five.h - 1]); // empty on top
    expect(column(week)[week.h - 1]).not.toBe(fiveCol[five.h - 1]); // 90 % is another color
    expect(column(fable)[fable.h - 1]).not.toBe(fiveCol[five.h - 1]); // no Fable data: dark
  });

  it('never touches the original sprite and reuses the same frame', () => {
    const sprite = blank();
    const a = meterSprite(sprite, [{ pct: 10 }, undefined]);
    expect(sprite[USAGE_METER_BARS[0].y][USAGE_METER_BARS[0].x]).toBe('#ffffff');
    expect(meterSprite(sprite, [{ pct: 10.2 }, undefined])).toBe(a);
  });
});
