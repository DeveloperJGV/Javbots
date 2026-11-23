/**
 * Open Library (openlibrary.org, of the Internet Archive): book data by ISBN and search by title and author, and
 * the cover images. No key. Checked against the real service on 2026-11-23: `/api/books` and `/search.json`
 * answer JSON; `covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false` answers the image or 404; a cover by id
 * (`/b/id/<id>-M.jpg`) may send to archive.org, which sends to one of its numbered servers (ia<n>.us.archive.org).
 */
export const OPENLIBRARY_HOST = 'openlibrary.org';
export const COVERS_HOST = 'covers.openlibrary.org';
export const ARCHIVE_HOST = 'archive.org';
export const BOOK_HOSTS: ReadonlySet<string> = new Set([
  OPENLIBRARY_HOST,
  COVERS_HOST,
  ARCHIVE_HOST,
]);
/** The archive's numbered image servers, where a cover by id ends up. */
export const ARCHIVE_SERVER_PATTERN = /^ia\d{1,6}\.us\.archive\.org$/;
/** Redirects followed on a GET (cover → archive.org → its server); each one checked against the hosts above. */
export const MAX_REDIRECTS = 3;

/** Time limits (ms): Open Library can take several seconds to answer (6 s seen on a search). */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Byte caps: an image (downloaded or uploaded) and an API answer. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const API_MAX_BYTES = 1024 * 1024;
/**
 * One request every 3 s at most: Open Library asks for no more than 100 cover lookups by ISBN per 5 minutes from
 * one address, and to be gentle with the rest.
 */
export const SOURCE_INTERVAL_MS = 3000;
/** Results asked to the search (the covers offered are the best 4 of them). */
export const SEARCH_LIMIT = 12;
/** Candidates offered in «elige una». */
export const CANDIDATES_MAX = 4;

/** Under ~/.pixel-agents/: covers and candidate thumbnails. */
export const COVERS_DIR = ['libros', 'portadas'] as const;

/** Open Library's addresses. */
export const booksApiUrl = (isbn: string) =>
  `https://${OPENLIBRARY_HOST}/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`;
export const searchUrl = (title: string, author: string) => {
  const q = new URLSearchParams({
    title,
    fields: 'title,author_name,first_publish_year,cover_i',
    limit: String(SEARCH_LIMIT),
  });
  if (author) q.set('author', author);
  return `https://${OPENLIBRARY_HOST}/search.json?${q}`;
};
export const isbnCoverUrl = (isbn: string, size: 'M' | 'L') =>
  `https://${COVERS_HOST}/b/isbn/${encodeURIComponent(isbn)}-${size}.jpg?default=false`;
export const idCoverUrl = (id: string, size: 'M' | 'L') =>
  `https://${COVERS_HOST}/b/id/${encodeURIComponent(id)}-${size}.jpg`;
