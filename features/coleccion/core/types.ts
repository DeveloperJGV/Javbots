import type { CoverArt } from './cover.js';

/** Where a copy is from. */
export const REGIONS = ['ntsc-u', 'pal', 'ntsc-j', 'otra'] as const;
export type Region = (typeof REGIONS)[number] | '';

/** What came in the box. */
export const CONDITIONS = ['completo', 'suelto', 'sellado'] as const;
export type Condition = (typeof CONDITIONS)[number] | '';

/** How it is going. */
export const PROGRESS = ['sin-jugar', 'a-medias', 'terminado', 'de-siempre'] as const;
export type Progress = (typeof PROGRESS)[number] | '';

/** How long one sitting takes. */
export const LENGTHS = ['rato', '1h', 'tarde'] as const;
export type SessionLength = (typeof LENGTHS)[number] | '';

/**
 * One game of the collection, or a gap on its shelf ("se busca": wanted = true, with the price seen). Empty strings
 * and 0 mean "not said". The last three fields are for stage 2 (lookup by name, barcode, cover) and are kept as
 * they come, unused for now.
 */
export interface Game {
  id: string;
  title: string;
  /** A platform id (core/platforms.ts). */
  platform: string;
  wanted: boolean;
  region: Region;
  condition: Condition;
  progress: Progress;
  /** Most players at once; 0 = not said. */
  players: number;
  /** Players play together on one couch. */
  coop: boolean;
  length: SessionLength;
  series: string;
  /** Whose it is. */
  owner: string;
  notes: string;
  /** Wanted: the price seen, as written ("$450 MXN"). */
  price: string;
  /** Wanted: where it was seen. */
  seenAt: string;
  /** YYYY-MM-DD: when it came into the collection (for a wanted one, when it was written down). */
  addedAt: string;
  /** YYYY-MM-DD of the last time it was played, or "". */
  lastPlayed: string;
  /** ISO time of the last save ("" when never saved). */
  updatedAt: string;
  externalId?: string;
  barcode?: string;
  /** An old free-text field, kept as it came and unused. */
  cover?: string;
  /** The cover image this game has (set by the server only; the image lives next to the collection file). */
  coverArt?: CoverArt;
  /**
   * ISO time the person answered «Ninguna» to its cover choice (server only): «Buscar las que faltan» leaves it alone
   * until it is searched by hand, its title or console changes, or it gets a cover.
   */
  coverNone?: string;
}

/** A game as read, plus what could not be understood in it. */
export interface ReadGame {
  game: Game;
  /** Fields this version does not know: written back as they were. */
  unknown: Record<string, unknown>;
  problems: string[];
}
