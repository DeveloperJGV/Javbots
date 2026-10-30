import { useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { type GithubState, githubStore } from './githubStore.js';

/** The GitHub room (features/github), fed from the server into githubStore. */
export function useGithub(transport: MessageTransport): GithubState {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'githubStatus') githubStore.setStatus(msg);
      }),
    [transport],
  );
  return useSyncExternalStore(githubStore.subscribe, githubStore.get);
}
