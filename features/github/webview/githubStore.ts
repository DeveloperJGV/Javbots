import type { GithubNotice, GithubStatus } from '../../../core/src/messages.js';

export interface GithubState {
  /** Undefined until the server sends it (tokened pages with `gh` only). */
  status?: GithubStatus;
  detailOpen: boolean;
  /** Repository to show first in the detail (the cabinet that was clicked). */
  focusRepo?: string;
  /** Why this office's gh login gives no data, and the command that fixes it (githubNotice). */
  notice?: { text: string; command?: string };
  /** The notice text the person closed: it comes back only if it changes. */
  dismissed?: string;
}

/** The GitHub room, outside React: the panel reads it through useSyncExternalStore, OfficeState every furniture tick. */
class GithubStore {
  private state: GithubState = { detailOpen: false };
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

  setNotice(msg: GithubNotice): void {
    this.set({
      notice: msg.text
        ? { text: msg.text, ...(msg.command ? { command: msg.command } : {}) }
        : undefined,
    });
  }

  dismissNotice(): void {
    this.set({ dismissed: this.state.notice?.text });
  }

  open(focusRepo?: string): void {
    this.set({ detailOpen: true, focusRepo });
  }

  close(): void {
    this.set({ detailOpen: false });
  }
}

export const githubStore = new GithubStore();
