/**
 * Private packs, page side (privado/<pack>/webview.tsx, never committed; see server/src/packLoader.ts for the rest).
 * A pack plugs its rooms in here instead of editing the engine: an overlay drawn over the office, changes to the
 * furniture sprites (and extra sprites), clicks on its furniture, walking staff, free-time activities, lights and
 * its own cast of characters. `load.ts` finds the packs at build time and registers them; this module has no build
 * magic so the engine (and its Node tests) can import it.
 *
 * Character sheets are named: a pack ships `assets/characters/<name>.png` and refers to it by `<name>` (see
 * characterSheetIndex in office/sprites/spriteData.ts), so it never takes the place of the office's own char_N.
 *
 * A pack's own messages travel as plain `{ type, ... }` objects that are not in core/asyncapi.yaml: its server
 * features send them, its page code reads them with `transport.onMessage`. Name them after the pack's features.
 */
import type { ComponentType, RefObject } from 'react';

import { GROUND_FLOOR } from '../../../core/src/offices.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import type { OfficeState } from '../office/engine/officeState.js';
import type { LeisureActivityDef } from '../office/leisure/leisure.js';
import type { FurnitureInstance } from '../office/types.js';

/** What a pack's overlay gets to place DOM over the canvas (same projection as the agents' labels). */
export interface PackOverlayProps {
  transport: MessageTransport;
  officeState: OfficeState;
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: RefObject<{ x: number; y: number }>;
  /** The office this page shows. */
  office: string;
  /** The floor of that office this page shows (core/src/offices.ts). */
  floor: string;
}

/**
 * A piece of furniture that is drawn as a person walking around (office/staff/staffCrew.ts): not an agent, no seat,
 * no label. The placed piece stays the editor handle.
 * - worker: works where it was placed, strolls nearby and carries boxes between furniture (`carryBetween`);
 * - guard: keeps its post, and walks to a piece and back on `soundAlarm`;
 * - keeper: works and strolls around its own room, never carries.
 */
export interface StaffRole {
  /** Named character sheet it walks with. */
  sheet: string;
  role?: 'worker' | 'guard' | 'keeper';
}

/** A light a piece of furniture gives at night (office/effects/lighting.ts). */
export interface GlowSpec {
  /** Height of the light from the top of the sprite, sprite px. */
  y: number;
  color: string;
  radius: number;
  intensity: number;
}

/** The characters an office draws instead of the default ones (named sheets). */
export interface OfficeCast {
  /** Agent palette slot N is drawn with bosses[N] (slots without one keep the default boss). */
  bosses?: readonly string[];
  /** Interns come from this shared pool, whoever the boss is (instead of each boss's own interns). */
  interns?: readonly string[];
}

export interface WebviewPack {
  name: string;
  /** Only active in these offices (all of them when absent). */
  offices?: string[];
  /** Only active on these floors of those offices (core/src/offices.ts; every floor when absent). */
  floors?: string[];
  /** Drawn over the office (rooms, signs, panels). */
  Overlay?: ComponentType<PackOverlayProps>;
  /** Swaps furniture sprites or adds sprites, every furniture tick (`timeSec` = the furniture clock). */
  furniture?(
    instances: FurnitureInstance[],
    ctx: { timeSec: number; officeState: OfficeState },
  ): FurnitureInstance[];
  /** A click on the office (world pixels): true when the pack handled it. */
  click?(worldX: number, worldY: number, officeState: OfficeState): boolean;
  /** Whether the pointer over this world point should show a hand. */
  hover?(worldX: number, worldY: number, officeState: OfficeState): boolean;
  /**
   * Every frame: sprites that move on their own (things on a conveyor belt…), drawn on top of the furniture until
   * the next call. Return null to keep the last ones. Call `officeState.refreshFurniture()` when what `furniture`
   * draws changed outside its clock.
   */
  tick?(dt: number, officeState: OfficeState): FurnitureInstance[] | null;
  /** Furniture types drawn as walking staff. */
  staff?: Readonly<Record<string, StaffRole>>;
  /** Extra free-time activities by id; agents may do them while this pack is active. */
  leisure?: Readonly<Record<string, LeisureActivityDef>>;
  /** The agents' whole free-time pool in this pack's offices (built-in ids and its own); by default the office's
   *  pool plus `leisure`. */
  agentLeisure?: readonly string[];
  /** Lights by furniture type. */
  glow?: Readonly<Record<string, GlowSpec>>;
  cast?: OfficeCast;
  /** Agents stay at their desk between turns (no wandering); they only get up for free time. */
  agentsStayAtDesk?: boolean;
}

const packs: WebviewPack[] = [];
let currentOffice: string | undefined;
let currentFloor: string = GROUND_FLOOR;
/** Goes up whenever the active packs may have changed (the office state rebuilds what depends on them). */
let version = 0;

export function registerPack(pack: WebviewPack): void {
  if (packs.some((p) => p.name === pack.name)) return;
  packs.push(pack);
  version++;
}

/** Set once the server says which office (and floor of it) this page shows. */
export function setPackOffice(office: string, floor: string = GROUND_FLOOR): void {
  if (office === currentOffice && floor === currentFloor) return;
  currentOffice = office;
  currentFloor = floor;
  version++;
}

export function packsVersion(): number {
  return version;
}

/** Tests only: forget every pack and the office. */
export function resetPacksForTests(): void {
  packs.length = 0;
  currentOffice = undefined;
  currentFloor = GROUND_FLOOR;
  version++;
}

/** The packs active in this page's office and floor. */
export function activePacks(): readonly WebviewPack[] {
  return packs.filter(
    (p) =>
      (!p.offices || (currentOffice !== undefined && p.offices.includes(currentOffice))) &&
      (!p.floors || p.floors.includes(currentFloor)),
  );
}

/** Runs every active pack's furniture step (a pack that throws is skipped, the office keeps drawing). */
export function applyPackFurniture(
  instances: FurnitureInstance[],
  ctx: { timeSec: number; officeState: OfficeState },
): FurnitureInstance[] {
  let out = instances;
  for (const pack of activePacks()) {
    if (!pack.furniture) continue;
    try {
      out = pack.furniture(out, ctx);
    } catch (err) {
      console.error(`[Packs] ${pack.name}: furniture`, err);
    }
  }
  return out;
}

export function packClick(worldX: number, worldY: number, officeState: OfficeState): boolean {
  return activePacks().some((p) => p.click?.(worldX, worldY, officeState) ?? false);
}

export function packHover(worldX: number, worldY: number, officeState: OfficeState): boolean {
  return activePacks().some((p) => p.hover?.(worldX, worldY, officeState) ?? false);
}

/** The live sprites of every active pack (see WebviewPack.tick); `last` holds each pack's previous answer. */
export function packTick(
  dt: number,
  officeState: OfficeState,
  last: Map<string, FurnitureInstance[]>,
): FurnitureInstance[] {
  const out: FurnitureInstance[] = [];
  for (const pack of activePacks()) {
    if (!pack.tick) continue;
    try {
      const next = pack.tick(dt, officeState);
      if (next) last.set(pack.name, next);
    } catch (err) {
      console.error(`[Packs] ${pack.name}: tick`, err);
    }
    out.push(...(last.get(pack.name) ?? []));
  }
  return out;
}

/** Furniture types drawn as walking staff, from every active pack. */
export function packStaffRoles(): ReadonlyMap<string, StaffRole> {
  const out = new Map<string, StaffRole>();
  for (const pack of activePacks()) {
    for (const [type, role] of Object.entries(pack.staff ?? {}))
      if (!out.has(type)) out.set(type, role);
  }
  return out;
}

/** The agents' free-time pool: the first active pack's own, else `base` plus every active pack's activities. */
export function packAgentLeisure(base: readonly string[]): readonly string[] {
  const active = activePacks();
  const own = active.find((p) => p.agentLeisure)?.agentLeisure;
  if (own) return own;
  const extra = active.flatMap((p) => Object.keys(p.leisure ?? {}));
  return extra.length ? [...base, ...extra] : base;
}

/** A pack's free-time activity by id, whatever the office (it only matters where its furniture is). */
export function packLeisureDef(id: string): LeisureActivityDef | undefined {
  for (const pack of packs) {
    const def = pack.leisure?.[id];
    if (def) return def;
  }
  return undefined;
}

export function packGlow(type: string): GlowSpec | undefined {
  for (const pack of activePacks()) {
    const glow = pack.glow?.[type];
    if (glow) return glow;
  }
  return undefined;
}

/** The cast of the first active pack that has one. */
export function packCast(): OfficeCast | undefined {
  return activePacks().find((p) => p.cast)?.cast;
}

export function packAgentsStayAtDesk(): boolean {
  return activePacks().some((p) => p.agentsStayAtDesk === true);
}
