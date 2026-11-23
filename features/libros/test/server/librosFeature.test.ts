import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createSafeFetch, NetError } from '../../../coleccion/server/covers/net.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { emptyBook } from '../../core/book.js';
import { FILE_MAX_BYTES } from '../../server/constants.js';
import { ARCHIVE_SERVER_PATTERN, BOOK_HOSTS } from '../../server/covers/constants.js';
import { createLibrosFeature } from '../../server/librosFeature.js';

const homes: string[] = [];

/** A repeatable random source (a plain LCG), so ids are the same on every run. */
function seeded(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** A PNG header with its size (nothing decodes it: the checks read the header only). */
const fakePng = (w = 300, h = 450, fill = 1) => {
  const b = new Uint8Array(64).fill(fill);
  b.set(
    [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      0x49,
      0x48,
      0x44,
      0x52,
      ...be32(w),
      ...be32(h),
    ],
    0,
  );
  return b;
};

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** A fake network: exact URL (or URL prefix ending in '*') → answer. Records every call. */
function fakeNet(routes: Record<string, Handler>) {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push(url);
    const handler =
      routes[url] ??
      Object.entries(routes).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    if (!handler) return new Response('not found', { status: 404 });
    return handler(url, init);
  }) as typeof fetch;
  return { f, calls };
}

const without = (o: Record<string, unknown>, k: string) => {
  const { [k]: _gone, ...rest } = o;
  return rest;
};
const json = (v: unknown) => () => new Response(JSON.stringify(v), { status: 200 });
const image = (bytes: Uint8Array) => () => new Response(bytes, { status: 200 });

const ISBN = '9780306406157';
const OL = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org';

function setup(routes: Record<string, Handler> = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'libros-home-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  let t = Date.parse('2026-11-23T20:15:00.000Z');
  const net = fakeNet(routes);
  const feature = createLibrosFeature({
    home,
    now: () => (t += 1000),
    random: seeded(),
    fetch: net.f,
    sleep: async () => {},
    officeToken: () => 'tok',
  });
  const client = (privileged = true) => {
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged, send: (m) => sent.push(m) };
    feature.connect?.(c);
    return { c, sent, last: (type: string) => [...sent].reverse().find((m) => m.type === type) };
  };
  const file = path.join(pixel, 'libros.json');
  const onDisk = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const msg = (m: Record<string, unknown>, c: FeatureClient) => feature.handleClientMessage?.(m, c);
  /** Waits until the background work (searches, picks) has had its turn. */
  const settle = async (rounds = 20) => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  };
  return { home, pixel, file, onDisk, feature, client, msg, net, settle };
}

afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

const newBook = (title: string, extra: Record<string, unknown> = {}) => ({
  ...emptyBook(''),
  title,
  ...extra,
});

describe('libros feature: messages and the file', () => {
  it('starts empty, without creating the file, and answers only privileged pages', () => {
    const { client, msg, file } = setup();
    const a = client();
    expect(msg({ type: 'webviewReady' }, a.c)).toBe(false);
    expect(a.last('librosStatus')).toMatchObject({ books: [], problems: [], covers: [] });
    expect(fs.existsSync(file)).toBe(false);
    const b = client(false);
    expect(msg({ type: 'librosSave', requestId: 'r', book: newBook('X') }, b.c)).toBe(true);
    expect(b.sent).toEqual([]);
    expect(fs.existsSync(file)).toBe(false);
    expect(msg({ type: 'otraCosa' }, a.c)).toBe(false);
  });

  it('saves, edits and deletes to the trash, keeping fields it does not know', () => {
    const { client, msg, onDisk, file } = setup();
    const a = client();
    msg(
      {
        type: 'librosSave',
        requestId: 'r1',
        book: newBook('Río lento', {
          authors: ['Ana Pérez'],
          coverArt: { source: 'subida', key: '', at: '2026-01-01T00:00:00.000Z', type: 'png' },
        }),
      },
      a.c,
    );
    const r1 = a.last('librosResult') as { ok: boolean; id: string };
    expect(r1.ok).toBe(true);
    const disk = onDisk();
    expect(disk.version).toBe(1);
    expect(disk.books[0]).toMatchObject({
      id: r1.id,
      title: 'Río lento',
      authors: ['Ana Pérez'],
      addedAt: '2026-11-23',
    });
    // The cover is the server's: what the page sends there is ignored
    expect(disk.books[0].coverArt).toBeUndefined();

    // Someone adds a field by hand: it survives the next save
    disk.books[0].shelfColor = 'azul';
    disk.extraTop = true;
    fs.writeFileSync(file, JSON.stringify(disk));
    msg(
      {
        type: 'librosSave',
        requestId: 'r2',
        // The page never sends what it does not know (toWireBook): the field is not in the message at all
        book: { ...without(disk.books[0], 'shelfColor'), lentTo: 'Luis' },
      },
      a.c,
    );
    const after = onDisk();
    expect(after.books[0]).toMatchObject({
      lentTo: 'Luis',
      lentAt: '2026-11-23',
      shelfColor: 'azul',
    });
    expect(after.extraTop).toBe(true);

    msg({ type: 'librosDelete', requestId: 'r3', id: r1.id }, a.c);
    expect(a.last('librosResult')).toMatchObject({ requestId: 'r3', ok: true });
    const gone = onDisk();
    expect(gone.books).toEqual([]);
    expect(gone.trash[0]).toMatchObject({ id: r1.id, title: 'Río lento' });
    msg({ type: 'librosDelete', requestId: 'r4', id: r1.id }, a.c);
    expect(a.last('librosResult')).toMatchObject({ requestId: 'r4', ok: false });
  });

  it('keeps a damaged file aside before writing, and never writes over one too big', () => {
    const s = setup();
    fs.writeFileSync(s.file, '{ esto no es json');
    const a = s.client();
    s.msg({ type: 'librosOpen' }, a.c);
    expect((a.last('librosStatus') as { problems: string[] }).problems[0]).toContain(
      'no se pudo leer',
    );
    s.msg({ type: 'librosSave', requestId: 'r', book: newBook('Nuevo') }, a.c);
    const aside = fs.readdirSync(s.pixel).filter((f) => f.startsWith('libros.danado-'));
    expect(aside).toHaveLength(1);
    expect(fs.readFileSync(path.join(s.pixel, aside[0]), 'utf8')).toBe('{ esto no es json');
    expect(s.onDisk().books).toHaveLength(1);

    const big = setup();
    fs.writeFileSync(big.file, ' '.repeat(FILE_MAX_BYTES + 10));
    const b = big.client();
    big.msg({ type: 'librosSave', requestId: 'r', book: newBook('X') }, b.c);
    expect(b.last('librosResult')).toMatchObject({ ok: false });
    expect(fs.statSync(big.file).size).toBe(FILE_MAX_BYTES + 10);
  });
});

describe('libros feature: Open Library', () => {
  it('fills from an ISBN (shown, never saved), and says when it is not valid or not known', async () => {
    const s = setup({
      [`${OL}/api/books?bibkeys=ISBN:${ISBN}&jscmd=data&format=json`]: json({
        [`ISBN:${ISBN}`]: {
          title: 'El faro de niebla',
          authors: [{ name: 'Marta Olmo' }],
          publishers: [{ name: 'Brújula' }],
          publish_date: '2019',
          number_of_pages: 288,
          cover: { large: `${COVERS}/b/id/42-L.jpg` },
        },
      }),
      [`${OL}/api/books?bibkeys=ISBN:0306406152&jscmd=data&format=json`]: json({}),
    });
    const a = s.client();
    s.msg({ type: 'librosLookup', requestId: 'l1', isbn: '978-0-306-40615-7' }, a.c);
    await s.settle();
    expect(a.last('librosLookupResult')).toEqual({
      type: 'librosLookupResult',
      requestId: 'l1',
      ok: true,
      isbn: ISBN,
      found: {
        title: 'El faro de niebla',
        authors: ['Marta Olmo'],
        publisher: 'Brújula',
        year: 2019,
        pages: 288,
        hasCover: true,
      },
    });
    expect(fs.existsSync(s.file)).toBe(false);
    s.msg({ type: 'librosLookup', requestId: 'l2', isbn: '123' }, a.c);
    expect(a.last('librosLookupResult')).toMatchObject({
      requestId: 'l2',
      ok: false,
      reason: 'invalido',
    });
    s.msg({ type: 'librosLookup', requestId: 'l3', isbn: '0306406152' }, a.c);
    await s.settle();
    expect(a.last('librosLookupResult')).toMatchObject({
      requestId: 'l3',
      ok: false,
      reason: 'desconocido',
    });
    expect(s.net.calls.every((u) => u.startsWith('https://openlibrary.org/'))).toBe(true);
  });

  it('tries once more when Open Library drops the connection', async () => {
    let tries = 0;
    const s = setup({
      [`${OL}/api/books*`]: () => {
        if (++tries === 1) throw new TypeError('fetch failed');
        return new Response(JSON.stringify({ [`ISBN:${ISBN}`]: { title: 'Uno' } }), {
          status: 200,
        });
      },
    });
    const a = s.client();
    s.msg({ type: 'librosLookup', requestId: 'l', isbn: ISBN }, a.c);
    await s.settle();
    expect(tries).toBe(2);
    expect(a.last('librosLookupResult')).toMatchObject({ ok: true, found: { title: 'Uno' } });
  });

  it('says «sin-respuesta» when Open Library fails', async () => {
    const s = setup({ [`${OL}/api/books*`]: () => new Response('boom', { status: 503 }) });
    const a = s.client();
    s.msg({ type: 'librosLookup', requestId: 'l', isbn: ISBN }, a.c);
    await s.settle();
    expect(a.last('librosLookupResult')).toMatchObject({ ok: false, reason: 'sin-respuesta' });
  });

  it('sets the cover of its own ISBN, serves it with the token only, and deletes it with the book', async () => {
    const png = fakePng();
    const s = setup({ [`${COVERS}/b/isbn/${ISBN}-L.jpg?default=false`]: image(png) });
    const a = s.client();
    s.msg({ type: 'librosSave', requestId: 'r', book: newBook('El faro', { isbn: ISBN }) }, a.c);
    const id = (a.last('librosResult') as { id: string }).id;
    s.msg({ type: 'librosCoverFind', id }, a.c);
    await s.settle();
    const status = a.last('librosStatus') as {
      books: { coverArt?: unknown }[];
      covers: { state: string }[];
    };
    expect(status.covers[0].state).toBe('encontrada');
    expect(s.onDisk().books[0].coverArt).toMatchObject({
      source: 'openlibrary',
      key: `isbn:${ISBN}`,
      type: 'png',
    });
    const img = path.join(s.pixel, 'libros', 'portadas', `${id}.png`);
    expect(fs.existsSync(img)).toBe(true);

    const app = Fastify();
    s.feature.registerRoutes?.(app);
    const ok = await app.inject({ url: `/api/libros/portada/${id}?token=tok` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(ok.headers['content-security-policy']).toContain('sandbox');
    expect((await app.inject({ url: `/api/libros/portada/${id}` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/libros/portada/${id}?token=mal` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/libros/portada/..%2Fx?token=tok` })).statusCode).toBe(
      404,
    );
    await app.close();

    s.msg({ type: 'librosDelete', requestId: 'd', id }, a.c);
    expect(fs.existsSync(img)).toBe(false);
  });

  it('by title and author only offers; the person picks, following the archive’s redirects', async () => {
    const png = fakePng(200, 300, 9);
    const s = setup({
      [`${OL}/search.json*`]: json({
        docs: [
          { title: 'Río lento', author_name: ['Ana Pérez'], first_publish_year: 1990, cover_i: 77 },
          { title: 'Río lento', author_name: ['Otro Señor'], cover_i: 78 },
        ],
      }),
      [`${COVERS}/b/id/77-M.jpg`]: image(png),
      [`${COVERS}/b/id/77-L.jpg`]: () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://archive.org/download/x/77-L.jpg' },
        }),
      'https://archive.org/download/x/77-L.jpg': () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://ia800100.us.archive.org/view?file=77-L.jpg' },
        }),
      'https://ia800100.us.archive.org/view?file=77-L.jpg': image(png),
    });
    const a = s.client();
    s.msg(
      {
        type: 'librosSave',
        requestId: 'r',
        book: newBook('Río lento', { authors: ['Ana Pérez'] }),
      },
      a.c,
    );
    const id = (a.last('librosResult') as { id: string }).id;
    s.msg({ type: 'librosCoverFind', id }, a.c);
    await s.settle();
    const st = (
      a.last('librosStatus') as {
        covers: { state: string; stamp: string; candidates?: unknown[] }[];
      }
    ).covers[0];
    expect(st.state).toBe('elige');
    // The other author is never offered
    expect(st.candidates).toEqual([{ label: 'Río lento · Ana Pérez', year: 1990 }]);
    expect(s.onDisk().books[0].coverArt).toBeUndefined();

    const app = Fastify();
    s.feature.registerRoutes?.(app);
    expect((await app.inject({ url: `/api/libros/candidata/${id}/0?token=tok` })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ url: `/api/libros/candidata/${id}/1?token=tok` })).statusCode).toBe(
      404,
    );
    await app.close();

    s.msg({ type: 'librosCoverPick', requestId: 'p0', id, n: 0, stamp: 'viejo' }, a.c);
    await s.settle();
    expect(a.last('librosResult')).toMatchObject({ requestId: 'p0', ok: false });
    s.msg({ type: 'librosCoverPick', requestId: 'p', id, n: 0, stamp: st.stamp }, a.c);
    await s.settle(40);
    expect(a.last('librosResult')).toMatchObject({ requestId: 'p', ok: true });
    expect(s.onDisk().books[0].coverArt).toMatchObject({ source: 'openlibrary', key: 'id:77' });

    // A new title takes a cover Open Library found away (it was another book's)
    const saved = s.onDisk().books[0];
    s.msg({ type: 'librosSave', requestId: 'r2', book: { ...saved, title: 'Montaña' } }, a.c);
    expect(s.onDisk().books[0].coverArt).toBeUndefined();
    expect((a.last('librosStatus') as { covers: { reason?: string }[] }).covers[0].reason).toBe(
      'cambio',
    );
  });

  it('«Ninguna» is kept, and «Buscar las que faltan» leaves it alone', async () => {
    const s = setup({
      [`${OL}/search.json*`]: json({ docs: [{ title: 'Uno', author_name: [], cover_i: 5 }] }),
    });
    const a = s.client();
    s.msg({ type: 'librosSave', requestId: 'r', book: newBook('Uno') }, a.c);
    s.msg({ type: 'librosSave', requestId: 'r2', book: newBook('Dos') }, a.c);
    const [uno] = s.onDisk().books;
    s.msg({ type: 'librosCoverFind', id: uno.id }, a.c);
    await s.settle();
    const st = (a.last('librosStatus') as { covers: { id: string; stamp: string }[] }).covers.find(
      (c) => c.id === uno.id,
    )!;
    s.msg({ type: 'librosCoverDismiss', requestId: 'n', id: uno.id, stamp: st.stamp }, a.c);
    await s.settle();
    expect(s.onDisk().books[0].coverNone).toBeTruthy();
    s.net.calls.length = 0;
    s.msg({ type: 'librosCoverRun', action: 'start' }, a.c);
    await s.settle(40);
    const run = (
      a.last('librosStatus') as { coverRun: { total: number; running: boolean; notFound: number } }
    ).coverRun;
    expect(run).toMatchObject({ total: 1, running: false, notFound: 1 });
    expect(s.net.calls).toHaveLength(1); // only «Dos» was searched (and nothing looked like it)
  });

  it('takes an upload with the office token only, checked by its bytes', async () => {
    const s = setup();
    const a = s.client();
    s.msg({ type: 'librosSave', requestId: 'r', book: newBook('Subida') }, a.c);
    const id = (a.last('librosResult') as { id: string }).id;
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    const post = (body: Buffer, auth?: string) =>
      app.inject({
        method: 'POST',
        url: `/api/libros/portada/${id}`,
        headers: { 'content-type': 'image/png', ...(auth ? { authorization: auth } : {}) },
        payload: body,
      });
    expect((await post(Buffer.from(fakePng()))).statusCode).toBe(401);
    expect((await post(Buffer.from('hola, no soy imagen'), 'Bearer tok')).statusCode).toBe(415);
    expect((await post(Buffer.from(fakePng(20000, 20000)), 'Bearer tok')).statusCode).toBe(413);
    const ok = await post(Buffer.from(fakePng()), 'Bearer tok');
    expect(ok.statusCode).toBe(200);
    expect(s.onDisk().books[0].coverArt).toMatchObject({ source: 'subida', key: '', type: 'png' });
    await app.close();
    // An uploaded cover stays when the title changes: it is the person's
    const saved = s.onDisk().books[0];
    s.msg({ type: 'librosSave', requestId: 'r2', book: { ...saved, title: 'Otro título' } }, a.c);
    expect(s.onDisk().books[0].coverArt).toMatchObject({ source: 'subida' });
  });
});

describe('libros: the one way to the network', () => {
  const policy = { hosts: BOOK_HOSTS, hostPattern: ARCHIVE_SERVER_PATTERN, maxRedirects: 3 };

  it('follows a redirect only to an allowed host, and only so many', async () => {
    const { f } = fakeNet({
      [`${COVERS}/a`]: () =>
        new Response(null, { status: 302, headers: { location: 'https://evil.test/x' } }),
      [`${COVERS}/b`]: () => new Response(null, { status: 301, headers: { location: '/c' } }),
      [`${COVERS}/c`]: () => new Response('ok', { status: 200 }),
      [`${COVERS}/loop`]: () => new Response(null, { status: 302, headers: { location: '/loop' } }),
      [`${COVERS}/http`]: () =>
        new Response(null, { status: 302, headers: { location: 'http://ia1.us.archive.org/x' } }),
    });
    const net = createSafeFetch(f, policy);
    const req = { maxBytes: 100, timeoutMs: 1000 };
    expect(((await net(`${COVERS}/a`, req).catch((e) => e)) as NetError).problem).toBe(
      'redireccion',
    );
    expect((await net(`${COVERS}/b`, req)).status).toBe(200);
    expect(((await net(`${COVERS}/loop`, req).catch((e) => e)) as NetError).problem).toBe(
      'redireccion',
    );
    expect(((await net(`${COVERS}/http`, req).catch((e) => e)) as NetError).problem).toBe(
      'redireccion',
    );
    expect(((await net('https://example.com/', req).catch((e) => e)) as NetError).problem).toBe(
      'no-permitido',
    );
    expect(
      ((await net('https://ia1.us.archive.org.evil.test/', req).catch((e) => e)) as NetError)
        .problem,
    ).toBe('no-permitido');
  });

  it('the collection’s default policy still never follows one', async () => {
    const LIB = 'https://thumbnails.libretro.com';
    const { f, calls } = fakeNet({
      [`${LIB}/x`]: () => new Response(null, { status: 302, headers: { location: `${LIB}/y` } }),
      [`${LIB}/y`]: () => new Response('ok', { status: 200 }),
    });
    const strict = createSafeFetch(f);
    const err = (await strict(`${LIB}/x`, { maxBytes: 100, timeoutMs: 1000 }).catch(
      (e) => e,
    )) as NetError;
    expect(err.problem).toBe('redireccion');
    expect(calls).toEqual([`${LIB}/x`]);
    expect(
      (
        (await strict(`${COVERS}/b`, { maxBytes: 100, timeoutMs: 1000 }).catch(
          (e) => e,
        )) as NetError
      ).problem,
    ).toBe('no-permitido');
  });
});
