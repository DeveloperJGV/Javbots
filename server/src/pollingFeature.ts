import type { FeatureClient, ServerFeature } from './serverFeature.js';

/** A feature that reads something every few minutes and tells the pages (e.g. features/usage). */
export interface PollingFeatureSpec<M extends { type: string }> {
  name: string;
  /** Between reads. Off (no timer, no reads) when `enabled` is false. */
  everyMs: number;
  enabled: boolean;
  /** One read: the message for every privileged page, or null to send nothing this time. Should not throw. */
  read(): Promise<M | null>;
  /** What a page gets as soon as it says it's ready (null = nothing to show yet). */
  snapshot(): M | null;
  /** Log prefix for a read that threw anyway. */
  logPrefix: string;
}

/**
 * The shared plumbing: only privileged (tokened) pages are told anything — it is work data —, a page that opens gets
 * the latest snapshot on webviewReady (sent on connect it would be lost), reads never overlap, and the timer never
 * keeps the process alive.
 */
export function createPollingFeature<M extends { type: string }>(
  spec: PollingFeatureSpec<M>,
): ServerFeature & {
  /** One read right now (also what the timer calls). */
  poll(): Promise<void>;
  /** How many pages are listening. */
  readonly listeners: number;
} {
  const clients = new Set<FeatureClient>();
  let polling: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const send = (client: FeatureClient, msg: M) =>
    client.send(msg as unknown as Record<string, unknown>);

  function poll(): Promise<void> {
    if (!spec.enabled) return Promise.resolve();
    polling ??= spec
      .read()
      .then((msg) => {
        if (msg) for (const client of clients) send(client, msg);
      })
      .catch((err: unknown) => console.warn(`${spec.logPrefix} Falló la lectura:`, err))
      .finally(() => (polling = null));
    return polling;
  }

  if (spec.enabled) {
    void poll();
    timer = setInterval(() => void poll(), spec.everyMs);
    timer.unref?.();
  }

  return {
    name: spec.name,
    connect(client) {
      if (!client.privileged || !spec.enabled) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },
    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady' && client.privileged && spec.enabled) {
        const snap = spec.snapshot();
        if (snap) send(client, snap);
      }
      return false; // the core handler still runs
    },
    dispose() {
      if (timer) clearInterval(timer);
    },
    poll,
    get listeners() {
      return clients.size;
    },
  };
}
