import { CHARACTER_SHADOW_WIDTH, PET_SHADOW_WIDTH, SUBAGENT_SCALE } from '../../constants.js';
import { getCachedSprite } from '../sprites/spriteCache.js';
import type { Character, FurnitureInstance, Pet, TileType as TileTypeVal } from '../types.js';
import { TILE_SIZE, TileType } from '../types.js';
import {
  characterCastsShadow,
  ellipseShadowSprite,
  furnitureShadowFor,
  WALL_BASE_SHADOW,
} from './shadows.js';

// ── Rendering ──────────────────────────────────────────────────

export function renderShadows(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  pets: Pet[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  characterAlpha: (ch: Character) => number,
): void {
  // Wall bases
  const wallShadow = getCachedSprite(WALL_BASE_SHADOW, zoom);
  for (let r = 0; r < tileMap.length - 1; r++) {
    const row = tileMap[r];
    const below = tileMap[r + 1];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== TileType.WALL) continue;
      const under = below[c];
      if (under === TileType.WALL || under === TileType.VOID) continue;
      ctx.drawImage(
        wallShadow,
        offsetX + c * TILE_SIZE * zoom,
        offsetY + (r + 1) * TILE_SIZE * zoom,
      );
    }
  }

  // Furniture
  for (const f of furniture) {
    if (!f.castsShadow) continue;
    const shadow = furnitureShadowFor(f.sprite, f.mirrored);
    if (!shadow) continue;
    const cached = getCachedSprite(shadow.sprite, zoom);
    ctx.drawImage(cached, offsetX + (f.x + shadow.dx) * zoom, offsetY + (f.y + shadow.dy) * zoom);
  }

  // Characters: a small ellipse at the feet, scaled like the sprite itself.
  const charShadow = ellipseShadowSprite(CHARACTER_SHADOW_WIDTH);
  for (const ch of characters) {
    if (!characterCastsShadow(ch)) continue;
    const charZoom = ch.isSubagent ? Math.max(1, Math.round(zoom * SUBAGENT_SCALE)) : zoom;
    const cached = getCachedSprite(charShadow, charZoom);
    const x = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const y = Math.round(offsetY + ch.y * zoom - 2 * charZoom);
    const alpha = characterAlpha(ch);
    if (alpha === 1) {
      ctx.drawImage(cached, x, y);
    } else {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(cached, x, y);
      ctx.restore();
    }
  }

  // Pets
  const petShadow = getCachedSprite(ellipseShadowSprite(PET_SHADOW_WIDTH), zoom);
  for (const pet of pets) {
    const x = Math.round(offsetX + pet.x * zoom - petShadow.width / 2);
    const y = Math.round(offsetY + pet.y * zoom - 2 * zoom);
    ctx.drawImage(petShadow, x, y);
  }
}
