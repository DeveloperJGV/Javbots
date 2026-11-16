/** The kiosk that opens the deals panel: stored off in the layout, drawn on while there are unseen alerts. */
export const OFERTAS_KIOSK_TYPE = 'OFERTAS_KIOSK';
export const OFERTAS_KIOSK_ON_TYPE = 'OFERTAS_KIOSK_ON';
export const OFERTAS_PANEL_TYPES: readonly string[] = [OFERTAS_KIOSK_TYPE, OFERTAS_KIOSK_ON_TYPE];

/** Opening the page with this hash opens the panel (a link, or a check script, without the kiosk). */
export const OFERTAS_OPEN_HASH = '#ofertas';

/** The panel's tabs, in order. */
export const OFERTAS_TABS = ['buscar', 'vigilando', 'avisos', 'ajustes'] as const;
export type OfertasTab = (typeof OFERTAS_TABS)[number];

/** Choices in the settings tab. */
export const EVERY_MINUTES_OPTIONS: readonly number[] = [30, 45, 60, 120, 180];
export const DROP_PERCENT_OPTIONS: readonly number[] = [5, 10, 15, 20, 30];

/** Longest query, and longest list of words, the panel lets you write. */
export const QUERY_MAX = 120;
export const WORDS_MAX = 200;

/** Other stores shown under each result group, and deals shown from the community. */
export const OTHER_OFFERS_MAX = 6;
export const DEALS_MAX = 8;

/** The watch's mini chart (SVG px, drawn with crisp edges). */
export const CHART_WIDTH = 120;
export const CHART_HEIGHT = 32;
export const CHART_PAD = 3;
export const CHART_LINE_COLOR = 'var(--color-accent-bright)';
export const CHART_LOW_COLOR = 'var(--color-status-success)';
export const CHART_GRID_COLOR = 'var(--color-border)';
/** Side of the square that marks the lowest point. */
export const CHART_LOW_MARK = 4;

/** The "¿Seguro?" of the Quitar button goes back after this long. */
export const CONFIRM_RESET_MS = 4000;
/** "hace N min" refreshes this often while the panel is open. */
export const PANEL_TICK_MS = 30_000;

// ── Groups ("Bocinas", "Receptor"…) ──────────────────────────────────────────
/** The name shown for watches without a group (always last). */
export const NO_GROUP_LABEL = 'Sin grupo';
/**
 * Longest group name the panel lets you write. Kept twice on purpose: the panel only depends on core/, so it cannot
 * import the server's GROUP_NAME_MAX (server/vigia/constants.ts); core/asyncapi.yaml declares the same maxLength.
 */
export const GROUP_NAME_MAX = 40;
/** Which groups are folded, remembered per browser (a convenience: it may be lost). */
export const FOLDED_GROUPS_KEY = 'pixel-agents.ofertas.gruposPlegados';
/**
 * A suggested group from what the product IS (normalized words: no accents, lower case). `head` words count only
 * among the first words of the title, where a title says what it is ("Pantalla 55 4K…"): further on they describe
 * something else ("Laptop … pantalla 15.6", "Cámara WiFi"). `words` only name that kind of product, so they count
 * anywhere before "para" / "compatible con". The specific rules go first; in doubt, nothing is suggested. A
 * suggestion only: the person accepts it with a click.
 */
export const GROUP_SUGGESTIONS: readonly {
  group: string;
  words: readonly string[];
  head?: readonly string[];
}[] = [
  { group: 'Barra de sonido', words: ['barra de sonido', 'soundbar', 'sound bar'] },
  { group: 'Subwoofer', words: ['subwoofer', 'sub woofer'] },
  { group: 'Tocadiscos', words: ['tocadiscos', 'turntable', 'tornamesa'] },
  { group: 'Tableta', words: ['tablet', 'tableta', 'ipad'] },
  { group: 'Celular', words: ['smartphone', 'iphone'], head: ['celular', 'telefono'] },
  {
    group: 'Computadora',
    words: ['laptop', 'notebook', 'macbook', 'chromebook', 'computadora portatil'],
    head: ['computadora', 'pc'],
  },
  {
    group: 'Consola',
    words: ['playstation', 'ps5', 'xbox', 'nintendo switch'],
    head: ['consola', 'nintendo'],
  },
  {
    group: 'Receptor',
    words: ['receiver', 'av receiver', 'receptor av', 'receptor a v'],
    head: ['receptor', 'amplificador', 'amplifier', 'amp', 'preamplificador'],
  },
  {
    group: 'Audífonos',
    words: ['audifono', 'audifonos', 'auricular', 'auriculares', 'headphones', 'earbuds'],
    head: ['diadema', 'in ear'],
  },
  {
    group: 'Bocinas',
    words: [
      'bocina',
      'bocinas',
      'altavoz',
      'altavoces',
      'parlante',
      'speaker',
      'speakers',
      'bookshelf',
    ],
    head: ['monitor de estudio', 'monitores de estudio', 'columna'],
  },
  {
    group: 'Red',
    words: [
      'router',
      'access point',
      'punto de acceso',
      'switch de red',
      'sistema mesh',
      'wifi mesh',
      'wi fi mesh',
      'mesh wifi',
      'mesh wi fi',
    ],
    head: ['repetidor', 'extensor', 'sistema wifi', 'sistema wi fi', 'sistema de malla', 'mesh'],
  },
  {
    group: 'Televisión',
    words: ['television', 'televisor', 'smart tv'],
    head: ['pantalla', 'tv', 'proyector'],
  },
];

/**
 * A title that starts with one of these is a thing of its own kind (an accessory, a watch, a camera…): no group is
 * suggested, even if it names another product further on ("Cargador iPhone 15", "Correa de malla").
 */
export const NO_SUGGESTION_HEADS: readonly string[] = [
  'funda',
  'carcasa',
  'case',
  'cargador',
  'cable',
  'correa',
  'soporte',
  'base',
  'adaptador',
  'control',
  'mica',
  'protector',
  'estuche',
  'kit',
  'refaccion',
  'repuesto',
  'camara',
  'reloj',
  'smartwatch',
];
/** How many first words of a title may say what it is (a brand may come before: "JBL Bocina…"). */
export const SUGGESTION_HEAD_WORDS = 3;
/** After these words the title names what the item is FOR, not what it is. */
export const SUGGESTION_STOP_WORDS: readonly string[] = [
  'para',
  'compatible',
  'compatibles',
  'for',
  'con',
];

/** The exact steps to get a source's free key, by source id (Ajustes shows them while it is missing). */
export const KEY_STEPS: Readonly<Record<string, readonly string[]>> = {
  mercadolibre: [
    'Entra a developers.mercadolibre.com.mx/devcenter con tu cuenta de Mercado Libre y crea una aplicación (cualquier nombre; redirección https://localhost).',
    'Copia su App ID y su Secret key a ~/.pixel-agents/ofertas.json: { "llaves": { "mercadolibre": { "clientId": "…", "clientSecret": "…" } } }.',
    'La siguiente búsqueda ya la usa, sin reiniciar. Si Mercado Libre la rechaza aun con llave, aquí lo dice.',
  ],
};

// ── "Dónde buscó" ─────────────────────────────────────────────────────────────
/** A query this short (words) gets no "prueba con menos palabras". */
export const FEWER_WORDS_MIN = 3;

/** Stores that start switched off (server/vigia/constants.ts → DEFAULT_DISABLED_SOURCES): Settings explains why. */
export const OPT_IN_SOURCES: readonly string[] = ['amazon'];
export const OPT_IN_SOURCE_NOTE =
  'Su sitio no permite lectura automática. Si la prendes, la oficina la consulta pocas veces al día.';

// ── "¿Es oferta de verdad?" ──────────────────────────────────────────────────
/** Price history of an Amazon product on Keepa (11 = Amazon México). Only a link: Keepa is never called. */
export const KEEPA_PRODUCT_URL = 'https://keepa.com/#!product/11-';
/** An Amazon product id (ASIN) inside its /dp/ link. */
export const AMAZON_ASIN_RE = /\/dp\/([A-Z0-9]{10})/;
/** Profeco's comparator: the Buen Fin one until the sale ends, then "Quién es Quién en los Precios". */
export const PROFECO_BUEN_FIN_URL = 'https://elbuenfin.profeco.gob.mx/';
export const PROFECO_QQP_URL = 'https://qqp.profeco.gob.mx/';
/** First moment (local) the Buen Fin comparator stops being the one linked: 18 Nov 2026, 00:00. */
export const PROFECO_BUEN_FIN_UNTIL = new Date(2026, 10, 18).getTime();
export const PROFECO_LINK_NAME = 'Comparador de Profeco';

/** What "Lo vende la tienda" and "Revendedor" mean, on hover. */
export const SELLER_STORE_TITLE =
  'La vende la tienda misma o la tienda oficial de la marca dentro de ella, no un vendedor externo';
export const SELLER_RESELLER_TITLE =
  'La vende un vendedor externo dentro de la tienda; sus bajas no cuentan como bajas de la tienda';
export const SELLER_UNKNOWN_TITLE =
  'La página de resultados de la tienda no dice quién lo vende; ábrelo para verlo';
export const MSI_TITLE =
  'Lo dice la tienda para este producto. El banco y el monto mínimo dependen de la promoción: revisa las condiciones';

// ── The optional assistant ───────────────────────────────────────────────────
/** "Buscando a mano… 0:42" refreshes this often. */
export const ASISTENTE_TICK_MS = 1000;
/** The models Ajustes offers (the server accepts only these). */
export const ASISTENTE_MODELS: readonly { id: string; label: string }[] = [
  { id: 'haiku', label: 'Haiku' },
  { id: 'sonnet', label: 'Sonnet' },
];
export const ASISTENTE_SETTINGS_NOTE =
  'Usa tu suscripción; cada consulta tarda cerca de un minuto.';
export const ASISTENTE_BUSY_TITLE = 'El asistente está ocupado con otra consulta';
