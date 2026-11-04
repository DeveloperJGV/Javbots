import type { SearchRequestState, SearchResult } from '../../../core/src/messages.js';

export const STATE_LABELS: Record<SearchRequestState, string> = {
  nuevo: 'Sin buscar',
  buscando: 'Buscando…',
  esperando: 'El agente te espera',
  listo: 'Con resultados',
  error: 'No se pudo lanzar',
};

/** "★ 4.6 (312 reseñas)", or '' without data. */
export function ratingText(r: Pick<SearchResult, 'rating' | 'reviews'>): string {
  const parts: string[] = [];
  if (r.rating !== undefined) parts.push(`★ ${r.rating.toFixed(1)}`);
  if (r.reviews !== undefined) parts.push(`(${r.reviews} reseña${r.reviews === 1 ? '' : 's'})`);
  return parts.join(' ');
}

/** Recommended first, then discarded; what the owner discarded goes last of all. */
export function resultsInOrder(results: readonly SearchResult[]): SearchResult[] {
  const rank = (r: SearchResult) =>
    r.mark === 'descartado' ? 2 : r.verdict === 'descartado' ? 1 : 0;
  return [...results].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
}

/** Phone → tel: link (digits and + only). */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
