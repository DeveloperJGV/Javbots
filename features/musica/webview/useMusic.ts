import { useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { type MusicState, musicStore } from './musicStore.js';

/** Feeds the music store from the server's music messages and returns its state. */
export function useMusic(transport: MessageTransport): MusicState {
  useEffect(
    () =>
      transport.onMessage((msg) => {
        if (msg.type === 'musicNowPlaying') musicStore.setTrack(msg.track);
        else if (msg.type === 'musicStatus') musicStore.setStatus(msg);
        else if (msg.type === 'musicLyrics') musicStore.setLyrics(msg);
      }),
    [transport],
  );
  return useSyncExternalStore(musicStore.subscribe, musicStore.get);
}
