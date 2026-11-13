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

/** Stores that start switched off (server/vigia/constants.ts → DEFAULT_DISABLED_SOURCES): Settings explains why. */
export const OPT_IN_SOURCES: readonly string[] = ['amazon', 'walmart'];
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
