export const LOG_PREFIX = '[Ofertas]';

/** Title of the desktop notification for a price alert. */
export const NOTIFICATION_TITLE = 'Ofertas';

/** Longest search a client may ask for (characters, after trimming). */
export const OFERTAS_QUERY_MAX = 120;
/** Most words in a watch's "must have" or "exclude" list. */
export const OFERTAS_WORDS_MAX = 12;
/** Longest single word in those lists (characters). */
export const OFERTAS_WORD_MAX_LENGTH = 40;

/** Longest watch id, search id or product key the assistant's messages may carry. */
export const ASISTENTE_IDS_MAX = 64;
/** Live searches remembered so the assistant's price can re-judge one of their products. */
export const ASISTENTE_SEARCHES_KEPT = 8;

/** Feature name on the connections board. */
export const CONNECTIONS_FEATURE = 'Ofertas';
export const CONNECTIONS_PURPOSE = 'Buscar y vigilar precios';
/** Prefix of a source's id on the connections board. */
export const CONNECTIONS_ID_PREFIX = 'ofertas-';
/** Put before the detail of a source that reads a page that is not an API. */
export const FRAGILE_PREFIX = 'Frágil: ';
/** Detail of every source when a whole search failed. */
export const SEARCH_FAILED_DETAIL = 'No se pudo buscar';
/** Detail of a fragile source that has said nothing yet. */
export const FRAGILE_DEFAULT_DETAIL = 'lee una página, no una API';
