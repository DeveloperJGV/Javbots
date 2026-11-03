import type { ConcertsStatus } from '../../../core/src/messages.js';

export interface ConcertsState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: ConcertsStatus;
  open: boolean;
}

/** Upcoming concerts (features/conciertos), outside React: the panel and OfficeState read it. */
class ConcertsStore {
  private state: ConcertsState = { open: false };
  private listeners = new Set<() => void>();

  get = (): ConcertsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<ConcertsState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: ConcertsStatus): void {
    this.set({ status });
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }
}

export const concertsStore = new ConcertsStore();

/** Furniture that opens the panel: the concert tickets on the counter of the music room. */
export const CONCERT_TICKETS_TYPE = 'CONCERT_TICKETS';
export const isConcertTickets = (type: string | undefined): boolean =>
  (type ?? '').split(':')[0] === CONCERT_TICKETS_TYPE;
