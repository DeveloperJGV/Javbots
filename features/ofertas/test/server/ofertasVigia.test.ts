import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  BUEN_FIN_EVERY_MINUTES,
  DEFAULT_EVERY_MINUTES,
  HISTORY_CAP,
} from '../../server/vigia/constants.js';
import { ntfyNotifier } from '../../server/vigia/notifiers.js';
import { ofertasPath, readKeys, readNotifierConfig } from '../../server/vigia/storage.js';
import type {
  Alert,
  CommunityDeal,
  Notifier,
  Offer,
  Source,
  SourceAnswer,
} from '../../server/vigia/types.js';
import { SourceBlocked } from '../../server/vigia/types.js';
import { createVigia } from '../../server/vigia/vigia.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = new Date(2026, 10, 20, 9, 0).getTime();

interface FakeSource extends Source {
  calls: number;
  answer: () => SourceAnswer | Promise<SourceAnswer>;
}

function fake(
  id: string,
  answer: () => SourceAnswer | Promise<SourceAnswer>,
  extra: Partial<Source> = {},
): FakeSource {
  const s: FakeSource = {
    id,
    name: `Tienda ${id.toUpperCase()}`,
    fragile: false,
    access: 'prueba',
    calls: 0,
    answer,
    ready: () => true,
    searchUrl: (q) => `https://${id}.example/?q=${encodeURIComponent(q)}`,
    async search() {
      s.calls++;
      return s.answer();
    },
    ...extra,
  };
  return s;
}

const offer = (
  sourceId: string,
  price: number,
  title = 'Audífonos Sony WH-1000XM5 negro',
  o: Partial<Offer> = {},
): Offer => ({
  sourceId,
  store: `Tienda ${sourceId.toUpperCase()}`,
  id: `${sourceId}-${title}`,
  title,
  price,
  official: true,
  url: `https://${sourceId}.example/p`,
  ...o,
});

const only = (...offers: Offer[]): SourceAnswer => ({ offers, deals: [] });
const QUERY = 'audífonos sony wh-1000xm5';

describe('ofertas: the watch', () => {
  let home: string;
  let now: number;
  let told: Alert[];
  const notifier: Notifier = { id: 'prueba', notify: (a) => void told.push(a) };
  const make = (sources: Source[], extra: { notifiers?: Notifier[] } = {}) =>
    createVigia({
      home,
      sources,
      now: () => now,
      random: () => 0.5,
      timers: false,
      notifiers: extra.notifiers ?? [notifier],
      links: (q) => [{ name: 'Otra tienda', url: `https://otra.example/?q=${q}` }],
    });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-ofertas-'));
    now = START;
    told = [];
  });

  it('a live search filters, groups and reports each source; one that throws does not stop it', async () => {
    const a = fake('a', () =>
      only(
        offer('a', 6999),
        offer('a', 300, 'Funda para audífonos Sony WH-1000XM5'),
        offer('a', 5000, 'Audífonos Sony WH-1000XM4'),
      ),
    );
    const b = fake('b', () => only(offer('b', 6499, 'Sony WH1000XM5 audífonos inalámbricos')));
    const broken = fake('c', () => {
      throw new Error('boom');
    });
    const blocked = fake('d', () => {
      throw new SourceBlocked();
    });
    const nokey = fake('e', () => only(), { ready: () => false });
    const v = make([a, b, broken, blocked, nokey]);
    const r = await v.search(QUERY);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.offers.map((o) => o.price)).toEqual([6499, 6999]);
    const by = Object.fromEntries(r.sources.map((s) => [s.id, s]));
    expect(by.a).toMatchObject({ state: 'ok', count: 3 });
    expect(by.c!.state).toBe('error');
    expect(by.c!.detail).toMatch(/^No contestó; reintento después de las 09:15$/);
    expect(by.d!.state).toBe('blocked');
    expect(by.d!.detail).toBe('Bloqueó la consulta; reintento después de las 15:00');
    expect(by.e).toMatchObject({ state: 'nokey', detail: 'Falta la llave' });
    expect(nokey.calls).toBe(0);
    expect(r.links).toHaveLength(1);
    // Nothing saved but the sources' state.
    expect(v.state().watches).toEqual([]);
  });

  it('a new file starts with Amazon and Walmart off; a file that already chose is respected', () => {
    expect(make([]).state().settings.disabledSources).toEqual(['amazon', 'walmart']);
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // An older file without the choice gets the factory one
    fs.writeFileSync(file, JSON.stringify({ version: 1, ajustes: { everyMinutes: 60 } }));
    expect(make([]).state().settings.disabledSources).toEqual(['amazon', 'walmart']);
    // Chose to read them all: stays that way
    fs.writeFileSync(file, JSON.stringify({ version: 1, ajustes: { disabledSources: [] } }));
    expect(make([]).state().settings.disabledSources).toEqual([]);
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, ajustes: { disabledSources: ['walmart'] } }),
    );
    expect(make([]).state().settings.disabledSources).toEqual(['walmart']);
  });

  it('a switched-off source is not asked but still gives its search page to open by hand', async () => {
    const amazon = fake('amazon', () => only(offer('amazon', 6000)));
    const a = fake('a', () => only(offer('a', 6999)));
    const r = await make([amazon, a]).search(QUERY);
    expect(amazon.calls).toBe(0);
    expect(r.links[0]).toEqual({
      name: 'Tienda AMAZON',
      url: `https://amazon.example/?q=${encodeURIComponent(QUERY)}`,
    });
    expect(r.links.map((l) => l.name)).toEqual(['Tienda AMAZON', 'Otra tienda']);
  });

  it('a blocked source backs off longer each time and is not called while it waits', async () => {
    const blocked = fake('d', () => {
      throw new SourceBlocked();
    });
    const v = make([blocked]);
    await v.search(QUERY);
    expect(blocked.calls).toBe(1);
    now += 5 * HOUR;
    const r = await v.search(QUERY);
    expect(blocked.calls).toBe(1);
    expect(r.sources[0]!.detail).toBe('En pausa hasta las 15:00 (bloqueó)');
    await v.check(); // manual checks also respect it
    expect(blocked.calls).toBe(1);
    now = START + 6 * HOUR;
    await v.search(QUERY);
    expect(blocked.calls).toBe(2); // second block: 12 h
    now += 11 * HOUR;
    await v.search(QUERY);
    expect(blocked.calls).toBe(2);
    now += HOUR;
    blocked.answer = () => only(offer('d', 100));
    const ok = await v.search(QUERY);
    expect(blocked.calls).toBe(3);
    expect(ok.sources[0]).toMatchObject({ state: 'ok' });
    expect(ok.sources[0]!.detail).toBeUndefined();
    expect(ok.sources[0]!.lastOkAt).toBe(new Date(now).toISOString());
  });

  it('checks a watch: best, others, history, note and the next time with variation', async () => {
    let price = 7000;
    const a = fake('a', () => only(offer('a', price)));
    const b = fake('b', () =>
      only(offer('b', 7500), offer('b', 7400, 'Audífonos Sony WH-1000XM5 azul')),
    );
    const v = make([a, b]);
    const w = v.saveWatch({ query: QUERY, target: 6000 });
    expect(w.nextCheckAt).toBe(new Date(START).toISOString());
    await v.tick();
    let s = v.state().watches[0]!;
    expect(s.best?.price).toBe(7000);
    expect(s.others.map((o) => o.price)).toEqual([7400]);
    expect(s.history).toHaveLength(1);
    expect(s.lowest).toBe(7000);
    expect(s.reached).toBe(false);
    // random 0.5 → no variation: exactly the default interval.
    expect(Date.parse(s.nextCheckAt!)).toBe(START + DEFAULT_EVERY_MINUTES * MIN);

    // Not due yet: tick does nothing.
    now += 10 * MIN;
    await v.tick();
    expect(a.calls).toBe(1);

    now = START + DAY;
    price = 5900;
    await v.tick();
    s = v.state().watches[0]!;
    expect(s.best?.price).toBe(5900);
    expect(s.reached).toBe(true);
    expect(s.note).toBe('Bajó 16 % desde ayer');
    expect(told.map((t) => t.kind)).toEqual(['target']);
    expect(v.state().alerts[0]!.text).toBe(
      'Audífonos sony wh-1000xm5: $5,900 en Tienda A (tu objetivo era $6,000)',
    );
  });

  it('variation stays inside ±20 % and sale mode checks more often', async () => {
    const a = fake('a', () => only(offer('a', 7000)));
    const v = createVigia({ home, sources: [a], now: () => now, random: () => 1, timers: false });
    v.saveWatch({ query: QUERY });
    await v.tick();
    expect(Date.parse(v.state().watches[0]!.nextCheckAt!)).toBe(
      START + DEFAULT_EVERY_MINUTES * MIN * 1.2,
    );
    v.setSettings({ buenFin: true });
    expect(Date.parse(v.state().watches[0]!.nextCheckAt!)).toBe(
      START + BUEN_FIN_EVERY_MINUTES * MIN * 1.2,
    );
    v.setSettings({ everyMinutes: 1, dropPercent: 500 });
    expect(v.state().settings).toMatchObject({ everyMinutes: 10, dropPercent: 90, buenFin: true });
  });

  it('respects minIntervalMs per watch and source, reusing the last answer', async () => {
    const slow = fake('s', () => only(offer('s', 7000)), { minIntervalMs: 2 * HOUR });
    const fast = fake('f', () => only(offer('f', 7100)));
    const v = make([slow, fast]);
    v.saveWatch({ query: QUERY });
    await v.check();
    now += HOUR;
    await v.check();
    expect(slow.calls).toBe(1);
    expect(fast.calls).toBe(2);
    expect(v.state().watches[0]!.best?.price).toBe(7000);
    now += HOUR;
    await v.check();
    expect(slow.calls).toBe(2);
  });

  it('caps the history and says why a check gave nothing', async () => {
    let fail = false;
    let none = false;
    const a = fake('a', () => {
      if (fail) {
        throw new Error('down');
      }
      return none ? only() : only(offer('a', 7000));
    });
    const v = make([a]);
    v.saveWatch({ query: QUERY });
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      now += 2 * HOUR;
      await v.check();
    }
    expect(v.state().watches[0]!.history).toHaveLength(HISTORY_CAP);
    none = true;
    now += 2 * HOUR;
    await v.check();
    expect(v.state().watches[0]!.error).toBe('Ninguna tienda lo tiene');
    fail = true;
    now += 2 * HOUR;
    await v.check();
    expect(v.state().watches[0]!.error).toBe('Ninguna tienda contestó');
    expect(v.state().watches[0]!.history).toHaveLength(HISTORY_CAP);
  });

  it('community deals: the first check only notes them, later ones alert once', async () => {
    let deals: CommunityDeal[] = [
      {
        id: 'd1',
        title: 'Audífonos Sony WH-1000XM5 en oferta',
        temperature: 300,
        url: 'https://c.example/1',
        expired: false,
      },
    ];
    const a = fake('a', () => ({ offers: [offer('a', 7000)], deals }));
    const v = make([a]);
    v.saveWatch({ query: QUERY });
    await v.check();
    expect(told).toEqual([]);
    expect(v.state().watches[0]!.seenDeals).toEqual(['d1']);
    deals = [
      ...deals,
      {
        id: 'd2',
        title: 'Audífonos Sony WH-1000XM5 a $5,000',
        price: 5000,
        temperature: 500,
        url: 'https://c.example/2',
        expired: false,
      },
    ];
    now += HOUR;
    await v.check();
    expect(told.map((t) => t.kind)).toEqual(['community']);
    now += HOUR;
    await v.check();
    expect(told).toHaveLength(1);
  });

  it('a notifier that throws does not stop the others', async () => {
    const a = fake('a', () => only(offer('a', 500)));
    const bad: Notifier = {
      id: 'malo',
      notify: () => {
        throw new Error('nope');
      },
    };
    const rejecting: Notifier = { id: 'rechaza', notify: () => Promise.reject(new Error('nope')) };
    const v = make([a], { notifiers: [bad, rejecting, notifier] });
    v.saveWatch({ query: QUERY, target: 1000 });
    await v.check();
    expect(told.map((t) => t.kind)).toEqual(['target']);
  });

  it('persists, reads back and keeps the keys pasted by hand', async () => {
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        llaves: { mercadolibre: { clientId: 'abc', clientSecret: 'xyz', extra: 1 } },
        avisadores: { ntfy: { tema: 'mi-tema_123' } },
        otro: true,
      }),
    );
    const a = fake('a', () => only(offer('a', 7000)));
    const v = make([a]);
    const w = v.saveWatch({
      query: QUERY,
      target: 5000,
      mustHave: ['negro', ' ', 'negro'],
      exclude: ['usado'],
    });
    await v.check();
    v.setSettings({ dropPercent: 15, disabledSources: ['x'] });
    const disk = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(disk.version).toBe(1);
    expect(disk.llaves.mercadolibre.clientId).toBe('abc');
    expect(disk.avisadores.ntfy.tema).toBe('mi-tema_123');
    expect(readKeys(home)).toEqual({ mercadolibre: { clientId: 'abc', clientSecret: 'xyz' } });
    expect(readNotifierConfig(home)).toEqual({ ntfy: { topic: 'mi-tema_123' } });

    const again = make([a]).state();
    expect(again.settings).toMatchObject({ dropPercent: 15, disabledSources: ['x'] });
    expect(again.watches[0]).toMatchObject({
      id: w.id,
      target: 5000,
      mustHave: ['negro'],
      exclude: ['usado'],
    });
    expect(again.watches[0]!.best?.price).toBe(7000);
    expect(again.watches[0]!.history).toHaveLength(1);

    v.deleteWatch(w.id);
    expect(make([a]).state().watches).toEqual([]);
  });

  it('a broken file never throws: it is kept aside and the watch starts clean', () => {
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ esto no es json');
    const v = make([]);
    expect(v.state().watches).toEqual([]);
    expect(fs.readFileSync(file + '.roto', 'utf-8')).toBe('{ esto no es json');
    v.saveWatch({ query: 'bocina' });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).busquedas).toHaveLength(1);
    // Odd fields are dropped, not fatal.
    fs.writeFileSync(
      file,
      JSON.stringify({
        busquedas: [{ id: 1 }, { id: 'ok', query: 'x', history: 'no' }],
        ajustes: 5,
      }),
    );
    expect(
      make([])
        .state()
        .watches.map((w) => w.id),
    ).toEqual(['ok']);
  });

  it('never runs two rounds at once and reports checking', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = fake('a', async () => {
      await gate;
      return only(offer('a', 7000));
    });
    const v = make([a]);
    v.saveWatch({ query: QUERY });
    v.saveWatch({ query: 'bocina jbl flip 6' });
    const seen: boolean[] = [];
    v.onChange(() => seen.push(v.state().checking));
    const first = v.check();
    await v.tick(); // skipped: a round is running
    expect(v.state().checking).toBe(true);
    release();
    await first;
    expect(a.calls).toBe(2); // one per watch, one after the other
    expect(v.state().checking).toBe(false);
    expect(seen).toContain(true);
  });

  it('ntfy posts the text with a generic agent and is off without a topic', async () => {
    expect(ntfyNotifier({})).toBeUndefined();
    const calls: { url: string; init: RequestInit }[] = [];
    const n = ntfyNotifier({
      topic: 'tema',
      server: 'https://ntfy.example/',
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response('ok');
      }) as unknown as typeof fetch,
    })!;
    await n.notify(
      {
        id: '1',
        watchId: 'w',
        at: new Date(START).toISOString(),
        kind: 'drop',
        text: 'Bajó',
        url: 'https://x.example',
        seen: false,
      },
      {} as never,
    );
    expect(calls[0]!.url).toBe('https://ntfy.example/tema');
    expect(calls[0]!.init.body).toBe('Bajó');
    expect(calls[0]!.init.headers).toMatchObject({ Title: 'Ofertas', Click: 'https://x.example' });
  });
});

const DAY = 24 * HOUR;
