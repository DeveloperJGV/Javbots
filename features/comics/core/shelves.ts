import { fold } from '../../coleccion/core/shelves.js';
import { byTitle, missingNumbers, ownedNumbers } from './series.js';
import { KINDS, type Series } from './types.js';

export { fold };

/** How the shelves are split: by kind (the default: manga, cómic, novela gráfica), by publisher or by genre. */
export const COMIC_GROUPINGS = ['tipo', 'editorial', 'genero'] as const;
export type ComicGrouping = (typeof COMIC_GROUPINGS)[number];
export const DEFAULT_COMIC_GROUPING: ComicGrouping = 'tipo';

export const KIND_NAME: Record<string, string> = {
  manga: 'Manga',
  comic: 'Cómic',
  'novela-grafica': 'Novela gráfica',
};
export const NONE_COMIC_SHELF: Record<ComicGrouping, string> = {
  tipo: 'Sin tipo',
  editorial: 'Sin editorial',
  genero: 'Sin género',
};

export interface ComicShelf {
  key: string;
  name: string;
  /** By title; each one stands as a run of its volumes, missing ones as gaps. */
  series: Series[];
  owned: number;
  missing: number;
}

/** The publisher a series is shelved by: the edition here when there is one, else the original. */
export const shelfPublisher = (s: Series) => s.localPublisher || s.publisher;

export function comicGroupValue(s: Series, by: ComicGrouping): string {
  if (by === 'tipo') return s.kind ? KIND_NAME[s.kind] : '';
  if (by === 'editorial') return shelfPublisher(s);
  return s.genre;
}

const cmp = (a: string, b: string) =>
  a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

/** The shelves: kinds in their order (manga, cómic, novela gráfica), the rest alphabetically, "none" last. */
export function buildComicShelves(list: readonly Series[], by: ComicGrouping): ComicShelf[] {
  const groups = new Map<string, { name: string; series: Series[] }>();
  for (const s of list) {
    const name = comicGroupValue(s, by).trim();
    const key = fold(name);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { name: key ? name : NONE_COMIC_SHELF[by], series: [] }));
    g.series.push(s);
  }
  const kindOrder = (name: string) => {
    const i = KINDS.findIndex((k) => KIND_NAME[k] === name);
    return i < 0 ? KINDS.length : i;
  };
  return [...groups.entries()]
    .sort(([a, ga], [b, gb]) => {
      if (!a || !b) return a ? -1 : b ? 1 : 0;
      return (by === 'tipo' ? kindOrder(ga.name) - kindOrder(gb.name) : 0) || cmp(a, b);
    })
    .map(([key, g]) => {
      const series = [...g.series].sort(byTitle);
      return {
        key,
        name: g.name,
        series,
        owned: series.reduce((n, s) => n + ownedNumbers(s).length, 0),
        missing: series.reduce((n, s) => n + missingNumbers(s).length, 0),
      };
    });
}

/** What a series' run shows, in order: its volumes and the gaps of the missing ones. */
export function runSlots(s: Series): { number: number; owned: boolean }[] {
  const owned = new Set(ownedNumbers(s));
  const missing = new Set(missingNumbers(s));
  // Numbers past the span (a #0, or volumes written down beyond the count) still show
  const all = [...new Set([...owned, ...missing, ...s.volumes.map((v) => v.number)])].sort(
    (a, b) => a - b,
  );
  return all.map((number) => ({ number, owned: owned.has(number) }));
}

export type ComicLitKind = 'autor' | 'editorial';
export interface ComicLit {
  kind: ComicLitKind;
  value: string;
}

const same = (a: string, b: string) => !!fold(a) && fold(a) === fold(b);
export const peopleOf = (s: Series) => [...s.writers, ...s.artists];

export function matchesComicLit(s: Series, lit: ComicLit): boolean {
  if (lit.kind === 'autor') return peopleOf(s).some((p) => same(p, lit.value));
  return same(s.publisher, lit.value) || same(s.localPublisher, lit.value);
}

export type ComicSuggestion =
  { kind: ComicLitKind; value: string; total: number } | { kind: 'series'; series: Series };

function score(text: string, q: string): number {
  const t = fold(text);
  return t.startsWith(q) ? 0 : t.includes(` ${q}`) ? 1 : t.includes(q) ? 2 : -1;
}

/** The search: up to 2 people or publishers, then series by title (or by who made them). Two letters at least. */
export function suggestComics(
  list: readonly Series[],
  query: string,
  limit = 8,
): ComicSuggestion[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const groups = new Map<string, { kind: ComicLitKind; value: string; total: number; s: number }>();
  const add = (kind: ComicLitKind, value: string) => {
    const s = score(value, q);
    if (s < 0) return;
    const key = `${kind}:${fold(value)}`;
    const g = groups.get(key) ?? { kind, value, total: 0, s };
    g.total++;
    groups.set(key, g);
  };
  for (const s of list) {
    for (const p of new Set(peopleOf(s))) add('autor', p);
    for (const p of new Set([s.publisher, s.localPublisher].filter(Boolean))) add('editorial', p);
  }
  const top = [...groups.values()]
    .sort((a, b) => a.s - b.s || b.total - a.total || cmp(a.value, b.value))
    .slice(0, 2)
    .map(({ s: _s, ...g }) => g);
  const found = list
    .map((s) => {
      const t = score(s.title, q);
      const others = peopleOf(s)
        .map((p) => score(p, q))
        .filter((x) => x >= 0);
      return { s, best: t >= 0 ? t : others.length ? 3 + Math.min(...others) : -1 };
    })
    .filter((x) => x.best >= 0)
    .sort((a, b) => a.best - b.best || byTitle(a.s, b.s));
  return [
    ...top,
    ...found
      .slice(0, Math.max(0, limit - top.length))
      .map((x) => ({ kind: 'series' as const, series: x.s })),
  ];
}

/** The whole collection in numbers: series, volumes on the shelf, missing ones. */
export function comicTotals(list: readonly Series[]): {
  series: number;
  owned: number;
  missing: number;
} {
  return {
    series: list.length,
    owned: list.reduce((n, s) => n + ownedNumbers(s).length, 0),
    missing: list.reduce((n, s) => n + missingNumbers(s).length, 0),
  };
}

/** Keyboard moves: left/right between series on a shelf, up/down to the next shelf. */
export function moveSeriesFocus(
  shelves: readonly ComicShelf[],
  currentId: string | null,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
): string | null {
  const rows = shelves.map((s) => s.series).filter((r) => r.length > 0);
  if (!rows.length) return null;
  let r = rows.findIndex((row) => row.some((s) => s.id === currentId));
  if (r < 0) return rows[0][0].id;
  let c = rows[r].findIndex((s) => s.id === currentId);
  const last = rows[r].length - 1;
  if (key === 'ArrowLeft') c = Math.max(0, c - 1);
  else if (key === 'ArrowRight') c = Math.min(last, c + 1);
  else if (key === 'Home') c = 0;
  else if (key === 'End') c = last;
  else {
    const next = r + (key === 'ArrowDown' ? 1 : -1);
    if (next < 0 || next >= rows.length) return currentId;
    const frac = last > 0 ? c / last : 0;
    r = next;
    c = Math.round(frac * (rows[r].length - 1));
  }
  return rows[r][c].id;
}
