import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { DECKS_OPEN_HASH } from './constants.js';
import { decksStore } from './decksStore.js';

/** Opens the panel when the page's hash is #decks, and takes the hash off so it can open again. */
function openFromHash(): void {
  if (window.location.hash !== DECKS_OPEN_HASH) return;
  decksStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/** The Yu-Gi-Oh! decks (features/decks), fed from the server into decksStore. Called by App from the start. */
export function useDecks(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        switch (msg.type) {
          case 'decksStatus':
            decksStore.setStatus(msg);
            break;
          case 'decksCardInfo':
            decksStore.addCards(msg.cards, msg.missing);
            break;
          case 'decksSearchResults':
            decksStore.setSearchResults(msg.requestId, msg.cards);
            break;
          case 'decksImportResult':
            decksStore.setImportResult(msg.requestId, {
              ok: msg.ok,
              deck: msg.deck,
              problems: msg.problems,
            });
            break;
        }
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
