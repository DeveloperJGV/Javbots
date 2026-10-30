import type { GithubStatus } from '../../../core/src/messages.js';

export interface GithubHover {
  /** A repository's name, or the graph / PR board. */
  label: string;
  x: number;
  y: number;
}

export interface GithubState {
  /** Undefined until the server sends it (tokened pages with `gh` only). */
  status?: GithubStatus;
  detailOpen: boolean;
  /** Repository to show first in the detail (the cabinet that was clicked). */
  focusRepo?: string;
  hover: GithubHover | null;
}

/** The GitHub room, outside React: the panel reads it through useSyncExternalStore, OfficeState every furniture tick. */
class GithubStore {
  private state: GithubState = { detailOpen: false, hover: null };
  private listeners = new Set<() => void>();

  get = (): GithubState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<GithubState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: GithubStatus): void {
    this.set({ status });
  }

  open(focusRepo?: string): void {
    this.set({ detailOpen: true, focusRepo, hover: null });
  }

  close(): void {
    this.set({ detailOpen: false });
  }

  setHover(hover: GithubHover | null): void {
    const h = this.state.hover;
    if (
      h === hover ||
      (h && hover && h.label === hover.label && h.x === hover.x && h.y === hover.y)
    )
      return;
    this.set({ hover });
  }
}

export const githubStore = new GithubStore();
