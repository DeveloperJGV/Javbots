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
export const LRCLIB_USER_AGENT = 'Javbots (https://github.com/DeveloperJGV/Javbots)';
export const LYRICS_FETCH_TIMEOUT_MS = 8_000;
export const LYRICS_MAX_LINES = 400;
export const LYRICS_MAX_LINE_LENGTH = 300;
/** Less text than this (without spaces or ♪) is a placeholder, not lyrics. */
export const LYRICS_MIN_TEXT_LENGTH = 30;
/** Lyrics that arrived before their track report, kept by song. */
export const LYRICS_PENDING_SIZE = 4;
