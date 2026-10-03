import type { Character } from '../types.js';
import { CharacterState } from '../types.js';

/** Whether the character is sitting on a chair (vs standing at a zone bench,
 *  fork Fase 3). Seated characters draw a few pixels lower. */
export function isSeated(ch: Character): boolean {
  if (ch.state !== CharacterState.TYPE) return false;
  const spot = ch.zoneSpot;
  if (spot && ch.tileCol === spot.col && ch.tileRow === spot.row) return spot.seatUid !== null;
  return true;
}
