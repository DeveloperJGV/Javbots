/** Width of the music column at the right of the office (CSS px). */
export const MUSIC_COLUMN_WIDTH_PX = 256;
/** A paused track keeps its column this long, then the office gets the space back. */
export const MUSIC_PAUSE_HIDE_SEC = 10;
/** How often the progress bar and times refresh while the column is open. */
export const MUSIC_PROGRESS_TICK_MS = 500;
/** Browser storage key remembering that the viewer hid the column (click on the turntable). */
export const MUSIC_COLUMN_HIDDEN_KEY = 'javbots.musica.columnaOculta';

export const TURNTABLE_TYPE = 'TURNTABLE';
export const ALBUM_FRAME_TYPE = 'ALBUM_FRAME';

/** The record on the TURNTABLE sprite (sprite px): an ellipse the glint runs around. */
export const TURNTABLE_RECORD = { cx: 12.5, cy: 16.5, rx: 6, ry: 2 } as const;
/** Pixels darker than this (0-255 luminance) count as the black of the record. */
export const TURNTABLE_RECORD_MAX_LUMA = 70;
export const TURNTABLE_GLINT = '#a888ab';
export const TURNTABLE_GLINT_DIM = '#6e5a70';
export const TURNTABLE_SPIN_STEPS = 8;
/** One spin step per furniture tick (FURNITURE_ANIM_INTERVAL_SEC = 0.2 s). */
export const TURNTABLE_SPIN_STEP_SEC = 0.2;

/** Hole of the ALBUM_FRAME sprite the cover is painted into (see features/musica/arte/armar.py). */
export const MUSIC_COVER_X = 5;
export const MUSIC_COVER_Y = 5;
export const MUSIC_COVER_SIZE = 22;
/** Each color channel snaps to this many levels: few colors, like the rest of the office. */
export const MUSIC_COVER_LEVELS = 6;

/** Notes rising off the turntable while music plays. */
export const MUSIC_NOTE_SPAWN_SEC = 0.9;
export const MUSIC_NOTE_LIFE_SEC = 2.4;
export const MUSIC_NOTE_RISE_PX_PER_SEC = 7;
/** Where they leave the turntable (sprite px from its top-left). */
export const MUSIC_NOTE_ORIGIN = { x: 16, y: 10 } as const;
export const MUSIC_NOTE_COLORS = ['#ffd878', '#746fff', '#ff8cc8', '#89d185'] as const;
/** An eighth note, 4x6 px, offsets from its top-left. */
export const MUSIC_NOTE_PIXELS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 0],
  [3, 0],
  [1, 1],
  [3, 1],
  [1, 2],
  [1, 3],
  [0, 4],
  [1, 4],
  [0, 5],
  [1, 5],
];
