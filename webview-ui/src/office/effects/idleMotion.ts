import {
  BREATH_INHALE_FRACTION,
  BREATH_LEGS_FRACTION,
  BREATH_PERIOD_SEC,
  LOOK_AROUND_MAX_SEC,
  LOOK_AROUND_MIN_SEC,
} from '../../constants.js';
import { atLeisureStop, leisurePose } from '../leisure/leisure.js';
import type { Character, SpriteData } from '../types.js';
import { CharacterState, Direction } from '../types.js';

/**
 * Idle life for characters, built from the frames they already have:
 * breathing raises the torso one pixel (the waist row stretches), and a
 * standing character glances around between wander moves. Blinking needs
 * closed-eye frames and waits for our own character art (Fase 4B).
 */

/** Whether the breathing phase is on the inhale (torso raised). */
export function isInhaling(breathTimer: number): boolean {
  const phase =
    (((breathTimer % BREATH_PERIOD_SEC) + BREATH_PERIOD_SEC) % BREATH_PERIOD_SEC) /
    BREATH_PERIOD_SEC;
  return phase < BREATH_INHALE_FRACTION;
}

/** Breathing shows only while the body is otherwise still: standing idle, or
 *  seated thinking / resting still (the typing/reading frames already move). */
export function isBreathingPose(ch: Character): boolean {
  if (ch.matrixEffect) return false;
  if (ch.state === CharacterState.IDLE) return true;
  if (ch.state !== CharacterState.TYPE) return false;
  return ch.bubbleType === 'thinking' || leisurePose(ch) === 'still';
}

const inhaleCache = new WeakMap<SpriteData, SpriteData>();

/**
 * The inhale variant of a frame: every row above the waist moves up one
 * pixel and the waist row is drawn twice, so the legs stay planted. The waist
 * sits BREATH_LEGS_FRACTION of the opaque height above the lowest pixel, so it
 * adapts to whatever character art is loaded.
 */
export function inhaleSprite(sprite: SpriteData): SpriteData {
  const hit = inhaleCache.get(sprite);
  if (hit) return hit;

  let top = -1;
  let bottom = -1;
  for (let r = 0; r < sprite.length; r++) {
    if (sprite[r].some((px) => px !== '')) {
      if (top < 0) top = r;
      bottom = r;
    }
  }
  // Nothing to lift, or no transparent row above the head to lift into.
  if (top <= 0) {
    inhaleCache.set(sprite, sprite);
    return sprite;
  }
  const height = bottom - top + 1;
  const waist = bottom - Math.max(1, Math.round(height * BREATH_LEGS_FRACTION));
  const out: SpriteData = sprite.map((row, r) => (r < waist ? sprite[r + 1] : row).slice());
  inhaleCache.set(sprite, out);
  return out;
}

export function randomLookDelay(): number {
  return LOOK_AROUND_MIN_SEC + Math.random() * (LOOK_AROUND_MAX_SEC - LOOK_AROUND_MIN_SEC);
}

const DIRECTIONS: readonly Direction[] = [
  Direction.DOWN,
  Direction.LEFT,
  Direction.RIGHT,
  Direction.UP,
];

/** A different direction to glance at. Facing the viewer (down) is favoured
 *  so a standing character mostly looks into the room rather than at walls. */
export function pickLookDirection(current: Direction, rand = Math.random): Direction {
  const options = DIRECTIONS.filter((d) => d !== current);
  if (current !== Direction.DOWN && rand() < 0.5) return Direction.DOWN;
  return options[Math.floor(rand() * options.length)] ?? current;
}

/** Advance the idle timers. Called every frame from the character FSM. */
export function updateIdleMotion(ch: Character, dt: number): void {
  ch.breathTimer += dt;
  // Looking at a statue / the stars / the coffee maker: keep facing it
  if (ch.state !== CharacterState.IDLE || ch.isActive || atLeisureStop(ch)) {
    // Re-arm so a character that just stopped doesn't spin around at once.
    ch.lookTimer = Math.max(ch.lookTimer, LOOK_AROUND_MIN_SEC);
    return;
  }
  ch.lookTimer -= dt;
  if (ch.lookTimer <= 0) {
    ch.dir = pickLookDirection(ch.dir);
    ch.lookTimer = randomLookDelay();
  }
}
