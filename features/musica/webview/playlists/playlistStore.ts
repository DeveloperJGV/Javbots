import type { PlaylistStatus } from '../../../../core/src/messages.js';
import { PLAYLIST_PIECES, type PlaylistPiece, type PlaylistTab } from './constants.js';

export interface PlaylistState {
  /** Undefined until the server sends it (tokened pages only). */
  status?: PlaylistStatus;
  open: boolean;
  tab: PlaylistTab;
  /** "Dime qué quieres": what is typed survives the preview and closing the panel. */
  draft: DescribeDraft;
}

export interface DescribeDraft {
  text: string;
  minutes: number;
  avoidRecent: boolean;
}

/** "Playlist del día" (features/musica), outside React: the panel reads it, OfficeState animates the press with it. */
class PlaylistStore {
  private state: PlaylistState = {
    open: false,
    tab: 'armar',
    draft: { text: '', minutes: 60, avoidRecent: true },
  };
  private listeners = new Set<() => void>();

  get = (): PlaylistState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PlaylistState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  setStatus(status: PlaylistStatus): void {
    this.set({ status });
  }

  open(tab?: PlaylistTab): void {
    this.set({ open: true, tab: tab ?? this.state.tab });
  }

  setTab(tab: PlaylistTab): void {
    this.set({ tab });
  }

  setDraft(change: Partial<DescribeDraft>): void {
    this.set({ draft: { ...this.state.draft, ...change } });
  }

  close(): void {
    this.set({ open: false });
  }
}

export const playlistStore = new PlaylistStore();

/** Which piece of the playlist corner a furniture type is, if any. */
export const playlistPieceOf = (type: string | undefined): PlaylistPiece | null =>
  PLAYLIST_PIECES[(type ?? '').split(':')[0]] ?? null;
