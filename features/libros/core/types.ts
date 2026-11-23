/** What the copy is: a hardcover, a paperback or a file. */
export const FORMATS = ['pasta-dura', 'pasta-blanda', 'digital'] as const;
export type BookFormat = (typeof FORMATS)[number] | '';

/** How the reading goes. «a-medias» is one left halfway (not being read now). */
export const READING = ['sin-leer', 'leyendo', 'leido', 'a-medias'] as const;
export type Reading = (typeof READING)[number] | '';

/** Where a cover came from: Open Library found it, or the person uploaded it. */
export const BOOK_COVER_SOURCES = ['openlibrary', 'subida'] as const;
export type BookCoverSource = (typeof BOOK_COVER_SOURCES)[number];

/** Image formats a cover may have (checked by their first bytes, never by a name). */
export const BOOK_COVER_TYPES = ['png', 'jpg', 'webp'] as const;
export type BookCoverType = (typeof BOOK_COVER_TYPES)[number];

/**
 * A book's cover as the library file keeps it: where it came from and when, never a path. The image itself is
 * <home>/.pixel-agents/libros/portadas/<book id>.<type>. Written only by the server.
 */
export interface BookCoverArt {
  source: BookCoverSource;
  /** openlibrary: "isbn:<isbn>" or "id:<cover id>"; subida: "". */
  key: string;
  /** ISO time it was set. */
  at: string;
  type: BookCoverType;
}

/**
 * One book of the library, or a gap on its shelf ("se busca": wanted = true, with the price seen). Empty strings
 * and 0 mean "not said". Only the title is required.
 */
export interface Book {
  id: string;
  title: string;
  /** In the order the book gives them; the first one decides its shelf when the shelves go by author. */
  authors: string[];
  publisher: string;
  /** Free text; the usual ones (core/genres.ts) have their place and color on the shelves. */
  genre: string;
  /** Year of this edition; 0 = not said. */
  year: number;
  /** Digits only (and a final X for an old ISBN-10), as typed; "" = not said. */
  isbn: string;
  language: string;
  format: BookFormat;
  pages: number;
  /** The saga it belongs to, and its number in it (0 = not said). */
  series: string;
  seriesNumber: number;
  reading: Reading;
  /** Whose it is. */
  owner: string;
  /** Who has it now, when it is lent. */
  lentTo: string;
  /** YYYY-MM-DD it was lent (set by the save when `lentTo` is first written). */
  lentAt: string;
  notes: string;
  wanted: boolean;
  /** Wanted: the price seen, as written ("$350 MXN"). */
  price: string;
  /** Wanted: where it was seen. */
  seenAt: string;
  /** YYYY-MM-DD it came into the library (for a wanted one, when it was written down). */
  addedAt: string;
  /** YYYY-MM-DD it was finished (set by the save when its reading becomes «leído»), or "". */
  finishedAt: string;
  /** ISO time of the last save ("" when never saved). */
  updatedAt: string;
  /** The cover image this book has (set by the server only; the image lives next to the library file). */
  coverArt?: BookCoverArt;
  /** ISO time the person answered «Ninguna» to its cover choice (server only). */
  coverNone?: string;
}

/** A book as read, plus what could not be understood in it. */
export interface ReadBook {
  book: Book;
  /** Fields this version does not know: written back as they were. */
  unknown: Record<string, unknown>;
  problems: string[];
}
