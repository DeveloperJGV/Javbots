import type { PomodoroStatus } from '../../../core/src/messages.js';
import { POMODORO_PANEL_TYPES } from './constants.js';

export interface PomodoroState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: PomodoroStatus;
  open: boolean;
}

/** The pomodoro (features/pomodoro), outside React: the panel reads it, OfficeState draws the clock and the sign. */
class PomodoroStore {
  private state: PomodoroState = { open: false };
  private listeners = new Set<() => void>();

  get = (): PomodoroState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PomodoroState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: PomodoroStatus): void {
    this.set({ status });
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }
}

export const pomodoroStore = new PomodoroStore();

/** A piece that opens the panel (the tomato timers and the hourglasses). */
export const isPomodoroFurniture = (type: string | undefined): boolean =>
  POMODORO_PANEL_TYPES.includes((type ?? '').split(':')[0]);
