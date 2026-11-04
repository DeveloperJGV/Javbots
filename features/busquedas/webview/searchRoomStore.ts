import { useEffect } from 'react';

import type { SearchRoomStatus } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';

export interface SearchRoomState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: SearchRoomStatus;
  open: boolean;
}

/** One search room's state (features/busquedas), outside React: its panel and its furniture read it. */
export class SearchRoomStore {
  private state: SearchRoomState = { open: false };
  private listeners = new Set<() => void>();

  readonly room: string;

  constructor(room: string) {
    this.room = room;
  }

  get = (): SearchRoomState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<SearchRoomState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: SearchRoomStatus): void {
    if (status.room === this.room) this.set({ status });
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }
}

/** Feeds a room's store from the server (call it from App from the start: the status comes once on open). */
export function useSearchRoom(transport: MessageTransport, store: SearchRoomStore): void {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'searchRoomStatus') store.setStatus(msg);
      }),
    [transport, store],
  );
}
