import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { AgendaPlan, AgendaPlanBlock, AgendaStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE } from '../../../google/server/constants.js';
import type { GoogleSession } from '../../../google/server/googleFeature.js';
import { DEFAULT_PLAN_PREFS } from '../../plan/planPrefs.js';
import { createAgendaFeature } from '../../server/agendaFeature.js';
import { readPlanState } from '../../server/agendaPlanStore.js';

const TZ = 'America/Mexico_City';
/** Tue 3 Nov 2026 in Mexico City (UTC-6): 09:30 local. */
const NOW = Date.parse('2026-11-03T15:30:00Z');
const at = (localTime: string) => Date.parse(`2026-11-03T${localTime}:00-06:00`);
const TODAY = '2026-11-03';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

/** A GoogleSession double: answers by URL, records every call, no network. */
function fakeGoogle(
  answer: (c: Call) => unknown,
  scopes = [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE],
) {
  const calls: Call[] = [];
  const session = {
    configured: true,
    connected: true,
    hasScope: (s: string) => scopes.includes(s),
    api: async (url: string, init: { method?: string; body?: unknown } = {}) => {
      const call = { url, method: init.method ?? 'GET', body: init.body };
      calls.push(call);
      return answer(call) as Record<string, unknown>;
    },
    download: async () => Buffer.alloc(0),
    reconnectInDays: () => undefined,
    forget: () => {},
    onChange: () => () => {},
  } satisfies GoogleSession;
  return { session, calls };
}

const CALENDARS = { items: [{ id: 'cal-1', summary: 'Familia', accessRole: 'owner' }] };
/** A timed event this evening and an all-day one (the all-day one is not busy time). */
const EVENTS = {
  items: [
    {
      id: 'e1',
      summary: 'Cita con el dentista',
      start: { dateTime: '2026-11-03T18:00:00-06:00' },
      end: { dateTime: '2026-11-03T19:00:00-06:00' },
    },
    { id: 'e2', summary: 'Cumple', start: { date: TODAY }, end: { date: '2026-11-04' } },
  ],
};
const LISTS = {
  items: [
    { id: 'L1', title: 'Mis tareas' },
    { id: 'L2', title: 'Jardín' },
  ],
};
const MINE = {
  items: [
    {
      id: 't1',
      title: 'Llamar al banco',
      due: `${TODAY}T00:00:00.000Z`,
      notes: 'Antes de las 5',
      updated: '2026-11-01T10:00:00.000Z',
      status: 'needsAction',
    },
    { id: 't2', title: 'Pagar la luz', status: 'needsAction' },
  ],
};
const GARDEN = {
  items: [{ id: 'g1', title: 'Regar helecho', status: 'needsAction' }],
};

function standard(c: Call): unknown {
  if (c.url.includes('/calendarList')) return CALENDARS;
  if (c.url.includes('/calendars/cal-1/events') && c.method === 'GET') return EVENTS;
  if (c.url.startsWith(`${TASKS}/users/@me/lists`)) return LISTS;
  if (c.url.startsWith(`${TASKS}/lists/L1/tasks?`)) return MINE;
  if (c.url.startsWith(`${TASKS}/lists/L2/tasks?`)) return GARDEN;
  return {};
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function client(privileged = true) {
  const sent: AgendaStatus[] = [];
  const c: FeatureClient = {
    privileged,
    send: (m) => sent.push(m as unknown as AgendaStatus),
  };
  return { c, sent, last: () => sent[sent.length - 1] };
}

const dirs: string[] = [];
function planFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-plan-'));
  dirs.push(dir);
  return path.join(dir, 'sub', 'agenda-plan.json');
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function setup(opts: { answer?: (c: Call) => unknown; file?: string; now?: () => number } = {}) {
  const g = fakeGoogle(opts.answer ?? standard);
  const notices: string[][] = [];
  const file = opts.file ?? planFile();
  const f = createAgendaFeature({
    google: g.session,
    calendarName: () => 'Familia',
    config: () => ({ shared: 'Familia', home: 'Familia', names: {} }),
    now: opts.now ?? (() => NOW),
    timeZone: () => TZ,
    planFile: file,
    notify: (title, message) => notices.push([title, message]),
  });
  const k = client();
  f.connect?.(k.c);
  return { g, f, file, notices, ...k };
}

const todayOf = (plan: AgendaPlan | undefined) => plan?.days.find((d) => d.day === TODAY);
const blocksWith = (plan: AgendaPlan | undefined, id: string): AgendaPlanBlock[] =>
  (plan?.days ?? []).flatMap((d) => d.blocks.filter((b) => b.tasks.some((t) => t.id === id)));

describe('agenda: every task list', () => {
  it('reads every list and tags each task with its list', async () => {
    const { f, g, last } = setup();
    await f.refresh();
    const tasks = last().items.filter((i) => i.kind === 'task');
    expect(tasks.map((t) => [t.id, t.list, t.listName])).toEqual([
      ['t1', 'L1', 'Mis tareas'],
      ['t2', 'L1', 'Mis tareas'],
      ['g1', 'L2', 'Jardín'],
    ]);
    expect(g.calls.some((c) => c.url.startsWith(`${TASKS}/lists/@default`))).toBe(false);
    f.dispose?.();
  });

  it('without lists it reads @default, with no list name', async () => {
    const { f, last } = setup({
      answer: (c) => {
        if (c.url.startsWith(`${TASKS}/users/@me/lists`)) return {};
        if (c.url.startsWith(`${TASKS}/lists/@default/tasks?`)) return MINE;
        return standard(c);
      },
    });
    await f.refresh();
    const tasks = last().items.filter((i) => i.kind === 'task');
    expect(tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(tasks[0].list).toBe('@default');
    expect(tasks[0].listName).toBeUndefined();
    f.dispose?.();
  });

  it('marks a task of another list done in that list', async () => {
    const { f, g, c } = setup();
    await f.refresh();
    g.calls.length = 0;
    f.handleClientMessage?.({ type: 'completeAgendaTask', id: 'g1' }, c);
    await flush();
    expect(g.calls.filter((x) => x.method !== 'GET')).toEqual([
      { url: `${TASKS}/lists/L2/tasks/g1`, method: 'PATCH', body: { status: 'completed' } },
    ]);
    f.dispose?.();
  });
});

describe('agenda: day plan', () => {
  it('sends the plan: a pending task gets a block that keeps clear of timed events', async () => {
    const { f, last } = setup();
    await f.refresh();
    const plan = last().plan;
    expect(plan).toBeDefined();
    expect(plan?.prefs).toEqual(DEFAULT_PLAN_PREFS);
    const blocks = blocksWith(plan, 't1');
    expect(blocks.length).toBeGreaterThan(0);
    const busyFrom = at('18:00');
    const busyTo = at('19:00');
    for (const b of (plan?.days ?? []).flatMap((d) => d.blocks)) {
      const start = Date.parse(b.startsAt);
      const end = start + b.minutes * 60_000;
      expect(end <= busyFrom || start >= busyTo).toBe(true);
    }
    f.dispose?.();
  });

  it("the garden's own reminders are not busy time: a task can take that hour", async () => {
    // Same evening hour as the dentist, but written by the garden ("<garden list>: …"): the gap stays free.
    const events = {
      items: [
        {
          id: 'e9',
          summary: 'Jardín: regar helecho',
          start: { dateTime: '2026-11-03T18:00:00-06:00' },
          end: { dateTime: '2026-11-03T19:00:00-06:00' },
        },
      ],
    };
    const answer = (c: Call) =>
      c.url.includes('/calendars/cal-1/events') && c.method === 'GET' ? events : standard(c);
    const { f, last } = setup({ answer, now: () => at('17:40') });
    await f.refresh();
    const starts = (todayOf(last().plan)?.blocks ?? []).map((b) => b.start);
    expect(starts).toContain('18:00');
    f.dispose?.();
  });

  it('no plan while Google is not connected', async () => {
    const g = fakeGoogle(standard);
    const f = createAgendaFeature({
      google: { ...g.session, connected: false },
      now: () => NOW,
      timeZone: () => TZ,
      planFile: planFile(),
      notify: () => {},
    });
    const k = client();
    f.connect?.(k.c);
    await f.refresh();
    expect(k.last().plan).toBeUndefined();
    f.dispose?.();
  });

  it('"not today" takes a task off today and is saved', async () => {
    const { f, c, file, last } = setup();
    await f.refresh();
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'skip', ids: ['t1'] }, c);
    const today = todayOf(last().plan);
    expect(today?.blocks.some((b) => b.tasks.some((t) => t.id === 't1')) ?? false).toBe(false);
    expect(readPlanState(file).skipped).toEqual({ t1: TODAY });
    f.dispose?.();
  });

  it('minutes set by hand change the length and count as manual; 0 clears them', async () => {
    const { f, c, file, last } = setup();
    await f.refresh();
    f.handleClientMessage?.(
      { type: 'agendaPlanAction', action: 'minutes', ids: ['t2'], minutes: 60 },
      c,
    );
    const task = blocksWith(last().plan, 't2')
      .flatMap((b) => b.tasks)
      .find((t) => t.id === 't2');
    expect(task).toMatchObject({ minutes: 60, source: 'manual' });
    expect(readPlanState(file).minutes).toEqual({ t2: 60 });
    f.handleClientMessage?.(
      { type: 'agendaPlanAction', action: 'minutes', ids: ['t2'], minutes: 3 },
      c,
    );
    expect(readPlanState(file).minutes).toEqual({ t2: 60 });
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'minutes', ids: ['t2'] }, c);
    expect(readPlanState(file).minutes).toEqual({});
    f.dispose?.();
  });

  it('done marks each task in its own list, in one saving pass, and clears its marks', async () => {
    const { f, g, c, file, sent } = setup();
    await f.refresh();
    f.handleClientMessage?.(
      { type: 'agendaPlanAction', action: 'minutes', ids: ['t1'], minutes: 20 },
      c,
    );
    g.calls.length = 0;
    sent.length = 0;
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'done', ids: ['t1', 'g1'] }, c);
    await flush();
    expect(g.calls.filter((x) => x.method !== 'GET')).toEqual([
      { url: `${TASKS}/lists/L1/tasks/t1`, method: 'PATCH', body: { status: 'completed' } },
      { url: `${TASKS}/lists/L2/tasks/g1`, method: 'PATCH', body: { status: 'completed' } },
    ]);
    expect(sent.filter((s) => s.saving).length).toBe(1);
    expect(readPlanState(file).minutes).toEqual({});
    f.dispose?.();
  });

  it('ignores unknown ids, junk and pages without a token', async () => {
    const { f, g, c, file } = setup();
    await f.refresh();
    g.calls.length = 0;
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'done', ids: ['nope'] }, c);
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'skip', ids: 't1' }, c);
    f.handleClientMessage?.({ type: 'agendaPlanAction', action: 'boom', ids: ['t1'] }, c);
    await flush();
    expect(g.calls.filter((x) => x.method !== 'GET')).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);

    const anon = client(false);
    for (const msg of [
      { type: 'agendaPlanAction', action: 'done', ids: ['t1'] },
      { type: 'agendaPlanAction', action: 'skip', ids: ['t1'] },
      { type: 'setAgendaPlanPrefs', reset: true },
    ])
      expect(f.handleClientMessage?.(msg, anon.c)).toBe(false);
    await flush();
    expect(g.calls.filter((x) => x.method !== 'GET')).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(anon.sent).toEqual([]);
    f.dispose?.();
  });

  it('prefs are saved cleaned up, and reset brings back the factory ones', async () => {
    const { f, c, file, last } = setup();
    await f.refresh();
    f.handleClientMessage?.(
      {
        type: 'setAgendaPlanPrefs',
        prefs: { ...DEFAULT_PLAN_PREFS, dailyBlocks: 2, morningAt: 'luego', bogus: 1 },
      },
      c,
    );
    const saved = readPlanState(file).prefs;
    expect(saved.dailyBlocks).toBe(2);
    expect(saved.morningAt).toBe(DEFAULT_PLAN_PREFS.morningAt);
    expect(saved).not.toHaveProperty('bogus');
    expect(last().plan?.prefs.dailyBlocks).toBe(2);
    f.handleClientMessage?.({ type: 'setAgendaPlanPrefs', reset: true }, c);
    expect(readPlanState(file).prefs).toEqual(DEFAULT_PLAN_PREFS);
    expect(last().plan?.prefs).toEqual(DEFAULT_PLAN_PREFS);
    f.dispose?.();
  });
});

describe('agenda: desktop notices', () => {
  it('morning summary: not before the hour, then once, and not again after a restart', async () => {
    let now = at('07:30');
    const { f, file, notices } = setup({ now: () => now });
    await f.refresh();
    await f.tick();
    expect(notices).toEqual([]);

    now = at('08:30');
    await f.tick();
    expect(notices.length).toBe(1);
    expect(notices[0][0]).toBe('Plan de hoy');
    expect(notices[0][1]).toMatch(/^Hoy toca: \d+ ratos? \(.+\): /);
    expect(readPlanState(file).morningDay).toBe(TODAY);

    now = at('08:31');
    await f.tick();
    expect(notices.length).toBe(1);
    f.dispose?.();

    const again = setup({ file, now: () => now });
    await again.f.refresh();
    await again.f.tick();
    expect(again.notices).toEqual([]);
    again.f.dispose?.();
  });

  it('no morning summary when it is turned off', async () => {
    const { f, c, file, notices } = setup({ now: () => at('08:30') });
    await f.refresh();
    f.handleClientMessage?.(
      { type: 'setAgendaPlanPrefs', prefs: { ...DEFAULT_PLAN_PREFS, morningNotice: false } },
      c,
    );
    await f.tick();
    expect(notices).toEqual([]);
    expect(readPlanState(file).morningDay).toBeUndefined();
    f.dispose?.();
  });

  it('a failed read does not mark the day: it tries again on the next tick', async () => {
    let broken = true;
    const { f, file, notices } = setup({
      now: () => at('08:30'),
      answer: (c) => {
        if (broken && c.url.startsWith(TASKS)) throw new Error('down');
        return standard(c);
      },
    });
    await f.tick();
    expect(notices).toEqual([]);
    expect(fs.existsSync(file) ? readPlanState(file).morningDay : undefined).toBeUndefined();
    broken = false;
    await f.refresh();
    await f.tick();
    expect(notices.length).toBe(1);
    f.dispose?.();
  });

  it('a notice before each block when remindMinutes is on, once', async () => {
    let now = at('06:00');
    const { f, c, notices, last } = setup({ now: () => now });
    await f.refresh();
    f.handleClientMessage?.(
      {
        type: 'setAgendaPlanPrefs',
        prefs: { ...DEFAULT_PLAN_PREFS, remindMinutes: 10, morningNotice: false },
      },
      c,
    );
    const first = todayOf(last().plan)?.blocks[0];
    expect(first).toBeDefined();
    const startsAt = Date.parse(first?.startsAt ?? '');
    now = startsAt - 15 * 60_000;
    await f.tick();
    expect(notices).toEqual([]);
    now = startsAt - 5 * 60_000;
    await f.tick();
    expect(notices).toEqual([['Plan de hoy', expect.stringMatching(/^En 5 min: /)]]);
    await f.tick();
    expect(notices.length).toBe(1);
    f.dispose?.();
  });
});
