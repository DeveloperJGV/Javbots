import type { UsageLimit, UsageProfile } from '../../../core/src/messages.js';
import { MAIN_OFFICE, type OfficeDef, sitsInOffice } from '../../../core/src/offices.js';
import { SPOTLIGHT_MODEL } from './constants.js';

export const PROFILE_LABELS: Record<string, string> = {
  personal: 'Personal',
  trabajo: 'Trabajo',
};

export type UsageLevel = 'ok' | 'warn' | 'danger';

/** How full a limit is (same thresholds as the statusline: 50 / 80). */
export function usageLevel(pct: number): UsageLevel {
  if (pct >= 80) return 'danger';
  if (pct >= 50) return 'warn';
  return 'ok';
}

const LEVEL_CLASS: Record<UsageLevel, string> = {
  ok: 'bg-status-success',
  warn: 'bg-warning',
  danger: 'bg-danger',
};

/** Tailwind background class by how full the limit is. */
export function levelClass(pct: number): string {
  return LEVEL_CLASS[usageLevel(pct)];
}

/** "2 h 15 min", "40 min", "3 d 4 h". */
export function untilText(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60_000));
  if (min >= 24 * 60) return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;
  if (min >= 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${min} min`;
}

export function limitText(label: string, l: UsageLimit | undefined, now?: Date): string {
  if (!l) return `${label} —`;
  const until = untilText(l.resetsAt, now);
  return `${label} ${Math.round(l.pct)}%${until ? ` · se reinicia en ${until}` : ''}`;
}

/** The profile for the bar: `preferred` (the personal one) if it has limits, else the first one with limits, else
 *  any. */
export function mainProfile(
  profiles: readonly UsageProfile[],
  preferred = 'personal',
): UsageProfile | undefined {
  return (
    profiles.find((p) => p.profile === preferred && (p.fiveHour || p.sevenDay)) ??
    profiles.find((p) => p.fiveHour || p.sevenDay) ??
    profiles.find((p) => p.profile === preferred) ??
    profiles[0]
  );
}

/**
 * What the page shows of the usage in its office (core/src/offices.ts): only the profiles whose agents sit there
 * (nothing of another office shows), and the office's own profile first. Without extra offices, everything.
 */
export function officeUsage(
  profiles: readonly UsageProfile[],
  office: string = MAIN_OFFICE,
  offices: readonly OfficeDef[] = [],
): { profiles: UsageProfile[]; preferred: string } {
  const here = profiles.filter((p) => sitsInOffice(p.profile, office, offices));
  return {
    profiles: here,
    preferred: offices.find((o) => o.id === office)?.mainProfile ?? 'personal',
  };
}

const WINDOW_LABELS: Record<string, string> = { five_hour: '5 horas', seven_day: 'Semana' };

/** "seven_day_fable" → "Semana · Fable"; unknown windows keep Claude Code's name. */
export function limitLabel(key: string): string {
  const window = Object.keys(WINDOW_LABELS).find((w) => key === w || key.startsWith(`${w}_`));
  if (!window) return key.replace(/_/g, ' ');
  const rest = key.slice(window.length + 1);
  return rest
    ? `${WINDOW_LABELS[window]} · ${rest.charAt(0).toUpperCase()}${rest.slice(1).replace(/_/g, ' ')}`
    : WINDOW_LABELS[window];
}

/** Family of a model name ("Fable 5.1", "claude-opus-5-5" → "Fable", "Opus"); unknown names stay as they are. */
export function modelFamily(model: string | undefined): string {
  if (!model) return 'Sin modelo';
  const known = ['Fable', 'Opus', 'Sonnet', 'Haiku'].find((f) =>
    model.toLowerCase().includes(f.toLowerCase()),
  );
  return known ?? model;
}

/** Fable's own weekly limit ("seven_day_fable"), when Claude Code reports one. */
export function spotlightLimit(p: UsageProfile | undefined): UsageLimit | undefined {
  const name = SPOTLIGHT_MODEL.toLowerCase();
  return p?.otherLimits?.find((l) => l.key.startsWith('seven_day') && l.key.includes(name));
}

/** Cost and tokens per model family, most expensive first; Fable always has a row (0 when unused). */
export function costByModel(
  p: UsageProfile,
): Array<{ model: string; costUsd: number; tokens: number; sessions: number }> {
  const by = new Map<
    string,
    { model: string; costUsd: number; tokens: number; sessions: number }
  >();
  for (const s of p.sessions) {
    const model = modelFamily(s.model);
    const row = by.get(model) ?? { model, costUsd: 0, tokens: 0, sessions: 0 };
    row.costUsd += s.costUsd ?? 0;
    row.tokens += s.tokens ?? 0;
    row.sessions += 1;
    by.set(model, row);
  }
  if (!by.has(SPOTLIGHT_MODEL))
    by.set(SPOTLIGHT_MODEL, { model: SPOTLIGHT_MODEL, costUsd: 0, tokens: 0, sessions: 0 });
  return [...by.values()]
    .map((r) => ({ ...r, costUsd: Math.round(r.costUsd * 100) / 100 }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

export function totalCost(p: UsageProfile): number {
  return Math.round(p.sessions.reduce((sum, s) => sum + (s.costUsd ?? 0), 0) * 100) / 100;
}

export function tokensText(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(n);
}
