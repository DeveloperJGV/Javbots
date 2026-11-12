import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JardinStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import {
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_DRIVE_READ_SCOPE,
  GOOGLE_TASKS_SCOPE,
} from '../../../google/server/constants.js';
import { GoogleApiError } from '../../../google/server/googleAccount.js';
import type { GoogleSession } from '../../../google/server/googleFeature.js';
import { OWNER_MARK_KEY } from '../../server/constants.js';
import { addDays, dueDay, readJardinData, reminderDay } from '../../server/jardinData.js';
import { createJardinFeature } from '../../server/jardinFeature.js';
import {
  plantOfPhoto,
  readNewPlantLine,
  readNote,
  readNoteLine,
} from '../../server/jardinNotes.js';

const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const DRIVE = 'https://www.googleapis.com/drive/v3';

type Raw = Record<string, unknown>;

/**
 * A Google double with state: calendars, events, task lists, tasks and a Drive folder, answering the way the real
 * APIs do (ids, 404 for what's gone). No network.
 */
function fakeGoogle(
  opts: {
    calendars?: string[];
    scopes?: string[];
    folder?: boolean;
    /** Drive may answer fewer files per page than asked for: this many at most. */
    drivePage?: number;
  } = {},
) {
  const calendars = (opts.calendars ?? ['Plantas', 'Otro']).map((summary, i) => ({
    id: `cal-${i}`,
    summary,
  }));
  const events = new Map<string, Raw & { calendarId: string }>();
  const lists: Array<{ id: string; title: string }> = [{ id: 'mis', title: 'Mis tareas' }];
  const tasks = new Map<string, Raw & { listId: string }>();
  const files: Array<Raw & { content: Buffer }> = [];
  const calls: Array<{ method: string; url: string; body?: unknown }> = [];
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const gone = () => {
    throw new GoogleApiError(404, 'google 404: Not Found');
  };
  const scopes = opts.scopes ?? [
    GOOGLE_CALENDAR_SCOPE,
    GOOGLE_TASKS_SCOPE,
    GOOGLE_DRIVE_READ_SCOPE,
  ];

  async function api(url: string, init: { method?: string; body?: unknown } = {}): Promise<Raw> {
    const method = init.method ?? 'GET';
    calls.push({ method, url, body: init.body });
    const u = new URL(url);
    const p = u.pathname;
    const body = (init.body ?? {}) as Raw;
    if (url.startsWith(`${CAL}/users/me/calendarList`)) return { items: calendars };
    let m = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(p);
    if (m) {
      const calendarId = decodeURIComponent(m[1]);
      const eventId = m[2] && decodeURIComponent(m[2]);
      if (!eventId && method === 'POST') {
        const e = { ...body, id: id('ev'), calendarId };
        events.set(e.id, e);
        return e;
      }
      if (!eventId && method === 'GET') {
        const want = u.searchParams.get('privateExtendedProperty')?.split('=');
        return {
          items: [...events.values()].filter(
            (e) =>
              e.calendarId === calendarId &&
              (!want ||
                ((e.extendedProperties as Raw)?.private as Raw)?.[want[0]] ===
                  want.slice(1).join('=')),
          ),
        };
      }
      const e = eventId ? events.get(eventId) : undefined;
      if (!e) return gone();
      if (method === 'PATCH') Object.assign(e, body);
      if (method === 'DELETE') events.delete(e.id as string);
      return method === 'DELETE' ? {} : e;
    }
    if (p === '/tasks/v1/users/@me/lists') {
      if (method === 'POST') {
        const l = { id: id('list'), title: String(body.title) };
        lists.push(l);
        return l;
      }
      return { items: lists };
    }
    m = /^\/tasks\/v1\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/.exec(p);
    if (m) {
      const listId = decodeURIComponent(m[1]);
      const taskId = m[2] && decodeURIComponent(m[2]);
      if (!taskId && method === 'POST') {
        const t = { ...body, id: id('task'), status: 'needsAction', listId };
        tasks.set(t.id, t);
        return t;
      }
      if (!taskId) return { items: [...tasks.values()].filter((t) => t.listId === listId) };
      const t = tasks.get(taskId);
      if (!t) return gone();
      if (method === 'PATCH') Object.assign(t, body);
      if (method === 'DELETE') tasks.delete(taskId);
      return method === 'DELETE' ? {} : t;
    }
    if (p === '/drive/v3/files') {
      const q = u.searchParams.get('q') ?? '';
      if (q.includes("mimeType='application/vnd.google-apps.folder'"))
        return { files: opts.folder === false ? [] : [{ id: 'folder-1', name: 'Jardín' }] };
      // Pages like the real API: pageSize (or less), pageToken, and nextPageToken only when `fields` asks for it
      const size = Math.min(
        Number(u.searchParams.get('pageSize') ?? 100),
        opts.drivePage ?? Infinity,
      );
      const from = Number(u.searchParams.get('pageToken') ?? 0);
      const page = files.slice(from, from + size).map(({ content: _c, ...f }) => f);
      const more = from + size < files.length;
      const wantsToken = (u.searchParams.get('fields') ?? '').includes('nextPageToken');
      return {
        files: page,
        ...(more && wantsToken ? { nextPageToken: String(from + size) } : {}),
      };
    }
    throw new Error(`fake google: no route for ${method} ${url}`);
  }

  async function download(url: string): Promise<Buffer> {
    calls.push({ method: 'GET', url });
    const fileId = /\/files\/([^/?]+)/.exec(url)?.[1];
    const f = files.find((x) => x.id === fileId);
    if (!f) throw new GoogleApiError(404, 'gone');
    return f.content;
  }

  const listeners = new Set<() => void>();
  const session = {
    configured: true,
    connected: true,
    hasScope: (s: string) => scopes.includes(s),
    api,
    download,
    reconnectInDays: () => undefined,
    forget: () => {},
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } satisfies GoogleSession;

  return {
    session,
    calls,
    events,
    tasks,
    lists,
    addFile(name: string, content: string | Buffer, mimeType = 'text/plain', createdTime?: string) {
      files.push({
        id: id('file'),
        name,
        mimeType,
        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
        ...(createdTime ? { createdTime } : {}),
      });
    },
    /** The owner checks a task on the phone. */
    check(taskId: string, when: string) {
      const t = tasks.get(taskId);
      if (t) Object.assign(t, { status: 'completed', completed: when });
    },
    writes: () => calls.filter((c) => c.method !== 'GET'),
  };
}

// Local time on purpose: the garden works in the computer's own days.
let clock = new Date(2026, 10, 3, 9, 30).getTime(); // Tue 3 Nov 2026
const DAY = 86_400_000;

function setup(g = fakeGoogle()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jardin-'));
  const dataFile = path.join(dir, 'jardin.json');
  const feature = createJardinFeature({
    google: g.session,
    officeToken: () => 'tok',
    now: () => clock,
    dataFile,
    dir: path.join(dir, 'jardin'),
    timers: false,
  });
  const sent: JardinStatus[] = [];
  const client: FeatureClient = {
    privileged: true,
    send: (m) => sent.push(m as unknown as JardinStatus),
  };
  feature.connect?.(client);
  const send = async (msg: Raw) => {
    feature.handleClientMessage?.(msg, client);
    await flush();
  };
  return { g, dir, dataFile, feature, sent, last: () => sent[sent.length - 1], send, client };
}

/** Lets the queued jobs (and the fake's promises) run. */
const flush = async () => {
  for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 0));
};

const monstera = {
  name: 'Monstera',
  species: 'Monstera deliciosa',
  place: 'Sala',
  cares: [
    { kind: 'regar', everyDays: 7, time: '08:00', last: '2026-10-30' },
    { kind: 'abonar', everyDays: 30 },
  ],
};

let dirs: string[] = [];
beforeEach(() => {
  clock = new Date(2026, 10, 3, 9, 30).getTime();
  dirs = [];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function tracked(g = fakeGoogle()) {
  const s = setup(g);
  dirs.push(s.dir);
  return s;
}

describe('garden days', () => {
  it('the next care counts from the last real one; a late one sits on today', () => {
    expect(dueDay({ last: '2026-10-30', everyDays: 7 }, '2026-10-01')).toBe('2026-11-06');
    expect(dueDay({ everyDays: 7 }, '2026-11-03')).toBe('2026-11-03');
    expect(reminderDay('2026-11-01', '2026-11-03')).toBe('2026-11-03');
    expect(reminderDay('2026-11-06', '2026-11-03')).toBe('2026-11-06');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('notes from the phone (rules, no AI)', () => {
  const plants = [
    {
      id: 'monstera',
      name: 'Monstera',
      photos: [],
      since: '2026-11-01',
      cares: [{ kind: 'regar' as const, everyDays: 7, time: '09:00' }],
    },
    {
      id: 'lavanda',
      name: 'Lavanda',
      photos: [],
      since: '2026-11-01',
      cares: [
        { kind: 'regar' as const, everyDays: 3, time: '09:00' },
        { kind: 'podar' as const, everyDays: 60, time: '09:00' },
      ],
    },
  ];
  const day = '2026-11-03';

  it('a plant name and a verb are clear', () => {
    expect(readNoteLine('Ya regué la monstera', plants, day, '09:00')).toMatchObject({
      kind: 'care',
      plantIds: ['monstera'],
      care: 'regar',
      day,
    });
    expect(readNoteLine('ayer regué la monstera y la lavanda', plants, day, '09:00')).toMatchObject(
      {
        kind: 'care',
        plantIds: ['monstera', 'lavanda'],
        day: '2026-11-02',
      },
    );
    expect(readNoteLine('Podé la LAVANDA', plants, day, '09:00')).toMatchObject({ care: 'podar' });
  });

  it('anything doubtful goes to the inbox', () => {
    const why = (t: string) => {
      const l = readNoteLine(t, plants, day, '09:00');
      return l?.kind === 'unclear' ? l.why : l?.kind;
    };
    expect(why('ya regué')).toBe('No sé de qué planta es.');
    expect(why('la monstera se ve triste')).toBe('No dice qué cuidado se hizo.');
    expect(why('no regué la monstera')).toBe('No queda claro que ya se hizo.');
    expect(why('¿regué la monstera?')).toBe('Es una pregunta.');
    expect(why('regué y podé la lavanda')).toBe('Dice más de un cuidado.');
    expect(why('podé la monstera')).toContain('no tiene "podar"');
    expect(why('regué el limonero')).toBe('No sé de qué planta es.');
  });

  it('a new plant is read whole, for the owner to review', () => {
    expect(
      readNewPlantLine(
        'Nueva planta: lavanda (Lavandula angustifolia), en la maceta azul; regar cada 3 días a las 7:30; podar cada 60 días',
        '09:00',
      ),
    ).toEqual({
      name: 'lavanda',
      species: 'Lavandula angustifolia',
      place: 'la maceta azul',
      cares: [
        { kind: 'regar', everyDays: 3, time: '07:30' },
        { kind: 'podar', everyDays: 60, time: '09:00' },
      ],
    });
    expect(
      readNote('ya regué la monstera\n\nnueva planta: menta', plants, day, '09:00').map(
        (l) => l.kind,
      ),
    ).toEqual(['care', 'newPlant']);
  });

  it('a photo goes to the one plant its name says', () => {
    expect(plantOfPhoto('monstera 2026-11-03.jpg', plants)?.id).toBe('monstera');
    expect(plantOfPhoto('IMG_2041.jpg', plants)).toBeNull();
    expect(plantOfPhoto('monstera-y-lavanda.jpg', plants)).toBeNull();
  });

  it('a name inside a longer one names only the longer plant', () => {
    const both = [
      ...plants,
      {
        id: 'lavanda-joven',
        name: 'Lavanda joven',
        photos: [],
        since: '2026-11-01',
        cares: [
          { kind: 'regar' as const, everyDays: 3, time: '09:00' },
          { kind: 'podar' as const, everyDays: 60, time: '09:00' },
        ],
      },
    ];
    const ids = (t: string) => {
      const l = readNoteLine(t, both, day, '09:00');
      return l?.kind === 'care' ? l.plantIds : l?.kind;
    };
    expect(ids('podé la lavanda joven')).toEqual(['lavanda-joven']);
    expect(ids('Podé la LAVANDA JOVEN')).toEqual(['lavanda-joven']);
    expect(ids('regué la lavanda y la lavanda joven')).toEqual(['lavanda', 'lavanda-joven']);
    expect(ids('regué la lavanda joven y la lavanda')).toEqual(['lavanda', 'lavanda-joven']);
    expect(ids('regué la lavanda')).toEqual(['lavanda']);
    expect(ids('regué la lavandajoven')).toBe('unclear');
    expect(plantOfPhoto('lavanda joven 2026-11-03.jpg', both)?.id).toBe('lavanda-joven');
    expect(plantOfPhoto('lavanda_joven-2026-11-03.jpg', both)?.id).toBe('lavanda-joven');
    expect(plantOfPhoto('lavanda 2026-11-03.jpg', both)?.id).toBe('lavanda');
    expect(plantOfPhoto('lavanda y lavanda joven.jpg', both)).toBeNull();
  });

  it('a species still names its plant', () => {
    const withSpecies = [
      { ...plants[0], species: 'Monstera deliciosa' },
      { ...plants[1], species: 'Lavandula angustifolia' },
    ];
    expect(
      readNoteLine('regué la lavandula angustifolia', withSpecies, day, '09:00'),
    ).toMatchObject({ kind: 'care', plantIds: ['lavanda'] });
    expect(plantOfPhoto('monstera deliciosa.jpg', withSpecies)?.id).toBe('monstera');
  });
});

describe('jardin feature', () => {
  it('a new plant gets one event and one task per care, on the day it is due, and never twice', async () => {
    const { g, send, last, feature, dataFile } = tracked();
    await send({ type: 'saveJardinPlant', plant: monstera });
    const plant = last().plants[0];
    expect(plant).toMatchObject({ id: 'monstera', name: 'Monstera' });
    expect(plant.cares.map((c) => [c.kind, c.due, c.synced])).toEqual([
      ['regar', '2026-11-06', true],
      ['abonar', '2026-11-03', true],
    ]);
    // The garden list was made (a list is not a calendar); the calendar was only looked up
    expect(g.lists.map((l) => l.title)).toEqual(['Mis tareas', 'Jardín']);
    expect(
      g.writes().some((c) => c.url.includes('/calendarList') || c.url.endsWith('/calendars')),
    ).toBe(false);
    const evs = [...g.events.values()];
    expect(evs.map((e) => e.summary)).toEqual([
      'Jardín: regar Monstera',
      'Jardín: abonar Monstera',
    ]);
    expect(evs[0]).toMatchObject({
      calendarId: 'cal-0',
      start: { dateTime: '2026-11-06T08:00:00', timeZone: 'America/Mexico_City' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
      extendedProperties: { private: { [OWNER_MARK_KEY]: 'monstera:regar' } },
    });
    expect([...g.tasks.values()].map((t) => [t.title, t.due])).toEqual([
      ['Regar Monstera', '2026-11-06T00:00:00.000Z'],
      ['Abonar Monstera', '2026-11-03T00:00:00.000Z'],
    ]);

    // Syncing again (or after a restart) writes nothing
    const before = g.writes().length;
    await feature.sync();
    const again = tracked(g);
    fs.copyFileSync(dataFile, again.dataFile);
    await again.feature.sync();
    expect(g.writes().length).toBe(before);
    expect(g.events.size).toBe(2);
    expect(g.tasks.size).toBe(2);
  });

  it('ids lost (a failed write) are found again by the office mark, not duplicated', async () => {
    const { g, send, dataFile, feature } = tracked();
    await send({ type: 'saveJardinPlant', plant: monstera });
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    for (const c of raw.plants[0].cares) delete c.sync;
    fs.writeFileSync(dataFile, JSON.stringify(raw));
    fs.utimesSync(dataFile, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    await feature.sync();
    expect(g.events.size).toBe(2);
    expect(g.tasks.size).toBe(2);
  });

  it('a care not done rolls to the next day (event and task) until it is done', async () => {
    const { g, send, feature } = tracked();
    await send({ type: 'saveJardinPlant', plant: monstera });
    const abonar = () => [...g.events.values()].find((e) => String(e.summary).includes('abonar'));
    expect(abonar()?.start).toMatchObject({ dateTime: '2026-11-03T09:00:00' });
    clock += DAY; // Wed 4, not done
    await feature.sync();
    expect(abonar()?.start).toMatchObject({ dateTime: '2026-11-04T09:00:00' });
    const task = [...g.tasks.values()].find((t) => t.title === 'Abonar Monstera');
    expect(task?.due).toBe('2026-11-04T00:00:00.000Z');
    expect(g.events.size).toBe(2);
    expect(g.tasks.size).toBe(2);
  });

  it('a task checked on the phone marks the care done that day and schedules the next one', async () => {
    const { g, send, feature, last } = tracked();
    await send({ type: 'saveJardinPlant', plant: monstera });
    const regar = [...g.tasks.values()].find((t) => t.title === 'Regar Monstera');
    const oldEvent = [...g.events.values()].find((e) => String(e.summary).includes('regar'));
    clock += 2 * DAY; // Thu 5
    g.check(regar?.id as string, new Date(2026, 10, 5, 7, 0).toISOString());
    await feature.sync();
    const care = last().plants[0].cares.find((c) => c.kind === 'regar');
    expect(care).toMatchObject({ last: '2026-11-05', due: '2026-11-12', synced: true });
    expect(g.events.has(oldEvent?.id as string)).toBe(false);
    const next = [...g.events.values()].find((e) => String(e.summary).includes('regar'));
    expect(next?.start).toMatchObject({ dateTime: '2026-11-12T08:00:00' });
    // The checked task stays checked (the owner's history); a new one waits for the 12th
    expect(g.tasks.get(regar?.id as string)?.status).toBe('completed');
    expect(
      [...g.tasks.values()]
        .filter((t) => t.title === 'Regar Monstera' && t.status !== 'completed')
        .map((t) => t.due),
    ).toEqual(['2026-11-12T00:00:00.000Z']);
    expect(last().recent[0].text).toContain('Palomeaste en Tasks');
  });

  it('"Hecho" in the panel does the same: task checked, event out, next ones in', async () => {
    const { g, send, last } = tracked();
    await send({ type: 'saveJardinPlant', plant: monstera });
    const abonarTask = [...g.tasks.values()].find((t) => t.title === 'Abonar Monstera');
    await send({ type: 'markJardinCare', plantId: 'monstera', kind: 'abonar' });
    expect(g.tasks.get(abonarTask?.id as string)?.status).toBe('completed');
    expect(last().plants[0].cares[1]).toMatchObject({ last: '2026-11-03', due: '2026-12-03' });
    const ev = [...g.events.values()].filter((e) => String(e.summary).includes('abonar'));
    expect(ev.map((e) => (e.start as Raw).dateTime)).toEqual(['2026-12-03T09:00:00']);
  });

  it('never deletes what it did not make, and removes its own when a plant goes', async () => {
    const { g, send } = tracked();
    // The owner's own event and task, in the same calendar and list
    await g.session.api(`${CAL}/calendars/cal-0/events`, {
      method: 'POST',
      body: { summary: 'Mío' },
    });
    await send({ type: 'saveJardinPlant', plant: monstera });
    const listId = g.lists.find((l) => l.title === 'Jardín')?.id as string;
    await g.session.api(`${TASKS}/lists/${listId}/tasks`, {
      method: 'POST',
      body: { title: 'Mía' },
    });
    await send({ type: 'deleteJardinPlant', id: 'monstera' });
    expect([...g.events.values()].map((e) => e.summary)).toEqual(['Mío']);
    expect([...g.tasks.values()].map((t) => t.title)).toEqual(['Mía']);
    const deleted = g.writes().filter((c) => c.method === 'DELETE');
    expect(deleted).toHaveLength(4);
  });

  it('without the plants calendar it says how to make it, and the tasks still work', async () => {
    const { g, send, last } = tracked(fakeGoogle({ calendars: ['Otro'] }));
    await send({ type: 'saveJardinPlant', plant: monstera });
    const check = last().checks.find((c) => c.id === 'calendar');
    expect(check).toMatchObject({ state: 'off' });
    expect(check?.help).toContain('nunca crea calendarios');
    expect(g.events.size).toBe(0);
    expect(g.tasks.size).toBe(2);
    expect(g.writes().some((c) => c.url.includes('/calendars') && c.method === 'POST')).toBe(false);
  });

  it('a supply under its minimum opens "Comprar …" once, and closes it when it is back', async () => {
    const { g, send, last, feature } = tracked();
    const supply = { name: 'tierra', category: 'tierra', quantity: 1, unit: 'bolsa', min: 2 };
    await send({ type: 'saveJardinSupply', supply });
    await feature.sync();
    await send({ type: 'saveJardinSupply', supply: { ...supply, id: 'tierra', quantity: 0 } });
    const buys = [...g.tasks.values()].filter((t) => t.title === 'Comprar tierra');
    expect(buys).toHaveLength(1);
    expect(last().supplies[0]).toMatchObject({ buying: true, quantity: 0 });
    await send({ type: 'saveJardinSupply', supply: { ...supply, id: 'tierra', quantity: 3 } });
    expect(g.tasks.get(buys[0].id as string)?.status).toBe('completed');
    expect(last().supplies[0].buying).toBe(false);
  });

  it('reads the Drive folder once per file: clear notes applied, photos linked, the rest to the inbox', async () => {
    const g = fakeGoogle();
    const { send, feature, last, dir } = tracked(g);
    await send({ type: 'saveJardinPlant', plant: monstera });
    g.addFile(
      '2026-11-03 nota.txt',
      'ya regué la monstera\nla otra planta se ve rara\nnueva planta: menta, en la cocina; regar cada 2 días',
    );
    g.addFile(
      'monstera 2026-11-03.jpg',
      Buffer.from([0xff, 0xd8, 0xff]),
      'image/jpeg',
      new Date(2026, 10, 3, 8).toISOString(),
    );
    g.addFile('IMG_2041.jpg', Buffer.from([0xff, 0xd8]), 'image/jpeg');
    g.addFile('recibo.pdf', 'x', 'application/pdf');
    await feature.sync();
    const s = last();
    expect(s.plants[0].cares[0]).toMatchObject({ last: '2026-11-03', due: '2026-11-10' });
    expect(s.plants[0].photos).toEqual(['2026-11-03-monstera-2026-11-03.jpg']);
    expect(fs.existsSync(path.join(dir, 'jardin', 'fotos', s.plants[0].photos[0]))).toBe(true);
    expect(s.inbox.map((i) => [i.kind, i.why])).toEqual([
      ['note', 'No dice qué cuidado se hizo.'],
      ['note', 'Planta nueva: revísala antes de agregarla.'],
      ['photo', 'No sé de qué planta es.'],
    ]);
    expect(s.inbox[1].newPlant).toMatchObject({ name: 'menta', place: 'la cocina' });
    expect(s.checks.find((c) => c.id === 'drive')?.state).toBe('ok');
    // Read once: the next sync downloads nothing
    const downloads = () => g.calls.filter((c) => c.url.includes('alt=media')).length;
    const before = downloads();
    await feature.sync();
    expect(downloads()).toBe(before);
    expect(last().inbox).toHaveLength(3);
    // Drive is only ever read
    expect(g.writes().some((c) => c.url.startsWith(DRIVE))).toBe(false);

    // One click sorts them: the photo to the monstera, the new plant through the panel's form
    const photo = last().inbox.find((i) => i.kind === 'photo');
    await send({ type: 'resolveJardinInbox', id: photo?.id, action: 'photo', plantId: 'monstera' });
    expect(last().plants[0].photos).toHaveLength(2);
    const menta = last().inbox.find((i) => i.newPlant);
    await send({ type: 'saveJardinPlant', plant: menta?.newPlant, fromInbox: menta?.id });
    expect(last().plants.map((p) => p.id)).toEqual(['monstera', 'menta']);
    expect(last().inbox).toHaveLength(1);
    await send({ type: 'resolveJardinInbox', id: last().inbox[0].id, action: 'discard' });
    expect(last().inbox).toHaveLength(0);
  });

  it('reads every page of the Drive folder, so the newest files (on the last page) are seen', async () => {
    const g = fakeGoogle({ drivePage: 2 });
    const { send, feature, last } = tracked(g);
    await send({ type: 'saveJardinPlant', plant: monstera });
    for (let i = 1; i <= 4; i++) g.addFile(`recibo ${i}.pdf`, 'x', 'application/pdf');
    g.addFile(
      'monstera 2026-11-03.jpg',
      Buffer.from([0xff, 0xd8, 0xff]),
      'image/jpeg',
      new Date(2026, 10, 3, 8).toISOString(),
    );
    const lists = () =>
      g.calls.filter((c) => c.url.startsWith(`${DRIVE}/files?`) && c.url.includes('in+parents'))
        .length;
    const before = lists();
    await feature.sync();
    expect(last().plants[0].photos).toEqual(['2026-11-03-monstera-2026-11-03.jpg']);
    expect(lists() - before).toBe(3); // 2 + 2 + 1
    expect(last().checks.find((c) => c.id === 'drive')?.detail).toContain('5 archivos leídos');
    expect(g.writes().some((c) => c.url.startsWith(DRIVE))).toBe(false);
  });

  it('says what is missing for Drive: the permission, or the folder', async () => {
    const noScope = tracked(fakeGoogle({ scopes: [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE] }));
    await noScope.feature.sync();
    expect(noScope.last().checks.find((c) => c.id === 'drive')).toMatchObject({
      state: 'off',
      detail: 'Falta el permiso de leer Drive',
    });
    expect(noScope.g.calls.some((c) => c.url.startsWith(DRIVE))).toBe(false);
    const noFolder = tracked(fakeGoogle({ folder: false }));
    await noFolder.feature.sync();
    expect(noFolder.last().checks.find((c) => c.id === 'drive')?.state).toBe('warn');
  });

  it('the computer drop folder works like Drive, and without Google', async () => {
    const g = fakeGoogle();
    const { send, feature, last, dir } = tracked(g);
    await send({ type: 'saveJardinPlant', plant: monstera });
    const entrada = path.join(dir, 'jardin', 'entrada');
    fs.mkdirSync(entrada, { recursive: true });
    fs.writeFileSync(path.join(entrada, 'nota.txt'), 'ya regué la monstera');
    fs.utimesSync(path.join(entrada, 'nota.txt'), clock / 1000, clock / 1000);
    await feature.sync();
    expect(last().plants[0].cares[0].last).toBe('2026-11-03');
    expect(fs.readdirSync(entrada)).toEqual(['leidos']);
    expect(last().recent.some((r) => r.text.startsWith('De la compu'))).toBe(true);
  });

  it('serves photos only to pages with the office token, and only plain names', async () => {
    const { feature, dir } = tracked();
    fs.mkdirSync(path.join(dir, 'jardin', 'fotos'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'jardin', 'fotos', 'a.jpg'), 'jpg');
    const app = Fastify();
    feature.registerRoutes?.(app);
    expect((await app.inject({ url: '/api/jardin/fotos/a.jpg' })).statusCode).toBe(401);
    const ok = await app.inject({ url: '/api/jardin/fotos/a.jpg?token=tok' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toContain('image/jpeg');
    expect(
      (await app.inject({ url: '/api/jardin/fotos/..%2Fjardin.json?token=tok' })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('ignores pages without the token, declares the roof, and reports its connection', async () => {
    const { feature, dataFile } = tracked();
    const stranger: FeatureClient = { privileged: false, send: () => {} };
    expect(
      feature.handleClientMessage?.({ type: 'saveJardinPlant', plant: monstera }, stranger),
    ).toBe(false);
    await flush();
    expect(readJardinData(dataFile).plants).toHaveLength(0);
    expect(feature.floors?.()).toEqual([
      { id: 'azotea', level: 0, roof: true, label: 'Roof garden', defaultLayout: null },
    ]);
    await feature.sync();
    expect(feature.connections?.()[0]).toMatchObject({
      id: 'jardin',
      feature: 'Jardín',
      state: 'ok',
    });
  });

  it('keeps the data file personal and keeps the owner names', async () => {
    const { send, dataFile, feature, last } = tracked();
    fs.writeFileSync(
      dataFile,
      JSON.stringify({ ajustes: { prefijo: 'Plantas:', horaPorDefecto: '07:00' } }),
    );
    fs.utimesSync(dataFile, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    await send({
      type: 'saveJardinPlant',
      plant: { name: 'Menta', cares: [{ kind: 'regar', everyDays: 2 }] },
    });
    expect(last().eventPrefix).toBe('Plantas:');
    expect(last().plants[0].cares[0].time).toBe('07:00');
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    expect(saved.ajustes).toEqual({ prefijo: 'Plantas:', horaPorDefecto: '07:00' });
    feature.dispose?.();
  });
});

describe('a new care never starts late', () => {
  /** An old garden on disk: a Lavanda added in January, with no cares (or the ones given). */
  function oldGarden(cares: Raw[] = []) {
    const s = tracked();
    fs.writeFileSync(
      s.dataFile,
      JSON.stringify({
        version: 1,
        plants: [{ id: 'lavanda', name: 'Lavanda', photos: [], since: '2026-01-10', cares }],
      }),
    );
    fs.utimesSync(s.dataFile, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    const save = (care: Raw) =>
      s.send({
        type: 'saveJardinPlant',
        plant: {
          id: 'lavanda',
          name: 'Lavanda',
          cares: [{ kind: 'podar', everyDays: 365, ...care }],
        },
      });
    const podar = () => s.last().plants[0].cares.find((c) => c.kind === 'podar');
    const stored = () =>
      JSON.parse(fs.readFileSync(s.dataFile, 'utf8')).plants[0].cares.find(
        (c: Raw) => c.kind === 'podar',
      );
    return { ...s, save, podar, stored };
  }

  it('on a plant added months ago, the three answers: today, already done that day, not until that day', async () => {
    const hoy = oldGarden();
    await hoy.save({ first: '2026-11-03' });
    expect(hoy.podar()?.due).toBe('2026-11-03');
    expect(hoy.stored()).toMatchObject({ first: '2026-11-03' });

    const hecho = oldGarden();
    await hecho.save({ last: '2026-10-01' });
    expect(hecho.podar()).toMatchObject({ last: '2026-10-01', due: '2027-10-01' });
    expect(hecho.stored().first).toBeUndefined();

    const hasta = oldGarden();
    await hasta.save({ first: '2027-02-15' });
    expect(hasta.podar()?.due).toBe('2027-02-15');
    const ev = [...hasta.g.events.values()];
    expect(ev.map((e) => (e.start as Raw).dateTime)).toEqual(['2027-02-15T09:00:00']);
    expect([...hasta.g.tasks.values()].map((t) => t.due)).toEqual(['2027-02-15T00:00:00.000Z']);
  });

  it('a new care with no answer (an old client) starts today, never on the day the plant was added', async () => {
    const s = oldGarden();
    await s.save({});
    expect(s.podar()?.due).toBe('2026-11-03');
    expect(s.stored()).toMatchObject({ first: '2026-11-03' });
  });

  it('impossible days are not guessed backwards: a "done" in the future and a "due" in the past become today', async () => {
    const futuro = oldGarden();
    await futuro.save({ last: '2026-12-01' });
    expect(futuro.podar()).toMatchObject({ last: '2026-11-03', due: '2027-11-03' });
    const pasado = oldGarden();
    await pasado.save({ first: '2026-02-01' });
    expect(pasado.podar()?.due).toBe('2026-11-03');
  });

  it('an old file without the field reads as before, and an edit that does not touch the day keeps it', async () => {
    const s = oldGarden([{ kind: 'podar', everyDays: 365, time: '09:00' }]);
    await s.feature.sync();
    expect(s.podar()?.due).toBe('2026-01-10');
    await s.save({ everyDays: 180 });
    expect(s.podar()).toMatchObject({ everyDays: 180, due: '2026-01-10' });
    expect(s.stored().first).toBeUndefined();
  });

  it('editing a care without changing its first day keeps it (even once it is late)', async () => {
    const s = oldGarden();
    await s.save({ first: '2026-11-10' });
    clock += 10 * DAY; // Fri 13: late now
    await s.save({ time: '07:00' });
    expect(s.podar()).toMatchObject({ due: '2026-11-10', time: '07:00' });
    // The panel sending the same (past) day back is not a new choice either
    await s.save({ first: '2026-11-10' });
    expect(s.podar()?.due).toBe('2026-11-10');
  });

  it('marking it done drops the first day: from then on it counts from the real day', async () => {
    const s = oldGarden();
    await s.save({ first: '2027-02-15' });
    await s.send({ type: 'markJardinCare', plantId: 'lavanda', kind: 'podar' });
    expect(s.podar()).toMatchObject({ last: '2026-11-03', due: '2027-11-03' });
    expect(s.stored().first).toBeUndefined();
  });

  it('changing the first day moves its event and task, never makes a second one', async () => {
    const s = oldGarden();
    await s.save({ first: '2027-02-15' });
    const [ev] = [...s.g.events.values()];
    const [task] = [...s.g.tasks.values()];
    await s.save({ first: '2026-12-01' });
    expect(s.g.events.size).toBe(1);
    expect(s.g.tasks.size).toBe(1);
    expect(s.g.events.get(ev.id as string)?.start).toMatchObject({
      dateTime: '2026-12-01T09:00:00',
    });
    expect(s.g.tasks.get(task.id as string)?.due).toBe('2026-12-01T00:00:00.000Z');
    // "Already done" on an existing care moves them too
    await s.save({ last: '2026-11-01', everyDays: 20 });
    expect(s.g.events.size).toBe(1);
    expect(s.g.events.get(ev.id as string)?.start).toMatchObject({
      dateTime: '2026-11-21T09:00:00',
    });
    expect(s.podar()?.due).toBe('2026-11-21');
  });
});

describe('jardin photos: none is ever deleted', () => {
  const lavanda = { name: 'Lavanda', cares: [{ kind: 'regar', everyDays: 3 }] };

  /** Two plants, and photos left in the computer drop folder (dated today, 3 Nov). */
  async function garden(files: string[]) {
    const s = tracked();
    await s.send({ type: 'saveJardinPlant', plant: monstera });
    await s.send({ type: 'saveJardinPlant', plant: lavanda });
    const entrada = path.join(s.dir, 'jardin', 'entrada');
    fs.mkdirSync(entrada, { recursive: true });
    for (const f of files) {
      fs.writeFileSync(path.join(entrada, f), 'jpg');
      fs.utimesSync(path.join(entrada, f), clock / 1000, clock / 1000);
    }
    await s.feature.sync();
    const fotos = path.join(s.dir, 'jardin', 'fotos');
    const gone = path.join(s.dir, 'jardin', 'ya-no-estan');
    const ls = (d: string) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
    const plant = (id: string) => s.last().plants.find((p) => p.id === id);
    return { ...s, fotos, gone, ls, plant };
  }

  it('a photo linked to a plant is renamed to carry its name and date, numbered on a clash', async () => {
    const { send, last, fotos, ls, plant } = await garden([
      'monstera.jpg',
      'IMG_1.jpg',
      'IMG_2.jpg',
    ]);
    // Its name already says the plant: kept as is
    expect(plant('monstera')?.photos).toEqual(['2026-11-03-monstera.jpg']);
    // From the inbox: renamed after the plant, the date its name carried, never on top of another file
    const [a, b] = last().inbox;
    await send({ type: 'resolveJardinInbox', id: a.id, action: 'photo', plantId: 'monstera' });
    expect(plant('monstera')?.photos).toEqual([
      '2026-11-03-monstera.jpg',
      '2026-11-03-monstera-2.jpg',
    ]);
    // Creating a plant from the inbox does the same
    await send({
      type: 'saveJardinPlant',
      plant: { name: 'Menta de limón', cares: [] },
      fromInbox: b.id,
    });
    expect(plant('menta-de-limon')?.photos).toEqual(['2026-11-03-menta-de-limon.jpg']);
    expect(ls(fotos)).toEqual([
      '2026-11-03-menta-de-limon.jpg',
      '2026-11-03-monstera-2.jpg',
      '2026-11-03-monstera.jpg',
    ]);
  });

  it('taking a photo off a plant unlinks it and moves it to "Ya no están"', async () => {
    const { send, last, fotos, gone, ls, plant } = await garden(['monstera.jpg']);
    await send({
      type: 'removeJardinPhoto',
      plantId: 'monstera',
      photo: '2026-11-03-monstera.jpg',
    });
    expect(plant('monstera')?.photos).toEqual([]);
    expect(ls(fotos)).toEqual([]);
    expect(ls(gone)).toEqual(['2026-11-03-monstera.jpg']);
    expect(last().recent[0].text).toBe('Guardé una foto de Monstera en "Ya no están"');
    // A photo the plant doesn't have changes nothing
    await send({ type: 'removeJardinPhoto', plantId: 'monstera', photo: 'otra.jpg' });
    expect(ls(gone)).toEqual(['2026-11-03-monstera.jpg']);
  });

  it('a photo two plants share stays while one keeps it; the last one out names it', async () => {
    const { send, dataFile, fotos, gone, ls, plant } = await garden(['monstera.jpg']);
    // The owner gave the same photo to the lavanda by hand in jardin.json
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    raw.plants.find((p: Raw) => p.id === 'lavanda').photos = ['2026-11-03-monstera.jpg'];
    fs.writeFileSync(dataFile, JSON.stringify(raw));
    fs.utimesSync(dataFile, Date.now() / 1000 + 5, Date.now() / 1000 + 5);
    await send({
      type: 'removeJardinPhoto',
      plantId: 'monstera',
      photo: '2026-11-03-monstera.jpg',
    });
    expect(plant('monstera')?.photos).toEqual([]);
    expect(ls(fotos)).toEqual(['2026-11-03-monstera.jpg']);
    expect(ls(gone)).toEqual([]);
    // Removing the plant moves its photos, named after it this time
    await send({ type: 'deleteJardinPlant', id: 'lavanda' });
    expect(ls(fotos)).toEqual([]);
    expect(ls(gone)).toEqual(['2026-11-03-lavanda.jpg']);
  });

  it('removing a plant moves all its photos, numbered when the name is taken there', async () => {
    const { send, last, fotos, gone, ls } = await garden(['monstera.jpg', 'monstera hoja.jpg']);
    fs.mkdirSync(gone, { recursive: true });
    fs.writeFileSync(path.join(gone, '2026-11-03-monstera.jpg'), 'old');
    await send({ type: 'deleteJardinPlant', id: 'monstera' });
    expect(ls(fotos)).toEqual([]);
    expect(ls(gone)).toEqual([
      '2026-11-03-monstera-2.jpg',
      '2026-11-03-monstera-hoja.jpg',
      '2026-11-03-monstera.jpg',
    ]);
    expect(fs.readFileSync(path.join(gone, '2026-11-03-monstera.jpg'), 'utf8')).toBe('old');
    expect(last().recent[0].text).toBe('Guardé 2 fotos de Monstera en "Ya no están"');
  });

  it('a photo discarded from the inbox is moved with its own name, not deleted', async () => {
    const { send, last, fotos, gone, ls } = await garden(['IMG_1.jpg']);
    await send({ type: 'resolveJardinInbox', id: last().inbox[0].id, action: 'discard' });
    expect(last().inbox).toEqual([]);
    expect(ls(fotos)).toEqual([]);
    expect(ls(gone)).toEqual(['2026-11-03-img-1.jpg']);
    expect(last().recent[0].text).toBe('Guardé una foto de la compu en "Ya no están"');
  });

  it('a move that fails still takes the photo off, and is logged', async () => {
    const { send, fotos, gone, ls, plant } = await garden(['monstera.jpg']);
    fs.rmSync(path.join(fotos, '2026-11-03-monstera.jpg'));
    await send({
      type: 'removeJardinPhoto',
      plantId: 'monstera',
      photo: '2026-11-03-monstera.jpg',
    });
    expect(plant('monstera')?.photos).toEqual([]);
    expect(ls(gone)).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No pude mover la foto 2026-11-03-monstera.jpg'),
      expect.any(String),
    );
  });
});
