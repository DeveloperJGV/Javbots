import type { ConnectionInfo } from '../../../core/src/messages.js';

export interface ConnectionsState {
  /** Undefined until the server sends it (tokened pages only). */
  connections?: ConnectionInfo[];
  panelOpen: boolean;
}

/** The connections board, outside React: the panel reads it through useSyncExternalStore, OfficeState every tick. */
class ConnectionsStore {
  private state: ConnectionsState = { panelOpen: false };
  private listeners = new Set<() => void>();

  get = (): ConnectionsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<ConnectionsState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setConnections(connections: ConnectionInfo[]): void {
    this.set({ connections });
  }

  open(): void {
    this.set({ panelOpen: true });
  }

  close(): void {
    this.set({ panelOpen: false });
  }
}

export const connectionsStore = new ConnectionsStore();
