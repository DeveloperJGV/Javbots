import type { CSSProperties } from 'react';

import { fold } from '../core/shelves.js';
import type { Book } from '../core/types.js';
import {
  type Cloth,
  CLOTHS,
  DIGITAL_LOOK,
  GENRE_ACCENTS,
  NONE_ACCENT,
  OTHER_ACCENTS,
  SPINE,
} from './constants.js';

/** A small stable number from a text (the same book always gets the same color and size). */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

export type SpineKind = 'hard' | 'soft' | 'digital';

/** How a book stands on the shelf: its size in px, its kind and its colors. */
export interface SpineLook extends Cloth {
  w: number;
  h: number;
  kind: SpineKind;
}

/**
 * A book's spine, from what it says: a hardcover is tall with gold bands, a paperback shorter with its publisher's
 * mark, an e-book a thin dark slab. The thickness follows the pages; a book that does not say gets one of its own.
 * A book that does not say its format stands as a paperback.
 */
export function spineOf(
  book: Pick<Book, 'id' | 'title' | 'format' | 'pages' | 'authors'>,
): SpineLook {
  const h = hashOf(`${book.title}|${book.authors[0] ?? ''}|${book.id}`);
  if (book.format === 'digital')
    return { ...DIGITAL_LOOK, w: SPINE.digitalW, h: SPINE.digitalH, kind: 'digital' };
  const kind: SpineKind = book.format === 'pasta-dura' ? 'hard' : 'soft';
  const base = kind === 'hard' ? SPINE.hardH : SPINE.softH;
  const height = base - SPINE.heightJitter / 2 + (h % (SPINE.heightJitter + 1));
  const width = book.pages
    ? Math.round(SPINE.minW + book.pages / SPINE.pagesPerPx)
    : SPINE.guessW + ((h >>> 8) % (SPINE.guessJitter + 1));
  const cloth = CLOTHS[(h >>> 4) % CLOTHS.length];
  return {
    ...cloth,
    w: Math.max(SPINE.minW, Math.min(SPINE.maxW, width)),
    h: height,
    kind,
  };
}

/** The CSS variables a spine (or a cover drawn by code) reads. */
export const spineVars = (s: Cloth): CSSProperties =>
  ({ '--cl': s.cloth, '--ci': s.ink, '--cb': s.band }) as CSSProperties;

/** A genre's color (or an author's, a publisher's…): the usual genres have theirs, the rest one by name. */
export function accentOf(name: string): string {
  const key = fold(name);
  if (!key) return NONE_ACCENT;
  return GENRE_ACCENTS[key] ?? OTHER_ACCENTS[hashOf(key) % OTHER_ACCENTS.length];
}
