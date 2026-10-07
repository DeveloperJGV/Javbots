import {
  BUBBLE_SITTING_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
  FLOATING_CHARACTERS,
} from '../../constants.js';
import { atLeisureStop, leisureStop } from '../leisure/leisure.js';
import type { Character } from '../types.js';
import { CharacterState } from '../types.js';

/** Whether the character is sitting on a chair (vs standing at a zone bench,
 *  fork Fase 3, or at the arcade, Fase 5.1). Seated characters draw a few pixels lower. */
export function isSeated(ch: Character): boolean {
  if (ch.state !== CharacterState.TYPE) return false;
  if (atLeisureStop(ch)) return leisureStop(ch)!.seatUid !== null;
  const spot = ch.zoneSpot;
  if (spot && ch.tileCol === spot.col && ch.tileRow === spot.row) return spot.seatUid !== null;
  return true;
}

/** Hovers instead of walking (Wheatley): never sinks into a chair. */
export function isFloating(ch: Character): boolean {
  return FLOATING_CHARACTERS.has(ch.palette);
}

/** How far a seated character draws below its tile anchor (sprite px). */
export function sittingDropPx(ch: Character): number {
  return isSeated(ch) && !isFloating(ch) ? CHARACTER_SITTING_OFFSET_PX : 0;
}

/** Same, for the speech bubble over the head. */
export function bubbleSittingDropPx(ch: Character): number {
  return isSeated(ch) && !isFloating(ch) ? BUBBLE_SITTING_OFFSET_PX : 0;
}
