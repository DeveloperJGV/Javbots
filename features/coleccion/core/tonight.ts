import { byTitle } from './game.js';
import type { Game, SessionLength } from './types.js';

/** "¿Qué jugamos hoy?": who plays, for how long, what's wanted, and on which console ('' = any). */
export interface TonightAsk {
  players: 1 | 2 | 4;
  time: Exclude<SessionLength, ''>;
  mood: 'medias' | 'nuevo' | 'siempre' | 'cualquiera';
  platform: string;
}

export interface TonightPick {
  game: Game;
  /** Why this one, in a short sentence. */
  why: string;
}

/** The questions' defaults: two players, an hour, finish one if any is halfway (otherwise anything), any console. */
export function defaultAsk(games: readonly Game[]): TonightAsk {
  return {
    players: 2,
    time: '1h',
    mood: games.some((g) => !g.wanted && g.progress === 'a-medias') ? 'medias' : 'cualquiera',
    platform: '',
  };
}

/** Sittings that fit in each amount of time (a game that doesn't say fits any). */
const FITS: Record<TonightAsk['time'], readonly SessionLength[]> = {
  rato: ['', 'rato'],
  '1h': ['', 'rato', '1h'],
  tarde: ['', 'rato', '1h', 'tarde'],
};

/** Days between two YYYY-MM-DD (b after a); 0 when either is missing. */
export function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));
}

/** "hoy", "hace 3 días", "hace 2 semanas", "hace 4 meses", "hace 2 años". */
export function agoText(dayIso: string, today: string): string {
  if (!dayIso) return 'nunca';
  const d = daysBetween(dayIso, today);
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 14) return `hace ${d} días`;
  if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
  if (d < 730) return `hace ${Math.round(d / 30)} meses`;
  return `hace ${Math.round(d / 365)} años`;
}

/** A stable shuffle key: the same day and round give the same order, a new round gives another. */
function mix(id: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761) >>> 0;
  return h;
}

/** Every owned game that fits the ask, best first. */
export function tonightCandidates(games: readonly Game[], ask: TonightAsk, seed = 0): Game[] {
  const fits = FITS[ask.time];
  const list = games.filter((g) => {
    if (g.wanted) return false;
    if (ask.platform && g.platform !== ask.platform) return false;
    // Unknown player count: assume it is for one
    if (ask.players > 1 && (g.players || 1) < ask.players) return false;
    if (!fits.includes(g.length)) return false;
    switch (ask.mood) {
      case 'medias':
        return g.progress === 'a-medias';
      case 'nuevo':
        return g.progress === 'sin-jugar' || g.condition === 'sellado';
      case 'siempre':
        return g.progress === 'de-siempre' || g.progress === 'terminado';
      default:
        return true;
    }
  });
  const coopFirst = (a: Game, b: Game) => (ask.players > 1 ? Number(b.coop) - Number(a.coop) : 0);
  return list.sort((a, b) => {
    const c = coopFirst(a, b);
    if (c) return c;
    if (ask.mood === 'medias')
      // The one left the longest ago first (never played: by when it came)
      return (a.lastPlayed || a.addedAt).localeCompare(b.lastPlayed || b.addedAt) || byTitle(a, b);
    if (ask.mood === 'nuevo') return a.addedAt.localeCompare(b.addedAt) || byTitle(a, b);
    return mix(a.id, seed) - mix(b.id, seed) || byTitle(a, b);
  });
}

/** Three picks for this round (round 0, 1, 2… pages through; it wraps when it runs out). */
export function tonightPicks(
  games: readonly Game[],
  ask: TonightAsk,
  round: number,
  today: string,
  seed = 0,
): { picks: TonightPick[]; total: number } {
  const all = tonightCandidates(games, ask, seed);
  if (!all.length) return { picks: [], total: 0 };
  const pages = Math.ceil(all.length / 3);
  const page = ((round % pages) + pages) % pages;
  const picks = all
    .slice(page * 3, page * 3 + 3)
    .map((game) => ({ game, why: whyText(game, ask, today) }));
  return { picks, total: all.length };
}

function whyText(g: Game, ask: TonightAsk, today: string): string {
  if (g.progress === 'a-medias')
    return g.lastPlayed
      ? `Se quedó a medias ${agoText(g.lastPlayed, today)}.`
      : 'Se quedó a medias.';
  if (g.condition === 'sellado') return 'Sigue sellado. Hoy se abre.';
  if (g.progress === 'sin-jugar') return `Llegó ${agoText(g.addedAt, today)} y nadie lo ha jugado.`;
  if (g.progress === 'de-siempre') return 'De los de siempre.';
  if (g.progress === 'terminado') return 'Ya lo terminaron: para repetir.';
  if (ask.players > 1 && g.coop) return 'Se juega en equipo en el sillón.';
  return 'Encaja con lo que buscan.';
}
