export const LOG_PREFIX = '[Comics]';

/** The comics collection, under ~/.pixel-agents/. */
export const COMICS_FILE = 'comics.json';
export const DAMAGED_PREFIX = 'comics.danado-';
export const FILE_MAX_BYTES = 8 * 1024 * 1024;

export const MESSAGES = [
  'comicsOpen',
  'comicsSave',
  'comicsDelete',
  'comicsLookup',
  'comicsCoverFind',
  'comicsCoverRun',
  'comicsCoverPick',
  'comicsCoverDismiss',
  'comicsCoverRemove',
] as const;
export const REQUEST_ID_MAX = 64;
export const ID_TRIES = 50;

export const ROUTE_COVER = '/api/comics/portada/:id';
export const ROUTE_CANDIDATE = '/api/comics/candidata/:id/:n';
export const UPLOAD_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/octet-stream',
];

/**
 * AniList (anilist.co): manga, manhwa and manhua data and covers, no key, GraphQL over a POST. Checked against the
 * real service on 2026-11-23: answers in under a second; its covers are served straight from s4.anilist.co. It has
 * no Western comics («Watchmen»: nothing). Free for non-commercial use; it asks to keep under 90 requests a minute.
 */
export const ANILIST_API_HOST = 'graphql.anilist.co';
export const ANILIST_IMAGE_HOST = 's4.anilist.co';
export const ANILIST_URL = `https://${ANILIST_API_HOST}/`;
/** One request a second at most to AniList (it allows 90 a minute). */
export const ANILIST_INTERVAL_MS = 1000;
export const LOOKUP_MAX = 4;

/** Under ~/.pixel-agents/: covers and candidate thumbnails. */
export const COVERS_DIR = ['comics', 'portadas'] as const;
