// How interns (sub-agents) come and go (fork, Fase 3):
//   spawn   — a shadow clone (Naruto): a puff of smoke, the copy inside it;
//   despawn — petrification (Dr. Stone): stone creeps up from the feet,
//             then the statue crumbles away.

import {
  CLONE_REVEAL_AT,
  CLONE_SMOKE_COLORS,
  CLONE_SMOKE_PUFFS,
  CLONE_SMOKE_RADIUS_PX,
  CLONE_SPAWN_SEC,
  PETRIFY_SEC,
  PETRIFY_STONE_SHARE,
  STONE_FALL_PX,
} from '../../constants.js';
import type { Character, SpriteData } from '../types.js';
import { pixelNoise, stonePixel } from './stone.js';

/** Filled pixel-art disc centered on (cx, cy) in device pixels. */
function pixelDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  zoom: number,
): void {
  const r = Math.max(1, Math.round(radius));
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(
      Math.round(cx - (half + 0.5) * zoom),
      Math.round(cy + (dy - 0.5) * zoom),
      (2 * half + 1) * zoom,
      zoom,
    );
  }
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const pixel = sprite[row][col];
      if (!pixel) continue;
      ctx.fillStyle = pixel;
      ctx.fillRect(drawX + col * zoom, drawY + row * zoom, zoom, zoom);
    }
  }
}

function renderCloneSpawn(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  sprite: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const p = Math.min(1, ch.matrixEffectTimer / CLONE_SPAWN_SEC);
  if (p >= CLONE_REVEAL_AT) drawSprite(ctx, sprite, drawX, drawY, zoom);

  const w = (sprite[0]?.length ?? 16) * zoom;
  const h = sprite.length * zoom;
  const cx = drawX + w / 2;
  const cy = drawY + h * 0.65;
  const spread = 1 - (1 - p) * (1 - p); // ease out
  ctx.save();
  ctx.globalAlpha = p < CLONE_REVEAL_AT ? 1 : 1 - (p - CLONE_REVEAL_AT) / (1 - CLONE_REVEAL_AT);
  // The core puff hides the body until the clone is revealed
  ctx.fillStyle = CLONE_SMOKE_COLORS[1];
  pixelDisc(ctx, cx, cy, CLONE_SMOKE_RADIUS_PX * 0.6 * (1 - p * 0.6), zoom);
  for (let i = 0; i < CLONE_SMOKE_PUFFS; i++) {
    const seed = ch.matrixEffectSeeds[i] ?? 0.5;
    const angle = (i / CLONE_SMOKE_PUFFS) * Math.PI * 2 + seed;
    const dist = CLONE_SMOKE_RADIUS_PX * (0.35 + 0.65 * spread) * zoom;
    ctx.fillStyle = CLONE_SMOKE_COLORS[i % CLONE_SMOKE_COLORS.length];
    pixelDisc(
      ctx,
      cx + Math.cos(angle) * dist,
      cy + Math.sin(angle) * dist * 0.7,
      (2.5 + seed * 2.5) * (1 - p * 0.5),
      zoom,
    );
  }
  ctx.restore();
}

function renderPetrify(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  sprite: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const p = Math.min(1, ch.matrixEffectTimer / PETRIFY_SEC);
  const rows = sprite.length;
  // Stone climbs from the feet up, then the statue crumbles
  const stoneRows = Math.min(1, p / PETRIFY_STONE_SHARE) * rows;
  const crumble = Math.max(0, (p - PETRIFY_STONE_SHARE) / (1 - PETRIFY_STONE_SHARE));
  for (let row = 0; row < rows; row++) {
    const isStone = rows - 1 - row < stoneRows;
    for (let col = 0; col < sprite[row].length; col++) {
      const pixel = sprite[row][col];
      if (!pixel) continue;
      let fall = 0;
      if (crumble > 0) {
        // Each pixel breaks off at its own moment, falls and fades
        const breakAt = pixelNoise(col, row) * 0.7;
        const t = (crumble - breakAt) / 0.3;
        if (t >= 1) continue;
        if (t > 0) fall = t * t * STONE_FALL_PX;
      }
      ctx.fillStyle = isStone ? stonePixel(pixel, col, row) : pixel;
      ctx.fillRect(drawX + col * zoom, Math.round(drawY + (row + fall) * zoom), zoom, zoom);
    }
  }
}

export function renderInternEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  sprite: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  if (ch.matrixEffect === 'spawn') renderCloneSpawn(ctx, ch, sprite, drawX, drawY, zoom);
  else renderPetrify(ctx, ch, sprite, drawX, drawY, zoom);
}
