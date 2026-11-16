import type { AccesoView } from '../../../core/src/messages.js';
import { ACCESOS_PANEL_TYPES } from './constants.js';

/** What accesosStatus carries (core/asyncapi.yaml, block "Pages on this computer"). */
export interface AccesosStatusView {
  accesos: AccesoView[];
  file: string;
  problems: string[];
}

export interface AccesosState {
  open: boolean;
  /** Undefined until the server sends it (tokened pages only). */
  status?: AccesosStatusView;
  /** A start sent and not answered yet (the button waits). */
  pendingStart?: string;
}

/** The pages on this computer (features/accesos), outside React: the panel and the table read it. */
export class AccesosStore {
  private state: AccesosState = { open: false };
  private listeners = new Set<() => void>();

  get = (): AccesosState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<AccesosState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** For tests. */
  reset(): void {
    this.state = { open: false };
    for (const l of this.listeners) l();
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false, pendingStart: undefined });
  }

  setStatus(raw: { accesos: AccesoView[]; file: string; problems: string[] }): void {
    this.set({
      status: { accesos: raw.accesos, file: raw.file, problems: raw.problems },
      pendingStart: undefined,
    });
  }

  /** A start is about to be sent. */
  startPending(id: string): void {
    this.set({ pendingStart: id });
  }
}

export const accesosStore = new AccesosStore();

/** A piece that opens the pages panel. */
export const isAccesosFurniture = (type: string | undefined): boolean =>
  ACCESOS_PANEL_TYPES.includes((type ?? '').split(':')[0]);
