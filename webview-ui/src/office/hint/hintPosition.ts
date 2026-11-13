import { HINT_EDGE_MARGIN, HINT_OFFSET_X, HINT_OFFSET_Y } from './constants.js';

/**
 * Top-left corner of the sign for a cursor at (x, y), CSS px. It sits right of the cursor and a little above; near the
 * right edge it flips to the cursor's left, and it never leaves the window (`width`/`height` = the sign's size).
 */
export function hintPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number,
): { left: number; top: number } {
  let left = x + HINT_OFFSET_X;
  if (left + width > viewportW - HINT_EDGE_MARGIN) left = x - HINT_OFFSET_X - width;
  left = clamp(left, HINT_EDGE_MARGIN, viewportW - HINT_EDGE_MARGIN - width);
  const top = clamp(y + HINT_OFFSET_Y, HINT_EDGE_MARGIN, viewportH - HINT_EDGE_MARGIN - height);
  return { left, top };
}

/** Like Math.min(max(v, lo), hi), but `lo` wins when the window is narrower than the sign. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}
