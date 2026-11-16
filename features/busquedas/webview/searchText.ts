import type { SearchRequestState, SearchResult } from '../../../core/src/messages.js';

export const STATE_LABELS: Record<SearchRequestState, string> = {
  nuevo: 'Sin buscar',
  buscando: 'Buscando…',
  esperando: 'El agente te espera',
  listo: 'Con resultados',
  error: 'No se pudo lanzar',
};

/** What a "dudoso" result says next to its name (amber, not the red of a discarded one). */
export const DOUBTFUL_LABEL = 'dudoso, revísalo tú';

/** "★ 4.6 (312 reseñas)", or '' without data. */
export function ratingText(r: Pick<SearchResult, 'rating' | 'reviews'>): string {
  const parts: string[] = [];
  if (r.rating !== undefined) parts.push(`★ ${r.rating.toFixed(1)}`);
  if (r.reviews !== undefined) parts.push(`(${r.reviews} reseña${r.reviews === 1 ? '' : 's'})`);
  return parts.join(' ');
}

/** The agent's verdict, best first (same order as the server's readResults). */
const VERDICT_ORDER: Record<SearchResult['verdict'], number> = {
  recomendado: 0,
  dudoso: 1,
  descartado: 2,
};

/** Recommended first, then doubtful, then discarded; what the owner discarded goes last of all. */
export function resultsInOrder(results: readonly SearchResult[]): SearchResult[] {
  const rank = (r: SearchResult) => (r.mark === 'descartado' ? 3 : VERDICT_ORDER[r.verdict]);
  return [...results].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}

/** Phone → tel: link (digits and + only). */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** What the "contacted" mark says in a room: its button and the note on the result. */
export interface MarkLabels {
  contact: string;
  contacted: string;
}

/** The Directorio's words (rooms can bring their own: freelance says "Postulé"). */
export const DEFAULT_MARK_LABELS: MarkLabels = { contact: 'Contacté', contacted: 'contactado' };
