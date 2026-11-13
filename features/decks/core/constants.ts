/** Version written in every deck file. */
export const DECK_FILE_VERSION = 1;

/** A deck id: lowercase letters and digits. */
export const DECK_ID_PATTERN = /^[a-z0-9]{4,32}$/;
/** Length of a generated deck id. */
export const DECK_ID_LENGTH = 8;

/** Box color when a deck has none (a deep red). */
// eslint-disable-next-line pixel-agents/no-inline-colors -- a default of the deck file format, not a UI color
export const DEFAULT_BOX_COLOR = '#7a1f2b';
export const BOX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Name of a deck with none. */
export const DEFAULT_DECK_NAME = 'Deck sin nombre';
/** Name of an imported deck (the formats carry none). */
export const IMPORTED_DECK_NAME = 'Deck importado';

/** Longest name / owner / notes kept (characters). */
export const DECK_NAME_MAX = 80;
export const DECK_OWNER_MAX = 80;
export const DECK_NOTES_MAX = 4000;
/** Most cards kept in one zone (anything beyond is dropped: no real deck comes close). */
export const ZONE_MAX_CARDS = 200;
/** Card codes are unsigned 32-bit numbers (ydke:// stores them so); printed ones have up to 8 digits. */
export const CARD_ID_MAX = 0xffffffff;

// ── Deck rules (warnings only) ─────────────────────────────────────────────────────────────
export const MAIN_MIN = 40;
export const MAIN_MAX = 60;
export const EXTRA_MAX = 15;
export const SIDE_MAX = 15;
export const COPIES_MAX = 3;
export const LIMITED_MAX = 1;
export const SEMI_LIMITED_MAX = 2;

// ── Formats ────────────────────────────────────────────────────────────────────────────────
export const YDKE_PREFIX = 'ydke://';
export const YDK_MAIN = '#main';
export const YDK_EXTRA = '#extra';
export const YDK_SIDE = '!side';
/** First line of a written .ydk (a comment for the programs that read it). */
export const YDK_HEADER = '#created by Javbots';

/** Most copies one line of a text list can ask for. */
export const TEXT_LINE_MAX_COPIES = 60;
/** Most lines of a text list read. */
export const TEXT_MAX_LINES = 500;

// ── Search ─────────────────────────────────────────────────────────────────────────────────
export const SEARCH_DEFAULT_LIMIT = 20;
/** A name shorter than this (normalized) is never matched loosely. */
export const LOOSE_MATCH_MIN_LENGTH = 4;
/** Most edits a misspelled name may need to still match. */
export const TYPO_MAX_DISTANCE = 2;
