import { LOOSE_MATCH_MIN_LENGTH, SEARCH_DEFAULT_LIMIT, TYPO_MAX_DISTANCE } from './constants.js';
import type { BanStatus, CardKind, CardLookup, CardRecord, DeckCard } from './types.js';

// ── From YGOPRODeck ────────────────────────────────────────────────────────────────────────

/** Frame types of the Extra Deck monsters. */
const EXTRA_FRAMES = new Set([
  'fusion',
  'synchro',
  'xyz',
  'link',
  'fusion_pendulum',
  'synchro_pendulum',
  'xyz_pendulum',
]);
/** Cards that never go in a deck (Speed Duel skills, tokens). */
const NOT_DECK_FRAMES = new Set(['skill', 'token']);

function ban(value: unknown): BanStatus | undefined {
  // YGOPRODeck says "Forbidden"; the office calls it "Banned"
  if (value === 'Forbidden' || value === 'Banned') return 'Banned';
  if (value === 'Limited' || value === 'Semi-Limited') return value;
  return undefined;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * One card of a YGOPRODeck `cardinfo.php` answer, trimmed to what a deck viewer uses (no prices, sets or URLs).
 * Null for what is not a deck card (skills, tokens) or not a card at all.
 */
export function trimYgoCard(raw: unknown): CardRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = num(c.id);
  const name = str(c.name);
  const type = str(c.type) ?? '';
  const frameType = str(c.frameType) ?? '';
  if (!id || !name || NOT_DECK_FRAMES.has(frameType)) return null;
  const kind: CardKind =
    frameType === 'spell' ? 'spell' : frameType === 'trap' ? 'trap' : 'monster';
  const card: CardRecord = {
    id,
    name,
    kind,
    extraDeck: EXTRA_FRAMES.has(frameType),
    type,
    frameType,
    desc: typeof c.desc === 'string' ? c.desc : '',
  };
  const race = str(c.race);
  if (race) card.race = race;
  if (kind === 'monster') {
    const attribute = str(c.attribute);
    if (attribute) card.attribute = attribute;
    const level = num(c.level);
    if (level !== undefined) card.level = level;
    const atk = num(c.atk);
    if (atk !== undefined) card.atk = atk;
    const def = num(c.def);
    if (def !== undefined) card.def = def;
  }
  const archetype = str(c.archetype);
  if (archetype) card.archetype = archetype;
  const bans = c.banlist_info as Record<string, unknown> | undefined;
  if (bans && typeof bans === 'object') {
    const tcg = ban(bans.ban_tcg);
    if (tcg) card.banTcg = tcg;
    const ocg = ban(bans.ban_ocg);
    if (ocg) card.banOcg = ocg;
  }
  if (Array.isArray(c.card_images)) {
    const ids = c.card_images
      .map((im) => num((im as Record<string, unknown> | null)?.id))
      .filter((v): v is number => v !== undefined && v > 0);
    if (ids.length > 1 || (ids.length === 1 && ids[0] !== id)) card.images = ids;
  }
  return card;
}

/** The card without the database's own fields (what goes on the wire). */
export function toDeckCard(record: CardRecord): DeckCard {
  const { images: _images, ...card } = record;
  return card;
}

// ── Names ──────────────────────────────────────────────────────────────────────────────────

/** Lowercase, no accents, punctuation as spaces: "Blue-Eyes  White Dragon!" → "blue eyes white dragon". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Edit distance, giving up (returning max + 1) as soon as it is over `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ── Index ──────────────────────────────────────────────────────────────────────────────────

export interface CardIndex extends CardLookup {
  readonly count: number;
  /** By code when the query is only digits (exact first, then codes starting with them), else by name. */
  search(query: string, limit?: number): DeckCard[];
}

interface Entry {
  card: DeckCard;
  norm: string;
  words: string[];
}

/** A lookup and search over a list of cards, all in memory. */
export function createCardIndex(records: readonly CardRecord[]): CardIndex {
  const byId = new Map<number, DeckCard>();
  const entries: Entry[] = [];
  const byNorm = new Map<string, DeckCard>();
  for (const record of records) {
    const card = toDeckCard(record);
    if (byId.get(card.id)?.id === card.id) continue;
    byId.set(card.id, card);
    for (const alt of record.images ?? []) if (!byId.has(alt)) byId.set(alt, card);
    const norm = normalizeName(card.name);
    entries.push({ card, norm, words: norm.split(' ') });
    if (!byNorm.has(norm)) byNorm.set(norm, card);
  }
  const byExactLower = new Map<string, DeckCard>();
  for (const e of entries) {
    const key = e.card.name.toLowerCase();
    if (!byExactLower.has(key)) byExactLower.set(key, e.card);
  }

  function rank(entry: Entry, q: string): number {
    if (entry.norm === q) return 0;
    if (entry.norm.startsWith(q)) return 1;
    if (entry.words.some((w) => w.startsWith(q))) return 2;
    if (entry.norm.includes(q)) return 3;
    return -1;
  }

  function byName(query: string, limit: number): DeckCard[] {
    const q = normalizeName(query);
    if (!q) return [];
    const hits: { entry: Entry; score: number }[] = [];
    for (const entry of entries) {
      const score = rank(entry, q);
      if (score >= 0) hits.push({ entry, score });
    }
    hits.sort(
      (a, b) =>
        a.score - b.score ||
        a.entry.card.name.length - b.entry.card.name.length ||
        a.entry.card.name.localeCompare(b.entry.card.name),
    );
    return hits.slice(0, limit).map((h) => h.entry.card);
  }

  function byCode(digits: string, limit: number): DeckCard[] {
    const out: DeckCard[] = [];
    const exact = byId.get(Number(digits));
    if (exact) out.push(exact);
    const prefix: DeckCard[] = [];
    for (const [id, card] of byId) {
      if (id !== Number(digits) && String(id).startsWith(digits) && !out.includes(card))
        prefix.push(card);
    }
    prefix.sort((a, b) => a.id - b.id);
    for (const card of prefix) {
      if (out.length >= limit) break;
      if (!out.includes(card)) out.push(card);
    }
    return out.slice(0, limit);
  }

  return {
    ready: entries.length > 0,
    count: entries.length,
    get: (id) => byId.get(id),
    findByName(name) {
      const exact = byExactLower.get(name.trim().toLowerCase()) ?? byNorm.get(normalizeName(name));
      if (exact) return { card: exact, exact: true };
      const q = normalizeName(name);
      if (q.length < LOOSE_MATCH_MIN_LENGTH) return undefined;
      // A name that starts the same way, then one a couple of typos away
      const [first] = byName(q, 1);
      if (first && rank({ card: first, norm: normalizeName(first.name), words: [] }, q) === 1)
        return { card: first, exact: false };
      let best: { card: DeckCard; d: number } | undefined;
      for (const entry of entries) {
        const d = editDistance(entry.norm, q, TYPO_MAX_DISTANCE);
        if (d <= TYPO_MAX_DISTANCE && (!best || d < best.d)) best = { card: entry.card, d };
      }
      if (best) return { card: best.card, exact: false };
      return first ? { card: first, exact: false } : undefined;
    },
    search(query, limit = SEARCH_DEFAULT_LIMIT) {
      const q = query.trim();
      if (/^\d{1,10}$/.test(q)) return byCode(q, limit);
      return byName(q, limit);
    },
  };
}

/** A lookup with no cards (no database yet): nothing is found and nothing is reported as unknown. */
export const EMPTY_LOOKUP: CardLookup = {
  ready: false,
  get: () => undefined,
  findByName: () => undefined,
};
