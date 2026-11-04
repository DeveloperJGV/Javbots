/** Width of the music column at the right of the office (CSS px). */
export const MUSIC_COLUMN_WIDTH_PX = 256;
/** Cover size in the column (CSS px): small enough to leave room for the lyrics. */
export const MUSIC_COVER_DISPLAY_PX = 128;
/** A paused track keeps its column this long, then the office gets the space back. */
export const MUSIC_PAUSE_HIDE_SEC = 10;
/** How often the progress bar and times refresh while the column is open. */
export const MUSIC_PROGRESS_TICK_MS = 250;
/** Browser storage key remembering that the viewer hid the column (click on the turntable). */
export const MUSIC_COLUMN_HIDDEN_KEY = 'javbots.musica.columnaOculta';

/** A lyric line shows this much before its time (the eye reads ahead of the voice). */
export const LYRIC_LEAD_MS = 250;
/** The bubble over the turntable: max width (CSS px) and how far above the sprite it floats (world px). */
export const LYRIC_BUBBLE_MAX_WIDTH_PX = 280;
export const LYRIC_BUBBLE_GAP_PX = 6;
/**
 * When the floor's player is off screen (or the floor has none) the bubble pins small at the top center: its max
 * width and distance from the top (CSS px). Kept narrow so it never reaches the elevator at the top left.
 */
export const LYRIC_PIN_MAX_WIDTH_PX = 240;
export const LYRIC_PIN_TOP_PX = 8;
/** Breathing room between the bubble and the edges of the office (CSS px). */
export const LYRIC_BUBBLE_MARGIN_PX = 8;
/** What the bubble says between sung lines and for an instrumental song. */
export const LYRIC_NOTE = '♪';
/** Browser storage key remembering that the viewer turned the lyric bubble off (Settings). */
export const LYRIC_BUBBLE_HIDDEN_KEY = 'javbots.musica.globitoOculto';

export const TURNTABLE_TYPE = 'TURNTABLE';
export const ALBUM_FRAME_TYPE = 'ALBUM_FRAME';

/**
 * The music player: one piece with interchangeable looks (same 2×2 footprint). A click opens the style menu. The
 * record spins only on the turntable; notes and the lyric bubble come out of any of them.
 */
export const PLAYER_STYLES: ReadonlyArray<{ type: string; label: string }> = [
  { type: TURNTABLE_TYPE, label: 'Tocadiscos' },
  { type: 'JUKEBOX_CLASSIC', label: 'Rockola clásica' },
  { type: 'JUKEBOX_RETRO', label: 'Rockola setentera' },
  { type: 'JUKEBOX_MODERN', label: 'Rockola digital' },
];
/** Screen of the digital jukebox (sprite px, see arte/pixellab/musica/rockola/armar.py): the cover shows there. */
export const JUKEBOX_SCREEN = { type: 'JUKEBOX_MODERN', x: 12, y: 7, size: 8 } as const;
/** Style menu thumbnails (CSS px). */
export const PLAYER_THUMB_PX = 96;

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
