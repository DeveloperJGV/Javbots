import { describe, expect, it } from 'vitest';

import type { AgendaPlan, AgendaPlanPrefs } from '../../../../core/src/messages.js';
import { GARDEN_CARE_WORDS, PLAN_QUICK_TITLE, PLAN_ROUND_TITLE } from '../../plan/constants.js';
import type { PlanBusyInput, PlanExtra, PlanTaskInput } from '../../plan/plan.js';
import { makePlan } from '../../plan/plan.js';
import { cleanTitle, isGardenCare, taskMinutes } from '../../plan/planMinutes.js';
import { DEFAULT_PLAN_PREFS, readPlanPrefs } from '../../plan/planPrefs.js';
import {
  addDays,
  dayDiff,
  hhmm,
  parseHhmm,
  wallDay,
  wallMinutes,
  wallToMs,
  weekday,
} from '../../plan/planTime.js';

const TZ = 'America/Mexico_City';
const TODAY = '2026-11-12'; // Thursday
const TOMORROW = '2026-11-13';

function at(day: string, time: string, timeZone = TZ): number {
  return wallToMs(day, parseHhmm(time) as number, timeZone);
}

const EARLY = at(TODAY, '06:00');
const P = DEFAULT_PLAN_PREFS;

function prefs(patch: Partial<AgendaPlanPrefs> = {}): AgendaPlanPrefs {
  return { ...DEFAULT_PLAN_PREFS, ...patch };
}

function plan(
  tasks: PlanTaskInput[],
  opts: {
    busy?: PlanBusyInput[];
    prefs?: AgendaPlanPrefs;
    now?: number;
    extra?: Partial<PlanExtra>;
  } = {},
): AgendaPlan {
  return makePlan(tasks, opts.busy ?? [], opts.prefs ?? P, opts.now ?? EARLY, {
    timeZone: TZ,
    ...opts.extra,
  });
}

function task(id: string, title: string, more: Partial<PlanTaskInput> = {}): PlanTaskInput {
  return { id, title, ...more };
}

/** Where each task id ended up: "day HH:MM". */
function where(p: AgendaPlan): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of p.days) {
    for (const b of d.blocks) for (const t of b.tasks) out[t.id] = `${d.day} ${b.start}`;
  }
  return out;
}

function allBlocks(p: AgendaPlan) {
  return p.days.flatMap((d) => d.blocks.map((b) => ({ day: d.day, ...b })));
}

describe('planTime', () => {
  it('converts between instants and wall time in the given zone', () => {
    const ms = at(TODAY, '09:30');
    expect(new Date(ms).toISOString()).toBe('2026-11-12T15:30:00.000Z');
    expect(wallDay(ms, TZ)).toBe(TODAY);
    expect(wallMinutes(ms, TZ)).toBe(570);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayDiff('2026-11-10', TODAY)).toBe(2);
    expect(weekday(TODAY)).toBe(4);
    expect(hhmm(605)).toBe('10:05');
    expect(parseHhmm('23:59')).toBe(1439);
    expect(parseHhmm('24:00')).toBeNull();
    expect(parseHhmm('9:00')).toBeNull();
    expect(parseHhmm(7)).toBeNull();
  });

  it('gives different days for the same instant in different zones', () => {
    const ms = at(TODAY, '20:00');
    expect(wallDay(ms, TZ)).toBe(TODAY);
    expect(wallDay(ms, 'Asia/Tokyo')).toBe(TOMORROW);
    expect(wallMinutes(ms, 'Asia/Tokyo')).toBe(11 * 60);
  });

  it('handles both DST changes in New York', () => {
    const ny = 'America/New_York';
    // 2026-03-08: 02:00 jumps to 03:00. 2026-11-01: 02:00 goes back to 01:00.
    expect(new Date(wallToMs('2026-03-08', 0, ny)).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(new Date(wallToMs('2026-03-08', 600, ny)).toISOString()).toBe(
      '2026-03-08T14:00:00.000Z',
    );
    expect(new Date(wallToMs('2026-11-01', 0, ny)).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(new Date(wallToMs('2026-11-01', 600, ny)).toISOString()).toBe(
      '2026-11-01T15:00:00.000Z',
    );
  });
});

describe('taskMinutes', () => {
  const base = task('t', 'Algo');

  it('reads every duration mark', () => {
    const cases: [string, number][] = [
      ['Pintar (15 min)', 15],
      ['Pintar (15m)', 15],
      ['Pintar (20 minutos)', 20],
      ['Pintar (1 h)', 60],
      ['Pintar (1h)', 60],
      ['Pintar (2 horas)', 120],
      ['Pintar (1.5 h)', 90],
      ['Pintar (1,5 h)', 90],
      ['Pintar (1 h 30)', 90],
      ['Pintar (1h30)', 90],
      ['Pintar (12 MIN)', 15],
    ];
    for (const [title, minutes] of cases) {
      expect(taskMinutes({ ...base, title }, P), title).toEqual({ minutes, source: 'mark' });
    }
  });

  it('does not take a bare number as a mark', () => {
    expect(taskMinutes({ ...base, title: 'Pintar (2)' }, P)).toEqual({
      minutes: 30,
      source: 'default',
    });
  });

  it('reads a mark in the notes', () => {
    expect(taskMinutes({ ...base, title: 'Pintar', notes: 'con brocha (45 min)' }, P)).toEqual({
      minutes: 45,
      source: 'mark',
    });
  });

  it('orders manual > mark > garden > rule > default', () => {
    const t = task('a', 'Regar helecho (20 min)', { listName: 'Jardín' });
    expect(taskMinutes(t, P, { a: 7 })).toEqual({ minutes: 7, source: 'manual' });
    expect(taskMinutes(t, P)).toEqual({ minutes: 20, source: 'mark' });
    const garden = task('b', 'Limpiar macetas', { listName: 'jardin' });
    expect(taskMinutes(garden, P)).toEqual({ minutes: 5, source: 'rule' });
    expect(taskMinutes(task('b', 'Limpiar macetas'), P)).toEqual({ minutes: 30, source: 'rule' });
    expect(taskMinutes(task('c', 'Limpiar la cocina'), P)).toEqual({ minutes: 30, source: 'rule' });
    expect(taskMinutes(task('d', 'Leer un libro'), P)).toEqual({ minutes: 30, source: 'default' });
  });

  it('matches rules at the start of a word, ignoring case and accents', () => {
    const p = prefs({ rules: [{ word: 'llámar', minutes: 10 }] });
    expect(taskMinutes(task('a', 'LLAMAR al banco'), p).minutes).toBe(10);
    expect(taskMinutes(task('b', 'Volver a llamarle'), p).minutes).toBe(10);
    expect(taskMinutes(task('c', 'Rellamar'), p).source).toBe('default');
    const q = prefs({ rules: [{ word: 'revisión', minutes: 15 }] });
    expect(taskMinutes(task('d', 'Hacer la revision'), q).minutes).toBe(15);
  });

  it('bounds and rounds up to 5', () => {
    expect(taskMinutes(task('a', 'x (2 min)'), P).minutes).toBe(5);
    expect(taskMinutes(task('a', 'x (12 h)'), P).minutes).toBe(480);
    expect(taskMinutes(task('a', 'x'), P, { a: 23 }).minutes).toBe(25);
    expect(taskMinutes(task('a', 'x'), P, { a: Number.NaN }).source).toBe('default');
  });

  it('cleans the mark out of the title', () => {
    expect(cleanTitle('Pintar la reja (1 h) ya')).toBe('Pintar la reja ya');
    expect(cleanTitle('Pintar (2)')).toBe('Pintar (2)');
    expect(cleanTitle('(15 min)')).toBe('(15 min)');
  });

  it('only counts care words of the garden list as garden care', () => {
    expect(GARDEN_CARE_WORDS).toContain('regar');
    expect(isGardenCare(task('a', 'Regar helecho', { listName: 'JARDÍN' }), P)).toBe(true);
    expect(isGardenCare(task('a', 'Comprar fertilizante', { listName: 'Jardín' }), P)).toBe(false);
    expect(isGardenCare(task('a', 'Regar helecho', { listName: 'Casa' }), P)).toBe(false);
    expect(isGardenCare(task('a', 'Regar helecho'), prefs({ gardenList: '' }))).toBe(false);
  });
});

describe('readPlanPrefs', () => {
  it('returns the factory values for garbage', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) {
      expect(readPlanPrefs(raw)).toEqual(DEFAULT_PLAN_PREFS);
    }
    expect(
      readPlanPrefs({
        blockMinutes: 'a',
        dailyBlocks: Number.NaN,
        workDays: 'x',
        morning: { from: '10:00', to: '09:00' },
        work: { from: '25:00', to: '26:00' },
        evening: null,
        rest: 'no',
        rules: 'nope',
        gardenList: 5,
        morningNotice: 'yes',
        morningAt: '8:00',
      }),
    ).toEqual(DEFAULT_PLAN_PREFS);
  });

  it('has the agreed factory rules in order', () => {
    expect(DEFAULT_PLAN_PREFS.rules.map((r) => r.word)).toEqual([
      'regar',
      'llamar',
      'pagar',
      'mandar',
      'enviar',
      'contestar',
      'agendar',
      'revisar',
      'limpiar',
      'lavar',
      'ordenar',
      'comprar',
    ]);
  });

  it('cleans what it keeps', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ word: `w${i}`, minutes: 10 }));
    const p = readPlanPrefs({
      blockMinutes: 9999,
      dailyThings: 2.6,
      smallMinutes: 2.6,
      marginMinutes: -4,
      workDays: [1, 1, 7, -1, 3.5, 0],
      rest: [{ from: '13:00', to: '13:30' }, { from: 'x' }, { from: '16:00', to: '15:00' }],
      rules: [{ word: '  ', minutes: 10 }, { word: 'x'.repeat(41), minutes: 10 }, ...many],
      gardenList: '  Plantas ',
      morningNotice: false,
    });
    expect(p.blockMinutes).toBe(30);
    expect(p.smallMinutes).toBe(3);
    expect('dailyThings' in p).toBe(false);
    expect(p.marginMinutes).toBe(0);
    expect(p.workDays).toEqual([0, 1]);
    expect(p.rest).toEqual([{ from: '13:00', to: '13:30' }]);
    expect(p.rules).toHaveLength(40);
    expect(p.rules[0]).toEqual({ word: 'w0', minutes: 10 });
    expect(p.gardenList).toBe('Plantas');
    expect(p.morningNotice).toBe(false);
    expect(p.dailyBlocks).toBe(DEFAULT_PLAN_PREFS.dailyBlocks);
  });

  it('does not share arrays with the defaults', () => {
    const p = readPlanPrefs({});
    p.workDays.push(6);
    p.rules.push({ word: 'x', minutes: 5 });
    expect(DEFAULT_PLAN_PREFS.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(DEFAULT_PLAN_PREFS.rules).toHaveLength(12);
  });

  it('takes blocks in quarter hours from 15 to 120 and keeps small things within one', () => {
    expect('dailyThings' in DEFAULT_PLAN_PREFS).toBe(false);
    expect(readPlanPrefs({ blockMinutes: 45 }).blockMinutes).toBe(45);
    expect(readPlanPrefs({ blockMinutes: 120 }).blockMinutes).toBe(120);
    for (const bad of [20, 0, 135, 37.5, '30', -15]) {
      expect(readPlanPrefs({ blockMinutes: bad }).blockMinutes).toBe(30);
    }
    expect(readPlanPrefs({ smallMinutes: 60 }).smallMinutes).toBe(30);
    expect(readPlanPrefs({ blockMinutes: 15, smallMinutes: 20 }).smallMinutes).toBe(15);
  });

  it('fills the garden values of an old file and cleans new ones', () => {
    const old = readPlanPrefs({ gardenMinutes: 10 });
    expect(old.gardenMinutes).toBe(10);
    expect(old.gardenRules).toEqual([
      { word: 'regar', minutes: 3 },
      { word: 'limpiar', minutes: 5 },
      { word: 'abonar', minutes: 2 },
      { word: 'podar', minutes: 15 },
    ]);
    expect(old.gardenSetupMinutes).toBe(3);
    expect(DEFAULT_PLAN_PREFS.gardenMinutes).toBe(5);
    const many = Array.from({ length: 30 }, (_, i) => ({ word: `w${i}`, minutes: 0 }));
    const p = readPlanPrefs({
      gardenRules: [{ word: 'Regar', minutes: 999 }, { word: '' }, ...many],
      gardenSetupMinutes: 500,
      gardenMinutes: 0,
    });
    expect(p.gardenRules).toHaveLength(20);
    expect(p.gardenRules[0]).toEqual({ word: 'Regar', minutes: 240 });
    expect(p.gardenRules[1]).toEqual({ word: 'w0', minutes: 1 });
    expect(p.gardenSetupMinutes).toBe(60);
    expect(p.gardenMinutes).toBe(1);
    expect(readPlanPrefs({ gardenRules: 'x', gardenSetupMinutes: 'y' })).toEqual(
      DEFAULT_PLAN_PREFS,
    );
  });
});

describe('garden minutes', () => {
  const care = (title: string, more: Partial<PlanTaskInput> = {}) =>
    task('g', title, { listName: 'Jardín', ...more });

  it('goes by kind of care, unrounded', () => {
    expect(taskMinutes(care('Regar helecho'), P)).toEqual({ minutes: 3, source: 'rule' });
    expect(taskMinutes(care('Abonar rosal'), P)).toEqual({ minutes: 2, source: 'rule' });
    expect(taskMinutes(care('Podar limón'), P)).toEqual({ minutes: 15, source: 'rule' });
    expect(taskMinutes(care('Limpiar macetas'), P)).toEqual({ minutes: 5, source: 'rule' });
    expect(taskMinutes(care('RÉGAR pasto'), P).minutes).toBe(3);
  });

  it('lets a mark or a manual value win', () => {
    expect(taskMinutes(care('Regar helecho (8 min)'), P)).toEqual({ minutes: 8, source: 'mark' });
    expect(taskMinutes(care('Regar helecho', { notes: '(7 min)' }), P).minutes).toBe(7);
    expect(taskMinutes(care('Regar helecho (8 min)'), P, { g: 4 })).toEqual({
      minutes: 4,
      source: 'manual',
    });
  });

  it('uses gardenMinutes when no garden rule names the care', () => {
    const p = prefs({
      gardenRules: DEFAULT_PLAN_PREFS.gardenRules.filter((r) => r.word !== 'podar'),
    });
    expect(taskMinutes(care('Podar limón'), p)).toEqual({ minutes: 5, source: 'default' });
    // Matched against the first word only.
    const q = prefs({ gardenRules: [{ word: 'limón', minutes: 9 }] });
    expect(taskMinutes(care('Podar limón'), q).minutes).toBe(5);
  });
});

describe('makePlan', () => {
  it('gives 7 empty days for no tasks', () => {
    const p = plan([]);
    expect(p.days.map((d) => d.day)).toEqual([
      TODAY,
      TOMORROW,
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(p.days.every((d) => d.blocks.length === 0 && d.minutes === 0)).toBe(true);
    expect(p.leftover).toEqual([]);
    expect(p.prefs).toBe(P);
    expect(plan([], { extra: { days: 3 } }).days).toHaveLength(3);
  });

  it('moves everything to tomorrow when today is full of events', () => {
    const p = plan([task('a', 'Llamar al banco', { due: TODAY })], {
      busy: [{ start: at(TODAY, '00:00'), end: at(TOMORROW, '00:00'), title: 'Viaje' }],
    });
    expect(p.days[0].blocks).toEqual([]);
    expect(where(p)['a']).toBe(`${TOMORROW} 09:00`);
  });

  it('orders overdue, today, future, then undated oldest first', () => {
    const tasks = [
      task('g', 'Tarea G'),
      task('f', 'Tarea F', { updated: '2026-11-01T10:00:00.000Z' }),
      task('e', 'Tarea E', { updated: '2026-10-01T10:00:00.000Z' }),
      task('d', 'Tarea D', { due: TOMORROW }),
      task('c', 'Tarea C', { due: TODAY }),
      task('a', 'Tarea A', { due: '2026-11-10' }),
      task('b', 'Tarea B', { due: '2026-11-05' }),
    ];
    const p = plan(tasks, { prefs: prefs({ dailyBlocks: 10 }) });
    expect(p.days[0].blocks.map((b) => b.tasks[0].id)).toEqual(['b', 'a', 'c', 'd', 'e', 'f', 'g']);
    const why = Object.fromEntries(p.days[0].blocks.map((b) => [b.tasks[0].id, b.why]));
    expect(why['b']).toBe('atrasada 7 días');
    expect(why['a']).toBe('atrasada 2 días');
    expect(why['c']).toBe('es para hoy');
    expect(why['d']).toBe('vence mañana');
    expect(why['e']).toBe('sin fecha, lleva 42 días esperando');
    expect(why['f']).toBe('sin fecha, lleva 11 días esperando');
    expect(why['g']).toBe('sin fecha');
  });

  it('waits for dated tasks until soonDays before', () => {
    const p = plan([task('a', 'Llamar A', { due: '2026-11-17' })]);
    expect(where(p)['a']).toBe('2026-11-15 10:00'); // Sun: 2 days before, weekend window
    const q = plan([task('a', 'Llamar A', { due: '2026-11-16' })]);
    expect(where(q)['a']).toBe('2026-11-14 10:00'); // Sat window
    expect(q.days[2].blocks[0].why).toBe('vence el lunes');
    const r = plan([task('a', 'Llamar A', { due: '2026-11-25' })], { extra: { days: 14 } });
    expect(r.days.find((d) => d.blocks.length)?.blocks[0].why).toBe('vence el miércoles 25');
  });

  it('keeps the daily minutes cap and moves the rest on', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id, `Tarea ${id}`));
    const p = plan(tasks);
    expect(p.days[0].blocks).toHaveLength(3);
    expect(p.days[0].minutes).toBe(90);
    expect(p.days[1].blocks.map((b) => b.tasks[0].id)).toEqual(['d']);
  });

  describe('small things', () => {
    it('gathers small things in one block of "Pendientes rápidos" in work hours', () => {
      const p = plan([task('a', 'Llamar a'), task('b', 'Pagar b'), task('c', 'Mandar c (5 min)')]);
      expect(p.days[0].blocks).toHaveLength(1);
      const b = p.days[0].blocks[0];
      expect(b).toMatchObject({
        title: PLAN_QUICK_TITLE,
        quick: true,
        minutes: 30,
        start: '09:00',
        end: '09:30',
        id: 'a+c+b',
        why: 'sin fecha · 3 cosas chicas',
      });
      expect(b.tasks.map((t) => [t.id, t.minutes])).toEqual([
        ['a', 10],
        ['c', 5],
        ['b', 10],
      ]);
    });

    it('makes one small thing alone a normal block', () => {
      const p = plan([task('a', 'Llamar al banco')]);
      expect(p.days[0].blocks[0]).toMatchObject({
        title: 'Llamar al banco',
        minutes: 30,
        start: '09:00',
        why: 'sin fecha',
      });
      expect(p.days[0].blocks[0].quick).toBeUndefined();
      expect(p.days[0].blocks[0].tasks[0].minutes).toBe(10);
    });

    it('opens another block when the first is full', () => {
      const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id, `Revisar ${id}`));
      const p = plan(tasks);
      expect(p.days[0].blocks.map((b) => b.tasks.map((t) => t.id))).toEqual([
        ['a', 'b'],
        ['c', 'd'],
      ]);
      expect(p.days[0].blocks.every((b) => b.quick && b.minutes === 30)).toBe(true);
      expect(p.days[0].minutes).toBe(60);
    });

    it('leaves small things that did not fit together', () => {
      const tasks = ['a', 'b', 'c', 'd'].map((id) => task(id, `Revisar ${id}`));
      const p = plan(tasks, { prefs: prefs({ dailyBlocks: 1 }), extra: { days: 1 } });
      expect(p.days[0].blocks).toHaveLength(1);
      expect(p.leftover).toHaveLength(1);
      expect(p.leftover[0]).toMatchObject({
        title: PLAN_QUICK_TITLE,
        minutes: 30,
        why: 'no cupo en el tope diario de esta semana',
      });
      expect(p.leftover[0].tasks.map((t) => t.id)).toEqual(['c', 'd']);
      const one = plan(tasks.slice(0, 3), { prefs: prefs({ dailyBlocks: 1 }), extra: { days: 1 } });
      expect(one.leftover[0]).toMatchObject({ title: 'Revisar c', minutes: 30 });
    });
  });

  it('rounds normal tasks up to whole blocks', () => {
    const p = plan([task('a', 'Tarea a (20 min)'), task('b', 'Tarea b (45 min)')]);
    const a = allBlocks(p).find((b) => b.tasks[0].id === 'a');
    const b = allBlocks(p).find((x) => x.tasks[0].id === 'b');
    expect(a).toMatchObject({ minutes: 30 });
    expect(a?.tasks[0].minutes).toBe(30);
    expect(b).toMatchObject({ minutes: 60, why: 'sin fecha · necesita más de un rato' });
    expect(b?.tasks[0].minutes).toBe(60);
  });

  it('keeps the cap of 3 blocks across small things, the round and tasks', () => {
    const tasks = [
      task('qa', 'Llamar a'),
      task('qb', 'Llamar b'),
      task('tc', 'Tarea c'),
      task('td', 'Tarea d'),
      ...Array.from({ length: 10 }, (_, i) =>
        task(`w${i}`, `Regar maceta ${i}`, { listName: 'Jardín', due: TODAY }),
      ),
    ];
    const p = plan(tasks);
    const kinds = p.days[0].blocks.map((b) =>
      b.round ? 'round' : b.quick ? 'quick' : b.tasks[0].id,
    );
    expect([...kinds].sort()).toEqual(['quick', 'round', 'tc']);
    expect(p.days[0].minutes).toBe(90);
    expect(where(p)['td']).toBe(`${TOMORROW} 07:00`);
  });

  it('sends what does not fit in the week to leftover', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => task(id, `Tarea ${id}`));
    const p = plan(tasks, { extra: { days: 2 } });
    expect(allBlocks(p)).toHaveLength(6);
    expect(p.leftover).toEqual([
      {
        title: 'Tarea g',
        minutes: 30,
        why: 'no cupo en el tope diario de esta semana',
        tasks: [{ id: 'g', title: 'Tarea g', minutes: 30, source: 'default' }],
      },
    ]);
  });

  it('says there was no free gap when that is what failed', () => {
    const p = plan([task('a', 'Tarea a')], {
      extra: { days: 1 },
      busy: [{ start: at(TODAY, '00:00'), end: at(TOMORROW, '00:00') }],
    });
    expect(p.leftover[0].why).toBe('no hubo un hueco libre esta semana');
  });

  it('keeps the work hours for small things only', () => {
    // Morning taken by an event: a 30-min task waits for the evening, a 10-min one goes to work hours.
    const busy = [{ start: at(TODAY, '06:30'), end: at(TODAY, '08:50'), title: 'Gimnasio' }];
    const p = plan([task('big', 'Tarea larga'), task('small', 'Llamar al banco')], { busy });
    expect(where(p)['big']).toBe(`${TODAY} 18:00`);
    expect(where(p)['small']).toBe(`${TODAY} 09:00`);
    // Even with the morning free, the small one goes to work hours first.
    const q = plan([task('small', 'Llamar al banco')]);
    expect(where(q)['small']).toBe(`${TODAY} 09:00`);
    expect(where(plan([task('big', 'Tarea larga')]))['big']).toBe(`${TODAY} 07:00`);
  });

  it('respects the rest time and the margin around events', () => {
    const tasks = Array.from({ length: 42 }, (_, i) =>
      task(`t${i}`, `Llamar ${String(i).padStart(2, '0')}`),
    );
    const busy = [{ start: at(TODAY, '09:00'), end: at(TODAY, '10:00'), title: 'Junta' }];
    const p = plan(tasks, {
      busy,
      prefs: prefs({ dailyBlocks: 50 }),
      extra: { days: 1 },
    });
    const blocks = p.days[0].blocks;
    // Small things fill work hours first (after the event and its margin), then spill elsewhere.
    expect(blocks.find((b) => b.start >= '09:00')?.start).toBe('10:30');
    expect(blocks[0].start).toBe('07:00');
    for (const b of blocks) {
      const s = parseHhmm(b.start) as number;
      const e = s + b.minutes;
      expect(s >= 15 * 60 || e <= 14 * 60, b.start).toBe(true);
      expect(s >= 10 * 60 + 10 || e <= 9 * 60 - 10, b.start).toBe(true);
    }
  });

  it('says a block fits before a near event', () => {
    const busy = [{ start: at(TODAY, '09:40'), end: at(TODAY, '10:00'), title: 'Dentista' }];
    const p = plan([task('a', 'Llamar al banco')], { busy });
    expect(p.days[0].blocks[0].start).toBe('09:00');
    expect(p.days[0].blocks[0].why).toBe('sin fecha · cabe antes de "Dentista" de las 09:40');
    const q = plan([task('a', 'Llamar al banco')], {
      busy: [{ start: at(TODAY, '09:40'), end: at(TODAY, '10:00') }],
    });
    expect(q.days[0].blocks[0].why).toBe('sin fecha · cabe antes de lo de las 09:40');
  });

  it('plans nothing before now plus the lead, on the grid', () => {
    const p = plan([task('a', 'Llamar al banco')], { now: at(TODAY, '10:20') });
    expect(where(p)['a']).toBe(`${TODAY} 10:30`);
    const q = plan([task('a', 'Llamar al banco')], { now: at(TODAY, '09:26') });
    expect(where(q)['a']).toBe(`${TODAY} 10:00`);
  });

  it('plans nothing today late at night', () => {
    const p = plan([task('a', 'Tarea a'), task('b', 'Llamar b')], { now: at(TODAY, '21:00') });
    expect(p.days[0].blocks).toEqual([]);
    expect(where(p)).toEqual({ a: `${TOMORROW} 07:00`, b: `${TOMORROW} 09:00` });
  });

  it('uses the weekend window on non-work days', () => {
    const sat = '2026-11-14';
    const p = plan([task('a', 'Llamar al banco'), task('b', 'Tarea b')], { now: at(sat, '06:00') });
    expect(p.days[0].day).toBe(sat);
    expect(where(p)).toEqual({ a: `${sat} 10:00`, b: `${sat} 10:30` });
  });

  describe('plant round', () => {
    const cares = [
      'Regar helecho',
      'Regar pasto',
      'Abonar rosal',
      'Podar limón',
      'Limpiar macetas',
    ];

    it('joins the cares of the day in one block', () => {
      const tasks = cares.map((t, i) => task(`c${i}`, t, { listName: 'Jardín', due: TODAY }));
      tasks.push(task('buy', 'Comprar fertilizante', { listName: 'Jardín' }));
      const p = plan(tasks);
      const round = p.days[0].blocks.find((b) => b.round);
      // regar 3 + 3, abonar 2, podar 15, limpiar 5, setup 3 = 31 → one block.
      expect(round).toMatchObject({ title: PLAN_ROUND_TITLE, minutes: 30, start: '07:00' });
      expect(round?.tasks.map((t) => t.id)).toEqual(['c2', 'c4', 'c3', 'c0', 'c1']);
      expect(round?.tasks.map((t) => t.minutes)).toEqual([2, 5, 15, 3, 3]);
      expect(round?.why).toBe('es para hoy · 5 plantas');
      expect(round?.id).toBe('c2+c4+c3+c0+c1');
      expect(where(p)['buy']).toBe(`${TODAY} 07:30`); // its own block, after the round
    });

    it('puts 10 waterings in one short round', () => {
      const tasks = Array.from({ length: 10 }, (_, i) =>
        task(`w${i}`, `Regar maceta ${i}`, { listName: 'Jardín', due: TODAY }),
      );
      const p = plan(tasks);
      expect(p.days[0].blocks).toHaveLength(1);
      const round = p.days[0].blocks[0];
      expect(round.round).toBe(true);
      expect(round.tasks).toHaveLength(10);
      expect(round.minutes).toBe(30); // 10 × 3 + 3 = 33, within the slack of one block
      expect(p.leftover).toEqual([]);
    });

    it('takes a second block past the slack', () => {
      const tasks = Array.from({ length: 12 }, (_, i) =>
        task(`w${String(i).padStart(2, '0')}`, `Regar maceta ${i}`, {
          listName: 'Jardín',
          due: TODAY,
        }),
      );
      const p = plan(tasks);
      expect(p.days[0].blocks).toHaveLength(1);
      expect(p.days[0].blocks[0]).toMatchObject({ round: true, minutes: 60 }); // 12 × 3 + 3 = 39
    });

    it('brings overdue cares into today and leaves future ones', () => {
      const tasks = [
        task('old', 'Regar helecho', { listName: 'Jardín', due: '2026-11-10' }),
        task('now', 'Regar pasto', { listName: 'Jardín', due: TODAY }),
        task('later', 'Regar rosal', { listName: 'Jardín', due: '2026-11-14' }),
      ];
      const p = plan(tasks);
      expect(p.days[0].blocks).toHaveLength(1);
      expect(p.days[0].blocks[0].tasks.map((t) => t.id)).toEqual(['old', 'now']);
      expect(p.days[0].blocks[0].why).toBe('atrasada 2 días · 2 plantas · con atrasadas');
      // One care alone is a normal block.
      expect(p.days[2].blocks[0]).toMatchObject({ title: 'Regar rosal', minutes: 30 });
      expect(p.days[2].blocks[0].round).toBeUndefined();
    });

    it('spreads a round bigger than the cap over the next day', () => {
      // 30 × 3 + 3 = 93 is 3 blocks (slack 5) and fits the cap; the 31st would not.
      const tasks = Array.from({ length: 35 }, (_, i) =>
        task(`c${String(i).padStart(2, '0')}`, `Regar maceta ${i}`, {
          listName: 'Jardín',
          due: TODAY,
        }),
      );
      const p = plan(tasks);
      expect(p.days[0].blocks[0].tasks).toHaveLength(30);
      expect(p.days[0].minutes).toBe(90);
      expect(p.days[1].blocks[0].tasks).toHaveLength(5);
      expect(p.days[1].blocks[0].minutes).toBe(30);
      expect(p.days[1].blocks[0].why).toBe('es para hoy · 5 plantas');
    });

    it('leaves the round setup in leftover', () => {
      const tasks = Array.from({ length: 32 }, (_, i) =>
        task(`c${String(i).padStart(2, '0')}`, `Regar maceta ${i}`, {
          listName: 'Jardín',
          due: TODAY,
        }),
      );
      const p = plan(tasks, { extra: { days: 1 } });
      expect(p.leftover).toHaveLength(1);
      expect(p.leftover[0]).toMatchObject({ title: PLAN_ROUND_TITLE, minutes: 30 }); // 2 × 3 + 3
      expect(p.leftover[0].tasks).toHaveLength(2);
    });

    it('shrinks a round to the gap it has', () => {
      // Morning has only 30 free minutes, evening is busy: 15 + 15 + 3 + 3 = 36 needs an hour,
      // so the last care waits and 15 + 15 + 3 = 33 fits one block.
      const busy = [
        { start: at(TODAY, '07:40'), end: at(TODAY, '09:00') },
        { start: at(TODAY, '17:00'), end: at(TODAY, '21:00') },
      ];
      const tasks = ['Podar limón', 'Podar rosal', 'Regar pasto'].map((t, i) =>
        task(`c${i}`, t, { listName: 'Jardín', due: TODAY }),
      );
      const p = plan(tasks, { busy });
      expect(p.days[0].blocks[0].tasks.map((t) => t.id)).toEqual(['c0', 'c1']);
      expect(p.days[0].blocks[0].minutes).toBe(30);
      // The one left alone is a normal block of one.
      expect(p.days[1].blocks[0]).toMatchObject({ title: 'Regar pasto', minutes: 30 });
      expect(p.days[1].blocks[0].round).toBeUndefined();
    });
  });

  describe('long tasks', () => {
    it('places a long task whole when it fits', () => {
      const p = plan([task('a', 'Pintar la reja (1 h)')]);
      expect(p.days[0].blocks[0]).toMatchObject({
        title: 'Pintar la reja',
        start: '07:00',
        end: '08:00',
        minutes: 60,
        why: 'sin fecha · necesita más de un rato',
      });
      expect(p.days[0].blocks[0].part).toBeUndefined();
    });

    it('splits a task bigger than the cap over two days', () => {
      const p = plan([task('a', 'Pintar la reja (2 h)')]);
      expect(p.days[0].blocks[0]).toMatchObject({ minutes: 90, part: 1, parts: 2, id: 'a#1' });
      expect(p.days[1].blocks[0]).toMatchObject({ minutes: 30, part: 2, parts: 2, id: 'a#2' });
      expect(p.days[0].blocks[0].why).toBe('sin fecha · necesita más de un rato (parte 1 de 2)');
      expect(p.days[0].blocks[0].tasks[0]).toMatchObject({ minutes: 120, source: 'mark' });
      expect(p.leftover).toEqual([]);
    });

    it('lists what is missing of a split task', () => {
      const p = plan([task('a', 'Pintar la reja (2 h)')], { extra: { days: 1 } });
      expect(p.days[0].blocks[0]).toMatchObject({ minutes: 90, part: 1, parts: 2 });
      expect(p.leftover).toHaveLength(1);
      expect(p.leftover[0]).toMatchObject({ title: 'Pintar la reja', minutes: 30 });
      expect(p.leftover[0].why).toBe('faltan 30 min · no cupo en el tope diario de esta semana');
    });

    // Two overdue 30-min things go first and leave 30 min of the cap for the long one.
    const busyDay = [
      task('x', 'Tarea x', { due: '2026-11-11' }),
      task('y', 'Tarea y', { due: '2026-11-11' }),
    ];

    it('waits for a day where a long task fits whole when it is not urgent', () => {
      const p = plan([...busyDay, task('g', 'Limpiar el garage (1 h)', { due: '2026-11-14' })]);
      expect(where(p)['g']).toBe(`${TOMORROW} 07:00`);
      const g = p.days[1].blocks.find((b) => b.tasks[0].id === 'g');
      expect(g).toMatchObject({ minutes: 60, id: 'g' });
      expect(g?.part).toBeUndefined();
      expect(g?.why).toBe('vence el sábado · necesita más de un rato');
      expect(p.days[0].blocks.map((b) => b.tasks[0].id)).toEqual(['x', 'y']);
    });

    it('splits a long task that is due that day', () => {
      const p = plan([...busyDay, task('g', 'Limpiar el garage (1 h)', { due: TODAY })]);
      const today = p.days[0].blocks.find((b) => b.tasks[0].id === 'g');
      expect(today).toMatchObject({ minutes: 30, part: 1, parts: 2, id: 'g#1' });
      expect(p.days[1].blocks[0]).toMatchObject({ minutes: 30, part: 2, parts: 2, id: 'g#2' });
    });

    it('leaves a long task that never fit whole in leftover', () => {
      const p = plan([...busyDay, task('g', 'Limpiar el garage (1 h)', { due: '2026-11-14' })], {
        extra: { days: 1 },
      });
      expect(p.days[0].blocks.map((b) => b.tasks[0].id)).toEqual(['x', 'y']);
      expect(p.leftover).toHaveLength(1);
      expect(p.leftover[0]).toMatchObject({ minutes: 60 });
      expect(p.leftover[0].why).toBe('no cupo en el tope diario de esta semana');
    });
  });

  describe('not today', () => {
    it('moves a task skipped today to tomorrow', () => {
      const p = plan([task('a', 'Llamar al banco', { due: TODAY })], {
        extra: { skipped: { a: TODAY } },
      });
      expect(p.days[0].blocks).toEqual([]);
      expect(where(p)['a']).toBe(`${TOMORROW} 09:00`);
      expect(p.days[1].blocks[0].why).toBe('es para hoy · hoy dijiste que no');
    });

    it('ignores a skip from yesterday', () => {
      const p = plan([task('a', 'Llamar al banco')], { extra: { skipped: { a: '2026-11-11' } } });
      expect(where(p)['a']).toBe(`${TODAY} 09:00`);
      expect(p.days[0].blocks[0].why).toBe('sin fecha');
    });
  });

  it('uses manual minutes from extra', () => {
    const p = plan([task('a', 'Tarea a')], { extra: { minutes: { a: 10 } } });
    expect(p.days[0].blocks[0]).toMatchObject({ start: '09:00', minutes: 30 });
    expect(p.days[0].blocks[0].tasks[0].minutes).toBe(10);
    expect(p.days[0].blocks[0].tasks[0].source).toBe('manual');
  });

  it('keeps the list name on the tasks', () => {
    const p = plan([task('a', 'Llamar al banco', { listName: 'Pendientes' })]);
    expect(p.days[0].blocks[0].tasks[0].listName).toBe('Pendientes');
  });

  it('plans in the given zone, not the machine one', () => {
    const now = at(TODAY, '20:00'); // Tokyo: Fri 13 Nov, 11:00
    const tokyo = makePlan([task('a', 'Llamar al banco')], [], P, now, { timeZone: 'Asia/Tokyo' });
    expect(tokyo.days[0].day).toBe(TOMORROW);
    expect(tokyo.days[0].blocks[0].start).toBe('11:30');
    const mx = makePlan([task('a', 'Llamar al banco')], [], P, now, { timeZone: TZ });
    expect(mx.days[0].day).toBe(TODAY);
    expect(mx.days[0].blocks).toEqual([]);
  });

  it('does not break on DST days in New York', () => {
    const ny = 'America/New_York';
    const all = prefs({ workDays: [0, 1, 2, 3, 4, 5, 6], dailyBlocks: 10 });
    for (const day of ['2026-03-08', '2026-11-01']) {
      const tasks = Array.from({ length: 12 }, (_, i) =>
        task(`t${i}`, i % 2 ? `Llamar ${i}` : `Tarea ${i}`),
      );
      const busy = [{ start: wallToMs(day, 60, ny), end: wallToMs(day, 240, ny), title: 'Noche' }];
      const p = makePlan(tasks, busy, all, wallToMs(day, 0, ny), { timeZone: ny, days: 2 });
      expect(p.days[0].day).toBe(day);
      expect(p.days[0].blocks.length).toBeGreaterThan(0);
      for (const d of p.days) {
        for (const b of d.blocks) {
          expect(b.start).toMatch(/^\d{2}:\d{2}$/);
          expect(b.end).toMatch(/^\d{2}:\d{2}$/);
          const ms = Date.parse(b.startsAt);
          expect(wallDay(ms, ny)).toBe(d.day);
          expect(hhmm(wallMinutes(ms, ny))).toBe(b.start);
        }
      }
    }
  });

  it('is deterministic and does not change its inputs', () => {
    const tasks = [
      task('a', 'Regar helecho', { listName: 'Jardín', due: TODAY }),
      task('b', 'Pintar la reja (2 h)'),
      task('c', 'Llamar al banco', { due: '2026-11-10' }),
    ];
    const busy = [{ start: at(TODAY, '09:00'), end: at(TODAY, '10:00'), title: 'Junta' }];
    const extra: PlanExtra = { timeZone: TZ, minutes: { c: 20 }, skipped: { a: '2026-11-01' } };
    const p = prefs();
    const before = JSON.stringify({ tasks, busy, extra, p });
    const one = makePlan(tasks, busy, p, EARLY, extra);
    const two = makePlan(tasks, busy, p, EARLY, extra);
    expect(two).toEqual(one);
    expect(JSON.stringify({ tasks, busy, extra, p })).toBe(before);
  });

  it('keeps every rule on a large mixed week', () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const titles = [
      'Llamar',
      'Pagar',
      'Revisar',
      'Limpiar',
      'Leer',
      'Pintar (1 h)',
      'Arreglar (2 h)',
    ];
    const tasks: PlanTaskInput[] = Array.from({ length: 80 }, (_, i) => {
      const garden = rand(5) === 0;
      const due = rand(3) === 0 ? addDays(TODAY, rand(12) - 4) : undefined;
      return task(`t${i}`, garden ? `Regar planta ${i}` : `${titles[rand(titles.length)]} ${i}`, {
        due,
        listName: garden ? 'Jardín' : 'Casa',
      });
    });
    const busy: PlanBusyInput[] = [];
    for (let d = 0; d < 7; d++) {
      for (let k = 0; k < 3; k++) {
        const start = at(addDays(TODAY, d), hhmm(7 * 60 + rand(13 * 60)));
        busy.push({ start, end: start + (15 + rand(90)) * 60_000, title: `Evento ${d}-${k}` });
      }
    }
    const pr = prefs();
    const now = at(TODAY, '08:10');
    const p = makePlan(tasks, busy, pr, now, { timeZone: TZ });
    const ids = new Set<string>();
    for (const d of p.days) {
      expect(d.minutes).toBeLessThanOrEqual(pr.dailyBlocks * pr.blockMinutes);
      expect(d.minutes % 30).toBe(0);
      expect(d.minutes).toBe(d.blocks.reduce((s, b) => s + b.minutes, 0));
      const work = pr.workDays.includes(weekday(d.day));
      const windows = (work ? [pr.morning, pr.work, pr.evening] : [pr.weekend]).map((r) => ({
        from: parseHhmm(r.from) as number,
        to: parseHhmm(r.to) as number,
        work: r === pr.work,
      }));
      const spans = d.blocks.map((b) => {
        const s = parseHhmm(b.start) as number;
        return { s, e: s + b.minutes, b };
      });
      spans.forEach(({ s, e, b }, i) => {
        expect(ids.has(b.id)).toBe(false);
        ids.add(b.id);
        expect(s % 30).toBe(0);
        expect(b.minutes % 30).toBe(0);
        expect(b.start).toMatch(/:(00|30)$/);
        expect(parseHhmm(b.end)).toBe(e);
        const win = windows.find((w) => s >= w.from && e <= w.to);
        expect(win, `${d.day} ${b.start}`).toBeDefined();
        if (win?.work) {
          expect(b.minutes).toBe(pr.blockMinutes);
          for (const t of b.tasks) expect(t.minutes).toBeLessThanOrEqual(pr.smallMinutes);
        }
        for (const r of pr.rest) {
          expect(e <= (parseHhmm(r.from) as number) || s >= (parseHhmm(r.to) as number)).toBe(true);
        }
        if (i > 0) expect(s).toBeGreaterThanOrEqual(spans[i - 1].e);
        const startMs = Date.parse(b.startsAt);
        const endMs = startMs + b.minutes * 60_000;
        for (const ev of busy) {
          const margin = pr.marginMinutes * 60_000;
          expect(endMs <= ev.start - margin || startMs >= ev.end + margin).toBe(true);
        }
        if (d.day === TODAY) expect(startMs).toBeGreaterThanOrEqual(now + 5 * 60_000);
      });
    }
    // Every task is placed (fully), left over, or not due within the week.
    const placed = new Map<string, number>();
    for (const b of allBlocks(p)) {
      for (const t of b.tasks) {
        const care = tasks.find((x) => x.id === t.id) as PlanTaskInput;
        const own = b.tasks.length > 1 || isGardenCare(care, pr) || t.minutes <= pr.smallMinutes;
        const share = own ? t.minutes : b.minutes;
        placed.set(t.id, (placed.get(t.id) ?? 0) + share);
      }
    }
    const left = new Map(p.leftover.flatMap((l) => l.tasks.map((t) => [t.id, l] as const)));
    for (const t of tasks) {
      const real = taskMinutes(t, pr).minutes;
      const keep = isGardenCare(t, pr) || real <= pr.smallMinutes;
      const full = keep ? real : Math.ceil(real / 30) * 30;
      const got = placed.get(t.id) ?? 0;
      if (left.has(t.id)) expect(got).toBeLessThan(full);
      else if (got) expect(got).toBe(full);
    }
    expect(p.leftover.length).toBeGreaterThan(0);
  });
});
