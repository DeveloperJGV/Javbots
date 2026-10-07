/**
 * Extra canvas resolution on top of devicePixelRatio (fork, Fase 5.5: "fit to window").
 *
 * The office only draws at whole zooms, so pixels stay on the grid. To make it
 * fill the window exactly, "fit" draws at the next whole zoom up and gives the
 * canvas `renderScale` times more backing pixels than the screen has: the
 * browser then shrinks the picture to the exact size. Every device-pixel
 * conversion (canvas size, mouse hit-testing, DOM overlays) goes through
 * renderDpr() so they all agree. Any manual zoom resets it to 1.
 */

let renderScale = 1;
const listeners = new Set<() => void>();

/** Canvas pixels per CSS pixel. */
export function renderDpr(): number {
  return (window.devicePixelRatio || 1) * renderScale;
}

export function setRenderScale(scale: number): void {
  if (scale === renderScale) return;
  renderScale = scale;
  for (const listener of listeners) listener();
}

export function onRenderScaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
