export const LOG_PREFIX = '[Coleccion]';

/** The collection, under ~/.pixel-agents/. */
export const COLLECTION_FILE = 'coleccion.json';
/** A file that could not be read is kept aside with this name (plus a time stamp) before writing a new one. */
export const DAMAGED_PREFIX = 'coleccion.danado-';
/** Largest collection file read or written (bytes): far above thousands of games, far below trouble. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;

export const MESSAGES = ['coleccionOpen', 'coleccionSave', 'coleccionDelete'] as const;
/** Longest request id accepted (it only goes back in the answer). */
export const REQUEST_ID_MAX = 64;
/** Tries to find a free id for a new game before giving up. */
export const ID_TRIES = 50;
