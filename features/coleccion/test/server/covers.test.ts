import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { imageSize } from '../../core/cover.js';
import { createColeccionFeature } from '../../server/coleccionFeature.js';
import { IMAGE_MAX_BYTES } from '../../server/covers/constants.js';
import { igdbQuery } from '../../server/covers/igdb.js';
import { parseFolderIndex } from '../../server/covers/libretro.js';
import { createRateQueue, createSafeFetch, NetError } from '../../server/covers/net.js';

// ── Synthetic images (made here; no real cover is ever used) ──
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** The signature and an IHDR saying its size: all the server reads of a PNG. */
const fakePng = (fill = 1, size = 64, w = 300, h = 420) => {
  const b = new Uint8Array(Math.max(size, 33)).fill(fill);
  b.set([...PNG_MAGIC, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h)], 0);
  return b;
};
/** SOI, an APP0 segment, then a baseline frame header (SOF0) with its size. */
const jpegHeader = (w = 264, h = 374) => [
  0xff,
  0xd8,
  0xff,
  0xe0,
  0,
  4,
  0,
  0,
  0xff,
  0xc0,
  0,
  11,
  8,
  h >> 8,
  h & 255,
  w >> 8,
  w & 255,
  1,
];
const fakeJpg = (size = 64, w = 264, h = 374) => {
  const b = new Uint8Array(Math.max(size, 32)).fill(7);
  b.set(jpegHeader(w, h), 0);
  return b;
};

const LIB = 'https://thumbnails.libretro.com';
const GC = `${LIB}/Nintendo%20-%20GameCube/Named_Boxarts/`;
const X360 = `${LIB}/Microsoft%20-%20Xbox%20360/Named_Boxarts/`;

/** An Apache-style folder index with these file names (made-up and real-looking names: only text). */
const index = (names: string[]) =>
  `<html><body><h1>Index of /Nintendo - GameCube/Named_Boxarts</h1><table>
<tr><td><a href="../">Parent Directory</a></td></tr>
${names.map((n) => `<tr><td><a href="${encodeURIComponent(n)}">${n}</a></td><td>12K</td></tr>`).join('\n')}
</table></body></html>`;

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A fake network: exact URL (or URL prefix ending in '*') → answer. Records every call. */
function fakeNet(routes: Record<string, Handler>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const handler =
      routes[url] ??
      Object.entries(routes).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    if (!handler) return new Response('not found', { status: 404 });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}

const png = (bytes: Uint8Array) => () =>
  new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
const html = (text: string) => () =>
  new Response(text, { status: 200, headers: { 'content-type': 'text/html' } });

const homes: string[] = [];
const settle = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
};

beforeEach(() => {
  // Backstop: nothing in these tests may reach the real network
  vi.stubGlobal('fetch', () => {
    throw new Error('real network used in a test');
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

function setup(routes: Record<string, Handler> = {}, opts: { token?: string | null } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-covers-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  let t = Date.parse('2026-11-16T06:00:00.000Z');
  const clock = { advance: (ms: number) => (t += ms) };
  const net = fakeNet(routes);
  const sleeps: number[] = [];
  const feature = createColeccionFeature({
    home,
    now: () => (t += 10),
    random: Math.random,
    fetch: net.f,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    officeToken: () => (opts.token === undefined ? 'tok' : opts.token),
  });
  const sent: Record<string, unknown>[] = [];
  const client: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
  feature.connect?.(client);
  const msg = (m: Record<string, unknown>) => feature.handleClientMessage?.(m, client);
  const last = (type: string) =>
    [...sent].reverse().find((m) => m.type === type) as Record<string, any> | undefined;
  const coversDir = path.join(pixel, 'coleccion', 'portadas');
  const add = (title: string, platform: string, extra: Record<string, unknown> = {}) =>
    feature.store.save({ title, platform, ...extra }).id;
  return { home, pixel, coversDir, feature, net, sent, msg, last, add, clock, sleeps, client };
}

describe('coleccion covers: the network wrapper', () => {
  it('only https, only the fixed hosts, default port, no user in the address', async () => {
    const { f, calls } = fakeNet({ '*': png(fakePng()) });
    const net = createSafeFetch(f);
    const req = { maxBytes: 1000, timeoutMs: 1000 };
    for (const url of [
      'http://thumbnails.libretro.com/x.png',
      'https://example.com/x.png',
      'https://thumbnails.libretro.com.evil.test/x.png',
      'https://thumbnails.libretro.com:8443/x.png',
      'https://user:pw@thumbnails.libretro.com/x.png',
      'file:///etc/passwd',
      'no es una dirección',
    ])
      await expect(net(url, req), url).rejects.toMatchObject({ problem: 'no-permitido' });
    expect(calls).toHaveLength(0);
    await expect(net('https://images.igdb.com/a.jpg', req)).resolves.toMatchObject({ status: 200 });
  });

  it('asks for no redirects and treats one as an error; sends a generic User-Agent', async () => {
    const { f, calls } = fakeNet({
      [`${LIB}/a/`]: () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }),
      [`${LIB}/b/`]: html('ok'),
    });
    const net = createSafeFetch(f);
    await expect(net(`${LIB}/a/`, { maxBytes: 100, timeoutMs: 1000 })).rejects.toMatchObject({
      problem: 'redireccion',
    });
    expect(calls[0].init.redirect).toBe('manual');
    await net(`${LIB}/b/`, { maxBytes: 100, timeoutMs: 1000 });
    expect((calls[1].init.headers as Record<string, string>)['User-Agent']).toBe(
      'Mozilla/5.0 (compatible)',
    );
    expect(calls).toHaveLength(2);
  });

  it('counts bytes while reading, whatever Content-Length says', async () => {
    const { f } = fakeNet({
      [`${LIB}/big`]: () =>
        new Response(new Uint8Array(5000), { status: 200, headers: { 'content-length': '10' } }),
      [`${LIB}/ok`]: () => new Response(new Uint8Array(100), { status: 200 }),
    });
    const net = createSafeFetch(f);
    await expect(net(`${LIB}/big`, { maxBytes: 1000, timeoutMs: 1000 })).rejects.toMatchObject({
      problem: 'demasiado-grande',
    });
    const ok = await net(`${LIB}/ok`, { maxBytes: 100, timeoutMs: 1000 });
    expect(ok.bytes.byteLength).toBe(100);
  });

  it('gives up after its time limit, body included', async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(4)); // then nothing more, ever
      },
    });
    const { f } = fakeNet({
      [`${LIB}/never`]: () => new Promise<Response>(() => {}),
      [`${LIB}/slow-body`]: () => new Response(stalled, { status: 200 }),
    });
    const net = createSafeFetch(f);
    await expect(net(`${LIB}/never`, { maxBytes: 100, timeoutMs: 30 })).rejects.toMatchObject({
      problem: 'sin-respuesta',
    });
    await expect(net(`${LIB}/slow-body`, { maxBytes: 100, timeoutMs: 30 })).rejects.toMatchObject({
      problem: 'sin-respuesta',
    });
  });

  it('never repeats the address or what the network library said', async () => {
    const secret = 'S3cr3tS3cr3tS3cr3t';
    const url = `https://id.twitch.tv/oauth2/token?client_id=abc123&client_secret=${secret}`;
    const f = (async (u: string) => {
      throw new Error(`getaddrinfo ENOTFOUND ${u}`);
    }) as unknown as typeof fetch;
    const err = await createSafeFetch(f)(url, { maxBytes: 100, timeoutMs: 1000 }).catch((e) => e);
    expect(err).toBeInstanceOf(NetError);
    expect(String(err.message)).not.toContain(secret);
    expect(String(err.stack)).not.toContain(secret);
    expect(JSON.stringify(err)).not.toContain(secret);
  });

  it('the queue keeps one second between requests of a source', async () => {
    let t = 0;
    const waits: number[] = [];
    const q = createRateQueue(
      1000,
      () => t,
      async (ms) => {
        waits.push(ms);
        t += ms;
      },
    );
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => q.run(async () => starts.push(t))));
    expect(starts).toEqual([0, 1000, 2000]);
    // A failed job does not stop the next one
    await expect(q.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await q.run(async () => starts.push(t));
    expect(starts[3] - starts[2]).toBeGreaterThanOrEqual(2000);
  });
});

describe('coleccion covers: libretro', () => {
  it('reads an Apache folder index: decoded names only, nothing odd', () => {
    const page = `
      <a href="../">Parent</a>
      <a href="Halo%202%20%28USA%29.png">Halo 2 (USA).png</a>
      <a href='./Halo%20-%20Combat%20Evolved%20(USA).png'>x</a>
      <a HREF="Tony%20Hawk's%20Underground%20(USA).png">y</a>
      <a href="Sub%2FFolder.png">z</a>
      <a href="sub/x.png">z</a>
      <a href="x.png?C=N;O=D">z</a>
      <a href="%E0%A4%A.png">broken encoding</a>
      <a href="..%2F..%2Fetc.png">z</a>
      <a href="readme.txt">z</a>
      <a href="Halo%202%20%28USA%29.png">duplicate</a>
      <a href="Salt%20&amp;%20Pepper%20Quest.png">entity</a>`;
    expect(parseFolderIndex(page).sort()).toEqual(
      [
        'Halo - Combat Evolved (USA).png',
        'Halo 2 (USA).png',
        'Salt & Pepper Quest.png',
        "Tony Hawk's Underground (USA).png",
      ].sort(),
    );
    expect(parseFolderIndex('')).toEqual([]);
  });

  it('a found cover is downloaded, kept by game id, and the listing is cached for a week', async () => {
    const names = ['Tetris 2 (USA).png', 'Tetris (USA).png', 'Tetris (Europe).png'];
    const image = fakePng(3);
    const s = setup({
      [GC]: html(index(names)),
      [`${GC}Tetris%20(USA).png`]: png(image),
    });
    const id = s.add('Tetris', 'gc');
    expect(await s.feature.covers.find(id)).toBe('encontrada');
    const art = s.feature.store.get(id)?.coverArt;
    expect(art).toMatchObject({ source: 'libretro', key: 'Tetris (USA).png', type: 'png' });
    expect(fs.readFileSync(path.join(s.coversDir, `${id}.png`))).toEqual(Buffer.from(image));
    // Only the title and the console went out; the listing is on disk with its date
    const cache = JSON.parse(
      fs.readFileSync(path.join(s.coversDir, '.listados', 'gc.json'), 'utf8'),
    );
    expect(cache).toMatchObject({
      folder: 'Nintendo - GameCube',
      names: expect.arrayContaining(names),
    });
    expect(typeof cache.fetchedAt).toBe('number');
    // The run's state says it to the page
    const st = s.last('coleccionStatus')!;
    expect(st.covers).toEqual([
      expect.objectContaining({
        id,
        state: 'encontrada',
        source: 'libretro',
        label: 'Tetris (USA)',
      }),
    ]);
    expect(st.games[0].coverArt).toMatchObject({ source: 'libretro' });

    // A second game of the same console: no new listing request
    const id2 = s.add('Tetris 2', 'gc');
    s.net.calls.length = 0;
    expect(await s.feature.covers.find(id2)).toBe('nada'); // image 404 on the fake network
    expect(s.net.calls.map((c) => c.url)).toEqual([`${GC}Tetris%202%20(USA).png`]);
    expect(
      s.last('coleccionStatus')!.covers.find((c: { id: string }) => c.id === id2),
    ).toMatchObject({
      state: 'nada',
      reason: 'sin-respuesta',
    });
  });

  it('a week-old listing on disk is used; an older one is fetched again', async () => {
    const s = setup({ [GC]: html(index(['Fresh Game (USA).png'])) });
    fs.mkdirSync(path.join(s.coversDir, '.listados'), { recursive: true });
    const cacheFile = path.join(s.coversDir, '.listados', 'gc.json');
    const now = Date.parse('2026-11-16T06:00:00.000Z');
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        folder: 'Nintendo - GameCube',
        fetchedAt: now - 3 * 86400000,
        names: ['Old Game (USA).png'],
      }),
    );
    const id = s.add('Old Game', 'gc');
    expect(await s.feature.covers.find(id)).toBe('nada'); // matched from the cache; the image 404s
    expect(s.net.calls.some((c) => c.url === GC)).toBe(false);
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        folder: 'Nintendo - GameCube',
        fetchedAt: now - 8 * 86400000,
        names: ['Old Game (USA).png'],
      }),
    );
    const s2 = setup({ [GC]: html(index(['Fresh Game (USA).png'])) });
    fs.mkdirSync(path.join(s2.coversDir, '.listados'), { recursive: true });
    fs.copyFileSync(cacheFile, path.join(s2.coversDir, '.listados', 'gc.json'));
    const id2 = s2.add('Fresh Game', 'gc');
    await s2.feature.covers.find(id2);
    expect(s2.net.calls.some((c) => c.url === GC)).toBe(true);
  });

  it('a listing that fails is not asked again for every game of the run, nor counted as searched', async () => {
    const s = setup({ [GC]: () => new Response('boom', { status: 500 }) });
    for (const t of ['A Uno', 'B Dos', 'C Tres']) s.add(t, 'gc');
    await s.feature.covers.startRun();
    expect(s.net.calls.filter((c) => c.url === GC)).toHaveLength(1);
    expect(s.feature.covers.progress()).toMatchObject({
      running: false,
      total: 3,
      done: 3,
      notFound: 0,
      failed: 3,
      reasons: [{ reason: 'sin-respuesta', count: 3 }],
    });
    // The next run tries them again (once libretro may answer)
    s.clock.advance(10 * 60 * 1000);
    await s.feature.covers.startRun();
    expect(s.feature.covers.progress()).toMatchObject({ total: 3, skipped: 0 });
    expect(s.net.calls.filter((c) => c.url === GC)).toHaveLength(2);
  });

  it('"elige una": candidates with label and region, thumbnails on request, a stamped pick', async () => {
    const names = ['Halo - Combat Evolved (USA).png', 'Halo - Combat Evolved (Europe).png'];
    const thumb = fakePng(9);
    const s = setup({
      [GC]: html(index(names)),
      [`${GC}Halo%20-%20Combat%20Evolved%20(USA).png`]: png(thumb),
    });
    const id = s.add('Halo', 'gc');
    expect(await s.feature.covers.find(id)).toBe('elige');
    // During the search no thumbnail was fetched
    expect(s.net.calls.map((c) => c.url)).toEqual([GC]);
    const state = s.last('coleccionStatus')!.covers[0];
    expect(state).toMatchObject({
      id,
      state: 'elige',
      candidates: [{ source: 'libretro', label: 'Halo - Combat Evolved (USA)', region: 'USA' }],
    });
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();

    // Thumbnail through HTTP: fetched once, then from the cache
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    await app.ready();
    const r1 = await app.inject({ url: `/api/coleccion/candidata/${id}/0?token=tok` });
    expect(r1.statusCode).toBe(200);
    expect(r1.headers['content-type']).toBe('image/png');
    expect(r1.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(r1.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(Buffer.from(r1.rawPayload)).toEqual(Buffer.from(thumb));
    await app.inject({ url: `/api/coleccion/candidata/${id}/0?token=tok` });
    expect(s.net.calls.filter((c) => c.url.endsWith('.png'))).toHaveLength(1);
    expect(
      (await app.inject({ url: `/api/coleccion/candidata/${id}/3?token=tok` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `/api/coleccion/candidata/${id}/9?token=tok` })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: `/api/coleccion/candidata/${id}/0` })).statusCode).toBe(401);

    // An old stamp is refused; the right one sets the cover
    s.msg({ type: 'coleccionCoverPick', requestId: 'p1', id, n: 0, stamp: 'viejo' });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'p1', ok: false });
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();
    s.msg({ type: 'coleccionCoverPick', requestId: 'p2', id, n: 0, stamp: state.stamp });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'p2', ok: true, id });
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({
      source: 'libretro',
      key: 'Halo - Combat Evolved (USA).png',
    });
    expect(fs.existsSync(path.join(s.coversDir, `${id}.png`))).toBe(true);
    expect(fs.readdirSync(path.join(s.coversDir, '.candidatas'))).toEqual([]);
    expect(s.last('coleccionStatus')!.covers).toEqual([]);
    await app.close();
  });

  it('consoles libretro barely has, or lacks: "pocas" and "sin-llave" without a key', async () => {
    const s = setup({ [X360]: html(index(['Something Else (USA).png'])) });
    const a = s.add('Starlight Ranger 3', 'x360');
    const b = s.add('Nebula Racers', 'xone');
    expect(await s.feature.covers.find(a)).toBe('nada');
    expect(await s.feature.covers.find(b)).toBe('nada');
    const states = s.last('coleccionStatus')!.covers;
    expect(states.find((c: { id: string }) => c.id === a)).toMatchObject({
      reason: 'pocas',
      needsKey: true,
    });
    expect(states.find((c: { id: string }) => c.id === b)).toMatchObject({
      reason: 'sin-llave',
      needsKey: true,
    });
    // Xbox One never asked libretro
    expect(s.net.calls.every((c) => !c.url.includes('Xbox%20One'))).toBe(true);
  });
});

describe('coleccion covers: IGDB (recorded answers, no real key)', () => {
  const SECRET = 'shhhSecretValue123456';
  const CLIENT = 'clientid0123456789';
  const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
  const GAMES = 'https://api.igdb.com/v4/games';
  const answer = [
    {
      id: 1,
      name: 'Nebula Racers',
      cover: { id: 9, image_id: 'co1abc' },
      platforms: [
        { id: 49, name: 'Xbox One' },
        { id: 6, name: 'PC (Microsoft Windows)' },
      ],
      first_release_date: 1475193600,
    },
    {
      id: 2,
      name: 'Nebula Racers',
      cover: { id: 10, image_id: 'co2xyz' },
      platforms: [{ id: 12, name: 'Xbox 360' }],
    },
    {
      id: 3,
      name: 'Nebula Racers 2',
      cover: { id: 11, image_id: 'co3def' },
      platforms: [{ id: 49, name: 'Xbox One' }],
    },
    {
      id: 4,
      name: 'Bad <b>image</b>',
      cover: { id: 12, image_id: '../../x' },
      platforms: [{ name: 'Xbox One' }],
    },
  ];

  function igdbSetup(extra: Record<string, Handler> = {}) {
    let tokens = 0;
    const s = setup({
      [TOKEN_URL]: (_u, init) => {
        expect(init.method).toBe('POST');
        // The secret travels in the body, never in the address
        expect((init.headers as Record<string, string>)['Content-Type']).toBe(
          'application/x-www-form-urlencoded',
        );
        expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
          client_id: CLIENT,
          client_secret: SECRET,
          grant_type: 'client_credentials',
        });
        tokens++;
        return new Response(
          JSON.stringify({ access_token: `tok${tokens}`, expires_in: 3600, token_type: 'bearer' }),
          { status: 200 },
        );
      },
      [GAMES]: (_u, init) => {
        const h = init.headers as Record<string, string>;
        expect(h['Client-ID']).toBe(CLIENT);
        expect(h.Authorization).toMatch(/^Bearer tok\d$/);
        return new Response(JSON.stringify(answer), { status: 200 });
      },
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1abc.jpg': () =>
        new Response(fakeJpg(), { status: 200 }),
      ...extra,
    });
    s.msg({ type: 'coleccionIgdbKey', requestId: 'k1', clientId: CLIENT, clientSecret: SECRET });
    return { ...s, tokens: () => tokens };
  }

  it('the key: own file, never sent back, status only says it is there', async () => {
    const s = igdbSetup();
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'k1', ok: true });
    const file = path.join(s.pixel, 'coleccion-igdb.json');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
      clientId: CLIENT,
      clientSecret: SECRET,
    });
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(s.last('coleccionStatus')!.igdbKey).toBe(true);
    expect(JSON.stringify(s.sent)).not.toContain(SECRET);
    expect(fs.existsSync(path.join(s.pixel, 'coleccion.json'))).toBe(false);
    s.msg({ type: 'coleccionIgdbKey', requestId: 'k2', clientId: 'a b"c', clientSecret: '<x>' });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'k2', ok: false });
    s.msg({ type: 'coleccionIgdbKeyRemove', requestId: 'k3' });
    await settle();
    expect(fs.existsSync(file)).toBe(false);
    expect(s.last('coleccionStatus')!.igdbKey).toBe(false);
  });

  it('token, search on the right console, exact match, full image', async () => {
    const s = igdbSetup();
    await settle();
    const id = s.add('Nebula Racers', 'xone');
    expect(await s.feature.covers.find(id)).toBe('encontrada');
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({
      source: 'igdb',
      key: 'co1abc',
      type: 'jpg',
    });
    const query = s.net.calls.find((c) => c.url === GAMES)!;
    expect(query.init.body).toBe(
      'search "Nebula Racers"; fields name,alternative_names.name,cover.image_id,platforms.name,first_release_date; where version_parent = null; limit 10;',
    );
    expect(s.last('coleccionStatus')!.covers[0]).toMatchObject({
      state: 'encontrada',
      label: 'Nebula Racers (2016)',
    });
    // The token is reused while it lasts, renewed after
    const id2 = s.add('Nebula Racers 2', 'xone');
    await s.feature.covers.find(id2);
    expect(s.tokens()).toBe(1);
    s.clock.advance(3600 * 1000);
    const id3 = s.add('Nebula Racers', 'xone', { owner: 'otro' });
    await s.feature.covers.find(id3);
    expect(s.tokens()).toBe(2);
  });

  it('a revoked token is renewed once on 401', async () => {
    let calls = 0;
    const s = igdbSetup({
      [GAMES]: () => {
        calls++;
        return calls === 1
          ? new Response('', { status: 401 })
          : new Response(JSON.stringify(answer), { status: 200 });
      },
    });
    await settle();
    const id = s.add('Nebula Racers', 'xone');
    expect(await s.feature.covers.find(id)).toBe('encontrada');
    expect(s.tokens()).toBe(2);
  });

  it('results on other consoles, or with odd image ids, are never put on their own', async () => {
    const s = igdbSetup();
    await settle();
    // A result with an odd image id is dropped; what IGDB found on the console is only offered
    const id = s.add('Bad image', 'xone');
    expect(await s.feature.covers.find(id)).toBe('elige');
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();
    const offered = s.last('coleccionStatus')!.covers.find((c: { id: string }) => c.id === id);
    expect(offered.candidates.map((c: { label: string }) => c.label)).toEqual([
      'Nebula Racers (2016)',
      'Nebula Racers 2',
    ]);
    // No answer is on a console we recognize (our IGDB console names are unchecked): only offered, with the
    // consoles IGDB lists, so a wrong name in our list does not hide what the key can find
    const ps5 = s.add('Nebula Racers', 'ps5');
    expect(await s.feature.covers.find(ps5)).toBe('elige');
    expect(s.feature.store.get(ps5)?.coverArt).toBeUndefined();
    const state = s.last('coleccionStatus')!.covers.find((c: { id: string }) => c.id === ps5);
    expect(state.candidates.map((c: { label: string }) => c.label)).toEqual(
      expect.arrayContaining([
        'Nebula Racers (2016) · Xbox One, PC (Microsoft Windows)',
        'Nebula Racers · Xbox 360',
      ]),
    );
    // Nothing that even looks like it: no match
    const other = s.add('Quiet Lighthouse', 'ps5');
    expect(await s.feature.covers.find(other)).toBe('nada');
    expect(
      s.last('coleccionStatus')!.covers.find((c: { id: string }) => c.id === other),
    ).toMatchObject({ reason: 'sin-coincidencia' });
  });

  it('the Apicalypse query keeps quotes and backslashes out', () => {
    expect(igdbQuery('Say "hi"\\; fields *')).toBe(
      'search "Say hi ; fields *"; fields name,alternative_names.name,cover.image_id,platforms.name,first_release_date; where version_parent = null; limit 10;',
    );
  });

  it('the secret never shows: not in errors, messages, logs nor the connections board', async () => {
    const logs: string[] = [];
    for (const k of ['log', 'warn', 'error', 'info'] as const)
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      });
    const s = setup({
      [TOKEN_URL]: (u) => {
        throw new Error(`connect ECONNREFUSED ${u}`);
      },
    });
    s.msg({ type: 'coleccionIgdbKey', requestId: 'k1', clientId: CLIENT, clientSecret: SECRET });
    await settle();
    const id = s.add('Nebula Racers', 'xone');
    expect(await s.feature.covers.find(id)).toBe('nada');
    expect(s.last('coleccionStatus')!.covers[0]).toMatchObject({ reason: 'sin-respuesta' });
    const conn = s.feature.connections?.() ?? [];
    expect(conn.find((c) => c.id === 'coleccion-igdb')).toMatchObject({ state: 'warn' });
    const everything = JSON.stringify([s.sent, logs, conn]);
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain('client_secret');
  });

  it('a rejected key reads as "sin-llave"', async () => {
    const s = setup({
      [TOKEN_URL]: () => new Response('{"message":"invalid client secret"}', { status: 403 }),
    });
    s.msg({ type: 'coleccionIgdbKey', requestId: 'k1', clientId: CLIENT, clientSecret: SECRET });
    await settle();
    const id = s.add('Nebula Racers', 'xone');
    await s.feature.covers.find(id);
    expect(s.last('coleccionStatus')!.covers[0]).toMatchObject({
      state: 'nada',
      reason: 'sin-llave',
      needsKey: true,
    });
  });
});

describe('coleccion covers: the run, the data and the trash', () => {
  it('"Buscar las que faltan": skips covered games and gaps, counts, and can be stopped', async () => {
    const names = ['Uno (USA).png', 'Dos (USA).png', 'Tres - Algo (USA).png'];
    const s = setup({ [GC]: html(index(names)), [`${GC}*`]: png(fakePng()) });
    s.add('Uno', 'gc');
    s.add('Dos', 'gc');
    s.add('Tres', 'gc');
    s.add('Cuatro', 'gc');
    s.add('Buscado', 'gc', { wanted: true });
    s.add('Sin fuente', 'switch');
    await s.feature.covers.startRun();
    expect(s.feature.covers.progress()).toMatchObject({
      running: false,
      stopped: false,
      total: 5,
      done: 5,
      found: 2,
      choose: 1,
      notFound: 2,
    });
    expect(s.feature.covers.progress().reasons).toEqual(
      expect.arrayContaining([
        { reason: 'sin-coincidencia', count: 1 },
        { reason: 'sin-llave', count: 1 },
      ]),
    );
    expect(s.feature.covers.progress().finishedAt).toBeTruthy();
    // At most one request per second per source: the queue waited between them
    expect(s.sleeps.every((ms) => ms <= 1000)).toBe(true);
    expect(s.sleeps.length).toBeGreaterThan(0);

    // A second run leaves alone what is settled: the choice waiting (Tres), what is known not to be there
    // (Cuatro), and what only IGDB would have while there is no key (Sin fuente)
    s.net.calls.length = 0;
    await s.feature.covers.startRun();
    expect(s.feature.covers.progress()).toMatchObject({ total: 0, done: 0, skipped: 3 });
    expect(s.net.calls).toEqual([]);

    // Stopping ends a run after the current game
    for (const t of ['Cinco', 'Seis', 'Siete']) s.add(t, 'gc');
    s.msg({ type: 'coleccionCoverRun', action: 'start' });
    s.msg({ type: 'coleccionCoverRun', action: 'stop' });
    await settle();
    const p = s.feature.covers.progress();
    expect(p).toMatchObject({ running: false, stopped: true });
    expect(p.done).toBeLessThan(3);
    expect(s.last('coleccionStatus')!.coverRun).toMatchObject({ stopped: true });
  });

  it('a client cannot set or change a cover by saving the game', async () => {
    const s = setup();
    const forged = {
      source: 'libretro',
      key: 'x.png',
      at: '2026-11-16T00:00:00.000Z',
      type: 'png',
    };
    s.msg({
      type: 'coleccionSave',
      requestId: 'r1',
      game: { title: 'X', platform: 'gc', coverArt: forged },
    });
    const id = s.last('coleccionResult')!.id;
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();
    // With a real cover, a save without it (or with another) keeps the real one
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    await app.ready();
    await app.inject({
      method: 'POST',
      url: `/api/coleccion/portada/${id}?token=tok`,
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from(fakePng()),
    });
    const real = s.feature.store.get(id)!.coverArt!;
    expect(real.source).toBe('subida');
    s.msg({
      type: 'coleccionSave',
      requestId: 'r2',
      game: { ...s.feature.store.get(id), coverArt: forged },
    });
    s.msg({
      type: 'coleccionSave',
      requestId: 'r3',
      game: { ...s.feature.store.get(id), coverArt: undefined, notes: 'n' },
    });
    expect(s.feature.store.get(id)?.coverArt).toEqual(real);
    expect(s.feature.store.get(id)?.notes).toBe('n');
    await app.close();
  });

  it('a search still downloading never overwrites a cover uploaded meanwhile', async () => {
    let release: () => void = () => {};
    const s = setup({
      [GC]: html(index(['Uno (USA).png'])),
      [`${GC}Uno%20(USA).png`]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(fakePng(2), { status: 200 }));
        }),
    });
    const id = s.add('Uno', 'gc');
    const searching = s.feature.covers.find(id);
    for (let i = 0; i < 50 && s.net.calls.length < 2; i++) await settle();
    expect(s.net.calls).toHaveLength(2); // the listing, then the image (held)
    s.feature.covers.upload(id, fakeJpg());
    release();
    await searching;
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({ source: 'subida', type: 'jpg' });
    expect(fs.readdirSync(s.coversDir).filter((f) => !f.startsWith('.'))).toEqual([`${id}.jpg`]);
  });

  it('removing a cover, and deleting a game, clean its images; the trash keeps no cover', async () => {
    const s = setup({
      [GC]: html(index(['Uno (USA).png', 'Dos - X (USA).png'])),
      [`${GC}*`]: png(fakePng()),
    });
    const a = s.add('Uno', 'gc');
    const b = s.add('Dos', 'gc');
    await s.feature.covers.find(a);
    await s.feature.covers.find(b); // elige
    expect(fs.existsSync(path.join(s.coversDir, `${a}.png`))).toBe(true);
    s.msg({ type: 'coleccionCoverRemove', requestId: 'r1', id: a });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'r1', ok: true });
    expect(fs.existsSync(path.join(s.coversDir, `${a}.png`))).toBe(false);
    expect(s.feature.store.get(a)?.coverArt).toBeUndefined();

    await s.feature.covers.find(a);
    expect(fs.existsSync(path.join(s.coversDir, `${a}.png`))).toBe(true);
    // A cached candidate thumbnail of b
    await s.feature.covers.candidateImage(b, 0);
    expect(fs.readdirSync(path.join(s.coversDir, '.candidatas'))).toHaveLength(1);
    s.msg({ type: 'coleccionDelete', requestId: 'd1', id: a });
    s.msg({ type: 'coleccionDelete', requestId: 'd2', id: b });
    expect(fs.existsSync(path.join(s.coversDir, `${a}.png`))).toBe(false);
    expect(fs.readdirSync(path.join(s.coversDir, '.candidatas'))).toEqual([]);
    const disk = JSON.parse(fs.readFileSync(path.join(s.pixel, 'coleccion.json'), 'utf8'));
    expect(disk.trash.map((g: { title: string }) => g.title).sort()).toEqual(['Dos', 'Uno']);
    expect(disk.trash.every((g: Record<string, unknown>) => !('coverArt' in g))).toBe(true);
    expect(s.last('coleccionStatus')!.covers).toEqual([]);
  });

  it('old data without covers loads the same; an old "cover" text stays as it was', () => {
    const s = setup();
    fs.writeFileSync(
      path.join(s.pixel, 'coleccion.json'),
      JSON.stringify({
        version: 1,
        games: [
          { id: 'viejo001', title: 'Viejo', platform: 'gc', condition: '' },
          { id: 'viejo002', title: 'Con texto', platform: 'nes', cover: 'una nota vieja' },
        ],
      }),
    );
    s.msg({ type: 'coleccionOpen' });
    const st = s.last('coleccionStatus')!;
    expect(st.problems).toEqual([]);
    expect(st.games).toHaveLength(2);
    expect(st.games[0]).not.toHaveProperty('coverArt');
    expect(st.games[1].cover).toBe('una nota vieja');
    expect(st).toMatchObject({
      igdbKey: false,
      covers: [],
      coverRun: { running: false, total: 0 },
    });
  });

  it('condition of many games at once; gaps untouched; empty stays empty', () => {
    const s = setup();
    const a = s.add('A', '3ds');
    const b = s.add('B', '3ds', { condition: 'completo' });
    const gap = s.add('C', '3ds', { wanted: true });
    const file = path.join(s.pixel, 'coleccion.json');
    s.msg({
      type: 'coleccionSetCondition',
      requestId: 'c1',
      ids: [a, b, gap, 'nope0000'],
      condition: 'suelto',
    });
    return settle().then(() => {
      expect(s.last('coleccionResult')).toMatchObject({ requestId: 'c1', ok: true });
      const games = JSON.parse(fs.readFileSync(file, 'utf8')).games;
      const by = (id: string) => games.find((g: { id: string }) => g.id === id);
      expect(by(a).condition).toBe('suelto');
      expect(by(b).condition).toBe('suelto');
      expect(by(gap).condition).toBe('');
      s.msg({ type: 'coleccionSetCondition', requestId: 'c2', ids: [a], condition: '' });
      return settle().then(() => {
        expect(s.last('coleccionResult')).toMatchObject({ requestId: 'c2', ok: true, id: a });
        expect(
          JSON.parse(fs.readFileSync(file, 'utf8')).games.find((g: { id: string }) => g.id === a)
            .condition,
        ).toBe('');
        s.msg({ type: 'coleccionSetCondition', requestId: 'c3', ids: [a], condition: 'roto' });
        return settle().then(() =>
          expect(s.last('coleccionResult')).toMatchObject({ requestId: 'c3', ok: false }),
        );
      });
    });
  });

  it('an untokened client can do none of it', async () => {
    const s = setup();
    const id = s.add('X', 'gc');
    const anon: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged: false, send: (m) => anon.push(m) };
    for (const m of [
      { type: 'coleccionCoverFind', id },
      { type: 'coleccionCoverRun', action: 'start' },
      { type: 'coleccionIgdbKey', requestId: 'k', clientId: 'abcdefgh', clientSecret: 'abcdefgh' },
      { type: 'coleccionSetCondition', requestId: 's', ids: [id], condition: 'suelto' },
    ])
      expect(s.feature.handleClientMessage?.(m, c)).toBe(true);
    await settle();
    expect(anon).toEqual([]);
    expect(s.net.calls).toEqual([]);
    expect(fs.existsSync(path.join(s.pixel, 'coleccion-igdb.json'))).toBe(false);
    expect(s.feature.store.get(id)?.condition).toBe('');
  });
});

describe('coleccion covers: HTTP routes', () => {
  async function withApp(token: string | null = 'tok') {
    const s = setup({}, { token });
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    await app.ready();
    return { ...s, app };
  }

  it('the token is required (query or Bearer), and only a game id is accepted', async () => {
    const s = await withApp();
    const id = s.add('X', 'gc');
    const url = `/api/coleccion/portada/${id}`;
    expect((await s.app.inject({ url })).statusCode).toBe(401);
    expect((await s.app.inject({ url: `${url}?token=nope` })).statusCode).toBe(401);
    expect((await s.app.inject({ url: `${url}?token=tok` })).statusCode).toBe(404); // no cover yet
    for (const bad of ['..%2F..%2Fcoleccion.json', 'abc', 'ABCD1234', `${id}.png`, '%2e%2e'])
      expect(
        (await s.app.inject({ url: `/api/coleccion/portada/${bad}?token=tok` })).statusCode,
        bad,
      ).toBe(404);
    // No office token at all: always 401
    const none = await withApp(null);
    expect((await none.app.inject({ url: `/api/coleccion/portada/${id}?token=` })).statusCode).toBe(
      401,
    );
    await s.app.close();
    await none.app.close();
  });

  it('upload: PNG, JPEG or WEBP by their bytes, up to 4 MB; the token before the body', async () => {
    const s = await withApp();
    const id = s.add('X', 'gc');
    const url = `/api/coleccion/portada/${id}?token=tok`;
    const post = (payload: Buffer | string, type: string, u = url) =>
      s.app.inject({ method: 'POST', url: u, headers: { 'content-type': type }, payload });

    // No token: 401 whatever the type
    expect(
      (await post(Buffer.from(fakePng()), 'image/png', `/api/coleccion/portada/${id}`)).statusCode,
    ).toBe(401);
    expect((await post('x', 'text/x-odd', `/api/coleccion/portada/${id}`)).statusCode).toBe(401);
    // Wrong declared type, or bytes that are not an image
    expect((await post('hola', 'text/plain')).statusCode).toBe(415);
    expect((await post('{"a":1}', 'application/json')).statusCode).toBe(415);
    expect((await post(Buffer.from('GIF89a......'), 'image/png')).statusCode).toBe(415);
    expect((await post(Buffer.from('<svg/>'), 'application/octet-stream')).statusCode).toBe(415);
    expect((await post(Buffer.alloc(0), 'image/png')).statusCode).toBe(400);
    // Too big (4 MB and one byte)
    const big = Buffer.alloc(IMAGE_MAX_BYTES + 1, 1);
    big.set(PNG_MAGIC, 0);
    expect((await post(big, 'image/png')).statusCode).toBe(413);
    // An unknown game
    expect(
      (await post(Buffer.from(fakePng()), 'image/png', '/api/coleccion/portada/zzzz9999?token=tok'))
        .statusCode,
    ).toBe(404);
    expect(
      fs.existsSync(s.coversDir)
        ? fs.readdirSync(s.coversDir).filter((f) => !f.startsWith('.'))
        : [],
    ).toEqual([]);

    // A good JPEG sent as octet-stream (2 MB: above the server's default body limit)
    const jpg = Buffer.alloc(2 * 1024 * 1024, 5);
    jpg.set(jpegHeader(), 0);
    const ok = await post(jpg, 'application/octet-stream');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      ok: true,
      coverArt: { source: 'subida', key: '', type: 'jpg' },
    });
    const got = await s.app.inject({ url, headers: {} });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(got.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.rawPayload.length).toBe(jpg.length);
    const bearer = await s.app.inject({
      url: `/api/coleccion/portada/${id}`,
      headers: { authorization: 'Bearer tok' },
    });
    expect(bearer.statusCode).toBe(200);

    // Replaced by a PNG: the JPEG file goes away
    expect((await post(Buffer.from(fakePng()), 'image/png')).statusCode).toBe(200);
    expect(fs.readdirSync(s.coversDir).filter((f) => !f.startsWith('.'))).toEqual([`${id}.png`]);
    expect((await s.app.inject({ url })).headers['content-type']).toBe('image/png');
    expect(s.last('coleccionStatus')!.games[0].coverArt).toMatchObject({
      source: 'subida',
      type: 'png',
    });
    await s.app.close();
  });

  it('the upload parser stays inside its route: other routes keep the default parsers', async () => {
    const s = setup();
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    app.post('/otra', async () => ({ ok: true }));
    await app.ready();
    const r = await app.inject({
      method: 'POST',
      url: '/otra',
      headers: { 'content-type': 'image/png' },
      payload: Buffer.from(fakePng()),
    });
    expect(r.statusCode).toBe(415);
    await app.close();
  });
});

describe('coleccion covers: review fixes', () => {
  const CLIENT = 'clientid0123456789';
  const SECRET = 'secretValue0123456789';
  const TOKEN = 'https://id.twitch.tv/oauth2/token';
  const GAMES = 'https://api.igdb.com/v4/games';
  const WII = `${LIB}/Nintendo%20-%20Wii/Named_Boxarts/`;
  const tokenOk = () =>
    new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 });
  const stateOf = (s: ReturnType<typeof setup>, id: string) =>
    s.last('coleccionStatus')!.covers.find((c: { id: string }) => c.id === id);
  const withKey = async (s: ReturnType<typeof setup>) => {
    s.msg({ type: 'coleccionIgdbKey', requestId: 'k', clientId: CLIENT, clientSecret: SECRET });
    await settle();
  };
  const realFiles = (dir: string) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => !f.startsWith('.'))
          .sort()
      : [];

  it('a source that did not answer says «no contestó», even when IGDB found nothing', async () => {
    const s = setup({
      [X360]: () => new Response('boom', { status: 500 }),
      [TOKEN]: tokenOk,
      [GAMES]: () => new Response('[]', { status: 200 }),
    });
    await withKey(s);
    const id = s.add('Starlight Ranger 3', 'x360');
    await s.feature.covers.startRun();
    expect(stateOf(s, id)).toMatchObject({ state: 'nada', reason: 'sin-respuesta' });
    expect(s.feature.covers.progress()).toMatchObject({ done: 1, failed: 1, notFound: 0 });
  });

  it('another title or console takes away a cover a source found (never an uploaded one), and says so', async () => {
    const s = setup({ [GC]: html(index(['Tetris (USA).png'])), [`${GC}*`]: png(fakePng()) });
    const id = s.add('Tetris', 'gc');
    expect(await s.feature.covers.find(id)).toBe('encontrada');
    const get = () => s.feature.store.get(id)!;
    // Only how it is written: the same game, the cover stays
    s.msg({ type: 'coleccionSave', requestId: 'r0', game: { ...get(), title: 'TETRIS' } });
    expect(get().coverArt).toMatchObject({ source: 'libretro' });
    s.msg({ type: 'coleccionSave', requestId: 'r1', game: { ...get(), title: 'Tetris Attack' } });
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'r1', ok: true });
    expect(get().coverArt).toBeUndefined();
    expect(realFiles(s.coversDir)).toEqual([]);
    expect(stateOf(s, id)).toMatchObject({ state: 'nada', reason: 'cambio' });
    // An uploaded cover is the person's: another console keeps it
    s.feature.covers.upload(id, fakePng(4));
    s.msg({ type: 'coleccionSave', requestId: 'r2', game: { ...get(), platform: 'wii' } });
    expect(get().coverArt).toMatchObject({ source: 'subida' });
    expect(realFiles(s.coversDir)).toEqual([`${id}.png`]);
  });

  it('a search that ends after the game changed puts nothing (the old title is not the game)', async () => {
    let release: () => void = () => {};
    const s = setup({
      [GC]: html(index(['Tetris (USA).png'])),
      [`${GC}Tetris%20(USA).png`]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(fakePng(2), { status: 200 }));
        }),
    });
    const id = s.add('Tetris', 'gc');
    const searching = s.feature.covers.find(id);
    for (let i = 0; i < 50 && s.net.calls.length < 2; i++) await settle();
    expect(s.net.calls).toHaveLength(2);
    // Saved straight in the store: only the search's own check stands between the old image and the game
    s.feature.store.save({ ...s.feature.store.get(id), title: 'Tetris Attack' });
    release();
    await searching;
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();
    expect(realFiles(s.coversDir)).toEqual([]);
    expect(s.feature.covers.states().find((c) => c.id === id)).toBeUndefined();
  });

  it('a choice made for another console (or title) cannot be picked', async () => {
    const s = setup({
      [GC]: html(index(['Halo - Combat Evolved (USA).png'])),
      [`${GC}*`]: png(fakePng()),
    });
    const id = s.add('Halo', 'gc');
    expect(await s.feature.covers.find(id)).toBe('elige');
    const { stamp } = s.feature.covers.states()[0];
    s.feature.store.save({ ...s.feature.store.get(id), platform: 'xbox' });
    s.net.calls.length = 0;
    await expect(s.feature.covers.pick(id, 0, stamp)).rejects.toThrow(/cambió/);
    expect(s.net.calls).toEqual([]);
    expect(await s.feature.covers.candidateImage(id, 0)).toBeNull();
    // Through the office, a save with another console drops the choice altogether
    const id2 = s.add('Halo', 'gc');
    await s.feature.covers.find(id2);
    s.msg({
      type: 'coleccionSave',
      requestId: 'r',
      game: { ...s.feature.store.get(id2), platform: 'xbox' },
    });
    expect(s.feature.covers.states().find((c) => c.id === id2)).toBeUndefined();
    expect(s.feature.store.get(id2)?.coverArt).toBeUndefined();
  });

  it('«Cambiar» offers the candidates with the current one marked, and never replaces a cover on its own', async () => {
    const names = [
      'Tetris (USA).png',
      'Tetris (Europe).png',
      'Tetris (Japan).png',
      'Tetris Plus (USA).png',
    ];
    const s = setup({ [GC]: html(index(names)), [`${GC}*`]: png(fakePng(6)) });
    const id = s.add('Tetris', 'gc');
    expect(await s.feature.covers.find(id)).toBe('encontrada');
    const first = s.feature.store.get(id)!.coverArt!;
    expect(first.key).toBe('Tetris (USA).png');

    expect(await s.feature.covers.find(id)).toBe('elige');
    expect(s.feature.store.get(id)?.coverArt).toEqual(first);
    const choice = stateOf(s, id);
    expect(choice.candidates).toHaveLength(4);
    expect(choice.candidates[0]).toMatchObject({ label: 'Tetris (USA)', current: true });
    expect(choice.candidates.filter((c: { current?: boolean }) => c.current)).toHaveLength(1);
    expect(choice.candidates.map((c: { label: string }) => c.label)).toEqual(
      expect.arrayContaining(['Tetris (Europe)', 'Tetris Plus (USA)']),
    );
    // Closing it keeps the current one, and it is not a «Ninguna»
    s.msg({ type: 'coleccionCoverDismiss', requestId: 'd1', id, stamp: choice.stamp });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'd1', ok: true });
    expect(s.feature.store.get(id)?.coverArt).toEqual(first);
    expect(s.feature.store.get(id)?.coverNone).toBeUndefined();
    expect(stateOf(s, id)).toBeUndefined();

    // An uploaded one: «Cambiar» only offers; picking is the person's choice
    s.feature.covers.upload(id, fakeJpg());
    expect(await s.feature.covers.find(id)).toBe('elige');
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({ source: 'subida' });
    const again = stateOf(s, id);
    expect(again.candidates.some((c: { current?: boolean }) => c.current)).toBe(false);
    const europe = again.candidates.findIndex(
      (c: { label: string }) => c.label === 'Tetris (Europe)',
    );
    await s.feature.covers.pick(id, europe, again.stamp);
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({
      source: 'libretro',
      key: 'Tetris (Europe).png',
    });
    expect(realFiles(s.coversDir)).toEqual([`${id}.png`]);
  });

  it('when the collection cannot be written, the game keeps the cover and the image it had', async () => {
    const s = setup({ [GC]: html(index(['Tetris (USA).png'])), [`${GC}*`]: png(fakePng(3)) });
    const id = s.add('Tetris', 'gc');
    await s.feature.covers.find(id);
    const before = s.feature.store.get(id)!.coverArt!;
    const bytes = fs.readFileSync(path.join(s.coversDir, `${id}.png`));
    const spy = vi.spyOn(s.feature.store, 'setCover').mockImplementation(() => {
      throw new Error('disco lleno');
    });
    // Another type, and the same type
    expect(() => s.feature.covers.upload(id, fakeJpg())).toThrow();
    expect(() => s.feature.covers.upload(id, fakePng(8))).toThrow();
    expect(s.feature.store.get(id)?.coverArt).toEqual(before);
    expect(fs.readFileSync(path.join(s.coversDir, `${id}.png`))).toEqual(bytes);
    expect(
      fs.readdirSync(s.coversDir).filter((f) => f !== '.listados' && f !== '.candidatas'),
    ).toEqual([`${id}.png`]);
    // The same through «elige una»
    spy.mockRestore();
    await s.feature.covers.find(id); // «Cambiar»: a choice
    const st = s.feature.covers.states().find((c) => c.id === id)!;
    vi.spyOn(s.feature.store, 'setCover').mockImplementation(() => {
      throw new Error('disco lleno');
    });
    s.msg({ type: 'coleccionCoverPick', requestId: 'p', id, n: 0, stamp: st.stamp });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'p', ok: false });
    expect(s.feature.store.get(id)?.coverArt).toEqual(before);
    expect(fs.readFileSync(path.join(s.coversDir, `${id}.png`))).toEqual(bytes);
  });

  it('«Ninguna» is kept in the game; the run leaves it alone until it is searched by hand', async () => {
    const s = setup({
      [GC]: html(index(['Halo - Combat Evolved (USA).png'])),
      [`${GC}*`]: png(fakePng()),
    });
    const id = s.add('Halo', 'gc');
    expect(await s.feature.covers.find(id)).toBe('elige');
    const { stamp } = s.feature.covers.states()[0];
    s.msg({ type: 'coleccionCoverDismiss', requestId: 'n', id, stamp: 'viejo' });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'n', ok: false });
    s.msg({ type: 'coleccionCoverDismiss', requestId: 'n2', id, stamp });
    await settle();
    expect(s.last('coleccionResult')).toMatchObject({ requestId: 'n2', ok: true });
    const none = s.feature.store.get(id)?.coverNone;
    expect(none).toMatch(/^2026-11-16T/);
    const disk = JSON.parse(fs.readFileSync(path.join(s.pixel, 'coleccion.json'), 'utf8'));
    expect(disk.games[0].coverNone).toBe(none);
    expect(s.last('coleccionStatus')!.games[0].coverNone).toBe(none);
    // The page cannot write it, nor take it away, by saving the game
    s.msg({
      type: 'coleccionSave',
      requestId: 's',
      game: { ...s.feature.store.get(id), coverNone: undefined, notes: 'x' },
    });
    expect(s.feature.store.get(id)?.coverNone).toBe(none);

    s.net.calls.length = 0;
    await s.feature.covers.startRun();
    expect(s.feature.covers.progress()).toMatchObject({ total: 0, skipped: 1 });
    expect(s.net.calls).toEqual([]);
    // By hand: searched again, and the «Ninguna» is forgotten
    s.msg({ type: 'coleccionCoverFind', id });
    await settle();
    expect(s.feature.store.get(id)?.coverNone).toBeUndefined();
    expect(stateOf(s, id)).toMatchObject({ state: 'elige' });
  });

  it('IGDB: a game found by another of its names counts, and what it lists on the console is at least offered', async () => {
    const answer = [
      {
        id: 7,
        name: 'The Quiet Lighthouse',
        alternative_names: [{ id: 1, name: 'El Faro Silencioso' }],
        cover: { id: 1, image_id: 'co9alt' },
        platforms: [{ id: 5, name: 'Wii' }],
      },
    ];
    const s = setup({
      [WII]: html(index([])),
      [TOKEN]: tokenOk,
      [GAMES]: () => new Response(JSON.stringify(answer), { status: 200 }),
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co9alt.jpg': () =>
        new Response(fakeJpg(), { status: 200 }),
    });
    await withKey(s);
    const a = s.add('El Faro Silencioso', 'wii');
    expect(await s.feature.covers.find(a)).toBe('encontrada');
    expect(s.feature.store.get(a)?.coverArt).toMatchObject({ source: 'igdb', key: 'co9alt' });
    const b = s.add('Faro del Norte', 'wii');
    expect(await s.feature.covers.find(b)).toBe('elige');
    expect(stateOf(s, b).candidates).toEqual([
      expect.objectContaining({ source: 'igdb', label: 'The Quiet Lighthouse' }),
    ]);
  });

  it('at start, the candidates go, and images of games no longer there (only when the collection was read whole)', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-start-'));
    homes.push(home);
    const pixel = path.join(home, '.pixel-agents');
    const dir = path.join(pixel, 'coleccion', 'portadas');
    fs.mkdirSync(path.join(dir, '.candidatas'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.listados'), { recursive: true });
    const put = (name: string) => fs.writeFileSync(path.join(dir, name), 'x');
    const lay = () => {
      for (const n of ['keep0001.png', 'gone0001.png', 'gone0002.jpg', 'keep0001.png.1.2.tmp'])
        put(n);
      put(path.join('.candidatas', 'keep0001-0.png'));
      put(path.join('.listados', 'gc.json'));
      put('notas.txt');
    };
    const start = () =>
      createColeccionFeature({ home, fetch: (() => Promise.reject(new Error('x'))) as never });
    const collection = path.join(pixel, 'coleccion.json');

    // No collection file: nothing is called orphaned
    lay();
    start();
    expect(fs.readdirSync(dir).sort()).toEqual(
      [
        '.candidatas',
        '.listados',
        'gone0001.png',
        'gone0002.jpg',
        'keep0001.png',
        'keep0001.png.1.2.tmp',
        'notas.txt',
      ].sort(),
    );
    expect(fs.readdirSync(path.join(dir, '.candidatas'))).toEqual([]);
    // A broken one: the same
    fs.writeFileSync(collection, '{ roto');
    start();
    expect(fs.existsSync(path.join(dir, 'gone0001.png'))).toBe(true);
    // Read whole: only what is ours and orphaned goes
    fs.writeFileSync(
      collection,
      JSON.stringify({ version: 1, games: [{ id: 'keep0001', title: 'Tetris', platform: 'gc' }] }),
    );
    lay();
    start();
    expect(fs.readdirSync(dir).sort()).toEqual(
      ['.candidatas', '.listados', 'keep0001.png', 'notas.txt'].sort(),
    );
    expect(fs.readdirSync(path.join(dir, '.listados'))).toEqual(['gc.json']);
    expect(fs.readdirSync(path.join(dir, '.candidatas'))).toEqual([]);
  });

  it('image sizes are read from the header; absurd ones are refused before anything decodes them', async () => {
    const vp8 = (w: number, h: number) => {
      const b = new Uint8Array(40);
      b.set(
        [...'RIFF'].map((c) => c.charCodeAt(0)),
        0,
      );
      b.set(
        [...'WEBPVP8 '].map((c) => c.charCodeAt(0)),
        8,
      );
      b.set([0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8], 20);
      return b;
    };
    const vp8l = (w: number, h: number) => {
      const b = new Uint8Array(40);
      b.set(
        [...'RIFF'].map((c) => c.charCodeAt(0)),
        0,
      );
      b.set(
        [...'WEBPVP8L'].map((c) => c.charCodeAt(0)),
        8,
      );
      const bits = ((w - 1) | ((h - 1) << 14)) >>> 0;
      b.set([0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255], 20);
      return b;
    };
    const vp8x = (w: number, h: number) => {
      const b = new Uint8Array(40);
      b.set(
        [...'RIFF'].map((c) => c.charCodeAt(0)),
        0,
      );
      b.set(
        [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
        8,
      );
      const W = w - 1;
      const H = h - 1;
      b.set([0, 0, 0, 0, W & 255, (W >> 8) & 255, W >> 16, H & 255, (H >> 8) & 255, H >> 16], 20);
      return b;
    };
    // A progressive JPEG (SOF2) after an EXIF segment
    const progressive = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0, 6, 1, 2, 3, 4, 0xff, 0xc2, 0, 11, 8, 0x01, 0xf4, 0x02, 0x58, 1, 0,
      0,
    ]);
    expect(imageSize(fakePng(1, 64, 640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSize(fakeJpg(64, 264, 374))).toEqual({ width: 264, height: 374 });
    expect(imageSize(progressive)).toEqual({ width: 600, height: 500 });
    expect(imageSize(vp8(320, 240))).toEqual({ width: 320, height: 240 });
    expect(imageSize(vp8l(100, 200))).toEqual({ width: 100, height: 200 });
    expect(imageSize(vp8x(9000, 100))).toEqual({ width: 9000, height: 100 });
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();

    const s = setup();
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    await app.ready();
    const id = s.add('X', 'gc');
    const post = (b: Uint8Array) =>
      app.inject({
        method: 'POST',
        url: `/api/coleccion/portada/${id}`,
        headers: { 'content-type': 'application/octet-stream', authorization: 'Bearer tok' },
        payload: Buffer.from(b),
      });
    expect((await post(fakePng(1, 64, 16000, 16000))).statusCode).toBe(413);
    expect((await post(fakePng(1, 64, 6000, 6000))).statusCode).toBe(413); // 36 M pixels
    expect((await post(vp8x(9000, 100))).statusCode).toBe(413);
    const magicOnly = new Uint8Array(64).fill(1);
    magicOnly.set(PNG_MAGIC, 0);
    expect((await post(magicOnly)).statusCode).toBe(415);
    expect((await post(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0]))).statusCode).toBe(415);
    expect(realFiles(s.coversDir)).toEqual([]);
    expect((await post(vp8l(100, 200))).statusCode).toBe(200);
    expect(s.feature.store.get(id)?.coverArt?.type).toBe('webp');
    // A source sending an absurd image: not kept either
    await app.close();
  });

  it('two requests for the same thumbnail share one download', async () => {
    let release: () => void = () => {};
    const s = setup({
      [GC]: html(index(['Halo - Combat Evolved (USA).png'])),
      [`${GC}Halo%20-%20Combat%20Evolved%20(USA).png`]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(fakePng(5), { status: 200 }));
        }),
    });
    const id = s.add('Halo', 'gc');
    await s.feature.covers.find(id);
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    await app.ready();
    const url = `/api/coleccion/candidata/${id}/0`;
    const headers = { authorization: 'Bearer tok' };
    const both = Promise.all([app.inject({ url, headers }), app.inject({ url, headers })]);
    for (let i = 0; i < 50 && s.net.calls.length < 2; i++) await settle();
    release();
    const [r1, r2] = await both;
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(s.net.calls.filter((c) => c.url.endsWith('.png'))).toHaveLength(1);
    await app.close();
  });
});
