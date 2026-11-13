import type { AgendaStatus } from '../../../core/src/messages.js';
import { AGENDA_FURNITURE_TYPES } from './constants.js';

export interface AgendaState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: AgendaStatus;
  open: boolean;
}

/** The agenda (features/agenda), outside React: the panel reads it, OfficeState lights the room's furniture with it. */
class AgendaStore {
  private state: AgendaState = { open: false };
  private listeners = new Set<() => void>();

  get = (): AgendaState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<AgendaState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: AgendaStatus): void {
    this.set({ status });
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }
}

export const agendaStore = new AgendaStore();

/** The piece of the agenda room that opens the panel, the console (rotations and states share the base type). */
export const isAgendaFurniture = (type: string | undefined): boolean =>
  AGENDA_FURNITURE_TYPES.includes((type ?? '').split(':')[0]);
