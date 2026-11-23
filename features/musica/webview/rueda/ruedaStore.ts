import type { RuedaCommand, RuedaStatus } from '../../../../core/src/messages.js';
import type { MessageTransport } from '../../../../core/src/transport.js';

export interface RuedaState {
  /** Undefined until the server sends it: owner pages on Windows only. */
  status?: RuedaStatus;
  /** The options panel is open (from Settings or the player menu). */
  optionsOpen: boolean;
}

/** The volume wheel program (features/musica/rueda), outside React. */
class RuedaStore {
  private state: RuedaState = { optionsOpen: false };
  private listeners = new Set<() => void>();
  private transport: MessageTransport | null = null;

  /** useMusic hands it the page's transport, so the panels need no extra wiring. */
  setTransport(transport: MessageTransport): void {
    this.transport = transport;
  }

  send(command: Omit<RuedaCommand, 'type'>): void {
    this.transport?.send({ type: 'ruedaCommand', ...command });
  }

  get = (): RuedaState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<RuedaState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: RuedaStatus): void {
    this.set({ status });
  }

  openOptions(): void {
    this.set({ optionsOpen: true });
  }

  closeOptions(): void {
    this.set({ optionsOpen: false });
  }
}

export const ruedaStore = new RuedaStore();
