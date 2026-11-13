/** Route the Spicetify extension POSTs the current track to. */
export const MUSIC_API_PATH = '/api/music';

/** Settings file of the feature, beside the core config (never mixed into config.json). */
export const MUSIC_CONFIG_FILE = 'music.json';

/** The extension reports every ~15 s; with no report for this long Spotify is assumed closed. */
export const MUSIC_STALE_MS = 90_000;

/** Only covers from Spotify's image CDN are downloaded (the server must not fetch arbitrary URLs). */
export const COVER_HOST = 'i.scdn.co';
export const COVER_URL_PREFIX = `https://${COVER_HOST}/image/`;
/** Spotify's other image hosts (same ids); normalized to COVER_URL_PREFIX before downloading. */
export const SPOTIFY_IMAGE_URL =
  /^https:\/\/(?:i\.scdn\.co|image-cdn-[a-z]+\.spotifycdn\.com)\/image\/([^/?#]+)$/;
export const COVER_ID_PATTERN = /^[0-9a-f]{20,64}$/;
export const COVER_MAX_BYTES = 512 * 1024;
export const COVER_FETCH_TIMEOUT_MS = 8_000;
/** Covers kept in memory (a song change back and forth doesn't download twice). */
export const COVER_CACHE_SIZE = 8;

/** Plausible song tempos (BPM); anything else in a report is dropped. */
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;

/** Text fields are clipped: they only feed a label. */
export const MAX_TEXT_LENGTH = 200;

/** Spicetify extension file name, inside Spicetify's userdata `Extensions` folder. */
export const EXTENSION_FILE = 'javbots-musica.js';
export const EXTENSION_URL_PLACEHOLDER = '__JAVBOTS_URL__';
export const EXTENSION_TOKEN_PLACEHOLDER = '__JAVBOTS_TOKEN__';
export const SPICETIFY_BIN = 'spicetify';
export const SPICETIFY_TIMEOUT_MS = 120_000;

export const LOG_PREFIX = '[Musica]';

/** Route the extension POSTs Spotify's lyrics of the current track to. */
export const MUSIC_LYRICS_API_PATH = '/api/music/lyrics';
/** WebSocket the extension keeps open to receive playback commands (previous / play-pause / next). */
export const MUSIC_CONTROL_PATH = '/api/music/control';
/** Closing code when the control channel's token is wrong (policy violation). */
export const WS_CLOSE_POLICY = 1008;
/** If the extension hasn't sent lyrics this long after a song starts, ask LRCLIB. */
export const LYRICS_FALLBACK_MS = 4_000;
export const LRCLIB_URL = 'https://lrclib.net/api/get';
export const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
/** A search result whose duration differs more than this from the song is another version (or another song). */
export const LRCLIB_MAX_DURATION_GAP_SEC = 15;
export const LRCLIB_USER_AGENT = 'Javbots (https://github.com/DeveloperJGV/Javbots)';
export const LYRICS_FETCH_TIMEOUT_MS = 8_000;
export const LYRICS_MAX_LINES = 400;
export const LYRICS_MAX_LINE_LENGTH = 300;
/** Less text than this (without spaces or ♪) is a placeholder, not lyrics. */
export const LYRICS_MIN_TEXT_LENGTH = 30;
/** Lyrics that arrived before their track report, kept by song. */
export const LYRICS_PENDING_SIZE = 4;

/** Read-only routes of the screen port (`screenPort` in music.json): current song + lyrics, and its cover. */
export const SCREEN_NOW_PATH = '/api/music/now';
export const SCREEN_COVER_PATH = '/api/music/cover';
/** Playback buttons of the screens (POST, music token): the same commands the office sends. */
export const SCREEN_CONTROL_PATH = '/api/music/control';
export const SCREEN_MAX_BODY_BYTES = 1024;

/** Spotify's Web API as a second source (works with Spotify closed here). Login with PKCE: no client secret. */
export const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
/** Permissions the "Playlist del día" needs (a session without them has to connect again). */
export const SPOTIFY_PLAYLIST_SCOPES = [
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-library-modify',
];
export const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
  ...SPOTIFY_PLAYLIST_SCOPES,
].join(' ');
/**
 * Spotify's base URLs can point at a local double (isolated test office) through these variables. Only
 * http://127.0.0.1:<port> or http://localhost:<port> are accepted: a token never travels anywhere else.
 */
export const SPOTIFY_API_URL_ENV = 'JAVBOTS_SPOTIFY_API_URL';
export const SPOTIFY_ACCOUNTS_URL_ENV = 'JAVBOTS_SPOTIFY_ACCOUNTS_URL';
const LOCAL_OVERRIDE = /^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}(?:\/[\w./-]*)?$/;
/** The override in `env[name]` when it is a local URL (without trailing slash), else `fallback`. */
export function spotifyBaseUrl(
  name: string,
  fallback: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[name]?.trim();
  return value && LOCAL_OVERRIDE.test(value) ? value.replace(/\/+$/, '') : fallback;
}
/** A 429 asking to wait longer than this fails at once (the album routes ask for hours). */
export const SPOTIFY_RETRY_MAX_WAIT_SEC = 5;
/** Retries after a short 429 or a 5xx. */
export const SPOTIFY_MAX_RETRIES = 2;

/** "Playlist del día": state file beside music.json. */
export const PLAYLIST_FILE = 'playlists.json';
/** The total lands within this much of the chosen length when there is enough music. */
export const PLAYLIST_DURATION_SLACK_MS = 3 * 60_000;
/** Share of the time for songs to discover when the recipe asks for them. */
export const PLAYLIST_DISCOVER_SHARE = 0.3;
/** Lengths offered by the panel, in minutes. */
export const PLAYLIST_MINUTES = [30, 60, 120];
export const PLAYLIST_RECIPE_NAME_MAX = 40;
export const PLAYLIST_RECIPE_MAX_LISTS = 20;
export const PLAYLIST_RECIPE_MAX_ARTISTS = 5;
export const PLAYLIST_RECIPES_MAX = 30;
/** Oldest decade offered; it also takes everything before it ("70s y antes"). */
export const PLAYLIST_OLDEST_DECADE = 1970;
export const PLAYLIST_NEWEST_DECADE = 2020;
/** Songs in the "don't play again" bin. */
export const PLAYLIST_REJECTED_MAX = 500;
/** Lists of the last days count as "recent" (and removed ones are kept this long only for that). */
export const PLAYLIST_RECENT_DAYS = 7;
/** Owner's lists and top artists are re-read after this. */
export const PLAYLIST_SOURCES_TTL_MS = 10 * 60_000;
/** Songs gathered per source (top, liked, a list…) are reused this long (rerolls don't call Spotify). */
export const PLAYLIST_POOL_TTL_MS = 15 * 60_000;
/** An artist's albums are reused this long (those routes run out of quota fast). */
export const PLAYLIST_ALBUMS_TTL_MS = 24 * 60 * 60_000;
/** Pages (of 100 / 50) read from one list, or from "Me gusta". */
export const PLAYLIST_SOURCE_MAX_PAGES = 5;
export const PLAYLIST_LIKED_MAX_PAGES = 10;
export const PLAYLIST_MY_LISTS_MAX_PAGES = 10;
/** "Sorpréndeme" takes this many of the owner's lists at random. */
export const PLAYLIST_SURPRISE_LISTS = 3;
/** Artists looked into for songs to discover, and albums per artist. */
export const PLAYLIST_DISCOVER_ARTISTS = 3;
export const PLAYLIST_DISCOVER_ALBUMS = 2;
/** Per chosen artist: the newest albums plus one at random. */
export const PLAYLIST_ARTIST_NEWEST_ALBUMS = 2;
export const PLAYLIST_ARTIST_RANDOM_ALBUMS = 1;
/** Spotify's page sizes and batch limit (playlist items: 50 at most since the 2026 API changes). */
export const SPOTIFY_PAGE_ITEMS = 50;
export const SPOTIFY_PAGE_SMALL = 50;
export const SPOTIFY_ARTIST_ALBUMS_LIMIT = 10;
export const SPOTIFY_ADD_BATCH = 100;
export const PLAYLIST_DESCRIPTION = 'Hecha por la oficina';

// ── "Dime qué quieres": a playlist from a typed description (rules, no AI) ──
/** Longest description kept (characters). */
export const PLAYLIST_REQUEST_MAX = 200;
/** Spotify's limit for a playlist description. */
export const SPOTIFY_DESCRIPTION_MAX = 300;
/** Words of the description that go into the playlist's name, and its longest length. */
export const PLAYLIST_REQUEST_NAME_WORDS = 7;
export const PLAYLIST_REQUEST_NAME_MAX = 30;
/** /search answers at most this many per page (2026), and this many pages per track query. */
export const SPOTIFY_SEARCH_LIMIT = 10;
export const PLAYLIST_SEARCH_TRACK_PAGES = 3;
/** Public playlists found by name whose songs it tries to read (Spotify lets read only one's own). */
export const PLAYLIST_SEARCH_PUBLIC_LISTS = 4;
/** The owner's own lists whose name matches the description, read at most. */
export const PLAYLIST_SEARCH_OWN_LISTS = 3;
/** Artists named in the description whose albums are read. */
export const PLAYLIST_SEARCH_ARTISTS = 2;
/** Spotify calls one description may spend (cached reads don't count). */
export const PLAYLIST_SEARCH_MAX_CALLS = 18;
/** Points a song earns per place it was found; the owner's own songs climb. */
export const PLAYLIST_SCORE = {
  publicList: 1.25,
  ownList: 1.5,
  trackSearch: 1.5,
  namedArtist: 2,
  mine: 1,
} as const;
/** Random spread added to the score each roll (rerolls change, the best still lead). */
export const PLAYLIST_SCORE_JITTER = 2.5;
/** "Más canciones" adds this much. */
export const PLAYLIST_IMPROVE_MORE_MS = 30 * 60_000;
/** "Más para descubrir" swaps this share of the songs. */
export const PLAYLIST_IMPROVE_DISCOVER_SHARE = 0.3;
/** /me/library/contains takes this many uris per call; lists are checked at most this often. */
export const SPOTIFY_CONTAINS_MAX = 40;
export const PLAYLIST_CHECK_TTL_MS = 10 * 60_000;
/** Song search while modifying a list: results shown. */
export const PLAYLIST_FOUND_MAX = 10;
/** Longest name for a list (renaming). */
export const PLAYLIST_LIST_NAME_MAX = 100;
/** GET with the music token: sends the browser to Spotify's login. */
export const SPOTIFY_LOGIN_PATH = '/api/music/spotify/login';
/** Where Spotify sends the browser back (register `http://127.0.0.1:<port>` + this in the app's dashboard). */
export const SPOTIFY_CALLBACK_PATH = '/api/music/spotify/callback';
/** How often the account is asked what's playing (only while the extension isn't reporting a playing song). */
export const SPOTIFY_POLL_MS = 4_000;
/** A report from the extension newer than this means Spotify runs on this computer: it stays the source. */
export const SPOTIFY_EXTENSION_FRESH_MS = 20_000;
export const SPOTIFY_FETCH_TIMEOUT_MS = 8_000;
/** Volume buttons without the extension: percent per press. */
export const SPOTIFY_VOLUME_STEP = 10;
