import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { jardinStore } from './jardinStore.js';

/**
 * The roof garden (features/jardin), fed from the server into jardinStore. Called by App from the start: the server
 * sends the status once when the page opens, before the panel is on screen.
 */
export function useJardin(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'jardinStatus') jardinStore.setStatus(msg);
      }),
    [transport],
  );
}
