/**
 * What hides part of the office on screen right now (office/owner): the elevator plate is DOM floating over the
 * canvas, and a map wider than the window leaves its corner off the view, so the tile next to the elevator can be
 * out of sight with the current camera. The page registers a test that projects a world box to the screen and
 * checks it against the view and the plate; the owner's presence (DOM-free) only asks it.
 * Without a test registered (unit tests, before the canvas is up) nothing is covered.
 */

/** World box: left, top, right, bottom in world px. */
export interface WorldBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let cover: ((box: WorldBox) => boolean) | null = null;

export function setOwnerCover(test: ((box: WorldBox) => boolean) | null): void {
  cover = test;
}

/** Whether the page has said what covers the canvas yet (the owner waits a moment for it before coming in). */
export function ownerCoverReady(): boolean {
  return cover !== null;
}

/** Whether something drawn over the canvas hides any part of this world box. */
export function ownerCovered(box: WorldBox): boolean {
  try {
    return cover ? cover(box) : false;
  } catch {
    return false;
  }
}
