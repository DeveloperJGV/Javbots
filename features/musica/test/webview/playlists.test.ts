import { describe, expect, it } from 'vitest';

import type { PlaylistDay, PlaylistStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance } from '../../../../webview-ui/src/office/types.js';
import { PLAYLIST_PRESS_COLORS } from '../../webview/constants.js';
import { PRESS_BLINK_SEC, PRESS_WINDOW } from '../../webview/playlists/constants.js';
import {
  applyPlaylistFurniture,
  pressLitSprite,
  pressWorking,
} from '../../webview/playlists/playlistFurniture.js';
import { playlistPieceOf, playlistStore } from '../../webview/playlists/playlistStore.js';
import {
  canBuild,
  dayLabel,
  draftSongs,
  durationText,
  emptyRecipe,
  keptLists,
  localDay,
  myLists,
  pendingLists,
  previewLength,
  recipeSummary,
  roundedDuration,
  songDuration,
  todayLists,
  toggleArtist,
  toggleDecade,
  togglePlaylist,
} from '../../webview/playlists/playlistText.js';

const list = (id: string, day: string, kept = false): PlaylistDay => ({
  id,
  name: `Lista ${id}`,
  day,
  kept,
  count: 15,
  totalMs: 3_500_000,
});

const LISTS = [
  list('a', '2026-11-10'),
  list('b', '2026-11-11'),
  list('c', '2026-11-12'),
  list('d', '2026-11-09', true),
  list('e', '2026-11-11', true),
];

describe('playlist texts', () => {
  it('writes lengths as digital numbers', () => {
    expect(durationText(58 * 60_000)).toBe('58 min');
    expect(durationText(62 * 60_000)).toBe('1 h 02 min');
    expect(durationText(60 * 60_000)).toBe('1 h');
    expect(durationText(125 * 60_000 + 20_000)).toBe('2 h 05 min');
    expect(durationText(0)).toBe('0 min');
    expect(songDuration(187_000)).toBe('3:07');
    expect(songDuration(59_600)).toBe('1:00');
  });

  it('speaks the preview in the length that was picked, the exact one only as an extra', () => {
    expect(previewLength(16, 62 * 60_000, 60 * 60_000)).toEqual({
      main: '16 canciones · 1 h',
      exact: 'dura 1 h 02 min',
    });
    expect(previewLength(8, 30 * 60_000 + 10_000, 30 * 60_000)).toEqual({
      main: '8 canciones · 30 min',
      exact: null,
    });
    expect(previewLength(1, 4 * 60_000, 120 * 60_000).main).toBe('1 canción · 2 h');
  });

  it('labels days in Spanish and reads the local day', () => {
    expect(dayLabel('2026-11-12')).toBe('12 nov');
    expect(dayLabel('2026-01-05')).toBe('5 ene');
    expect(localDay(new Date(2026, 10, 12, 23, 59))).toBe('2026-11-12');
    expect(localDay(new Date(2026, 0, 3, 0, 1))).toBe('2026-01-03');
  });

  it('splits lists into pending, today and kept', () => {
    expect(pendingLists(LISTS, '2026-11-12').map((l) => l.id)).toEqual(['a', 'b']);
    expect(todayLists(LISTS, '2026-11-12').map((l) => l.id)).toEqual(['c']);
    expect(keptLists(LISTS).map((l) => l.id)).toEqual(['e', 'd']);
  });

  it('moves today’s list to pending when the day changes', () => {
    const before = localDay(new Date(2026, 10, 12, 23, 59));
    const after = localDay(new Date(2026, 10, 13, 0, 1));
    expect(todayLists(LISTS, before).map((l) => l.id)).toEqual(['c']);
    expect(todayLists(LISTS, after)).toEqual([]);
    expect(pendingLists(LISTS, after).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });

  it('summarizes a recipe in one line', () => {
    const r = {
      ...emptyRecipe(),
      playlists: ['p1', 'p2'],
      decades: [1990, 1980],
      discover: true,
    };
    expect(recipeSummary(r, [])).toBe(
      'Lo que más escucho + 2 listas · 80s, 90s · 1 h · con algo para descubrir',
    );
    const one = {
      ...emptyRecipe(),
      top: false,
      liked: true,
      playlists: ['p1'],
      artists: [{ id: 'x', name: 'Zoé' }],
      decades: [1970],
      minutes: 30,
    };
    expect(recipeSummary(one, [{ id: 'p1', name: 'Domingo' }])).toBe(
      'Mis me gusta + Domingo + Zoé · 70s y antes · 30 min · solo lo mío',
    );
    expect(recipeSummary({ ...emptyRecipe(), minutes: 120 }, [])).toBe(
      'Lo que más escucho · cualquier década · 2 h · solo lo mío',
    );
  });

  it('starts "a mi gusto" from the top songs, 1 h, without repeats', () => {
    const r = emptyRecipe();
    expect(r).toMatchObject({ top: true, minutes: 60, discover: false, avoidRecent: true });
    expect(r.playlists).toEqual([]);
    expect(emptyRecipe()).not.toBe(r);
  });

  it('toggles sources and decades without touching the original', () => {
    const r = emptyRecipe();
    const withList = togglePlaylist(r, 'p1');
    expect(withList.playlists).toEqual(['p1']);
    expect(r.playlists).toEqual([]);
    expect(togglePlaylist(withList, 'p1').playlists).toEqual([]);

    const zoe = { id: 'z', name: 'Zoé' };
    const withArtist = toggleArtist(r, zoe);
    expect(withArtist.artists).toEqual([zoe]);
    expect(r.artists).toEqual([]);
    expect(toggleArtist(withArtist, zoe).artists).toEqual([]);

    const d = toggleDecade(toggleDecade(r, 1990), 1980);
    expect(d.decades).toEqual([1980, 1990]);
    expect(r.decades).toEqual([]);
    expect(toggleDecade(d, 1990).decades).toEqual([1980]);
  });

  it('builds only with at least one source', () => {
    const none = { ...emptyRecipe(), top: false };
    expect(canBuild(none)).toBe(false);
    expect(canBuild(emptyRecipe())).toBe(true);
    expect(canBuild({ ...none, liked: true })).toBe(true);
    expect(canBuild({ ...none, surprise: true })).toBe(true);
    expect(canBuild(togglePlaylist(none, 'p'))).toBe(true);
    expect(canBuild(toggleArtist(none, { id: 'a', name: 'A' }))).toBe(true);
    expect(canBuild(toggleDecade(none, 1980))).toBe(false);
  });
});

describe('playlist store', () => {
  const status: PlaylistStatus = {
    type: 'playlistStatus',
    configured: true,
    connected: true,
    needsReconnect: false,
    playlists: [],
    artists: [],
    recipes: [],
    lists: LISTS,
    rejected: [],
    autoPlay: false,
  };

  it('opens on a tab, keeps it and closes', () => {
    let calls = 0;
    const off = playlistStore.subscribe(() => calls++);
    expect(playlistStore.get().open).toBe(false);
    playlistStore.open('bote');
    expect(playlistStore.get()).toMatchObject({ open: true, tab: 'bote' });
    playlistStore.close();
    playlistStore.open();
    expect(playlistStore.get()).toMatchObject({ open: true, tab: 'bote' });
    playlistStore.setTab('repisa');
    expect(playlistStore.get().tab).toBe('repisa');
    playlistStore.open('armar');
    expect(playlistStore.get().tab).toBe('armar');
    playlistStore.close();
    expect(playlistStore.get().open).toBe(false);
    off();
    expect(calls).toBe(6);
  });

  it('takes the status from the server', () => {
    playlistStore.setStatus(status);
    expect(playlistStore.get().status).toBe(status);
  });

  it('knows the pieces of the playlist corner', () => {
    expect(playlistPieceOf('MUSICA_PLAYLIST_PRESS')).toBe('press');
    expect(playlistPieceOf('MUSICA_PLAYLIST_REJECT_BIN:left')).toBe('bin');
    expect(playlistPieceOf('MUSICA_PLAYLIST_NEON')).toBe('neon');
    expect(playlistPieceOf('JUKEBOX')).toBeNull();
    expect(playlistPieceOf(undefined)).toBeNull();
  });
});

describe('the record press', () => {
  /** Any painted pixel (the lit window only repaints painted ones). */
  const PAINTED = 'painted';
  const sprite = (): string[][] =>
    Array.from({ length: 48 }, (_, y) =>
      Array.from({ length: 32 }, (_, x) => (y === 12 && x === 20 ? '' : y > 10 ? PAINTED : '')),
    );
  const press = (type = 'MUSICA_PLAYLIST_PRESS') =>
    ({ type, sprite: sprite(), x: 0, y: 0, zY: 0 }) as unknown as FurnitureInstance;
  const busy = (b?: PlaylistStatus['busy']) => ({ busy: b }) as unknown as PlaylistStatus;

  it('works only while building or creating', () => {
    expect(pressWorking(undefined)).toBe(false);
    expect(pressWorking(busy())).toBe(false);
    expect(pressWorking(busy('sources'))).toBe(false);
    expect(pressWorking(busy('deleting'))).toBe(false);
    expect(pressWorking(busy('preview'))).toBe(true);
    expect(pressWorking(busy('creating'))).toBe(true);
  });

  it('lights only the painted pixels of its window', () => {
    const base = sprite();
    const lit = pressLitSprite(base);
    expect(lit[PRESS_WINDOW.y0 + 2][PRESS_WINDOW.x0 + 2]).toBe(PLAYLIST_PRESS_COLORS.on);
    expect(lit[PRESS_WINDOW.y0 + 1][PRESS_WINDOW.x0 + 1]).toBe(PLAYLIST_PRESS_COLORS.onShine);
    expect(lit[PRESS_WINDOW.y1 + 1][PRESS_WINDOW.x0]).toBe(PAINTED);
    expect(lit[5][PRESS_WINDOW.x0]).toBe('');
    expect(base[PRESS_WINDOW.y0 + 2][PRESS_WINDOW.x0 + 2]).toBe(PAINTED);
  });

  it('blinks the press and leaves other furniture alone', () => {
    const items = [press(), press('JUKEBOX')];
    expect(applyPlaylistFurniture(items, busy(), 0)).toBe(items);
    const on = applyPlaylistFurniture(items, busy('preview'), 0);
    expect(on[0].sprite[PRESS_WINDOW.y0 + 2][PRESS_WINDOW.x0 + 2]).toBe(PLAYLIST_PRESS_COLORS.on);
    expect(on[1]).toBe(items[1]);
    expect(applyPlaylistFurniture(items, busy('creating'), PRESS_BLINK_SEC)).toBe(items);
  });
});

describe('Mis listas (text)', () => {
  it('rounds a list length to half hours, never "43 min"', () => {
    expect(roundedDuration(43 * 60_000)).toBe('30 min');
    expect(roundedDuration(10 * 60_000)).toBe('30 min');
    expect(roundedDuration(46 * 60_000)).toBe('1 h');
    expect(roundedDuration(62 * 60_000)).toBe('1 h');
    expect(roundedDuration(80 * 60_000)).toBe('1 h 30 min');
    expect(roundedDuration(118 * 60_000)).toBe('2 h');
  });

  it('lists every list newest first and keeps the edit draft in order', () => {
    const lists = [list('a', '2026-11-10', true), list('b', '2026-11-12'), list('c', '2026-11-11')];
    expect(myLists(lists).map((l) => l.id)).toEqual(['b', 'c', 'a']);
    const known = [
      { uri: 'u1', n: 1 },
      { uri: 'u2', n: 2 },
      { uri: 'u3', n: 3 },
    ];
    expect(draftSongs(['u3', 'u1', 'x'], known).map((s) => s.n)).toEqual([3, 1]);
  });

  it('keeps what was typed in "Dime qué quieres"', () => {
    playlistStore.setDraft({ text: 'jazz de los 60', minutes: 30 });
    expect(playlistStore.get().draft).toEqual({
      text: 'jazz de los 60',
      minutes: 30,
      avoidRecent: true,
    });
    playlistStore.close();
    expect(playlistStore.get().draft.text).toBe('jazz de los 60');
  });
});
