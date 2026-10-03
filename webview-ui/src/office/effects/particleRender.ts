import type { ParticleSystem } from './particles.js';
import { steppedAlpha } from './particles.js';

/** Draw particles; `glow` selects the sparks pass (drawn above the night tint). */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  system: ParticleSystem,
  offsetX: number,
  offsetY: number,
  zoom: number,
  glow: boolean,
): void {
  for (const p of system.particles) {
    if ((p.kind === 'spark') !== glow) continue;
    let x = p.x;
    if (p.kind === 'steam') x += Math.round(Math.sin(p.phase + p.age * 4));
    else if (p.kind === 'paper' || p.kind === 'dust') x += Math.sin(p.phase + p.age * 2) * 1.5;
    const alpha = steppedAlpha(p.age, p.life);
    ctx.globalAlpha = p.kind === 'dust' ? alpha * 0.7 : alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(
      offsetX + Math.round(x) * zoom,
      offsetY + Math.round(p.y) * zoom,
      p.w * zoom,
      zoom,
    );
  }
  ctx.globalAlpha = 1;
}
