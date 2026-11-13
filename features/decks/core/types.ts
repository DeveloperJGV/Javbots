/**
 * Yu-Gi-Oh! decks: the plain data shared by the office server, its page and any other client (a phone page, an
 * Android app). No Node, no DOM, no office imports: this folder must run anywhere TypeScript runs.
 *
 * The shapes match DecksDeck / DecksCard of core/asyncapi.yaml field for field, so a server can send them as they are.
 */

/** Where a card sits in a deck. */
export type DeckZone = 'main' | 'extra' | 'side';

export interface DeckBox {
  /** `#rrggbb`. */
  color: string;
}

/** One deck as the clients see it: the deck file without its `version`. */
export interface Deck {
  /** `[a-z0-9]{4,32}`; the file is `<id>.json`. Empty for a deck that was never saved. */
  id: string;
  name: string;
  owner: string;
  /** `YYYY-MM-DD`. */
  createdAt: string;
  /** ISO time of the last save (empty when never saved). */
  updatedAt: string;
  /** Card code shown on the box; 0 = none chosen (use deckCover() for the fallback). */
  cover: number;
  box: DeckBox;
  notes: string;
  /** Card codes (the 8-digit number printed on the card); a repeated code is several copies. */
  main: number[];
  extra: number[];
  side: number[];
}

export type CardKind = 'monster' | 'spell' | 'trap';
export type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';

/** The data of one card a deck viewer needs (trimmed from YGOPRODeck). */
export interface DeckCard {
  /** Main code of the card (alternate artworks have their own codes, see CardRecord.images). */
  id: number;
  name: string;
  kind: CardKind;
  /** Fusion, Synchro, Xyz and Link monsters (Pendulum ones included). */
  extraDeck: boolean;
  /** YGOPRODeck `type`, e.g. "Effect Monster". */
  type: string;
  /** YGOPRODeck `frameType`, e.g. "effect", "xyz_pendulum", "spell". */
  frameType: string;
  desc: string;
  race?: string;
  attribute?: string;
  /** Level, or Rank for Xyz. Link monsters have none. */
  level?: number;
  atk?: number;
  def?: number;
  archetype?: string;
  banTcg?: BanStatus;
  banOcg?: BanStatus;
}

/** A card as the local database keeps it: the card plus the codes of all its artworks (when more than its own). */
export interface CardRecord extends DeckCard {
  images?: number[];
}

/** A rule a deck breaks. Only a warning: nothing is blocked. */
export interface DeckWarning {
  code:
    | 'main-size'
    | 'extra-size'
    | 'side-size'
    | 'copies'
    | 'banned'
    | 'limited'
    | 'semi-limited'
    | 'extra-in-main'
    | 'main-in-extra';
  /** Ready to show, in Spanish. */
  text: string;
  cardId?: number;
}

/** What a deck reader needs from a card database (the local one, or none at all). */
export interface CardLookup {
  /** False while there is no database: unknown codes are then not reported. */
  readonly ready: boolean;
  /** The card of any of its codes (alternate artworks included). */
  get(id: number): DeckCard | undefined;
  /** Exact name first (case and punctuation ignored), then the closest one. */
  findByName(name: string): { card: DeckCard; exact: boolean } | undefined;
}

export interface DeckCounts {
  main: number;
  extra: number;
  side: number;
}
