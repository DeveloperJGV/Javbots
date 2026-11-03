/**
 * Private packs, page side (privado/<pack>/webview.tsx, never committed; see server/src/packLoader.ts for the rest).
 * A pack plugs its rooms in here instead of editing the engine: an overlay drawn over the office, changes to the
 * furniture sprites (and extra sprites), and clicks on its furniture. `load.ts` finds the packs at build time and
 * registers them; this module has no build magic so the engine (and its Node tests) can import it.
 *
 * A pack's own messages travel as plain `{ type, ... }` objects that are not in core/asyncapi.yaml: its server
 * features send them, its page code reads them with `transport.onMessage`. Name them after the pack's features.
 */
import type { ComponentType, RefObject } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import type { OfficeState } from '../office/engine/officeState.js';
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
}

export interface WebviewPack {
  name: string;
  /** Only active in these offices (all of them when absent). */
  offices?: string[];
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
}

const packs: WebviewPack[] = [];
let currentOffice: string | undefined;

export function registerPack(pack: WebviewPack): void {
  if (!packs.some((p) => p.name === pack.name)) packs.push(pack);
}

/** Set once the server says which office this page shows. */
export function setPackOffice(office: string): void {
  currentOffice = office;
}

/** The packs active in this page's office. */
export function activePacks(): readonly WebviewPack[] {
  return packs.filter(
    (p) => !p.offices || (currentOffice !== undefined && p.offices.includes(currentOffice)),
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
