/** The storage room, outside React: the panel reads it through useSyncExternalStore, App listens for "take out". */
export interface BodegaState {
  open: boolean;
}

type TakeOutListener = (type: string) => void;

class BodegaStore {
  private state: BodegaState = { open: false };
  private listeners = new Set<() => void>();
  private takeOutListeners = new Set<TakeOutListener>();

  get = (): BodegaState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<BodegaState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }

  /** Closes the panel and asks the editor to place this piece. */
  takeOut(type: string): void {
    this.close();
    for (const l of this.takeOutListeners) l(type);
  }

  onTakeOut(listener: TakeOutListener): () => void {
    this.takeOutListeners.add(listener);
    return () => this.takeOutListeners.delete(listener);
  }
}

export const bodegaStore = new BodegaStore();
