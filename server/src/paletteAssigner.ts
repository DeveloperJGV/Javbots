/**
 * Server-side palette assignment helper.
 *
 * Assigns palette and hueShift to agents when they're created, ensuring
 * consistent character appearance across all connected clients.
 */

import { pickDiversePalette } from '../../core/src/paletteUtils.js';
import type { AgentStateStore } from './agentStateStore.js';
import { PALETTE_COUNT } from './constants.js';
import type { AgentState } from './types.js';

/**
 * Runtime palette count. External asset directories can add char_N.png
 * beyond the bundled 6 (loadExternalCharacterSprites accepts any N), so the
 * count is dynamic. Defaults to PALETTE_COUNT until setPaletteCount is
 * called after assets load. Mirrors the setHookProvider / setTeamSwitch
 * module-level setter pattern in transcriptParser.ts.
 */
let currentPaletteCount = PALETTE_COUNT;

/** Set the palette count after asset loading (standalone + VS Code). Capped at
 *  PALETTE_COUNT: only the boss sheets char_0..5 are agents; higher char_N are
 *  interns (fork, Fase 4B) and must never be handed to an agent. */
export function setPaletteCount(count: number): void {
  currentPaletteCount = Math.min(PALETTE_COUNT, Math.max(1, Math.floor(count)));
}

/**
 * Assign palette and hueShift to an agent if not already set.
 * Uses the diversity algorithm to pick a palette that's least used among
 * existing agents.
 *
 * @param agent - The agent to assign a palette to (mutated in place)
 * @param store - The agent state store (used to count existing palettes)
 */
export function assignPaletteIfNeeded(agent: AgentState, store: AgentStateStore): void {
  const count = currentPaletteCount;
  // A remembered intern sheet (handed out before the cap above) is re-picked.
  if (agent.palette !== undefined && agent.palette < count) return;

  const paletteCounts = new Array(count).fill(0);
  for (const existing of store.values()) {
    if (existing.palette !== undefined && existing.palette < count) {
      paletteCounts[existing.palette]++;
    }
  }

  const pick = pickDiversePalette(count, paletteCounts);
  agent.palette = pick.palette;
  agent.hueShift = pick.hueShift;
}
