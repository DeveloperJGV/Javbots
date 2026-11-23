import { useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { type MusicState, musicStore } from './musicStore.js';
import { ruedaStore } from './rueda/ruedaStore.js';

/** Feeds the music store from the server's music messages and returns its state. */
export function useMusic(transport: MessageTransport): MusicState {
  useEffect(() => {
    // The volume wheel program (features/musica/rueda) rides on the music connection
    ruedaStore.setTransport(transport);
    return transport.onMessage((msg) => {
      if (msg.type === 'musicNowPlaying') musicStore.setTrack(msg.track);
      else if (msg.type === 'musicStatus') musicStore.setStatus(msg);
      else if (msg.type === 'musicLyrics') musicStore.setLyrics(msg);
      else if (msg.type === 'ruedaStatus') ruedaStore.setStatus(msg);
    });
  }, [transport]);
  return useSyncExternalStore(musicStore.subscribe, musicStore.get);
}
