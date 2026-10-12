import { DISCO_BLOCK_PX } from '../../constants.js';
import type { DiscoLight, PartyBounds } from './party.js';

/** Disco spots drawn as blocky circles over the dance floor, above the night tint. */
export function renderDisco(
  ctx: CanvasRenderingContext2D,
  lights: DiscoLight[],
  bounds: PartyBounds,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(offsetX + bounds.x * zoom, offsetY + bounds.y * zoom, bounds.w * zoom, bounds.h * zoom);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const block = DISCO_BLOCK_PX;
  for (const l of lights) {
    ctx.fillStyle = l.color;
    const r = l.radius;
    // Snap the center to the block grid so the spot keeps its pixel look as it moves
    const cx = Math.round(l.x / block) * block;
    const cy = Math.round(l.y / block) * block;
    for (let dy = -r; dy <= r; dy += block) {
      for (let dx = -r; dx <= r; dx += block) {
        if (dx * dx + dy * dy > r * r) continue;
        ctx.fillRect(
          offsetX + (cx + dx) * zoom,
          offsetY + (cy + dy) * zoom,
          block * zoom,
          block * zoom,
        );
      }
    }
  }
  ctx.restore();
}
