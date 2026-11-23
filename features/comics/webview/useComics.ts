import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { comicsStore } from './comicsStore.js';
import { COMICS_OPEN_HASH } from './constants.js';

function openFromHash(): void {
  if (window.location.hash !== COMICS_OPEN_HASH) return;
  comicsStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/** Comics and manga (features/comics), fed from the server into comicsStore. Called by App from the start. */
export function useComics(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'comicsStatus') comicsStore.setStatus(msg);
        else if (msg.type === 'comicsResult') comicsStore.setResult(msg);
        else if (msg.type === 'comicsLookupResult') comicsStore.setLookup(msg);
      }),
    [transport],
  );
  useEffect(
    () =>
      transport.onStateChange((state) => {
        if (state !== 'connected') comicsStore.connectionLost();
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
