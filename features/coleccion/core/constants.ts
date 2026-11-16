/** Version written in the collection file. */
export const COLLECTION_FILE_VERSION = 1;

/** A game id: lowercase letters and digits. */
export const GAME_ID_PATTERN = /^[a-z0-9]{4,32}$/;
/** Length of a generated game id. */
export const GAME_ID_LENGTH = 8;

/** Longest texts kept (characters). */
export const TITLE_MAX = 120;
export const SERIES_MAX = 80;
export const OWNER_MAX = 60;
export const NOTES_MAX = 2000;
export const PRICE_MAX = 60;
export const SEEN_AT_MAX = 120;
/** Stage 2 fields (IGDB id, barcode, cover): kept, not used yet. */
export const EXTERNAL_ID_MAX = 64;
export const BARCODE_MAX = 32;
export const COVER_MAX = 400;
/** Longest cover key kept (a libretro file name or an IGDB image id). */
export const COVER_KEY_MAX = 300;
/**
 * Largest cover image accepted, read from its header before anything decodes it: a side and a total of pixels.
 * Box scans are 500 to 1000 px and phone photos about 4000×3000; a 16000×16000 image would take a browser tab down.
 */
export const COVER_MAX_SIDE = 8192;
export const COVER_MAX_PIXELS = 24_000_000;

/** Most games kept in the file (a real collection of a few hundred is far below). */
export const GAMES_MAX = 5000;
/** Deleted games kept inside the file (newest first), so a mistake can be undone by hand. */
export const TRASH_MAX = 100;
/** Most players a game can say it has. */
export const PLAYERS_MAX = 8;

/** Name of a game with none. */
export const DEFAULT_TITLE = 'Juego sin nombre';
