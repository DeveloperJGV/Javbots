import type { ConnectionInfo, ConnectionsStatus } from '../../../core/src/messages.js';
import { createPollingFeature } from '../../../server/src/pollingFeature.js';
import type { ServerFeature } from '../../../server/src/serverFeature.js';
import { CONNECTIONS_POLL_MS, LOG_PREFIX } from './constants.js';

/** Every feature's connections, in feature order; a feature that throws is skipped (the board must not die with it). */
export function collectConnections(features: Iterable<ServerFeature>): ConnectionInfo[] {
  const out: ConnectionInfo[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    let list: ConnectionInfo[] = [];
    try {
      list = feature.connections?.() ?? [];
    } catch (err) {
      console.warn(`${LOG_PREFIX} ${feature.name} falló al reportar:`, err);
    }
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/**
 * The connections board (features/conexiones): which outside services the office talks to and how each one is
 * doing, as the features report it. Privileged pages only; sent when a page opens and whenever something changes.
 */
export function createConnectionsFeature(opts: {
  features: () => Iterable<ServerFeature>;
  pollMs?: number;
}): ReturnType<typeof createPollingFeature<ConnectionsStatus>> {
  const status = (): ConnectionsStatus => ({
    type: 'connectionsStatus',
    connections: collectConnections(opts.features()),
  });
  let last = '';
  let feature: ReturnType<typeof createPollingFeature<ConnectionsStatus>> | null = null;
  feature = createPollingFeature({
    name: 'conexiones',
    everyMs: opts.pollMs ?? CONNECTIONS_POLL_MS,
    enabled: true,
    read: async () => {
      if (!feature?.listeners) return null;
      const msg = status();
      const key = JSON.stringify(msg);
      if (key === last) return null;
      last = key;
      return msg;
    },
    snapshot: status,
    logPrefix: LOG_PREFIX,
  });
  return feature;
}
