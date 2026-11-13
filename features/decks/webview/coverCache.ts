import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { COVER_PIXELS } from './constants.js';
import { averageColor, cardImageUrl, vividTint } from './decksText.js';

export interface Cover {
  /** The cropped art at COVER_PIXELS × COVER_PIXELS: drawn scaled up with pixelated rendering. */
  pixels: HTMLCanvasElement;
  /** Background tint taken from it. */
  tint: string;
}

/** One load per card for the whole page (the image itself is cached by the browser and by the office). */
const covers = new Map<number, Promise<Cover | null>>();

export function loadCover(id: number): Promise<Cover | null> {
  if (!id) return Promise.resolve(null);
  let p = covers.get(id);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = COVER_PIXELS;
          c.height = COVER_PIXELS;
          const g = c.getContext('2d');
          if (!g) return resolve(null);
          g.imageSmoothingEnabled = true;
          g.drawImage(img, 0, 0, COVER_PIXELS, COVER_PIXELS);
          const {
            r,
            g: gg,
            b,
          } = averageColor(g.getImageData(0, 0, COVER_PIXELS, COVER_PIXELS).data);
          resolve({ pixels: c, tint: vividTint(r, gg, b) });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        covers.delete(id); // try again next time (the office may not have it yet)
        resolve(null);
      };
      img.src = cardImageUrl(id, 'crop', officeToken());
    });
    covers.set(id, p);
  }
  return p;
}
