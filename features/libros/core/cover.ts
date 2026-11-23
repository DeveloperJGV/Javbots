import { fold } from './shelves.js';
import type { Book } from './types.js';

/** What «Buscar las que faltan» needs to know of a book's last search (LibrosCoverState). */
export interface LastSearch {
  state: string;
  reason?: string;
}

/**
 * Whether «Buscar las que faltan» looks for this book: owned, without a cover, and not already settled (the person
 * said «Ninguna», a choice is waiting, or a search already knew nothing looks like it). A source that did not
 * answer is tried again. The page counts with this same rule.
 */
export function runSearches(
  book: Pick<Book, 'wanted' | 'coverArt' | 'coverNone'>,
  last: LastSearch | undefined,
): boolean {
  if (book.wanted || book.coverArt || book.coverNone) return false;
  if (!last) return true;
  if (last.state === 'elige' || last.state === 'buscando') return false;
  if (last.state !== 'nada') return true;
  return last.reason === 'sin-respuesta' || last.reason === 'cambio';
}

/** Why a cover was not found, in words for the page (LibrosCoverReason). */
export const COVER_REASON_TEXT: Readonly<Record<string, string>> = {
  'sin-respuesta': 'Open Library no contestó o la imagen no se pudo bajar. Vuelve a intentar.',
  'sin-coincidencia': 'Open Library no tiene nada parecido con portada.',
  cambio: 'Cambió el título, el autor o el ISBN: hay que buscarla de nuevo.',
};

/** Whether a save changed what the cover is searched by (title, first author or ISBN, beyond case and accents). */
export function coverIdentityChanged(before: Book, after: Book): boolean {
  return (
    fold(before.title) !== fold(after.title) ||
    fold(before.authors[0] ?? '') !== fold(after.authors[0] ?? '') ||
    before.isbn !== after.isbn
  );
}
