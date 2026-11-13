import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OfertasResults, OfertasStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { createAsistente } from '../../server/asistente/asistente.js';
import {
  createDesktopNotifier,
  createOfertasFeature,
  toStatus,
} from '../../server/ofertasFeature.js';
import type {
  Alert,
  AssistantFacts,
  SearchOutcome,
  SourceStatus,
  Vigia,
  VigiaState,
  Watch,
  WatchAssistant,
  WatchInput,
} from '../../server/vigia/types.js';

const offer = {
  sourceId: 'tienda',
  store: 'Tienda',
  id: 'sku-1',
  title: 'Audífonos inalámbricos',
  price: 999,
  brand: 'Marca',
  official: true,
  url: 'https://example.com/p/1',
};

const watch: Watch = {
  id: 'w1',
  query: 'audífonos',
  target: 1000,
  mustHave: [],
  exclude: ['funda'],
  createdAt: '2026-11-01T00:00:00.000Z',
  best: offer,
  others: [],
  history: [{ at: '2026-11-01T00:00:00.000Z', price: 999, sourceId: 'tienda' }],
  reached: true,
  seenDeals: ['d1'],
  note: undefined,
};

const source = (over: Partial<SourceStatus>): SourceStatus => ({
  id: 'tienda',
  name: 'Tienda',
  state: 'ok',
  fragile: false,
  enabled: true,
  access: 'JSON público de la tienda, sin llave',
  ...over,
});

const alert: Alert = {
  id: 'a1',
  watchId: 'w1',
  at: '2026-11-01T00:00:00.000Z',
  kind: 'target',
  text: 'Audífonos a $999 en Tienda',
  seen: false,
};

interface FakeVigia extends Vigia {
  saved: WatchInput[];
  assistants: [string, WatchAssistant][];
  rejudged: { query: string; assistant?: AssistantFacts }[];
  settings: unknown[];
  fire(): void;
  searchImpl: (q: string) => Promise<SearchOutcome>;
  stopped: boolean;
}

function fakeVigia(): FakeVigia {
  const listeners = new Set<() => void>();
  const state: VigiaState = {
    watches: [watch],
    alerts: [alert],
    sources: [source({ lastOkAt: '2026-11-01T00:00:00.000Z' })],
    settings: { everyMinutes: 180, buenFin: false, dropPercent: 10, disabledSources: [] },
    checking: false,
  };
  const v: FakeVigia = {
    saved: [],
    assistants: [],
    rejudged: [],
    settings: [],
    stopped: false,
    fire: () => listeners.forEach((l) => l()),
    searchImpl: async (query) => ({
      query,
      groups: [{ key: 'g1', title: offer.title, offers: [offer] }],
      deals: [],
      sources: [source({ count: 1 })],
      links: [{ name: 'Otra', url: 'https://example.com/buscar?q=x' }],
    }),
    state: () => state,
    search: (q) => v.searchImpl(q),
    saveWatch: (input) => {
      v.saved.push(input);
      return watch;
    },
    deleteWatch: () => {},
    setAssistant: (id, answer) => {
      v.assistants.push([id, answer]);
      return id === watch.id;
    },
    rejudge: (group, query, assistant) => {
      v.rejudged.push({ query, assistant });
      return { ...group, verdict: { kind: 'good', reason: 'Con el asistente' } };
    },
    check: async () => {},
    setSettings: (changes) => {
      v.settings.push(changes);
    },
    markAlertsSeen: () => {},
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    tick: async () => {},
    start: () => {},
    stop: () => {
      v.stopped = true;
    },
  };
  return v;
}

describe('ofertas (server feature)', () => {
  let vigia: FakeVigia;
  let notes: string[];
  const client = (privileged: boolean) => {
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient & { sent: Record<string, unknown>[] } = {
      privileged,
      sent,
      send: (m) => sent.push(m),
    };
    return c;
  };
  const feature = () =>
    createOfertasFeature({
      vigia,
      timers: false,
      notify: (_t, m) => notes.push(m),
      // Turned off: these tests never look for (or run) a CLI
      asistente: createAsistente({
        config: () => ({ enabled: false, command: 'nada', model: 'haiku', timeoutMs: 1000 }),
        log: () => {},
      }),
    });

  beforeEach(() => {
    vigia = fakeVigia();
    notes = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('webviewReady sends the status and lets the core handle it too', () => {
    const f = feature();
    const c = client(true);
    expect(f.handleClientMessage!({ type: 'webviewReady' }, c)).toBe(false);
    expect(c.sent.map((m) => m.type)).toEqual(['ofertasStatus', 'ofertasAsistenteEstado']);
    expect(c.sent[1]).toMatchObject({ enabled: false, available: false, busy: false });
  });

  it('a client without token gets nothing and cannot act', () => {
    const f = feature();
    const c = client(false);
    f.connect!(c);
    f.handleClientMessage!({ type: 'webviewReady' }, c);
    expect(
      f.handleClientMessage!({ type: 'saveOfertasWatch', query: 'tele', target: 5000 }, c),
    ).toBe(true);
    expect(f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r', query: 'x' }, c)).toBe(
      true,
    );
    vigia.fire();
    expect(c.sent).toHaveLength(0);
    expect(vigia.saved).toHaveLength(0);
  });

  it('searchOfertas answers "searching" first, then the results, only to who asked', async () => {
    const f = feature();
    const asker = client(true);
    const other = client(true);
    f.connect!(asker);
    f.connect!(other);
    f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r1', query: ' audífonos ' }, asker);
    expect(asker.sent).toHaveLength(1);
    const first = asker.sent[0] as unknown as OfertasResults;
    expect(first).toMatchObject({ type: 'ofertasResults', requestId: 'r1', searching: true });
    expect(first.groups).toEqual([]);
    await vi.waitFor(() => expect(asker.sent).toHaveLength(2));
    const final = asker.sent[1] as unknown as OfertasResults;
    expect(final).toMatchObject({ requestId: 'r1', query: 'audífonos', searching: false });
    expect(final.groups[0].offers[0]).not.toHaveProperty('id');
    expect(final.groups[0].offers[0]).not.toHaveProperty('brand');
    expect(final.sources[0]).not.toHaveProperty('access');
    expect(other.sent).toHaveLength(0);
  });

  it('ignores an empty or too long query', () => {
    const f = feature();
    const c = client(true);
    f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r', query: '   ' }, c);
    f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r', query: 'x'.repeat(121) }, c);
    expect(c.sent).toHaveLength(0);
  });

  it('a search that throws still sends an empty final answer', async () => {
    vigia.searchImpl = () => Promise.reject(new Error('boom'));
    const f = feature();
    const c = client(true);
    f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r2', query: 'tele' }, c);
    await vi.waitFor(() => expect(c.sent).toHaveLength(2));
    const final = c.sent[1] as unknown as OfertasResults;
    expect(final.searching).toBe(false);
    expect(final.groups).toEqual([]);
    expect(final.sources.map((s) => s.state)).toEqual(['error']);
  });

  it('saveOfertasWatch validates the target and cleans the word lists', () => {
    const f = feature();
    const c = client(true);
    f.handleClientMessage!({ type: 'saveOfertasWatch', query: 'tele', target: -5 }, c);
    f.handleClientMessage!({ type: 'saveOfertasWatch', query: 'tele', target: 'mil' }, c);
    f.handleClientMessage!({ type: 'saveOfertasWatch', query: 42 }, c);
    expect(vigia.saved).toHaveLength(0);
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    f.handleClientMessage!(
      {
        type: 'saveOfertasWatch',
        query: ' tele 55 ',
        target: 7000,
        mustHave: [' 4k ', '', 3, '4k', null],
        exclude: many,
      },
      c,
    );
    expect(vigia.saved).toEqual([
      { query: 'tele 55', target: 7000, mustHave: ['4k'], exclude: many.slice(0, 12) },
    ]);
  });

  it('setOfertasSettings passes only the fields that came with the right type', () => {
    const f = feature();
    const c = client(true);
    f.handleClientMessage!({ type: 'setOfertasSettings', buenFin: true, everyMinutes: 'x' }, c);
    f.handleClientMessage!({ type: 'setOfertasSettings', everyMinutes: -1 }, c);
    expect(vigia.settings).toEqual([{ buenFin: true }]);
  });

  it('onChange sends the status to every privileged client, and dispose stops it', () => {
    const f = feature();
    const a = client(true);
    const b = client(true);
    f.connect!(a);
    f.connect!(b);
    vigia.fire();
    expect(a.sent.map((m) => m.type)).toEqual(['ofertasStatus']);
    expect(b.sent.map((m) => m.type)).toEqual(['ofertasStatus']);
    f.dispose!();
    vigia.fire();
    expect(a.sent).toHaveLength(1);
    expect(vigia.stopped).toBe(true);
  });

  it('toStatus copies only the protocol fields', () => {
    const s: OfertasStatus = toStatus(vigia.state());
    const w = s.watches[0];
    expect(w).not.toHaveProperty('createdAt');
    expect(w).not.toHaveProperty('seenDeals');
    expect(w).not.toHaveProperty('note');
    expect(w.history[0]).toEqual({ at: '2026-11-01T00:00:00.000Z', price: 999 });
    expect(w.best).not.toHaveProperty('id');
    expect(w.best).not.toHaveProperty('brand');
    expect(s.sources[0]).not.toHaveProperty('access');
    expect(s.alerts[0]).not.toHaveProperty('price');
  });

  it('connections maps the source states and marks the fragile ones', () => {
    vigia.state().sources = [
      source({ id: 'a', state: 'ok', lastOkAt: '2026-11-01T00:00:00.000Z' }),
      source({ id: 'b', state: 'blocked', fragile: true, detail: 'Bloqueó la consulta' }),
      source({ id: 'c', state: 'nokey' }),
      source({ id: 'd', state: 'idle' }),
    ];
    const list = feature().connections!();
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId['ofertas-a']).toMatchObject({
      state: 'ok',
      feature: 'Ofertas',
      lastUsedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(byId['ofertas-b']).toMatchObject({
      state: 'warn',
      detail: 'Frágil: Bloqueó la consulta',
    });
    expect(byId['ofertas-c'].state).toBe('off');
    expect(byId['ofertas-d'].state).toBe('ok');
    expect(byId['ofertas-fcm'].state).toBe('idea');
    expect(byId['ofertas-ntfy']).toMatchObject({ state: 'off', detail: 'Sin tema configurado' });
    expect(byId['ofertas-asistente']).toMatchObject({
      state: 'off',
      detail: 'Claude Code no está instalado',
    });
  });

  it('the desktop notifier calls notify with the alert text', async () => {
    const calls: [string, string][] = [];
    const n = createDesktopNotifier((t, m) => calls.push([t, m]));
    expect(n.id).toBe('desktop');
    await n.notify(alert, watch);
    expect(calls).toEqual([['Ofertas', 'Audífonos a $999 en Tienda']]);
  });
});
