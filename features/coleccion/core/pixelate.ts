/**
 * A cover turned into pixel art: cropped to the shape of its box, shrunk to a few dozen pixels and reduced to a few
 * colors. Pure (RGBA in, RGBA out): no DOM, so it runs and is tested in Node.
 */

/** An RGBA image: 4 bytes per pixel, row by row. */
export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

/** A rectangle of the source image, in its pixels. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How a pixel of the result is taken from its block of the source: the one in its middle ("nearest", hard and
 * true to the source's own pixels) or the block's average ("average", calmer on busy art; the result is still
 * hard-edged).
 */
export type SampleMode = 'nearest' | 'average';

export interface PixelateOptions {
  width: number;
  height: number;
  /** Most colors in the result (2 to 256). */
  colors: number;
  mode?: SampleMode;
  /** The part of the source to use; the whole image when left out. */
  crop?: Crop;
}

/** Pixels whose alpha is below this are left transparent; the rest become fully opaque. */
export const ALPHA_CUT = 128;
/** Fewest and most colors a palette may have. */
export const COLORS_MIN = 2;
export const COLORS_MAX = 256;

/**
 * The biggest part of a w×h image with the given shape (width / height), centered sideways and placed at `anchorY`
 * (0 = top, 0.5 = middle, 1 = bottom) along the height.
 */
export function cropFor(srcW: number, srcH: number, ratio: number, anchorY = 0.5): Crop {
  if (srcW <= 0 || srcH <= 0 || !(ratio > 0))
    return { x: 0, y: 0, w: Math.max(0, srcW), h: Math.max(0, srcH) };
  let w = srcW;
  let h = w / ratio;
  if (h > srcH) {
    h = srcH;
    w = h * ratio;
  }
  const a = Math.max(0, Math.min(1, anchorY));
  return { x: (srcW - w) / 2, y: (srcH - h) * a, w, h };
}

/** The source shrunk to width×height (no blending between output pixels: each one comes from its own block). */
export function shrink(
  src: RgbaImage,
  width: number,
  height: number,
  mode: SampleMode = 'nearest',
  crop: Crop = { x: 0, y: 0, w: src.width, h: src.height },
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  if (width <= 0 || height <= 0 || src.width <= 0 || src.height <= 0) return out;
  const bw = crop.w / width;
  const bh = crop.h / height;
  const clampX = (x: number) => Math.max(0, Math.min(src.width - 1, x));
  const clampY = (y: number) => Math.max(0, Math.min(src.height - 1, y));
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const o = (oy * width + ox) * 4;
      if (mode === 'nearest') {
        const sx = clampX(Math.floor(crop.x + (ox + 0.5) * bw));
        const sy = clampY(Math.floor(crop.y + (oy + 0.5) * bh));
        const i = (sy * src.width + sx) * 4;
        out[o] = src.data[i];
        out[o + 1] = src.data[i + 1];
        out[o + 2] = src.data[i + 2];
        out[o + 3] = src.data[i + 3];
        continue;
      }
      const x0 = clampX(Math.floor(crop.x + ox * bw));
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor(crop.x + (ox + 1) * bw)));
      const y0 = clampY(Math.floor(crop.y + oy * bh));
      const y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor(crop.y + (oy + 1) * bh)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * src.width + x) * 4;
          const al = src.data[i + 3];
          // Color weighted by alpha, so a transparent edge does not darken the block
          r += src.data[i] * al;
          g += src.data[i + 1] * al;
          b += src.data[i + 2] * al;
          a += al;
          n++;
        }
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return out;
}

type Rgb = [number, number, number];

/**
 * Up to `n` colors that stand for the opaque pixels of an image (median cut: the box of colors with the widest
 * spread is split at its median, again and again). Always the same palette for the same pixels.
 */
export function medianCut(data: Uint8ClampedArray | Uint8Array, n: number): Rgb[] {
  const want = Math.max(1, Math.min(COLORS_MAX, Math.floor(n)));
  const pixels: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3] >= ALPHA_CUT) pixels.push([data[i], data[i + 1], data[i + 2]]);
  if (pixels.length === 0) return [];
  const spread = (box: Rgb[]): { ch: 0 | 1 | 2; range: number } => {
    const lo: Rgb = [255, 255, 255];
    const hi: Rgb = [0, 0, 0];
    for (const p of box)
      for (let c = 0; c < 3; c++) {
        if (p[c] < lo[c]) lo[c] = p[c];
        if (p[c] > hi[c]) hi[c] = p[c];
      }
    const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const ch = (r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2) as 0 | 1 | 2;
    return { ch, range: r[ch] };
  };
  const boxes: Rgb[][] = [pixels];
  while (boxes.length < want) {
    // The box to split: widest spread, weighted by how many pixels it has
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const { range } = spread(boxes[i]);
      const score = range * Math.sqrt(boxes[i].length);
      if (range > 0 && boxes[i].length > 1 && score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) break;
    const box = boxes[best];
    const { ch } = spread(box);
    // Stable: ties keep their order, so the same pixels always give the same palette
    const sorted = box
      .map((p, i) => ({ p, i }))
      .sort((a, b) => a.p[ch] - b.p[ch] || a.i - b.i)
      .map((x) => x.p);
    let mid = Math.floor(sorted.length / 2);
    // Never split between two equal values (both halves would share a color)
    while (mid < sorted.length && mid > 0 && sorted[mid][ch] === sorted[mid - 1][ch]) mid++;
    if (mid >= sorted.length) {
      mid = Math.floor(sorted.length / 2);
      while (mid > 0 && sorted[mid][ch] === sorted[mid - 1][ch]) mid--;
    }
    if (mid <= 0) break;
    boxes.splice(best, 1, sorted.slice(0, mid), sorted.slice(mid));
  }
  return boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const p of box) {
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }
    return [
      Math.round(sum[0] / box.length),
      Math.round(sum[1] / box.length),
      Math.round(sum[2] / box.length),
    ] as Rgb;
  });
}

/** Every pixel to its closest palette color, in place; alpha becomes all or nothing. */
export function applyPalette(data: Uint8ClampedArray, palette: readonly Rgb[]): void {
  const memo = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_CUT || palette.length === 0) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let best = memo.get(key);
    if (best === undefined) {
      let bestD = Infinity;
      best = 0;
      for (let k = 0; k < palette.length; k++) {
        const dr = data[i] - palette[k][0];
        const dg = data[i + 1] - palette[k][1];
        const db = data[i + 2] - palette[k][2];
        // Weighted a little like the eye (green counts most)
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      memo.set(key, best);
    }
    const c = palette[best];
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  }
}

/** The cover as pixel art: shrunk to width×height and reduced to at most `colors` colors. */
export function pixelate(src: RgbaImage, opts: PixelateOptions): RgbaImage & { palette: Rgb[] } {
  const width = Math.max(1, Math.floor(opts.width));
  const height = Math.max(1, Math.floor(opts.height));
  const colors = Math.max(COLORS_MIN, Math.min(COLORS_MAX, Math.floor(opts.colors)));
  const data = shrink(src, width, height, opts.mode ?? 'nearest', opts.crop);
  const palette = medianCut(data, colors);
  applyPalette(data, palette);
  return { data, width, height, palette };
}
