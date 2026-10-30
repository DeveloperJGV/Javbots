import { CABINET_GOLD_COMMITS, CABINET_METAL_COMMITS } from './constants.js';
import { cabinetLevel } from './githubFurniture.js';

/** "hoy", "hace 3 días", "hace 2 meses". */
export function sinceText(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const days = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  if (days < 365) return `hace ${Math.floor(days / 30)} meses`;
  return `hace ${Math.floor(days / 365)} años`;
}

/** Commits needed for the next cabinet level ("12 para metal"), or empty at gold. */
export function nextLevelText(commits: number): string {
  const level = cabinetLevel(commits);
  if (level === 'wood') return `${CABINET_METAL_COMMITS - commits} para metal`;
  if (level === 'metal') return `${CABINET_GOLD_COMMITS - commits} para oro`;
  return '';
}

/** Contributions in the last `days` days of the calendar (its last week ends today). */
export function lastDays(weeks: readonly (readonly number[])[], days: number): number {
  return weeks
    .flat()
    .slice(-days)
    .reduce((sum, n) => sum + n, 0);
}
