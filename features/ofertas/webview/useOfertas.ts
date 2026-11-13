import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { OFERTAS_OPEN_HASH } from './constants.js';
import { ofertasStore } from './ofertasStore.js';

/** Opens the panel when the page's hash is #ofertas, and takes the hash off so it can open again. */
function openFromHash(): void {
  if (window.location.hash !== OFERTAS_OPEN_HASH) return;
  ofertasStore.open();
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}

/**
 * The deals finder (features/ofertas), fed from the server into ofertasStore. Called by App from the start: the
 * kiosk lights up with unseen alerts before the panel is ever opened.
 */
export function useOfertas(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'ofertasStatus') ofertasStore.setStatus(msg);
        else if (msg.type === 'ofertasResults') ofertasStore.setResults(msg);
        else if (msg.type === 'ofertasAsistenteEstado') ofertasStore.setAsistente(msg);
        else if (msg.type === 'ofertasAsistenteResultado') ofertasStore.setAsistenteResult(msg);
      }),
    [transport],
  );
  useEffect(() => {
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);
}
