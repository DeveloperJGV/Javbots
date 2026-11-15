import { platformById } from '../core/platforms.js';
import type { Shelf } from '../core/shelves.js';
import { agoText, daysBetween } from '../core/tonight.js';
import type { Game } from '../core/types.js';
import {
  CONDITION_LABEL,
  DUST_DAYS,
  LENGTH_LABEL,
  NEW_STAR_DAYS,
  PROGRESS_LABEL,
  REGION_LABEL,
} from './constants.js';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 juegos · 4 consolas · 3 se buscan" (the header). */
export function summaryParts(t: { owned: number; wanted: number; platforms: number }): {
  owned: string;
  platforms: string;
  wanted: string;
} {
  return {
    owned: plural(t.owned, 'juego', 'juegos'),
    platforms: plural(t.platforms, 'consola', 'consolas'),
    wanted: t.wanted ? `${t.wanted} ${t.wanted === 1 ? 'se busca' : 'se buscan'}` : '',
  };
}

/** "3 juegos · busca 1 · 2 a medias" under a shelf's name. */
export function shelfCount(s: Pick<Shelf, 'owned' | 'wanted' | 'halfway'>): {
  owned: string;
  wanted: string;
  halfway: string;
} {
  return {
    owned: plural(s.owned, 'juego', 'juegos'),
    wanted: s.wanted ? `busca ${s.wanted}` : '',
    halfway: s.halfway ? `${s.halfway} a medias` : '',
  };
}

export const platformName = (id: string): string =>
  platformById(id)?.name ?? (id ? id : 'Sin consola');

/** "PAL · Completo (caja, disco y manual)" for the case. */
export function copyLine(g: Game): string {
  const parts: string[] = [];
  if (g.region) parts.push(REGION_LABEL[g.region] ?? g.region);
  if (g.condition) {
    const cart = platformById(g.platform)?.cartridge;
    const what =
      g.condition === 'completo'
        ? cart
          ? ' (caja, cartucho y manual)'
          : ' (caja, disco y manual)'
        : g.condition === 'suelto'
          ? cart
            ? ' (solo el cartucho)'
            : ' (sin manual)'
          : '';
    parts.push(`${CONDITION_LABEL[g.condition]}${what}`);
  }
  return parts.join(' · ') || 'Sin región ni estado anotados';
}

export function playersText(g: Game): string {
  if (!g.players) return 'Sin anotar';
  if (g.players === 1) return 'Uno';
  return `1 a ${g.players}${g.coop ? ', en equipo' : ''}`;
}

export const progressText = (g: Game) => PROGRESS_LABEL[g.progress] ?? 'Sin anotar';
export const lengthText = (g: Game) => LENGTH_LABEL[g.length] ?? 'Sin anotar';

/** "esta semana ★" or "hace 3 meses". */
export function addedText(g: Game, today: string): string {
  return isNew(g, today) ? 'esta semana ★' : agoText(g.addedAt, today);
}

export const isNew = (g: Game, today: string) =>
  !g.wanted && !!g.addedAt && daysBetween(g.addedAt, today) <= NEW_STAR_DAYS;

/** Not played in a year and a half (only when it says when): a little dust on top. */
export const isDusty = (g: Game, today: string) =>
  !g.wanted && !!g.lastPlayed && daysBetween(g.lastPlayed, today) > DUST_DAYS;

/** The price shown on a gap's tag: short. */
export function shortPrice(price: string): string {
  return price
    .replace(/\s*MXN$/i, '')
    .replace(/\s*USD$/i, ' us')
    .trim();
}

/** Why a form's draft can't be saved yet, or null. */
export function draftProblem(d: Pick<Game, 'title' | 'platform'>): string | null {
  if (!d.title.trim()) return 'Falta el nombre.';
  if (!d.platform) return 'Falta la consola.';
  return null;
}

/** Problems line under the shelves. */
export function problemsLine(problems: readonly string[]): string {
  if (!problems.length) return '';
  return problems.length === 1 ? problems[0] : `${problems.length} avisos al leer la colección`;
}
