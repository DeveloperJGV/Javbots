import type { PlaylistStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../../webview-ui/src/office/types.js';
import { PLAYLIST_PRESS_COLORS } from '../constants.js';
import { MUSICA_PLAYLIST_PRESS, PRESS_BLINK_SEC, PRESS_WINDOW } from './constants.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];
const cache = new WeakMap<SpriteData, SpriteData>();

/** Whether the press is pressing: while the server builds or creates a list. */
export const pressWorking = (status: PlaylistStatus | undefined): boolean =>
  status?.busy === 'preview' || status?.busy === 'creating';

/** The press with its round window lit (only the painted pixels of the window change). */
export function pressLitSprite(base: SpriteData): SpriteData {
  const out = base.map((row) => [...row]);
  for (let y = PRESS_WINDOW.y0; y <= PRESS_WINDOW.y1; y++) {
    for (let x = PRESS_WINDOW.x0; x <= PRESS_WINDOW.x1; x++) {
      if (!out[y]?.[x]) continue;
      const shine = y === PRESS_WINDOW.y0 + 1 && x === PRESS_WINDOW.x0 + 1;
      out[y][x] = shine ? PLAYLIST_PRESS_COLORS.onShine : PLAYLIST_PRESS_COLORS.on;
    }
  }
  return out;
}

/** Playlist of the day (features/musica): the press window blinks while a list is being built or created. */
export function applyPlaylistFurniture(
  instances: FurnitureInstance[],
  status: PlaylistStatus | undefined,
  timeSec: number,
): FurnitureInstance[] {
  if (!pressWorking(status)) return instances;
  if (Math.floor(timeSec / PRESS_BLINK_SEC) % 2 === 1) return instances;
  return instances.map((f) => {
    if (baseType(f.type) !== MUSICA_PLAYLIST_PRESS) return f;
    let lit = cache.get(f.sprite);
    if (!lit) {
      lit = pressLitSprite(f.sprite);
      cache.set(f.sprite, lit);
    }
    return { ...f, sprite: lit };
  });
}
