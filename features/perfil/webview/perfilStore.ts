import type { PerfilProfile } from '../../../core/src/messages.js';
import { PERFIL_SCREEN_TYPE } from './constants.js';

export interface PerfilState {
  /** Undefined until the server answers (tokened pages only) or when there's no perfil.json. */
  profile?: PerfilProfile;
  open: boolean;
}

/** The personality screen (features/perfil), outside React: the panel reads it, OfficeState draws the screen. */
class PerfilStore {
  private state: PerfilState = { open: false };
  private listeners = new Set<() => void>();

  get = (): PerfilState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PerfilState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setProfile(profile: PerfilProfile | undefined): void {
    this.set({ profile });
  }

  open(): void {
    this.set({ open: true });
  }

  close(): void {
    this.set({ open: false });
  }
}

export const perfilStore = new PerfilStore();

/** The piece that opens the panel. */
export const isPerfilFurniture = (type: string | undefined): boolean =>
  (type ?? '').split(':')[0] === PERFIL_SCREEN_TYPE;
