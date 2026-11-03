import type { ConnectionInfo } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  CONNECTIONS_RACK_TYPE,
  RACK_BLINK_SEC,
  RACK_LED_SIZE,
  RACK_LEDS,
  STATE_COLORS,
  STATE_SHINE,
} from './constants.js';

export const isConnectionsRack = (type: string | undefined): boolean =>
  (type ?? '').split(':')[0] === CONNECTIONS_RACK_TYPE;

const KEY: Record<ConnectionInfo['state'], string> = { ok: 'g', warn: 'y', off: 'r', idea: 'b' };

/** One character per light (its color's initial), or '-' when the light stays off (blinking ones off this half). */
export function ledKey(connections: readonly ConnectionInfo[], blinkOff: boolean): string {
  return RACK_LEDS.map((_, i) => {
    const c = connections[i];
    if (!c || (blinkOff && c.state === 'warn')) return '-';
    return KEY[c.state];
  }).join('');
}

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();

/** The rack with one light per connection, in the order the server sends them. */
export function rackSprite(
  sprite: SpriteData,
  connections: readonly ConnectionInfo[],
  blinkOff: boolean,
): SpriteData {
  const key = ledKey(connections, blinkOff);
  let byKey = cache.get(sprite);
  if (!byKey) {
    byKey = new Map();
    cache.set(sprite, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const out = sprite.map((row) => row.slice());
  RACK_LEDS.forEach((led, i) => {
    const c = connections[i];
    if (!c || key[i] === '-') return;
    for (let dy = 0; dy < RACK_LED_SIZE; dy++) {
      for (let dx = 0; dx < RACK_LED_SIZE; dx++) {
        const row = out[led.y + dy];
        if (!row || led.x + dx >= row.length) continue;
        row[led.x + dx] =
          dx === RACK_LED_SIZE - 1 && dy === 0 ? STATE_SHINE[c.state] : STATE_COLORS[c.state];
      }
    }
  });
  byKey.set(key, out);
  return out;
}

/** Lights the connections rack (features/conexiones); `timeSec` drives the blink of the ones that need attention. */
export function applyConnectionsFurniture(
  instances: FurnitureInstance[],
  connections: readonly ConnectionInfo[] | undefined,
  timeSec: number,
): FurnitureInstance[] {
  if (!connections || !instances.some((f) => isConnectionsRack(f.type))) return instances;
  const blinkOff = Math.floor(timeSec / RACK_BLINK_SEC) % 2 === 1;
  return instances.map((f) =>
    isConnectionsRack(f.type) ? { ...f, sprite: rackSprite(f.sprite, connections, blinkOff) } : f,
  );
}
