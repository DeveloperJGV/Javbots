import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OfertasAsistenteEstado,
  OfertasAsistenteResultado,
  OfertasResults,
} from '../../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../../server/src/serverFeature.js';
import { createAsistente } from '../../server/asistente/asistente.js';
import { readAsistenteConfig } from '../../server/asistente/config.js';
import { createOfertasFeature } from '../../server/ofertasFeature.js';
import { ofertasPath } from '../../server/vigia/storage.js';
import type {
  AssistantFacts,
  SearchOutcome,
  Vigia,
  VigiaState,
  WatchAssistant,
} from '../../server/vigia/types.js';

const FAKE = path.resolve(__dirname, '../dobles/claudeFalso.mjs');

const offer = {
  sourceId: 'tienda',
  store: 'Tienda',
  id: 'sku-1',
  title: 'Bocina Marca X Modelo 200',
  price: 1700,
  official: true,
  url: 'https://example.com/p/1',
};

interface FakeVigia extends Vigia {
  assistants: [string, WatchAssistant][];
  rejudged: { query: string; key: string; assistant?: AssistantFacts }[];
}

function fakeVigia(): FakeVigia {
  const state: VigiaState = {
    watches: [],
    alerts: [],
    sources: [],
    settings: { everyMinutes: 180, buenFin: false, dropPercent: 10, disabledSources: [] },
    checking: false,
  };
  const v: FakeVigia = {
    assistants: [],
    rejudged: [],
    state: () => state,
    search: async (query): Promise<SearchOutcome> => ({
      query,
      groups: [{ key: 'g1', title: offer.title, offers: [offer] }],
      deals: [],
      sources: [],
      links: [],
    }),
    saveWatch: () => {
      throw new Error('no');
    },
    deleteWatch: () => {},
    setAssistant: (id, answer) => {
      v.assistants.push([id, answer]);
      return true;
    },
    rejudge: (group, query, assistant) => {
      v.rejudged.push({ query, key: group.key, assistant });
      return { ...group, verdict: { kind: 'good', reason: 'Con el asistente (asistente)' } };
    },
    check: async () => {},
    setSettings: () => {},
    markAlertsSeen: () => {},
    onChange: () => () => {},
    tick: async () => {},
    start: () => {},
    stop: () => {},
  };
  return v;
}

type Client = FeatureClient & { sent: Record<string, unknown>[] };
const client = (privileged = true): Client => {
  const sent: Record<string, unknown>[] = [];
  return { privileged, sent, send: (m) => sent.push(m) };
};
const of = <T>(c: Client, type: string) => c.sent.filter((m) => m.type === type) as unknown as T[];

describe('ofertas asistente in the panel (server, with a fake CLI, never the real one)', () => {
  let home: string;
  let logFile: string;
  let vigia: FakeVigia;
  let features: ServerFeature[];

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-ofertas-asis-f-'));
    logFile = path.join(home, 'llamada.json');
    vigia = fakeVigia();
    features = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The fake CLI is node + the script: the command comes from the file, like a person would set it
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ asistente: { comando: process.execPath }, llaves: { x: 1 } }),
    );
  });
  afterEach(() => {
    for (const f of features) f.dispose?.();
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  const make = (mode: string, extraEnv: NodeJS.ProcessEnv = {}) => {
    const f = createOfertasFeature({
      vigia,
      home,
      timers: false,
      asistente: createAsistente({
        home,
        argsPrefix: [FAKE],
        env: { ...process.env, FALSO_MODO: mode, FALSO_LOG: logFile, ...extraEnv },
        log: () => {},
      }),
    });
    features.push(f);
    return f;
  };

  const lastEstado = (c: Client) => of<OfertasAsistenteEstado>(c, 'ofertasAsistenteEstado').at(-1)!;
  const resultado = async (c: Client) => {
    await vi.waitFor(() => expect(of(c, 'ofertasAsistenteResultado')).toHaveLength(1), {
      timeout: 15_000,
    });
    return of<OfertasAsistenteResultado>(c, 'ofertasAsistenteResultado')[0]!;
  };

  it('says on connect that it is available, with its model', () => {
    const f = make('precio');
    const c = client();
    f.handleClientMessage!({ type: 'webviewReady' }, c);
    expect(lastEstado(c)).toEqual({
      type: 'ofertasAsistenteEstado',
      installed: true,
      enabled: true,
      available: true,
      model: 'haiku',
      busy: false,
    });
  });

  it('a client without token cannot ask: nothing runs and nothing is sent', async () => {
    const f = make('precio');
    const c = client(false);
    f.connect!(c);
    for (const type of [
      'ofertasAsistenteInvestigar',
      'ofertasAsistenteSimilares',
      'ofertasAsistenteCancelar',
      'setOfertasAsistente',
    ]) {
      expect(f.handleClientMessage!({ type, producto: 'Bocina', enabled: false }, c)).toBe(true);
    }
    f.handleClientMessage!({ type: 'webviewReady' }, c);
    await new Promise((r) => setTimeout(r, 300));
    expect(c.sent).toHaveLength(0);
    expect(fs.existsSync(logFile)).toBe(false);
    expect(readAsistenteConfig(home).enabled).toBe(true);
  });

  it('a price for a watched search: busy while it runs, kept on the watch, answered to who asked', async () => {
    const f = make('precio');
    const c = client();
    const other = client();
    f.connect!(c);
    f.connect!(other);
    f.handleClientMessage!(
      {
        type: 'ofertasAsistenteInvestigar',
        producto: 'Bocina Marca X Modelo 200',
        precioActual: 1700,
        tienda: 'Tienda',
        watchId: 'w1',
      },
      c,
    );
    expect(lastEstado(c)).toMatchObject({
      busy: true,
      job: 'precio',
      product: 'Bocina Marca X Modelo 200',
      watchId: 'w1',
    });
    expect(typeof lastEstado(other).startedAt).toBe('string');
    const r = await resultado(c);
    expect(r).toMatchObject({ ok: true, job: 'precio', watchId: 'w1' });
    expect(r.precio!.precioTipico).toBe(1899);
    expect(vigia.assistants).toHaveLength(1);
    expect(vigia.assistants[0]![0]).toBe('w1');
    expect(vigia.assistants[0]![1].precio!.fuentes).toHaveLength(2);
    expect(of(other, 'ofertasAsistenteResultado')).toHaveLength(0);
    expect(lastEstado(c).busy).toBe(false);
    expect(lastEstado(other).busy).toBe(false);
  });

  it("a price for a live search's product re-judges it and sends its results again", async () => {
    const f = make('precio');
    const c = client();
    f.connect!(c);
    f.handleClientMessage!({ type: 'searchOfertas', requestId: 'r1', query: 'bocina' }, c);
    await vi.waitFor(() => expect(of(c, 'ofertasResults')).toHaveLength(2));
    f.handleClientMessage!(
      {
        type: 'ofertasAsistenteInvestigar',
        producto: offer.title,
        precioActual: 1700,
        requestId: 'r1',
        groupKey: 'g1',
      },
      c,
    );
    const r = await resultado(c);
    expect(r.ok).toBe(true);
    expect(vigia.rejudged).toEqual([
      { query: 'bocina', key: 'g1', assistant: { typical: 1899, low: 1599 } },
    ]);
    const again = of<OfertasResults>(c, 'ofertasResults').at(-1)!;
    expect(again).toMatchObject({ requestId: 'r1', searching: false });
    expect(again.groups[0]!.verdict).toEqual({
      kind: 'good',
      reason: 'Con el asistente (asistente)',
    });
    expect(vigia.assistants).toHaveLength(0);
  });

  it('similars for a watched search are kept too', async () => {
    const f = make('similares');
    const c = client();
    f.connect!(c);
    f.handleClientMessage!(
      { type: 'ofertasAsistenteSimilares', producto: 'Bocina Marca X', watchId: 'w1' },
      c,
    );
    const r = await resultado(c);
    expect(r.ok).toBe(true);
    expect(r.similares!.similares[0]!.tipo).toBe('compa');
    expect(vigia.assistants[0]![1].similares!.similares).toHaveLength(3);
  });

  it('one at a time: a second request answers busy; Cancelar stops the first', async () => {
    const f = make('cuelga');
    const c = client();
    f.connect!(c);
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    f.handleClientMessage!({ type: 'ofertasAsistenteSimilares', producto: 'Dos' }, c);
    await vi.waitFor(() => expect(of(c, 'ofertasAsistenteResultado')).toHaveLength(1));
    expect(of<OfertasAsistenteResultado>(c, 'ofertasAsistenteResultado')[0]).toMatchObject({
      ok: false,
      reason: 'busy',
      product: 'Dos',
    });
    // Wait until the CLI itself runs (after the login check), then cancel
    await vi.waitFor(() => expect(fs.existsSync(logFile)).toBe(true), { timeout: 10_000 });
    f.handleClientMessage!({ type: 'ofertasAsistenteCancelar' }, c);
    await vi.waitFor(() => expect(of(c, 'ofertasAsistenteResultado')).toHaveLength(2), {
      timeout: 10_000,
    });
    expect(of<OfertasAsistenteResultado>(c, 'ofertasAsistenteResultado')[1]).toMatchObject({
      ok: false,
      reason: 'cancelled',
      product: 'Uno',
    });
    expect(lastEstado(c).busy).toBe(false);
  });

  it('the asking client going away stops its query (nobody would see it)', async () => {
    const f = make('cuelga');
    const c = client();
    const off = f.connect!(c);
    const other = client();
    f.connect!(other);
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    await vi.waitFor(() => expect(fs.existsSync(logFile)).toBe(true), { timeout: 10_000 });
    off();
    await vi.waitFor(() => expect(lastEstado(other).busy).toBe(false), { timeout: 10_000 });
  });

  it('dispose stops the query in course', async () => {
    const f = make('cuelga');
    const c = client();
    f.connect!(c);
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    await vi.waitFor(() => expect(fs.existsSync(logFile)).toBe(true), { timeout: 10_000 });
    f.dispose!();
    const r = await resultado(c);
    expect(r).toMatchObject({ ok: false, reason: 'cancelled' });
  });

  it('without the CLI: not available, and a request answers no-cli', async () => {
    fs.writeFileSync(
      ofertasPath(home),
      JSON.stringify({ asistente: { comando: path.join(home, 'no-existe.exe') } }),
    );
    const f = make('precio');
    const c = client();
    f.handleClientMessage!({ type: 'webviewReady' }, c);
    expect(lastEstado(c)).toMatchObject({ installed: false, available: false });
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    expect((await resultado(c)).reason).toBe('no-cli');
  });

  it('with an API key in the environment it never runs: the key is not handed over and the CLI still has no subscription', async () => {
    // The fake CLI, like the real one, would bill the key if it saw it: it never does, so the login check passes
    const authLog = path.join(home, 'auth.json');
    const f = make('precio', { ANTHROPIC_API_KEY: 'sk-ant-falsa', FALSO_LOG_AUTH: authLog });
    const c = client();
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    expect((await resultado(c)).ok).toBe(true);
    const seen = JSON.parse(fs.readFileSync(authLog, 'utf8')) as string[];
    expect(seen.map((k) => k.toUpperCase())).not.toContain('ANTHROPIC_API_KEY');
    const called = JSON.parse(fs.readFileSync(logFile, 'utf8')) as { envNames: string[] };
    expect(called.envNames.map((k) => k.toUpperCase())).not.toContain('ANTHROPIC_API_KEY');
  });

  it('a CLI signed in with a paid key (not the subscription) is refused before the query', async () => {
    const f = make('precio', { FALSO_AUTH: 'llave' });
    const c = client();
    f.handleClientMessage!({ type: 'ofertasAsistenteInvestigar', producto: 'Uno' }, c);
    expect((await resultado(c)).reason).toBe('no-subscription');
    expect(fs.existsSync(logFile)).toBe(false);
  });

  it('Ajustes: turning it off and choosing the model write ofertas.json and keep the rest', () => {
    const f = make('precio');
    const c = client();
    f.connect!(c);
    f.handleClientMessage!({ type: 'setOfertasAsistente', model: 'sonnet' }, c);
    expect(lastEstado(c)).toMatchObject({ model: 'sonnet', available: true });
    f.handleClientMessage!({ type: 'setOfertasAsistente', enabled: false }, c);
    expect(lastEstado(c)).toMatchObject({ enabled: false, available: false });
    // A model outside the list is ignored
    f.handleClientMessage!({ type: 'setOfertasAsistente', model: 'opus; rm -rf' }, c);
    let disk = JSON.parse(fs.readFileSync(ofertasPath(home), 'utf8'));
    expect(disk).toEqual({
      asistente: { comando: process.execPath, modelo: 'sonnet', apagado: true },
      llaves: { x: 1 },
    });
    f.handleClientMessage!({ type: 'setOfertasAsistente', enabled: true, model: 'haiku' }, c);
    disk = JSON.parse(fs.readFileSync(ofertasPath(home), 'utf8'));
    expect(disk.asistente).toEqual({ comando: process.execPath });
    expect(lastEstado(c)).toMatchObject({ enabled: true, model: 'haiku', available: true });
  });
});
