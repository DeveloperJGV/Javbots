import type { MessageTransport } from './transport/types.js';

/**
 * Whether this page holds the owner's token, as the server says on every connection (`officeAccess`, standalone).
 * Listens from the moment it is created: both answers arrive before the layout loads, and OfficeAccessNotice only
 * mounts after it, so a component-level listener missed them. `null` = not told (yet, or since the socket dropped).
 */
export function createOfficeAccessStore(transport: MessageTransport) {
  let privileged: boolean | null = null;
  const listeners = new Set<() => void>();
  const set = (next: boolean | null) => {
    if (next === privileged) return;
    privileged = next;
    for (const l of listeners) l();
  };
  transport.onMessage((msg) => {
    if (msg.type === 'officeAccess') set(msg.privileged);
  });
  // The next connection answers again; while down, ConnectionIndicator holds the spot.
  transport.onStateChange((state) => {
    if (state !== 'connected') set(null);
  });
  return {
    get: (): boolean | null => privileged,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
