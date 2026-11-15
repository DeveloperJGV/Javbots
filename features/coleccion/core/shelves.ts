import { byTitle } from './game.js';
import { platformById, platformOrder, PLATFORMS } from './platforms.js';
import type { Game } from './types.js';

/** A run of a shelf: a series with 2+ items (with its plaque) or a single loose item. */
export type ShelfRun = { series: string; items: Game[] } | { series: null; items: [Game] };

export interface Shelf {
  platform: string;
  name: string;
  era: string;
  cartridge: boolean;
  runs: ShelfRun[];
  /** Games owned on this shelf (not counting wanted gaps). */
  owned: number;
  wanted: number;
  halfway: number;
}

/** Lowercase, accents and punctuation out: what the search compares. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/**
 * The shelves, one per platform that has something (rail order; ids the office doesn't know go last, named by
 * their id). Inside, by title; with `bySeries`, the series with two or more items come first, together.
 */
export function buildShelves(games: readonly Game[], bySeries: boolean): Shelf[] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const key = g.platform || 'otra';
    let list = groups.get(key);
    if (!list) groups.set(key, (list = []));
    list.push(g);
  }
  const ids = [...groups.keys()].sort(
    (a, b) => platformOrder(a) - platformOrder(b) || a.localeCompare(b),
  );
  return ids.map((id) => {
    const list = [...(groups.get(id) ?? [])].sort(byTitle);
    const p = platformById(id);
    return {
      platform: id,
      name: p?.name ?? (id === 'otra' ? 'Sin consola' : id),
      era: p?.era ?? 'Otras',
      cartridge: p?.cartridge ?? false,
      runs: shelfRuns(list, bySeries),
      owned: list.filter((g) => !g.wanted).length,
      wanted: list.filter((g) => g.wanted).length,
      halfway: list.filter((g) => !g.wanted && g.progress === 'a-medias').length,
    };
  });
}

function shelfRuns(sorted: Game[], bySeries: boolean): ShelfRun[] {
  if (!bySeries) return sorted.map((g) => ({ series: null, items: [g] }));
  const bySeriesName = new Map<string, Game[]>();
  for (const g of sorted) {
    const key = fold(g.series);
    if (!key) continue;
    let list = bySeriesName.get(key);
    if (!list) bySeriesName.set(key, (list = []));
    list.push(g);
  }
  const runs: ShelfRun[] = [];
  const grouped = new Set<string>();
  const seriesKeys = [...bySeriesName.entries()]
    .filter(([, l]) => l.length > 1)
    .sort(([, a], [, b]) => a[0].series.localeCompare(b[0].series, 'es', { sensitivity: 'base' }));
  for (const [, list] of seriesKeys) {
    runs.push({ series: list[0].series, items: list });
    for (const g of list) grouped.add(g.id);
  }
  for (const g of sorted) if (!grouped.has(g.id)) runs.push({ series: null, items: [g] });
  return runs;
}

/** The items of a shelf in the order they stand (for the keyboard and "next / previous"). */
export const shelfItems = (shelf: Shelf): Game[] => shelf.runs.flatMap((r) => r.items);

/** Whether two series names are the same series (accents and case ignored). */
export const sameSeries = (a: string, b: string): boolean => !!fold(a) && fold(a) === fold(b);

/** Everything of one series, across shelves (owned and wanted), in rail order then title. */
export function seriesMembers(games: readonly Game[], series: string): Game[] {
  return games
    .filter((g) => sameSeries(g.series, series))
    .sort((a, b) => platformOrder(a.platform) - platformOrder(b.platform) || byTitle(a, b));
}

export type Suggestion =
  { kind: 'series'; series: string; owned: number; total: number } | { kind: 'game'; game: Game };

/**
 * What the search box offers: up to 2 series whose name matches, then games whose title (or series) matches, the
 * ones starting with the text first. Two letters at least.
 */
export function suggest(games: readonly Game[], query: string, limit = 8): Suggestion[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const seriesSeen = new Map<string, { series: string; owned: number; total: number }>();
  for (const g of games) {
    const key = fold(g.series);
    if (!key || !key.includes(q)) continue;
    const s = seriesSeen.get(key) ?? { series: g.series, owned: 0, total: 0 };
    s.total++;
    if (!g.wanted) s.owned++;
    seriesSeen.set(key, s);
  }
  const series = [...seriesSeen.values()]
    .sort((a, b) => a.series.localeCompare(b.series, 'es'))
    .slice(0, 2)
    .map((s) => ({ kind: 'series' as const, ...s }));
  const scored = games
    .map((g) => {
      const t = fold(g.title);
      const score = t.startsWith(q) ? 0 : t.includes(` ${q}`) ? 1 : t.includes(q) ? 2 : -1;
      return { g, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || byTitle(a.g, b.g));
  return [
    ...series,
    ...scored.slice(0, limit - series.length).map((x) => ({ kind: 'game' as const, game: x.g })),
  ];
}

/** Series names already used, for the form's hints (most used first). */
export function knownSeries(games: readonly Game[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  for (const g of games) {
    const key = fold(g.series);
    if (!key) continue;
    const c = count.get(key) ?? { name: g.series, n: 0 };
    c.n++;
    count.set(key, c);
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'))
    .map((c) => c.name);
}

/** The whole collection in numbers, for the header. */
export function totals(games: readonly Game[]): {
  owned: number;
  wanted: number;
  platforms: number;
} {
  const owned = games.filter((g) => !g.wanted);
  return {
    owned: owned.length,
    wanted: games.length - owned.length,
    platforms: new Set(owned.map((g) => g.platform)).size,
  };
}

/** The platform with the most games (it gets the lit shelf), if it clearly leads: 5+ games. */
export function topPlatform(shelves: readonly Shelf[]): string | null {
  let best: Shelf | null = null;
  for (const s of shelves) if (!best || s.owned > best.owned) best = s;
  return best && best.owned >= 5 ? best.platform : null;
}

/** Platforms with no shelf yet, for the "first game of…" buttons. */
export const emptyPlatforms = (shelves: readonly Shelf[]) =>
  PLATFORMS.filter((p) => !shelves.some((s) => s.platform === p.id));

/** Keyboard moves on the shelves: left/right inside a shelf, up/down to the same spot of the next shelf. */
export function moveFocus(
  shelves: readonly Shelf[],
  currentId: string | null,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
): string | null {
  const rows = shelves.map(shelfItems).filter((r) => r.length > 0);
  if (!rows.length) return null;
  let r = rows.findIndex((row) => row.some((g) => g.id === currentId));
  if (r < 0) return rows[0][0].id;
  const row = rows[r];
  let c = row.findIndex((g) => g.id === currentId);
  switch (key) {
    case 'ArrowLeft':
      c = Math.max(0, c - 1);
      break;
    case 'ArrowRight':
      c = Math.min(row.length - 1, c + 1);
      break;
    case 'Home':
      c = 0;
      break;
    case 'End':
      c = row.length - 1;
      break;
    case 'ArrowUp':
    case 'ArrowDown': {
      const next = r + (key === 'ArrowDown' ? 1 : -1);
      if (next < 0 || next >= rows.length) return currentId;
      // Same proportion along the shelf, so long and short shelves line up
      const frac = row.length > 1 ? c / (row.length - 1) : 0;
      r = next;
      c = Math.round(frac * (rows[r].length - 1));
      break;
    }
  }
  return rows[r][c].id;
}
