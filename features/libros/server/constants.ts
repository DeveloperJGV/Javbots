export const LOG_PREFIX = '[Libros]';

/** The library, under ~/.pixel-agents/. */
export const LIBRARY_FILE = 'libros.json';
/** A file that could not be read is kept aside with this name (plus a time stamp) before writing a new one. */
export const DAMAGED_PREFIX = 'libros.danado-';
/** Largest library file read or written (bytes): far above thousands of books, far below trouble. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;

export const MESSAGES = [
  'librosOpen',
  'librosSave',
  'librosDelete',
  'librosLookup',
  'librosCoverFind',
  'librosCoverRun',
  'librosCoverPick',
  'librosCoverDismiss',
  'librosCoverRemove',
] as const;
/** Longest request id accepted (it only goes back in the answer). */
export const REQUEST_ID_MAX = 64;
/** Tries to find a free id for a new book before giving up. */
export const ID_TRIES = 50;

/** Cover routes (office token as ?token= or Bearer): a book's cover (GET, POST to upload) and a candidate. */
export const ROUTE_COVER = '/api/libros/portada/:id';
export const ROUTE_CANDIDATE = '/api/libros/candidata/:id/:n';
/** Image types an upload may declare; the bytes decide what it really is. */
export const UPLOAD_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/octet-stream',
];
