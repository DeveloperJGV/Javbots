/** What the series is. */
export const KINDS = ['manga', 'comic', 'novela-grafica'] as const;
export type ComicKind = (typeof KINDS)[number] | '';

/** How it comes: a volume (tankōbon), a single issue (grapa), an omnibus (integral) or a deluxe edition. */
export const COMIC_FORMATS = ['tomo', 'grapa', 'integral', 'lujo'] as const;
export type ComicFormat = (typeof COMIC_FORMATS)[number] | '';

/** Where a series cover came from: AniList, Open Library, or the person uploaded it. */
export const COMIC_COVER_SOURCES = ['anilist', 'openlibrary', 'subida'] as const;
export type ComicCoverSource = (typeof COMIC_COVER_SOURCES)[number];
export const COMIC_COVER_TYPES = ['png', 'jpg', 'webp'] as const;
export type ComicCoverType = (typeof COMIC_COVER_TYPES)[number];

/** A series' cover as the file keeps it (never a path); written only by the server. */
export interface ComicCoverArt {
  source: ComicCoverSource;
  /** anilist: "al:<media id>"; openlibrary: "isbn:<isbn>" or "id:<cover id>"; subida: "". */
  key: string;
  at: string;
  type: ComicCoverType;
}

/**
 * One volume (or issue) of a series that has something to say: it is on the shelf, or it is missing with a price
 * seen. Volumes not written down are simply missing.
 */
export interface Volume {
  number: number;
  owned: boolean;
  /** Digits only (and a final X); "" = not said. */
  isbn: string;
  /** YYYY-MM-DD it came in (owned ones). */
  addedAt: string;
  /** A missing one: the price seen, as written. */
  price: string;
}

/**
 * A series (a manga, a comic run, a graphic novel) and which of its volumes are here. The series is the unit: the
 * volumes missing between 1 and the last one are its «se busca». Empty strings and 0 mean "not said".
 */
export interface Series {
  id: string;
  title: string;
  /** Story (guion). */
  writers: string[];
  /** Art (dibujo); empty when the same people did both. */
  artists: string[];
  /** The original publisher. */
  publisher: string;
  /** The edition here (México, España…), when it is not the original's. */
  localPublisher: string;
  kind: ComicKind;
  /** Demographic or genre (shōnen, seinen, superhéroes…). */
  genre: string;
  year: number;
  language: string;
  format: ComicFormat;
  /** How many volumes the series has (0 = not known yet). */
  totalVolumes: number;
  /** The series already ended (its volume count will not grow). */
  finished: boolean;
  /** The last volume read (0 = none yet). */
  readUpTo: number;
  owner: string;
  notes: string;
  /** Sorted by number, one per number. */
  volumes: Volume[];
  addedAt: string;
  updatedAt: string;
  coverArt?: ComicCoverArt;
  coverNone?: string;
}

export interface ReadSeries {
  series: Series;
  unknown: Record<string, unknown>;
  problems: string[];
}
