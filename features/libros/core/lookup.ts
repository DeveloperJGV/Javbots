import { cleanText } from '../../coleccion/core/game.js';
import {
  AUTHOR_MAX,
  AUTHORS_MAX,
  PAGES_MAX,
  PUBLISHER_MAX,
  TITLE_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from './constants.js';
import { fold } from './shelves.js';

/**
 * What Open Library knows of an ISBN, cleaned (outside text: shown as text only, and only put in the form when the
 * person says so). Empty strings and 0 = it did not say.
 */
export interface LookupFound {
  title: string;
  authors: string[];
  publisher: string;
  year: number;
  pages: number;
  /** Open Library's cover id, when it has a cover. */
  coverId: string;
}

/** One book Open Library's search gave, with a cover. */
export interface SearchDoc {
  title: string;
  authors: string[];
  year: number;
  coverId: string;
}

const line = (v: unknown, max: number) =>
  cleanText(typeof v === 'string' ? v.replace(/\s+/g, ' ') : '', max);

const yearOf = (v: unknown): number => {
  const m = /\b(1[4-9]\d\d|20\d\d)\b/.exec(typeof v === 'number' ? String(v) : String(v ?? ''));
  const y = m ? Number(m[1]) : 0;
  return y >= YEAR_MIN && y <= YEAR_MAX ? y : 0;
};

const coverIdOf = (v: unknown): string => {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e12) return String(v);
  const m = /\/b\/id\/(\d{1,12})-[SML]\.jpg/.exec(typeof v === 'string' ? v : '');
  return m ? m[1] : '';
};

const names = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((a) =>
      line(typeof a === 'string' ? a : (a as { name?: unknown } | null)?.name, AUTHOR_MAX),
    )
    .filter(Boolean)
    .slice(0, AUTHORS_MAX);

/**
 * Open Library's books API answer (`/api/books?bibkeys=ISBN:<isbn>&jscmd=data&format=json`): the edition of that
 * ISBN, or null when it does not know it (it answers `{}`) or the answer is not that.
 */
export function parseBooksApi(raw: unknown, isbn: string): LookupFound | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = (raw as Record<string, unknown>)[`ISBN:${isbn}`];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const e = entry as Record<string, unknown>;
  const title = line(e.title, TITLE_MAX);
  if (!title) return null;
  const subtitle = line(e.subtitle, TITLE_MAX);
  const publishers = names(e.publishers);
  const pages = typeof e.number_of_pages === 'number' ? Math.round(e.number_of_pages) : 0;
  const cover = (e.cover ?? {}) as Record<string, unknown>;
  return {
    title: subtitle ? `${title}: ${subtitle}`.slice(0, TITLE_MAX) : title,
    authors: names(e.authors),
    publisher: (publishers[0] ?? '').slice(0, PUBLISHER_MAX),
    year: yearOf(e.publish_date),
    pages: pages > 0 && pages <= PAGES_MAX ? pages : 0,
    coverId: coverIdOf(cover.large ?? cover.medium ?? cover.small),
  };
}

/** Open Library's search answer (`/search.json`): the books with a cover, as they came. */
export function parseSearch(raw: unknown): SearchDoc[] {
  const docs = (raw as { docs?: unknown } | null)?.docs;
  if (!Array.isArray(docs)) return [];
  const out: SearchDoc[] = [];
  for (const d of docs.slice(0, 50)) {
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    const coverId = coverIdOf(r.cover_i);
    const title = line(r.title, TITLE_MAX);
    if (!coverId || !title) continue;
    out.push({ title, authors: names(r.author_name), year: yearOf(r.first_publish_year), coverId });
  }
  return out;
}

/** The title without what comes after a colon or a period («Cien años de soledad. 4a edición»). */
const mainTitle = (t: string) => fold(t.split(/[:.(]/)[0] ?? t);

const words = (t: string) =>
  new Set(
    fold(t)
      .split(' ')
      .filter((w) => w.length > 2),
  );

/** Whether one of the book's authors shares a surname-sized word with one of the doc's. */
function authorsMeet(a: readonly string[], b: readonly string[]): boolean {
  const mine = new Set(a.flatMap((x) => [...words(x)]));
  return b.some((x) => [...words(x)].some((w) => mine.has(w)));
}

/**
 * How much a search result looks like the book: 1 = same title (and same author when both say it), lower = only
 * looks like it, 0 = not it. A different author always rules it out.
 */
export function docScore(
  book: { title: string; authors: readonly string[] },
  doc: SearchDoc,
): number {
  if (book.authors.length && doc.authors.length && !authorsMeet(book.authors, doc.authors))
    return 0;
  const a = fold(book.title);
  const b = fold(doc.title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (mainTitle(book.title) === mainTitle(doc.title)) return 0.9;
  if (a.includes(b) || b.includes(a)) return 0.75;
  const wa = words(book.title);
  const wb = words(doc.title);
  if (!wa.size || !wb.size) return 0;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  const jaccard = both / (wa.size + wb.size - both);
  return jaccard >= 0.5 ? 0.5 + jaccard / 5 : 0;
}

/** The covers to offer for a book: up to `max` results that look like it, best first, one per cover. */
export function pickCandidates(
  book: { title: string; authors: readonly string[] },
  docs: readonly SearchDoc[],
  max = 4,
): (SearchDoc & { score: number })[] {
  const seen = new Set<string>();
  return docs
    .map((d) => ({ ...d, score: docScore(book, d) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((d) => (seen.has(d.coverId) ? false : (seen.add(d.coverId), true)))
    .slice(0, max);
}
