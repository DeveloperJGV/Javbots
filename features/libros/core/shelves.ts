import { fold } from '../../coleccion/core/shelves.js';
import { byTitle } from './book.js';
import { genreOrder } from './genres.js';
import type { Book } from './types.js';

export { fold };

/** How the shelves are split: by genre (the default), by first author, by publisher or by saga. */
export const GROUPINGS = ['genero', 'autor', 'editorial', 'saga'] as const;
export type Grouping = (typeof GROUPINGS)[number];
export const DEFAULT_GROUPING: Grouping = 'genero';

/** A run of a shelf: a saga with 2+ books together (with its plaque) or a single book. */
export type ShelfRun = { series: string; items: Book[] } | { series: null; items: [Book] };

export interface Shelf {
  /** What the shelf groups by, folded ("" = the shelf of the ones that do not say). */
  key: string;
  name: string;
  runs: ShelfRun[];
  /** Books on the shelf (not counting wanted gaps). */
  owned: number;
  wanted: number;
  /** Being read now. */
  reading: number;
}

/** The name of the shelf of books that do not say it, by grouping. */
export const NONE_SHELF: Record<Grouping, string> = {
  genero: 'Sin género',
  autor: 'Sin autor',
  editorial: 'Sin editorial',
  saga: 'Sin saga',
};

/** What a book is grouped by, as written. */
export function groupValue(book: Book, by: Grouping): string {
  switch (by) {
    case 'genero':
      return book.genre;
    case 'autor':
      return book.authors[0] ?? '';
    case 'editorial':
      return book.publisher;
    case 'saga':
      return book.series;
  }
}

const cmp = (a: string, b: string) =>
  a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true });

/** Inside a shelf: by first author, then saga and its number, then title (a saga with no numbers: by title). */
function shelfOrder(by: Grouping) {
  return (a: Book, b: Book): number => {
    if (by === 'saga')
      return (
        (a.seriesNumber || 1e6) - (b.seriesNumber || 1e6) ||
        (a.year || 1e6) - (b.year || 1e6) ||
        byTitle(a, b)
      );
    return (
      blankLast(fold(a.authors[0] ?? ''), fold(b.authors[0] ?? '')) ||
      blankLast(fold(a.series), fold(b.series)) ||
      (a.seriesNumber || 1e6) - (b.seriesNumber || 1e6) ||
      byTitle(a, b)
    );
  };
}

/** Alphabetical, with "not said" after everything. */
function blankLast(a: string, b: string): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  return cmp(a, b);
}

/** Books of one saga that stand together become one run with its plaque (not on a saga's own shelf). */
function shelfRuns(sorted: Book[], by: Grouping): ShelfRun[] {
  const runs: ShelfRun[] = [];
  let i = 0;
  while (i < sorted.length) {
    const key = fold(sorted[i].series);
    let j = i + 1;
    if (by !== 'saga' && key) while (j < sorted.length && fold(sorted[j].series) === key) j++;
    if (j - i >= 2) runs.push({ series: sorted[i].series, items: sorted.slice(i, j) });
    else for (let k = i; k < j; k++) runs.push({ series: null, items: [sorted[k]] });
    i = j;
  }
  return runs;
}

/**
 * The shelves: one per genre (or author, publisher, saga) that has something. Genres stand in the order of
 * core/genres.ts and the rest alphabetically; the books that do not say go on the last shelf.
 */
export function buildShelves(books: readonly Book[], by: Grouping): Shelf[] {
  const groups = new Map<string, { name: string; list: Book[] }>();
  for (const b of books) {
    const name = groupValue(b, by).trim();
    const key = fold(name);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { name: key ? name : NONE_SHELF[by], list: [] }));
    g.list.push(b);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    if (by === 'genero') {
      const d = genreOrder(groups.get(a)!.name) - genreOrder(groups.get(b)!.name);
      if (d) return d;
    }
    return cmp(a, b);
  });
  return keys.map((key) => {
    const { name, list } = groups.get(key)!;
    const sorted = [...list].sort(shelfOrder(by));
    return {
      key,
      name,
      runs: shelfRuns(sorted, by),
      owned: sorted.filter((b) => !b.wanted).length,
      wanted: sorted.filter((b) => b.wanted).length,
      reading: sorted.filter((b) => !b.wanted && b.reading === 'leyendo').length,
    };
  });
}

/** The books of a shelf in the order they stand (for the keyboard and "next / previous"). */
export const shelfItems = (shelf: Shelf): Book[] => shelf.runs.flatMap((r) => r.items);

/** Whether two names are the same (accents, case and punctuation ignored). */
export const sameName = (a: string, b: string): boolean => !!fold(a) && fold(a) === fold(b);

/** Every book of one saga (owned and wanted), by its number, then year and title. */
export function seriesMembers(books: readonly Book[], series: string): Book[] {
  return books.filter((b) => sameName(b.series, series)).sort(shelfOrder('saga'));
}

/** What the search lights on every shelf: an author's books, a saga or a publisher. */
export type LitKind = 'autor' | 'saga' | 'editorial';
export interface Lit {
  kind: LitKind;
  value: string;
}

export function matchesLit(book: Book, lit: Lit): boolean {
  if (lit.kind === 'autor') return book.authors.some((a) => sameName(a, lit.value));
  if (lit.kind === 'saga') return sameName(book.series, lit.value);
  return sameName(book.publisher, lit.value);
}

export type Suggestion =
  { kind: LitKind; value: string; owned: number; total: number } | { kind: 'book'; book: Book };

/** A text includes the query at a word start (0), inside a word (1), or not at all (-1); 2 = starts with it. */
function score(text: string, q: string): number {
  const t = fold(text);
  return t.startsWith(q) ? 0 : t.includes(` ${q}`) ? 1 : t.includes(q) ? 2 : -1;
}

/**
 * What the search box offers: up to 3 groups (an author, a saga, a publisher whose name matches), then books
 * whose title, author or saga matches, the ones whose title starts with the text first. Two letters at least.
 */
export function suggest(books: readonly Book[], query: string, limit = 8): Suggestion[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const groups = new Map<
    string,
    { kind: LitKind; value: string; owned: number; total: number; s: number }
  >();
  const add = (kind: LitKind, value: string, b: Book) => {
    const s = score(value, q);
    if (s < 0) return;
    const key = `${kind}:${fold(value)}`;
    const g = groups.get(key) ?? { kind, value, owned: 0, total: 0, s };
    g.total++;
    if (!b.wanted) g.owned++;
    groups.set(key, g);
  };
  for (const b of books) {
    for (const a of b.authors) add('autor', a, b);
    if (b.series) add('saga', b.series, b);
    if (b.publisher) add('editorial', b.publisher, b);
  }
  const top = [...groups.values()]
    .sort((a, b) => a.s - b.s || b.total - a.total || cmp(a.value, b.value))
    .slice(0, 3)
    .map(({ s: _s, ...g }) => g);
  const scored = books
    .map((b) => {
      const t = score(b.title, q);
      const others = [...b.authors, b.series].map((x) => score(x, q)).filter((x) => x >= 0);
      const best = t >= 0 ? t : others.length ? 3 + Math.min(...others) : -1;
      return { b, best };
    })
    .filter((x) => x.best >= 0)
    .sort((a, b) => a.best - b.best || byTitle(a.b, b.b));
  return [
    ...top,
    ...scored
      .slice(0, Math.max(0, limit - top.length))
      .map((x) => ({ kind: 'book' as const, book: x.b })),
  ];
}

/** Values already used in a field, for the form's hints (most used first). */
export function knownValues(
  books: readonly Book[],
  pick: (b: Book) => readonly string[],
): string[] {
  const seen = new Map<string, { name: string; n: number }>();
  for (const b of books)
    for (const v of pick(b)) {
      const key = fold(v);
      if (!key) continue;
      const c = seen.get(key) ?? { name: v, n: 0 };
      c.n++;
      seen.set(key, c);
    }
  return [...seen.values()].sort((a, b) => b.n - a.n || cmp(a.name, b.name)).map((c) => c.name);
}

/** The whole library in numbers, for the header. */
export function totals(books: readonly Book[]): {
  owned: number;
  wanted: number;
  reading: number;
  lent: number;
  authors: number;
} {
  const owned = books.filter((b) => !b.wanted);
  return {
    owned: owned.length,
    wanted: books.length - owned.length,
    reading: owned.filter((b) => b.reading === 'leyendo').length,
    lent: owned.filter((b) => b.lentTo).length,
    authors: new Set(owned.flatMap((b) => b.authors.map(fold))).size,
  };
}

/** Keyboard moves on the shelves: left/right inside a shelf, up/down to the same spot of the next shelf. */
export function moveFocus(
  shelves: readonly Shelf[],
  currentId: string | null,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
): string | null {
  const rows = shelves.map(shelfItems).filter((r) => r.length > 0);
  if (!rows.length) return null;
  let r = rows.findIndex((row) => row.some((b) => b.id === currentId));
  if (r < 0) return rows[0][0].id;
  const row = rows[r];
  let c = row.findIndex((b) => b.id === currentId);
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
      const frac = row.length > 1 ? c / (row.length - 1) : 0;
      r = next;
      c = Math.round(frac * (rows[r].length - 1));
      break;
    }
  }
  return rows[r][c].id;
}
