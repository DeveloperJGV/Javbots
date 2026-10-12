import {
  DISCO_COLORS,
  DISCO_RADIUS_PX,
  DISCO_SPEED,
  HOP_HEIGHT_PX,
  HOP_PERIOD_SEC,
} from '../../constants.js';
import type { Character } from '../types.js';
import { TILE_SIZE } from '../types.js';

/**
 * Party mode (fork, Fase 5.5). DOM-free helpers: the hop, the dance floor and the
 * disco spots. The office drives the party (officeState.ts); drawing lives in
 * partyRender.ts.
 */

/** The party under way: gathering until the first guest arrives, then dancing. */
export interface PartyState {
  /** Seconds since the party was called. */
  sec: number;
  /** Seconds of dance left; null while the guests are still on their way. */
  danceSec: number | null;
  /** Dance floor in sprite px (where confetti falls and disco lights sweep). */
  bounds: PartyBounds;
}

export interface PartyBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiscoLight {
  x: number;
  y: number;
  radius: number;
  color: string;
}

/** Height (whole sprite px) of a hopping character above the floor. */
export function hopOffsetPx(ch: Character): number {
  if (ch.cheerSec <= 0) return 0;
  const phase = (ch.hopTimer % HOP_PERIOD_SEC) / HOP_PERIOD_SEC;
  return Math.round(HOP_HEIGHT_PX * Math.sin(Math.PI * phase));
}

/** Smallest box of tiles holding every spot, one tile of margin around. */
export function partyBounds(spots: ReadonlyArray<{ col: number; row: number }>): PartyBounds {
  if (spots.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const cols = spots.map((s) => s.col);
  const rows = spots.map((s) => s.row);
  const minCol = Math.min(...cols) - 1;
  const minRow = Math.min(...rows) - 1;
  const maxCol = Math.max(...cols) + 1;
  const maxRow = Math.max(...rows) + 1;
  return {
    x: minCol * TILE_SIZE,
    y: minRow * TILE_SIZE,
    w: (maxCol - minCol + 1) * TILE_SIZE,
    h: (maxRow - minRow + 1) * TILE_SIZE,
  };
}

/** Disco spots at time `t`: each color circles the floor on its own Lissajous path. */
export function discoLights(t: number, b: PartyBounds): DiscoLight[] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = Math.max(0, b.w / 2 - DISCO_RADIUS_PX / 2);
  const ry = Math.max(0, b.h / 2 - DISCO_RADIUS_PX / 2);
  return DISCO_COLORS.map((color, i) => {
    const a = t * DISCO_SPEED + (i * Math.PI * 2) / DISCO_COLORS.length;
    return {
      x: cx + Math.cos(a * (1 + i * 0.17)) * rx,
      y: cy + Math.sin(a * 1.3 + i) * ry,
      radius: DISCO_RADIUS_PX,
      color,
    };
  });
}
