import Fastify from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { aniScore, parseAniList } from '../../core/lookup.js';
import {
  emptySeries,
  mergeSave,
  missingNumbers,
  normalizeSeries,
  parseVolumeList,
  readComics,
  seriesSpan,
  toggleVolume,
  volumeListText,
  withOwned,
} from '../../core/series.js';
import {
  buildComicShelves,
  comicTotals,
  matchesComicLit,
  moveSeriesFocus,
  runSlots,
  suggestComics,
} from '../../core/shelves.js';
import type { Series } from '../../core/types.js';
import { createComicsFeature } from '../../server/comicsFeature.js';
import { seriesIsbn } from '../../server/coverService.js';

const TODAY = '2026-11-23';
let n = 0;
/** An invented series (titles and people made up for the tests). */
const series = (title: string, owned: number[] = [], extra: Partial<Series> = {}): Series => ({
  ...emptySeries('2026-01-01'),
  id: `s${String(++n).padStart(5, '0')}`,
  title,
  volumes: withOwned([], owned),
  ...extra,
});

describe('comics core: volumes', () => {
  it('reads «1-12, 15, 17 a 20» and writes it back short', () => {
    expect(parseVolumeList('1-12, 15, 17 a 20')).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 17, 18, 19, 20,
    ]);
    expect(parseVolumeList('3 1 2 2')).toEqual([1, 2, 3]);
    expect(parseVolumeList('1 – 3; 5')).toEqual([1, 2, 3, 5]);
    expect(parseVolumeList('')).toEqual([]);
    expect(parseVolumeList('5-1')).toBeNull();
    expect(parseVolumeList('uno')).toBeNull();
    expect(parseVolumeList('1-9999')).toBeNull();
    expect(volumeListText([1, 2, 3, 5, 7, 8])).toBe('1-3, 5, 7-8');
    expect(volumeListText([])).toBe('');
  });

  it('knows the span and what is missing (the «se busca»)', () => {
    const s = series('Ola', [1, 2, 3, 5], { totalVolumes: 7 });
    expect(seriesSpan(s)).toBe(7);
    expect(missingNumbers(s)).toEqual([4, 6, 7]);
    // Still coming out: the highest one known is the end for now
    expect(missingNumbers(series('Nube', [1, 4]))).toEqual([2, 3]);
    expect(runSlots(s).map((x) => `${x.number}${x.owned ? '' : '?'}`)).toEqual([
      '1',
      '2',
      '3',
      '4?',
      '5',
      '6?',
      '7?',
    ]);
    // A one-volume graphic novel that is here has nothing missing
    expect(missingNumbers(series('Solo', [1], { totalVolumes: 1 }))).toEqual([]);
  });

  it('toggles a volume and keeps what it had; a missing one stays only if it says something', () => {
    const v = [
      { number: 1, owned: true, isbn: '9780306406157', addedAt: '2026-01-01', price: '' },
      { number: 3, owned: false, isbn: '', addedAt: '', price: '$120' },
    ];
    const off = toggleVolume(v, 1);
    expect(off).toEqual([
      { number: 1, owned: false, isbn: '9780306406157', addedAt: '', price: '' },
      { number: 3, owned: false, isbn: '', addedAt: '', price: '$120' },
    ]);
    const on = toggleVolume(off, 3);
    expect(on.find((x) => x.number === 3)).toMatchObject({ owned: true, price: '' });
    expect(withOwned([{ number: 2, owned: true, isbn: '', addedAt: 'x', price: '' }], [])).toEqual(
      [],
    );
  });

  it('reads leniently and dates the volumes that arrive', () => {
    const r = normalizeSeries(
      {
        title: '  Ola  ',
        writers: 'Rin Kaze, Mo Sato',
        kind: 'manga',
        format: 'tankobon',
        totalVolumes: 27,
        volumes: [
          { number: 2, owned: true },
          { number: 2, owned: false, price: '$1' },
          { number: -1, owned: true },
          { number: 5, owned: false },
          { number: 7, owned: false, price: '$90' },
        ],
        rare: 1,
      },
      TODAY,
    )!;
    expect(r.series).toMatchObject({
      title: 'Ola',
      writers: ['Rin Kaze', 'Mo Sato'],
      kind: 'manga',
      format: '',
      totalVolumes: 27,
    });
    expect(r.series.volumes.map((v) => v.number)).toEqual([2, 7]);
    expect(r.unknown).toEqual({ rare: 1 });
    const before = series('Ola', [1], { addedAt: '2025-01-01' });
    before.volumes[0].addedAt = '2025-01-01';
    const after = mergeSave(
      before,
      { ...before, volumes: withOwned(before.volumes, [1, 2]) },
      TODAY,
      'T',
    );
    expect(after.volumes.map((v) => v.addedAt)).toEqual(['2025-01-01', TODAY]);
    expect(after.addedAt).toBe('2025-01-01');
    const read = readComics(
      { series: [{ id: 'aaaa1111', title: 'A' }, { id: 'aaaa1111' }, 4] },
      TODAY,
    );
    expect(read.series.map((s) => s.series.id)).toEqual(['aaaa1111', 'x0001']);
    expect(read.problems.some((p) => p.includes('renglón 3'))).toBe(true);
  });
});

describe('comics core: shelves and search', () => {
  const list = [
    series('Zeta Kid', [1, 2], { kind: 'manga', writers: ['Rin Kaze'], localPublisher: 'Panel' }),
    series('Alba', [1], { kind: 'manga', writers: ['Mo Sato'] }),
    series('Capa Roja', [1, 2, 3], { kind: 'comic', writers: ['Ana Ruiz'], publisher: 'Viñeta' }),
    series('La torre', [1], { kind: 'novela-grafica', totalVolumes: 1 }),
    series('Sin nada'),
  ];

  it('stands kinds in order (manga, cómic, novela gráfica), none last', () => {
    const s = buildComicShelves(list, 'tipo');
    expect(s.map((x) => x.name)).toEqual(['Manga', 'Cómic', 'Novela gráfica', 'Sin tipo']);
    expect(s[0].series.map((x) => x.title)).toEqual(['Alba', 'Zeta Kid']);
    expect(s[0]).toMatchObject({ owned: 3, missing: 0 });
    expect(buildComicShelves(list, 'editorial').map((x) => x.name)).toEqual([
      'Panel',
      'Viñeta',
      'Sin editorial',
    ]);
  });

  it('suggests people, publishers and series, and lights them', () => {
    const s = suggestComics(list, 'rin');
    expect(s[0]).toMatchObject({ kind: 'autor', value: 'Rin Kaze' });
    expect(s.some((x) => x.kind === 'series' && x.series.title === 'Zeta Kid')).toBe(true);
    expect(matchesComicLit(list[0], { kind: 'editorial', value: 'panel' })).toBe(true);
    expect(comicTotals(list)).toEqual({ series: 5, owned: 7, missing: 0 });
    const shelves = buildComicShelves(list, 'tipo');
    expect(moveSeriesFocus(shelves, null, 'ArrowRight')).toBe(shelves[0].series[0].id);
    expect(moveSeriesFocus(shelves, shelves[0].series[0].id, 'ArrowDown')).toBe(
      shelves[1].series[0].id,
    );
  });

  it('reads AniList: people by role, translators out, only its own image host', () => {
    const docs = parseAniList({
      data: {
        Page: {
          media: [
            {
              id: 77,
              title: { romaji: 'Ola no Kuni', english: 'Land of Waves' },
              status: 'FINISHED',
              volumes: 14,
              startDate: { year: 2004 },
              genres: ['Adventure'],
              staff: {
                edges: [
                  { role: 'Story', node: { name: { full: 'Rin Kaze' } } },
                  { role: 'Art', node: { name: { full: 'Mo Sato' } } },
                  { role: 'Translator (English)', node: { name: { full: 'Otra Persona' } } },
                ],
              },
              coverImage: {
                extraLarge:
                  'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx77-abc.jpg',
              },
            },
            { id: 78, title: { romaji: 'Mala' }, coverImage: { large: 'https://evil.test/x.jpg' } },
          ],
        },
      },
    });
    expect(docs[0]).toMatchObject({
      id: '77',
      title: 'Land of Waves',
      altTitle: 'Ola no Kuni',
      writers: ['Rin Kaze'],
      artists: ['Mo Sato'],
      volumes: 14,
      finished: true,
      year: 2004,
    });
    expect(docs[0].coverUrl).toContain('s4.anilist.co');
    expect(docs[1].coverUrl).toBe('');
    expect(aniScore('ola no kuni', docs[0])).toBe(1);
    expect(aniScore('Otra cosa', docs[0])).toBe(0);
    expect(parseAniList({})).toEqual([]);
  });

  it('a series cover goes by its lowest volume with a valid ISBN', () => {
    const s = series('A', [1, 2]);
    s.volumes[1].isbn = '9780306406157';
    s.volumes[0].isbn = '123';
    expect(seriesIsbn(s)).toBe('9780306406157');
    expect(seriesIsbn(series('B', [1]))).toBeNull();
  });
});

// ── The feature, with a fake network ──

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function setup(routes: Record<string, Handler> = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'comics-home-'));
  homes.push(home);
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  let t = Date.parse('2026-11-23T20:15:00.000Z');
  const calls: { url: string; body?: string }[] = [];
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, body: typeof init.body === 'string' ? init.body : undefined });
    const handler =
      routes[url] ??
      Object.entries(routes).find(([k]) => k.endsWith('*') && url.startsWith(k.slice(0, -1)))?.[1];
    return handler ? handler(url, init) : new Response('not found', { status: 404 });
  }) as typeof fetch;
  let s = 7;
  const feature = createComicsFeature({
    home,
    now: () => (t += 1000),
    random: () => (s = (s * 9301 + 49297) % 233280) / 233280,
    fetch: f,
    sleep: async () => {},
    officeToken: () => 'tok',
  });
  const sent: Record<string, unknown>[] = [];
  const c: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
  feature.connect?.(c);
  const last = (type: string) => [...sent].reverse().find((m) => m.type === type);
  const msg = (m: Record<string, unknown>) => feature.handleClientMessage?.(m, c);
  const file = path.join(pixel, 'comics.json');
  const onDisk = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  const settle = async (rounds = 30) => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  };
  return { feature, msg, last, onDisk, file, pixel, calls, settle };
}

const png = () => {
  const b = new Uint8Array(64).fill(1);
  b.set([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0,
    0, 0, 1, 128,
  ]);
  return b;
};
const ANI = 'https://graphql.anilist.co/';
const IMG = 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx77-abc.jpg';
const aniAnswer = {
  data: {
    Page: {
      media: [
        {
          id: 77,
          title: { romaji: 'Ola', english: null },
          status: 'RELEASING',
          volumes: null,
          startDate: { year: 2004 },
          genres: ['Comedy'],
          staff: { edges: [{ role: 'Story & Art', node: { name: { full: 'Rin Kaze' } } }] },
          coverImage: { extraLarge: IMG },
        },
      ],
    },
  },
};

describe('comics feature', () => {
  it('saves a series with its volumes, keeps unknown fields and deletes to the trash', () => {
    const s = setup();
    s.msg({
      type: 'comicsSave',
      requestId: 'r',
      series: {
        ...emptySeries(''),
        title: 'Ola',
        volumes: withOwned([], [1, 2, 3]),
        totalVolumes: 10,
      },
    });
    const id = (s.last('comicsResult') as { id: string }).id;
    const disk = s.onDisk();
    expect(disk.series[0]).toMatchObject({ id, title: 'Ola', totalVolumes: 10 });
    expect(disk.series[0].volumes.map((v: { addedAt: string }) => v.addedAt)).toEqual([
      TODAY,
      TODAY,
      TODAY,
    ]);
    disk.series[0].shelf = 'arriba';
    fs.writeFileSync(s.file, JSON.stringify(disk));
    const { shelf: _shelf, ...wire } = disk.series[0];
    s.msg({ type: 'comicsSave', requestId: 'r2', series: { ...wire, readUpTo: 2 } });
    expect(s.onDisk().series[0]).toMatchObject({ readUpTo: 2, shelf: 'arriba' });
    s.msg({ type: 'comicsDelete', requestId: 'd', id });
    expect(s.onDisk()).toMatchObject({ series: [], trash: [{ id, title: 'Ola' }] });
  });

  it('looks a manga up in AniList (a POST with the title), shown and never saved', async () => {
    const s = setup({ [ANI]: () => new Response(JSON.stringify(aniAnswer), { status: 200 }) });
    s.msg({ type: 'comicsLookup', requestId: 'l', title: 'Ola', kind: '' });
    await s.settle();
    expect(s.last('comicsLookupResult')).toMatchObject({
      ok: true,
      found: [{ source: 'anilist', title: 'Ola', writers: ['Rin Kaze'], year: 2004, volumes: 0 }],
    });
    expect(JSON.parse(s.calls[0].body ?? '{}').variables).toEqual({ s: 'Ola' });
    expect(fs.existsSync(s.file)).toBe(false);
    s.msg({ type: 'comicsLookup', requestId: 'l2', title: '  ', kind: '' });
    expect(s.last('comicsLookupResult')).toMatchObject({ ok: false, reason: 'nada' });
  });

  it('offers AniList covers for a manga, and the person picks', async () => {
    const s = setup({
      [ANI]: () => new Response(JSON.stringify(aniAnswer), { status: 200 }),
      [IMG]: () => new Response(png(), { status: 200 }),
    });
    s.msg({
      type: 'comicsSave',
      requestId: 'r',
      series: { ...emptySeries(''), title: 'Ola', kind: 'manga' },
    });
    const id = (s.last('comicsResult') as { id: string }).id;
    s.msg({ type: 'comicsCoverFind', id });
    await s.settle();
    const st = (
      s.last('comicsStatus') as {
        covers: { state: string; stamp: string; candidates: unknown[] }[];
      }
    ).covers[0];
    expect(st.state).toBe('elige');
    expect(st.candidates).toEqual([{ label: 'Ola · Rin Kaze', year: 2004 }]);
    // A manga never asks Open Library by title
    expect(s.calls.every((c) => !c.url.includes('openlibrary'))).toBe(true);
    s.msg({ type: 'comicsCoverPick', requestId: 'p', id, n: 0, stamp: st.stamp });
    await s.settle();
    expect(s.onDisk().series[0].coverArt).toMatchObject({
      source: 'anilist',
      key: 'al:77',
      type: 'png',
    });
    const app = Fastify();
    s.feature.registerRoutes?.(app);
    expect((await app.inject({ url: `/api/comics/portada/${id}?token=tok` })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/comics/portada/${id}` })).statusCode).toBe(401);
    await app.close();
  });

  it('sets the cover of a volume’s ISBN by itself', async () => {
    const s = setup({
      'https://covers.openlibrary.org/b/isbn/9780306406157-L.jpg?default=false': () =>
        new Response(png(), { status: 200 }),
    });
    const vols = withOwned([], [1]);
    vols[0].isbn = '9780306406157';
    s.msg({
      type: 'comicsSave',
      requestId: 'r',
      series: { ...emptySeries(''), title: 'Capa', kind: 'comic', volumes: vols },
    });
    const id = (s.last('comicsResult') as { id: string }).id;
    s.msg({ type: 'comicsCoverFind', id });
    await s.settle();
    expect(s.onDisk().series[0].coverArt).toMatchObject({
      source: 'openlibrary',
      key: 'isbn:9780306406157',
    });
  });

  it('never reaches a host that is not allowed, even if AniList names one', async () => {
    const evil = { ...aniAnswer };
    evil.data.Page.media[0] = {
      ...aniAnswer.data.Page.media[0],
      coverImage: { extraLarge: 'https://evil.test/a.jpg' },
    };
    const s = setup({ [ANI]: () => new Response(JSON.stringify(evil), { status: 200 }) });
    s.msg({
      type: 'comicsSave',
      requestId: 'r',
      series: { ...emptySeries(''), title: 'Ola', kind: 'manga' },
    });
    const id = (s.last('comicsResult') as { id: string }).id;
    s.msg({ type: 'comicsCoverFind', id });
    await s.settle();
    expect(s.calls.some((c) => c.url.includes('evil'))).toBe(false);
    expect((s.last('comicsStatus') as { covers: { state: string }[] }).covers[0].state).toBe(
      'nada',
    );
  });
});
