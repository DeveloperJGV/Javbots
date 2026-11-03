import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { agendaStore } from './agendaStore.js';

/**
 * The agenda (features/agenda), fed from the server into agendaStore. Called by App from the start: the server sends
 * the status once when the page opens, before the panel is on screen.
 */
export function useAgenda(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'agendaStatus') agendaStore.setStatus(msg);
      }),
    [transport],
  );
}
