import * as os from 'os';

import type { PerfilStatus } from '../../../core/src/messages.js';
import type { ServerFeature } from '../../../server/src/serverFeature.js';
import { readPerfil } from './perfilData.js';

/**
 * The personality screen of the freelance room (features/perfil): the owner's test result, read from
 * ~/.pixel-agents/perfil.json each time a page opens (so editing the file shows on the next F5). Personal data:
 * privileged connections only, and nothing of it ships in the repository.
 */
export function createPerfilFeature(opts: { home?: string } = {}): ServerFeature {
  const home = opts.home ?? os.homedir();
  return {
    name: 'perfil',
    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady' && client.privileged) {
        const profile = readPerfil(home);
        const status: PerfilStatus = profile
          ? { type: 'perfilStatus', profile }
          : { type: 'perfilStatus' };
        client.send(status as unknown as Record<string, unknown>);
      }
      return false; // webviewReady is everyone's
    },
  };
}
