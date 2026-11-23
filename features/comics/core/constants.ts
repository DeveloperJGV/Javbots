/** Version written in the comics file. */
export const COMICS_FILE_VERSION = 1;

export const TITLE_MAX = 160;
export const PEOPLE_MAX = 80;
export const PEOPLE_COUNT_MAX = 8;
export const PUBLISHER_MAX = 80;
export const GENRE_MAX = 40;
export const LANGUAGE_MAX = 30;
export const OWNER_MAX = 60;
export const NOTES_MAX = 2000;
export const PRICE_MAX = 60;

export const YEAR_MIN = 1800;
export const YEAR_MAX = 2100;
/** Highest volume or issue number (long comic runs pass a thousand). */
export const VOLUME_MAX = 9999;
/** Most volumes a series keeps written down. */
export const VOLUMES_MAX = 2000;
/** Most numbers a «1-12, 15» list may stand for (so «1-9999» by mistake does not fill the file). */
export const RANGE_MAX = 2000;

export const SERIES_MAX = 5000;
export const TRASH_MAX = 100;
export const DEFAULT_TITLE = 'Serie sin título';
export const COVER_KEY_MAX = 40;

/** Genres and demographics offered as chips (anything else can be written). */
export const COMIC_GENRES: readonly string[] = [
  'Shōnen',
  'Seinen',
  'Shōjo',
  'Josei',
  'Kodomo',
  'Superhéroes',
  'Ciencia ficción',
  'Fantasía',
  'Terror',
  'Humor',
  'Aventura',
  'Policiaca',
  'Histórica',
  'Romance',
  'Deportes',
  'Slice of life',
  'Infantil',
];
