/** The only hosts the covers feature talks to. */
export const LIBRETRO_HOST = 'thumbnails.libretro.com';
export const TWITCH_AUTH_HOST = 'id.twitch.tv';
export const IGDB_API_HOST = 'api.igdb.com';
export const IGDB_IMAGES_HOST = 'images.igdb.com';
export const COVER_HOSTS: ReadonlySet<string> = new Set([
  LIBRETRO_HOST,
  TWITCH_AUTH_HOST,
  IGDB_API_HOST,
  IGDB_IMAGES_HOST,
]);

/** A generic browser-like User-Agent: nothing about the person or the office. */
export const COVER_USER_AGENT = 'Mozilla/5.0 (compatible)';

/** Time limits (ms): a request, and a folder listing (PS1's is about 2.5 MB of HTML). */
export const REQUEST_TIMEOUT_MS = 10_000;
export const LISTING_TIMEOUT_MS = 30_000;
/** Byte caps: an image (downloaded or uploaded), a folder listing, an API answer. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const LISTING_MAX_BYTES = 6 * 1024 * 1024;
export const API_MAX_BYTES = 512 * 1024;
/** One request per second per source, at most. */
export const SOURCE_INTERVAL_MS = 1000;
/** A folder listing saved on disk is used for this long. */
export const LISTING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A listing that failed is not asked for again before this (so a run does not retry it for every game). */
export const LISTING_RETRY_MS = 5 * 60 * 1000;
/** The IGDB token is renewed this long before it expires. */
export const TOKEN_MARGIN_MS = 60_000;

/** Under ~/.pixel-agents/: covers, cached listings, candidate thumbnails, the IGDB key. */
export const COVERS_DIR = ['coleccion', 'portadas'] as const;
export const LISTINGS_DIR = '.listados';
export const CANDIDATES_DIR = '.candidatas';
export const IGDB_KEY_FILE = 'coleccion-igdb.json';

export type NetProblem =
  'no-permitido' | 'sin-respuesta' | 'redireccion' | 'demasiado-grande' | 'http' | 'llave';

/** What a failed request says (never the address). */
export const NET_PROBLEM_TEXT: Record<NetProblem, string> = {
  'no-permitido': 'dirección no permitida',
  'sin-respuesta': 'no contestó a tiempo',
  redireccion: 'quiso mandar a otra dirección',
  'demasiado-grande': 'la respuesta pasa del tamaño máximo',
  http: 'contestó con un error',
  llave: 'la llave de IGDB no funcionó',
};

/**
 * libretro-thumbnails folder of each console (checked against https://thumbnails.libretro.com/ on 2026-11-16).
 * Consoles left out have no folder there: Xbox One, Xbox Series, PS5, Switch, Switch 2, PC.
 */
export const LIBRETRO_FOLDERS: Readonly<Record<string, string>> = {
  a2600: 'Atari - 2600',
  intv: 'Mattel - Intellivision',
  coleco: 'Coleco - ColecoVision',
  a7800: 'Atari - 7800',
  nes: 'Nintendo - Nintendo Entertainment System',
  sms: 'Sega - Master System - Mark III',
  gb: 'Nintendo - Game Boy',
  genesis: 'Sega - Mega Drive - Genesis',
  tg16: 'NEC - PC Engine - TurboGrafx 16',
  neogeo: 'SNK - Neo Geo',
  gg: 'Sega - Game Gear',
  snes: 'Nintendo - Super Nintendo Entertainment System',
  segacd: 'Sega - Mega-CD - Sega CD',
  '32x': 'Sega - 32X',
  gbc: 'Nintendo - Game Boy Color',
  '3do': 'The 3DO Company - 3DO',
  jaguar: 'Atari - Jaguar',
  saturn: 'Sega - Saturn',
  vboy: 'Nintendo - Virtual Boy',
  ps1: 'Sony - PlayStation',
  n64: 'Nintendo - Nintendo 64',
  ngpc: 'SNK - Neo Geo Pocket Color',
  dreamcast: 'Sega - Dreamcast',
  ps2: 'Sony - PlayStation 2',
  gba: 'Nintendo - Game Boy Advance',
  xbox: 'Microsoft - Xbox',
  gc: 'Nintendo - GameCube',
  ds: 'Nintendo - Nintendo DS',
  psp: 'Sony - PlayStation Portable',
  x360: 'Microsoft - Xbox 360',
  ps3: 'Sony - PlayStation 3',
  wii: 'Nintendo - Wii',
  '3ds': 'Nintendo - Nintendo 3DS',
  psvita: 'Sony - PlayStation Vita',
  wiiu: 'Nintendo - Wii U',
  ps4: 'Sony - PlayStation 4',
};
/** Folders with only a handful of boxes (Xbox 360: 12 files, PS3: 67, on 2026-11-16). */
export const LIBRETRO_FEW: ReadonlySet<string> = new Set(['x360', 'ps3']);

/**
 * IGDB platform names per console, compared ignoring case and punctuation. NOT checked against IGDB (its
 * documentation only states the id 48 = PlayStation 4): a result whose platforms match none is never used.
 */
export const IGDB_PLATFORM_NAMES: Readonly<Record<string, readonly string[]>> = {
  a2600: ['Atari 2600'],
  intv: ['Intellivision'],
  coleco: ['ColecoVision'],
  a7800: ['Atari 7800'],
  nes: ['Nintendo Entertainment System', 'Family Computer'],
  sms: ['Sega Master System/Mark III', 'Sega Master System'],
  gb: ['Game Boy'],
  genesis: ['Sega Mega Drive/Genesis', 'Sega Genesis', 'Sega Mega Drive'],
  tg16: ['TurboGrafx-16/PC Engine', 'TurboGrafx-16', 'PC Engine'],
  neogeo: ['Neo Geo AES', 'Neo Geo MVS', 'Neo Geo'],
  gg: ['Sega Game Gear', 'Game Gear'],
  snes: ['Super Nintendo Entertainment System', 'Super Famicom'],
  segacd: ['Sega CD', 'Sega Mega-CD'],
  '32x': ['Sega 32X'],
  gbc: ['Game Boy Color'],
  '3do': ['3DO Interactive Multiplayer', '3DO'],
  jaguar: ['Atari Jaguar'],
  saturn: ['Sega Saturn'],
  vboy: ['Virtual Boy'],
  ps1: ['PlayStation'],
  n64: ['Nintendo 64'],
  ngpc: ['Neo Geo Pocket Color'],
  dreamcast: ['Dreamcast', 'Sega Dreamcast'],
  ps2: ['PlayStation 2'],
  gba: ['Game Boy Advance'],
  xbox: ['Xbox'],
  gc: ['Nintendo GameCube', 'GameCube'],
  ds: ['Nintendo DS'],
  psp: ['PlayStation Portable', 'PSP'],
  x360: ['Xbox 360'],
  ps3: ['PlayStation 3'],
  wii: ['Wii'],
  '3ds': ['Nintendo 3DS'],
  psvita: ['PlayStation Vita'],
  wiiu: ['Wii U'],
  ps4: ['PlayStation 4'],
  xone: ['Xbox One'],
  switch: ['Nintendo Switch'],
  xsx: ['Xbox Series X|S', 'Xbox Series X', 'Xbox Series'],
  ps5: ['PlayStation 5'],
  switch2: ['Nintendo Switch 2'],
  pc: ['PC (Microsoft Windows)', 'PC'],
};

/** An IGDB image id: letters and digits only (it goes into an address). */
export const IGDB_IMAGE_ID_PATTERN = /^[a-z0-9]{1,64}$/;
/** A Twitch app client id or secret: letters, digits, dashes and underscores. */
export const IGDB_KEY_PATTERN = /^[A-Za-z0-9_-]{6,128}$/;
/** Results asked of IGDB per search. */
export const IGDB_LIMIT = 10;
/** Other names kept per IGDB result (it can list dozens). */
export const IGDB_ALT_NAMES_MAX = 20;
