import { describe, expect, it } from 'vitest';

import {
  agoText,
  buildShelves,
  emptyGame,
  type Game,
  gameFileContent,
  knownSeries,
  mergeSave,
  moveFocus,
  normalizeGame,
  readCollection,
  seriesMembers,
  shelfItems,
  suggest,
  tonightPicks,
  topPlatform,
  totals,
} from '../../core/index.js';

const TODAY = '2026-11-13';
let n = 0;
const game = (title: string, platform: string, extra: Partial<Game> = {}): Game => ({
  ...emptyGame('2026-01-01', platform),
  id: `g${String(++n).padStart(4, '0')}`,
  title,
  ...extra,
});

describe('coleccion core: the file format', () => {
  it('reads a game leniently and keeps what it does not know', () => {
    const r = normalizeGame(
      {
        id: 'abcd1234',
        title: '  Neón   Rally  ',
        platform: 'GC',
        region: 'pal',
        condition: 'roto',
        players: 12,
        coop: true,
        futuro: { x: 1 },
        barcode: '0 13388-26014 7',
      },
      TODAY,
    );
    expect(r?.game).toMatchObject({
      id: 'abcd1234',
      title: 'Neón Rally',
      platform: 'gc',
      region: 'pal',
      condition: '',
      players: 8,
      coop: true,
      addedAt: TODAY,
      barcode: '013388260147',
    });
    expect(r?.unknown).toEqual({ futuro: { x: 1 } });
    expect(gameFileContent(r!.game, r!.unknown).futuro).toEqual({ x: 1 });
  });

  it('a wanted gap carries no copy details', () => {
    const r = normalizeGame(
      {
        title: 'X',
        platform: 'nes',
        wanted: true,
        condition: 'sellado',
        progress: 'a-medias',
        price: '$300',
      },
      TODAY,
    );
    expect(r?.game).toMatchObject({ wanted: true, condition: '', progress: '', price: '$300' });
  });

  it('reads a whole file: bad rows reported, missing and repeated ids replaced', () => {
    const r = readCollection(
      {
        version: 1,
        extra: 'keep',
        games: [
          { id: 'aaaa1', title: 'Uno', platform: 'nes' },
          7,
          { id: 'aaaa1', title: 'Dos' },
          { title: '' },
        ],
        trash: [{ id: 'old' }],
      },
      TODAY,
    );
    expect(r.games.map((g) => g.game.id)).toEqual(['aaaa1', 'x0002', 'x0003']);
    expect(r.games[2].game.title).toBe('Juego sin nombre');
    expect(r.unknown).toEqual({ extra: 'keep' });
    expect(r.trash).toHaveLength(1);
    expect(r.problems.some((p) => p.includes('renglón 2'))).toBe(true);
  });

  it('is not a collection', () => {
    expect(readCollection([1, 2], TODAY).problems).toEqual(['El archivo no es una colección.']);
  });

  it('a gap that becomes a game comes in today; an edit keeps id and date', () => {
    const before = game('Capitán Cohete 3', 'n64', { wanted: true, addedAt: '2026-02-02' });
    const got = mergeSave(before, { ...before, wanted: false, id: 'other' }, TODAY, 'T');
    expect(got).toMatchObject({ id: before.id, wanted: false, addedAt: TODAY, updatedAt: 'T' });
    const edit = mergeSave(got, { ...got, notes: 'hola' }, '2027-01-01', 'T2');
    expect(edit.addedAt).toBe(TODAY);
  });
});

describe('coleccion core: shelves, series and search', () => {
  const games = [
    game('Neón Rally', 'gc', { series: 'Neón Rally' }),
    game('Neón Rally 2', 'x360', { series: 'neon rally' }),
    game('Neón Rally 3', 'x360', { series: 'Neón Rally', wanted: true, price: '$400' }),
    game('Ábaco Quest', 'x360', { progress: 'a-medias' }),
    game('Zeta Kart', 'x360'),
    game('Rarito', 'pc98'),
  ];

  it('one shelf per platform in rail order, unknown ones last, series first', () => {
    const shelves = buildShelves(games, true);
    expect(shelves.map((s) => s.platform)).toEqual(['gc', 'x360', 'pc98']);
    const x360 = shelves[1];
    expect(x360).toMatchObject({ owned: 3, wanted: 1, halfway: 1, name: 'Xbox 360' });
    expect(x360.runs[0].series).toBe('neon rally');
    expect(shelfItems(x360).map((g) => g.title)).toEqual([
      'Neón Rally 2',
      'Neón Rally 3',
      'Ábaco Quest',
      'Zeta Kart',
    ]);
    expect(shelfItems(buildShelves(games, false)[1])[0].title).toBe('Ábaco Quest');
  });

  it('series across shelves, suggestions and totals', () => {
    expect(seriesMembers(games, 'NEON RALLY').map((g) => g.platform)).toEqual([
      'gc',
      'x360',
      'x360',
    ]);
    const s = suggest(games, 'neon');
    expect(s[0]).toMatchObject({ kind: 'series', owned: 2, total: 3 });
    expect(s.filter((x) => x.kind === 'game')).toHaveLength(3);
    expect(suggest(games, 'n')).toEqual([]);
    expect(suggest(games, 'kart')[0]).toMatchObject({ kind: 'game' });
    expect(knownSeries(games)[0].toLowerCase()).toContain('rally');
    expect(totals(games)).toEqual({ owned: 5, wanted: 1, platforms: 3 });
    expect(topPlatform(buildShelves(games, true))).toBeNull();
  });

  it('keyboard: left/right inside a shelf, up/down to the next one', () => {
    const shelves = buildShelves(games, true);
    const first = moveFocus(shelves, null, 'ArrowRight');
    expect(first).toBe(shelfItems(shelves[0])[0].id);
    const down = moveFocus(shelves, first, 'ArrowDown');
    expect(down).toBe(shelfItems(shelves[1])[0].id);
    expect(moveFocus(shelves, down, 'ArrowRight')).toBe(shelfItems(shelves[1])[1].id);
    expect(moveFocus(shelves, down, 'End')).toBe(shelfItems(shelves[1])[3].id);
    expect(moveFocus(shelves, down, 'ArrowLeft')).toBe(down);
    expect(moveFocus(shelves, first, 'ArrowUp')).toBe(first);
    expect(moveFocus([], null, 'ArrowDown')).toBeNull();
  });
});

describe('coleccion core: ¿Qué jugamos hoy?', () => {
  const games = [
    game('A medias vieja', 'gc', {
      progress: 'a-medias',
      lastPlayed: '2025-01-01',
      players: 2,
      coop: true,
    }),
    game('A medias nueva', 'gc', { progress: 'a-medias', lastPlayed: '2026-11-01', players: 2 }),
    game('A medias larga', 'gc', { progress: 'a-medias', length: 'tarde', players: 2 }),
    game('Sellado', 'x360', { condition: 'sellado', addedAt: '2026-03-01' }),
    game('Para uno', 'x360', { progress: 'a-medias', players: 1 }),
    game('Buscado', 'x360', { wanted: true, progress: '' }),
  ];

  it('filters by players, time and mood; oldest left first; coop first for two', () => {
    const r = tonightPicks(
      games,
      { players: 2, time: '1h', mood: 'medias', platform: '' },
      0,
      TODAY,
    );
    expect(r.picks.map((p) => p.game.title)).toEqual(['A medias vieja', 'A medias nueva']);
    expect(r.picks[1].why).toBe('Se quedó a medias hace 12 días.');
    const tarde = tonightPicks(
      games,
      { players: 2, time: 'tarde', mood: 'medias', platform: '' },
      0,
      TODAY,
    );
    expect(tarde.total).toBe(3);
  });

  it('new ones, console filter, rounds wrap, nothing fits', () => {
    const nuevo = tonightPicks(
      games,
      { players: 1, time: 'rato', mood: 'nuevo', platform: 'x360' },
      0,
      TODAY,
    );
    expect(nuevo.picks[0]).toMatchObject({ why: 'Sigue sellado. Hoy se abre.' });
    const any = {
      players: 1 as const,
      time: 'tarde' as const,
      mood: 'cualquiera' as const,
      platform: '',
    };
    const r0 = tonightPicks(games, any, 0, TODAY);
    expect(r0.total).toBe(5);
    expect(tonightPicks(games, any, 2, TODAY).picks).toEqual(r0.picks);
    expect(tonightPicks(games, { ...any, players: 4 }, 0, TODAY)).toEqual({ picks: [], total: 0 });
  });

  it('says how long ago', () => {
    expect(agoText('', TODAY)).toBe('nunca');
    expect(agoText(TODAY, TODAY)).toBe('hoy');
    expect(agoText('2026-10-01', TODAY)).toBe('hace 6 semanas');
    expect(agoText('2024-01-01', TODAY)).toBe('hace 3 años');
  });
});
