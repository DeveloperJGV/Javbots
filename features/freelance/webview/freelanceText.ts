import type { FreelanceOfferSpec } from '../../../core/src/messages.js';
import { OFFER_ITEMS_MAX, OFFER_TEXT_MAX } from './constants.js';

/** A list as the editor shows it: one item per line. */
export const textOf = (items: readonly string[]): string => items.join('\n');

/** The editor's text → items: one per line, trimmed, no empty ones, cut to the limits. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim().slice(0, OFFER_TEXT_MAX))
    .filter(Boolean)
    .slice(0, OFFER_ITEMS_MAX);
}

/** Whether the offer can be saved (the server asks the same: a title or at least one service). */
export const offerReady = (o: Pick<FreelanceOfferSpec, 'title' | 'services'>): boolean =>
  o.title.trim().length > 0 || o.services.length > 0;
