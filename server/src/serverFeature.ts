import type { FastifyInstance } from 'fastify';

import type { ConnectionInfo } from '../../core/src/messages.js';
import type { FloorSpec } from '../../core/src/offices.js';

/** One connected WebSocket client, as a feature sees it. */
export interface FeatureClient {
  send(message: Record<string, unknown>): void;
  /** Same privilege the core handler uses (out-of-band token proved on the handshake). */
  readonly privileged: boolean;
}

/**
 * An optional, self-contained feature that plugs into the HTTP/WebSocket server
 * without the core knowing what it does (e.g. features/musica). Everything is
 * optional so a feature only implements the seams it needs.
 */
export interface ServerFeature {
  readonly name: string;
  /** Extra HTTP routes, registered before the server starts listening. */
  registerRoutes?(app: FastifyInstance): void;
  /** A client connected; returns the cleanup for when it disconnects. */
  connect?(client: FeatureClient): () => void;
  /** Return true when the feature consumed the message (the core handler then skips it). */
  handleClientMessage?(msg: Record<string, unknown>, client: FeatureClient): boolean;
  dispose?(): void;
  /** The outside services it talks to and their state right now (features/conexiones shows them). */
  connections?(): ConnectionInfo[];
  /**
   * Floors it adds to a building (core/src/offices.ts), read once at startup: id, level, button, name and starting
   * layout. Its page code finds out which floor the page shows from officesStore (webview-ui/src/offices.ts).
   */
  floors?(): FloorSpec[];
}
