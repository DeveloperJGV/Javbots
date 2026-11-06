import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { concertsStore } from './concertsStore.js';

/**
 * The concerts panel (features/conciertos), fed from the server into concertsStore. Mounted by App from the start:
 * the server sends the last answer on webviewReady, before layoutLoaded, when ConcertsPanel isn't mounted yet.
 */
export function useConcerts(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'concertsStatus') concertsStore.setStatus(msg);
      }),
    [transport],
  );
}
