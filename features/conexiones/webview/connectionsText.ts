import type { ConnectionInfo } from '../../../core/src/messages.js';
import { STATE_ORDER } from './constants.js';

/** "hace 5 min", "hace 3 h", "hace 2 días"; empty without a date. */
export function sinceText(iso: string | undefined, now: Date): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** Connections grouped by office feature (in the order they first appear), attention first inside each group. */
export function byFeature(
  connections: readonly ConnectionInfo[],
): Array<{ feature: string; items: ConnectionInfo[] }> {
  const groups = new Map<string, ConnectionInfo[]>();
  for (const c of connections) {
    const list = groups.get(c.feature) ?? [];
    list.push(c);
    groups.set(c.feature, list);
  }
  const rank = (c: ConnectionInfo) => STATE_ORDER.indexOf(c.state);
  return [...groups].map(([feature, items]) => ({
    feature,
    items: [...items].sort((a, b) => rank(a) - rank(b)),
  }));
}

/** "9 conexiones · 6 funcionando · 1 por atender · 2 ideas" */
export function summaryText(connections: readonly ConnectionInfo[]): string {
  const count = (s: ConnectionInfo['state']) => connections.filter((c) => c.state === s).length;
  const parts = [`${connections.length} conexiones`, `${count('ok')} funcionando`];
  if (count('warn')) parts.push(`${count('warn')} por atender`);
  if (count('off')) parts.push(`${count('off')} sin conectar`);
  if (count('idea')) parts.push(`${count('idea')} ${count('idea') === 1 ? 'idea' : 'ideas'}`);
  return parts.join(' · ');
}
