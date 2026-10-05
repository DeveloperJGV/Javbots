/**
 * Shared constants — used by the extension host, Vite build scripts,
 * and future standalone backend.
 *
 * No VS Code dependency. Only asset parsing and layout-related values.
 */

// ── PNG / Asset Parsing ─────────────────────────────────────
export const PNG_ALPHA_THRESHOLD = 2;
export const WALL_PIECE_WIDTH = 16;
export const WALL_PIECE_HEIGHT = 32;
export const WALL_GRID_COLS = 4;
export const WALL_BITMASK_COUNT = 16;
export const FLOOR_TILE_SIZE = 16;
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const;
// Fork, Fase 4B: 24×44 frames, 8 per row (walk ×4, type ×2, read ×2) → 192×132 sheets.
export const CHAR_FRAME_W = 24;
export const CHAR_FRAME_H = 44;
export const CHAR_FRAMES_PER_ROW = 8;
/** Bosses (char_0..CHAR_COUNT-1), the ones agents are drawn as. Higher char_N files are interns. */
export const CHAR_COUNT = 6;

// ── Pet Sprite Dimensions (96×96 spritesheet) ──────────────
export const PET_FRAME_W_SMALL = 16;
export const PET_FRAME_H = 32;
export const PET_FRAME_W_LARGE = 32;
export const PET_IMAGE_WIDTH = 96;
export const PET_IMAGE_HEIGHT = 96;
export const PET_WALK_FRAMES_VERT = 3;
export const PET_IDLE_FRAMES_VERT = 3;
export const PET_WALK_FRAMES_HORIZ = 3;
export const MAX_PET_PNG_SIZE = 512 * 1024; // 512 KB cap per pet PNG

// ── Carpet auto-tile parsing ────────────────────────────────
export const CARPET_TILE_SIZE = 16;
export const CARPET_GRID_COLS = 4;
export const CARPET_MARCHING_SQUARES_COUNT = 16;
