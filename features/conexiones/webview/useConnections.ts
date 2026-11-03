import { useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { type ConnectionsState, connectionsStore } from './connectionsStore.js';

/** The connections board (features/conexiones), fed from the server into connectionsStore. */
export function useConnections(transport: MessageTransport): ConnectionsState {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'connectionsStatus') connectionsStore.setConnections(msg.connections);
      }),
    [transport],
  );
  return useSyncExternalStore(connectionsStore.subscribe, connectionsStore.get);
}
