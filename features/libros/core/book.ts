import { isIsoTime } from '../../coleccion/core/cover.js';
import { cleanText, isGameId, isoDay, newGameId } from '../../coleccion/core/game.js';
import {
  AUTHOR_MAX,
  AUTHORS_MAX,
  BOOKS_MAX,
  COVER_KEY_MAX,
  DEFAULT_TITLE,
  GENRE_MAX,
  LANGUAGE_MAX,
  LENT_TO_MAX,
  NOTES_MAX,
  OWNER_MAX,
  PAGES_MAX,
  PRICE_MAX,
  PUBLISHER_MAX,
  SEEN_AT_MAX,
  SERIES_MAX,
  SERIES_NUMBER_MAX,
  TITLE_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from './constants.js';
import { canonicalGenre } from './genres.js';
import { cleanIsbn } from './isbn.js';
import {
  type Book,
  BOOK_COVER_SOURCES,
  BOOK_COVER_TYPES,
  type BookCoverArt,
  type BookCoverSource,
  type BookCoverType,
  type BookFormat,
  FORMATS,
  type ReadBook,
  READING,
  type Reading,
} from './types.js';

export { isoDay };

/** Book ids look like the collection's game ids: lowercase letters and digits. */
export const isBookId = isGameId;
export const newBookId = newGameId;

const KNOWN_FIELDS = new Set([
  'id',
  'title',
  'authors',
  'publisher',
  'genre',
  'year',
  'isbn',
  'language',
  'format',
  'pages',
  'series',
  'seriesNumber',
  'reading',
  'owner',
  'lentTo',
  'lentAt',
  'notes',
  'wanted',
  'price',
  'seenAt',
  'addedAt',
  'finishedAt',
  'updatedAt',
  'coverArt',
  'coverNone',
]);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One line: newlines become spaces too. */
const line = (value: unknown, max: number) =>
  cleanText(typeof value === 'string' ? value.replace(/\s+/g, ' ') : value, max);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : '';
}

const day = (value: unknown): string =>
  typeof value === 'string' && DAY_PATTERN.test(value) ? value : '';

/** A whole number between the limits, or 0 ("not said"). */
function count(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const n = Math.round(value);
  return n >= min && n <= max ? n : 0;
}

/**
 * Authors from what was typed or sent: a list, or one text with the names split by commas, semicolons or « & »
 * («Ana Pérez, Luis Gómez»). Never by « y »: «José Ortega y Gasset» is one person. Empty names out, repeats out
 * (accents and case ignored), at most AUTHORS_MAX.
 */
export function parseAuthors(value: unknown): string[] {
  const parts = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(/\s*[,;]\s*|\s+&\s+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const name = line(p, AUTHOR_MAX);
    const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= AUTHORS_MAX) break;
  }
  return out;
}

/** The authors as one line for a form or a card: «Ana Pérez, Luis Gómez». */
export const authorsText = (authors: readonly string[]): string => authors.join(', ');

/** A book's cover from anything (the file, the wire); null when any part of it is not right. */
export function normalizeBookCover(raw: unknown): BookCoverArt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!(BOOK_COVER_SOURCES as readonly unknown[]).includes(r.source)) return null;
  if (!(BOOK_COVER_TYPES as readonly unknown[]).includes(r.type)) return null;
  if (typeof r.key !== 'string' || r.key.length > COVER_KEY_MAX) return null;
  // A key is "isbn:<digits>", "id:<digits>" or empty: never a name, never a place
  if (r.key !== '' && !/^(isbn:[0-9X]{10,13}|id:\d{1,12})$/.test(r.key)) return null;
  if (!isIsoTime(r.at)) return null;
  return {
    source: r.source as BookCoverSource,
    key: r.key,
    at: r.at,
    type: r.type as BookCoverType,
  };
}

/** An empty book for the form (what repeats kept when adding many in a row). */
export function emptyBook(today: string, keep: Partial<Book> = {}): Book {
  return {
    id: '',
    title: '',
    authors: [],
    publisher: '',
    genre: '',
    year: 0,
    isbn: '',
    language: '',
    format: '',
    pages: 0,
    series: '',
    seriesNumber: 0,
    reading: '',
    owner: '',
    lentTo: '',
    lentAt: '',
    notes: '',
    wanted: false,
    price: '',
    seenAt: '',
    addedAt: today,
    finishedAt: '',
    updatedAt: '',
    ...keep,
  };
}

/**
 * A book from anything (the file, a message): unknown values fall back to "not said" and are reported, too-long
 * texts are cut, fields this version doesn't know are kept apart. Null when it is not even an object.
 */
export function normalizeBook(raw: unknown, today: string): ReadBook | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!KNOWN_FIELDS.has(k)) unknown[k] = v;

  let title = line(r.title, TITLE_MAX);
  if (!title) {
    title = DEFAULT_TITLE;
    problems.push('no tenía título.');
  }
  const year = count(r.year, YEAR_MIN, YEAR_MAX);
  if (r.year !== undefined && r.year !== 0 && year === 0)
    problems.push(`año no válido (${String(r.year)}).`);
  const book: Book = {
    id: isBookId(r.id) ? r.id : '',
    title,
    authors: parseAuthors(r.authors),
    publisher: line(r.publisher, PUBLISHER_MAX),
    genre: canonicalGenre(line(r.genre, GENRE_MAX)),
    year,
    isbn: cleanIsbn(r.isbn),
    language: line(r.language, LANGUAGE_MAX),
    format: oneOf(r.format, FORMATS) as BookFormat,
    pages: count(r.pages, 1, PAGES_MAX),
    series: line(r.series, SERIES_MAX),
    seriesNumber: count(r.seriesNumber, 1, SERIES_NUMBER_MAX),
    reading: oneOf(r.reading, READING) as Reading,
    owner: line(r.owner, OWNER_MAX),
    lentTo: line(r.lentTo, LENT_TO_MAX),
    lentAt: day(r.lentAt),
    notes: cleanText(r.notes, NOTES_MAX),
    wanted: r.wanted === true,
    price: line(r.price, PRICE_MAX),
    seenAt: line(r.seenAt, SEEN_AT_MAX),
    addedAt: day(r.addedAt) || today,
    finishedAt: day(r.finishedAt),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '',
  };
  if (!book.series) book.seriesNumber = 0;
  if (!book.lentTo) book.lentAt = '';
  if (r.coverArt !== undefined) {
    const art = normalizeBookCover(r.coverArt);
    if (art) book.coverArt = art;
    else problems.push('los datos de su portada no se entienden; se ignoran.');
  }
  if (isIsoTime(r.coverNone)) book.coverNone = r.coverNone;
  // A wanted gap is not on the shelf yet: what describes a copy does not apply
  if (book.wanted) {
    book.reading = '';
    book.lentTo = '';
    book.lentAt = '';
    book.finishedAt = '';
  }
  return { book, unknown, problems };
}

/** The book as written to the file: its known fields in a fixed order, then the unknown ones. */
export function bookFileContent(
  book: Book,
  unknown: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: book.id,
    title: book.title,
    authors: [...book.authors],
    publisher: book.publisher,
    genre: book.genre,
    year: book.year,
    isbn: book.isbn,
    language: book.language,
    format: book.format,
    pages: book.pages,
    series: book.series,
    seriesNumber: book.seriesNumber,
    reading: book.reading,
    owner: book.owner,
    lentTo: book.lentTo,
    lentAt: book.lentAt,
    notes: book.notes,
    wanted: book.wanted,
    price: book.price,
    seenAt: book.seenAt,
    addedAt: book.addedAt,
    finishedAt: book.finishedAt,
    updatedAt: book.updatedAt,
  };
  if (book.coverArt) out.coverArt = { ...book.coverArt };
  if (book.coverNone) out.coverNone = book.coverNone;
  for (const [k, v] of Object.entries(unknown)) if (!(k in out)) out[k] = v;
  return out;
}

/** What a library file holds, read leniently. */
export interface ReadLibrary {
  books: ReadBook[];
  /** Top-level fields this version does not know (kept). */
  unknown: Record<string, unknown>;
  /** Deleted books kept in the file, as they were. */
  trash: unknown[];
  problems: string[];
}

/** The library file's content (already parsed JSON). Never throws. */
export function readLibrary(raw: unknown, today: string): ReadLibrary {
  const out: ReadLibrary = { books: [], unknown: {}, trash: [], problems: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    out.problems.push('El archivo no es una biblioteca.');
    return out;
  }
  const r = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(r))
    if (k !== 'version' && k !== 'books' && k !== 'trash') out.unknown[k] = v;
  if (Array.isArray(r.trash)) out.trash = r.trash;
  if (r.books !== undefined && !Array.isArray(r.books))
    out.problems.push('"books" no es una lista.');
  const list = Array.isArray(r.books) ? r.books : [];
  if (list.length > BOOKS_MAX)
    out.problems.push(`Tiene ${list.length} libros; solo se leen los primeros ${BOOKS_MAX}.`);
  const seen = new Set<string>();
  list.slice(0, BOOKS_MAX).forEach((item, i) => {
    const read = normalizeBook(item, today);
    if (!read) {
      out.problems.push(`El renglón ${i + 1} no es un libro.`);
      return;
    }
    if (!read.book.id || seen.has(read.book.id)) {
      // Missing or repeated id: a fresh one, made from the position so it is the same on every read
      let id = `x${String(i).padStart(4, '0')}`;
      while (seen.has(id)) id += 'x';
      read.problems.push(`no tenía un id propio; uso ${id}.`);
      read.book.id = id;
    }
    seen.add(read.book.id);
    for (const p of read.problems) out.problems.push(`${read.book.title}: ${p}`);
    out.books.push(read);
  });
  return out;
}

/**
 * Applies a save on top of what was there: the id and the day it came in stay; a wanted gap that becomes a book
 * («¡Ya lo tengo!») comes into the library today. The day it was lent is written when someone first has it, and
 * the day it was finished when its reading first becomes «leído» (both can be fixed by hand in the file).
 */
export function mergeSave(
  previous: Book | undefined,
  next: Book,
  today: string,
  nowIso: string,
): Book {
  const book: Book = { ...next, authors: [...next.authors], updatedAt: nowIso };
  if (previous) {
    book.id = previous.id;
    book.addedAt = previous.addedAt;
    if (previous.wanted && !next.wanted) book.addedAt = today;
  } else book.addedAt = today;

  if (!book.lentTo) book.lentAt = '';
  else if (previous && previous.lentTo === book.lentTo && previous.lentAt)
    book.lentAt = previous.lentAt;
  else if (!previous || previous.lentTo !== book.lentTo) book.lentAt = today;

  if (book.reading !== 'leido') book.finishedAt = '';
  else if (previous?.reading === 'leido' && previous.finishedAt)
    book.finishedAt = next.finishedAt || previous.finishedAt;
  else book.finishedAt = next.finishedAt || today;

  if (book.wanted) {
    book.lentAt = '';
    book.finishedAt = '';
  }
  return book;
}

/** Spanish title order (case and accents ignored, numbers as numbers), then id so it is stable. */
export const byTitle = (a: Book, b: Book): number =>
  a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true }) ||
  a.id.localeCompare(b.id);
