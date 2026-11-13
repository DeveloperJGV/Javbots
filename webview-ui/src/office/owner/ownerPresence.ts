import {
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  OWNER_CHEER_COOLDOWN_SEC,
  OWNER_COVER_WAIT_SEC,
  OWNER_ENTER_MAX_TILES,
  OWNER_ENTER_MIN_TILES,
  OWNER_EXIT_TYPE_PREFIXES,
  OWNER_FRONT_BIAS_PX,
  OWNER_HURRY_MULT,
  OWNER_ID,
  OWNER_IDLE_EMOTE_CHANCE,
  OWNER_IDLE_EMOTE_SEC,
  OWNER_LEAVE_MAX_SEC,
  OWNER_PANEL_CLICK_WINDOW_SEC,
  OWNER_VISIT_CANDIDATES,
  OWNER_WALL_GAP_ROWS,
  WANDER_PAUSE_MAX_SEC,
} from '../../constants.js';
import { createCharacter, updateCharacter } from '../engine/characters.js';
import { advanceMatrixEffect, startMatrixEffect } from '../engine/matrixEffectState.js';
import { sittingDropPx } from '../engine/posture.js';
import { getCatalogEntry } from '../layout/furnitureCatalog.js';
import { findPath, isWalkable } from '../layout/tileMap.js';
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type { Character, OfficeLayout, Seat, TileType } from '../types.js';
import { CharacterState, Direction, TILE_SIZE } from '../types.js';
import type { OwnerEmote } from './ownerEmotes.js';
import { emoteDurationSec, emoteFrameAt, OwnerEmoteId, setOwnerEmoteFrame } from './ownerEmotes.js';
import { ownerStore } from './ownerStore.js';
import { panelsOpen } from './panelPresence.js';

/**
 * The office's owner: the person the office belongs to, drawn as a character on the floor the page shows.
 * - There only when an asset folder brings an avatar (characterSpritesLoaded.owner) and the setting is on.
 * - Comes in next to the elevator and walks in; strolls and takes the same breaks as a resting agent.
 * - Walks to the piece whose panel was just opened with a click and stays there while a panel is open.
 * - Asked to leave (the page is changing floor), hurries to the elevator and fades out.
 * - With emotes (ownerEmotes.ts): greets when he has come in and when clicked, cheers a finished turn, dances
 *   while the party does and now and then plays an idle one; he stands still, facing front, while it lasts.
 * Not an agent: it lives here, outside OfficeState.characters (like the greeter), so it takes no desk and no
 * consumer of the agent map ever counts it. OfficeState only adds it to what the renderer draws.
 */

interface Tile {
  col: number;
  row: number;
}

/** What the owner needs from the office each frame. */
export interface OwnerWorld {
  layout: OfficeLayout;
  tileMap: TileType[][];
  blockedTiles: Set<string>;
  walkableTiles: Array<Tile>;
  seats: Map<string, Seat>;
  /** "col,row" of the tiles the agents stand on. */
  occupied(): Set<string>;
  /** One frame of free time, as for an agent between turns. */
  leisure(ch: Character, dt: number): void;
  endLeisure(ch: Character): void;
  /** Whether a tile is hidden on screen (behind the elevator plate) with the current camera; absent = never. */
  covered?(tile: Tile): boolean;
  /** Whether `covered` can answer yet (the page registers it after mounting); absent = always. */
  coverReady?(): boolean;
  /** Whether the office party is dancing right now; absent = never. */
  partyDancing?(): boolean;
}

export const OwnerMode = {
  /** Strolling and taking breaks. */
  FREE: 'free',
  /** At (or on the way to) the piece whose panel is open. */
  VISIT: 'visit',
  /** On the way out: the page is changing floor. */
  LEAVING: 'leaving',
} as const;
export type OwnerMode = (typeof OwnerMode)[keyof typeof OwnerMode];

const key = (t: Tile) => `${t.col},${t.row}`;
const centerOf = (t: Tile) => ({
  x: t.col * TILE_SIZE + TILE_SIZE / 2,
  y: t.row * TILE_SIZE + TILE_SIZE / 2,
});

function closestTile(tiles: readonly Tile[], to: Tile): Tile | null {
  let best: Tile | null = null;
  let bestDist = Infinity;
  for (const t of tiles) {
    const d = Math.abs(t.col - to.col) + Math.abs(t.row - to.row);
    if (d < bestDist) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** The avatar's emote with this id, if it has one. */
function findEmote(id: string): OwnerEmote | undefined {
  return ownerStore.get().emotes.find((e) => e.id === id);
}

/** The box he takes on screen standing on `tile` (world px): the same box an agent is hit-tested with. */
export function ownerBoxAt(tile: Tile): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const c = centerOf(tile);
  return {
    left: c.x - CHARACTER_HIT_HALF_WIDTH,
    top: c.y - CHARACTER_HIT_HEIGHT,
    right: c.x + CHARACTER_HIT_HALF_WIDTH,
    bottom: c.y,
  };
}

/**
 * Where the owner comes in and out: in front of the first elevator piece of the layout, else the walkable tile
 * closest to the top-left corner (the elevator plate sits there on screen) that the plate does not hide with the
 * current camera, else simply the closest one. Null when nothing is walkable.
 */
export function ownerExitTile(
  world: Pick<OwnerWorld, 'layout' | 'walkableTiles' | 'covered'>,
): Tile | null {
  for (const item of world.layout.furniture) {
    if (!OWNER_EXIT_TYPE_PREFIXES.some((p) => item.type.startsWith(p))) continue;
    const entry = getCatalogEntry(item.type);
    const front = {
      col: item.col + Math.floor((entry?.footprintW ?? 1) / 2),
      row: item.row + (entry?.footprintH ?? 1),
    };
    const tile = closestTile(world.walkableTiles, front);
    if (tile) return tile;
  }
  const corner = { col: 0, row: 0 };
  const covered = world.covered;
  if (covered) {
    // Stable sort: ties keep the order closestTile would pick from
    const byDistance = [...world.walkableTiles].sort((a, b) => a.col + a.row - (b.col + b.row));
    const visible = byDistance.find((t) => !covered(t));
    if (visible) return visible;
  }
  return closestTile(world.walkableTiles, corner);
}

/** The wall piece (canPlaceOnWalls) whose footprint holds a world point: its box in world px and its bottom row. */
function wallPieceAt(
  layout: OfficeLayout,
  at: { x: number; y: number },
): { left: number; right: number; top: number; bottomRow: number } | null {
  const col = Math.floor(at.x / TILE_SIZE);
  const row = Math.floor(at.y / TILE_SIZE);
  for (const item of layout.furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry?.canPlaceOnWalls) continue;
    const w = entry.footprintW;
    const h = entry.footprintH;
    if (col < item.col || col >= item.col + w || row < item.row || row >= item.row + h) continue;
    return {
      left: item.col * TILE_SIZE,
      right: (item.col + w) * TILE_SIZE,
      top: item.row * TILE_SIZE,
      bottomRow: item.row + h - 1,
    };
  }
  return null;
}

export class OwnerPresence {
  /** The owner's character while it is on this floor. */
  ch: Character | null = null;
  private mode: OwnerMode = OwnerMode.FREE;
  /** Last click on the office (world px) and how long ago. */
  private click: { x: number; y: number; age: number } | null = null;
  private panelsWereOpen = false;
  /** The clicked point he is visiting (world px): he faces it once there. */
  private visiting: { x: number; y: number } | null = null;
  private leaveSec = 0;
  private leaveStarted = false;
  private leaveDone: Array<() => void> = [];
  /** Left for another floor: he does not come back in on this page. */
  private gone = false;
  /** How long he has waited to come in for the page to say what covers the canvas. */
  private coverWaitSec = 0;
  /** The emote playing: how far in, where he faced before it, and whether it is the party's dance. */
  private emote: { def: OwnerEmote; sec: number; dir: Character['dir']; forParty: boolean } | null =
    null;
  /** Greets once he is done walking in. */
  private greetOnArrival = false;
  /** Asked from outside, played on the next frame. */
  private greetAsked = false;
  private cheerAsked = false;
  /** Time since his last cheer (they keep OWNER_CHEER_COOLDOWN_SEC apart). */
  private sinceCheer = Infinity;
  /** Time standing still with no panel open (an idle emote may follow). */
  private stillSec = 0;
  private lastIdle: string | null = null;

  getMode(): OwnerMode {
    return this.mode;
  }

  /** The id of the emote he is playing, or null. */
  getEmote(): string | null {
    return this.emote?.def.id ?? null;
  }

  /** An agent finished its turn: if he is free (and has not cheered lately) he cheers on the next frame. */
  noteTurnEnd(): void {
    if (this.ch) this.cheerAsked = true;
  }

  /** A click on him: he greets. False without him or without a greet emote (the click goes on as before). */
  noteOwnerClick(): boolean {
    if (!this.ch || this.mode === OwnerMode.LEAVING || !findEmote(OwnerEmoteId.GREET)) return false;
    this.greetAsked = true;
    return true;
  }

  /** A click on the office outside edit mode: if a panel opens right after, that is where he goes. */
  noteClick(worldX: number, worldY: number): void {
    this.click = { x: worldX, y: worldY, age: 0 };
  }

  /**
   * The page is about to show another floor: he hurries to the elevator, fades out, and only then `done` runs
   * (once). Without him there, `done` runs right away.
   */
  leave(done: () => void): void {
    this.gone = true;
    if (this.ch) this.stopEmote(this.ch);
    this.greetOnArrival = false;
    if (!this.ch) {
      done();
      return;
    }
    this.leaveDone.push(done);
    if (this.mode === OwnerMode.LEAVING) return;
    this.mode = OwnerMode.LEAVING;
    this.leaveSec = 0;
    this.leaveStarted = false;
    this.visiting = null;
  }

  /** Whether a world point lands on him (same box as an agent's). */
  isAt(worldX: number, worldY: number): boolean {
    const ch = this.ch;
    if (!ch || ch.matrixEffect === 'despawn') return false;
    const anchorY = ch.y + sittingDropPx(ch);
    return (
      worldX >= ch.x - CHARACTER_HIT_HALF_WIDTH &&
      worldX <= ch.x + CHARACTER_HIT_HALF_WIDTH &&
      worldY >= anchorY - CHARACTER_HIT_HEIGHT &&
      worldY <= anchorY
    );
  }

  /** The layout changed (editor, another window): follow a grid shift and step off a tile that got blocked. */
  layoutChanged(world: OwnerWorld, shift?: Tile): void {
    const ch = this.ch;
    if (!ch) return;
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      ch.tileCol += shift.col;
      ch.tileRow += shift.row;
      ch.x += shift.col * TILE_SIZE;
      ch.y += shift.row * TILE_SIZE;
    }
    // Paths, the break he was on and the piece he was at may be gone with the old layout
    this.stopEmote(ch);
    this.place(ch, { col: ch.tileCol, row: ch.tileRow });
    if (ch.state === CharacterState.WALK) ch.state = CharacterState.IDLE;
    world.endLeisure(ch);
    this.visiting = null;
    if (this.mode === OwnerMode.VISIT) this.mode = OwnerMode.FREE;
    if (isWalkable(ch.tileCol, ch.tileRow, world.tileMap, world.blockedTiles)) return;
    const tile = closestTile(world.walkableTiles, { col: ch.tileCol, row: ch.tileRow });
    if (tile) this.place(ch, tile);
  }

  update(dt: number, world: OwnerWorld): void {
    if (this.click) this.click.age += dt;
    const open = panelsOpen() > 0;
    const justOpened = open && !this.panelsWereOpen;
    this.panelsWereOpen = open;

    const { sheet, enabled } = ownerStore.get();
    const wanted = enabled && sheet !== undefined && sheet < getLoadedCharacterCount();
    if (!this.ch) {
      if (!wanted || this.gone) return;
      // The first frames can run before the page says where the elevator plate is: wait for it, briefly
      if (world.coverReady && !world.coverReady() && this.coverWaitSec < OWNER_COVER_WAIT_SEC) {
        this.coverWaitSec += dt;
        return;
      }
      this.enter(sheet, world);
      return;
    }
    const ch = this.ch;
    const effect = advanceMatrixEffect(ch, dt);
    if (effect === 'despawned') {
      this.ch = null;
      this.mode = OwnerMode.FREE;
      this.visiting = null;
      for (const done of this.leaveDone.splice(0)) done();
      return;
    }
    if (effect !== 'none') return; // still fading in or out
    if (wanted) ch.palette = sheet; // the sheets may have been reloaded

    if (this.mode === OwnerMode.LEAVING) {
      this.updateLeaving(ch, dt, world);
      return;
    }
    if (!wanted) {
      // Turned off (or the avatar is gone): fade out where he stands
      this.stopEmote(ch);
      world.endLeisure(ch);
      startMatrixEffect(ch, 'despawn');
      return;
    }

    if (justOpened && this.click && this.click.age <= OWNER_PANEL_CLICK_WINDOW_SEC) {
      // He has to walk: whatever he was playing stops
      this.stopEmote(ch);
      this.greetOnArrival = false;
      this.startVisit(ch, this.click, world);
    }

    // Emotes: asked ones first (a click on him beats anything), then the one playing, frozen in place
    this.sinceCheer += dt;
    const greet = this.greetAsked;
    const cheer = this.cheerAsked;
    this.greetAsked = false;
    this.cheerAsked = false;
    if (greet) {
      this.startEmote(ch, OwnerEmoteId.GREET, world);
    } else if (
      cheer &&
      this.mode === OwnerMode.FREE &&
      !this.emote &&
      ch.state !== CharacterState.TYPE &&
      this.sinceCheer >= OWNER_CHEER_COOLDOWN_SEC &&
      this.startEmote(ch, OwnerEmoteId.CHEER, world)
    ) {
      this.sinceCheer = 0;
    }
    if (this.emote && this.tickEmote(ch, dt, world)) return;

    if (this.mode === OwnerMode.VISIT) {
      if (open) {
        this.updateVisit(ch, dt, world);
        return;
      }
      this.mode = OwnerMode.FREE;
      this.visiting = null;
    }

    if (world.partyDancing?.() && this.startEmote(ch, OwnerEmoteId.DANCE, world, true)) return;
    if (this.greetOnArrival && ch.state !== CharacterState.WALK) {
      this.greetOnArrival = false;
      if (this.startEmote(ch, OwnerEmoteId.GREET, world)) return;
    }
    if (this.idleEmote(ch, dt, open, world)) return;

    world.leisure(ch, dt);
    updateCharacter(
      ch,
      dt,
      this.strollTiles(ch, dt, world),
      world.seats,
      world.tileMap,
      world.blockedTiles,
    );
  }

  /** Starts emote `id` (replacing the one playing) if the avatar has it. Seated, he gets up first. */
  private startEmote(ch: Character, id: string, world: OwnerWorld, forParty = false): boolean {
    const def = findEmote(id);
    if (!def) return false;
    if (ch.state === CharacterState.TYPE) {
      world.endLeisure(ch);
      if (ch.state === CharacterState.TYPE) ch.state = CharacterState.IDLE;
    }
    const dir = this.emote ? this.emote.dir : ch.dir;
    this.emote = { def, sec: 0, dir, forParty };
    ch.dir = Direction.DOWN;
    this.stillSec = 0;
    setOwnerEmoteFrame(ch, emoteFrameAt(def, 0));
    return true;
  }

  /** One frame of the emote playing: true while it lasts (the party's dance lasts as long as the party). */
  private tickEmote(ch: Character, dt: number, world: OwnerWorld): boolean {
    const e = this.emote!;
    const partyOn = world.partyDancing?.() ?? false;
    if (e.forParty && !partyOn) {
      this.stopEmote(ch);
      return false;
    }
    e.sec += dt;
    const total = emoteDurationSec(e.def);
    if (e.sec >= total) {
      if (!e.forParty) {
        this.stopEmote(ch);
        return false;
      }
      e.sec %= total;
    }
    ch.dir = Direction.DOWN;
    setOwnerEmoteFrame(ch, emoteFrameAt(e.def, e.sec));
    return true;
  }

  /** Ends the emote playing (if any): back to his own frame, facing as before. */
  private stopEmote(ch: Character): void {
    if (!this.emote) return;
    ch.dir = this.emote.dir;
    this.emote = null;
    setOwnerEmoteFrame(ch, null);
  }

  /**
   * Standing still with no panel open for OWNER_IDLE_EMOTE_SEC, he may (OWNER_IDLE_EMOTE_CHANCE) play one of the
   * `idle` emotes, never the same one twice in a row when there is another.
   */
  private idleEmote(ch: Character, dt: number, open: boolean, world: OwnerWorld): boolean {
    if (open || ch.state !== CharacterState.IDLE) {
      this.stillSec = 0;
      return false;
    }
    this.stillSec += dt;
    if (this.stillSec < OWNER_IDLE_EMOTE_SEC) return false;
    this.stillSec = 0;
    if (Math.random() >= OWNER_IDLE_EMOTE_CHANCE) return false;
    const pool = ownerStore.get().emotes.filter((e) => e.idle);
    const fresh = pool.filter((e) => e.id !== this.lastIdle);
    const options = fresh.length > 0 ? fresh : pool;
    const pick = options[Math.floor(Math.random() * options.length)];
    if (!pick) return false;
    this.lastIdle = pick.id;
    return this.startEmote(ch, pick.id, world);
  }

  /**
   * Where he may stroll to: tiles he can be seen on (never behind the elevator plate nor off the view). Only the
   * frame a stroll picks its spot needs them (characters.ts, when the wander timer runs out).
   */
  private strollTiles(ch: Character, dt: number, world: OwnerWorld): Tile[] {
    const covered = world.covered;
    if (!covered || ch.state !== CharacterState.IDLE || ch.leisure || ch.wanderTimer - dt > 0) {
      return world.walkableTiles;
    }
    const visible = world.walkableTiles.filter((t) => !covered(t));
    return visible.length > 0 ? visible : world.walkableTiles;
  }

  /** Appears next to the elevator and walks a few tiles in. */
  private enter(sheet: number, world: OwnerWorld): void {
    const exit = ownerExitTile(world);
    if (!exit) return;
    const ch = createCharacter(OWNER_ID, sheet, null, null, 0);
    ch.isOwner = true;
    ch.isActive = false;
    ch.state = CharacterState.IDLE;
    ch.dir = Direction.DOWN;
    this.place(ch, exit);
    const occupied = world.occupied();
    const reach = world.walkableTiles.filter((t) => {
      const d = Math.abs(t.col - exit.col) + Math.abs(t.row - exit.row);
      return d >= OWNER_ENTER_MIN_TILES && d <= OWNER_ENTER_MAX_TILES && !occupied.has(key(t));
    });
    // He walks in to where he can be seen: not behind the elevator plate, not off the view
    const covered = world.covered;
    const seen = covered ? reach.filter((t) => !covered(t)) : reach;
    const pool = seen.length > 0 ? seen : reach;
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (target) this.walkTo(ch, target, world);
    startMatrixEffect(ch, 'spawn');
    this.ch = ch;
    this.mode = OwnerMode.FREE;
    this.visiting = null;
    this.emote = null;
    this.greetOnArrival = true;
    this.greetAsked = false;
    this.cheerAsked = false;
    this.stillSec = 0;
  }

  /** Off to the free tile closest to the clicked point, the one in front of the piece first. */
  private startVisit(ch: Character, at: { x: number; y: number }, world: OwnerWorld): void {
    const occupied = world.occupied();
    const wall = wallPieceAt(world.layout, at);
    if (wall && this.startWallVisit(ch, wall, occupied, world)) return;
    const candidates = world.walkableTiles
      .filter((t) => !occupied.has(key(t)))
      .map((t) => {
        const c = centerOf(t);
        const front = c.y > at.y ? OWNER_FRONT_BIAS_PX : 0;
        return { tile: t, cost: Math.hypot(c.x - at.x, c.y - at.y) - front };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, OWNER_VISIT_CANDIDATES);
    // Drop the break he was on and get up before walking
    world.endLeisure(ch);
    if (ch.state === CharacterState.TYPE) ch.state = CharacterState.IDLE;
    for (const { tile } of candidates) {
      if (this.walkTo(ch, tile, world)) {
        this.mode = OwnerMode.VISIT;
        this.visiting = { x: at.x, y: at.y };
        return;
      }
    }
    // No way there: he stays where he is
  }

  /**
   * A piece hung on the wall: standing right under it, his head would cover it. He stands lower, on the closest
   * free tile at least OWNER_WALL_GAP_ROWS below its bottom row, facing up at it.
   */
  private startWallVisit(
    ch: Character,
    wall: { left: number; right: number; top: number; bottomRow: number },
    occupied: Set<string>,
    world: OwnerWorld,
  ): boolean {
    const midX = (wall.left + wall.right) / 2;
    const candidates = world.walkableTiles
      .filter((t) => !occupied.has(key(t)) && t.row >= wall.bottomRow + OWNER_WALL_GAP_ROWS)
      .map((t) => {
        const c = centerOf(t);
        const below = t.row - wall.bottomRow - OWNER_WALL_GAP_ROWS;
        return { tile: t, cost: below * TILE_SIZE * 2 + Math.abs(c.x - midX) };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, OWNER_VISIT_CANDIDATES);
    world.endLeisure(ch);
    if (ch.state === CharacterState.TYPE) ch.state = CharacterState.IDLE;
    for (const { tile } of candidates) {
      if (this.walkTo(ch, tile, world)) {
        this.mode = OwnerMode.VISIT;
        // Straight above his tile: once there he faces up, at the piece
        this.visiting = { x: centerOf(tile).x, y: wall.top };
        return true;
      }
    }
    return false;
  }

  private updateVisit(ch: Character, dt: number, world: OwnerWorld): void {
    if (ch.state !== CharacterState.WALK) {
      // There: stand still (the stroll timer never runs out), looking at the piece
      ch.state = CharacterState.IDLE;
      ch.wanderTimer = WANDER_PAUSE_MAX_SEC;
    }
    updateCharacter(ch, dt, world.walkableTiles, world.seats, world.tileMap, world.blockedTiles);
    if (ch.state !== CharacterState.WALK && this.visiting) this.face(ch, this.visiting);
  }

  private updateLeaving(ch: Character, dt: number, world: OwnerWorld): void {
    if (!this.leaveStarted) {
      this.leaveStarted = true;
      world.endLeisure(ch);
      if (ch.state === CharacterState.TYPE) ch.state = CharacterState.IDLE;
      const exit = ownerExitTile(world);
      if (!exit || !this.walkTo(ch, exit, world)) ch.state = CharacterState.IDLE;
    }
    this.leaveSec += dt;
    if (ch.state === CharacterState.WALK && this.leaveSec < OWNER_LEAVE_MAX_SEC) {
      updateCharacter(
        ch,
        dt * OWNER_HURRY_MULT,
        world.walkableTiles,
        world.seats,
        world.tileMap,
        world.blockedTiles,
      );
      if (ch.state === CharacterState.WALK) return;
    }
    startMatrixEffect(ch, 'despawn');
  }

  /**
   * Starts a walk to `to`, finishing the step under way first. True when he is on his way or already there;
   * false when there is no path.
   */
  private walkTo(ch: Character, to: Tile, world: OwnerWorld): boolean {
    const midStep = ch.state === CharacterState.WALK && ch.path.length > 0 && ch.moveProgress > 0;
    const from = midStep ? ch.path[0] : { col: ch.tileCol, row: ch.tileRow };
    const there = from.col === to.col && from.row === to.row;
    const path = there
      ? []
      : findPath(from.col, from.row, to.col, to.row, world.tileMap, world.blockedTiles);
    if (path.length === 0 && !there) return false;
    ch.path = midStep ? [from, ...path] : path;
    if (!midStep) ch.moveProgress = 0;
    if (ch.path.length === 0) {
      if (ch.state === CharacterState.WALK) ch.state = CharacterState.IDLE;
      return true;
    }
    if (ch.state !== CharacterState.WALK) {
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
    return true;
  }

  private face(ch: Character, at: { x: number; y: number }): void {
    const dx = at.x - ch.x;
    const dy = at.y - ch.y;
    if (Math.abs(dx) > Math.abs(dy)) ch.dir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
    else ch.dir = dy > 0 ? Direction.DOWN : Direction.UP;
  }

  private place(ch: Character, tile: Tile): void {
    const c = centerOf(tile);
    ch.tileCol = tile.col;
    ch.tileRow = tile.row;
    ch.x = c.x;
    ch.y = c.y;
    ch.path = [];
    ch.moveProgress = 0;
  }
}
