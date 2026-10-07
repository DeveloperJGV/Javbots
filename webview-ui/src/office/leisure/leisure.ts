// Free time (fork, Fase 5.1): what an agent does once it has really had nothing
// to do for a while — sit on the couch, read, meditate, walk the gallery, get a
// coffee, play Pac-Man, look at the stars. Spots come from the furniture in the
// layout (by type), so they follow the furniture when it moves in the editor.

import { LEISURE_SEAT_REACH_TILES } from '../../constants.js';
import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { isWalkable } from '../layout/tileMap.js';
import type { Character, OfficeLayout, Seat, TileType as TileTypeVal } from '../types.js';
import { CharacterState, Direction } from '../types.js';

export const LeisureActivity = {
  TV: 'tv',
  CONSOLE: 'console',
  READ: 'read',
  MEDITATE: 'meditate',
  GALLERY: 'gallery',
  COFFEE: 'coffee',
  PACMAN: 'pacman',
  STARS: 'stars',
} as const;
export type LeisureActivity = (typeof LeisureActivity)[keyof typeof LeisureActivity];

/** How the agent looks once there: typing/playing, reading, or still. */
export type LeisurePose = 'type' | 'read' | 'still';

export interface LeisureSpot {
  col: number;
  row: number;
  /** Direction the agent faces there. */
  dir: Direction;
  /** Seat uid when the spot is a chair; null = standing. */
  seatUid: string | null;
}

export interface LeisureState {
  activity: LeisureActivity;
  /** Places still to visit, current one first (several only for the gallery). */
  stops: LeisureSpot[];
  /** Time left at the current stop; counts down only once there. */
  sec: number;
  /** Time each later stop gets. */
  stopSec: number;
  /** Reached the current stop. */
  arrived: boolean;
  /** The current stop turned out unreachable. */
  failed: boolean;
}

interface SeatSource {
  type: string;
  /** Only seats within reach of one of these furniture types. */
  near?: readonly string[];
}

interface ActivityDef {
  label: string;
  pose: LeisurePose;
  /** Sit on one of these chairs… */
  seats?: readonly SeatSource[];
  /** …or stand next to one of these. */
  standBy?: readonly string[];
  /** Walk from one `standBy` piece to the next instead of staying at one. */
  tour?: boolean;
  nightOnly?: boolean;
}

const GALLERY_PIECES = [
  'STATUE_RANMA',
  'STATUE_LINK',
  'STATUE_MARIO',
  'STATUE_KIRBY',
  'STATUE_CHIEF',
  'RING_PEDESTAL',
] as const;

export const LEISURE_ACTIVITIES: Readonly<Record<LeisureActivity, ActivityDef>> = {
  tv: {
    label: 'Viendo la tele',
    pose: 'still',
    seats: [{ type: 'SOFA_SIMPSON' }, { type: 'SOFA_ORANGE' }],
  },
  console: { label: 'Jugando en la consola', pose: 'type', seats: [{ type: 'BEANBAG' }] },
  read: {
    label: 'Leyendo',
    pose: 'read',
    seats: [{ type: 'JEDI_CUSHION', near: ['JEDI_STUDY_TABLE'] }, { type: 'SENKU_STUMP' }],
  },
  meditate: {
    label: 'Meditando',
    pose: 'still',
    seats: [{ type: 'JEDI_CUSHION', near: ['HOLO_TABLE'] }],
  },
  gallery: { label: 'Paseando por la galería', pose: 'still', standBy: GALLERY_PIECES, tour: true },
  coffee: { label: 'Por un café', pose: 'still', standBy: ['COFFEE_MAKER'] },
  pacman: { label: 'Jugando Pac-Man', pose: 'type', standBy: ['ARCADE'] },
  stars: {
    label: 'Viendo las estrellas',
    pose: 'still',
    standBy: ['SENKU_TELESCOPE'],
    nightOnly: true,
  },
};

/** Everything an agent may do in its free time. */
export const ALL_LEISURE: readonly LeisureActivity[] = [
  LeisureActivity.TV,
  LeisureActivity.CONSOLE,
  LeisureActivity.READ,
  LeisureActivity.MEDITATE,
  LeisureActivity.GALLERY,
  LeisureActivity.COFFEE,
  LeisureActivity.PACMAN,
  LeisureActivity.STARS,
];

/** What an intern does in the interns' room before going home. */
export const INTERN_LEISURE: readonly LeisureActivity[] = [
  LeisureActivity.TV,
  LeisureActivity.CONSOLE,
  LeisureActivity.PACMAN,
];

export function leisureLabel(activity: LeisureActivity): string {
  return LEISURE_ACTIVITIES[activity].label;
}

/** The stop the agent is heading to or at, or null. */
export function leisureStop(ch: Character): LeisureSpot | null {
  return ch.leisure?.stops[0] ?? null;
}

/** Standing or sitting at its free-time spot right now. */
export function atLeisureStop(ch: Character): boolean {
  const stop = leisureStop(ch);
  return !!stop && !!ch.leisure?.arrived && ch.tileCol === stop.col && ch.tileRow === stop.row;
}

/** Pose to draw while at the spot, or null when not there. */
export function leisurePose(ch: Character): LeisurePose | null {
  return ch.leisure && atLeisureStop(ch) ? LEISURE_ACTIVITIES[ch.leisure.activity].pose : null;
}

/** Arrive at the stop: face it, and sit down (or play standing) when the activity says so. */
export function settleAtLeisure(ch: Character): void {
  const stop = leisureStop(ch);
  if (!ch.leisure || !stop) return;
  ch.leisure.arrived = true;
  ch.dir = stop.dir;
  ch.frame = 0;
  ch.frameTimer = 0;
  const pose = LEISURE_ACTIVITIES[ch.leisure.activity].pose;
  ch.state = stop.seatUid !== null || pose !== 'still' ? CharacterState.TYPE : CharacterState.IDLE;
}

function footprintOf(type: string): { w: number; h: number } {
  const entry = getCatalogEntry(type);
  return { w: entry?.footprintW ?? 1, h: entry?.footprintH ?? 1 };
}

/** Chebyshev distance from a tile to a piece's footprint (0 = on it). */
function distanceTo(
  col: number,
  row: number,
  item: { col: number; row: number; type: string },
): number {
  const { w, h } = footprintOf(item.type);
  const dc = col < item.col ? item.col - col : col >= item.col + w ? col - (item.col + w - 1) : 0;
  const dr = row < item.row ? item.row - row : row >= item.row + h ? row - (item.row + h - 1) : 0;
  return Math.max(dc, dr);
}

/** Standing place next to a piece: below it first (facing it, back to the viewer), then sides, then above. */
const STAND_SIDES: Array<{ dCol: number; dRow: number; dir: Direction }> = [
  { dCol: 0, dRow: 1, dir: Direction.UP },
  { dCol: -1, dRow: 0, dir: Direction.RIGHT },
  { dCol: 1, dRow: 0, dir: Direction.LEFT },
  { dCol: 0, dRow: -1, dir: Direction.DOWN },
];

function standSpotsBy(
  item: { col: number; row: number; type: string },
  seatTiles: Set<string>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): LeisureSpot[] {
  const { w, h } = footprintOf(item.type);
  const solid: Array<{ col: number; row: number }> = [];
  for (let r = item.row; r < item.row + h; r++) {
    for (let c = item.col; c < item.col + w; c++) {
      if (blockedTiles.has(`${c},${r}`)) solid.push({ col: c, row: r });
    }
  }
  for (const side of STAND_SIDES) {
    const spots: LeisureSpot[] = [];
    const seen = new Set<string>();
    for (const t of solid) {
      const col = t.col + side.dCol;
      const row = t.row + side.dRow;
      const key = `${col},${row}`;
      if (seen.has(key) || seatTiles.has(key)) continue;
      if (!isWalkable(col, row, tileMap, blockedTiles)) continue;
      seen.add(key);
      spots.push({ col, row, dir: side.dir, seatUid: null });
    }
    if (spots.length > 0) return spots;
  }
  return [];
}

/**
 * Places for an activity, grouped by the piece they belong to (one group per
 * statue for the gallery; all chairs in one group for the seated ones).
 * Someone's own desk chair is never offered.
 */
export function findLeisureSpots(
  activity: LeisureActivity,
  layout: OfficeLayout,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): LeisureSpot[][] {
  const def = LEISURE_ACTIVITIES[activity];
  const groups: LeisureSpot[][] = [];
  if (def.seats) {
    const chairs: LeisureSpot[] = [];
    for (const [uid, seat] of seats) {
      if (seat.assigned) continue;
      const item = layout.furniture.find((f) => uid === f.uid || uid.startsWith(`${f.uid}:`));
      if (!item) continue;
      const fits = def.seats.some((src) => {
        if (src.type !== item.type) return false;
        if (!src.near) return true;
        return layout.furniture.some(
          (f) =>
            src.near!.includes(f.type) &&
            distanceTo(seat.seatCol, seat.seatRow, f) <= LEISURE_SEAT_REACH_TILES,
        );
      });
      if (fits) {
        chairs.push({ col: seat.seatCol, row: seat.seatRow, dir: seat.facingDir, seatUid: uid });
      }
    }
    if (chairs.length > 0) groups.push(chairs);
  }
  if (def.standBy) {
    const seatTiles = new Set<string>();
    for (const seat of seats.values()) seatTiles.add(`${seat.seatCol},${seat.seatRow}`);
    for (const item of layout.furniture) {
      if (!def.standBy.includes(item.type)) continue;
      const spots = standSpotsBy(item, seatTiles, tileMap, blockedTiles);
      if (spots.length > 0) groups.push(spots);
    }
  }
  return groups;
}

export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick where to go for one activity, or null when every place is taken.
 * `taken` holds "col,row" keys. A tour returns `tourStops` stops at different
 * pieces (fewer if fewer are free); anything else returns one stop.
 */
export function pickLeisureStops(
  activity: LeisureActivity,
  groups: LeisureSpot[][],
  taken: Set<string>,
  tourStops: number,
  from?: { col: number; row: number },
  rand: () => number = Math.random,
): LeisureSpot[] | null {
  const free = groups
    .map((g) => g.filter((s) => !taken.has(`${s.col},${s.row}`)))
    .filter((g) => g.length > 0);
  if (free.length === 0) return null;
  const pickOne = (g: LeisureSpot[]): LeisureSpot => g[Math.floor(rand() * g.length)];
  if (LEISURE_ACTIVITIES[activity].tour) {
    // Walk the hall in one direction, starting from the end nearer to the agent
    const stops = shuffled(free, rand)
      .slice(0, Math.max(1, tourStops))
      .map(pickOne)
      .sort((a, b) => a.col - b.col || a.row - b.row);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (from && Math.abs(from.col - last.col) < Math.abs(from.col - first.col)) stops.reverse();
    return stops;
  }
  return [pickOne(free.flat())];
}

export function isNightOnly(activity: LeisureActivity): boolean {
  return LEISURE_ACTIVITIES[activity].nightOnly === true;
}
