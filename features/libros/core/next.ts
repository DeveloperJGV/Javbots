import { agoText } from '../../coleccion/core/tonight.js';
import { byTitle } from './book.js';
import { LONG_PAGES, SHORT_PAGES } from './constants.js';
import { fold, sameName } from './shelves.js';
import type { Book } from './types.js';

/**
 * «¿Qué leo ahora?»: what is wanted (go on with one started, the next of a saga, one waiting on the shelf, or
 * anything), how long ('' = any) and which genre ('' = any).
 */
export interface NextAsk {
  mood: 'seguir' | 'saga' | 'pendiente' | 'cualquiera';
  length: '' | 'corto' | 'medio' | 'largo';
  genre: string;
}

export interface NextPick {
  book: Book;
  /** Why this one, in a short sentence. */
  why: string;
}

/** A book that is at home to be read: owned and not lent. */
const atHome = (b: Book) => !b.wanted && !b.lentTo;
const started = (b: Book) => b.reading === 'leyendo' || b.reading === 'a-medias';
const unread = (b: Book) => b.reading === 'sin-leer' || b.reading === '';

/**
 * The next of each saga already begun: in every saga with a book read (or being read), the lowest-numbered one
 * at home that is still unread. Sagas without numbers do not count (their order is not known).
 */
export function sagaNext(books: readonly Book[]): Map<string, { book: Book; after: number }> {
  const out = new Map<string, { book: Book; after: number }>();
  const sagas = new Map<string, Book[]>();
  for (const b of books) {
    if (b.wanted || !b.series || !b.seriesNumber) continue;
    const key = fold(b.series);
    let list = sagas.get(key);
    if (!list) sagas.set(key, (list = []));
    list.push(b);
  }
  for (const [key, list] of sagas) {
    const read = list.filter((b) => b.reading === 'leido' || b.reading === 'leyendo');
    if (!read.length) continue;
    const after = Math.max(...read.map((b) => b.seriesNumber));
    const next = list
      .filter((b) => atHome(b) && unread(b) && b.seriesNumber > after)
      .sort((a, b) => a.seriesNumber - b.seriesNumber)[0];
    if (next) out.set(key, { book: next, after });
  }
  return out;
}

/** The questions' defaults: go on with one started if any, else the next of a saga if any, else one waiting. */
export function defaultNextAsk(books: readonly Book[]): NextAsk {
  const mood: NextAsk['mood'] = books.some((b) => atHome(b) && started(b))
    ? 'seguir'
    : sagaNext(books).size > 0
      ? 'saga'
      : 'pendiente';
  return { mood, length: '', genre: '' };
}

/** Whether a book's pages fit the length asked (a book that does not say fits any). */
export function fitsLength(pages: number, length: NextAsk['length']): boolean {
  if (!length || !pages) return true;
  if (length === 'corto') return pages < SHORT_PAGES;
  if (length === 'largo') return pages > LONG_PAGES;
  return pages >= SHORT_PAGES && pages <= LONG_PAGES;
}

/** A stable shuffle key: the same round gives the same order, a new round gives another. */
function mix(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0;
  return h;
}

/** Every book at home that fits the ask, best first. */
export function nextCandidates(books: readonly Book[], ask: NextAsk, seed = 0): Book[] {
  const fits = (b: Book) =>
    atHome(b) && fitsLength(b.pages, ask.length) && (!ask.genre || sameName(b.genre, ask.genre));
  switch (ask.mood) {
    case 'seguir':
      // Being read first, then the ones left halfway, the one left the longest ago first
      return books
        .filter((b) => fits(b) && started(b))
        .sort(
          (a, b) =>
            Number(b.reading === 'leyendo') - Number(a.reading === 'leyendo') ||
            (a.updatedAt || a.addedAt).localeCompare(b.updatedAt || b.addedAt) ||
            byTitle(a, b),
        );
    case 'saga':
      return [...sagaNext(books).values()]
        .map((x) => x.book)
        .filter(fits)
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || byTitle(a, b));
    case 'pendiente':
      // Said «sin leer» before not said; the one waiting the longest first
      return books
        .filter((b) => fits(b) && unread(b))
        .sort(
          (a, b) =>
            Number(b.reading === 'sin-leer') - Number(a.reading === 'sin-leer') ||
            a.addedAt.localeCompare(b.addedAt) ||
            byTitle(a, b),
        );
    default:
      return books
        .filter((b) => fits(b) && b.reading !== 'leido' && b.reading !== 'leyendo')
        .sort((a, b) => mix(a.id, seed) - mix(b.id, seed) || byTitle(a, b));
  }
}

/** Three picks for this round (round 0, 1, 2… pages through; it wraps when it runs out). */
export function nextPicks(
  books: readonly Book[],
  ask: NextAsk,
  round: number,
  today: string,
  seed = 0,
): { picks: NextPick[]; total: number } {
  const all = nextCandidates(books, ask, seed);
  if (!all.length) return { picks: [], total: 0 };
  const pages = Math.ceil(all.length / 3);
  const page = ((round % pages) + pages) % pages;
  const saga = sagaNext(books);
  const picks = all
    .slice(page * 3, page * 3 + 3)
    .map((book) => ({ book, why: whyText(book, today, saga) }));
  return { picks, total: all.length };
}

function whyText(
  b: Book,
  today: string,
  saga: ReadonlyMap<string, { book: Book; after: number }>,
): string {
  if (b.reading === 'leyendo') return 'Lo estás leyendo.';
  if (b.reading === 'a-medias') return 'Se quedó a medias.';
  const s = b.series ? saga.get(fold(b.series)) : undefined;
  if (s && s.book.id === b.id)
    return `El que sigue en ${b.series}: ya se leyó hasta el ${s.after}.`;
  if (b.reading === 'sin-leer' || b.reading === '')
    return `Llegó ${agoText(b.addedAt, today)} y sigue sin leerse.`;
  return 'Encaja con lo que buscas.';
}
