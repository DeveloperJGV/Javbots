import { useEffect } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { perfilStore } from './perfilStore.js';

/**
 * The personality screen (features/perfil), fed from the server into perfilStore. Called by App from the start: the
 * server answers webviewReady before the layout loads, and the screen needs it before the panel is ever opened.
 */
export function usePerfil(transport: MessageTransport): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'perfilStatus') perfilStore.setProfile(msg.profile);
      }),
    [transport],
  );
}
