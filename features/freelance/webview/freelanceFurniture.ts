import type { SearchRoomStatus } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  FREELANCE_WORLD_MAP_TYPE,
  MAP_CACHE_MAX,
  MAP_PIN_COLOR,
  MAP_PIN_PING_COLOR,
  MAP_PIN_PING_SEC,
  MAP_PIN_SIZE,
  MAP_PINS,
} from './constants.js';
import { openLeads } from './freelanceStore.js';

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();

const isMap = (type: string | undefined): boolean =>
  (type ?? '').split(':')[0] === FREELANCE_WORLD_MAP_TYPE;

/**
 * The client map with one pin lit per open lead (recommended, not marked), up to MAP_PINS.length; the drawn pins go
 * dark first (each takes the color just left of it) so only live ones show. `ping` = the pin drawn brighter right now
 * (-1 for none).
 */
export function worldMapSprite(sprite: SpriteData, leads: number, ping: number): SpriteData {
  const lit = Math.max(0, Math.min(MAP_PINS.length, leads));
  const key = `${lit}|${ping}`;
  let variants = cache.get(sprite);
  if (!variants) {
    variants = new Map();
    cache.set(sprite, variants);
  }
  const hit = variants.get(key);
  if (hit) return hit;
  if (variants.size >= MAP_CACHE_MAX) variants.clear();

  const out = sprite.map((row) => row.slice());
  const paint = (x0: number, y0: number, color: (y: number) => string) => {
    for (let dy = 0; dy < MAP_PIN_SIZE; dy++)
      for (let dx = 0; dx < MAP_PIN_SIZE; dx++)
        if (out[y0 + dy]?.[x0 + dx] !== undefined) out[y0 + dy][x0 + dx] = color(y0 + dy);
  };
  MAP_PINS.forEach((p, i) => {
    if (i < lit) paint(p.x, p.y, () => (i === ping ? MAP_PIN_PING_COLOR : MAP_PIN_COLOR));
    else paint(p.x, p.y, (y) => sprite[y]?.[p.x - 1] ?? sprite[y][p.x]);
  });
  variants.set(key, out);
  return out;
}

/**
 * The freelance room's live detail (runs with the other ambient steps, each frame): the world map lights a pin per
 * open lead and pings them one at a time. Without a status (a page without the token) the map keeps its drawn pins.
 */
export function applyFreelanceFurniture(
  instances: FurnitureInstance[],
  status: SearchRoomStatus | undefined,
  timeSec: number,
): FurnitureInstance[] {
  if (!status || !instances.some((f) => isMap(f.type))) return instances;
  const leads = Math.min(MAP_PINS.length, openLeads(status));
  const ping = leads ? Math.floor(timeSec / MAP_PIN_PING_SEC) % (leads + 1) : -1;
  return instances.map((f) =>
    isMap(f.type) ? { ...f, sprite: worldMapSprite(f.sprite, leads, ping < leads ? ping : -1) } : f,
  );
}
