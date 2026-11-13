import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { createDecksFeature } from '../../server/decksFeature.js';
import { fakeYgo } from './fixtures.js';

/** A box color picked by a person (test data, not a UI color). */
// eslint-disable-next-line pixel-agents/no-inline-colors
const BOX_COLOR = '#123456';
const homes: string[] = [];
const disposers: (() => void)[] = [];

function setup(opts: { decksJson?: Record<string, unknown> } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'decks-home-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  if (opts.decksJson)
    fs.writeFileSync(path.join(pixel, 'decks.json'), JSON.stringify(opts.decksJson));
  const ygo = fakeYgo();
  let n = 0;
  const feature = createDecksFeature({
    home,
    officeToken: () => 'tok',
    fetch: ygo.fetcher,
    now: () => Date.parse('2026-11-13T20:15:00.000Z'),
    random: () => ((n++ * 7) % 36) / 36,
    sleep: async () => {},
    timers: false,
  });
  disposers.push(() => feature.dispose?.());
  const client = (privileged = true) => {
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged, send: (m) => sent.push(m) };
    feature.connect?.(c);
    return { c, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
  };
  const folder = path.join(pixel, 'decks');
  return { home, pixel, folder, feature, client, ygo };
}

/** Lets the feature's async work (search, import) finish. */
const settle = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  for (const d of disposers.splice(0)) d();
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

const deckInput = {
  id: '',
  name: 'Dragones',
  owner: 'Ana',
  createdAt: '',
  updatedAt: '',
  cover: 89631139,
  box: { color: BOX_COLOR },
  notes: '',
  main: [89631139, 89631139, 46986414],
  extra: [],
  side: [],
};

describe('decks feature: messages', () => {
  it('answers only privileged clients', () => {
    const { feature, client } = setup();
    const priv = client(true);
    const anon = client(false);
    expect(feature.handleClientMessage?.({ type: 'webviewReady' }, priv.c)).toBe(false);
    expect(feature.handleClientMessage?.({ type: 'webviewReady' }, anon.c)).toBe(false);
    expect(priv.last('decksStatus')).toMatchObject({
      decks: [],
      db: { state: 'missing' },
      problems: [],
    });
    expect(anon.sent).toHaveLength(0);
    expect(feature.handleClientMessage?.({ type: 'decksSave', deck: deckInput }, anon.c)).toBe(
      true,
    );
    expect(feature.handleClientMessage?.({ type: 'otherThing' }, priv.c)).toBe(false);
  });

  it('saves a new deck as <id>.json, keeps unknown fields, and deletes to the trash', () => {
    const { feature, client, folder } = setup();
    const a = client();
    const b = client();
    feature.handleClientMessage?.({ type: 'decksSave', deck: deckInput }, a.c);
    const status = b.last('decksStatus') as { decks: { id: string; updatedAt: string }[] };
    expect(status.decks).toHaveLength(1);
    const id = status.decks[0].id;
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(status.decks[0].updatedAt).toBe('2026-11-13T20:15:00.000Z');
    const file = path.join(folder, `${id}.json`);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved).toMatchObject({
      version: 1,
      id,
      name: 'Dragones',
      createdAt: '2026-11-13',
      main: deckInput.main,
    });

    // A field written by someone else survives the next save
    fs.writeFileSync(file, JSON.stringify({ ...saved, tournament: 'local' }));
    feature.store.check();
    feature.handleClientMessage?.(
      { type: 'decksSave', deck: { ...deckInput, id, name: 'Dragones 2' } },
      a.c,
    );
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      tournament: 'local',
      name: 'Dragones 2',
    });

    feature.handleClientMessage?.({ type: 'decksDelete', id }, a.c);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(path.join(folder, '.borrados'))[0]).toMatch(
      new RegExp(`^${id}-.*\\.json$`),
    );
    expect((b.last('decksStatus') as { decks: unknown[] }).decks).toHaveLength(0);
  });

  it('refuses an invalid id instead of making a copy', () => {
    const { feature, client, folder } = setup();
    const a = client();
    feature.handleClientMessage?.({ type: 'decksSave', deck: { ...deckInput, id: '../x' } }, a.c);
    expect((a.last('decksStatus') as { problems: string[] }).problems[0]).toContain('id');
    expect(fs.existsSync(folder) ? fs.readdirSync(folder) : []).toEqual([]);
  });

  it('notices decks written from outside and reports broken files', () => {
    const { feature, client, folder } = setup();
    const a = client();
    feature.handleClientMessage?.({ type: 'decksOpen' }, a.c);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, 'k3x9q2.json'),
      JSON.stringify({ name: 'De fuera', main: [46986414] }),
    );
    fs.writeFileSync(path.join(folder, 'roto1.json'), '{ no es json');
    fs.writeFileSync(path.join(folder, 'Mal Nombre.json'), '{}');
    expect(feature.store.check()).toBe(true);
    const status = a.last('decksStatus') as {
      decks: { id: string; name: string }[];
      problems: string[];
    };
    expect(status.decks).toEqual([expect.objectContaining({ id: 'k3x9q2', name: 'De fuera' })]);
    expect(status.problems).toHaveLength(2);
    expect(feature.store.check()).toBe(false);
  });

  it('uses the folder of decks.json', () => {
    const { feature, client, home } = setup({ decksJson: { folder: 'mis-decks' } });
    const a = client();
    feature.handleClientMessage?.({ type: 'decksOpen' }, a.c);
    expect(a.last('decksStatus')).toMatchObject({
      folder: path.join(home, '.pixel-agents', 'mis-decks'),
    });
  });

  it('searches, gives card data (alternate artworks under their own code) and imports text', async () => {
    const { feature, client, ygo } = setup();
    const a = client();
    feature.handleClientMessage?.({ type: 'decksSearch', requestId: 'r1', query: 'blue' }, a.c);
    await settle();
    const results = a.last('decksSearchResults') as {
      requestId: string;
      cards: { name: string }[];
    };
    expect(results.requestId).toBe('r1');
    expect(results.cards.map((c) => c.name)).toEqual([
      'Blue-Eyes White Dragon',
      'Blue-Eyes Ultimate Dragon',
    ]);
    expect(results.cards[0]).not.toHaveProperty('images');

    feature.handleClientMessage?.(
      { type: 'decksCards', ids: [36996508, 55144522, 11111111, 'x'] },
      a.c,
    );
    const info = a.last('decksCardInfo') as {
      cards: { id: number; name: string; banTcg?: string }[];
      missing: number[];
    };
    expect(info.cards.map((c) => [c.id, c.name])).toEqual([
      [36996508, 'Dark Magician'],
      [55144522, 'Pot of Greed'],
    ]);
    expect(info.cards[1].banTcg).toBe('Banned');
    expect(info.missing).toEqual([11111111]);

    feature.handleClientMessage?.(
      { type: 'decksImport', requestId: 'i1', text: '3 Dark Magician\nExtra\nDecode Talker' },
      a.c,
    );
    await settle();
    expect(a.last('decksImportResult')).toMatchObject({
      requestId: 'i1',
      ok: true,
      problems: [],
      deck: { id: '', main: [46986414, 46986414, 46986414], extra: [1861629] },
    });
    expect(ygo.requests.filter((u) => u.includes('cardinfo.php'))).toHaveLength(1);
  });

  it('reports YGOPRODeck on the connections board', async () => {
    const { feature, client } = setup();
    expect(feature.connections?.()[0]).toMatchObject({ name: 'YGOPRODeck', state: 'off' });
    feature.handleClientMessage?.({ type: 'decksOpen' }, client().c);
    await settle();
    expect(feature.connections?.()[0]).toMatchObject({ state: 'ok', detail: '7 cartas guardadas' });
  });
});

describe('decks feature: HTTP', () => {
  async function withDeck() {
    const ctx = setup();
    const a = ctx.client();
    ctx.feature.handleClientMessage?.(
      { type: 'decksSave', deck: { ...deckInput, cover: 0, extra: [89631139] } },
      a.c,
    );
    const id = (a.last('decksStatus') as { decks: { id: string }[] }).decks[0].id;
    await ctx.feature.db.ensure();
    const app = Fastify();
    ctx.feature.registerRoutes?.(app);
    return { ...ctx, id, app };
  }

  it('needs the office token (query or Bearer)', async () => {
    const { app } = await withDeck();
    expect((await app.inject({ url: '/api/decks' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/decks?token=nope' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/decks?token=tok' })).statusCode).toBe(200);
    const bearer = await app.inject({
      url: '/api/decks',
      headers: { authorization: 'Bearer tok' },
    });
    expect(bearer.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/decks/img/89631139' })).statusCode).toBe(401);
  });

  it('lists decks, gives one with its cards and warnings, and as .ydk', async () => {
    const { app, id } = await withDeck();
    const list = (await app.inject({ url: '/api/decks?token=tok' })).json();
    expect(list).toEqual({
      decks: [
        {
          id,
          name: 'Dragones',
          owner: 'Ana',
          cover: 89631139,
          box: { color: BOX_COLOR },
          counts: { main: 3, extra: 1, side: 0 },
        },
      ],
    });
    const detail = (await app.inject({ url: `/api/decks/${id}?token=tok` })).json();
    expect(detail.deck.id).toBe(id);
    expect(detail.cards.map((c: { id: number }) => c.id)).toEqual([89631139, 46986414]);
    expect(detail.warnings.map((w: { code: string }) => w.code)).toEqual([
      'main-size',
      'main-in-extra',
    ]);
    const ydk = await app.inject({ url: `/api/decks/${id}.ydk?token=tok` });
    expect(ydk.headers['content-type']).toContain('text/plain');
    expect(ydk.body).toContain('#main\n89631139\n89631139\n46986414\n#extra\n89631139\n!side\n');
    expect((await app.inject({ url: '/api/decks/nope1?token=tok' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/decks/..%2Fx?token=tok' })).statusCode).toBe(404);
  });

  it('serves card images, downloading each one once', async () => {
    const { app, ygo, pixel } = await withDeck();
    const first = await app.inject({ url: '/api/decks/img/89631139?size=small&token=tok' });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/jpeg');
    expect(first.rawPayload.length).toBe(4);
    await app.inject({ url: '/api/decks/img/89631139?size=small&token=tok' });
    expect(ygo.requests.filter((u) => u.includes('cards_small/89631139'))).toHaveLength(1);
    expect(fs.existsSync(path.join(pixel, 'decks-cache', 'img', '89631139_small.jpg'))).toBe(true);
    expect(
      (await app.inject({ url: '/api/decks/img/89631139?size=huge&token=tok' })).statusCode,
    ).toBe(400);
    expect((await app.inject({ url: '/api/decks/img/12345678?token=tok' })).statusCode).toBe(404);
    expect(
      (await app.inject({ url: '/api/decks/img/89631139?size=crop&token=tok' })).statusCode,
    ).toBe(200);
    expect(ygo.requests.at(-1)).toBe(
      'https://images.ygoprodeck.com/images/cards_cropped/89631139.jpg',
    );
  });
});
