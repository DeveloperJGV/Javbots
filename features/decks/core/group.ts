import { tally } from './deck.js';
import type { CardLookup, Deck, DeckCard } from './types.js';

export type DeckGroupKey = 'monsters' | 'spells' | 'traps' | 'unknown' | 'extra' | 'side';

/** Spanish titles of the groups. */
export const DECK_GROUP_LABELS: Record<DeckGroupKey, string> = {
  monsters: 'Monstruos',
  spells: 'Magias',
  traps: 'Trampas',
  unknown: 'Sin datos',
  extra: 'Extra',
  side: 'Side',
};

export interface DeckGroupEntry {
  id: number;
  count: number;
  /** Undefined while the card is not in the database. */
  card?: DeckCard;
}

export interface DeckGroup {
  key: DeckGroupKey;
  label: string;
  /** Total copies in the group. */
  count: number;
  entries: DeckGroupEntry[];
}

export interface GroupedDeck {
  /** Only the groups with cards, in this order: monsters, spells, traps, unknown (Main), extra, side. */
  groups: DeckGroup[];
  counts: {
    main: number;
    extra: number;
    side: number;
    monsters: number;
    spells: number;
    traps: number;
  };
}

function group(key: DeckGroupKey, entries: DeckGroupEntry[]): DeckGroup {
  return {
    key,
    label: DECK_GROUP_LABELS[key],
    count: entries.reduce((n, e) => n + e.count, 0),
    entries,
  };
}

/** The deck split for showing: Main by card kind, then Extra and Side; each card once with its copies. */
export function groupDeck(
  deck: Pick<Deck, 'main' | 'extra' | 'side'>,
  lookup: CardLookup,
): GroupedDeck {
  const withCard = (ids: number[]): DeckGroupEntry[] =>
    tally(ids).map(({ id, count }) => {
      const card = lookup.get(id);
      return card ? { id, count, card } : { id, count };
    });
  const main = withCard(deck.main);
  const byKind = (kind: DeckCard['kind'] | undefined) => main.filter((e) => e.card?.kind === kind);
  const all = [
    group('monsters', byKind('monster')),
    group('spells', byKind('spell')),
    group('traps', byKind('trap')),
    group('unknown', byKind(undefined)),
    group('extra', withCard(deck.extra)),
    group('side', withCard(deck.side)),
  ];
  const count = (key: DeckGroupKey) => all.find((g) => g.key === key)?.count ?? 0;
  return {
    groups: all.filter((g) => g.entries.length > 0),
    counts: {
      main: deck.main.length,
      extra: deck.extra.length,
      side: deck.side.length,
      monsters: count('monsters'),
      spells: count('spells'),
      traps: count('traps'),
    },
  };
}
