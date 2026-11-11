import { describe, expect, it } from 'vitest';

import type { AgendaStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE } from '../../../google/server/constants.js';
import { GoogleApiError, GoogleReconnectNeeded } from '../../../google/server/googleAccount.js';
import type { GoogleSession } from '../../../google/server/googleFeature.js';
import { createAgendaFeature } from '../../server/agendaFeature.js';
import { eventBody, parseEvents, parseTasks, readNewItem } from '../../server/agendaGoogle.js';

// Local time on purpose: the agenda works in the computer's own days.
const NOW = new Date(2026, 10, 3, 9, 30).getTime(); // Tue 3 Nov 2026, 09:30
const CAL = 'https://www.googleapis.com/calendar/v3';
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
  const listeners = new Set<() => void>();
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
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } satisfies GoogleSession;
  return { session, calls, change: () => listeners.forEach((l) => l()) };
}

const CALENDARS = {
  items: [
    { id: 'cal-1', summary: 'Familia', accessRole: 'owner', backgroundColor: '#16a765' },
    { id: 'cal-2', summary: 'Otro', accessRole: 'reader' },
  ],
};
const EVENTS = {
  items: [
    {
      id: 'e1',
      summary: 'Salida: Cena',
      start: { dateTime: '2026-11-07T20:00:00-06:00' },
      end: { dateTime: '2026-11-07T22:00:00-06:00' },
      location: 'Centro',
    },
    { id: 'e2', summary: 'Borrado', status: 'cancelled', start: { date: '2026-11-04' } },
    { id: 'e3', summary: 'Cumple', start: { date: '2026-11-05' }, end: { date: '2026-11-06' } },
  ],
};
const TASK_LIST = {
  items: [
    {
      id: 't1',
      title: 'Limpiar el garage',
      due: '2026-11-04T00:00:00.000Z',
      status: 'needsAction',
    },
    { id: 't2', title: 'Arreglar plantas', status: 'needsAction' },
    { id: 't3', title: 'Lejana', due: '2026-12-20T00:00:00.000Z', status: 'needsAction' },
    { id: 't4', title: 'Hecha', status: 'completed' },
  ],
};

function standard(c: Call): unknown {
  if (c.url.includes('/calendarList')) return CALENDARS;
  if (c.url.includes('/calendars/cal-1/events') && c.method === 'GET') return EVENTS;
  if (c.url.startsWith(`${TASKS}/lists/@default/tasks`) && c.method === 'GET') return TASK_LIST;
  return {};
}

/** Lets the fakes' promises run (they answer at once). */
const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function client() {
  const sent: AgendaStatus[] = [];
  const c: FeatureClient = {
    privileged: true,
    send: (m) => sent.push(m as unknown as AgendaStatus),
  };
  return { c, sent, last: () => sent[sent.length - 1] };
}

describe('agenda parsing', () => {
  it('events: cancelled ones out, all-day and timed told apart', () => {
    const out = parseEvents(EVENTS);
    expect(out.map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(out[0]).toMatchObject({
      kind: 'event',
      title: 'Salida: Cena',
      allDay: false,
      location: 'Centro',
    });
    expect(out[1]).toMatchObject({ allDay: true, start: '2026-11-05', end: '2026-11-06' });
  });

  it('tasks: pending ones in the span, overdue and undated; done and far ones out', () => {
    const out = parseTasks(TASK_LIST, '2026-11-10');
    expect(out.map((t) => [t.id, t.start])).toEqual([
      ['t1', '2026-11-04'],
      ['t2', undefined],
    ]);
  });

  it('checks what the panel sends', () => {
    expect(
      readNewItem({ kind: 'event', title: 'Salida: Cine', date: '2026-11-07', time: '19:30' }),
    ).toEqual({
      kind: 'event',
      title: 'Salida: Cine',
      date: '2026-11-07',
      time: '19:30',
      endTime: undefined,
    });
    expect(readNewItem({ kind: 'task', title: 'Plantas' })).toMatchObject({
      kind: 'task',
      date: undefined,
    });
    expect(readNewItem({ kind: 'event', title: 'Sin día' })).toBeNull();
    expect(readNewItem({ kind: 'event', title: 'x', date: '7/11/2026' })).toBeNull();
    expect(
      readNewItem({ kind: 'event', title: 'x', date: '2026-11-07', time: '25:00' }),
    ).toBeNull();
    expect(readNewItem({ kind: 'calendar', title: 'x', date: '2026-11-07' })).toBeNull();
    expect(readNewItem({ kind: 'task', title: '   ' })).toBeNull();
  });

  it('event bodies: all-day, one hour by default, past midnight', () => {
    expect(eventBody({ kind: 'event', title: 'A', date: '2026-11-30' })).toMatchObject({
      start: { date: '2026-11-30' },
      end: { date: '2026-12-01' },
    });
    expect(
      eventBody({ kind: 'event', title: 'B', date: '2026-11-07', time: '20:00' }),
    ).toMatchObject({
      start: { dateTime: '2026-11-07T20:00:00', timeZone: 'America/Mexico_City' },
      end: { dateTime: '2026-11-07T21:00:00' },
    });
    expect(
      eventBody({ kind: 'event', title: 'C', date: '2026-11-07', time: '23:00', endTime: '01:00' }),
    ).toMatchObject({ end: { dateTime: '2026-11-08T01:00:00' } });
  });
});

describe('agenda feature', () => {
  it('sends the calendar and the tasks of the week to tokened pages only', async () => {
    const g = fakeGoogle(standard);
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'familia',
      now: () => NOW,
    });
    const { c, last } = client();
    const anon = client();
    f.connect?.(c);
    f.connect?.({ ...anon.c, privileged: false });
    await f.refresh();
    const st = last();
    expect(st).toMatchObject({
      type: 'agendaStatus',
      connected: true,
      from: '2026-11-03',
      days: 7,
      saving: false,
    });
    expect(st.items.map((i) => `${i.kind}:${i.id}`)).toEqual([
      'event:e1',
      'event:e3',
      'task:t1',
      'task:t2',
    ]);
    expect(st.error).toBeUndefined();
    expect(anon.sent).toEqual([]);
    const ev = g.calls.find((x) => x.url.includes('/events'));
    expect(ev?.url).toContain(encodeURIComponent(new Date(2026, 10, 3).toISOString()));
    expect(ev?.url).toContain(encodeURIComponent(new Date(2026, 10, 10).toISOString()));
    f.dispose?.();
  });

  it('adds an event to the shared calendar and a task to Tasks, then re-reads', async () => {
    const g = fakeGoogle(standard);
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c } = client();
    f.connect?.(c);
    await f.refresh();
    g.calls.length = 0;
    f.handleClientMessage?.(
      {
        type: 'addAgendaItem',
        kind: 'event',
        title: 'Salida: Cine',
        date: '2026-11-08',
        time: '18:00',
      },
      c,
    );
    await flush();
    const post = g.calls.find((x) => x.method === 'POST');
    expect(post?.url).toBe(`${CAL}/calendars/cal-1/events`);
    expect(post?.body).toMatchObject({
      summary: 'Salida: Cine',
      start: { dateTime: '2026-11-08T18:00:00' },
    });

    g.calls.length = 0;
    f.handleClientMessage?.(
      { type: 'addAgendaItem', kind: 'task', title: 'Podar', date: '2026-11-05' },
      c,
    );
    await flush();
    const task = g.calls.find((x) => x.method === 'POST');
    expect(task?.url).toBe(`${TASKS}/lists/@default/tasks`);
    expect(task?.body).toEqual({ title: 'Podar', due: '2026-11-05T00:00:00.000Z' });
    f.dispose?.();
  });

  it('never creates a calendar: a missing one is an error', async () => {
    const g = fakeGoogle((call) =>
      call.url.includes('/calendarList') ? { items: [] } : standard(call),
    );
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c, last } = client();
    f.connect?.(c);
    await f.refresh();
    expect(last().error).toContain('No encontré el calendario "Familia"');
    expect(g.calls.every((x) => x.method === 'GET')).toBe(true);
    expect(last().items.map((i) => i.id)).toEqual(['t1', 't2']);
    f.dispose?.();
  });

  it('marks a known task done; ignores unknown ids and junk', async () => {
    const g = fakeGoogle(standard);
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c } = client();
    f.connect?.(c);
    await f.refresh();
    g.calls.length = 0;
    f.handleClientMessage?.({ type: 'completeAgendaTask', id: 'otra' }, c);
    f.handleClientMessage?.({ type: 'addAgendaItem', kind: 'event', title: 'x' }, c);
    f.handleClientMessage?.({ type: 'completeAgendaTask', id: 't1' }, c);
    await flush();
    const writes = g.calls.filter((x) => x.method !== 'GET');
    expect(writes).toEqual([
      { url: `${TASKS}/lists/@default/tasks/t1`, method: 'PATCH', body: { status: 'completed' } },
    ]);
    f.dispose?.();
  });

  it('Tasks API off (403): clear message, the events still show', async () => {
    const g = fakeGoogle((call) => {
      if (call.url.startsWith(TASKS)) throw new GoogleApiError(403, 'Tasks API has not been used');
      return standard(call);
    });
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c, last } = client();
    f.connect?.(c);
    await f.refresh();
    expect(last().error).toContain('activa la Google Tasks API');
    expect(last().items.map((i) => i.id)).toEqual(['e1', 'e3']);
    expect(f.connections?.()[0]).toMatchObject({ id: 'google-tasks', state: 'warn' });
    f.dispose?.();
  });

  it('without the tasks permission it does not call Tasks and asks to reconnect', async () => {
    const g = fakeGoogle(standard, [GOOGLE_CALENDAR_SCOPE]);
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c, last } = client();
    f.connect?.(c);
    await f.refresh();
    expect(g.calls.some((x) => x.url.startsWith(TASKS))).toBe(false);
    expect(last().error).toContain('permiso de Tasks');
    f.dispose?.();
  });

  it('a dead session says so once; not connected means nothing is called', async () => {
    const g = fakeGoogle(() => {
      throw new GoogleReconnectNeeded('expired');
    });
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c, last } = client();
    f.connect?.(c);
    await f.refresh();
    expect(last().error).toBe('La conexión con Google caducó: vuelve a conectar.');
    f.dispose?.();

    const off = fakeGoogle(standard);
    const session = { ...off.session, connected: false };
    const f2 = createAgendaFeature({
      google: session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const k = client();
    f2.connect?.(k.c);
    await f2.refresh();
    expect(off.calls).toEqual([]);
    expect(k.last()).toMatchObject({ connected: false, items: [] });
    expect(f2.connections?.()[0]).toMatchObject({ state: 'off' });
    f2.dispose?.();
  });

  it('re-reads when the Google session changes', async () => {
    const g = fakeGoogle(standard);
    const f = createAgendaFeature({
      google: g.session,
      calendarName: () => 'Familia',
      now: () => NOW,
    });
    const { c, sent } = client();
    f.connect?.(c);
    await f.refresh();
    const before = sent.length;
    g.change();
    await f.refresh();
    expect(sent.length).toBeGreaterThan(before);
    f.dispose?.();
  });

  describe('several calendars', () => {
    const MANY = {
      items: [
        { id: 'fam', summary: 'Familia', accessRole: 'owner', backgroundColor: '#ff887c' },
        { id: 'casa', summary: 'Casa', accessRole: 'owner' },
        { id: 'work', summary: 'yo@trabajo.com', accessRole: 'freeBusyReader' },
        { id: 'oculto', summary: 'Oculto', accessRole: 'owner', hidden: true },
      ],
    };
    const many = (c: Call): unknown => {
      if (c.url.includes('/calendarList')) return MANY;
      if (c.url.includes('/calendars/fam/events') && c.method === 'GET') return EVENTS;
      if (c.url.includes('/calendars/casa/events') && c.method === 'GET')
        return {
          items: [
            {
              id: 'e1', // same id as in Familia: a different event
              summary: 'Limpiar el garage',
              start: { dateTime: '2026-11-07T21:00:00-06:00' },
              end: { dateTime: '2026-11-07T21:15:00-06:00' },
            },
          ],
        };
      if (c.url.endsWith('/freeBusy'))
        return {
          calendars: {
            work: { busy: [{ start: '2026-11-04T15:00:00Z', end: '2026-11-05T00:00:00Z' }] },
          },
        };
      return {};
    };
    const feature = (g: ReturnType<typeof fakeGoogle>) =>
      createAgendaFeature({
        google: g.session,
        config: () => ({
          shared: 'Familia',
          home: 'Casa',
          names: { 'yo@trabajo.com': 'Trabajo' },
        }),
        now: () => NOW,
      });

    it('reads every visible calendar, free/busy ones as busy blocks', async () => {
      const g = fakeGoogle(many);
      const f = feature(g);
      const { c, last } = client();
      f.connect?.(c);
      await f.refresh();
      const st = last();
      expect(st.error).toBeUndefined();
      expect(st.sharedCalendar).toBe('fam');
      expect(st.homeCalendar).toBe('casa');
      expect(st.calendars?.map((x) => [x.id, x.name, x.writable, x.busyOnly])).toEqual([
        ['fam', 'Familia', true, false],
        ['casa', 'Casa', true, false],
        ['work', 'Trabajo', false, true],
      ]);
      expect(st.calendars?.[0].color).toBe('#ff887c');
      expect(g.calls.some((x) => x.url.includes('/calendars/oculto/'))).toBe(false);
      expect(g.calls.some((x) => x.url.includes('/calendars/work/events'))).toBe(false);
      const events = st.items.filter((i) => i.kind === 'event');
      expect(events.map((i) => [i.calendar, i.id])).toEqual([
        ['fam', 'e1'],
        ['fam', 'e3'],
        ['casa', 'e1'],
        ['work', 'work#0'],
      ]);
      expect(events[3]).toMatchObject({ title: 'Ocupado', busy: true, allDay: false });
      const fb = g.calls.find((x) => x.url.endsWith('/freeBusy'));
      expect(fb?.body).toMatchObject({ items: [{ id: 'work' }] });
      f.dispose?.();
    });

    it('a new event goes where the panel says, else by its title', async () => {
      const g = fakeGoogle(many);
      const f = feature(g);
      const { c } = client();
      f.connect?.(c);
      await f.refresh();
      const add = async (msg: Record<string, unknown>) => {
        g.calls.length = 0;
        f.handleClientMessage?.(
          { type: 'addAgendaItem', kind: 'event', date: '2026-11-08', ...msg },
          c,
        );
        await flush();
        return g.calls.find((x) => x.method === 'POST' && x.url.endsWith('/events'))?.url;
      };
      expect(await add({ title: 'Salida: Cine' })).toBe(`${CAL}/calendars/fam/events`);
      expect(await add({ title: 'Concierto: Algo' })).toBe(`${CAL}/calendars/fam/events`);
      expect(await add({ title: 'Limpiar el garage' })).toBe(`${CAL}/calendars/casa/events`);
      expect(await add({ title: 'Salida: Solo yo', calendar: 'casa' })).toBe(
        `${CAL}/calendars/casa/events`,
      );
      // Not writable (work) or unknown: falls back to the title's rule.
      expect(await add({ title: 'Junta', calendar: 'work' })).toBe(`${CAL}/calendars/casa/events`);
      f.dispose?.();
    });

    it('no own calendar: a plain event is not saved and says which calendar is missing', async () => {
      const g = fakeGoogle((c) =>
        c.url.includes('/calendarList') ? { items: [MANY.items[0]] } : many(c),
      );
      const f = feature(g);
      const { c, last } = client();
      f.connect?.(c);
      await f.refresh();
      expect(last().homeCalendar).toBeUndefined();
      g.calls.length = 0;
      f.handleClientMessage?.(
        { type: 'addAgendaItem', kind: 'event', title: 'Orejas', date: '2026-11-08' },
        c,
      );
      await flush();
      expect(g.calls.some((x) => x.method === 'POST')).toBe(false);
      expect(last().error).toContain('"Casa"');
      f.dispose?.();
    });
  });
});
