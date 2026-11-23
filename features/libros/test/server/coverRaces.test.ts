import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { createCoverFiles } from '../../../coleccion/server/covers/coverFiles.js';
import { emptyBook } from '../../core/book.js';
import { COVERS_DIR } from '../../server/covers/constants.js';
import { createCoverService } from '../../server/covers/coverService.js';
import type { OpenLibrary } from '../../server/covers/openLibrary.js';
import { createLibraryStore } from '../../server/libraryStore.js';
import { createLibrosFeature } from '../../server/librosFeature.js';

// What happens when the network makes a search wait and the person (or the file) moves on meanwhile: the
// service checks again after every wait, like the game collection's does.

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (fill: number, w = 300, h = 450) => {
  const b = new Uint8Array(64).fill(fill);
  b.set([
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
  ]);
  return b;
};

/** A wait the test lets go of. */
function gate() {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}

const ISBN = '9780306406157';
const ISBN2 = '9780140328721';
const OL = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org';
type Handler = (url: string) => Response | Promise<Response>;

function setup(routes: Record<string, Handler>) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'libros-race-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const h =
      routes[url] ??
      Object.entries(routes).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    return h ? h(url) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  let t = Date.parse('2026-11-23T20:15:00.000Z');
  const feature = createLibrosFeature({
    home,
    now: () => (t += 1000),
    fetch: f,
    sleep: async () => {},
    officeToken: () => 'tok',
  });
  const sent: Record<string, unknown>[] = [];
  const c: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
  feature.connect?.(c);
  const msg = (m: Record<string, unknown>) => feature.handleClientMessage?.(m, c);
  const save = (book: Record<string, unknown>) => {
    msg({ type: 'librosSave', requestId: `r${sent.length}`, book });
    return [...sent].reverse().find((m) => m.type === 'librosResult') as { id: string };
  };
  const settle = async (rounds = 40) => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  };
  const coverFile = (id: string, type = 'png') =>
    path.join(pixel, 'libros', 'portadas', `${id}.${type}`);
  return { feature, save, settle, calls, coverFile, pixel };
}

describe('libros covers: after every wait, check again', () => {
  it('1. a cover uploaded while its ISBN search waited is never replaced', async () => {
    const g = gate();
    const s = setup({
      [`${COVERS}/b/isbn/${ISBN}-L.jpg?default=false`]: async () => {
        await g.wait;
        return new Response(png(1), { status: 200 });
      },
      [`${OL}/search.json*`]: () => new Response('{"docs":[]}', { status: 200 }),
    });
    const { id } = s.save({ ...emptyBook(''), title: 'El faro', isbn: ISBN });
    const search = s.feature.covers.find(id, true);
    await s.settle();
    s.feature.covers.upload(id, png(7));
    g.open();
    await search;
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({ source: 'subida' });
    expect(fs.readFileSync(s.coverFile(id))[40]).toBe(7);
  });

  it('1. a choice picked after an upload does not replace the upload', async () => {
    const g = gate();
    const s = setup({
      [`${OL}/search.json*`]: () =>
        new Response(JSON.stringify({ docs: [{ title: 'Río lento', cover_i: 77 }] }), {
          status: 200,
        }),
      [`${COVERS}/b/id/77-L.jpg`]: async () => {
        await g.wait;
        return new Response(png(2), { status: 200 });
      },
    });
    const { id } = s.save({ ...emptyBook(''), title: 'Río lento' });
    await s.feature.covers.find(id, true);
    const st = s.feature.covers.states().find((x) => x.id === id)!;
    expect(st.state).toBe('elige');
    const pick = s.feature.covers.pick(id, 0, st.stamp).catch((e) => e as Error);
    await s.settle();
    s.feature.covers.upload(id, png(7));
    g.open();
    expect(((await pick) as Error).message).toMatch(/ya no está|cambió/);
    expect(s.feature.store.get(id)?.coverArt).toMatchObject({ source: 'subida' });
  });

  it('2. a new ISBN while the old one was searched: the old cover is not set', async () => {
    const g = gate();
    const s = setup({
      [`${COVERS}/b/isbn/${ISBN}-L.jpg?default=false`]: async () => {
        await g.wait;
        return new Response(png(1), { status: 200 });
      },
      [`${OL}/search.json*`]: () => new Response('{"docs":[]}', { status: 200 }),
    });
    const { id } = s.save({ ...emptyBook(''), title: 'El faro', isbn: ISBN });
    const search = s.feature.covers.find(id, true);
    await s.settle();
    const book = s.feature.store.get(id)!;
    s.save({ ...book, isbn: ISBN2 });
    g.open();
    await search;
    expect(s.feature.store.get(id)?.coverArt).toBeUndefined();
    expect(s.feature.covers.states().find((x) => x.id === id)).toBeUndefined();
    expect(fs.existsSync(s.coverFile(id))).toBe(false);
  });

  it('2. a new title while searching leaves no choice of the old one; a deleted book leaves no ghost', async () => {
    const g = gate();
    const s = setup({
      [`${OL}/search.json*`]: async () => {
        await g.wait;
        return new Response(JSON.stringify({ docs: [{ title: 'Río lento', cover_i: 77 }] }), {
          status: 200,
        });
      },
    });
    const { id } = s.save({ ...emptyBook(''), title: 'Río lento' });
    const other = s.save({ ...emptyBook(''), title: 'Río lento' }).id;
    const a = s.feature.covers.find(id, true);
    const b = s.feature.covers.find(other, true);
    await s.settle();
    s.save({ ...s.feature.store.get(id)!, title: 'Montaña' });
    s.feature.handleClientMessage?.(
      { type: 'librosDelete', requestId: 'd', id: other },
      { privileged: true, send: () => {} },
    );
    g.open();
    await Promise.all([a, b]);
    expect(s.feature.covers.states()).toEqual([]);
  });

  it('3. a thumbnail of an old search is not kept for the new one; two requests share one download', async () => {
    const g = gate();
    let thumbs = 0;
    const s = setup({
      [`${OL}/search.json*`]: () =>
        new Response(JSON.stringify({ docs: [{ title: 'Río lento', cover_i: 77 }] }), {
          status: 200,
        }),
      [`${COVERS}/b/id/77-M.jpg`]: async () => {
        thumbs++;
        await g.wait;
        return new Response(png(3), { status: 200 });
      },
    });
    const { id } = s.save({ ...emptyBook(''), title: 'Río lento' });
    await s.feature.covers.find(id, true);
    const one = s.feature.covers.candidateImage(id, 0);
    const two = s.feature.covers.candidateImage(id, 0);
    await s.settle();
    expect(thumbs).toBe(1);
    // Searched again while it downloads (it waits its turn behind the download in the queue)
    const again = s.feature.covers.find(id, true);
    g.open();
    expect(await one).toBeNull();
    expect(await two).toBeNull();
    await again;
    expect(s.feature.covers.states()[0].state).toBe('elige');
    const dir = path.join(s.pixel, 'libros', 'portadas', '.candidatas');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });
});

/** The service alone, with files and Open Library made up, to break what the feature cannot. */
function bare(opts: { commitFails?: boolean; onChange?: () => void } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'libros-bare-'));
  homes.push(home);
  const pixelDir = path.join(home, '.pixel-agents');
  let t = Date.parse('2026-11-23T20:15:00.000Z');
  const now = () => (t += 1000);
  const store = createLibraryStore({ pixelDir, now });
  const real = createCoverFiles(pixelDir, COVERS_DIR);
  let fail = false;
  const files = {
    ...real,
    commit: (st: Parameters<typeof real.commit>[0]) => {
      if (fail) throw new Error('disco lleno');
      real.commit(st);
    },
  };
  const ol: OpenLibrary = {
    lookup: async () => null,
    isbnCover: async () => png(1),
    search: async () => [],
    coverById: async () => png(2),
    lastOkAt: () => undefined,
    lastProblem: () => undefined,
  };
  const covers = createCoverService({
    store,
    files,
    ol,
    now,
    onChange: opts.onChange ?? (() => {}),
  });
  return { store, covers, pixelDir, failCommits: () => (fail = true) };
}

describe('libros covers: writes and notices', () => {
  it('4. when the image cannot be put in place, the book keeps the cover it had', () => {
    const b = bare();
    const book = b.store.save({ ...emptyBook(''), title: 'Uno' });
    const first = b.covers.upload(book.id, png(5));
    b.failCommits();
    expect(() => b.covers.upload(book.id, png(6, 200, 200))).toThrow(
      /portada de antes sigue igual/,
    );
    expect(b.store.get(book.id)?.coverArt).toEqual(first);
    const file = path.join(b.pixelDir, 'libros', 'portadas', `${book.id}.png`);
    expect(fs.readFileSync(file)[40]).toBe(5);
  });

  it('5. a page that cannot be told never leaves a search «buscando» or a run halfway', async () => {
    const b = bare({
      onChange: () => {
        throw new Error('se cayó el envío');
      },
    });
    const one = b.store.save({ ...emptyBook(''), title: 'Uno', isbn: ISBN });
    const two = b.store.save({ ...emptyBook(''), title: 'Dos', isbn: ISBN2 });
    await b.covers.startRun();
    expect(b.covers.progress()).toMatchObject({ running: false, total: 2, done: 2, found: 2 });
    expect(b.covers.states().map((s) => s.state)).toEqual(['encontrada', 'encontrada']);
    expect(b.store.get(one.id)?.coverArt?.key).toBe(`isbn:${ISBN}`);
    expect(b.store.get(two.id)?.coverArt?.key).toBe(`isbn:${ISBN2}`);
  });
});

describe('libros: a file read only in part', () => {
  it('8. never counts as read whole, so the start-up cleanup does not take covers for orphans', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'libros-partial-'));
    homes.push(home);
    const pixelDir = path.join(home, '.pixel-agents');
    fs.mkdirSync(pixelDir, { recursive: true });
    const file = path.join(pixelDir, 'libros.json');
    const store = createLibraryStore({ pixelDir });
    fs.writeFileSync(file, JSON.stringify({ version: 1, books: [{ id: 'aaaa1111', title: 'A' }] }));
    expect(store.readWhole()).toBe(true);
    // A repeated id is given a new one: the cover of the book that had it must not look orphaned
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        books: [
          { id: 'aaaa1111', title: 'A' },
          { id: 'aaaa1111', title: 'B' },
        ],
      }),
    );
    expect(store.readWhole()).toBe(false);
    // An image of a book that is in the file but got a new id stays at start
    const covers = path.join(pixelDir, 'libros', 'portadas');
    fs.mkdirSync(covers, { recursive: true });
    fs.writeFileSync(path.join(covers, 'bbbb2222.png'), png(1));
    createLibrosFeature({ home, officeToken: () => 'tok' });
    expect(fs.existsSync(path.join(covers, 'bbbb2222.png'))).toBe(true);
  });
});
