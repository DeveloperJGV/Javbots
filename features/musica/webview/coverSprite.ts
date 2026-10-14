/// <reference lib="dom" />
// Browser-only (decodes an image); the webview's Node test config has no DOM lib, hence the reference.
import { MUSIC_COVER_LEVELS, MUSIC_COVER_SIZE } from './constants.js';

type SpriteData = string[][];

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** Snap a channel to MUSIC_COVER_LEVELS levels (few colors, flat clusters). */
export function snapChannel(value: number, levels = MUSIC_COVER_LEVELS): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/** RGBA pixels (row-major, size×size) → SpriteData with snapped colors. */
export function pixelsToSprite(data: Uint8ClampedArray, size: number): SpriteData {
  const sprite: SpriteData = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      row.push(
        `#${hex(snapChannel(data[i]))}${hex(snapChannel(data[i + 1]))}${hex(snapChannel(data[i + 2]))}`,
      );
    }
    sprite.push(row);
  }
  return sprite;
}

/** Decode the cover and shrink it to MUSIC_COVER_SIZE² with the browser's averaging. */
export function coverToSprite(dataUrl: string): Promise<SpriteData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = MUSIC_COVER_SIZE;
      canvas.height = MUSIC_COVER_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, MUSIC_COVER_SIZE, MUSIC_COVER_SIZE);
      const { data } = ctx.getImageData(0, 0, MUSIC_COVER_SIZE, MUSIC_COVER_SIZE);
      resolve(pixelsToSprite(data, MUSIC_COVER_SIZE));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
