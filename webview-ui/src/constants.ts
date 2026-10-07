import type { ColorValue } from './components/ui/types.js';

// ── Grid & Layout ────────────────────────────────────────────
export const TILE_SIZE = 16;
export const DEFAULT_COLS = 20;
export const DEFAULT_ROWS = 11;
export const MAX_COLS = 64;
export const MAX_ROWS = 64;

// ── Character Animation ─────────────────────────────────────
export const WALK_SPEED_PX_PER_SEC = 48;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const TYPE_FRAME_DURATION_SEC = 0.3;
export const WANDER_PAUSE_MIN_SEC = 2.0;
export const WANDER_PAUSE_MAX_SEC = 20.0;
export const WANDER_MOVES_BEFORE_REST_MIN = 3;
export const WANDER_MOVES_BEFORE_REST_MAX = 6;
export const SEAT_REST_MIN_SEC = 120.0;
export const SEAT_REST_MAX_SEC = 240.0;

// ── Matrix Effect ────────────────────────────────────────────
export const MATRIX_EFFECT_DURATION_SEC = 0.3;
export const MATRIX_TRAIL_LENGTH = 6;
export const MATRIX_SPRITE_COLS = 24;
export const MATRIX_SPRITE_ROWS = 44;
export const MATRIX_FLICKER_FPS = 30;
export const MATRIX_FLICKER_VISIBILITY_THRESHOLD = 180;
export const MATRIX_COLUMN_STAGGER_RANGE = 0.3;
export const MATRIX_HEAD_COLOR = '#ccffcc';
export const matrixGreenBright = (a: number): string => `rgba(0, 255, 65, ${a})`;
export const matrixGreenMid = (a: number): string => `rgba(0, 170, 40, ${a})`;
export const matrixGreenDim = (a: number): string => `rgba(0, 85, 20, ${a})`;
export const MATRIX_TRAIL_OVERLAY_ALPHA = 0.6;
export const MATRIX_TRAIL_EMPTY_ALPHA = 0.5;
export const MATRIX_TRAIL_MID_THRESHOLD = 0.33;
export const MATRIX_TRAIL_DIM_THRESHOLD = 0.66;

// ── Rendering ────────────────────────────────────────────────
export const CHARACTER_SITTING_OFFSET_PX = 6;
export const CHARACTER_Z_SORT_OFFSET = 0.5;
export const OUTLINE_Z_SORT_OFFSET = 0.001;
export const SELECTED_OUTLINE_ALPHA = 1.0;
export const HOVERED_OUTLINE_ALPHA = 0.5;
/** Headless agents (adopted, no terminal to focus) render slightly translucent. */
export const HEADLESS_CHARACTER_ALPHA = 0.5;
export const GHOST_PREVIEW_SPRITE_ALPHA = 0.5;
export const GHOST_PREVIEW_TINT_ALPHA = 0.25;
export const SELECTION_DASH_PATTERN: [number, number] = [4, 3];
export const BUTTON_MIN_RADIUS = 6;
export const BUTTON_RADIUS_ZOOM_FACTOR = 3;
export const BUTTON_ICON_SIZE_FACTOR = 0.45;
export const BUTTON_LINE_WIDTH_MIN = 1.5;
export const BUTTON_LINE_WIDTH_ZOOM_FACTOR = 0.5;
export const BUBBLE_FADE_DURATION_SEC = 0.5;
export const BUBBLE_SITTING_OFFSET_PX = 10;
export const BUBBLE_VERTICAL_OFFSET_PX = 36;
export const FALLBACK_FLOOR_COLOR = '#808080';

// ── Rendering - Overlay Colors (canvas, not CSS) ─────────────
export const SEAT_OWN_COLOR = 'rgba(0, 127, 212, 0.35)';
export const SEAT_AVAILABLE_COLOR = 'rgba(0, 200, 80, 0.35)';
export const SEAT_BUSY_COLOR = 'rgba(220, 50, 50, 0.35)';
export const GRID_LINE_COLOR = 'rgba(255,255,255,0.12)';
export const VOID_TILE_OUTLINE_COLOR = 'rgba(255,255,255,0.08)';
export const VOID_TILE_DASH_PATTERN: [number, number] = [2, 2];
export const GHOST_BORDER_HOVER_FILL = 'rgba(60, 130, 220, 0.25)';
export const GHOST_BORDER_HOVER_STROKE = 'rgba(60, 130, 220, 0.5)';
export const GHOST_BORDER_STROKE = 'rgba(255, 255, 255, 0.06)';
export const GHOST_VALID_TINT = '#00ff00';
export const GHOST_INVALID_TINT = '#ff0000';
export const SELECTION_HIGHLIGHT_COLOR = '#007fd4';
export const DELETE_BUTTON_BG = 'rgba(200, 50, 50, 0.85)';
export const ROTATE_BUTTON_BG = 'rgba(50, 120, 200, 0.85)';
export const BUTTON_ICON_COLOR = '#fff';
export const CANVAS_FALLBACK_TILE_COLOR = '#444';
export const CANVAS_ERROR_TILE_COLOR = '#FF00FF';
export const WALL_COLOR = '#3A3A5C';

// ── Camera ───────────────────────────────────────────────────
export const CAMERA_FOLLOW_LERP = 0.1;
export const CAMERA_FOLLOW_SNAP_THRESHOLD = 0.5;

// ── Zoom ─────────────────────────────────────────────────────
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT_DPR_FACTOR = 2;
/** "Fit to window" (fork, Fase 5.5): CSS px kept free on each side for the left button column. */
export const ZOOM_FIT_SIDE_MARGIN_PX = 56;
/** Extra tiles counted above row 0 (walls and wall items draw over it). */
export const ZOOM_FIT_TOP_PAD_TILES = 1;
export const ZOOM_LEVEL_FADE_DELAY_MS = 1500;
export const ZOOM_LEVEL_HIDE_DELAY_MS = 2000;
export const ZOOM_LEVEL_FADE_DURATION_SEC = 0.5;
export const ZOOM_SCROLL_THRESHOLD = 50;
export const PAN_MARGIN_FRACTION = 0.25;

// ── Editor ───────────────────────────────────────────────────
export const UNDO_STACK_MAX_SIZE = 50;
export const LAYOUT_SAVE_DEBOUNCE_MS = 500;

// ── Layout Import/Export (browser-native, standalone) ────────
/** Suggested filename when exporting the office layout from the standalone browser. */
export const LAYOUT_EXPORT_FILENAME = 'pixel-agents-layout.json';
/** MIME type for the exported layout Blob. */
export const LAYOUT_EXPORT_MIME = 'application/json';
export const DEFAULT_FLOOR_COLOR: ColorValue = { h: 35, s: 30, b: 15, c: 0 };
export const DEFAULT_WALL_COLOR: ColorValue = { h: 240, s: 25, b: 0, c: 0 };
export const DEFAULT_NEUTRAL_COLOR: ColorValue = { h: 0, s: 0, b: 0, c: 0 };

// ── Carpets ──────────────────────────────────────────────────
/** Main (lowest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_COLOR: ColorValue = { h: 0, s: 71, b: -32, c: 0, colorize: true };
/** Accent (highest-luminance) color applied to carpets when no per-tile override is set. */
export const CARPET_DEFAULT_ACCENT_COLOR: ColorValue = {
  h: 34,
  s: 64,
  b: 21,
  c: 0,
  colorize: true,
};
/** Keyboard key that switches from CARPET_PAINT to CARPET_PICK while editing. */
export const KEY_CARPET_PICK = 'p';

// ── Areas (named, colored workspace-folder zones) ────────────
/** Color palette assigned to new Areas in rotation (cycles when more areas exist). */
export const AREA_DEFAULT_COLORS: readonly string[] = [
  '#ff6b6b',
  '#feca57',
  '#48dbfb',
  '#1dd1a1',
  '#5f27cd',
  '#ff9ff3',
  '#54a0ff',
  '#ffa502',
] as const;
/** Translucent overlay alpha for area tile fills. */
export const AREA_OVERLAY_ALPHA = 0.25;
/** Alpha multiplier applied to the actively-selected area's overlay. */
export const AREA_ACTIVE_ALPHA_MULTIPLIER = 1.6;
/** Base font size (pixel-pre-zoom) for area centroid labels. */
export const AREA_LABEL_FONT_SIZE_PX = 14;
/** Minimum on-screen label size to keep labels legible at low zoom. */
export const AREA_LABEL_MIN_FONT_SIZE_PX = 12;
/** Alpha of the area label text. */
export const AREA_LABEL_ALPHA = 1.0;
/** Fallback label color when an area has no color set (shouldn't happen in practice). */
export const AREA_LABEL_FALLBACK_COLOR = '#ffffff';
/** Drop-shadow color behind area labels for legibility on light backgrounds. */
export const AREA_LABEL_SHADOW_COLOR = '#000000';
/** Drop-shadow alpha behind area labels. */
export const AREA_LABEL_SHADOW_ALPHA = 0.6;

// ── VisualColorPicker (HSV wheel + brightness for carpets) ───
export const VISUAL_COLOR_PICKER_SV_SIZE_PX = 180;
export const VISUAL_COLOR_PICKER_HUE_WIDTH_PX = 20;
export const VISUAL_COLOR_PICKER_MARKER_RADIUS_PX = 6;
/**
 * The hue bar gradient is intrinsic to the color-picking interaction, not a
 * theme color — it must span the full hue circle. Centralized here so the
 * component body stays free of inline color literals. (The saturation/brightness
 * square is painted to a canvas from the carpet HSL model, not a CSS gradient.)
 */
export const VISUAL_COLOR_PICKER_HUE_GRADIENT =
  'linear-gradient(to bottom, ' +
  '#ff0000 0%, #ffff00 16.7%, #00ff00 33.3%, ' +
  '#00ffff 50%, #0000ff 66.7%, #ff00ff 83.3%, #ff0000 100%)';
export const VISUAL_COLOR_PICKER_MARKER_BORDER = '2px solid #fff';
export const VISUAL_COLOR_PICKER_MARKER_SHADOW = '0 0 0 1px rgba(0,0,0,0.6)';
/** Width of the collapsed swatch + hex trigger row (compact mode). */
export const VISUAL_COLOR_PICKER_COMPACT_WIDTH_PX = 160;
/** Swatch square size shown in the collapsed trigger. */
export const VISUAL_COLOR_PICKER_SWATCH_PX = 22;
/** Gap (px) between the collapsed trigger and the expanded popup panel. */
export const VISUAL_COLOR_PICKER_POPUP_GAP_PX = 6;

// ── Notification Sound (done: ascending chime) ─────────────
export const NOTIFICATION_NOTE_1_HZ = 659.25; // E5
export const NOTIFICATION_NOTE_2_HZ = 1318.51; // E6 (octave up)
export const NOTIFICATION_NOTE_1_START_SEC = 0;
export const NOTIFICATION_NOTE_2_START_SEC = 0.1;
export const NOTIFICATION_NOTE_DURATION_SEC = 0.18;
export const NOTIFICATION_VOLUME = 0.14;

// ── Permission Sound (attention: descending double tap) ────
export const PERMISSION_NOTE_1_HZ = 880; // A5
export const PERMISSION_NOTE_2_HZ = 659.25; // E5 (down a fourth)
export const PERMISSION_NOTE_1_START_SEC = 0;
export const PERMISSION_NOTE_2_START_SEC = 0.12;
export const PERMISSION_NOTE_DURATION_SEC = 0.15;
export const PERMISSION_VOLUME = 0.12;

// ── Furniture Animation ─────────────────────────────────────
export const FURNITURE_ANIM_INTERVAL_SEC = 0.2;

// ── Version Notice ──────────────────────────────────────────
export const WHATS_NEW_AUTO_CLOSE_MS = 20000;
export const WHATS_NEW_FADE_MS = 1000;

// ── Game Logic ───────────────────────────────────────────────
export const MAX_DELTA_TIME_SEC = 0.1;
export const WAITING_BUBBLE_DURATION_SEC = 2.0;
/** Size of a sub-agent (intern) relative to a full agent, rounded to a whole zoom level.
 *  Fase 4B: interns are their own characters now, drawn at full size. */
export const SUBAGENT_SCALE = 1;
/** Seconds each frame of the thinking bubble's dots stays on screen. */
export const THINKING_DOT_FRAME_SEC = 0.4;
export const DISMISS_BUBBLE_FAST_FADE_SEC = 0.3;
export const INACTIVE_SEAT_TIMER_MIN_SEC = 3.0;
export const INACTIVE_SEAT_TIMER_RANGE_SEC = 2.0;
/** Default/fallback palette count (bundled characters). Actual count comes from getLoadedCharacterCount(). */
export const PALETTE_COUNT = 6;
export const AUTO_ON_FACING_DEPTH = 3;
export const AUTO_ON_SIDE_DEPTH = 2;
export const CHARACTER_HIT_HALF_WIDTH = 9;
export const CHARACTER_HIT_HEIGHT = 36;
export const TOOL_OVERLAY_VERTICAL_OFFSET = 44;

// ── Greeter + Intro bubble ──────────────────────────────────
/** Reserved character id for the Intro's greeter. Far outside both real agent
 *  ids (positive) and sub-agent ids (small negatives from -1 down). */
export const GREETER_ID = -1_000_000_000;
/** Stacking order for the Intro's bubble. Deliberately BELOW the modal stack
 *  (ui/Modal defaults to 50, ChangelogModal 51, the migration notice z-100): the
 *  Intro is diegetic furniture over the office, not a modal, so a modal opened
 *  on top of it must cover it rather than slide underneath. */
export const INTRO_BUBBLE_Z_INDEX = 45;
/** The greeter stands this many tiles in from the office's bottom-left corner
 *  (target tile (margin, rows-1-margin); nearest walkable tile if blocked). */
export const GREETER_TILE_MARGIN = 3;
/** World px above the greeter's anchor (feet) where the bubble's bottom sits.
 *  Kept well above the head target (INTRO_TAIL_TARGET_RISE_WORLD) so the
 *  tail squares have a visible run between bubble and head. */
export const INTRO_BUBBLE_ANCHOR_RISE_WORLD = 44;
/** World px right of the greeter's center where the bubble's left edge starts —
 *  just clear of the sprite so the tail points down-left at the head. */
export const INTRO_BUBBLE_OFFSET_X_WORLD = 10;
/** Bubble width cap (CSS px) and the margin kept from the container edges.
 *  Wide on purpose: the disclosure reads as three short paragraphs instead of
 *  a tall column (still clamped to the container on narrow panels). */
export const INTRO_BUBBLE_MAX_WIDTH_PX = 560;
export const INTRO_BUBBLE_EDGE_MARGIN_PX = 4;
/** Where the Intro's Claude Code step sends people who don't have it yet. */
export const CLAUDE_CODE_URL = 'https://claude.com/claude-code';
export const CLAUDE_CODE_INSTALL_COMMAND = 'npm install -g @anthropic-ai/claude-code';
/** Speech-tail squares: placed at fraction `t` along the segment from the
 *  bubble's nearest edge point to the greeter's head, shrinking toward the
 *  speaker. Recomputed every frame so the tail stays connected no matter where
 *  edge-clamping or panning puts the bubble relative to the character. */
export const INTRO_TAIL_STEPS = [
  { t: 0.25, size: 12 },
  { t: 0.55, size: 9 },
  { t: 0.82, size: 6 },
] as const;
/** World px above the greeter's anchor (feet) the tail points at — the head. */
export const INTRO_TAIL_TARGET_RISE_WORLD = 26;
/** Camera-offset caps while centering character + bubble. The ideal composition
 *  assumes the bubble fits beside/above the character; when it can't (narrow or
 *  short viewports clamp the bubble to the screen), uncapped offsets shove the
 *  greeter to the viewport edge. Horizontal offset is capped to this fraction
 *  of the viewport; vertical offset always keeps this many world px of the
 *  character visible above the bottom edge. */
export const INTRO_CAMERA_MAX_X_OFFSET_VIEWPORT_FRACTION = 0.25;
export const INTRO_CAMERA_MIN_CHAR_VISIBLE_WORLD = 48;
/** Extra downward camera shift (CSS px) so the character+bubble composition
 *  sits a bit above the vertical center instead of dead-centered. */
export const INTRO_CAMERA_DOWN_SHIFT_PX = 50;

// ── Context Fuel Gauge ──────────────────────────────────────
/** Window assumed before the runtime reports one (it always does for agents
 *  that have taken a turn; this only covers characters created ahead of it). */
export const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
export const CONTEXT_WARN_THRESHOLD = 0.6;
export const CONTEXT_DANGER_THRESHOLD = 0.8;
export const CONTEXT_CRITICAL_THRESHOLD = 0.95;
export const CONTEXT_GAUGE_WIDTH_PX = 40;
export const CONTEXT_GAUGE_HEIGHT_PX = 4;
export const CONTEXT_GAUGE_COLOR_OK = '#44cc44';
export const CONTEXT_GAUGE_COLOR_WARN = '#ffcc00';
export const CONTEXT_GAUGE_COLOR_DANGER = '#ff8800';
export const CONTEXT_GAUGE_COLOR_CRITICAL = '#ff2222';
export const CONTEXT_GAUGE_BG = '#222';

// ── Agent Teams ─────────────────────────────────────────────
export const TEAM_LEAD_COLOR = '#ffd700';
export const TEAM_ROLE_COLOR = '#66aaff';

// ── Pets ────────────────────────────────────────────────────────
/** Walking speed in world pixels per second (matches character walk speed visually but slower). */
export const PET_WALK_SPEED_PX_PER_SEC = 32;
/** Time per WALK animation cycle step (4 cycle steps × 0.15s = 0.6s per loop). */
export const PET_WALK_FRAME_DURATION_SEC = 0.15;
/** Time per IDLE animation cycle step (4 cycle steps × 0.3s = 1.2s per loop). */
export const PET_IDLE_FRAME_DURATION_SEC = 0.3;
/** Walk cycle: 4-step lookup into the 3-frame walkDown/walkUp/walkRight arrays. */
export const PET_WALK_SEQUENCE = [0, 1, 0, 2] as const;
/** Idle cycle: 4-step lookup into the 3-frame idleDown/idleUp arrays. */
export const PET_IDLE_SEQUENCE = [0, 1, 2, 1] as const;
/** Minimum seconds the pet stays in IDLE before making a new decision. */
export const PET_WANDER_PAUSE_MIN_SEC = 3.0;
/** Maximum seconds the pet stays in IDLE before making a new decision. */
export const PET_WANDER_PAUSE_MAX_SEC = 15.0;
/** Seconds between FOLLOW path re-computations. */
export const PET_FOLLOW_RECALC_INTERVAL_SEC = 1.0;
/** Probability that a pet enters FOLLOW (instead of WALK) when wanderTimer expires. */
export const PET_FOLLOW_CHANCE = 0.3;
/** Maximum Manhattan distance (tiles) at which a character can become a follow target. */
export const PET_FOLLOW_RADIUS_TILES = 3;
/** Minimum seconds a FOLLOW episode lasts before timing out. */
export const PET_FOLLOW_DURATION_MIN_SEC = 5.0;
/** Maximum seconds a FOLLOW episode lasts before timing out. */
export const PET_FOLLOW_DURATION_MAX_SEC = 15.0;
/** Hit-box half-width (world px) for pet click detection. */
export const PET_HIT_HALF_WIDTH = 8;
/** Hit-box height (world px) measured upward from the bottom-center anchor. */
export const PET_HIT_HEIGHT = 16;
/** Zoom factor used to draw pet thumbnails in the EditorToolbar Pets tab. */
export const PET_THUMB_ZOOM = 2;
/** Scale margin so the pet thumbnail fills the ItemSelect cell without touching the edges. */
export const PET_THUMB_SCALE_MARGIN = 0.85;
/** Fallback background fill for sprite-less thumbnail (used while pet sprites are loading). */
export const EMPTY_SPRITE_THUMBNAIL_BG = '#333';
/** Maximum string length for a PlacedPet.id (defends against pathologically-long layout entries). */
export const MAX_PET_ID_LENGTH = 128;

// ── Visual Effects (fork, Fase 2) ───────────────────────────
// Shadows — pixel sprites in '#RRGGBBAA' (light comes from the top-left).
export const SHADOW_CORE_COLOR = '#0000004a';
export const SHADOW_EDGE_COLOR = '#00000026';
/** Character shadow: 10×3 sprite px ellipse at the feet. */
export const CHARACTER_SHADOW_WIDTH = 12;
export const PET_SHADOW_WIDTH = 8;
/** Characters that hover instead of walking (char_N sheets, arte/pixellab/personajes/elenco.json
 *  "flotantes"): 9 = Wheatley. Smaller, fainter shadow, and they don't drop into a chair. */
export const FLOATING_CHARACTERS: ReadonlySet<number> = new Set([9]);
export const FLOATING_SHADOW_WIDTH = 8;
export const FLOATING_SHADOW_ALPHA = 0.6;
/** Rows of a furniture sprite's base scanned to size its contact shadow. */
export const FURNITURE_SHADOW_BASE_ROWS = 4;
/** Floor rows darkened right under a wall (ambient occlusion at its base). */
export const WALL_SHADOW_COLOR = '#00000033';
export const WALL_SHADOW_SOFT_COLOR = '#0000001a';

// Idle motion
/** Full breathing cycle; the torso is raised for BREATH_INHALE_FRACTION of it. */
export const BREATH_PERIOD_SEC = 3.2;
export const BREATH_INHALE_FRACTION = 0.45;
/** Part of the character's height (from the feet) that stays put while breathing. */
export const BREATH_LEGS_FRACTION = 0.3;
export const LOOK_AROUND_MIN_SEC = 1.5;
export const LOOK_AROUND_MAX_SEC = 4.5;

// Always-on furniture animation (code-driven until our own art lands)
export const PLANT_SWAY_STEP_SEC = 0.8;
/** Top fraction of a plant's opaque height that sways (bottom fraction for hanging plants). */
export const PLANT_SWAY_FOLIAGE_FRACTION = 0.45;
export const STANDBY_LED_PERIOD_SEC = 2.0;
export const STANDBY_LED_ON_FRACTION = 0.5;
export const STANDBY_LED_COLOR = '#5ee08a';
/** Window glass, as painted in WINDOW.png (day), and what it turns into. */
export const WINDOW_SKY_UPPER = '#7cc4ef';
export const WINDOW_SKY_LOWER = '#a9dcf7';
export const WINDOW_CLOUD = '#f4fbff';
export const WINDOW_DUSK_UPPER = '#e98a5c';
export const WINDOW_DUSK_LOWER = '#f6b97a';
export const WINDOW_DUSK_CLOUD = '#ffe0b8';
export const WINDOW_NIGHT_UPPER = '#0d1636';
export const WINDOW_NIGHT_LOWER = '#18264f';
export const WINDOW_MOON = '#f3efc8';
export const WINDOW_STAR = '#dfe7ff';
/** Flux capacitor (Fase 4): the Y tubes as drawn in FLUX_CAPACITOR.png and their dim pulse. */
export const FLUX_CORE = '#feffff';
export const FLUX_GLOW = '#4bacdd';
export const FLUX_DIM_CORE = '#8fd6f2';
export const FLUX_DIM_GLOW = '#2b6f93';
export const FLUX_PULSE_PERIOD_SEC = 0.9;
export const FLUX_BRIGHT_FRACTION = 0.6;
/** The One Ring (Fase 4): its gold as drawn in RING_PEDESTAL.png and the glint it flashes now and then. */
export const RING_GOLD = '#f7d722';
export const RING_GOLD_SOFT = '#e2cc51';
export const RING_GLINT = '#fff6b8';
export const RING_GLINT_SOFT = '#ffe680';
export const RING_GLINT_PERIOD_SEC = 3.2;
export const RING_GLINT_FRACTION = 0.18;
/** Portals (Fase 4, Aperture): the swirl bands as drawn in PORTAL_BLUE/ORANGE.png; they rotate one band per step. */
export const PORTAL_BLUE_BANDS = ['#1f6fd1', '#3f9cf0', '#7cccff', '#2f86e0'] as const;
export const PORTAL_ORANGE_BANDS = ['#e0520c', '#ff8a1e', '#ffbb55', '#f26e14'] as const;
export const PORTAL_CYCLE_STEP_SEC = 0.2;
/** Code room (Fase 4): Matrix rain as drawn in MATRIX_SCREEN.png (head → tail); it falls one band per step. */
export const MATRIX_BANDS = ['#d8ffd8', '#4dff6a', '#1fa83a', '#0b4a1a'] as const;
export const MATRIX_CYCLE_STEP_SEC = 0.2;
/** Server rack LEDs as drawn in SERVER_RACK.png and their dim blink. */
export const RACK_LED_GREEN = '#3dff6a';
export const RACK_LED_AMBER = '#ffb43c';
export const RACK_LED_GREEN_DIM = '#14632a';
export const RACK_LED_AMBER_DIM = '#6a4416';
export const RACK_BLINK_PERIOD_SEC = 1.3;
export const RACK_BLINK_FRACTION = 0.3;
/** Lava lamp (Fase 4, Becarios): its bands as drawn in LAVA_LAMP.png; they creep along slowly. */
export const LAVA_BANDS = ['#ff5a3c', '#ff9a3c', '#b8389c', '#7a2a8a'] as const;
export const LAVA_CYCLE_STEP_SEC = 0.6;
export const PORTAL_SPARK_SPAWN_SEC = 0.4;
export const PORTAL_SPARK_LIFE_SEC = 0.7;
export const PORTAL_BLUE_SPARKS = ['#ffffff', '#bfe8ff'] as const;
export const PORTAL_ORANGE_SPARKS = ['#ffffff', '#ffe0a8'] as const;
/** "88" neon sign in the garage (Fase 4): tube colors as drawn in NEON_88.png and a short flicker off now and then. */
export const NEON_CORE = '#ff9ee6';
export const NEON_GLOW = '#d634a0';
export const NEON_DIM_CORE = '#7a3a6a';
export const NEON_DIM_GLOW = '#4a2244';
export const NEON_FLICKER_PERIOD_SEC = 4.5;
export const NEON_FLICKER_FRACTION = 0.05;
/** Basement fires and torch (Fase 4): flame colors as drawn -> their flicker (yellow sinks to orange, orange to red). */
export const FIRE_FLICKER_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ['#f7e95d', '#f9a83a'],
  ['#f9eb5d', '#f9a83a'],
  ['#e9780b', '#f14527'],
  ['#ec7d0b', '#f14527'],
];
export const TORCH_FLICKER_SWAPS: ReadonlyArray<readonly [string, string]> = [
  ['#f7b400', '#f94708'],
  ['#f94708', '#c73806'],
  ['#f94507', '#c73806'],
  ['#f74909', '#c73806'],
  ['#f94809', '#c73806'],
  ['#fd4608', '#c73806'],
  ['#fb4607', '#c73806'],
];
export const FIRE_FLICKER_PERIOD_SEC = 0.4;
export const FIRE_FLICKER_FRACTION = 0.45;

// Day / night
/** Lighting recompute cadence for the auto clock (the light set triggers its own recomputes). */
export const DAY_NIGHT_REFRESH_SEC = 30;
export const NIGHT_TINT_COLOR = '#0e1438';
export const DUSK_TINT_COLOR = '#ff7a2e';
export const DAWN_TINT_COLOR = '#ff9f8a';
export const DAY_TINT_COLOR = '#ffffff';
export const NIGHT_TINT_ALPHA = 0.62;
export const DUSK_TINT_ALPHA = 0.24;
export const DAWN_TINT_ALPHA = 0.2;
/** Discrete light levels (pixel-art banding); dithering blends neighbouring bands. */
export const LIGHT_LEVELS = 5;
export const SCREEN_LIGHT_COLOR = '#9fd8ff';
export const SCREEN_LIGHT_RADIUS_PX = 34;
export const SCREEN_LIGHT_INTENSITY = 0.85;
export const LAMP_LIGHT_COLOR = '#ffd28a';
export const LAMP_LIGHT_RADIUS_PX = 56;
export const LAMP_LIGHT_INTENSITY = 1;
/** Every screen glows a little at night, in use or not (the one being worked at adds the full glow). */
export const IDLE_SCREEN_LIGHT_RADIUS_PX = 20;
export const IDLE_SCREEN_LIGHT_INTENSITY = 0.45;
/** Moonlight: a slanted beam from each window down onto the floor. */
export const MOON_LIGHT_COLOR = '#b9c9ff';
export const MOON_BEAM_LENGTH_PX = 44;
export const MOON_BEAM_HALF_WIDTH_TOP_PX = 6;
export const MOON_BEAM_HALF_WIDTH_BOTTOM_PX = 11;
/** Sideways drift of the beam per pixel it travels down (the moon sits off to one side). */
export const MOON_BEAM_SKEW = 0.35;
export const MOON_BEAM_INTENSITY = 0.75;
/** How strongly a light tints the pixels it reaches (0 = only removes darkness). */
export const LIGHT_TINT_ALPHA = 0.16;

// Particles
export const MAX_PARTICLES = 220;
export const STEAM_COLOR = '#e8ecf2';
export const STEAM_SPAWN_SEC = 0.55;
export const STEAM_LIFE_SEC = 1.8;
export const STEAM_RISE_PX_PER_SEC = 6;
export const SPARK_COLORS = ['#fff3a3', '#ffd34d', '#ffffff', '#9ff0ff'] as const;
export const SPARK_COUNT = 14;
export const SPARK_LIFE_SEC = 0.9;
export const SPARK_SPEED_PX_PER_SEC = 34;
export const SPARK_GRAVITY_PX_PER_SEC2 = 60;
/** Sparks start this far above the character's feet (top of the head). */
export const SPARK_HEAD_HEIGHT_PX = 24;
export const DUST_COLORS = ['#f4ead2', '#d9cfb8'] as const;
export const PAPER_COLORS = ['#ffffff', '#f2f0e6'] as const;
export const DUST_SPAWN_SEC = 2.2;
export const DUST_LIFE_SEC = 6;
export const PAPER_CHANCE = 0.15;

// ── Task Zones (fork, Fase 3) ───────────────────────────────
/** How long a new activity must last before the agent walks to its zone. */
export const ZONE_SWITCH_DELAY_SEC = 2;
/** Minimum time in a zone before moving on to the next one (no ping-pong). */
export const ZONE_MIN_STAY_SEC = 8;

// Interns (sub-agents), Fase 4B: they fade in next to their boss and walk to the interns'
// room; when done they walk back to the boss and fade out there.
export const INTERN_FADE_SEC = 0.5;
/** Longest walk back to the boss before fading out anyway (blocked path, far boss). */
export const INTERN_LEAVE_MAX_SEC = 10;
/** An intern done with its task first rests this long in the interns' room (Fase 5.1). */
export const INTERN_REST_MIN_SEC = 20;
export const INTERN_REST_MAX_SEC = 40;

// ── Free time (fork, Fase 5.1) ──────────────────────────────
/** Time without work before an agent picks a free-time activity (before that it wanders). */
export const LEISURE_START_SEC = 45;
/** How long one activity lasts once the agent got there. */
export const LEISURE_ACTIVITY_MIN_SEC = 20;
export const LEISURE_ACTIVITY_MAX_SEC = 60;
/** Chance of wandering for a while between two activities, and for how long. */
export const LEISURE_WANDER_CHANCE = 0.25;
export const LEISURE_WANDER_MIN_SEC = 15;
export const LEISURE_WANDER_MAX_SEC = 30;
/** Nothing free (or unreachable): wander this long before trying again. */
export const LEISURE_RETRY_SEC = 10;
/** Statues visited on one walk through the gallery. */
export const LEISURE_TOUR_STOPS_MIN = 3;
export const LEISURE_TOUR_STOPS_MAX = 4;
/** A cushion counts as "at" a table when it touches it (1 = next to it, diagonals too). */
export const LEISURE_SEAT_REACH_TILES = 1;
/** Stargazing only when lamps are at least this lit (`Ambient.lights`: 0 day, 1 night). */
export const LEISURE_NIGHT_LIGHTS_MIN = 0.5;

/** Interns of each boss (char_N index → interns' char_N), from arte/pixellab/personajes/elenco.json.
 *  0 Doc → Marty · 1 Senku → Chrome, Kohaku · 2 Chell → Wheatley · 3 Neo → Trinity ·
 *  4 Gandalf → Frodo, Sam · 5 Kakashi → Naruto, Sakura. */
export const BOSS_INTERNS: Readonly<Record<number, readonly number[]>> = {
  0: [6],
  1: [7, 8],
  2: [9],
  3: [10],
  4: [11, 12],
  5: [13, 14],
};

// 88 mph: a command finished in the DeLorean workshop -> flux sparks + two fire trails
export const FLUX_SPARK_COLORS = ['#ffffff', '#9ff0ff', '#5fb7ff'] as const;
export const FLUX_SPARK_COUNT = 16;
export const FLUX_SPARK_SPEED_PX_PER_SEC = 40;
export const FLUX_SPARK_LIFE_SEC = 0.5;
export const FIRE_TRAIL_COLORS = ['#ff4b1f', '#ff7a1a', '#ffc23d'] as const;
export const FIRE_TRAIL_LENGTH_PX = 20;
/** Gap between the two trails (sprite px), like the DeLorean's tyres. */
export const FIRE_TRAIL_GAP_PX = 6;
export const FIRE_TRAIL_LIFE_SEC = 0.9;
/** Moonstones (Skies of Arcadia homage) glow faintly at night. */
export const MOONSTONE_LIGHT_COLOR = '#d6c8ff';
export const MOONSTONE_LIGHT_RADIUS_PX = 18;
export const MOONSTONE_LIGHT_INTENSITY = 0.55;
export const FLUX_LIGHT_COLOR = '#7fd4ff';
export const FLUX_LIGHT_RADIUS_PX = 26;
export const FLUX_LIGHT_INTENSITY = 0.6;
export const RING_LIGHT_COLOR = '#ffd75a';
export const RING_LIGHT_RADIUS_PX = 22;
export const RING_LIGHT_INTENSITY = 0.5;
export const TRON_LIGHT_COLOR = '#5ff3ff';
export const TRON_LIGHT_RADIUS_PX = 24;
export const TRON_LIGHT_INTENSITY = 0.6;
export const MATRIX_LIGHT_COLOR = '#4dff6a';
export const MATRIX_LIGHT_RADIUS_PX = 30;
export const MATRIX_LIGHT_INTENSITY = 0.5;
export const LAVA_LIGHT_COLOR = '#ff7a4a';
export const LAVA_LIGHT_RADIUS_PX = 22;
export const LAVA_LIGHT_INTENSITY = 0.6;
export const PORTAL_BLUE_LIGHT_COLOR = '#5fb7ff';
export const PORTAL_ORANGE_LIGHT_COLOR = '#ff9a3c';
export const PORTAL_LIGHT_RADIUS_PX = 28;
export const PORTAL_LIGHT_INTENSITY = 0.7;
export const NEON_LIGHT_COLOR = '#ff7ad6';
export const NEON_LIGHT_RADIUS_PX = 22;
export const NEON_LIGHT_INTENSITY = 0.5;
/** Garage work light on a tripod: whiter and wider than a living-room lamp. */
export const WORK_LIGHT_COLOR = '#fff1c4';
export const WORK_LIGHT_RADIUS_PX = 64;
export const WORK_LIGHT_INTENSITY = 1;
export const FIRE_LIGHT_COLOR = '#ff9a3c';
export const FIRE_LIGHT_RADIUS_PX = 30;
export const FIRE_LIGHT_INTENSITY = 0.75;
/** Jedi archive: blue brazier flames and the holo table glow. */
export const JEDI_LIGHT_COLOR = '#6fb8ff';
export const JEDI_LIGHT_RADIUS_PX = 26;
export const JEDI_LIGHT_INTENSITY = 0.6;
/** Task-zone names are drawn smaller than project areas: there are many, and close together. */
export const ZONE_LABEL_FONT_SIZE_PX = 6;

// Error zone (The Binding of Isaac): a failed tool sends the agent to the basement
/** How long a failure keeps the agent wanting the error zone. */
export const ZONE_ERROR_HOLD_SEC = 5;
/** After a trip to the error zone, further failures only make it cry. */
export const ZONE_ERROR_COOLDOWN_SEC = 30;
export const TEAR_COLORS = ['#8fd3ff', '#5fb7ff', '#d8f1ff'] as const;
export const TEAR_COUNT = 6;
export const TEAR_LIFE_SEC = 0.8;
/** Light Labs teleporter (Mega Man): a beam rises inside the capsule when an agent arrives in the zone. */
export const TELEPORT_BEAM_COLORS = ['#ffffff', '#bff6ff', '#6fd8ff'] as const;
export const TELEPORT_BEAM_COUNT = 30;
export const TELEPORT_BEAM_HALF_WIDTH_PX = 5;
export const TELEPORT_BEAM_HEIGHT_PX = 22;
export const TELEPORT_BEAM_RISE_PX_PER_SEC = 34;
export const TELEPORT_BEAM_LIFE_SEC = 0.7;
/** Glass base of the TELEPORTER sprite: where the beam starts (sprite px from its top-left). */
export const TELEPORT_BEAM_ORIGIN_X = 16;
export const TELEPORT_BEAM_ORIGIN_Y = 31;
/** Eyes sit this far above the character's feet. */
export const TEAR_EYE_HEIGHT_PX = 18;

// ── Office photo (fork, Fase 5): "Captura" button in the bottom toolbar ──
/** Device pixels per sprite pixel in the downloaded PNG (whole office, no UI). */
export const CAPTURE_ZOOM = 4;
/** Extra tiles above the map: walls and wall items draw up to 2 tiles over row 0. */
export const CAPTURE_TOP_PAD_TILES = 2;
export const CAPTURE_PAD_TILES = 1;
export const CAPTURE_BG_COLOR = '#1e1e2e';
export const CAPTURE_FILE_PREFIX = 'pixel-agents';
