import type { Deck, DeckCard, DeckCounts } from '../core/types.js';
import { TINT_GRAY_SAT, TINT_LIGHTNESS, TINT_SAT_MAX, TINT_SAT_MIN, tintCss } from './constants.js';

/** Texts and small pure helpers of the decks panel (Spanish on screen). */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "40 cartas · 12 extra" (side only when there is one). */
export function countsLine(counts: DeckCounts): string {
  const parts = [plural(counts.main, 'carta', 'cartas'), `${counts.extra} extra`];
  if (counts.side > 0) parts.push(`${counts.side} side`);
  return parts.join(' · ');
}

/** "de Ana", or nothing when the deck has no owner. */
export const ownerText = (owner: string): string => (owner.trim() ? `de ${owner.trim()}` : '');

export const warningsTitle = (n: number): string =>
  plural(n, 'aviso de reglas', 'avisos de reglas');

/** The image of a card, served (and cached once) by the office. */
export function cardImageUrl(
  id: number,
  size: 'small' | 'full' | 'crop',
  token: string | null,
): string {
  const q = new URLSearchParams({ size });
  if (token) q.set('token', token);
  return `/api/decks/img/${id}?${q.toString()}`;
}

const KIND: Record<DeckCard['kind'], string> = {
  monster: 'Monstruo',
  spell: 'Magia',
  trap: 'Trampa',
};

const BAN: Record<NonNullable<DeckCard['banTcg']>, string> = {
  Banned: 'Prohibida',
  Limited: 'Limitada',
  'Semi-Limited': 'Semilimitada',
};

/** "Prohibida (TCG)" etc., or "". */
export const banText = (card: Pick<DeckCard, 'banTcg'>): string =>
  card.banTcg ? `${BAN[card.banTcg]} (TCG)` : '';

/** Second line of a card row: its YGOPRODeck type (in English, like the name) or the kind. */
export const cardSubline = (card: DeckCard | undefined, id: number): string =>
  card ? card.type || KIND[card.kind] : `Código ${id} · sin datos`;

/** The stats line of the big card: "ATK 3000 / DEF 2500 · Nivel 8". */
export function statsLine(card: DeckCard): string {
  const parts: string[] = [];
  if (card.atk !== undefined) {
    const def = card.def !== undefined ? ` / DEF ${card.def}` : '';
    parts.push(`ATK ${card.atk}${def}`);
  }
  if (card.level !== undefined)
    parts.push(`${card.frameType.startsWith('xyz') ? 'Rango' : 'Nivel'} ${card.level}`);
  return parts.join(' · ');
}

/** "Effect Monster · Dragon · LIGHT". */
export const typeLine = (card: DeckCard): string =>
  [card.type, card.race, card.attribute].filter(Boolean).join(' · ');

/** Name of the downloaded .ydk: the deck name, safe for any file system. */
export function ydkFileName(name: string): string {
  const safe = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${safe || 'deck'}.ydk`;
}

/** What the card database is doing, for the line under the search. */
export function dbStateText(
  db: { state: string; count?: number; detail?: string } | undefined,
): string {
  if (!db) return '';
  switch (db.state) {
    case 'ready':
      return db.count
        ? `Base de cartas lista (${db.count.toLocaleString('es-MX')} cartas, en inglés).`
        : '';
    case 'loading':
      return 'Bajando la base de cartas (una sola vez)…';
    case 'missing':
      return 'Todavía no hay base de cartas: se baja al abrir.';
    case 'error':
      return `No se pudo bajar la base de cartas${db.detail ? `: ${db.detail}` : ''}. Puedes usar códigos.`;
    default:
      return '';
  }
}

/** Search text that is a card code (digits only). */
export const isCodeQuery = (q: string): boolean => /^\d{1,10}$/.test(q.trim());

/** The tint of the background, from a cover's average color: its hue, saturated enough to be seen, dark enough. */
export function vividTint(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === rn) h = ((gn - bn) / d) % 6;
    else if (mx === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  h = Math.round((h * 60 + 360) % 360);
  const s = d
    ? Math.max(TINT_SAT_MIN, Math.min(TINT_SAT_MAX, d / (1 - Math.abs(mx + mn - 1))))
    : TINT_GRAY_SAT;
  return tintCss(h, Math.round(s * 100), Math.round(TINT_LIGHTNESS * 100));
}

/** Average color of RGBA pixels, weighting colorful ones more (a gray frame should not win over the art). */
export function averageColor(data: ArrayLike<number>): { r: number; g: number; b: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const chroma =
      Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    const w = 1 + chroma / 32;
    r += data[i] * w;
    g += data[i + 1] * w;
    b += data[i + 2] * w;
    n += w;
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
}

/** A deck with a card added to (or one copy removed from) a zone. */
export function addCard(deck: Deck, zone: 'main' | 'extra' | 'side', id: number): Deck {
  return { ...deck, [zone]: [...deck[zone], id] };
}

export function removeCard(deck: Deck, zone: 'main' | 'extra' | 'side', id: number): Deck {
  const list = deck[zone];
  const at = list.lastIndexOf(id);
  if (at < 0) return deck;
  return { ...deck, [zone]: [...list.slice(0, at), ...list.slice(at + 1)] };
}

/** Every copy of a card moved from one zone to another. */
export function moveCard(
  deck: Deck,
  from: 'main' | 'extra' | 'side',
  to: 'main' | 'extra' | 'side',
  id: number,
): Deck {
  if (from === to) return deck;
  const moving = deck[from].filter((c) => c === id);
  return { ...deck, [from]: deck[from].filter((c) => c !== id), [to]: [...deck[to], ...moving] };
}

/** The zone a new card goes to: Extra Deck monsters to Extra, the rest to Main. */
export const zoneFor = (card: Pick<DeckCard, 'extraDeck'> | undefined): 'main' | 'extra' =>
  card?.extraDeck ? 'extra' : 'main';

/** The 8-digit code as printed (leading zeros). */
export const printedCode = (id: number): string => String(id).padStart(8, '0');
