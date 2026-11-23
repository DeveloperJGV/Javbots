import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createCoverFiles } from '../../../coleccion/server/covers/coverFiles.js';
import type { OpenLibrary } from '../../../libros/server/covers/openLibrary.js';
import type { AniDoc } from '../../core/lookup.js';
import { emptySeries, withOwned } from '../../core/series.js';
import type { AniList } from '../../server/aniList.js';
import { createComicsStore } from '../../server/comicsStore.js';
import { COVERS_DIR } from '../../server/constants.js';
import { createComicCoverService } from '../../server/coverService.js';

// The comics' cover service after a wait: the same checks as the library's (and the game collection's).

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

const png = (fill: number) => {
  const b = new Uint8Array(64).fill(fill);
  b.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0,
    0, 0, 1, 128,
  ]);
  return b;
};
function gate() {
  let open!: () => void;
  const wait = new Promise<void>((r) => (open = r));
  return { wait, open };
}
const ISBN = '9780306406157';
const doc: AniDoc = {
  id: '77',
  title: 'Puerto Niebla',
  altTitle: '',
  writers: ['Rin Kaze'],
  artists: [],
  volumes: 0,
  finished: false,
  year: 2004,
  genres: [],
  coverUrl: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx77-a.jpg',
};

function setup(o: {
  isbnWait?: Promise<void>;
  aniWait?: Promise<void>;
  imageWait?: Promise<void>;
  commitFails?: () => boolean;
  onChange?: () => void;
}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'comics-race-'));
  homes.push(home);
  const pixelDir = path.join(home, '.pixel-agents');
  let t = Date.parse('2026-11-23T20:15:00.000Z');
  const now = () => (t += 1000);
  const store = createComicsStore({ pixelDir, now });
  const real = createCoverFiles(pixelDir, COVERS_DIR);
  const files = {
    ...real,
    commit: (st: Parameters<typeof real.commit>[0]) => {
      if (o.commitFails?.()) throw new Error('disco lleno');
      real.commit(st);
    },
  };
  let images = 0;
  const ol: OpenLibrary = {
    lookup: async () => null,
    isbnCover: async () => {
      await o.isbnWait;
      return png(1);
    },
    search: async () => [],
    coverById: async () => png(2),
    lastOkAt: () => undefined,
    lastProblem: () => undefined,
  };
  const ani: AniList = {
    search: async () => {
      await o.aniWait;
      return [doc];
    },
    image: async () => {
      images++;
      await o.imageWait;
      return png(3);
    },
    lastOkAt: () => undefined,
    lastProblem: () => undefined,
  };
  const covers = createComicCoverService({
    store,
    files,
    ol,
    ani,
    now,
    onChange: o.onChange ?? (() => {}),
  });
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };
  const file = (id: string) => path.join(pixelDir, 'comics', 'portadas', `${id}.png`);
  return { store, covers, settle, file, images: () => images, pixelDir };
}

const withIsbn = () => {
  const v = withOwned([], [1]);
  v[0].isbn = ISBN;
  return v;
};

describe('comics covers: after every wait, check again', () => {
  it('1. a cover uploaded while a volume’s ISBN was searched is never replaced', async () => {
    const g = gate();
    const s = setup({ isbnWait: g.wait });
    const one = s.store.save({
      ...emptySeries(''),
      title: 'Capa',
      kind: 'comic',
      volumes: withIsbn(),
    });
    const search = s.covers.find(one.id, true);
    await s.settle();
    s.covers.upload(one.id, png(7));
    g.open();
    await search;
    expect(s.store.get(one.id)?.coverArt).toMatchObject({ source: 'subida' });
    expect(fs.readFileSync(s.file(one.id))[40]).toBe(7);
  });

  it('2. renamed or deleted while AniList answered: no choice of the old one, no ghost', async () => {
    const g = gate();
    const s = setup({ aniWait: g.wait });
    const a = s.store.save({ ...emptySeries(''), title: 'Puerto Niebla', kind: 'manga' });
    const b = s.store.save({ ...emptySeries(''), title: 'Puerto Niebla', kind: 'manga' });
    const fa = s.covers.find(a.id, true);
    const fb = s.covers.find(b.id, true);
    await s.settle();
    s.store.save({ ...s.store.get(a.id)!, title: 'Otra' });
    s.covers.seriesChanged(a.id, false);
    s.store.remove(b.id);
    s.covers.forget(b.id);
    g.open();
    await Promise.all([fa, fb]);
    expect(s.covers.states()).toEqual([]);
  });

  it('3. a thumbnail of an old search is not kept; two requests share one download', async () => {
    const g = gate();
    const s = setup({ imageWait: g.wait });
    const a = s.store.save({ ...emptySeries(''), title: 'Puerto Niebla', kind: 'manga' });
    await s.covers.find(a.id, true);
    const one = s.covers.candidateImage(a.id, 0);
    const two = s.covers.candidateImage(a.id, 0);
    await s.settle();
    expect(s.images()).toBe(1);
    const again = s.covers.find(a.id, true);
    await again;
    g.open();
    expect(await one).toBeNull();
    expect(await two).toBeNull();
    const dir = path.join(s.pixelDir, 'comics', 'portadas', '.candidatas');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it('4. when the image cannot be put in place, the series keeps the cover it had', () => {
    let fail = false;
    const s = setup({ commitFails: () => fail });
    const a = s.store.save({ ...emptySeries(''), title: 'Uno' });
    const first = s.covers.upload(a.id, png(5));
    fail = true;
    expect(() => s.covers.upload(a.id, png(6))).toThrow(/portada de antes sigue igual/);
    expect(s.store.get(a.id)?.coverArt).toEqual(first);
    expect(fs.readFileSync(s.file(a.id))[40]).toBe(5);
  });

  it('5. a page that cannot be told never stops a run halfway', async () => {
    const s = setup({
      onChange: () => {
        throw new Error('se cayó el envío');
      },
    });
    s.store.save({ ...emptySeries(''), title: 'Capa', volumes: withIsbn() });
    s.store.save({ ...emptySeries(''), title: 'Puerto Niebla', kind: 'manga' });
    await s.covers.startRun();
    expect(s.covers.progress()).toMatchObject({
      running: false,
      total: 2,
      done: 2,
      found: 1,
      choose: 1,
    });
    expect(
      s.covers
        .states()
        .map((x) => x.state)
        .sort(),
    ).toEqual(['elige', 'encontrada']);
  });
});

describe('comics: smaller fixes of the review', () => {
  it('6. a save past the volumes cap says so instead of cutting the high numbers', () => {
    const s = setup({});
    const many = Array.from({ length: 2001 }, (_, i) => ({
      number: i + 1,
      owned: true,
      isbn: '',
      addedAt: '',
      price: '',
    }));
    expect(() => s.store.save({ ...emptySeries(''), title: 'Larga', volumes: many })).toThrow(
      /2001 tomos anotados; el tope es 2000/,
    );
    expect(s.store.list()).toEqual([]);
  });

  it('8. a file read only in part never counts as read whole (so no cover is taken for an orphan)', () => {
    const s = setup({});
    const file = path.join(s.pixelDir, 'comics.json');
    fs.mkdirSync(s.pixelDir, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ version: 1, series: [{ id: 'aaaa1111', title: 'A' }], trash: [] }),
    );
    expect(s.store.readWhole()).toBe(true);
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        series: [
          { id: 'aaaa1111', title: 'A' },
          { id: 'aaaa1111', title: 'B' },
        ],
      }),
    );
    expect(s.store.readWhole()).toBe(false);
  });
});
