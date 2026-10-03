// Petrification colors for interns leaving (fork, Fase 3). DOM-free so the
// Node-runner tests can import it; internEffect.ts does the drawing.

import { STONE_COLORS, STONE_CRACK_COLOR } from '../../constants.js';

/** Stable 0..1 noise per pixel. */
export function pixelNoise(col: number, row: number): number {
  const h = (col * 73856093) ^ (row * 19349663);
  return ((h >>> 0) % 1000) / 1000;
}

/** Brightness 0..1 of a '#RRGGBB[AA]' pixel. */
function brightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Stone version of a pixel: a grey shade by brightness, with a few cracks. */
export function stonePixel(hex: string, col: number, row: number): string {
  if (pixelNoise(col + 7, row * 3) < 0.07) return STONE_CRACK_COLOR;
  const shade = Math.min(
    STONE_COLORS.length - 1,
    Math.floor(brightness(hex) * STONE_COLORS.length),
  );
  return STONE_COLORS[shade];
}
