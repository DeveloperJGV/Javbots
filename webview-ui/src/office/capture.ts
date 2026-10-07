import { CAPTURE_BG_COLOR, CAPTURE_ZOOM } from '../constants.js';
import { captureFrame } from './captureFrame.js';
import type { OfficeState } from './engine/officeState.js';
import { renderFrame } from './engine/renderer.js';

/** The whole office as a PNG: current characters, light and particles, no editor or selection. */
export function captureOffice(os: OfficeState, zoom = CAPTURE_ZOOM): Promise<Blob | null> {
  const layout = os.getLayout();
  const { width, height, panX, panY } = captureFrame(layout.cols, layout.rows, zoom);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = false;
  renderFrame(
    ctx,
    width,
    height,
    os.tileMap,
    os.furniture,
    os.getCharacters(),
    zoom,
    panX,
    panY,
    undefined,
    undefined,
    layout.tileColors,
    layout.cols,
    layout.rows,
    layout.carpetTiles,
    layout.areas,
    layout.areaTiles,
    false,
    null,
    os.pets,
    { particles: os.particles, lighting: true },
  );
  // renderFrame clears to transparent: put the office on the panel background.
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = CAPTURE_BG_COLOR;
  ctx.fillRect(0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
