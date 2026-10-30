import { useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { type UsageState, usageStore } from './usageStore.js';

/** Claude usage per profile (features/usage), fed from the server into usageStore. */
export function useUsage(transport: MessageTransport): UsageState {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'usageStatus') usageStore.setProfiles(msg.profiles);
      }),
    [transport],
  );
  return useSyncExternalStore(usageStore.subscribe, usageStore.get);
}
