// Where agents go inside a task zone (fork, Fase 3): free chairs first, then
// floor tiles next to furniture (standing at the bench / shelf), then any floor.

import { ZONE_MIN_STAY_SEC, ZONE_SWITCH_DELAY_SEC } from '../../constants.js';
import { isWalkable } from '../layout/tileMap.js';
import type { Character, OfficeLayout, Seat, TileType as TileTypeVal } from '../types.js';
import { Direction } from '../types.js';
import type { ZoneKind } from './taskZones.js';
import { ZoneKind as Zone } from './taskZones.js';

export interface ZoneSpot {
  col: number;
  row: number;
  /** Direction the agent faces while working there. */
  dir: Direction;
  /** Chair uid when the spot is a seat; null = standing. */
  seatUid: string | null;
}

/** Zone kind of the area painted on a tile, or null. */
export function tileZoneKind(layout: OfficeLayout, col: number, row: number): ZoneKind | null {
  const label = layout.areaTiles?.[row * layout.cols + col];
  if (!label) return null;
  return layout.areas?.find((a) => a.label === label)?.zoneKind ?? null;
}

/** The zone an agent wants to be in right now (null = its own desk). */
export function wantedZone(ch: Character): ZoneKind | null {
  if (ch.isSubagent) return Zone.INTERNS;
  if (!ch.isActive) return null;
  if (ch.bubbleType === 'permission') return Zone.PERMISSION;
  if (ch.errorHoldSec > 0) return Zone.ERROR;
  if (ch.bubbleType === 'thinking') return null;
  return ch.activityZone;
}

/**
 * Advance the zone timers; true when the agent should move to `wanted` now.
 * An agent whose turn ended leaves at once; otherwise the new activity must
 * last ZONE_SWITCH_DELAY_SEC and the agent must have spent ZONE_MIN_STAY_SEC
 * where it is.
 */
export function shouldSwitchZone(ch: Character, wanted: ZoneKind | null, dt: number): boolean {
  ch.zoneStaySec += dt;
  if (wanted === ch.zoneAt) {
    ch.zonePendingSec = 0;
    return false;
  }
  ch.zonePendingSec += dt;
  if (!ch.isActive && !ch.isSubagent) return true;
  // A failure is news: go now, not after the usual wait
  if (wanted === Zone.ERROR) return true;
  return ch.zonePendingSec >= ZONE_SWITCH_DELAY_SEC && ch.zoneStaySec >= ZONE_MIN_STAY_SEC;
}

const FACING_ORDER: Array<{ dir: Direction; dCol: number; dRow: number }> = [
  { dir: Direction.UP, dCol: 0, dRow: -1 },
  { dir: Direction.LEFT, dCol: -1, dRow: 0 },
  { dir: Direction.RIGHT, dCol: 1, dRow: 0 },
  { dir: Direction.DOWN, dCol: 0, dRow: 1 },
];

/** Every spot of a zone kind, best tier first: chairs, by furniture, open floor. */
export function findZoneSpots(
  layout: OfficeLayout,
  kind: ZoneKind,
  seats: Map<string, Seat>,
  tileMap: TileTypeVal[][],
  blockedTiles: Set<string>,
): ZoneSpot[][] {
  const chairs: ZoneSpot[] = [];
  const byFurniture: ZoneSpot[] = [];
  const open: ZoneSpot[] = [];
  const seatTiles = new Set<string>();
  for (const [uid, seat] of seats) {
    seatTiles.add(`${seat.seatCol},${seat.seatRow}`);
    if (seat.assigned) continue; // someone's own desk
    if (tileZoneKind(layout, seat.seatCol, seat.seatRow) !== kind) continue;
    chairs.push({ col: seat.seatCol, row: seat.seatRow, dir: seat.facingDir, seatUid: uid });
  }
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (tileZoneKind(layout, col, row) !== kind) continue;
      if (!isWalkable(col, row, tileMap, blockedTiles)) continue;
      const facing = FACING_ORDER.find(({ dCol, dRow }) => {
        const key = `${col + dCol},${row + dRow}`;
        return blockedTiles.has(key) && !seatTiles.has(key);
      });
      if (facing) {
        byFurniture.push({ col, row, dir: facing.dir, seatUid: null });
      } else {
        open.push({ col, row, dir: Direction.DOWN, seatUid: null });
      }
    }
  }
  return [chairs, byFurniture, open].filter((tier) => tier.length > 0);
}

/** Random free spot from the best tier that has one; `taken` holds "col,row" keys. */
export function pickZoneSpot(tiers: ZoneSpot[][], taken: Set<string>): ZoneSpot | null {
  for (const tier of tiers) {
    const free = tier.filter((s) => !taken.has(`${s.col},${s.row}`));
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
  }
  return null;
}
