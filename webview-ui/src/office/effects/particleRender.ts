import {
  TELEPORT_BEAM_COLORS,
  TELEPORT_BEAM_HEIGHT_PX,
  TELEPORT_COLUMN_ALPHAS,
  TELEPORT_COLUMN_HALF_WIDTHS_PX,
} from '../../constants.js';
import type { ParticleSystem, TeleportBeam } from './particles.js';
import { beamStrength, steppedAlpha } from './particles.js';

/** A teleporter beam's steady column: nested bands, widest and faintest outside. */
function renderBeamColumn(
  ctx: CanvasRenderingContext2D,
  b: TeleportBeam,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  const strength = beamStrength(b.age);
  if (strength <= 0) return;
  const top = Math.round(b.y) - TELEPORT_BEAM_HEIGHT_PX;
  for (let i = TELEPORT_COLUMN_HALF_WIDTHS_PX.length - 1; i >= 0; i--) {
    const half = TELEPORT_COLUMN_HALF_WIDTHS_PX[i];
    ctx.globalAlpha = TELEPORT_COLUMN_ALPHAS[i] * strength;
    ctx.fillStyle = TELEPORT_BEAM_COLORS[i];
    ctx.fillRect(
      offsetX + (Math.round(b.x) - half) * zoom,
      offsetY + top * zoom,
      (half * 2 + 1) * zoom,
      TELEPORT_BEAM_HEIGHT_PX * zoom,
    );
  }
}

/** Draw particles; `glow` selects the sparks pass (drawn above the night tint). */
export function renderParticles(
  ctx: CanvasRenderingContext2D,
  system: ParticleSystem,
  offsetX: number,
  offsetY: number,
  zoom: number,
  glow: boolean,
): void {
  if (glow) for (const b of system.beams) renderBeamColumn(ctx, b, offsetX, offsetY, zoom);
  for (const p of system.particles) {
    if ((p.kind === 'spark' || p.kind === 'confetti' || p.kind === 'note') !== glow) continue;
    let x = p.x;
    if (p.kind === 'steam') x += Math.round(Math.sin(p.phase + p.age * 4));
    else if (p.kind === 'paper' || p.kind === 'dust' || p.kind === 'confetti' || p.kind === 'note')
      x += Math.sin(p.phase + p.age * 2) * 1.5;
    const alpha = steppedAlpha(p.age, p.life);
    ctx.globalAlpha = p.kind === 'dust' ? alpha * 0.7 : alpha;
    ctx.fillStyle = p.color;
    if (p.pattern) {
      const px = Math.round(x);
      const py = Math.round(p.y);
      for (const [dx, dy] of p.pattern) {
        ctx.fillRect(offsetX + (px + dx) * zoom, offsetY + (py + dy) * zoom, zoom, zoom);
      }
      continue;
    }
    ctx.fillRect(
      offsetX + Math.round(x) * zoom,
      offsetY + Math.round(p.y) * zoom,
      p.w * zoom,
      zoom,
    );
  }
  ctx.globalAlpha = 1;
}
