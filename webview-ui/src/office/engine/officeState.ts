import { pickDiversePalette } from '../../../../core/src/paletteUtils.js';
import {
  applyMusicFurniture,
  MusicNotes,
} from '../../../../features/musica/webview/musicFurniture.js';
import { musicStore } from '../../../../features/musica/webview/musicStore.js';
import {
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  BOARD_FURNITURE_TYPE,
  BOSS_INTERNS,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  CHEER_SEC,
  CONFETTI_RAIN_SPAWN_SEC,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  FURNITURE_ANIM_INTERVAL_SEC,
  GREETER_ID,
  GREETER_TILE_MARGIN,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  INTERN_LEAVE_MAX_SEC,
  INTERN_REST_MAX_SEC,
  INTERN_REST_MIN_SEC,
  ISAAC_AFRO_ROWS,
  ISAAC_AFRO_SIDE,
  ISAAC_CONFETTI_EVERY_STEPS,
  ISAAC_FURNITURE_TYPE,
  LEISURE_ACTIVITY_MAX_SEC,
  LEISURE_ACTIVITY_MIN_SEC,
  LEISURE_NIGHT_LIGHTS_MIN,
  LEISURE_RETRY_SEC,
  LEISURE_START_SEC,
  LEISURE_TOUR_STOPS_MAX,
  LEISURE_TOUR_STOPS_MIN,
  LEISURE_WANDER_CHANCE,
  LEISURE_WANDER_MAX_SEC,
  LEISURE_WANDER_MIN_SEC,
  MAX_PET_ID_LENGTH,
  PALETTE_COUNT,
  PARTY_GATHER_MAX_SEC,
  PARTY_MIN_WORKERS,
  PARTY_SEC,
  PET_HIT_HALF_WIDTH,
  PET_HIT_HEIGHT,
  SPARK_HEAD_HEIGHT_PX,
  TEAR_EYE_HEIGHT_PX,
  TELEPORT_BEAM_ORIGIN_X,
  TELEPORT_BEAM_ORIGIN_Y,
  WAITING_BUBBLE_DURATION_SEC,
  ZONE_ERROR_COOLDOWN_SEC,
  ZONE_ERROR_HOLD_SEC,
} from '../../constants.js';
import { ActivityLog } from '../board/activityLog.js';
import { boardSprite } from '../board/boardSprite.js';
import { applyAmbientAnimation } from '../effects/ambientFurniture.js';
import { areParticlesEnabled, getDayNightMode } from '../effects/effectsSettings.js';
import { currentAmbient } from '../effects/lighting.js';
import { ParticleSystem } from '../effects/particles.js';
import {
  createIsaacDance,
  isaacDanceFrame,
  isaacDancePose,
  isaacDanceSprite,
  type IsaacPoke,
  pokeIsaac,
} from '../isaac/isaacDance.js';
import { getAnimationFrames, getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog.js';
import {
  createDefaultLayout,
  getBlockedTiles,
  layoutToFurnitureInstances,
  layoutToSeats,
  layoutToTileMap,
} from '../layout/layoutSerializer.js';
import { findPath, getWalkableTiles, isWalkable } from '../layout/tileMap.js';
import type { LeisureActivity } from '../leisure/leisure.js';
import {
  ALL_LEISURE,
  atLeisureStop,
  findLeisureSpots,
  INTERN_LEISURE,
  isNightOnly,
  pickLeisureStops,
  shuffled,
} from '../leisure/leisure.js';
import type { DiscoLight, PartyBounds, PartyState } from '../party/party.js';
import { discoLights, partyBounds } from '../party/party.js';
import { getPetCount, getPetName } from '../sprites/petSpriteData.js';
import { getLoadedCharacterCount } from '../sprites/spriteData.js';
import type {
  Character,
  FurnitureInstance,
  OfficeLayout,
  Pet,
  PlacedFurniture,
  PlacedPet,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { CharacterState, Direction, PetState, TILE_SIZE } from '../types.js';
import type { ZoneKind } from '../zones/taskZones.js';
import { zoneForStatus, ZoneKind as Zone } from '../zones/taskZones.js';
import {
  findZoneSpots,
  pickZoneSpot,
  shouldSwitchZone,
  tileZoneKind,
  wantedZone,
} from '../zones/zoneSpots.js';
import { createCharacter, updateCharacter } from './characters.js';
import { advanceMatrixEffect, startMatrixEffect } from './matrixEffectState.js';
import { createPet, updatePet } from './petEntity.js';
import { sittingDropPx } from './posture.js';
import { anchorTile, closestFreeSeat } from './seatPlacement.js';

/** Internal helper: facing-tile coords for a seat. Returns null for invalid direction. */
/** The activity whiteboard (any rotation/state variant of its type). */
function isBoard(f: FurnitureInstance): boolean {
  return f.type?.split(':')[0] === BOARD_FURNITURE_TYPE;
}

/** The crying Isaac of the basement (easter egg: click him eleven times). */
function isIsaac(f: FurnitureInstance): boolean {
  return f.type?.split(':')[0] === ISAAC_FURNITURE_TYPE;
}

/** Whether a world point lands on a painted pixel of the instance. */
function hitsPaintedPixel(f: FurnitureInstance, worldX: number, worldY: number): boolean {
  const px = Math.floor(worldX - f.x);
  const py = Math.floor(worldY - f.y);
  const row = f.sprite[py];
  if (!row || px < 0 || px >= row.length) return false;
  return row[f.mirrored ? row.length - 1 - px : px] !== '';
}

function seatFacingOffset(direction: Direction): { dCol: number; dRow: number } {
  if (direction === Direction.RIGHT) return { dCol: 1, dRow: 0 };
  if (direction === Direction.LEFT) return { dCol: -1, dRow: 0 };
  if (direction === Direction.DOWN) return { dCol: 0, dRow: 1 };
  return { dCol: 0, dRow: -1 };
}

export class OfficeState {
  layout: OfficeLayout;
  tileMap: TileTypeVal[][];
  seats: Map<string, Seat>;
  blockedTiles: Set<string>;
  furniture: FurnitureInstance[];
  walkableTiles: Array<{ col: number; row: number }>;
  characters: Map<number, Character> = new Map();
  pets: Pet[] = [];
  /** Accumulated time for furniture animation frame cycling */
  furnitureAnimTimer = 0;
  /** Steam, sparks and dust (fork, Fase 2). */
  particles = new ParticleSystem();
  /** Notes off the turntable while music plays (features/musica). */
  private musicNotes = new MusicNotes();
  /** Easter egg: Isaac's click streak and dance (clock = furnitureAnimTimer). */
  isaacDance = createIsaacDance();
  private isaacStep: number | null = null;
  /** What each agent did since the page opened: the hallway whiteboard and its panel. */
  activity = new ActivityLog();
  /** The big party under way (fork, Fase 5.5), or null. */
  party: PartyState | null = null;
  /** Agents (not interns) that worked since everyone was last done: 2+ means a big party. */
  private workedSinceParty = new Set<number>();
  /** Agents that started working since their last cheer: only those cheer at a turn end. */
  private turnWorkers = new Set<number>();
  private confettiTimer = 0;
  /** Agents that already set off the Light Labs teleporter since they last entered the zone. */
  private teleported = new WeakSet<Character>();
  selectedAgentId: number | null = null;
  cameraFollowId: number | null = null;
  hoveredAgentId: number | null = null;
  hoveredTile: { col: number; row: number } | null = null;
  /** Maps "parentId:toolId" → sub-agent character ID (negative) */
  subagentIdMap: Map<string, number> = new Map();
  /** Reverse lookup: sub-agent character ID → parent info */
  subagentMeta: Map<number, { parentAgentId: number; parentToolId: string }> = new Map();
  private nextSubagentId = -1;

  /**
   * folderName → list of Area labels that workspace folder belongs to.
   * Populated by useExtensionMessages on `areaMappingsLoaded`. Consulted by
   * `findFreeSeat()` to bias new agents toward seats inside their folder's Area.
   */
  areaMappings: Record<string, string[]> = {};

  /**
   * The first-run consent greeter, deliberately NOT in `characters`.
   *
   * `characters` means "agents": everything that iterates it — seat
   * assignment, palette diversity, the wander FSM, hit-testing, the seat
   * payload the webview persists — is asking an agent question the greeter has
   * no answer to. Holding it here instead of tagging it with a flag makes
   * every one of those loops correct by default, rather than correct as long
   * as each remembers an `isGreeter` guard. It is drawn because
   * `getCharacters()` appends it, and that is the only place it joins the
   * others.
   */
  greeter: Character | null = null;

  /** World-space point the camera drifts to while the greeter is up
   *  (the bubble overlay recomputes it every frame: the combined center of the
   *  character and its speech bubble). An explicit cameraFollowId outranks it. */
  greeterCameraTarget: { x: number; y: number } | null = null;
  /** Latched by a manual pan during the ask: the user took the camera, so the
   *  overlay's per-frame updates stop re-centering. Reset on spawn/despawn. */
  private greeterCameraCancelled = false;

  setAreaMappings(mappings: Record<string, string[]>): void {
    this.areaMappings = mappings;
  }

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout();
    this.tileMap = layoutToTileMap(this.layout);
    this.seats = layoutToSeats(this.layout.furniture);
    this.blockedTiles = getBlockedTiles(this.layout.furniture);
    this.furniture = layoutToFurnitureInstances(this.layout.furniture);
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);
    // Pets are built last because they need walkableTiles populated for spawn.
    this.rebuildPetsFromLayout(this.layout);
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout;
    this.tileMap = layoutToTileMap(layout);
    this.seats = layoutToSeats(layout.furniture);
    this.blockedTiles = getBlockedTiles(layout.furniture);
    this.rebuildFurnitureInstances();
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles);

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of this.characters.values()) {
        ch.tileCol += shift.col;
        ch.tileRow += shift.row;
        ch.x += shift.col * TILE_SIZE;
        ch.y += shift.row * TILE_SIZE;
        // Clear path since tile coords changed
        ch.path = [];
        ch.moveProgress = 0;
      }
    }

    // Shift pet positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const pet of this.pets) {
        pet.tileCol += shift.col;
        pet.tileRow += shift.row;
        pet.x += shift.col * TILE_SIZE;
        pet.y += shift.row * TILE_SIZE;
        pet.path = [];
        pet.moveProgress = 0;
      }
    }

    // Zone areas may have moved: let everyone re-pick a zone spot
    for (const ch of this.characters.values()) this.leaveZone(ch);

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of this.seats.values()) {
      seat.assigned = false;
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of this.characters.values()) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!;
        if (!seat.assigned) {
          seat.assigned = true;
          // Snap character to seat position
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.x = cx;
          ch.y = cy;
          ch.dir = seat.facingDir;
          continue;
        }
      }
      ch.seatId = null; // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue;
      const seatId = this.findFreeSeat(ch.folderName);
      if (seatId) {
        this.seats.get(seatId)!.assigned = true;
        ch.seatId = seatId;
        const seat = this.seats.get(seatId)!;
        ch.tileCol = seat.seatCol;
        ch.tileRow = seat.seatRow;
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
        ch.dir = seat.facingDir;
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of this.characters.values()) {
      if (ch.seatId) continue; // seated characters are fine
      if (
        ch.tileCol < 0 ||
        ch.tileCol >= layout.cols ||
        ch.tileRow < 0 ||
        ch.tileRow >= layout.rows
      ) {
        this.relocateCharacterToWalkable(ch);
      }
    }

    // Relocate any pets that ended up outside bounds or on non-walkable tiles
    for (const pet of this.pets) {
      if (
        pet.tileCol < 0 ||
        pet.tileCol >= layout.cols ||
        pet.tileRow < 0 ||
        pet.tileRow >= layout.rows ||
        !isWalkable(pet.tileCol, pet.tileRow, this.tileMap, this.blockedTiles)
      ) {
        if (this.walkableTiles.length > 0) {
          const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
          pet.tileCol = spawn.col;
          pet.tileRow = spawn.row;
          pet.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
          pet.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
          pet.path = [];
          pet.moveProgress = 0;
          pet.state = PetState.IDLE;
          pet.frame = 0;
          pet.frameTimer = 0;
          pet.followTargetId = null;
        }
      }
    }

    // Reconcile pets against the layout roster (handles editor add/remove)
    this.rebuildPetsFromLayout(layout);
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return;
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.path = [];
    ch.moveProgress = 0;
  }

  getLayout(): OfficeLayout {
    return this.layout;
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return null;
    return `${seat.seatCol},${seat.seatRow}`;
  }

  /** Temporarily unblock a character's own seat (and the zone chair it
   *  borrowed, if any), run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const keys: string[] = [];
    const own = this.ownSeatKey(ch);
    if (own) keys.push(own);
    if (ch.zoneSpot?.seatUid) keys.push(`${ch.zoneSpot.col},${ch.zoneSpot.row}`);
    const stop = ch.leisure?.stops[0];
    if (stop?.seatUid) keys.push(`${stop.col},${stop.row}`);
    const unblocked = keys.filter((k) => this.blockedTiles.delete(k));
    const result = fn();
    for (const k of unblocked) this.blockedTiles.add(k);
    return result;
  }

  /** Collect every tile occupied by electronics furniture (PCs, monitors, etc.). */
  private buildElectronicsTileSet(): Set<string> {
    const out = new Set<string>();
    for (const item of this.layout.furniture) {
      const entry = getCatalogEntry(item.type);
      if (!entry || entry.category !== 'electronics') continue;
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          out.add(`${item.col + dc},${item.row + dr}`);
        }
      }
    }
    return out;
  }

  /** Find the area label assigned to a seat's tile, or null. Public for e2e
   *  observability (getAgentSeats hook reads a seated agent's area). */
  seatZone(uid: string): string | null {
    const seat = this.seats.get(uid);
    if (!seat) return null;
    const tiles = this.layout.areaTiles;
    if (!tiles || tiles.length === 0) return null;
    const idx = seat.seatRow * this.layout.cols + seat.seatCol;
    if (idx < 0 || idx >= tiles.length) return null;
    return tiles[idx] ?? null;
  }

  /**
   * Does this seat face an electronics tile (PC, monitor)? Mirrors the
   * forward-and-flanking scan used by furniture auto-state.
   */
  private isSeatFacingElectronics(seat: Seat, electronicsTiles: Set<string>): boolean {
    const { dCol, dRow } = seatFacingOffset(seat.facingDir);
    for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
      const tileCol = seat.seatCol + dCol * d;
      const tileRow = seat.seatRow + dRow * d;
      if (electronicsTiles.has(`${tileCol},${tileRow}`)) return true;
      if (dCol !== 0) {
        if (
          electronicsTiles.has(`${tileCol},${tileRow - 1}`) ||
          electronicsTiles.has(`${tileCol},${tileRow + 1}`)
        ) {
          return true;
        }
      } else if (
        electronicsTiles.has(`${tileCol - 1},${tileRow}`) ||
        electronicsTiles.has(`${tileCol + 1},${tileRow}`)
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Random-pick a seat from a candidate list, biased toward seats that face an
   * electronics tile. Returns null when the candidate list is empty.
   */
  private pickFromSeats(seatUids: string[], electronicsTiles: Set<string>): string | null {
    if (seatUids.length === 0) return null;
    const pcSeats: string[] = [];
    const otherSeats: string[] = [];
    for (const uid of seatUids) {
      const seat = this.seats.get(uid);
      if (!seat) continue;
      if (this.isSeatFacingElectronics(seat, electronicsTiles)) {
        pcSeats.push(uid);
      } else {
        otherSeats.push(uid);
      }
    }
    if (pcSeats.length > 0) return pcSeats[Math.floor(Math.random() * pcSeats.length)];
    if (otherSeats.length > 0) return otherSeats[Math.floor(Math.random() * otherSeats.length)];
    return null;
  }

  /**
   * 3-stage seat picker for top-level agents.
   *
   *   Stage 1: If `folderName` is given and `areaMappings[folderName]` lists
   *            Area labels, prefer free seats whose tile is labeled with one
   *            of those areas.
   *   Stage 2: Prefer free seats whose tile has NO area label (unzoned).
   *   Stage 3: Any free seat.
   *
   * Each stage routes through `pickFromSeats` for the PC-bias rule. Returns
   * null only when every seat is already occupied. Passing `undefined`
   * preserves pre-Areas single-stage behavior (skips Stage 1; Stage 2 picks
   * unzoned seats from a layout without `areaTiles`, which is every seat).
   */
  private findFreeSeat(folderName?: string): string | null {
    const electronicsTiles = this.buildElectronicsTileSet();
    const freeSeats: string[] = [];
    for (const [uid, seat] of this.seats) {
      if (!seat.assigned) freeSeats.push(uid);
    }
    if (freeSeats.length === 0) return null;

    const areaLabels = folderName ? this.areaMappings[folderName] : undefined;

    // Stage 1 — in-area seats for the folder's mapped Area labels.
    if (areaLabels && areaLabels.length > 0) {
      const wanted = new Set(areaLabels);
      const inArea = freeSeats.filter((uid) => {
        const label = this.seatZone(uid);
        return label !== null && wanted.has(label);
      });
      const pick = this.pickFromSeats(inArea, electronicsTiles);
      if (pick) return pick;
    }

    // Stage 2 — unzoned seats (no area label, or layout has no areas at all).
    // Code-zone chairs make fine desks; other task zones are borrowed, not owned.
    const unzoned = freeSeats.filter((uid) => {
      if (this.seatZone(uid) === null) return true;
      const seat = this.seats.get(uid)!;
      return tileZoneKind(this.layout, seat.seatCol, seat.seatRow) === Zone.CODE;
    });
    const pick2 = this.pickFromSeats(unzoned, electronicsTiles);
    if (pick2) return pick2;

    // Stage 3 — any free seat.
    return this.pickFromSeats(freeSeats, electronicsTiles);
  }

  /** Closest walkable tile to (col,row) not occupied by another character, or null. */
  private closestFreeWalkableTile(col: number, row: number): { col: number; row: number } | null {
    const occupied = new Set<string>();
    for (const ch of this.characters.values()) {
      occupied.add(`${ch.tileCol},${ch.tileRow}`);
    }
    let best: { col: number; row: number } | null = null;
    let bestDist = Infinity;
    for (const tile of this.walkableTiles) {
      if (occupied.has(`${tile.col},${tile.row}`)) continue;
      const d = Math.abs(tile.col - col) + Math.abs(tile.row - row);
      if (d < bestDist) {
        best = tile;
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (≥45°).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5). Only the bosses
    // (char_0..5) are drawn for agents; higher char_N files are interns (Fase 4B).
    const paletteCount = Math.min(getLoadedCharacterCount(), PALETTE_COUNT);
    const counts = new Array(paletteCount).fill(0) as number[];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      if (ch.palette < paletteCount) counts[ch.palette]++;
    }
    return pickDiversePalette(paletteCount, counts);
  }

  addAgent(
    id: number,
    preferredPalette?: number,
    preferredHueShift?: number,
    preferredSeatId?: string,
    skipSpawnEffect?: boolean,
    folderName?: string,
    nearAgentId?: number,
  ): void {
    if (this.characters.has(id)) return;

    let palette: number;
    let hueShift: number;
    // A remembered palette must be a boss sheet: an older page could persist an
    // intern's (e.g. 9 = Wheatley), which would turn the agent into that intern.
    if (preferredPalette !== undefined && preferredPalette < PALETTE_COUNT) {
      palette = preferredPalette;
      hueShift = preferredHueShift ?? 0;
    } else {
      const pick = this.pickDiversePalette();
      palette = pick.palette;
      hueShift = pick.hueShift;
    }

    // Try preferred seat first, then (for teammates) the seat closest to the
    // anchor agent, then any free seat. anchorTile resolves to the anchor's SEAT
    // (stable from creation) rather than its live tile, so a teammate placed while
    // the lead is still walking to its seat still clusters around the final seat.
    const anchor = nearAgentId !== undefined ? this.characters.get(nearAgentId) : undefined;
    const anchorAt = anchorTile(anchor, this.seats);
    let seatId: string | null = null;
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!;
      if (!seat.assigned) {
        seatId = preferredSeatId;
      }
    }
    if (!seatId && anchorAt) {
      seatId = closestFreeSeat(this.seats, anchorAt.col, anchorAt.row);
    }
    if (!seatId) {
      seatId = this.findFreeSeat(folderName);
    }

    let ch: Character;
    if (seatId) {
      const seat = this.seats.get(seatId)!;
      seat.assigned = true;
      ch = createCharacter(id, palette, seatId, seat, hueShift);
    } else {
      // No seats — teammates spawn beside their anchor, others at a random walkable tile
      let spawn = anchorAt ? this.closestFreeWalkableTile(anchorAt.col, anchorAt.row) : null;
      if (!spawn) {
        spawn =
          this.walkableTiles.length > 0
            ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
            : { col: 1, row: 1 };
      }
      ch = createCharacter(id, palette, null, null, hueShift);
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
      ch.tileCol = spawn.col;
      ch.tileRow = spawn.row;
    }

    if (folderName) {
      ch.folderName = folderName;
    }
    if (!skipSpawnEffect) {
      startMatrixEffect(ch, 'spawn');
    }
    this.characters.set(id, ch);
  }

  // ── Greeter ───────────────────────────────────────────────────
  // The Intro is diegetic: a char_0 character stands near the office's
  // bottom-left corner and "speaks" the tour through a DOM bubble
  // (IntroBubble). It is not an agent — see the `greeter` field.

  /** Spawn the greeter near the office's bottom-left corner: target tile
   *  GREETER_TILE_MARGIN in from the left and bottom edges, falling
   *  back to the closest walkable tile when the target is a seat, furniture,
   *  a wall, or VOID (seat tiles are in blockedTiles, so closestFreeWalkableTile
   *  covers every one of those). Idempotent; a remount mid-despawn (StrictMode)
   *  revives it. */
  spawnGreeter(): void {
    this.greeterCameraCancelled = false;
    if (this.greeter) {
      if (this.greeter.matrixEffect === 'despawn') startMatrixEffect(this.greeter, 'spawn');
      return;
    }
    const spawn = this.closestFreeWalkableTile(
      GREETER_TILE_MARGIN,
      this.layout.rows - 1 - GREETER_TILE_MARGIN,
    );
    if (!spawn) return; // no walkable tile — IntroBubble falls back to a fixed panel
    const ch = createCharacter(GREETER_ID, 0, null, null, 0);
    ch.isGreeter = true;
    ch.state = CharacterState.IDLE;
    ch.isActive = false;
    ch.dir = Direction.DOWN;
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    startMatrixEffect(ch, 'spawn');
    this.greeter = ch;
  }

  /** Start the greeter's despawn effect and release the greeter camera. The
   *  character is dropped once the effect finishes (see update()).
   *  Idempotent — every close path (answer, Escape, hooksStatus) funnels here. */
  despawnGreeter(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = false;
    if (!this.greeter || this.greeter.matrixEffect === 'despawn') return;
    startMatrixEffect(this.greeter, 'despawn');
  }

  /** Per-frame update from the bubble overlay; ignored once the user panned. */
  setGreeterCameraTarget(p: { x: number; y: number }): void {
    if (!this.greeterCameraCancelled) this.greeterCameraTarget = p;
  }

  /** Manual pan during the ask: stop re-centering until the next spawn. */
  cancelGreeterCamera(): void {
    this.greeterCameraTarget = null;
    this.greeterCameraCancelled = true;
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    if (ch.matrixEffect === 'despawn') return; // already despawning
    this.workedSinceParty.delete(id);
    this.turnWorkers.delete(id);
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
    // Start despawn animation instead of immediate delete
    startMatrixEffect(ch, 'despawn');
    ch.bubbleType = null;
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of this.seats) {
      if (seat.seatCol === col && seat.seatRow === row) return uid;
    }
    return null;
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId);
    if (!ch) return;
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId);
      if (old) old.assigned = false;
    }
    // Assign new seat
    const seat = this.seats.get(seatId);
    if (!seat || seat.assigned) return;
    seat.assigned = true;
    ch.seatId = seatId;
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /**
   * Move a just-linked teammate to the free seat closest to its lead, so teams
   * cluster. Only moves when that seat is strictly closer than the teammate's
   * current one — a teammate created as a plain external agent (seated by an
   * arbitrary findFreeSeat) and tagged as a teammate only after tag discovery
   * would otherwise keep its arbitrary seat, unlike an inline teammate seated
   * next to the lead at creation.
   */
  private reseatNextToLead(teammateId: number, leadId: number): void {
    const teammate = this.characters.get(teammateId);
    const lead = this.characters.get(leadId);
    if (!teammate || !lead) return;
    const anchorAt = anchorTile(lead, this.seats);
    if (!anchorAt) return;
    const target = closestFreeSeat(this.seats, anchorAt.col, anchorAt.row);
    if (!target || target === teammate.seatId) return;
    const targetSeat = this.seats.get(target)!;
    const targetDist =
      Math.abs(targetSeat.seatCol - anchorAt.col) + Math.abs(targetSeat.seatRow - anchorAt.row);
    const currentSeat = teammate.seatId ? this.seats.get(teammate.seatId) : undefined;
    const currentDist = currentSeat
      ? Math.abs(currentSeat.seatCol - anchorAt.col) + Math.abs(currentSeat.seatRow - anchorAt.row)
      : Infinity;
    if (targetDist < currentDist) {
      this.reassignSeat(teammateId, target);
    }
  }

  /** Send an agent back to their currently assigned seat */
  sendToSeat(agentId: number): void {
    const ch = this.characters.get(agentId);
    if (!ch || !ch.seatId) return;
    const seat = this.seats.get(ch.seatId);
    if (!seat) return;
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles),
    );
    if (path.length > 0) {
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    } else {
      // Already at seat — sit down
      ch.state = CharacterState.TYPE;
      ch.dir = seat.facingDir;
      ch.frame = 0;
      ch.frameTimer = 0;
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC;
      }
    }
  }

  /** Walk an agent to an arbitrary walkable tile (right-click command) */
  walkToTile(agentId: number, col: number, row: number): boolean {
    const ch = this.characters.get(agentId);
    if (!ch || ch.isSubagent) return false;
    if (!isWalkable(col, row, this.tileMap, this.blockedTiles)) {
      // Also allow walking to own seat tile (blocked for others but not self)
      const key = this.ownSeatKey(ch);
      if (!key || key !== `${col},${row}`) return false;
    }
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, col, row, this.tileMap, this.blockedTiles),
    );
    if (path.length === 0) return false;
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    return true;
  }

  /** Which intern a boss sends (Fase 4B): the first of its interns (BOSS_INTERNS) not already
   *  out on another task, round-robin when all are busy. Same hue shift as the boss, so a
   *  repeated boss and its interns match. Bosses without interns (external characters) send a
   *  copy of themselves, as before. */
  private pickInternPalette(parentCh: Character | undefined): {
    palette: number;
    hueShift: number;
  } {
    if (!parentCh) return { palette: 0, hueShift: 0 };
    const interns = (BOSS_INTERNS[parentCh.palette] ?? []).filter(
      (i) => i < getLoadedCharacterCount(),
    );
    if (interns.length === 0) return { palette: parentCh.palette, hueShift: parentCh.hueShift };
    const busy: number[] = [];
    for (const ch of this.characters.values()) {
      if (ch.isSubagent && ch.parentAgentId === parentCh.id && ch.leavingSec === null) {
        if (ch.matrixEffect !== 'despawn') busy.push(ch.palette);
      }
    }
    const free = interns.find((i) => !busy.includes(i));
    return { palette: free ?? interns[busy.length % interns.length], hueShift: parentCh.hueShift };
  }

  /** An intern done with its task walks back to its boss and fades out there (Fase 4B). With no
   *  boss to walk to (it is leaving too) or no path, it fades out where it stands. */
  private startInternLeaving(ch: Character): void {
    ch.leisure = null;
    ch.internRestSec = null;
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
      ch.seatId = null;
    }
    ch.bubbleType = null;
    ch.zoneSpot = null;
    ch.zoneAt = null;
    const boss = ch.parentAgentId !== null ? this.characters.get(ch.parentAgentId) : undefined;
    const target =
      boss && boss.matrixEffect !== 'despawn'
        ? this.closestFreeWalkableTile(boss.tileCol, boss.tileRow)
        : null;
    const path =
      target && !ch.matrixEffect
        ? findPath(ch.tileCol, ch.tileRow, target.col, target.row, this.tileMap, this.blockedTiles)
        : [];
    if (path.length === 0) {
      startMatrixEffect(ch, 'despawn');
      return;
    }
    ch.path = path;
    ch.moveProgress = 0;
    ch.state = CharacterState.WALK;
    ch.frame = 0;
    ch.frameTimer = 0;
    ch.leavingSec = INTERN_LEAVE_MAX_SEC;
  }

  /** Create a sub-agent character: one of its boss's interns (Fase 4B). Returns the sub-agent ID. */
  addSubagent(parentAgentId: number, parentToolId: string): number {
    const key = `${parentAgentId}:${parentToolId}`;
    if (this.subagentIdMap.has(key)) return this.subagentIdMap.get(key)!;

    const id = this.nextSubagentId--;
    const parentCh = this.characters.get(parentAgentId);
    const { palette, hueShift } = this.pickInternPalette(parentCh);

    // Find the closest walkable tile to the parent, avoiding tiles occupied by other characters
    const parentCol = parentCh ? parentCh.tileCol : 0;
    const parentRow = parentCh ? parentCh.tileRow : 0;
    let spawn = { col: parentCol, row: parentRow };
    if (this.walkableTiles.length > 0) {
      spawn = this.closestFreeWalkableTile(parentCol, parentRow) ?? this.walkableTiles[0];
    }

    const ch = createCharacter(id, palette, null, null, hueShift);
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2;
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2;
    ch.tileCol = spawn.col;
    ch.tileRow = spawn.row;
    // Face the same direction as the parent agent
    if (parentCh) ch.dir = parentCh.dir;
    ch.isSubagent = true;
    ch.parentAgentId = parentAgentId;
    startMatrixEffect(ch, 'spawn');
    this.characters.set(id, ch);

    this.subagentIdMap.set(key, id);
    this.subagentMeta.set(id, { parentAgentId, parentToolId });
    return id;
  }

  /** Remove a specific sub-agent character and free its seat */
  removeSubagent(parentAgentId: number, parentToolId: string): void {
    const key = `${parentAgentId}:${parentToolId}`;
    const id = this.subagentIdMap.get(key);
    if (id === undefined) return;

    const ch = this.characters.get(id);
    if (ch) {
      if (this.isInternDone(ch)) {
        // Already resting or leaving — just clean up maps
        this.subagentIdMap.delete(key);
        this.subagentMeta.delete(id);
        return;
      }
      // Rest a while in the interns' room, then walk back to the boss and fade out —
      // keeps the character in the map meanwhile
      this.startInternRest(ch);
    }
    // Clean up tracking maps immediately so keys don't collide
    this.subagentIdMap.delete(key);
    this.subagentMeta.delete(id);
    if (this.selectedAgentId === id) this.selectedAgentId = null;
    if (this.cameraFollowId === id) this.cameraFollowId = null;
  }

  /** Remove all sub-agents belonging to a parent agent */
  removeAllSubagents(parentAgentId: number): void {
    const toRemove: string[] = [];
    for (const [key, id] of this.subagentIdMap) {
      const meta = this.subagentMeta.get(id);
      if (meta && meta.parentAgentId === parentAgentId) {
        const ch = this.characters.get(id);
        if (ch) {
          if (this.isInternDone(ch)) {
            // Already resting or leaving — just clean up maps
            this.subagentMeta.delete(id);
            toRemove.push(key);
            continue;
          }
          this.startInternRest(ch);
        }
        this.subagentMeta.delete(id);
        if (this.selectedAgentId === id) this.selectedAgentId = null;
        if (this.cameraFollowId === id) this.cameraFollowId = null;
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      this.subagentIdMap.delete(key);
    }
  }

  /** Look up the sub-agent character ID for a given parent+toolId, or null */
  getSubagentId(parentAgentId: number, parentToolId: string): number | null {
    return this.subagentIdMap.get(`${parentAgentId}:${parentToolId}`) ?? null;
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.isActive = active;
      if (active) {
        // Back to work: drop the free-time activity and get up from the couch
        ch.idleSec = 0;
        this.endLeisure(ch);
        // ...and leave the party (fork, Fase 5.5)
        ch.cheerSec = 0;
        ch.partySpot = null;
        if (!ch.isSubagent) {
          this.workedSinceParty.add(id);
          this.turnWorkers.add(id);
        }
      }
      if (!active) {
        if (!ch.isSubagent) {
          ch.activityZone = null;
          ch.errorHoldSec = 0;
          this.leaveZone(ch);
        }
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1;
        ch.path = [];
        ch.moveProgress = 0;
      }
      this.rebuildFurnitureInstances();
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>();
    for (const ch of this.characters.values()) {
      if (!ch.isActive) continue;
      // Where it works: the borrowed zone spot, else its own seat
      const own = ch.seatId ? this.seats.get(ch.seatId) : undefined;
      const seat = ch.zoneSpot
        ? { seatCol: ch.zoneSpot.col, seatRow: ch.zoneSpot.row, facingDir: ch.zoneSpot.dir }
        : own;
      if (!seat) continue;
      // Find the desk tile(s) the agent faces from their seat
      const dCol =
        seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0;
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0;
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d;
        const tileRow = seat.seatRow + dRow * d;
        autoOnTiles.add(`${tileCol},${tileRow}`);
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d;
        const baseRow = seat.seatRow + dRow * d;
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`);
          autoOnTiles.add(`${baseCol},${baseRow + 1}`);
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`);
          autoOnTiles.add(`${baseCol + 1},${baseRow}`);
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = this.withAmbientAnimation(layoutToFurnitureInstances(this.layout.furniture));
      return;
    }

    // Build modified furniture list with auto-state and animation applied
    const animFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type);
      if (!entry) return item;
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            let onType = getOnStateType(item.type);
            if (onType !== item.type) {
              // Check if the on-state type has animation frames
              const frames = getAnimationFrames(onType);
              if (frames && frames.length > 1) {
                const frameIdx = animFrame % frames.length;
                onType = frames[frameIdx];
              }
              return { ...item, type: onType };
            }
            return item;
          }
        }
      }
      return item;
    });

    this.furniture = this.withAmbientAnimation(layoutToFurnitureInstances(modifiedFurniture));
  }

  private withAmbientAnimation(instances: FurnitureInstance[]): FurnitureInstance[] {
    // Optional feature (features/musica): spinning turntable, album cover in its frame
    return applyMusicFurniture(
      this.withOfficeAnimation(instances),
      this.furnitureAnimTimer,
      musicStore.get(),
    );
  }

  private withOfficeAnimation(instances: FurnitureInstance[]): FurnitureInstance[] {
    const animated = applyAmbientAnimation(
      instances,
      this.furnitureAnimTimer,
      new Date(),
      currentAmbient(getDayNightMode()),
    );
    // The whiteboard shows a marker line per agent that has been working
    const marks = this.activity.marks();
    const marked =
      marks.length === 0
        ? animated
        : animated.map((f) => (isBoard(f) ? { ...f, sprite: boardSprite(f.sprite, marks) } : f));
    // Isaac, while his dance lasts: afro, glasses, a hop and a turn per step
    const step = isaacDanceFrame(this.isaacDance, this.furnitureAnimTimer);
    if (step === null) return marked;
    const pose = isaacDancePose(step);
    return marked.map((f) =>
      isIsaac(f)
        ? {
            ...f,
            sprite: isaacDanceSprite(f.sprite, step),
            x: f.x - ISAAC_AFRO_SIDE,
            y: f.y - ISAAC_AFRO_ROWS + pose.dy,
            mirrored: pose.mirrored,
          }
        : f,
    );
  }

  /** Whether a world point lands on a painted pixel of the activity whiteboard. */
  isBoardAt(worldX: number, worldY: number): boolean {
    return this.furniture.some((f) => isBoard(f) && hitsPaintedPixel(f, worldX, worldY));
  }

  /** Whether a world point lands on Isaac (the basement easter egg). */
  isIsaacAt(worldX: number, worldY: number): boolean {
    return this.furniture.some((f) => isIsaac(f) && hitsPaintedPixel(f, worldX, worldY));
  }

  /** One click on Isaac. The eleventh in a row starts his dance (with confetti). */
  pokeIsaac(): IsaacPoke {
    const result = pokeIsaac(this.isaacDance, this.furnitureAnimTimer);
    if (result === 'dance') this.isaacConfetti();
    return result;
  }

  private isaacConfetti(): void {
    const isaac = this.furniture.find(isIsaac);
    if (isaac) this.particles.burstConfetti(isaac.x + isaac.sprite[0].length / 2, isaac.y);
  }

  /** Record the zone of the tool an agent just started (fork, Fase 3). */
  setAgentActivity(id: number, status: string | null): void {
    const ch = this.characters.get(id);
    if (ch) ch.activityZone = status ? zoneForStatus(status) : null;
  }

  /** Give up the zone spot; the agent heads back to its desk if still working. */
  private leaveZone(ch: Character): void {
    this.teleported.delete(ch);
    ch.zoneAt = null;
    ch.zoneSpot = null;
    ch.zonePendingSec = 0;
    ch.zoneStaySec = 0;
  }

  /** Move an agent to a zone (null = its desk), reserving a spot there. */
  private enterZone(ch: Character, kind: ZoneKind | null): void {
    this.teleported.delete(ch);
    ch.zoneAt = kind;
    ch.zoneSpot = null;
    ch.zonePendingSec = 0;
    ch.zoneStaySec = 0;
    if (kind) {
      const home = ch.seatId ? this.seats.get(ch.seatId) : undefined;
      // An agent whose own desk already sits in the zone just stays there
      if (!home || tileZoneKind(this.layout, home.seatCol, home.seatRow) !== kind) {
        const taken = new Set<string>();
        for (const other of this.characters.values()) {
          if (other === ch) continue;
          if (other.zoneSpot) taken.add(`${other.zoneSpot.col},${other.zoneSpot.row}`);
          // Someone on a break makes room for whoever comes to work (Fase 5.1)
          if (other.leisure) continue;
          taken.add(`${other.tileCol},${other.tileRow}`);
        }
        const tiers = findZoneSpots(this.layout, kind, this.seats, this.tileMap, this.blockedTiles);
        ch.zoneSpot = pickZoneSpot(tiers, taken);
        if (ch.zoneSpot) this.makeRoomAt(ch, ch.zoneSpot.col, ch.zoneSpot.row);
      }
    }
    // Get up from wherever it is working so the FSM walks to the new spot
    if (ch.isActive && ch.state === CharacterState.TYPE) {
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
  }

  // ── Free time (fork, Fase 5.1) ─────────────────────────────

  /** An intern done with its task: resting first, or already walking home / fading. */
  private isInternDone(ch: Character): boolean {
    return ch.matrixEffect === 'despawn' || ch.leavingSec !== null || ch.internRestSec !== null;
  }

  private isNight(): boolean {
    return currentAmbient(getDayNightMode()).lights >= LEISURE_NIGHT_LIGHTS_MIN;
  }

  /** "col,row" of every place someone else holds: where they are, their zone spot, their free-time stops. */
  private leisureTaken(ch: Character): Set<string> {
    const taken = new Set<string>();
    for (const other of this.characters.values()) {
      if (other === ch) continue;
      taken.add(`${other.tileCol},${other.tileRow}`);
      if (other.zoneSpot) taken.add(`${other.zoneSpot.col},${other.zoneSpot.row}`);
      for (const stop of other.leisure?.stops ?? []) taken.add(`${stop.col},${stop.row}`);
    }
    return taken;
  }

  /** Pick a free-time activity from `pool` (never `except`) with a free spot; false when none has one. */
  private startLeisure(
    ch: Character,
    pool: readonly LeisureActivity[],
    except?: LeisureActivity,
  ): boolean {
    const night = this.isNight();
    const taken = this.leisureTaken(ch);
    const options = pool.filter((a) => a !== except && (night || !isNightOnly(a)));
    for (const activity of shuffled(options, Math.random)) {
      const groups = findLeisureSpots(
        activity,
        this.layout,
        this.seats,
        this.tileMap,
        this.blockedTiles,
      );
      const tourStops = randomInt(LEISURE_TOUR_STOPS_MIN, LEISURE_TOUR_STOPS_MAX);
      const stops = pickLeisureStops(activity, groups, taken, tourStops, {
        col: ch.tileCol,
        row: ch.tileRow,
      });
      if (!stops) continue;
      const stopSec =
        randomRange(LEISURE_ACTIVITY_MIN_SEC, LEISURE_ACTIVITY_MAX_SEC) / stops.length;
      ch.leisure = { activity, stops, sec: stopSec, stopSec, arrived: false, failed: false };
      ch.seatTimer = 0;
      // Get up (from its own desk, or the previous activity's seat) and walk there
      if (ch.state === CharacterState.TYPE) {
        ch.state = CharacterState.IDLE;
        ch.frame = 0;
        ch.frameTimer = 0;
      }
      return true;
    }
    return false;
  }

  /** Drop the free-time activity; a seated agent stands up (and walks to work if it is working). */
  private endLeisure(ch: Character): void {
    if (!ch.leisure) return;
    ch.leisure = null;
    if (ch.state === CharacterState.TYPE) {
      ch.state = CharacterState.IDLE;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
  }

  /** Wander as before for `sec` seconds, then pick an activity again. */
  private wanderFor(ch: Character, sec: number): void {
    ch.idleSec = Math.min(ch.idleSec, LEISURE_START_SEC - sec);
  }

  /** Whoever is resting on (or heading to) this tile gets up for an agent coming to work. */
  private makeRoomAt(worker: Character, col: number, row: number): void {
    for (const other of this.characters.values()) {
      if (other === worker || !other.leisure) continue;
      const here = other.tileCol === col && other.tileRow === row;
      if (here || other.leisure.stops.some((s) => s.col === col && s.row === row)) {
        this.endLeisure(other);
      }
    }
  }

  /** Advance the current activity: 'busy' while it lasts, 'done' when over, 'failed' when unreachable. */
  private tickLeisure(ch: Character, dt: number): 'busy' | 'done' | 'failed' {
    const l = ch.leisure!;
    if (l.failed) return 'failed';
    if (isNightOnly(l.activity) && !this.isNight()) return 'done';
    if (!atLeisureStop(ch)) return 'busy';
    l.sec -= dt;
    if (l.sec > 0) return 'busy';
    if (l.stops.length > 1) {
      // Next statue of the gallery
      l.stops.shift();
      l.sec = l.stopSec;
      l.arrived = false;
      return 'busy';
    }
    return 'done';
  }

  /** Free time of an agent: starts after LEISURE_START_SEC without work, one activity after another. */
  private updateLeisure(ch: Character, dt: number): void {
    if (ch.isActive) {
      ch.idleSec = 0;
      return;
    }
    ch.idleSec += dt;
    if (ch.leisure) {
      const result = this.tickLeisure(ch, dt);
      if (result === 'busy') return;
      const last = ch.leisure.activity;
      this.endLeisure(ch);
      if (result === 'failed') {
        this.wanderFor(ch, LEISURE_RETRY_SEC);
      } else if (Math.random() < LEISURE_WANDER_CHANCE) {
        this.wanderFor(ch, randomRange(LEISURE_WANDER_MIN_SEC, LEISURE_WANDER_MAX_SEC));
      } else if (!this.startLeisure(ch, ALL_LEISURE, last)) {
        this.wanderFor(ch, LEISURE_RETRY_SEC);
      }
      return;
    }
    if (ch.idleSec >= LEISURE_START_SEC && !this.startLeisure(ch, ALL_LEISURE)) {
      this.wanderFor(ch, LEISURE_RETRY_SEC);
    }
  }

  /** An intern done with its task rests in the interns' room before going home.
   *  Nothing free there: it leaves at once, as before. */
  private startInternRest(ch: Character): void {
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId);
      if (seat) seat.assigned = false;
      ch.seatId = null;
    }
    ch.bubbleType = null;
    ch.zoneSpot = null;
    ch.zoneAt = null;
    ch.isActive = false;
    ch.currentTool = null;
    ch.internRestSec = randomRange(INTERN_REST_MIN_SEC, INTERN_REST_MAX_SEC);
    if (!this.startLeisure(ch, INTERN_LEISURE)) this.startInternLeaving(ch);
  }

  /** Resting intern: one interns'-room activity after another, then home (at once if the boss left). */
  private updateInternRest(ch: Character, dt: number): void {
    ch.internRestSec = (ch.internRestSec ?? 0) - dt;
    const boss = ch.parentAgentId !== null ? this.characters.get(ch.parentAgentId) : undefined;
    const bossGone = !boss || boss.matrixEffect === 'despawn';
    if (ch.internRestSec <= 0 || bossGone || !ch.leisure) {
      this.endLeisure(ch);
      this.startInternLeaving(ch);
      return;
    }
    const result = this.tickLeisure(ch, dt);
    if (result === 'busy') return;
    const last = ch.leisure.activity;
    this.endLeisure(ch);
    if (!this.startLeisure(ch, INTERN_LEISURE, result === 'done' ? last : undefined)) {
      this.startInternLeaving(ch);
    }
  }

  // ── Party mode (fork, Fase 5.5) ─────────────────────────────

  /** Someone still busy: an agent at work, or an intern still on its task. */
  private anyoneWorking(): boolean {
    for (const ch of this.characters.values()) {
      if (!ch.isActive || ch.matrixEffect === 'despawn') continue;
      if (ch.isSubagent && this.isInternDone(ch)) continue;
      return true;
    }
    return false;
  }

  /**
   * An agent finished its turn: a small cheer (hop + a little confetti), or, when it was the
   * last of PARTY_MIN_WORKERS+ agents working, the big party. Call after setAgentActive(false).
   * Returns what happened so the caller can play the sound; null for an agent that hadn't
   * worked since its last cheer (a repeated status) or isn't a normal agent.
   */
  celebrateTurnEnd(id: number): 'cheer' | 'party' | null {
    const ch = this.characters.get(id);
    if (!ch || ch.isSubagent || ch.matrixEffect || ch.isActive) return null;
    if (!this.turnWorkers.delete(id)) return null;
    if (!this.anyoneWorking()) {
      const workers = this.workedSinceParty.size;
      this.workedSinceParty.clear();
      if (workers >= PARTY_MIN_WORKERS && !this.party && this.startParty()) return 'party';
    }
    this.startCheer(ch, CHEER_SEC);
    if (areParticlesEnabled()) {
      this.particles.burstConfetti(ch.x, ch.y - SPARK_HEAD_HEIGHT_PX);
    }
    return 'cheer';
  }

  /** Hop in place for `sec` seconds, facing the room. */
  private startCheer(ch: Character, sec: number): void {
    ch.cheerSec = sec;
    ch.hopTimer = 0;
    ch.state = CharacterState.IDLE;
    ch.path = [];
    ch.moveProgress = 0;
    ch.x = ch.tileCol * TILE_SIZE + TILE_SIZE / 2;
    ch.y = ch.tileRow * TILE_SIZE + TILE_SIZE / 2;
    ch.dir = Direction.DOWN;
    ch.frame = 0;
    ch.frameTimer = 0;
  }

  /** Box of the interns' room tiles in sprite px, or null without one. */
  private internsRoomBounds(): PartyBounds | null {
    const { cols, rows } = this.layout;
    let minCol = Infinity;
    let minRow = Infinity;
    let maxCol = -Infinity;
    let maxRow = -Infinity;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (tileZoneKind(this.layout, col, row) !== Zone.INTERNS) continue;
        minCol = Math.min(minCol, col);
        minRow = Math.min(minRow, row);
        maxCol = Math.max(maxCol, col);
        maxRow = Math.max(maxRow, row);
      }
    }
    if (minCol === Infinity) return null;
    return {
      x: minCol * TILE_SIZE,
      y: minRow * TILE_SIZE,
      w: (maxCol - minCol + 1) * TILE_SIZE,
      h: (maxRow - minRow + 1) * TILE_SIZE,
    };
  }

  /** Call everyone who is not working to the interns' room (standing spots, open floor first).
   *  Without such a room, or a free spot, a guest dances where it is. False with no guests. */
  private startParty(): boolean {
    const guests = [...this.characters.values()].filter(
      (ch) => !ch.isSubagent && !ch.isActive && !ch.matrixEffect,
    );
    if (guests.length === 0) return false;
    const tiers = findZoneSpots(
      this.layout,
      Zone.INTERNS,
      this.seats,
      this.tileMap,
      this.blockedTiles,
    )
      .map((tier) => tier.filter((s) => s.seatUid === null))
      .reverse(); // open floor before "next to furniture"
    const taken = new Set<string>();
    for (const ch of this.characters.values()) {
      if (!guests.includes(ch)) taken.add(`${ch.tileCol},${ch.tileRow}`);
    }
    const spots: Array<{ col: number; row: number }> = [];
    for (const ch of guests) {
      this.endLeisure(ch);
      ch.seatTimer = 0;
      const spot = pickZoneSpot(tiers, taken) ?? { col: ch.tileCol, row: ch.tileRow };
      taken.add(`${spot.col},${spot.row}`);
      ch.partySpot = { col: spot.col, row: spot.row };
      spots.push(ch.partySpot);
    }
    this.party = { sec: 0, danceSec: null, bounds: this.internsRoomBounds() ?? partyBounds(spots) };
    this.confettiTimer = 0;
    return true;
  }

  private atPartySpot(ch: Character): boolean {
    const spot = ch.partySpot;
    return !!spot && ch.path.length === 0 && ch.tileCol === spot.col && ch.tileRow === spot.row;
  }

  /** Gathering, then the dance (from the first guest's arrival), then back to what they were doing. */
  private updateParty(dt: number): void {
    const party = this.party;
    if (!party) return;
    party.sec += dt;
    const guests = [...this.characters.values()].filter((ch) => ch.partySpot);
    if (party.danceSec === null) {
      if (guests.some((ch) => this.atPartySpot(ch)) || party.sec >= PARTY_GATHER_MAX_SEC) {
        party.danceSec = PARTY_SEC;
        // Resting interns are already in the room: they join in where they are
        for (const ch of this.characters.values()) {
          if (ch.isSubagent && ch.internRestSec !== null) this.startCheer(ch, PARTY_SEC);
        }
      }
      return;
    }
    party.danceSec -= dt;
    if (areParticlesEnabled()) {
      this.confettiTimer -= dt;
      while (this.confettiTimer <= 0) {
        this.confettiTimer += CONFETTI_RAIN_SPAWN_SEC;
        const { x, y, w, h } = party.bounds;
        this.particles.rainConfetti(x, y, w, h);
      }
    }
    if (party.danceSec <= 0 || guests.length === 0) {
      for (const ch of guests) ch.partySpot = null;
      this.party = null;
    }
  }

  /** A guest walks to its spot, then dances there while the party lasts. */
  private updatePartyGuest(ch: Character, dt: number): void {
    const party = this.party!;
    if (this.atPartySpot(ch)) {
      ch.state = CharacterState.IDLE;
      if (party.danceSec !== null && party.danceSec > 0) this.startCheer(ch, party.danceSec);
      return;
    }
    if (ch.state !== CharacterState.WALK) {
      const spot = ch.partySpot!;
      const path = this.withOwnSeatUnblocked(ch, () =>
        findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, this.tileMap, this.blockedTiles),
      );
      if (path.length === 0) {
        ch.partySpot = { col: ch.tileCol, row: ch.tileRow }; // no way there: dance here
        return;
      }
      ch.path = path;
      ch.moveProgress = 0;
      ch.state = CharacterState.WALK;
      ch.frame = 0;
      ch.frameTimer = 0;
    }
    updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles);
  }

  /** Disco spots over the dance floor while the party dances at night, else null. */
  getDisco(): { lights: DiscoLight[]; bounds: PartyBounds } | null {
    const party = this.party;
    if (!party || party.danceSec === null || !this.isNight()) return null;
    return { lights: discoLights(party.sec, party.bounds), bounds: party.bounds };
  }

  /** The free-time activity an idle agent is on, or null. */
  getLeisureActivity(id: number): LeisureActivity | null {
    return this.characters.get(id)?.leisure?.activity ?? null;
  }

  /** A tool failed: the agent cries and, unless it went recently, heads to the
   *  error zone for a moment (The Binding of Isaac). */
  onToolFailed(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || ch.matrixEffect) return;
    if (areParticlesEnabled()) {
      const sitting = sittingDropPx(ch);
      this.particles.burstTears(ch.x, ch.y + sitting - TEAR_EYE_HEIGHT_PX);
    }
    if (ch.isSubagent || ch.errorCooldownSec > 0) return;
    ch.errorHoldSec = ZONE_ERROR_HOLD_SEC;
    ch.errorCooldownSec = ZONE_ERROR_COOLDOWN_SEC;
  }

  /** An agent reaching its spot in Light Labs makes the teleporter capsule beam (Mega Man), once per visit. */
  private fireTeleporterOnArrival(ch: Character): void {
    const spot = ch.zoneSpot;
    if (ch.zoneAt !== Zone.WEB || !spot || this.teleported.has(ch)) return;
    if (ch.tileCol !== spot.col || ch.tileRow !== spot.row) return;
    this.teleported.add(ch);
    if (!areParticlesEnabled()) return;
    for (const f of this.furniture) {
      if (f.type === 'TELEPORTER') {
        this.particles.burstTeleport(f.x + TELEPORT_BEAM_ORIGIN_X, f.y + TELEPORT_BEAM_ORIGIN_Y);
      }
    }
  }

  /** A tool finished: a command done in the DeLorean workshop hits 88 mph. */
  onToolDone(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || ch.matrixEffect || !areParticlesEnabled()) return;
    const spot = ch.zoneSpot;
    if (ch.zoneAt !== Zone.COMMANDS || ch.activityZone !== Zone.COMMANDS || !spot) return;
    if (ch.state !== CharacterState.TYPE || ch.tileCol !== spot.col || ch.tileRow !== spot.row) {
      return;
    }
    this.particles.burst88mph(ch.x, ch.y + TILE_SIZE / 2 - 1);
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.currentTool = tool;
    }
  }

  showPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'permission';
      ch.bubbleTimer = 0;
    }
  }

  clearPermissionBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  /** The user sent a prompt and no tool has started yet. */
  showThinkingBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'thinking';
      ch.bubbleTimer = 0;
    }
  }

  clearThinkingBubble(id: number): void {
    const ch = this.characters.get(id);
    if (ch && ch.bubbleType === 'thinking') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    }
  }

  showWaitingBubble(id: number, awaitingInput = false): void {
    const ch = this.characters.get(id);
    if (ch) {
      ch.bubbleType = 'waiting';
      ch.waitingAwaitingInput = awaitingInput;
      ch.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
      // Turn finished: a little burst of sparks over the head
      if (areParticlesEnabled() && !ch.matrixEffect) {
        const sitting = sittingDropPx(ch);
        this.particles.burstSparks(ch.x, ch.y + sitting - SPARK_HEAD_HEIGHT_PX);
      }
    }
  }

  /** Dismiss bubble on click — permission: instant, waiting: quick fade */
  dismissBubble(id: number): void {
    const ch = this.characters.get(id);
    if (!ch || !ch.bubbleType) return;
    if (ch.bubbleType === 'permission') {
      ch.bubbleType = null;
      ch.bubbleTimer = 0;
    } else if (ch.bubbleType === 'waiting') {
      // Trigger immediate fade (0.3s remaining)
      ch.bubbleTimer = Math.min(ch.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
    }
  }

  // ── Pets ──────────────────────────────────────────────────────

  /**
   * Add a pet to the live runtime. Spawns at a uniformly-random walkable tile.
   * Mirror in `this.layout.pets` so debounced saveLayout serialises the roster.
   * Bounds-checks petType against the loaded sprite count to defend against stale layouts.
   */
  addPet(placedPet: PlacedPet): void {
    // Defensive guards (upstream 5e6c0a0)
    if (
      typeof placedPet.id !== 'string' ||
      placedPet.id.length === 0 ||
      placedPet.id.length > MAX_PET_ID_LENGTH
    ) {
      return;
    }
    if (
      !Number.isInteger(placedPet.petType) ||
      placedPet.petType < 0 ||
      placedPet.petType >= getPetCount()
    ) {
      return;
    }
    if (this.pets.some((p) => p.id === placedPet.id)) return; // de-dupe
    if (this.walkableTiles.length === 0) return; // no spawn space — silently drop

    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)];
    const pet = createPet(placedPet.id, placedPet.petType, spawn.col, spawn.row);
    pet.name = getPetName(placedPet.petType);
    this.pets.push(pet);
    this.syncLayoutPets();
  }

  /** Remove a pet by id. Idempotent. */
  removePet(id: string): void {
    const before = this.pets.length;
    this.pets = this.pets.filter((p) => p.id !== id);
    if (this.pets.length !== before) {
      this.syncLayoutPets();
    }
  }

  /** Shallow snapshot for external consumers (renderer, hooks). */
  getPets(): Pet[] {
    return this.pets.slice();
  }

  /** Unique petType values currently placed. Used by the Pets toolbar to mark active rows. */
  getActivePetTypes(): number[] {
    const seen = new Set<number>();
    for (const p of this.pets) seen.add(p.petType);
    return Array.from(seen);
  }

  /**
   * Hit-test pets at a pixel world position. Sorts back-to-front (largest y wins on tie)
   * so the visually-frontmost pet receives the click.
   * Returns the pet id or null.
   */
  getPetAt(worldX: number, worldY: number): string | null {
    const ordered = this.pets.slice().sort((a, b) => b.y - a.y);
    for (const pet of ordered) {
      const left = pet.x - PET_HIT_HALF_WIDTH;
      const right = pet.x + PET_HIT_HALF_WIDTH;
      const top = pet.y - PET_HIT_HEIGHT;
      const bottom = pet.y;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return pet.id;
      }
    }
    return null;
  }

  /** Show the heart bubble on a pet for WAITING_BUBBLE_DURATION_SEC. */
  showPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet) return;
    pet.bubbleType = 'heart';
    pet.bubbleTimer = WAITING_BUBBLE_DURATION_SEC;
  }

  /** Dismiss the heart bubble on click; collapses timer to a fast fade. */
  dismissPetBubble(petId: string): void {
    const pet = this.pets.find((p) => p.id === petId);
    if (!pet || !pet.bubbleType) return;
    pet.bubbleTimer = Math.min(pet.bubbleTimer, DISMISS_BUBBLE_FAST_FADE_SEC);
  }

  /**
   * Reconcile `this.pets` to match the layout's placed-pet roster.
   * - Pets in layout but not in runtime → spawn via addPet().
   * - Pets in runtime but not in layout → remove.
   * - Pets in both → keep existing runtime state (position, FSM).
   *
   * Called from constructor and rebuildFromLayout. Always runs AFTER walkableTiles
   * is populated.
   */
  private rebuildPetsFromLayout(layout: OfficeLayout): void {
    const placed = layout.pets ?? [];
    const placedIds = new Set(placed.map((p) => p.id));

    // 1. Remove pets no longer in layout
    this.pets = this.pets.filter((p) => placedIds.has(p.id));

    // 2. Add pets that exist in layout but not in runtime
    const existingIds = new Set(this.pets.map((p) => p.id));
    for (const p of placed) {
      if (existingIds.has(p.id)) continue;
      this.addPet(p); // pushes onto this.pets, calls syncLayoutPets()
    }
    // syncLayoutPets() inside addPet keeps this.layout.pets coherent; one final
    // sync handles the removal-only branch where addPet was never called.
    this.syncLayoutPets();
  }

  /**
   * Re-export the current pet roster into `this.layout.pets`. Called only from
   * mutating methods (addPet / removePet / rebuildPetsFromLayout) — NEVER from
   * getLayout(), which runs on every render frame.
   */
  private syncLayoutPets(): void {
    this.layout.pets = this.pets.map((p) => ({ id: p.id, petType: p.petType }));
  }

  setTeamInfo(
    id: number,
    teamName?: string,
    agentName?: string,
    isTeamLead?: boolean,
    leadAgentId?: number,
    teamUsesTmux?: boolean,
  ): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    const wasUnlinked = ch.leadAgentId === undefined;
    ch.teamName = teamName;
    ch.agentName = agentName;
    ch.isTeamLead = isTeamLead;
    ch.leadAgentId = leadAgentId;
    if (teamUsesTmux !== undefined) {
      ch.teamUsesTmux = teamUsesTmux;
    }
    // A teammate is not a headless agent: clicking it focuses its lead's terminal.
    // Adopted sessions are marked headless at creation and only later discovered
    // to be teammates, so drop the mark once the link lands.
    if (leadAgentId !== undefined) {
      ch.isHeadless = false;
    }
    // A teammate discovered only after its plain external session was adopted is
    // linked here, not at creation, so it never went through the seat-next-to-lead
    // path addAgent runs for inline teammates. Cluster it now, once, on first link.
    if (wasUnlinked && leadAgentId !== undefined && !isTeamLead) {
      this.reseatNextToLead(id, leadAgentId);
    }
  }

  /** Mark an agent as headless (adopted, no terminal to focus). */
  setHeadless(id: number, headless: boolean): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.isHeadless = headless;
  }

  setAgentContext(id: number, contextTokens: number, maxContextTokens: number): void {
    const ch = this.characters.get(id);
    if (!ch) return;
    ch.contextTokens = contextTokens;
    ch.maxContextTokens = maxContextTokens;
  }

  update(dt: number): void {
    // Furniture animation cycling
    const prevFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    this.furnitureAnimTimer += dt;
    const newFrame = Math.floor(this.furnitureAnimTimer / FURNITURE_ANIM_INTERVAL_SEC);
    if (newFrame !== prevFrame) {
      this.rebuildFurnitureInstances();
    }
    // Isaac's dance steps faster than the furniture clock: rebuild on each step (and once when it ends)
    const isaacStep = isaacDanceFrame(this.isaacDance, this.furnitureAnimTimer);
    if (isaacStep !== this.isaacStep) {
      this.isaacStep = isaacStep;
      this.rebuildFurnitureInstances();
      if (isaacStep !== null && isaacStep > 0 && isaacStep % ISAAC_CONFETTI_EVERY_STEPS === 0) {
        this.isaacConfetti();
      }
    }

    // The greeter materializes and dematerializes like anyone else, but runs
    // no FSM — it stands where it spawned for as long as the ask is up.
    if (this.greeter && advanceMatrixEffect(this.greeter, dt) === 'despawned') {
      this.greeter = null;
    }

    this.updateParty(dt);

    const toDelete: number[] = [];
    for (const ch of this.characters.values()) {
      const effect = advanceMatrixEffect(ch, dt);
      if (effect !== 'none') {
        if (effect === 'despawned') toDelete.push(ch.id);
        continue; // skip normal FSM while the effect is (or just was) active
      }

      // Cheering or dancing (Fase 5.5): hop in place, nothing else moves
      if (ch.cheerSec > 0) {
        ch.cheerSec = Math.max(0, ch.cheerSec - dt);
        ch.hopTimer += dt;
        ch.breathTimer += dt;
        this.tickBubble(ch, dt);
        continue;
      }
      if (ch.partySpot && this.party) {
        this.updatePartyGuest(ch, dt);
        this.tickBubble(ch, dt);
        continue;
      }
      ch.partySpot = null;

      // An intern resting before going home (Fase 5.1): no zones, just the interns' room
      if (ch.internRestSec !== null) {
        this.updateInternRest(ch, dt);
        if (ch.internRestSec !== null) {
          this.withOwnSeatUnblocked(ch, () =>
            updateCharacter(
              ch,
              dt,
              this.walkableTiles,
              this.seats,
              this.tileMap,
              this.blockedTiles,
            ),
          );
          continue;
        }
      }

      // An intern walking back to its boss: no zones, just the walk, then fade out
      if (ch.leavingSec !== null) {
        ch.leavingSec -= dt;
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles);
        if (ch.leavingSec <= 0 || ch.path.length === 0) {
          ch.leavingSec = null;
          startMatrixEffect(ch, 'despawn');
        }
        continue;
      }

      ch.errorHoldSec = Math.max(0, ch.errorHoldSec - dt);
      ch.errorCooldownSec = Math.max(0, ch.errorCooldownSec - dt);
      const wanted = wantedZone(ch);
      if (shouldSwitchZone(ch, wanted, dt)) this.enterZone(ch, wanted);
      if (!ch.isSubagent) this.updateLeisure(ch, dt);

      // Temporarily unblock own seat so character can pathfind to it
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles),
      );

      this.fireTeleporterOnArrival(ch);
      this.tickBubble(ch, dt);
    }
    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id);
    }

    this.particles.update(dt, this.furniture, areParticlesEnabled());
    if (areParticlesEnabled()) {
      this.musicNotes.update(dt, this.furniture, musicStore.get(), this.particles);
    }

    // ── Pet FSM ────────────────────────────────────────────────
    for (const pet of this.pets) {
      updatePet(pet, dt, this.walkableTiles, this.characters, this.tileMap, this.blockedTiles);

      // Tick heart bubble timer (mirrors character waiting-bubble pattern)
      if (pet.bubbleType) {
        pet.bubbleTimer -= dt;
        if (pet.bubbleTimer <= 0) {
          pet.bubbleType = null;
          pet.bubbleTimer = 0;
        }
      }
    }
  }

  private tickBubble(ch: Character, dt: number): void {
    // Thinking bubble counts up to drive its dot animation
    if (ch.bubbleType === 'thinking') ch.bubbleTimer += dt;

    // Tick bubble timer for waiting bubbles
    if (ch.bubbleType === 'waiting') {
      ch.bubbleTimer -= dt;
      if (ch.bubbleTimer <= 0) {
        ch.bubbleType = null;
        ch.bubbleTimer = 0;
      }
    }
  }

  /** The `saveAgentSeats` payload: palette, hue and seat for every agent worth
   *  restoring. Sub-agents are excluded because they are derived state the
   *  runtime re-materializes, and the greeter never reaches here at all —
   *  it is not in `characters`. */
  getPersistableSeats(): Record<
    number,
    { palette: number; hueShift: number; seatId: string | null }
  > {
    const seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> = {};
    for (const ch of this.characters.values()) {
      if (ch.isSubagent) continue;
      seats[ch.id] = { palette: ch.palette, hueShift: ch.hueShift, seatId: ch.seatId };
    }
    return seats;
  }

  /** Everything the renderer draws: the agents plus, while the first-run ask
   *  is up, the consent greeter. This is the ONE place the greeter joins the
   *  agents — every other consumer reads `characters` and gets agents only. */
  getCharacters(): Character[] {
    const chars = Array.from(this.characters.values());
    if (this.greeter) chars.push(this.greeter);
    return chars;
  }

  /** Get character at pixel position (for hit testing). Returns id or null.
   *  Agents only: clicks pass straight through the consent greeter, which is
   *  a prop, not something to select or follow. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = Array.from(this.characters.values()).sort((a, b) => b.y - a.y);
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue;
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const sittingOffset = sittingDropPx(ch);
      const anchorY = ch.y + sittingOffset;
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH;
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH;
      const top = anchorY - CHARACTER_HIT_HEIGHT;
      const bottom = anchorY;
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id;
      }
    }
    return null;
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}
