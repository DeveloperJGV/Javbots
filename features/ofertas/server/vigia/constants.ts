/** Fixed numbers and texts of the price watch core. Plain Node: nothing from the office. */

export const LOG_PREFIX = '[Ofertas]';

/** <home>/.pixel-agents/ofertas.json: settings, saved searches, alerts and the keys pasted by hand. */
export const OFERTAS_DIR = '.pixel-agents';
export const OFERTAS_FILE = 'ofertas.json';
export const OFERTAS_FILE_VERSION = 1;
/** An unreadable ofertas.json is kept aside with this suffix and the watch starts clean. */
export const BROKEN_FILE_SUFFIX = '.roto';

const MIN = 60_000;
const HOUR = 60 * MIN;
export const DAY_MS = 24 * HOUR;
export const HOUR_MS = HOUR;

// ── Schedule ─────────────────────────────────────────────────────────────────
export const DEFAULT_EVERY_MINUTES = 45;
/** Sale mode ("Buen Fin"): every watch is checked this often. */
export const BUEN_FIN_EVERY_MINUTES = 12;
export const EVERY_MINUTES_MIN = 10;
export const EVERY_MINUTES_MAX = 720;
/** ±20 % random variation on every schedule, so the checks never fall on a fixed beat. */
export const SCHEDULE_JITTER = 0.2;
/** The timer looks for due watches this often. */
export const TICK_MS = MIN;

// ── Alerts ───────────────────────────────────────────────────────────────────
export const DEFAULT_DROP_PERCENT = 10;
export const DROP_PERCENT_MIN = 1;
export const DROP_PERCENT_MAX = 90;
/** Best price points kept per watch. */
export const HISTORY_CAP = 200;
/** Alerts kept (newest first). */
export const ALERTS_CAP = 50;
/** Community deal ids remembered per watch. */
export const SEEN_DEALS_CAP = 300;
/** Other stores shown next to the best offer. */
export const OTHERS_CAP = 5;
/** The "lowest seen" alert needs at least this many earlier points. */
export const LOWEST_MIN_HISTORY = 2;
/** The store's "before" price is only judged with at least this many points seen. */
export const LIST_PRICE_MIN_HISTORY = 3;
/** Words kept in mustHave / exclude of a watch. */
export const WORD_LIST_CAP = 20;
/**
 * Longest group name ("Bocinas"), and most groups remembered in the order the person gave them. The panel keeps its
 * own GROUP_NAME_MAX (webview/constants.ts) and core/asyncapi.yaml declares both: change the three together.
 */
export const GROUP_NAME_MAX = 40;
export const GROUP_ORDER_CAP = 50;
/** Longest title kept as "the closest result" of a store that had nothing (see StoreCheck.closest). */
export const STORE_CLOSEST_MAX = 160;
/** Longest id, name or detail of a store kept from the file (a damaged or edited file can hold anything). */
export const STORE_TEXT_MAX = 300;
/** Most stores of "dónde buscó" kept per watch from the file (there are about a dozen sources). */
export const STORES_PER_WATCH_MAX = 40;

// ── Verdict ("¿es oferta de verdad?") ────────────────────────────────────────
/** Windows of the office's own history, in days. */
export const VERDICT_SHORT_DAYS = 30;
export const VERDICT_LONG_DAYS = 90;
/** The own history decides only after this many days and points; before that the reason says how few days. */
export const VERDICT_MIN_DAYS = 3;
export const VERDICT_MIN_POINTS = 3;
/** Under its average by this much (%) = good; over it by this much = expensive. */
export const VERDICT_GOOD_BELOW_AVG_PCT = 5;
export const VERDICT_EXPENSIVE_ABOVE_AVG_PCT = 8;
/** The lowest of its window counts as good with at least this much under the average (a 0.1 % dip is not news). */
export const VERDICT_LOWEST_MIN_PCT = 2;
/** The other stores decide with at least this many stores (the one judged included). */
export const VERDICT_MIN_STORES = 3;
/** Under the typical price between stores (median) by this much (%) = good; over it = expensive. */
export const VERDICT_STORES_GOOD_PCT = 10;
export const VERDICT_STORES_EXPENSIVE_PCT = 10;
/** Against the price the person saw by hand: this much (%) either way changes the verdict. */
export const VERDICT_REFERENCE_PCT = 3;
/** "Subió antes de la oferta": a rise this big (%) inside the last days, while the store shows a "before" price. */
export const VERDICT_RAISE_PCT = 10;
export const VERDICT_RAISE_DAYS = 7;
/** The assistant's prices (asistente/) vote with this weight: less than what the office saw itself (1). */
export const VERDICT_ASSISTANT_WEIGHT = 0.5;
/** Against the assistant's typical price: this much (%) either way changes its vote. */
export const VERDICT_ASSISTANT_PCT = 5;
/** An assistant answer older than this (days) no longer counts and is dropped from the file. */
export const ASSISTANT_KEEP_DAYS = 30;
/** Facts in the reason line besides the warning. */
export const VERDICT_REASON_FACTS = 2;

// ── MSI (months without interest) ────────────────────────────────────────────
/** Most months a store offers; anything above is a misread number. */
export const MSI_MONTHS_MAX = 48;
/** Banks named next to an MSI promo in a community title. Only these are said; nothing is guessed. */
export const MSI_BANKS: readonly string[] = [
  'BBVA',
  'Citibanamex',
  'Banamex',
  'Santander',
  'HSBC',
  'Banorte',
  'Scotiabank',
  'Inbursa',
  'American Express',
  'Amex',
  'Banregio',
  'Afirme',
  'Invex',
  'Hey Banco',
  'Banco Azteca',
  'Nu',
  'Mercado Pago',
  'Klar',
  'Stori',
  'Rappicard',
  'Costco Citibanamex',
];

// ── Sources ──────────────────────────────────────────────────────────────────
/** A source that fails waits 15 min, then 30, 60… up to 6 h. */
export const ERROR_BACKOFF_BASE_MS = 15 * MIN;
export const ERROR_BACKOFF_CAP_MS = 6 * HOUR;
/** A source that blocks waits 6 h, then 12… up to 24 h. */
export const BLOCKED_BACKOFF_BASE_MS = 6 * HOUR;
export const BLOCKED_BACKOFF_CAP_MS = 24 * HOUR;
/** A source that does not answer in this time counts as failed. */
export const SOURCE_TIMEOUT_MS = 25_000;

// ── Reading with the browser ("Leer con el navegador", navegador/) ────────────
/** <home>/.pixel-agents/ofertas-navegador/<perfil-al-azar>: the browser's own profile, deleted on close. */
export const NAVEGADOR_DIR = 'ofertas-navegador';
export const NAVEGADOR_PROFILE_PREFIX = 'perfil-';
/** Inside each profile: the PID of the Node process that started that browser (to tell an orphan from a live one). */
export const NAVEGADOR_OWNER_FILE = 'pixel-agents-dueno.pid';
/** Listing the processes to find orphans of the reader (PowerShell on Windows can be slow to start). */
export const NAVEGADOR_LIST_TIMEOUT_MS = 10_000;
/**
 * The stores that can be read with the browser, and the only hosts their main document may be on (https, no port; a
 * redirect to any other host is cut). Not here: Mercado Libre (its API with a key) and Costco (its JSON search was
 * never checked through the browser, which asks for HTML first and may get XML).
 */
export const NAVEGADOR_HOSTS: Readonly<Record<string, readonly string[]>> = {
  elektra: ['www.elektra.mx'],
  cyberpuerta: ['www.cyberpuerta.mx'],
  palacio: ['www.elpalaciodehierro.com'],
  officedepot: ['www.officedepot.com.mx'],
  walmart: ['www.walmart.com.mx'],
  amazon: ['www.amazon.com.mx'],
  promodescuentos: ['www.promodescuentos.com'],
};
/** Marked when the switch is first turned on: the stores that block a plain request. */
export const NAVEGADOR_DEFAULT_SOURCES: readonly string[] = ['amazon', 'palacio', 'elektra'];
/** Random pause between two pages, anywhere in the office (a person does not open pages back to back). */
export const NAVEGADOR_PAUSE_MIN_MS = 20_000;
export const NAVEGADOR_PAUSE_MAX_MS = 40_000;
/** One page: from navigate to having its HTML. */
export const NAVEGADOR_PAGE_TIMEOUT_MS = 30_000;
/** Once loaded, the page gets this long to draw its results before it is read. */
export const NAVEGADOR_SETTLE_MS = 1_500;
/**
 * The browser must answer through its pipe within this time (it usually takes under 1 s). Seen with an empty Windows
 * user folder: the very first start never answered (27 s and 90 s with the port, 40 s with the pipe), and a second
 * start answered in under 1 s. So a start that does not answer is killed and tried once more.
 */
export const NAVEGADOR_LAUNCH_TIMEOUT_MS = 15_000;
export const NAVEGADOR_LAUNCH_TRIES = 2;
/** The request limit of http.ts for a browser read (the page limit plus a little, so the page's own error wins). */
export const NAVEGADOR_FETCH_TIMEOUT_MS = NAVEGADOR_PAGE_TIMEOUT_MS + 2_000;
/** What a source may take once its turn came (replaces SOURCE_TIMEOUT_MS: the queue does not count). */
export const NAVEGADOR_TURN_TIMEOUT_MS = NAVEGADOR_PAGE_TIMEOUT_MS + 5_000;
/** One command of the debugging protocol. */
export const NAVEGADOR_CDP_TIMEOUT_MS = 10_000;
/**
 * After this the browser is closed as soon as the turn in course is released (the next one opens a new one). Past the
 * hard limit it is closed even mid-page; that page counts as interrupted, not as the store failing.
 */
export const NAVEGADOR_MAX_LIFE_MS = 10 * MIN;
export const NAVEGADOR_HARD_LIFE_MS = 15 * MIN;
/** Largest page (characters of HTML, or bytes of a raw answer) that is read; a bigger one is an error. */
export const NAVEGADOR_MAX_BODY = 5 * 1024 * 1024;
/** Profiles left behind (a crash, the program killed) older than this are deleted on the next launch. */
export const NAVEGADOR_STALE_PROFILE_MS = 2 * HOUR;
/** Waits for the browser to close by itself before killing its process tree. */
export const NAVEGADOR_CLOSE_WAIT_MS = 5_000;
/** Deleting the profile: Windows keeps files busy (EBUSY) for a moment after the browser exits. */
export const NAVEGADOR_RM_TRIES = 10;
export const NAVEGADOR_RM_WAIT_MS = 500;
/** JavaScript memory of each page of the browser (MB). */
export const NAVEGADOR_JS_HEAP_MB = 512;
/** A store read with the browser is asked at most this often per watch (Amazon keeps its own 6 h). */
export const NAVEGADOR_MIN_INTERVAL_MS = 3 * HOUR;
/** A final page on the store's own host with this path is a sign-in wall ("/ap/signin" on Amazon). */
export const NAVEGADOR_LOGIN_PATH =
  /^\/(ap\/signin|signin|login|iniciar-sesion|account\/login)(\/|$)/i;

// ── Relevance ────────────────────────────────────────────────────────────────
/** Query words that never decide relevance (articles, prepositions). */
export const STOP_WORDS: readonly string[] = [
  'el',
  'la',
  'los',
  'las',
  'lo',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'a',
  'en',
  'con',
  'y',
  'e',
  'o',
  'u',
  'por',
  'sin',
  'su',
  'sus',
  'mi',
  'the',
  'of',
  'and',
  'with',
  'for',
  'in',
];

/**
 * Words that mark an accessory or a spare part. A title with any of them is dropped unless the query itself has
 * the word ("funda iphone" keeps the cases).
 */
export const DEFAULT_EXCLUDE: readonly string[] = [
  // A single word also matches its plural (sameWord in relevance.ts); feminine forms and plurals of phrases are listed
  'funda',
  'carcasa',
  'case',
  'cover',
  'protector',
  'mica',
  'cristal templado',
  'cristales templados',
  'vidrio templado',
  'vidrios templados',
  'refaccion',
  'repuesto',
  'almohadilla',
  'almohadillas',
  'estuche',
  'skin',
  'sticker',
  'calcomania',
  'vinil',
  'adaptador',
  // "compatible con" is not here: a real product says "Compatible con Dolby Atmos" after its name. An accessory says
  // it before the product it fits ("Cable compatible con …"), and FOR_MARKERS drops that one.
  'replacement',
  'reemplazo',
  'usado',
  'usada',
  'reacondicionado',
  'reacondicionada',
  'caja vacia',
  'cajas vacias',
];

/** Phrases that name what comes in the box, not an accessory sold alone: removed before the exclude check. */
export const BUNDLE_PHRASES: readonly string[] = [
  'estuche de carga',
  'case de carga',
  'con estuche',
  'estuche incluido',
  'con funda',
  'funda incluida',
  'incluye funda',
  'con protector',
  'protector incluido',
];

/**
 * Words after which the product named is the one the item is FOR ("cable para Sony WH-1000XM5", "control para
 * PS5"). A title is dropped when none of the searched words or models shows up before the first of them.
 */
export const FOR_MARKERS: readonly string[] = ['para', 'compatible', 'compatibles', 'for', 'p'];

/** A searched word may be split across this many title tokens ("TP-Link" → "tp" "link" is "tplink"), and back. */
export const JOIN_MAX_TOKENS = 3;
/** Letter-only tokens this short glue to the number that follows ("wh 1000xm5" → "wh1000xm5"). */
export const MODEL_PREFIX_MAX = 3;
/** Units that are not a model ("40h", "5w", "2024"). Storage (gb/tb) does tell models apart. */
export const NOT_MODEL_UNIT = /^\d+(h|hr|hrs|horas|mah|w|hz|khz|mm|cm|m|v|db|pulgadas|in|x)?$/;
/** Units glued to the number before them ("128 gb" → "128gb"). */
export const MODEL_UNITS: readonly string[] = ['gb', 'tb'];

// ── Grouping ─────────────────────────────────────────────────────────────────
/** Word overlap (Jaccard) needed to join two titles with the same model. */
export const GROUP_SIMILARITY_WITH_MODEL = 0.35;
/** Without a model the titles must be almost the same. */
export const GROUP_SIMILARITY_NO_MODEL = 0.8;

// ── Notifiers ────────────────────────────────────────────────────────────────
export const NTFY_DEFAULT_SERVER = 'https://ntfy.sh';
export const NOTIFICATION_TITLE = 'Ofertas';
/** Generic: nothing about the person or the office goes out. */
export const USER_AGENT = 'Mozilla/5.0 (compatible; price-watch/1.0)';
/** A topic is a name only (ntfy: letters, digits, - and _). */
export const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// ── Texts the person reads ───────────────────────────────────────────────────
export const TEXT = {
  noAnswer: 'No contestó',
  blocked: 'Bloqueó la consulta',
  noKey: 'Falta la llave',
  off: 'Apagada',
  pausedBlocked: 'bloqueó',
  pausedError: 'falló',
  noStoreAnswered: 'Ninguna tienda contestó',
  noStoreHasIt: 'Ninguna tienda lo tiene',
  /** A source that is only linked because its robots.txt does not allow reading its search with programs. */
  robotsLinkOnly:
    'Su robots.txt no permite leer su búsqueda con programas: la oficina no la consulta, ábrela tú',
  /** A store that is only a link (it blocks programs or needs its page to run). */
  linkOnly: 'La oficina no la lee: ábrela tú',
  emptyQuery: 'Escribe qué buscar',
  noBrowser: 'No encontré Edge ni Chrome en esta máquina',
  browserTooBig: 'La página de la tienda es demasiado grande para leerla',
  browserAccount: 'Edge abrió con una cuenta iniciada; no se leyó nada por seguridad',
  browserFailed: 'No pude abrir el navegador',
  browserOffsite: 'La tienda mandó a otro sitio',
  browserLogin: 'La tienda pidió iniciar sesión',
  browserSlow: 'La tienda tardó demasiado en cargar en el navegador',
  browserNoPage: 'El navegador no recibió la página de la tienda',
  browserGetOnly: 'El navegador solo abre páginas',
  browserClosed: 'Se cerró el navegador',
  lowestEver: 'El más bajo que ha visto la oficina',
} as const;

/**
 * Sources that start switched off: their sites do not allow automated reading (terms of use, bot walls), so reading
 * them is the owner's explicit choice in Settings, never the factory default.
 */
export const DEFAULT_DISABLED_SOURCES: readonly string[] = ['amazon'];
