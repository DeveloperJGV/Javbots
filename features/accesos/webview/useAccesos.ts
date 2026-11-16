import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { accesosStore } from './accesosStore.js';
import { ACCESOS_OPEN_HASH } from './constants.js';

/** Opens the panel when the page's hash is #accesos, and takes the hash off so it can open again. */
function openFromHash(): void {
  if (window.location.hash !== ACCESOS_OPEN_HASH) return;
  accesosStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/** The pages on this computer (features/accesos), fed from the server into accesosStore. Called by App from the
 *  start: the candle on the table follows them with the panel closed. */
export function useAccesos(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'accesosStatus') accesosStore.setStatus(msg);
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
