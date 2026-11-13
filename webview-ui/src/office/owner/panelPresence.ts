import { hintStore } from '../hint/hintStore.js';

/**
 * How many panels are open right now. Every furniture panel is a ui/Modal, which counts itself in and out here, so
 * the office knows when the person in front of the screen is busy with a piece (office/owner) without each panel
 * saying so.
 */
let open = 0;

export function panelOpened(): void {
  open++;
  // A panel up hides the hover sign (office/hint) until the mouse is back on the office
  hintStore.clear();
}

export function panelClosed(): void {
  open = Math.max(0, open - 1);
}

export function panelsOpen(): number {
  return open;
}
