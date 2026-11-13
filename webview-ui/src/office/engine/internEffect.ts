// How interns (sub-agents) come and go (fork, Fase 4B): they fade in next to
// their boss and walk to the interns' room; when done they walk back to the
// boss and fade out there. The walking is OfficeState's; this is the fade.

import type { Character, SpriteData } from '../types.js';
import { effectDurationSec } from './matrixEffectState.js';

export function renderInternEffect(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  sprite: SpriteData,
  drawX: number,
  drawY: number,
  zoom: number,
): void {
  const p = Math.min(1, ch.matrixEffectTimer / effectDurationSec(ch));
  ctx.save();
  ctx.globalAlpha *= ch.matrixEffect === 'spawn' ? p : 1 - p;
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const pixel = sprite[row][col];
      if (!pixel) continue;
      ctx.fillStyle = pixel;
      ctx.fillRect(drawX + col * zoom, drawY + row * zoom, zoom, zoom);
    }
  }
  ctx.restore();
}
