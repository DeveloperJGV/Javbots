import type { LibrosCoverState } from '../../../core/src/messages.js';
import { COVER_REASON_TEXT, runSearches } from '../core/cover.js';
import type { Book } from '../core/types.js';
import { COVER_CANDIDATE_PATH, COVER_PATH } from './constants.js';

/** The cover image of a book (office token required; `v` changes with every new cover). */
export function coverUrl(id: string, at: string, token: string | null): string {
  const q = new URLSearchParams();
  if (token) q.set('token', token);
  q.set('v', at);
  return `${COVER_PATH}${encodeURIComponent(id)}?${q}`;
}

/** Where an uploaded cover goes (POST, the body is the image; the token goes in the Authorization header). */
export const uploadUrl = (id: string): string => `${COVER_PATH}${encodeURIComponent(id)}`;

/** The headers of an upload: the image type and the office token as a Bearer (never in the address). */
export function uploadHeaders(type: string, token: string | null): Record<string, string> {
  return token
    ? { 'Content-Type': type, Authorization: `Bearer ${token}` }
    : { 'Content-Type': type };
}

/** Thumbnail n of a book's «elige una» (`v` = the search's stamp, so a new search never shows the old one). */
export function candidateUrl(id: string, n: number, stamp: string, token: string | null): string {
  const q = new URLSearchParams();
  if (token) q.set('token', token);
  q.set('v', stamp);
  return `${COVER_CANDIDATE_PATH}${encodeURIComponent(id)}/${n}?${q}`;
}

/** What the server's answer to an upload means. */
export function uploadErrorText(status: number): string {
  if (status === 401) return 'Esta página no tiene la llave de la oficina.';
  if (status === 404) return 'No encontré ese libro.';
  if (status === 413) return 'La imagen pesa demasiado (4 MB como mucho).';
  if (status === 415) return 'Eso no es una imagen PNG, JPG o WEBP.';
  return 'No se pudo subir la imagen.';
}

/**
 * How the last search went, in one line (none when there was none, or it offers a choice). «Found by its ISBN» only
 * when the cover it has now came from an ISBN (one picked from a choice says nothing: its source is shown).
 */
export function searchLine(
  search: LibrosCoverState | undefined,
  coverKey = '',
): { text: string; bad: boolean } | null {
  if (!search) return null;
  if (search.state === 'buscando') return { text: 'Buscando en Open Library…', bad: false };
  if (search.state === 'encontrada')
    return coverKey.startsWith('isbn:')
      ? { text: 'Encontrada por su ISBN en Open Library.', bad: false }
      : null;
  if (search.state === 'nada')
    return { text: COVER_REASON_TEXT[search.reason ?? ''] ?? 'No se encontró.', bad: true };
  return null;
}

/** Books «Buscar las que faltan» would look for, by the server's own rule (core/cover.ts runSearches). */
export function missingCovers(books: readonly Book[], covers: readonly LibrosCoverState[]): number {
  const last = new Map(covers.map((c) => [c.id, c]));
  return books.filter((b) => runSearches(b, last.get(b.id))).length;
}
