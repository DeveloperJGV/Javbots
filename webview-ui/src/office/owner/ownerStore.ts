import { perfilStore } from '../../../../features/perfil/webview/perfilStore.js';
import { OWNER_DEFAULT_LABEL } from '../../constants.js';
import type { OwnerEmote } from './ownerEmotes.js';

export interface OwnerState {
  /** Index of the owner's sheet among the loaded character sheets (characterSpritesLoaded.owner); undefined when no
   *  asset folder brings an avatar. */
  sheet?: number;
  /** Display name from the avatar's manifest. */
  name?: string;
  /** Its emotes (manifest `emotes`); empty without them. */
  emotes: readonly OwnerEmote[];
  /** The setting that shows or hides the owner (settingsLoaded.ownerEnabled). */
  enabled: boolean;
}

/** The office's owner (office/owner), outside React: OfficeState reads it every frame, Settings shows its switch. */
class OwnerStore {
  private state: OwnerState = { enabled: true, emotes: [] };
  private listeners = new Set<() => void>();

  get = (): OwnerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<OwnerState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setSheet(owner: { sheet: number; name?: string; emotes?: OwnerEmote[] } | undefined): void {
    // The server already validated them; a frameless or still one could never play or end
    const emotes = (owner?.emotes ?? []).filter(
      (e) => e.frames.length > 0 && e.fps > 0 && e.loops >= 1,
    );
    this.set({ sheet: owner?.sheet, name: owner?.name, emotes });
  }

  setEnabled(enabled: boolean): void {
    this.set({ enabled });
  }
}

export const ownerStore = new OwnerStore();

/** The hover label: the profile's name when there is one, else the avatar's own, else a plain "you". */
export function ownerLabel(): string {
  return perfilStore.get().profile?.name || ownerStore.get().name || OWNER_DEFAULT_LABEL;
}
