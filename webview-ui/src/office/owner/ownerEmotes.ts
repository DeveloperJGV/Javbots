import type { Character, SpriteData } from '../types.js';

/**
 * The owner's emotes (office/owner): short animations from the avatar's own emotes sheet (manifest `emotes`,
 * characterSpritesLoaded.owner.emotes). The owner's presence decides when one plays; the renderer only asks which
 * frame to draw instead of his normal one.
 */

export interface OwnerEmote {
  id: string;
  /** Cells of the emotes sheet, facing front; drawn bottom-center on his normal frame's bottom center. */
  frames: SpriteData[];
  fps: number;
  /** Times it plays through. */
  loops: number;
  /** Played now and then while he stands around. */
  idle?: boolean;
}

/** Ids with a moment of their own (any other id plays only when it is `idle`). */
export const OwnerEmoteId = {
  /** Done coming in on a floor, or clicked. */
  GREET: 'greet',
  /** An agent finished its turn while he was free. */
  CHEER: 'cheer',
  /** While the office party dances. */
  DANCE: 'dance',
  /** Only as an idle emote, when the manifest says so. */
  DRINK: 'drink',
} as const;

/** How long one plays, all its loops (seconds). */
export function emoteDurationSec(emote: OwnerEmote): number {
  return (emote.frames.length / emote.fps) * emote.loops;
}

/** The frame showing `sec` seconds into the emote. */
export function emoteFrameAt(emote: OwnerEmote, sec: number): SpriteData {
  const n = emote.frames.length;
  const i = Math.floor(Math.max(0, sec) * emote.fps) % n;
  return emote.frames[i];
}

/** What the renderer draws for him while an emote plays (kept off Character, which is shared with agents). */
const showing = new WeakMap<Character, SpriteData>();

export function setOwnerEmoteFrame(ch: Character, frame: SpriteData | null): void {
  if (frame) showing.set(ch, frame);
  else showing.delete(ch);
}

/** The emote frame to draw for this character instead of its own, or null. */
export function ownerEmoteFrame(ch: Character): SpriteData | null {
  return showing.get(ch) ?? null;
}
