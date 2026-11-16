import type { AccesoView } from '../../../core/src/messages.js';
import type { AccesosStatusView } from './accesosStore.js';
import { HINT_MANY, HINT_OPEN_SUFFIX, LOCAL_URL_PATTERN, PANEL_TITLE } from './constants.js';

/** The hover sign of the table: "<name>: abrir" with one page, "Accesos" otherwise. */
export function accesosHint(status: AccesosStatusView | undefined): string {
  const list = status?.accesos ?? [];
  return list.length === 1 ? `${list[0].name}${HINT_OPEN_SUFFIX}` : HINT_MANY;
}

/** The panel's title: the page's name when there is only one. */
export function panelTitle(status: AccesosStatusView | undefined): string {
  const list = status?.accesos ?? [];
  return list.length === 1 ? list[0].name : PANEL_TITLE;
}

/** Whether an address can become a link (only pages on this computer). */
export const isLocalLink = (url: string): boolean => LOCAL_URL_PATTERN.test(url);

/** Whether any page answers (the candle is lit) or is being started (it sputters). */
export function candleState(status: AccesosStatusView | undefined): 'lit' | 'sputter' | 'out' {
  const list = status?.accesos ?? [];
  if (list.some((a) => a.state === 'on')) return 'lit';
  if (list.some((a) => a.state === 'starting')) return 'sputter';
  return 'out';
}

/** What a page's buttons do now. */
export type AccesoAction = 'open' | 'start' | 'starting' | 'openAnyway' | 'checking';

export function actionOf(a: AccesoView, pendingStart: string | undefined): AccesoAction {
  if (a.state === 'on') return 'open';
  if (a.state === 'starting' || pendingStart === a.id) return 'starting';
  if (a.state === 'unknown') return 'checking';
  return a.canStart ? 'start' : 'openAnyway';
}
