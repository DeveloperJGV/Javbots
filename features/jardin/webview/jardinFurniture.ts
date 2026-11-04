import type { JardinStatus } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import { THIRSTY_DARKEN, THIRSTY_DROOP_PART, THIRSTY_DROOP_PX, THIRSTY_GRAY } from './constants.js';
import { isThirsty } from './jardinText.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];

/** "#rrggbb" or "#rrggbbaa" → grayer and darker, alpha kept. */
function wilt(color: string): string {
  if (!color || color[0] !== '#' || (color.length !== 7 && color.length !== 9)) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const gray = 0.3 * r + 0.59 * g + 0.11 * b;
  const mix = (c: number) =>
    Math.max(0, Math.min(255, Math.round((c + (gray - c) * THIRSTY_GRAY) * THIRSTY_DARKEN)));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(r))}${hex(mix(g))}${hex(mix(b))}${color.slice(7)}`;
}

/**
 * A thirsty plant: its colors go gray and dark, and its top part slides down a pixel (drooping). Works on any plant
 * sprite, so the roof's art gets it for free; a hand-drawn thirsty state could replace it here later.
 */
export function thirstySprite(sprite: SpriteData): SpriteData {
  const h = sprite.length;
  const cut = Math.round(h * THIRSTY_DROOP_PART);
  const wilted = sprite.map((row) => row.map(wilt));
  const out: SpriteData = wilted.map((row, y) => (y < cut ? row.map(() => '') : row.slice()));
  // The top part, one droop lower; its painted pixels go over what was there.
  for (let y = 0; y < cut; y++) {
    const to = y + THIRSTY_DROOP_PX;
    if (to >= h) continue;
    wilted[y].forEach((px, x) => {
      if (px) out[to][x] = px;
    });
  }
  return out;
}

const cache = new WeakMap<SpriteData, SpriteData>();
const thirsty = (s: SpriteData) => {
  let hit = cache.get(s);
  if (!hit) {
    hit = thirstySprite(s);
    cache.set(s, hit);
  }
  return hit;
};

/** Plants whose watering is late look thirsty on their furniture (a plant names its furniture by type). */
export function applyJardinFurniture(
  instances: FurnitureInstance[],
  status: JardinStatus | undefined,
): FurnitureInstance[] {
  if (!status) return instances;
  const dry = new Set(
    status.plants
      .filter((p) => p.furniture && isThirsty(p, status.today))
      .map((p) => baseType(p.furniture)),
  );
  if (dry.size === 0) return instances;
  return instances.map((f) =>
    dry.has(baseType(f.type)) ? { ...f, sprite: thirsty(f.sprite) } : f,
  );
}
