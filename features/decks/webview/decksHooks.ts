import { useEffect, useMemo } from 'react';

import type { CardLookup, DeckCard } from '../core/types.js';
import { CARDS_BATCH_MAX } from './constants.js';
import type { Send } from './DecksBits.js';
import { decksStore } from './decksStore.js';

/** The cards the page knows as a CardLookup for the core functions (group, warnings). */
export function useLookup(cards: ReadonlyMap<number, DeckCard>, ready: boolean): CardLookup {
  return useMemo(
    () => ({ ready, get: (id: number) => cards.get(id), findByName: () => undefined }),
    [cards, ready],
  );
}

/** Asks the server for the cards of these codes that the page doesn't have yet. */
export function useNeedCards(ids: readonly number[], send: Send, dbReady: boolean): void {
  const key = ids.join(',');
  useEffect(() => {
    if (!dbReady) return;
    const need = decksStore.needCards(key ? key.split(',').map(Number) : []);
    for (let i = 0; i < need.length; i += CARDS_BATCH_MAX)
      send({ type: 'decksCards', ids: need.slice(i, i + CARDS_BATCH_MAX) });
  }, [key, send, dbReady]);
}
