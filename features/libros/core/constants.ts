/** Version written in the library file. */
export const LIBRARY_FILE_VERSION = 1;

/** Longest texts kept (characters). */
export const TITLE_MAX = 160;
export const AUTHOR_MAX = 80;
/** Most authors a book keeps (an anthology lists the first ones). */
export const AUTHORS_MAX = 8;
export const PUBLISHER_MAX = 80;
export const GENRE_MAX = 40;
export const LANGUAGE_MAX = 30;
export const SERIES_MAX = 80;
export const OWNER_MAX = 60;
export const LENT_TO_MAX = 60;
export const NOTES_MAX = 2000;
export const PRICE_MAX = 60;
export const SEEN_AT_MAX = 120;
/** ISBN as kept: its digits (and a final X), 10 or 13 of them; anything else that was typed is kept up to this. */
export const ISBN_MAX = 20;

/** Years a book can say it is from (a first edition of the 1500s is still a book). */
export const YEAR_MIN = 1400;
export const YEAR_MAX = 2100;
/** Most pages a book can say it has. */
export const PAGES_MAX = 20000;
/** Highest number in a saga. */
export const SERIES_NUMBER_MAX = 999;

/** Most books kept in the file (a house library of a few thousand is far below). */
export const BOOKS_MAX = 10000;
/** Deleted books kept inside the file (newest first), so a mistake can be undone by hand. */
export const TRASH_MAX = 100;

/** Name of a book with none. */
export const DEFAULT_TITLE = 'Libro sin título';

/** Longest cover key kept (an Open Library cover id or ISBN). */
export const COVER_KEY_MAX = 40;

/** «¿Qué leo ahora?»: under this many pages a book is short; over the second, long. */
export const SHORT_PAGES = 220;
export const LONG_PAGES = 480;
/** A book lent this long ago gets a note in its card (about three months). */
export const LENT_LONG_DAYS = 90;
