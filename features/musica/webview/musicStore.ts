import type { MusicLyrics, MusicStatus, MusicTrack } from '../../../core/src/messages.js';
import { LYRIC_LEAD_MS, MUSIC_COLUMN_HIDDEN_KEY, MUSIC_PAUSE_HIDE_SEC } from './constants.js';

type SpriteData = string[][];

export interface MusicState {
  status?: MusicStatus;
  track?: MusicTrack;
  /** When the current report arrived (ms): the progress bar runs from here. */
  receivedAt: number;
  /** Since when the track has been paused (ms), for hiding the column. */
  pausedSince?: number;
  /** The cover reduced to pixel art for the office's ALBUM_FRAME (null while decoding / none). */
  coverSprite: SpriteData | null;
  /** The viewer hid the column with a click on the turntable (remembered in this browser). */
  columnHidden: boolean;
  /** Lyrics of the current track (none until they arrive, or when there aren't any). */
  lyrics?: MusicLyrics;
}

function readColumnHidden(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUSIC_COLUMN_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The music state, outside React: the column reads it through
 * useSyncExternalStore and OfficeState reads it every furniture tick.
 */
class MusicStore {
  private state: MusicState = {
    receivedAt: 0,
    coverSprite: null,
    columnHidden: readColumnHidden(),
  };
  private listeners = new Set<() => void>();
  private coverOf: string | undefined;

  get = (): MusicState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<MusicState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** Show / hide the column (a click on the turntable). */
  toggleColumn(): void {
    const columnHidden = !this.state.columnHidden;
    try {
      if (columnHidden) globalThis.localStorage?.setItem(MUSIC_COLUMN_HIDDEN_KEY, '1');
      else globalThis.localStorage?.removeItem(MUSIC_COLUMN_HIDDEN_KEY);
    } catch {
      // no storage (private window, tests): it just isn't remembered
    }
    this.set({ columnHidden });
  }

  /** Kept even without lines: "still looking" and "there are none" matter too (loader / message). */
  setLyrics(lyrics: MusicLyrics): void {
    this.set({ lyrics: lyrics.title !== undefined ? lyrics : undefined });
  }

  setStatus(status: MusicStatus): void {
    this.set({ status });
  }

  setTrack(track: MusicTrack | undefined, nowMs = Date.now()): void {
    const pausedSince = track?.isPaused
      ? this.state.track?.isPaused
        ? this.state.pausedSince
        : nowMs
      : undefined;
    this.set({ track, receivedAt: nowMs, pausedSince });
    const cover = track?.cover;
    if (cover === this.coverOf) return;
    this.coverOf = cover;
    if (!cover) {
      this.set({ coverSprite: null });
      return;
    }
    void decodeCover(cover).then((sprite) => {
      if (this.coverOf === cover) this.set({ coverSprite: sprite });
    });
  }
}

export const musicStore = new MusicStore();

/** Playing right now (not paused): the turntable spins and notes rise. */
export function isMusicPlaying(state: MusicState): boolean {
  return Boolean(state.status?.enabled !== false && state.track && !state.track.isPaused);
}

/** The column shows while something plays, and for a little while after a pause. */
export function isColumnVisible(state: MusicState, nowMs = Date.now()): boolean {
  if (!state.track || state.status?.enabled === false || state.columnHidden) return false;
  if (!state.track.isPaused) return true;
  return nowMs - (state.pausedSince ?? nowMs) < MUSIC_PAUSE_HIDE_SEC * 1000;
}

/** Where the song is now: the reported position plus the time since, while playing. */
export function playbackPositionMs(state: MusicState, nowMs = Date.now()): number {
  const t = state.track;
  if (!t) return 0;
  const pos = t.isPaused ? t.positionMs : t.positionMs + (nowMs - state.receivedAt);
  return t.durationMs > 0 ? Math.min(pos, t.durationMs) : pos;
}

/** Lyrics that belong to the track on screen (a late message from the previous song never shows). */
export function currentLyrics(state: MusicState): MusicLyrics | undefined {
  const { lyrics, track } = state;
  if (!lyrics?.lines?.length || !track) return undefined;
  return lyrics.title === track.title && lyrics.artist === track.artist ? lyrics : undefined;
}

/** Where the lyrics of the track on screen stand: on their way, here, or nowhere to be found. */
export function lyricsStatus(state: MusicState): 'loading' | 'ready' | 'none' | undefined {
  const { lyrics, track } = state;
  if (!track) return undefined;
  // Nothing yet about THIS song (a new one just started): they're on their way.
  if (!lyrics || lyrics.title !== track.title || lyrics.artist !== track.artist) return 'loading';
  if (lyrics.lines?.length) return 'ready';
  return lyrics.loading ? 'loading' : 'none';
}

/** Index of the synced line being sung now (-1 before the first one, or when not synced). */
export function currentLyricIndex(state: MusicState, nowMs = Date.now()): number {
  const lyrics = currentLyrics(state);
  if (!lyrics?.synced || !lyrics.lines) return -1;
  const pos = playbackPositionMs(state, nowMs) + LYRIC_LEAD_MS;
  let lo = 0;
  let hi = lyrics.lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lyrics.lines[mid].timeMs ?? 0) <= pos) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Reduce a data-URL cover to the frame's pixel art (browser only; resolves null if it can't decode). */
async function decodeCover(dataUrl: string): Promise<SpriteData | null> {
  if (!('document' in globalThis)) return null;
  const { coverToSprite } = await import('./coverSprite.js');
  return coverToSprite(dataUrl);
}
