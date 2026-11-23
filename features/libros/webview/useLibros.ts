import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { LIBROS_OPEN_HASH } from './constants.js';
import { librosStore } from './librosStore.js';

/** Opens the panel when the page's hash is #libros, and takes the hash off so it can open again. */
function openFromHash(): void {
  if (window.location.hash !== LIBROS_OPEN_HASH) return;
  librosStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/** The book library (features/libros), fed from the server into librosStore. Called by App from the start. */
export function useLibros(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'librosStatus') librosStore.setStatus(msg);
        else if (msg.type === 'librosResult') librosStore.setResult(msg);
        else if (msg.type === 'librosLookupResult') librosStore.setLookup(msg);
      }),
    [transport],
  );
  // A dropped connection never answers what was waiting: free the buttons and say so
  useEffect(
    () =>
      transport.onStateChange((state) => {
        if (state !== 'connected') librosStore.connectionLost();
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
