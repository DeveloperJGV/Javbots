import {
  BOX_COLOR_PATTERN,
  CARD_ID_MAX,
  DECK_ID_LENGTH,
  DECK_ID_PATTERN,
  DECK_NAME_MAX,
  DECK_NOTES_MAX,
  DECK_OWNER_MAX,
  DEFAULT_BOX_COLOR,
  DEFAULT_DECK_NAME,
  ZONE_MAX_CARDS,
} from './constants.js';
import type { Deck, DeckCounts } from './types.js';

/** The fields a deck file may have; anything else is kept as it is when the file is written again. */
export const DECK_FIELDS = [
  'version',
  'id',
  'name',
  'owner',
  'createdAt',
  'updatedAt',
  'cover',
  'box',
  'notes',
  'main',
  'extra',
  'side',
] as const;

export function isDeckId(value: unknown): value is string {
  return typeof value === 'string' && DECK_ID_PATTERN.test(value);
}

/** A card code from a number or a numeric string, or null. */
export function toCardId(value: unknown): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\s*\d{1,10}\s*$/.test(value)) n = Number(value);
  else return null;
  return Number.isInteger(n) && n > 0 && n <= CARD_ID_MAX ? n : null;
}

/** `YYYY-MM-DD` of a time, in UTC. */
export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A new deck id: `length` random lowercase letters and digits. */
export function newDeckId(random: () => number = Math.random, length = DECK_ID_LENGTH): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(random() * chars.length) % chars.length];
  return id;
}

export function emptyDeck(today: string): Deck {
  return {
    id: '',
    name: DEFAULT_DECK_NAME,
    owner: '',
    createdAt: today,
    updatedAt: '',
    cover: 0,
    box: { color: DEFAULT_BOX_COLOR },
    notes: '',
    main: [],
    extra: [],
    side: [],
  };
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.trim().slice(0, max) : null;
}

function zone(value: unknown, problems: string[], label: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    problems.push(`${label}: no es una lista de cartas.`);
    return [];
  }
  const out: number[] = [];
  let bad = 0;
  for (const item of value) {
    const id = toCardId(item);
    if (id === null) bad++;
    else if (out.length < ZONE_MAX_CARDS) out.push(id);
  }
  if (bad > 0) problems.push(`${label}: ${bad} código(s) que no son números de carta.`);
  if (value.length - bad > ZONE_MAX_CARDS)
    problems.push(`${label}: más de ${ZONE_MAX_CARDS} cartas; sobran las últimas.`);
  return out;
}

export interface NormalizedDeck {
  deck: Deck;
  /** Fields this version does not know, to write back untouched. */
  unknown: Record<string, unknown>;
  /** What was wrong and got a default (in Spanish). Empty for a clean file. */
  problems: string[];
}

/**
 * A deck from anything (a parsed file, a client message): missing or wrong fields get their default, never an
 * error. Returns null only when `raw` is not an object at all.
 */
export function normalizeDeck(raw: unknown, today: string): NormalizedDeck | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const problems: string[] = [];
  const deck = emptyDeck(today);

  if (isDeckId(src.id)) deck.id = src.id;
  else if (src.id !== undefined && src.id !== '') problems.push('El id no es válido.');
  deck.name = text(src.name, DECK_NAME_MAX) || DEFAULT_DECK_NAME;
  deck.owner = text(src.owner, DECK_OWNER_MAX) ?? '';
  if (typeof src.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(src.createdAt))
    deck.createdAt = src.createdAt.slice(0, 10);
  if (typeof src.updatedAt === 'string') deck.updatedAt = src.updatedAt;
  deck.cover = toCardId(src.cover) ?? 0;
  const box = src.box as Record<string, unknown> | undefined;
  if (box && typeof box === 'object' && typeof box.color === 'string') {
    if (BOX_COLOR_PATTERN.test(box.color)) deck.box = { color: box.color.toLowerCase() };
    else problems.push('El color de la caja no es #rrggbb.');
  }
  deck.notes = text(src.notes, DECK_NOTES_MAX) ?? '';
  deck.main = zone(src.main, problems, 'Main');
  deck.extra = zone(src.extra, problems, 'Extra');
  deck.side = zone(src.side, problems, 'Side');

  const unknown: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (!(DECK_FIELDS as readonly string[]).includes(key)) unknown[key] = src[key];
  }
  return { deck, unknown, problems };
}

/** The deck as its file stores it: unknown fields first, then ours (ours win). */
export function deckFileContent(
  deck: Deck,
  unknown: Record<string, unknown> = {},
  version: number,
): Record<string, unknown> {
  return {
    ...unknown,
    version,
    id: deck.id,
    name: deck.name,
    owner: deck.owner,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    cover: deck.cover,
    box: { color: deck.box.color },
    notes: deck.notes,
    main: [...deck.main],
    extra: [...deck.extra],
    side: [...deck.side],
  };
}

export function countDeck(deck: Pick<Deck, 'main' | 'extra' | 'side'>): DeckCounts {
  return { main: deck.main.length, extra: deck.extra.length, side: deck.side.length };
}

/** The card shown on the box: the chosen one, else the first of Main, Extra or Side; 0 for an empty deck. */
export function deckCover(deck: Pick<Deck, 'cover' | 'main' | 'extra' | 'side'>): number {
  return deck.cover || deck.main[0] || deck.extra[0] || deck.side[0] || 0;
}

/** Each code with its number of copies, in order of first appearance. */
export function tally(ids: readonly number[]): { id: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count }));
}
