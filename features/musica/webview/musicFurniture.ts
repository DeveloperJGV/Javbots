import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  ALBUM_FRAME_TYPE,
  MUSIC_COVER_SIZE,
  MUSIC_COVER_X,
  MUSIC_COVER_Y,
  MUSIC_NOTE_COLORS,
  MUSIC_NOTE_LIFE_SEC,
  MUSIC_NOTE_ORIGIN,
  MUSIC_NOTE_PIXELS,
  MUSIC_NOTE_RISE_PX_PER_SEC,
  MUSIC_NOTE_SPAWN_SEC,
  TURNTABLE_GLINT,
  TURNTABLE_GLINT_DIM,
  TURNTABLE_RECORD,
  TURNTABLE_RECORD_MAX_LUMA,
  TURNTABLE_SPIN_STEP_SEC,
  TURNTABLE_SPIN_STEPS,
  TURNTABLE_TYPE,
} from './constants.js';
import { isMusicPlaying, type MusicState } from './musicStore.js';

/** Minimal slice of ParticleSystem the notes need (keeps this module free of the engine). */
export interface NoteSink {
  add(p: {
    kind: 'note';
    x: number;
    y: number;
    vx: number;
    vy: number;
    ay: number;
    age: number;
    life: number;
    color: string;
    w: number;
    phase: number;
    pattern: readonly (readonly [number, number])[];
  }): void;
}

const baseType = (type: string | undefined): string => (type ?? '').split(':')[0];

function luma(color: string): number {
  if (!color || color.length < 7) return 255;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** Point `step` of the glint's lap around the record (sprite px). */
export function glintPoint(step: number): [number, number] {
  const a = (step / TURNTABLE_SPIN_STEPS) * Math.PI * 2;
  return [
    Math.round(TURNTABLE_RECORD.cx + TURNTABLE_RECORD.rx * Math.cos(a)),
    Math.round(TURNTABLE_RECORD.cy + TURNTABLE_RECORD.ry * Math.sin(a)),
  ];
}

const spinCache = new WeakMap<SpriteData, SpriteData[]>();

/** The turntable with a light glint at `step` (and a dim one opposite) on the black of the record. */
export function spinSprite(sprite: SpriteData, step: number): SpriteData {
  let frames = spinCache.get(sprite);
  if (!frames) {
    frames = [];
    spinCache.set(sprite, frames);
  }
  const k = ((step % TURNTABLE_SPIN_STEPS) + TURNTABLE_SPIN_STEPS) % TURNTABLE_SPIN_STEPS;
  const hit = frames[k];
  if (hit) return hit;
  const out = sprite.map((row) => row.slice());
  const paint = ([x, y]: [number, number], color: string) => {
    const px = out[y]?.[x];
    if (px && luma(px) <= TURNTABLE_RECORD_MAX_LUMA) out[y][x] = color;
  };
  paint(glintPoint(k), TURNTABLE_GLINT);
  paint(glintPoint(k + TURNTABLE_SPIN_STEPS / 2), TURNTABLE_GLINT_DIM);
  frames[k] = out;
  return out;
}

const coverCache = new WeakMap<SpriteData, WeakMap<SpriteData, SpriteData>>();

/** The album frame with the cover painted into its hole. */
export function framedCover(frame: SpriteData, cover: SpriteData): SpriteData {
  let byCover = coverCache.get(frame);
  if (!byCover) {
    byCover = new WeakMap();
    coverCache.set(frame, byCover);
  }
  const hit = byCover.get(cover);
  if (hit) return hit;
  const out = frame.map((row) => row.slice());
  for (let y = 0; y < MUSIC_COVER_SIZE; y++) {
    for (let x = 0; x < MUSIC_COVER_SIZE; x++) {
      const color = cover[y]?.[x];
      if (color && out[MUSIC_COVER_Y + y]) out[MUSIC_COVER_Y + y][MUSIC_COVER_X + x] = color;
    }
  }
  byCover.set(cover, out);
  return out;
}

/** Whether a furniture instance is the album frame. */
export function isAlbumFrame(f: FurnitureInstance): boolean {
  return baseType(f.type) === ALBUM_FRAME_TYPE;
}

/**
 * Top of the turntable, or of the album frame hanging right above it, so the
 * lyric bubble floats over both instead of covering the cover (world px).
 */
export function lyricAnchorY(turntable: FurnitureInstance, furniture: FurnitureInstance[]): number {
  const width = turntable.sprite[0]?.length ?? 0;
  let top = turntable.y;
  for (const f of furniture) {
    if (!isAlbumFrame(f)) continue;
    const fw = f.sprite[0]?.length ?? 0;
    const overlaps = f.x < turntable.x + width && f.x + fw > turntable.x;
    const justAbove = f.y < turntable.y && turntable.y - (f.y + f.sprite.length) <= width;
    if (overlaps && justAbove) top = Math.min(top, f.y);
  }
  return top;
}

/** Whether a furniture instance is the turntable (a click on it shows / hides the music column). */
export function isTurntable(f: FurnitureInstance): boolean {
  return baseType(f.type) === TURNTABLE_TYPE;
}

/** Turntable spinning while music plays; album frame showing the current cover. */
export function applyMusicFurniture(
  instances: FurnitureInstance[],
  timeSec: number,
  state: MusicState,
): FurnitureInstance[] {
  const playing = isMusicPlaying(state);
  const cover = state.status?.enabled === false ? null : state.coverSprite;
  if (!playing && !cover) return instances;
  const step = Math.floor(timeSec / TURNTABLE_SPIN_STEP_SEC);
  return instances.map((f) => {
    const type = baseType(f.type);
    if (playing && type === TURNTABLE_TYPE) return { ...f, sprite: spinSprite(f.sprite, step) };
    if (cover && type === ALBUM_FRAME_TYPE) return { ...f, sprite: framedCover(f.sprite, cover) };
    return f;
  });
}

/** Rising notes off every turntable while music plays. */
export class MusicNotes {
  private timers = new Map<string, number>();

  private readonly rand: () => number;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
  }

  update(dt: number, furniture: FurnitureInstance[], state: MusicState, sink: NoteSink): void {
    if (!isMusicPlaying(state)) {
      this.timers.clear();
      return;
    }
    for (const f of furniture) {
      if (baseType(f.type) !== TURNTABLE_TYPE) continue;
      const key = `${f.x},${f.y}`;
      const t = (this.timers.get(key) ?? this.rand() * MUSIC_NOTE_SPAWN_SEC) - dt;
      if (t > 0) {
        this.timers.set(key, t);
        continue;
      }
      this.timers.set(key, MUSIC_NOTE_SPAWN_SEC * (0.7 + this.rand() * 0.6));
      sink.add({
        kind: 'note',
        x: f.x + MUSIC_NOTE_ORIGIN.x + Math.floor(this.rand() * 9) - 4,
        y: f.y + MUSIC_NOTE_ORIGIN.y - 6,
        vx: (this.rand() - 0.5) * 3,
        vy: -MUSIC_NOTE_RISE_PX_PER_SEC * (0.8 + this.rand() * 0.4),
        ay: 0,
        age: 0,
        life: MUSIC_NOTE_LIFE_SEC * (0.8 + this.rand() * 0.4),
        color:
          MUSIC_NOTE_COLORS[
            Math.floor(this.rand() * MUSIC_NOTE_COLORS.length) % MUSIC_NOTE_COLORS.length
          ],
        w: 1,
        phase: this.rand() * Math.PI * 2,
        pattern: MUSIC_NOTE_PIXELS,
      });
    }
  }
}
