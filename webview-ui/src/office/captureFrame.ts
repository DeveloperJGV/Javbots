// DOM-free half of the office photo (capture.ts draws and downloads it).
import { CAPTURE_FILE_PREFIX, CAPTURE_PAD_TILES, CAPTURE_TOP_PAD_TILES } from '../constants.js';
import { TILE_SIZE } from './types.js';

/** Canvas size and pan that frame the whole map with room for the walls above row 0. */
export function captureFrame(
  cols: number,
  rows: number,
  zoom: number,
): { width: number; height: number; panX: number; panY: number } {
  const tile = TILE_SIZE * zoom;
  const top = CAPTURE_TOP_PAD_TILES * tile;
  const side = CAPTURE_PAD_TILES * tile;
  const width = cols * tile + 2 * side;
  const height = rows * tile + top + side;
  // renderFrame centers the map; shift it so the extra room ends up on top.
  return { width, height, panX: 0, panY: (top - side) / 2 };
}

/** `pixel-agents-2026-10-06-153012.png` (local time). */
export function captureFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `${CAPTURE_FILE_PREFIX}-${date}-${time}.png`;
}
