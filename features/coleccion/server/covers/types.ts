import type { ColeccionCoverReason } from '../../../../core/src/messages.js';
import type { Region } from '../../core/types.js';

export type SourceId = 'libretro' | 'igdb';

/** One cover a source offers for a game. */
export interface Candidate {
  source: SourceId;
  /** What fetches it again: libretro's file name, IGDB's image_id. */
  key: string;
  /** Readable name, as the source has it (outside text: shown as text only). */
  label: string;
  /** The source's region text ("USA, Europe"), or "". */
  region: string;
  /** 1 = exact match; lower = only looks like it. */
  score: number;
}

/** How one source's search ended. */
export type SearchOutcome =
  /** `others`: with `wide`, other covers that could be it too (other regions, look-alikes), best first. */
  | { kind: 'found'; candidate: Candidate; others?: Candidate[] }
  | { kind: 'choose'; candidates: Candidate[] }
  | { kind: 'none'; reason: ColeccionCoverReason };

/** A place covers come from; more can be added behind this. */
export interface CoverSource {
  readonly id: SourceId;
  readonly name: string;
  /** Has boxes for this console: yes, no, or only a handful ("pocas"). */
  covers(platformId: string): boolean | 'pocas';
  /**
   * Never throws: a source that does not answer ends in `none` / `sin-respuesta`. `wide`: a found cover also brings
   * the others that could be it (for «Cambiar», where the person chooses).
   */
  search(
    title: string,
    platformId: string,
    region: Region | '',
    wide?: boolean,
  ): Promise<SearchOutcome>;
  /** The image of a candidate: `thumb` for the choice grid, `full` for the cover kept. Throws NetError. */
  image(candidate: Candidate, platformId: string, size: 'thumb' | 'full'): Promise<Uint8Array>;
  /** ISO time of the last request that worked. */
  lastOkAt(): string | undefined;
  /** What went wrong the last time, if the last request failed. */
  lastProblem(): string | undefined;
}
