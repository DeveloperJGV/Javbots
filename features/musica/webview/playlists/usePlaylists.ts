import { useEffect } from 'react';

import type { MessageTransport } from '../../../../core/src/transport.js';
import { playlistStore } from './playlistStore.js';

/**
 * "Playlist del día" (features/musica), fed from the server into playlistStore. Called by App from the start: the
 * server sends the status once when the page opens, before the panel is on screen.
 */
export function usePlaylists(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'playlistStatus') playlistStore.setStatus(msg);
      }),
    [transport],
  );
}
