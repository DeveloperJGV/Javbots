export const LOG_PREFIX = '[Decks]';

// ── Files (under ~/.pixel-agents/) ─────────────────────────────────────────────────────────
/** `{ "folder": "C:\\path" }`: where the deck files live. */
export const DECKS_CONFIG_FILE = 'decks.json';
/** Default deck folder. */
export const DEFAULT_DECKS_DIR = 'decks';
/** The card cache: can be deleted without losing any deck. */
export const CACHE_DIR = 'decks-cache';
export const CARDS_FILE = 'cards.json';
export const IMAGES_DIR = 'img';
/** Deleted decks go here, inside the deck folder (never lost). */
export const TRASH_DIR = '.borrados';
/** Version of cards.json (bump when the trimmed card changes shape: the base is downloaded again). */
export const CARDS_FILE_VERSION = 1;

// ── YGOPRODeck ─────────────────────────────────────────────────────────────────────────────
export const YGO_API = 'https://db.ygoprodeck.com/api/v7';
export const YGO_CARDINFO_URL = `${YGO_API}/cardinfo.php`;
export const YGO_DBVER_URL = `${YGO_API}/checkDBVer.php`;
export const YGO_IMAGES = 'https://images.ygoprodeck.com/images';
/** Image folders of YGOPRODeck by size. */
export const IMAGE_REMOTE_DIRS = {
  full: 'cards',
  small: 'cards_small',
  crop: 'cards_cropped',
} as const;
/** Local file suffix by size (`img/<id><suffix>.jpg`). */
export const IMAGE_LOCAL_SUFFIX = { full: '', small: '_small', crop: '_crop' } as const;
/** Generic: nothing about the person running the office. */
export const USER_AGENT = 'deck-viewer/1.0 (personal, cached)';

/** The base is checked again (checkDBVer) when it is older than this. */
export const DB_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed download is not retried before this. */
export const DB_RETRY_MS = 10 * 60 * 1000;
/** A missing image is not asked again before this. */
export const IMAGE_RETRY_MS = 60 * 60 * 1000;
/** Requests to YGOPRODeck at once, and per second (their limit is 20/s; going over blocks the IP an hour). */
export const REMOTE_CONCURRENCY = 2;
export const REMOTE_PER_SECOND = 10;
/** Largest image accepted (bytes). */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

// ── Messages ───────────────────────────────────────────────────────────────────────────────
export const SEARCH_LIMIT = 20;
export const SEARCH_QUERY_MAX = 80;
export const CARDS_REQUEST_MAX = 300;
export const IMPORT_TEXT_MAX = 100_000;

// ── Watching the deck folder ───────────────────────────────────────────────────────────────
export const WATCH_POLL_MS = 2000;
export const WATCH_DEBOUNCE_MS = 250;

// ── HTTP ───────────────────────────────────────────────────────────────────────────────────
export const ROUTE_LIST = '/api/decks';
export const ROUTE_DECK = '/api/decks/:id';
export const ROUTE_IMAGE = '/api/decks/img/:cardId';
export const YDK_SUFFIX = '.ydk';

// ── Connections board ──────────────────────────────────────────────────────────────────────
export const CONNECTION_ID = 'decks-ygoprodeck';
export const CONNECTION_NAME = 'YGOPRODeck';
export const CONNECTION_FEATURE = 'Decks';
export const CONNECTION_PURPOSE =
  'Datos e imágenes de cartas de Yu-Gi-Oh! (se guardan en la máquina)';
export const CONNECTION_AUTH = 'Ninguna (API pública)';

// ── Texts ──────────────────────────────────────────────────────────────────────────────────
export const DB_LOADING_DETAIL = 'Bajando la base de cartas…';
export const DB_ERROR_DETAIL = 'No se pudo bajar la base de cartas';
export const DB_MISSING_DETAIL = 'Todavía no se baja la base de cartas';
