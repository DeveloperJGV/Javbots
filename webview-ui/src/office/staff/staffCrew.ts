import {
  STAFF_BOX_COLORS,
  STAFF_BOX_LIFT_PX,
  STAFF_BOX_SIDE_PX,
  STAFF_HANDOFF_SEC,
  STAFF_NEAREST_TILE_RADIUS,
  STAFF_PATROL_CHECK_SEC,
  STAFF_PAUSE_MAX_SEC,
  STAFF_PAUSE_MIN_SEC,
  STAFF_WALK_SPEED_PX_PER_SEC,
  STAFF_WANDER_RADIUS,
  STAFF_WORK_FRAME_DURATION_SEC,
  STAFF_WORK_MAX_SEC,
  STAFF_WORK_MIN_SEC,
  WALK_FRAME_DURATION_SEC,
} from '../../constants.js';
import type { StaffRole } from '../../packs/registry.js';
import { findPath, isWalkable } from '../layout/tileMap.js';
import { characterSheetIndex, getCharacterSprites } from '../sprites/spriteData.js';
import type { FurnitureInstance, PlacedFurniture, SpriteData, TileType } from '../types.js';
import { Direction, TILE_SIZE } from '../types.js';

/**
 * Walking staff: each placed piece whose type a private pack registers (WebviewPack.staff) is drawn as a person
 * that walks with the pack's named character sheet.
 * - Workers work at the spot they were placed, stroll nearby and come back. When the pack asks for a delivery
 *   (`carry`), a free worker picks a box up at one tile and takes it to the other.
 * - Guards keep their post; on an alarm (`alarm`) they walk to a tile, check it and come back.
 * - Keepers work and stroll like workers but never carry boxes.
 * Not agents: no seat, no label, no click. The placed furniture stays the editor handle, so the user moves them like
 * any other piece; a layout change cancels the pending deliveries.
 */
type Phase = 'work' | 'walk' | 'pause';

interface Tile {
  col: number;
  row: number;
}

/** A delivery (pick up at `from`, put down at `to`) or, for a guard, a patrol (check `to`, come back). */
interface Job {
  kind: 'carry' | 'patrol';
  from: Tile;
  to: Tile;
  /** fetch = walking to `from`; deliver = carrying to `to` (a patrol only has the deliver leg). */
  stage: 'fetch' | 'deliver';
}

interface Worker {
  uid: string;
  /** The placed piece he comes from. */
  type: string;
  /** Named character sheet (resolved when drawn: the sheets may load after the layout). */
  sheet: string;
  homeCol: number;
  homeRow: number;
  col: number;
  row: number;
  /** Pixel center of the tile he stands on (feet), like agents. */
  x: number;
  y: number;
  dir: Direction;
  phase: Phase;
  timer: number;
  frameTimer: number;
  path: Tile[];
  goingHome: boolean;
  job: Job | null;
  carrying: boolean;
  /** Keeps his post: never strolls or carries, answers alarms. */
  guard: boolean;
  /** Carries boxes between pieces (workers only). */
  carries: boolean;
  /** Busy at his post: no strolls until it ends. */
  busy: boolean;
}

/** Marks the crew's drawables in the furniture list (they are replaced every frame). */
export const STAFF_INSTANCE = 'STAFF_CREW';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const center = (col: number, row: number) => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

/** His home tile: the walkable bottom-left tile of the 2×2 piece (the top row is background). */
function homeOf(item: PlacedFurniture): Tile {
  return { col: item.col, row: item.row + 1 };
}

/** 8×7 cardboard box with a gold ribbon, drawn by code. */
function boxSprite(): SpriteData {
  const { outline: o, cardboard: c, shade: s, ribbon: r } = STAFF_BOX_COLORS;
  const _ = '';
  return [
    [_, o, o, o, o, o, o, _],
    [o, c, c, r, r, c, c, o],
    [o, r, r, r, r, r, r, o],
    [o, c, c, r, r, c, c, o],
    [o, c, c, r, r, c, c, o],
    [o, s, s, r, r, s, s, o],
    [_, o, o, o, o, o, o, _],
  ];
}
const BOX = boxSprite();

/** Closest walkable tile to (col,row) within a radius (BFS ring by ring), or null. */
export function nearestWalkable(
  col: number,
  row: number,
  tileMap: TileType[][],
  blocked: Set<string>,
): Tile | null {
  for (let r = 0; r <= STAFF_NEAREST_TILE_RADIUS; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        if (isWalkable(col + dc, row + dr, tileMap, blocked))
          return { col: col + dc, row: row + dr };
      }
    }
  }
  return null;
}

export class StaffCrew {
  private workers: Worker[] = [];
  private queue: Array<{ from: Tile; to: Tile }> = [];

  /** Keeps workers that still exist (by uid) where they are; adds new ones at home. */
  rebuild(furniture: readonly PlacedFurniture[], roles: ReadonlyMap<string, StaffRole>): void {
    const prev = new Map(this.workers.map((w) => [w.uid, w]));
    this.workers = [];
    // The plan changed: pending deliveries point at old tiles, and paths may cross new furniture.
    this.queue = [];
    for (const item of furniture) {
      const role = roles.get(item.type);
      if (!role) continue;
      const sheet = role.sheet;
      const kind = role.role ?? 'worker';
      const home = homeOf(item);
      const old = prev.get(item.uid);
      if (old && old.homeCol === home.col && old.homeRow === home.row && old.sheet === sheet) {
        // Put the box down and head home from where he stands
        old.job = null;
        old.carrying = false;
        old.path = [];
        old.phase = 'pause';
        old.timer = 0;
        this.workers.push(old);
        continue;
      }
      this.workers.push({
        uid: item.uid,
        type: item.type,
        sheet,
        homeCol: home.col,
        homeRow: home.row,
        col: home.col,
        row: home.row,
        ...center(home.col, home.row),
        dir: Direction.DOWN,
        phase: 'work',
        timer: rand(STAFF_WORK_MIN_SEC, STAFF_WORK_MAX_SEC),
        frameTimer: Math.random(),
        path: [],
        goingHome: false,
        job: null,
        carrying: false,
        guard: kind === 'guard',
        carries: kind === 'worker',
        busy: false,
      });
    }
  }

  get size(): number {
    return this.workers.length;
  }

  /** Whether pieces of this type are drawn as a worker (so not as still furniture): its sheet is loaded. */
  draws(type: string | undefined): boolean {
    return this.workers.some((w) => w.type === type && characterSheetIndex(w.sheet) !== undefined);
  }

  /** Where the first worker of that piece stands (pixel center of his feet), or null. */
  positionOf(type: string): { x: number; y: number } | null {
    const w = this.workers.find((k) => k.type === type);
    return w ? { x: w.x, y: w.y } : null;
  }

  /** Keeps every worker of that piece at his post (walking back first) while `busy`. */
  setBusy(type: string, busy: boolean): void {
    for (const w of this.workers) if (w.type === type) w.busy = busy;
  }

  /** Ask for a box to be carried between two tiles (already walkable). Queued until a worker is free. */
  carry(from: Tile, to: Tile): void {
    if (this.workers.some((w) => w.carries)) this.queue.push({ from, to });
  }

  /** The alarm: every guard at his post walks to `to`, checks it for a moment and goes back. */
  alarm(to: Tile, tileMap: TileType[][], blocked: Set<string>): boolean {
    let sent = false;
    for (const w of this.workers) {
      if (!w.guard || w.job) continue;
      w.job = { kind: 'patrol', from: to, to, stage: 'deliver' };
      if (this.walkTo(w, to.col, to.row, tileMap, blocked, false)) sent = true;
      else if (w.col === to.col && w.row === to.row) {
        this.onArrive(w);
        sent = true;
      } else w.job = null;
    }
    return sent;
  }

  update(dt: number, tileMap: TileType[][], blocked: Set<string>): void {
    for (const w of this.workers) {
      w.frameTimer += dt;
      if (w.phase === 'walk') {
        this.step(w, dt);
        continue;
      }
      // A free worker takes the next delivery (even mid-break)
      if (w.carries && !w.job && this.queue.length) {
        const next = this.queue.shift()!;
        w.job = { kind: 'carry', ...next, stage: 'fetch' };
        if (!this.walkTo(w, next.from.col, next.from.row, tileMap, blocked, false)) {
          // Already there → pick it up; no way there → give the delivery up
          if (w.col === next.from.col && w.row === next.from.row) this.onArrive(w);
          else w.job = null;
        }
        continue;
      }
      if (w.busy && !w.job) {
        // At his post, working, until it ends
        const home = w.col === w.homeCol && w.row === w.homeRow;
        if (!home && this.walkTo(w, w.homeCol, w.homeRow, tileMap, blocked, true)) continue;
        if (w.phase !== 'work') this.startWork(w);
        w.timer = Math.max(w.timer, STAFF_WORK_MIN_SEC);
        continue;
      }
      w.timer -= dt;
      if (w.timer > 0) continue;
      if (w.job) this.handOff(w, tileMap, blocked);
      else if (w.phase === 'work' && w.guard)
        w.timer = rand(STAFF_WORK_MIN_SEC, STAFF_WORK_MAX_SEC);
      else if (w.phase === 'work') this.stroll(w, tileMap, blocked);
      else if (!this.walkTo(w, w.homeCol, w.homeRow, tileMap, blocked, true)) this.startWork(w);
    }
  }

  /** Off to a random walkable tile near home. */
  private stroll(w: Worker, tileMap: TileType[][], blocked: Set<string>): void {
    const options: Tile[] = [];
    for (let dr = -STAFF_WANDER_RADIUS; dr <= STAFF_WANDER_RADIUS; dr++) {
      for (let dc = -STAFF_WANDER_RADIUS; dc <= STAFF_WANDER_RADIUS; dc++) {
        if (Math.abs(dc) + Math.abs(dr) > STAFF_WANDER_RADIUS || (dc === 0 && dr === 0)) continue;
        const col = w.homeCol + dc;
        const row = w.homeRow + dr;
        if (isWalkable(col, row, tileMap, blocked)) options.push({ col, row });
      }
    }
    const target = options[Math.floor(Math.random() * options.length)];
    if (!target || !this.walkTo(w, target.col, target.row, tileMap, blocked, false)) {
      w.phase = 'work';
      w.timer = rand(STAFF_WORK_MIN_SEC, STAFF_WORK_MAX_SEC);
    }
  }

  /** Starts a walk; false when there is no path (or he is already there). */
  private walkTo(
    w: Worker,
    col: number,
    row: number,
    tileMap: TileType[][],
    blocked: Set<string>,
    goingHome: boolean,
  ): boolean {
    // His own home tile may sit under his own piece: let the path finish there.
    const free = new Set(blocked);
    free.delete(`${w.homeCol},${w.homeRow}`);
    free.delete(`${w.col},${w.row}`);
    const path = findPath(w.col, w.row, col, row, tileMap, free);
    if (path.length === 0) return false;
    w.path = path;
    w.goingHome = goingHome;
    w.phase = 'walk';
    return true;
  }

  private startWork(w: Worker): void {
    w.phase = 'work';
    w.dir = Direction.DOWN;
    w.timer = rand(STAFF_WORK_MIN_SEC, STAFF_WORK_MAX_SEC);
  }

  /** End of a walk: hand-off pause on a delivery, back to work at home, or a short break. */
  private onArrive(w: Worker): void {
    if (w.job) {
      w.phase = 'pause';
      w.dir = Direction.UP;
      w.timer = w.job.kind === 'patrol' ? STAFF_PATROL_CHECK_SEC : STAFF_HANDOFF_SEC;
    } else if (w.goingHome) {
      this.startWork(w);
    } else {
      w.phase = 'pause';
      w.timer = rand(STAFF_PAUSE_MIN_SEC, STAFF_PAUSE_MAX_SEC);
    }
  }

  /** No way to finish the job: leave the box and go home. */
  private giveUp(w: Worker, tileMap: TileType[][], blocked: Set<string>): void {
    w.job = null;
    w.carrying = false;
    if (!this.walkTo(w, w.homeCol, w.homeRow, tileMap, blocked, true)) this.startWork(w);
  }

  /** The hand-off pause is over: pick the box up and carry it, or put it down and go home. */
  private handOff(w: Worker, tileMap: TileType[][], blocked: Set<string>): void {
    const job = w.job!;
    if (job.kind === 'carry' && job.stage === 'fetch') {
      w.carrying = true;
      job.stage = 'deliver';
      if (!this.walkTo(w, job.to.col, job.to.row, tileMap, blocked, false)) {
        if (w.col === job.to.col && w.row === job.to.row) this.onArrive(w);
        else this.giveUp(w, tileMap, blocked);
      }
      return;
    }
    w.carrying = false;
    w.job = null;
    if (!this.walkTo(w, w.homeCol, w.homeRow, tileMap, blocked, true)) this.startWork(w);
  }

  private step(w: Worker, dt: number): void {
    const next = w.path[0];
    if (!next) {
      this.onArrive(w);
      return;
    }
    const target = center(next.col, next.row);
    const dx = target.x - w.x;
    const dy = target.y - w.y;
    if (Math.abs(dx) > Math.abs(dy)) w.dir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
    else if (dy !== 0) w.dir = dy > 0 ? Direction.DOWN : Direction.UP;
    const dist = Math.hypot(dx, dy);
    const move = STAFF_WALK_SPEED_PX_PER_SEC * dt;
    if (dist <= move) {
      w.x = target.x;
      w.y = target.y;
      w.col = next.col;
      w.row = next.row;
      w.path.shift();
      if (w.path.length === 0) this.onArrive(w);
    } else {
      w.x += (dx / dist) * move;
      w.y += (dy / dist) * move;
    }
  }

  /** Drawables: each worker (z-sorted like an agent) and the box he carries. */
  instances(): FurnitureInstance[] {
    const out: FurnitureInstance[] = [];
    for (const w of this.workers) {
      const sheet = characterSheetIndex(w.sheet);
      if (sheet === undefined) continue;
      const sprites = getCharacterSprites(sheet);
      let sprite;
      if (w.phase === 'walk') {
        sprite = sprites.walk[w.dir][Math.floor(w.frameTimer / WALK_FRAME_DURATION_SEC) % 4];
      } else if (w.phase === 'work') {
        sprite =
          sprites.typing[w.dir][Math.floor(w.frameTimer / STAFF_WORK_FRAME_DURATION_SEC) % 2];
      } else {
        sprite = sprites.reading[w.dir][0];
      }
      const width = sprite[0]?.length ?? 0;
      const zY = w.y + TILE_SIZE / 2 + 0.5;
      out.push({
        sprite,
        x: Math.round(w.x - width / 2),
        y: Math.round(w.y - sprite.length),
        zY,
        type: STAFF_INSTANCE,
        castsShadow: true,
      });
      if (w.carrying) {
        // In his hands: in front when facing down or sideways, hidden behind him when facing up
        const side =
          w.dir === Direction.RIGHT
            ? STAFF_BOX_SIDE_PX
            : w.dir === Direction.LEFT
              ? -STAFF_BOX_SIDE_PX
              : 0;
        out.push({
          sprite: BOX,
          x: Math.round(w.x - BOX[0].length / 2 + side),
          y: Math.round(w.y - STAFF_BOX_LIFT_PX),
          zY: w.dir === Direction.UP ? zY - 0.1 : zY + 0.1,
          type: STAFF_INSTANCE,
        });
      }
    }
    return out;
  }
}
