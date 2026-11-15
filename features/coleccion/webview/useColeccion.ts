import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { coleccionStore } from './coleccionStore.js';
import { COLECCION_OPEN_HASH } from './constants.js';

/** Opens the panel when the page's hash is #coleccion, and takes the hash off so it can open again. */
function openFromHash(): void {
  if (window.location.hash !== COLECCION_OPEN_HASH) return;
  coleccionStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/** The game collection (features/coleccion), fed from the server into coleccionStore. Called by App from the start. */
export function useColeccion(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'coleccionStatus') coleccionStore.setStatus(msg);
        else if (msg.type === 'coleccionResult') coleccionStore.setResult(msg);
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
