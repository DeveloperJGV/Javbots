import type { UsageProfile } from '../../../core/src/messages.js';

export interface UsageState {
  /** Undefined until the server sends them (tokened pages only). */
  profiles?: UsageProfile[];
  /** The detail window is open (from the bar or a click on the office's USAGE_METER). */
  detailOpen: boolean;
}

/**
 * Claude usage, outside React: the bar reads it through useSyncExternalStore and OfficeState reads it every
 * furniture tick to fill the meter in the office.
 */
class UsageStore {
  private state: UsageState = { detailOpen: false };
  private listeners = new Set<() => void>();

  get = (): UsageState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<UsageState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setProfiles(profiles: UsageProfile[]): void {
    this.set({ profiles });
  }

  setDetailOpen(detailOpen: boolean): void {
    this.set({ detailOpen });
  }
}

export const usageStore = new UsageStore();
