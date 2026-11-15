import type { CSSProperties } from 'react';

import type { MarkLabels } from '../../busquedas/webview/searchText.js';

/** The room's id in the search messages (features/busquedas). Same as server/constants.ts FREELANCE_ROOM. */
export const FREELANCE_ROOM = 'freelance';

/** Furniture of the freelance room (webview-ui/public/assets/furniture/FREELANCE_*). */
export const FREELANCE_DESK_TYPE = 'FREELANCE_DESK';
export const FREELANCE_WORLD_MAP_TYPE = 'FREELANCE_WORLD_MAP';
/** The pieces a click opens the panel from: the desk with the three screens (the rest is decoration). */
export const FREELANCE_FURNITURE_TYPES: readonly string[] = [FREELANCE_DESK_TYPE];

export const FREELANCE_KIND_LABELS: Record<string, string> = {
  directo: 'Cliente directo',
  plataforma: 'Plataforma',
  otro: 'Otro',
};

/** The common "contacted" mark (features/busquedas), as this room says it. */
export const FREELANCE_MARK_LABELS: MarkLabels = { contact: 'Postulé', contacted: 'te postulaste' };

/** Limits of the offer editor (the server cuts again: server/constants.ts). */
export const OFFER_TEXT_MAX = 200;
export const OFFER_ITEMS_MAX = 15;

/**
 * The panel's look: green phosphor on black, like the room's screens (features/perfil). It re-points the office's
 * color tokens (webview-ui/src/index.css) inside the panel only, so every shared component follows.
 */
export const FREELANCE_THEME = {
  '--color-bg': '#050c07',
  '--color-bg-dark': '#020603',
  '--color-border': '#1f6b3a',
  '--color-accent': '#1d7a44',
  '--color-accent-bright': '#63e36e',
  '--color-text': '#b8f5c4',
  '--color-text-muted': '#5fa874',
  '--color-btn-bg': '#0d2615',
  '--color-btn-hover': '#174a2a',
  '--color-active-bg': '#145030',
  '--color-status-success': '#63e36e',
  '--color-status-permission': '#e3d063',
} as CSSProperties;

// ── World map pins (the room's live detail) ──
/** The pins drawn in the map's art (top-left of each 2×2 pin), then extra spots on land, in lighting order. */
export const MAP_PINS: readonly { x: number; y: number }[] = [
  { x: 17, y: 11 },
  { x: 33, y: 10 },
  { x: 45, y: 12 },
  { x: 23, y: 21 },
  { x: 50, y: 22 },
  { x: 39, y: 14 },
  { x: 29, y: 17 },
  { x: 44, y: 23 },
];
export const MAP_PIN_SIZE = 2;
export const MAP_PIN_COLOR = '#fbbf24';
/** A pin "pings" brighter in turn, one at a time. */
export const MAP_PIN_PING_COLOR = '#fff3b0';
export const MAP_PIN_PING_SEC = 0.7;
export const MAP_CACHE_MAX = 24;
