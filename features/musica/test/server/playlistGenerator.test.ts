import { describe, expect, it } from 'vitest';

import { PLAYLIST_DURATION_SLACK_MS } from '../../server/constants.js';
import {
  buildPlaylist,
  cleanRecipe,
  DEFAULT_RECIPES,
  inDecades,
  localDay,
  playlistName,
  type PoolSong,
  replaceSong,
} from '../../server/playlists/generator.js';

/** Seeded randomness: the same run every time. */
function seeded(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

const MIN = 60_000;

function song(i: number, over: Partial<PoolSong> = {}): PoolSong {
  const artist = i % 8;
  return {
    uri: `spotify:track:t${i}`,
    title: `Canción ${i}`,
    artist: `Artista ${artist}`,
    artistKey: `artista${artist}`,
    year: 1965 + ((i * 7) % 60),
    durationMs: (150 + ((i * 37) % 180)) * 1000,
    ...over,
  };
}
const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => song(from + i));

const base = {
  discover: [] as PoolSong[],
  discoverShare: 0,
  excluded: new Set<string>(),
  decades: [] as number[],
};

describe('buildPlaylist', () => {
  it.each([30, 60, 120])('lands within the slack of %i minutes', (minutes) => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = buildPlaylist({
        ...base,
        own: many(200),
        targetMs: minutes * MIN,
        rng: seeded(seed),
      });
      expect(Math.abs(r.totalMs - minutes * MIN)).toBeLessThanOrEqual(PLAYLIST_DURATION_SLACK_MS);
      expect(r.note).toBeUndefined();
    }
  });

  it('returns what there is and a note when the material is short', () => {
    const r = buildPlaylist({ ...base, own: many(5), targetMs: 120 * MIN, rng: seeded() });
    expect(r.songs).toHaveLength(5);
    expect(r.note).toMatch(/^Solo alcanzó para \d+ min: agrega más fuentes$/);
  });

  it('never puts the same artist twice in a row when it can be avoided', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = buildPlaylist({ ...base, own: many(200), targetMs: 120 * MIN, rng: seeded(seed) });
      for (let i = 1; i < r.songs.length; i++)
        expect(r.songs[i].artistKey).not.toBe(r.songs[i - 1].artistKey);
    }
  });

  it('drops repeats by uri and by title + artist', () => {
    const a = song(1);
    const sameUri = { ...song(2), uri: a.uri };
    const sameSong = {
      ...song(3),
      uri: 'spotify:track:otra',
      title: ' canción  1 ',
      artist: 'ARTISTA 1',
      artistKey: a.artistKey,
    };
    const r = buildPlaylist({
      ...base,
      own: [a, sameUri, sameSong, a],
      targetMs: 60 * MIN,
      rng: seeded(),
    });
    expect(r.songs.map((s) => s.uri)).toEqual([a.uri]);
  });

  it('leaves out the excluded songs (bin and recent lists)', () => {
    const own = many(60);
    const excluded = new Set(own.slice(0, 50).map((s) => s.uri));
    const r = buildPlaylist({ ...base, own, excluded, targetMs: 120 * MIN, rng: seeded() });
    expect(r.songs.every((s) => !excluded.has(s.uri))).toBe(true);
    expect(r.songs.length).toBeLessThanOrEqual(10);
  });

  it('filters by decade; 1970 also takes everything older; no year = out', () => {
    expect(inDecades(1965, [1970])).toBe(true);
    expect(inDecades(1979, [1970])).toBe(true);
    expect(inDecades(1980, [1970])).toBe(false);
    expect(inDecades(1985, [1980])).toBe(true);
    expect(inDecades(1979, [1980])).toBe(false);
    expect(inDecades(undefined, [1980])).toBe(false);
    expect(inDecades(undefined, [])).toBe(true);
    const own = [...many(200), song(999, { year: undefined })];
    const r = buildPlaylist({ ...base, own, decades: [1970], targetMs: 30 * MIN, rng: seeded() });
    expect(r.songs.length).toBeGreaterThan(0);
    expect(r.songs.every((s) => s.year !== undefined && s.year < 1980)).toBe(true);
    const discover = many(50, 500).map((s) => ({ ...s, year: 2015 }));
    const d = buildPlaylist({
      ...base,
      own,
      discover,
      discoverShare: 0.3,
      decades: [1980],
      targetMs: 30 * MIN,
      rng: seeded(),
    });
    expect(d.songs.every((s) => s.year! >= 1980 && s.year! <= 1989)).toBe(true);
  });

  it('gives about the discover share of the time to new songs, marked as such', () => {
    const discover = many(100, 1000);
    const r = buildPlaylist({
      ...base,
      own: many(200),
      discover,
      discoverShare: 0.3,
      targetMs: 60 * MIN,
      rng: seeded(),
    });
    const fresh = r.songs.filter((s) => s.discover);
    const freshMs = fresh.reduce((t, s) => t + s.durationMs, 0);
    expect(freshMs).toBeGreaterThan(0.3 * 60 * MIN - PLAYLIST_DURATION_SLACK_MS);
    expect(freshMs).toBeLessThan(0.3 * 60 * MIN + PLAYLIST_DURATION_SLACK_MS);
    expect(fresh.every((s) => s.uri.startsWith('spotify:track:t1'))).toBe(true);
    expect(Math.abs(r.totalMs - 60 * MIN)).toBeLessThanOrEqual(PLAYLIST_DURATION_SLACK_MS);
  });

  it('fills with own songs when there is little to discover', () => {
    const r = buildPlaylist({
      ...base,
      own: many(200),
      discover: many(1, 1000),
      discoverShare: 0.3,
      targetMs: 60 * MIN,
      rng: seeded(),
    });
    expect(r.songs.filter((s) => s.discover)).toHaveLength(1);
    expect(Math.abs(r.totalMs - 60 * MIN)).toBeLessThanOrEqual(PLAYLIST_DURATION_SLACK_MS);
  });
});

describe('replaceSong', () => {
  it('swaps a song for one not in the list, of similar length, by another artist than its neighbours', () => {
    const list = [song(1), song(2), song(3)];
    const close = song(50, { durationMs: list[1].durationMs + 1000, artistKey: 'nuevo' });
    const sameArtist = song(51, { durationMs: list[1].durationMs, artistKey: list[0].artistKey });
    const far = song(52, { durationMs: list[1].durationMs + 200_000, artistKey: 'otro' });
    const out = replaceSong(list, list[1].uri, [list[0], sameArtist, far, close], seeded());
    expect(out.map((s) => s.uri)).toEqual([list[0].uri, close.uri, list[2].uri]);
  });

  it('just removes it without candidates', () => {
    const list = [song(1), song(2)];
    expect(replaceSong(list, list[0].uri, [list[1]], seeded())).toEqual([list[1]]);
  });
});

describe('names and recipes', () => {
  it('names the list with the day and short month in Spanish', () => {
    expect(playlistName(new Date(2026, 10, 12, 9), 'Para trabajar')).toBe(
      'Hoy suena · 12 nov · Para trabajar',
    );
    expect(playlistName(new Date(2026, 0, 3), 'X')).toBe('Hoy suena · 3 ene · X');
    expect(localDay(new Date(2026, 10, 2, 23, 59))).toBe('2026-11-02');
  });

  it('cleans recipes from the panel', () => {
    const r = cleanRecipe({
      id: 'a',
      name: '  Una   receta con un nombre larguísimo que no cabe entero ',
      top: true,
      playlists: Array.from({ length: 30 }, (_, i) => `l${i}`),
      artists: Array.from({ length: 8 }, (_, i) => ({ id: `ar${i}`, name: `Artista ${i}` })),
      decades: [1980, 1975, 1970, 1980, 2030],
      minutes: 45,
      discover: 'sí',
    });
    expect(r?.name).toHaveLength(40);
    expect(r?.playlists).toHaveLength(20);
    expect(r?.artists).toHaveLength(5);
    expect(r?.decades).toEqual([1970, 1980]);
    expect(r?.minutes).toBe(60);
    expect(r?.discover).toBe(false);
    expect(cleanRecipe({ name: 'Sin fuentes', minutes: 30 })).toBeNull();
    expect(cleanRecipe({ top: true })).toBeNull();
    expect(cleanRecipe('x')).toBeNull();
  });

  it('ships valid default recipes', () => {
    expect(DEFAULT_RECIPES).toHaveLength(4);
    for (const r of DEFAULT_RECIPES) expect(cleanRecipe(r)).toEqual(r);
    expect(new Set(DEFAULT_RECIPES.map((r) => r.id)).size).toBe(4);
  });
});
