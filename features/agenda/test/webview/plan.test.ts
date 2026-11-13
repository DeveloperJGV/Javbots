import { describe, expect, it } from 'vitest';

import type {
  AgendaPlan,
  AgendaPlanBlock,
  AgendaPlanPrefs,
  AgendaPlanTask,
  AgendaStatus,
} from '../../../../core/src/messages.js';
import {
  blockIds,
  emptyPlanText,
  halfHours,
  minuteLabel,
  minuteOptions,
  normalizeTime,
  numberFrom,
  partText,
  planOf,
  prefsEqual,
  prefsValid,
  rangeOk,
  timeFieldOk,
  toggleDay,
  weekDays,
  weekLine,
} from '../../webview/planView.js';

const task = (id: string, title: string, minutes = 10, source: AgendaPlanTask['source'] = 'rule') =>
  ({ id, title, minutes, source }) satisfies AgendaPlanTask;

const block = (
  id: string,
  title: string,
  extra: Partial<AgendaPlanBlock> = {},
): AgendaPlanBlock => ({
  id,
  start: '07:30',
  end: '08:00',
  startsAt: '2026-11-12T13:30:00.000Z',
  minutes: 30,
  title,
  why: 'tiene fecha para hoy',
  tasks: [task(`${id}-t`, title, 30)],
  ...extra,
});

const prefs: AgendaPlanPrefs = {
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
  rules: [{ word: 'regar', minutes: 10 }],
  gardenList: 'Jardín',
  gardenMinutes: 5,
  gardenRules: [
    { word: 'regar', minutes: 3 },
    { word: 'podar', minutes: 15 },
  ],
  gardenSetupMinutes: 3,
  morningNotice: true,
  morningAt: '08:00',
  remindMinutes: 0,
};

const plan = (
  today: AgendaPlanBlock[],
  later: AgendaPlanBlock[] = [],
  leftover = 0,
): AgendaPlan => ({
  days: [
    { day: '2026-11-12', blocks: today, minutes: today.length * 30 },
    { day: '2026-11-13', blocks: [], minutes: 0 },
    { day: '2026-11-14', blocks: later, minutes: later.length * 30 },
  ],
  leftover: Array.from({ length: leftover }, (_, i) => ({
    title: `Ordenar bodega ${i}`,
    minutes: 120,
    why: 'no hay hueco',
    tasks: [],
  })),
  prefs,
});

describe('plan view (features/agenda)', () => {
  it('shows the plan only while connected', () => {
    const p = plan([block('a', 'Llamar al banco')]);
    const status = { connected: true, plan: p } as AgendaStatus;
    expect(planOf(status)).toBe(p);
    expect(planOf({ ...status, connected: false })).toBeUndefined();
    expect(planOf(undefined)).toBeUndefined();
  });

  it('acts on every task of a block, including the quick ones', () => {
    const quick = block('q', 'Pendientes rápidos', {
      quick: true,
      tasks: [task('b', 'Llamar al banco', 10), task('c', 'Contestar correo', 5)],
    });
    expect(blockIds(quick)).toEqual(['b', 'c']);
    const round = block('r', 'Ronda del jardín', {
      round: true,
      tasks: [task('h', 'Regar helecho'), task('p', 'Regar pasto')],
    });
    expect(blockIds(round)).toEqual(['h', 'p']);
  });

  it('adds the current minutes to the choices when missing, sorted', () => {
    // A normal task: whole blocks ("ratos") only.
    expect(minuteOptions(30, 'task', 30)).toEqual([30, 60, 90, 120]);
    expect(minuteOptions(90, 'task', 30)).toEqual([30, 60, 90, 120]);
    expect(minuteOptions(150, 'task', 30)).toEqual([30, 60, 90, 120, 150]);
    // A small thing alone: the small choices, then the blocks.
    expect(minuteOptions(10, 'task', 30)).toEqual([5, 10, 15, 30, 60, 90, 120]);
    expect(minuteOptions(12, 'task', 30)).toEqual([5, 10, 12, 15, 30, 60, 90, 120]);
    // Inside "Pendientes rápidos" and the garden round.
    expect(minuteOptions(10, 'quick', 30)).toEqual([5, 10, 15]);
    expect(minuteOptions(8, 'quick', 30)).toEqual([5, 8, 10, 15]);
    expect(minuteOptions(3, 'garden', 30)).toEqual([1, 2, 3, 5, 10, 15]);
    expect(minuteOptions(4, 'garden', 30)).toEqual([1, 2, 3, 4, 5, 10, 15]);
    // Another block size follows the preference; 0 (automatic) is never a listed value.
    expect(minuteOptions(45, 'task', 45)).toEqual([45, 90, 135, 180]);
    expect(minuteOptions(0, 'quick', 30)).not.toContain(0);
  });

  it('marks the automatic value', () => {
    const auto = task('a', 'Regar helecho', 10, 'rule');
    expect(minuteLabel(10, auto)).toBe('10 min (auto)');
    expect(minuteLabel(15, auto)).toBe('15 min');
    expect(minuteLabel(10, task('m', 'Llamar al banco', 10, 'manual'))).toBe('10 min');
    expect(minuteLabel(60, task('b', 'Limpiar', 60, 'default'))).toBe('1 h (auto)');
  });

  it('says the part only when the reason does not', () => {
    expect(partText(block('a', 'Limpiar', { part: 1, parts: 2 }))).toBe('parte 1 de 2');
    expect(
      partText(block('a', 'Limpiar', { part: 2, parts: 2, why: 'Parte 2 de 2 de algo largo' })),
    ).toBe('');
    expect(partText(block('a', 'Limpiar'))).toBe('');
  });

  it('lists only later days with blocks', () => {
    const p = plan([block('a', 'Llamar al banco')], [block('b', 'Regar helecho')]);
    expect(weekDays(p).map((d) => d.day)).toEqual(['2026-11-14']);
  });

  it('says a kind word when today is empty', () => {
    expect(emptyPlanText(plan([block('a', 'Llamar al banco')]))).toBeNull();
    expect(emptyPlanText(plan([]))).toBe('Hoy no toca nada. Descansa.');
    expect(emptyPlanText(plan([], [block('b', 'Regar helecho')]))).toMatch(
      /^Por hoy ya no toca nada/,
    );
    expect(emptyPlanText(plan([], [], 1))).toMatch(/repartido en los próximos días/);
    expect(emptyPlanText({ ...plan([]), days: [] })).toBe('Hoy no toca nada. Descansa.');
  });

  it('writes a week line with digital time', () => {
    expect(weekLine(block('a', 'Regar helecho'))).toBe(
      '07:30 · 30 min · Regar helecho — tiene fecha para hoy',
    );
    expect(weekLine(block('a', 'Regar helecho', { why: '' }))).toBe(
      '07:30 · 30 min · Regar helecho',
    );
  });

  it('compares preferences by value', () => {
    expect(prefsEqual(prefs, { ...prefs, rest: [{ from: '14:00', to: '15:00' }] })).toBe(true);
    expect(prefsEqual(prefs, { ...prefs, workDays: [5, 4, 3, 2, 1] })).toBe(true);
    expect(prefsEqual(prefs, { ...prefs, dailyBlocks: 4 })).toBe(false);
    expect(prefsEqual(prefs, { ...prefs, morning: { from: '06:30', to: '09:00' } })).toBe(false);
    expect(prefsEqual(prefs, { ...prefs, rules: [] })).toBe(false);
    expect(prefsEqual(prefs, { ...prefs, gardenRules: [{ word: 'regar', minutes: 3 }] })).toBe(
      false,
    );
    expect(prefsEqual(prefs, { ...prefs, gardenSetupMinutes: 0 })).toBe(false);
  });

  it('toggles work days and reads numbers safely', () => {
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleDay([1, 5], 0)).toEqual([0, 1, 5]);
    expect(numberFrom('20', 5)).toBe(20);
    expect(numberFrom('', 5)).toBe(5);
    expect(numberFrom('abc', 5)).toBe(5);
    expect(numberFrom('-3', 5)).toBe(0);
    expect(numberFrom('0', 30, 1)).toBe(1);
  });

  it('reads typed times as 24 h HH:MM', () => {
    expect(normalizeTime('7:30')).toBe('07:30');
    expect(normalizeTime('0730')).toBe('07:30');
    expect(normalizeTime('730')).toBe('07:30');
    expect(normalizeTime(' 18:05 ')).toBe('18:05');
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime('00:00')).toBe('00:00');
    expect(normalizeTime('23:59')).toBe('23:59');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('7:60')).toBeNull();
    expect(normalizeTime('7:30 pm')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });

  it('checks ranges and the whole preferences before saving', () => {
    expect(rangeOk({ from: '07:00', to: '09:00' })).toBe(true);
    expect(rangeOk({ from: '09:00', to: '09:00' })).toBe(false);
    expect(rangeOk({ from: '18:00', to: '7:00' })).toBe(false);
    expect(rangeOk({ from: 'xx', to: '09:00' })).toBe(false);
    expect(prefsValid(prefs)).toBe(true);
    expect(prefsValid({ ...prefs, morningAt: '8:00' })).toBe(false);
    expect(prefsValid({ ...prefs, evening: { from: '20:00', to: '18:00' } })).toBe(false);
    expect(prefsValid({ ...prefs, rest: [{ from: '14:00', to: '25:00' }] })).toBe(false);
  });

  it('a typed time: exact 24 h text, empty only where it is optional; half-hour suggestions', () => {
    expect(timeFieldOk('07:30')).toBe(true);
    expect(timeFieldOk('7:30')).toBe(false);
    expect(timeFieldOk('24:00')).toBe(false);
    expect(timeFieldOk('')).toBe(false);
    expect(timeFieldOk('', true)).toBe(true);
    const list = halfHours();
    expect(list).toHaveLength(48);
    expect(list.slice(0, 3)).toEqual(['00:00', '00:30', '01:00']);
    expect(list[list.length - 1]).toBe('23:30');
  });
});
