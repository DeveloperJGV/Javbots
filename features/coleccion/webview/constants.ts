import type { CSSProperties } from 'react';

/** The piece that opens the collection panel (features/coleccion/assets/furniture/COLECCION_SHELF). */
export const COLECCION_SHELF_TYPE = 'COLECCION_SHELF';
export const COLECCION_PANEL_TYPES: readonly string[] = [COLECCION_SHELF_TYPE];

/** Opening the page with this hash opens the panel (a link, or a check script, without the furniture). */
export const COLECCION_OPEN_HASH = '#coleccion';

// ── Shelves ────────────────────────────────────────────────────────────────────────────────
/** Pixels an arrow button moves a shelf. */
export const SHELF_ARROW_STEP_PX = 420;
/** A press that moves less than this is a click, not a drag. */
export const SHELF_DRAG_SLOP_PX = 6;
/** Margin kept between a focused box and the shelf's edges when it scrolls to it. */
export const SHELF_FOCUS_MARGIN_PX = 60;
/** A searched series stays lit this long. */
export const SERIES_GLOW_MS = 6000;
/** Empty slots drawn on an empty shelf (the invitation to fill it). */
export const EMPTY_SLOTS = 9;
/** A game added in the last days gets its little star. */
export const NEW_STAR_DAYS = 7;
/** A game not played in this long gathers dust (a year and a half). */
export const DUST_DAYS = 540;
/** "Borrar" goes back to normal after this long without the second click. */
export const CONFIRM_RESET_MS = 4000;
/** "✓ Guardado" stays this long in the form. */
export const SAVED_NOTE_MS = 2600;
/** Most suggestions under the search box. */
export const SUGGEST_LIMIT = 8;

// ── Texts ──────────────────────────────────────────────────────────────────────────────────
export const REGION_LABEL: Record<string, string> = {
  'ntsc-u': 'NTSC-U',
  pal: 'PAL',
  'ntsc-j': 'NTSC-J',
  otra: 'Otra',
};
export const CONDITION_LABEL: Record<string, string> = {
  completo: 'Completo',
  suelto: 'Suelto',
  sellado: 'Sellado',
};
export const PROGRESS_LABEL: Record<string, string> = {
  'sin-jugar': 'Sin jugar',
  'a-medias': 'A medias',
  terminado: 'Terminado',
  'de-siempre': 'De siempre',
};
export const LENGTH_LABEL: Record<string, string> = {
  rato: 'Un rato de 30 min',
  '1h': 'Como 1 h',
  tarde: 'Toda la tarde',
};

// ── Colors (only here: lint rule no-inline-colors) ─────────────────────────────────────────
export const COL_INK = '#0a0a14';
export const COL_DEFAULT_TINT = '#1f3a22';
/** What a console's color is mixed with for the panel's background. */
export const COL_TINT_BASE = '#0c0c14';
/** Wanted gaps: dashed red. */
export const COL_WANTED = '#ff8a8a';
/** A series plaque and its underline. */
export const COL_SERIES = '#cca700';
/** Paper of the case's back and of the "se busca" poster. */
export const COL_PAPER = '#efe3c6';
export const COL_PAPER_INK = '#2b2233';
/** Disc colors (drawn on a canvas). */
export const DISC_COLORS = {
  hub: '#bfc4cc',
  light: '#e8ecf2',
  dark: '#d0d6de',
  rim: '#8a8f99',
} as const;
/** Cover drawing: stars, lit windows, snow… */
export const COVER_COLORS = {
  white: '#ffffff',
  warm: '#ffe28a',
  steel: '#e8e8ec',
  gold: '#e0aa3e',
  wood: '#6e3a1c',
  dark: '#1b1a2a',
  road: '#2a2a33',
  tire: '#111111',
  flame: '#ff8d14',
  ball: '#f2f2f2',
  moon: '#f2efe6',
  shade: 'rgba(0,0,0,.45)',
  groove: 'rgba(0,0,0,.35)',
  shine: 'rgba(255,255,255,.25)',
  dim: 'rgba(0,0,0,.3)',
} as const;
/** Gamepad drawn in "¿Qué jugamos hoy?" (body, d-pad, four face buttons). */
export const PAD_COLORS = {
  body: '#e8e8ec',
  dpad: '#2a2a33',
  a: '#3c9a2f',
  b: '#d14249',
  x: '#2b5aa8',
  y: '#e0aa3e',
} as const;

/** How a platform's games look on the shelf: spine (or cartridge) size in px and colors. */
export interface PlatformLook {
  w: number;
  h: number;
  /** Case or cartridge plastic. */
  box: string;
  /** The band at the top of the spine (cartridge: its label). */
  band: string;
  bandText: string;
  /** Spine text. */
  text: string;
  /** The rail's swatch, the shelf's light and the background tint. */
  accent: string;
}

export const PLATFORM_LOOKS: Record<string, PlatformLook> = {
  nes: {
    w: 44,
    h: 78,
    box: '#9b9b9b',
    band: '#1d1d1d',
    bandText: '#ffffff',
    text: '#ffffff',
    accent: '#c8312e',
  },
  snes: {
    w: 44,
    h: 70,
    box: '#b9b5ae',
    band: '#5b4a8a',
    bandText: '#ffffff',
    text: '#ffffff',
    accent: '#7a68b8',
  },
  n64: {
    w: 46,
    h: 66,
    box: '#4a4a50',
    band: '#2b5aa8',
    bandText: '#ffffff',
    text: '#ffffff',
    accent: '#2b8a3e',
  },
  ps1: {
    w: 20,
    h: 118,
    box: '#1b1b20',
    band: '#6a6f78',
    bandText: '#ffffff',
    text: '#e8e8ec',
    accent: '#9aa0a8',
  },
  gc: {
    w: 22,
    h: 112,
    box: '#18181e',
    band: '#e8e8ec',
    bandText: '#18181e',
    text: '#e8e8ec',
    accent: '#6a5acd',
  },
  xbox: {
    w: 22,
    h: 132,
    box: '#141418',
    band: '#3c9a2f',
    bandText: '#ffffff',
    text: '#e8e8ec',
    accent: '#3c9a2f',
  },
  ps2: {
    w: 22,
    h: 132,
    box: '#101014',
    band: '#20202a',
    bandText: '#99aabb',
    text: '#e8e8ec',
    accent: '#2b4aa8',
  },
  x360: {
    w: 22,
    h: 132,
    box: '#3c9a2f',
    band: '#e8e8ec',
    bandText: '#3c9a2f',
    text: '#ffffff',
    accent: '#5ccf3c',
  },
  wii: {
    w: 22,
    h: 132,
    box: '#e8e8ec',
    band: '#9aa0a8',
    bandText: '#ffffff',
    text: '#2a2a33',
    accent: '#bfc4cc',
  },
  ps3: {
    w: 20,
    h: 128,
    box: '#16161b',
    band: '#c9ccd2',
    bandText: '#16161b',
    text: '#e8e8ec',
    accent: '#8a8f99',
  },
  wiiu: {
    w: 22,
    h: 132,
    box: '#2a7fc0',
    band: '#e8e8ec',
    bandText: '#2a7fc0',
    text: '#ffffff',
    accent: '#38a8e8',
  },
  xone: {
    w: 20,
    h: 128,
    box: '#1d7a2a',
    band: '#e8e8ec',
    bandText: '#1d7a2a',
    text: '#ffffff',
    accent: '#3cbf4f',
  },
  ps4: {
    w: 20,
    h: 128,
    box: '#1d3f8a',
    band: '#e8e8ec',
    bandText: '#1d3f8a',
    text: '#ffffff',
    accent: '#3f6fd8',
  },
  switch: {
    w: 18,
    h: 108,
    box: '#d1262f',
    band: '#f2f2f2',
    bandText: '#d1262f',
    text: '#ffffff',
    accent: '#e8434b',
  },
  ps5: {
    w: 20,
    h: 128,
    box: '#f2f2f6',
    band: '#2a5ad8',
    bandText: '#ffffff',
    text: '#1b1a2a',
    accent: '#3f6fd8',
  },
  xsx: {
    w: 20,
    h: 128,
    box: '#0e7a2a',
    band: '#101014',
    bandText: '#2fbf4f',
    text: '#ffffff',
    accent: '#2fbf4f',
  },
};
/** A platform the office doesn't know (written by hand in the file). */
export const UNKNOWN_LOOK: PlatformLook = {
  w: 22,
  h: 124,
  box: '#5a5a6a',
  band: '#2a2a33',
  bandText: '#ffffff',
  text: '#ffffff',
  accent: '#8a8aa0',
};
export const lookOf = (platform: string): PlatformLook => PLATFORM_LOOKS[platform] ?? UNKNOWN_LOOK;

/** The CSS variables a platform's pieces read. */
export function lookVars(look: PlatformLook): CSSProperties {
  return {
    '--cb': look.box,
    '--cband': look.band,
    '--cbt': look.bandText,
    '--ct': look.text,
    '--cc': look.accent,
  } as CSSProperties;
}

/** A cover's base color from its hue (HSL, the cover is drawn in pixels). */
export const hsl = (h: number, s: number, l: number): string => `hsl(${h} ${s}% ${l}%)`;

/**
 * The panel's styles. The shelves, the case that opens in 3D and the animations need real CSS, so it lives here as
 * a string the panel injects (like decks).
 */
export const COLECCION_CSS = `
@property --col-tint { syntax: '<color>'; inherits: true; initial-value: ${COL_DEFAULT_TINT}; }
.col-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); }
.col-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(1120px, 96vw);
  height: min(760px, calc(100vh - 24px)); overflow: hidden; color: var(--color-text); border: 2px solid var(--color-border);
  box-shadow: 2px 2px 0px ${COL_INK}, 4px 4px 0px ${COL_INK}; --ink: ${COL_INK}; --col-tint: ${COL_DEFAULT_TINT};
  --wood: #8a5a34; --wood-light: #b07a48; --wood-dark: #4e3020; --wood-back: #22150f; --wanted: ${COL_WANTED};
  --series: ${COL_SERIES}; --paper: ${COL_PAPER}; --paper-ink: ${COL_PAPER_INK}; --paper-muted: #7b6a58;
  transition: --col-tint .7s ease;
  background: radial-gradient(ellipse 80% 60% at 55% 40%, color-mix(in srgb, var(--col-tint) 60%, transparent) 0, transparent 70%),
    linear-gradient(180deg, color-mix(in srgb, var(--col-tint) 35%, var(--color-bg-dark)) 0, var(--color-bg-dark) 85%); }
.col-panel::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 40;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px); }
.col-panel button, .col-panel input, .col-panel textarea { font: inherit; color: inherit; border-radius: 0; }
.col-panel button { cursor: pointer; }
.col-panel button:disabled { cursor: default; opacity: var(--btn-disabled-opacity); }
.col-panel :focus-visible { outline: 2px solid var(--color-accent-bright); outline-offset: 1px; }
.col-head { position: absolute; left: 0; right: 0; top: 0; height: 72px; display: flex; align-items: center; gap: 12px;
  padding: 0 16px; z-index: 6; }
.col-head h1 { margin: 0; font-size: 30px; font-weight: normal; text-shadow: 2px 2px 0px var(--ink); white-space: nowrap; line-height: 1; }
.col-head .sub { font-size: 16px; color: var(--color-text-muted); margin-top: 4px; white-space: nowrap; }
.col-head .sub b { color: var(--color-text); font-weight: normal; } .col-head .sub i { font-style: normal; color: var(--wanted); }
.col-search { position: relative; margin-left: auto; }
.col-search input { width: 270px; background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 5px 10px 5px 32px;
  outline: none; box-shadow: 2px 2px 0px var(--ink); font-size: 18px; }
.col-search input:focus { border-color: var(--color-accent-bright); }
.col-search input::placeholder { color: var(--color-text-muted); }
.col-search svg { position: absolute; left: 10px; top: 12px; opacity: .6; }
.col-sugg { position: absolute; top: 42px; right: 0; width: 380px; background: var(--color-bg); border: 2px solid var(--color-accent-bright);
  box-shadow: 2px 2px 0px var(--ink); z-index: 30; }
.col-sugg button { display: flex; width: 100%; gap: 10px; align-items: center; background: none; border: 0; padding: 5px 10px;
  text-align: left; font-size: 18px; }
.col-sugg button[aria-selected=true], .col-sugg button:hover { background: var(--color-active-bg); }
.col-sugg .mini { width: 12px; height: 26px; flex: none; }
.col-sugg .mini.gap { border: 2px dashed var(--wanted); }
.col-sugg small { margin-left: auto; color: var(--color-text-muted); font-size: 16px; white-space: nowrap; }
.col-sugg .none { padding: 8px 10px; font-size: 16px; color: var(--color-text-muted); }
.col-btn { background: var(--color-btn-bg); border: 2px solid var(--color-border); box-shadow: 2px 2px 0px var(--ink); padding: 4px 12px;
  font-size: 18px; white-space: nowrap; }
.col-btn:hover:not(:disabled) { background: var(--color-btn-hover); border-color: var(--color-accent-bright); }
.col-btn.big { background: #f2efe6; color: #1b1a2a !important; border-color: #fff; padding: 6px 14px;
  box-shadow: 2px 2px 0px var(--ink), 4px 4px 0px var(--ink); }
.col-btn.big:hover:not(:disabled) { background: #fff; }
.col-btn.acc { background: var(--color-accent); border-color: var(--color-accent-bright); }
.col-btn.acc:hover:not(:disabled) { background: var(--color-accent-bright); }
.col-btn.danger { background: var(--color-danger); border-color: var(--color-danger); }
.col-btn.ghost { background: none; box-shadow: none; border-color: transparent; color: var(--color-text-muted); }
.col-btn.ghost:hover:not(:disabled) { color: var(--color-text); background: none; }
.col-sq { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; font-size: 22px; line-height: 1; flex: none; }
.col-body { position: absolute; inset: 72px 0 0 0; }

/* rail */
.col-rail { position: absolute; left: 12px; top: 4px; bottom: 12px; width: 178px; display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; scrollbar-width: none; }
.col-rail .era { font-size: 16px; color: var(--color-text-muted); margin: 8px 0 2px 4px; text-transform: uppercase; letter-spacing: 1px; }
.col-rail button.p { display: flex; align-items: center; gap: 8px; background: none; border: 2px solid transparent; padding: 2px 6px;
  font-size: 18px; text-align: left; }
.col-rail button.p:hover { background: rgba(255,255,255,.06); }
.col-rail button.p.on { border-color: var(--color-accent-bright); background: var(--color-active-bg); }
.col-rail button.p i { width: 10px; height: 18px; flex: none; background: var(--cc); box-shadow: inset -2px 0 0 rgba(0,0,0,.35); }
.col-rail button.p span { margin-left: auto; color: var(--color-text-muted); font-size: 16px; }
.col-rail .opts { margin-top: auto; display: flex; flex-direction: column; gap: 6px; padding-top: 10px; }
.col-chip { background: var(--color-btn-bg); border: 2px solid var(--color-border); padding: 3px 8px; font-size: 18px; text-align: left; }
.col-chip:hover:not(:disabled) { border-color: var(--color-accent-bright); }
.col-chip[aria-pressed=true] { background: var(--color-active-bg); border-color: var(--color-accent-bright); }
.col-chip .sw { display: inline-block; width: 8px; height: 14px; margin-right: 6px; background: var(--cc); vertical-align: -1px; }

/* shelves */
.col-shelves { position: absolute; left: 202px; right: 12px; top: 0; bottom: 0; overflow-y: auto; overflow-x: hidden;
  scroll-behavior: smooth; padding: 18px 10px 40px 4px; scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
.col-shelf { position: relative; margin-bottom: 22px; }
.col-shelf .top { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px 2px; }
.col-shelf .top h3 { margin: 0; font-size: 22px; font-weight: normal; }
.col-shelf .top .count { font-size: 16px; color: var(--color-text-muted); }
.col-shelf .top .count b { color: var(--color-text); font-weight: normal; } .col-shelf .top .count em { font-style: normal; color: var(--wanted); }
.col-shelf .top .star { font-size: 16px; color: var(--series); }
.col-shelf .top .arrows { margin-left: auto; display: flex; gap: 4px; }
.col-shelf .top .arrows button { width: 28px; height: 24px; padding: 0; background: var(--color-btn-bg); border: 2px solid var(--color-border);
  font-size: 14px; line-height: 1; }
.col-shelf .top .arrows button:hover:not(:disabled) { border-color: var(--color-accent-bright); }
.col-wood { position: relative; background: var(--wood-back); padding: 12px 0 0; overflow: hidden; touch-action: pan-y;
  box-shadow: inset 4px 0 0 var(--wood), inset -4px 0 0 var(--wood), inset 0 4px 0 var(--wood), 3px 3px 0 rgba(0,0,0,.35); }
.col-wood::after { z-index: 1; content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: var(--wood);
  box-shadow: inset 0 3px 0 var(--wood-light), inset 0 -3px 0 var(--wood-dark); }
.col-shelf.lit .col-wood { background: linear-gradient(180deg, color-mix(in srgb, var(--cc) 40%, #0c0c12) 0, var(--wood-back) 70%); }
.col-shelf.lit .col-wood::before { content: ''; position: absolute; left: 4px; right: 4px; top: 4px; height: 3px; background: var(--cc);
  box-shadow: 0 0 10px 2px var(--cc); z-index: 2; animation: col-led 3s steps(6) infinite; }
@keyframes col-led { 50% { opacity: .65; } }
.col-track { z-index: 2; position: relative; display: flex; align-items: flex-end; gap: 1px; padding: 0 14px 16px; height: var(--h);
  transition: transform .35s cubic-bezier(.2,.8,.2,1); will-change: transform; width: max-content; min-width: 100%; }
.col-track.dragging { transition: none; }
.col-box { position: relative; flex: none; width: var(--w); height: var(--hh); border: 0; padding: 0; background: var(--cb);
  box-shadow: inset 1px 0 0 rgba(255,255,255,.22), inset -1px 0 0 rgba(0,0,0,.55); transition: transform .12s steps(3), filter .3s;
  outline: none; }
.col-box:hover, .col-box.sel { transform: translateY(-8px); }
.col-box.sel, .col-box:focus-visible { box-shadow: 0 0 0 2px #fff; outline: none; }
.col-box.dim { filter: brightness(.35) saturate(.4); }
.col-box.glow { animation: col-glow .8s steps(2) infinite; }
@keyframes col-glow { 50% { box-shadow: 0 0 0 2px #fff3b0, 0 0 12px 2px #e0aa3e; } }
.col-box.gone { opacity: 0; }
.col-box .t { position: absolute; left: 0; right: 0; writing-mode: vertical-rl; display: flex; align-items: center; justify-content: flex-start;
  font-size: 16px; line-height: 1; white-space: nowrap; overflow: hidden; color: var(--ct); }
.col-box .band { position: absolute; left: 0; right: 0; top: 0; background: var(--cband); }
.col-box .cube { position: absolute; left: 50%; width: 8px; height: 8px; margin-left: -4px; background: var(--cc);
  box-shadow: inset -2px -2px 0 rgba(0,0,0,.35); }
.col-box .dust { position: absolute; left: 1px; right: 1px; top: -3px; height: 3px;
  background: repeating-linear-gradient(90deg, #b9b1a4 0 2px, transparent 2px 4px); }
.col-box .note { position: absolute; top: -9px; left: 50%; margin-left: -4px; width: 8px; height: 10px; background: #ffd84a;
  box-shadow: 1px 1px 0 var(--ink); }
.col-box.sealed::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.35) 42%, transparent 52%); }
.col-box .new { position: absolute; top: -12px; left: 50%; width: 6px; height: 6px; margin-left: -3px; background: #fff3b0;
  box-shadow: 0 0 0 1px #e0aa3e; animation: col-star 1s steps(2) infinite; }
@keyframes col-star { 50% { transform: scale(.5); } }
.col-box.cart { box-shadow: inset 2px 0 0 rgba(255,255,255,.25), inset -2px 0 0 rgba(0,0,0,.35); }
.col-box.cart .label { position: absolute; left: 4px; right: 4px; top: 8px; bottom: 18px; background: var(--cband);
  box-shadow: inset 0 0 0 2px rgba(0,0,0,.35); overflow: hidden; }
.col-box.cart .label canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.col-box.cart .label .t { top: 2px; bottom: 2px; color: #fff; text-shadow: 1px 1px 0 #000; justify-content: center; }
.col-box.cart .ribs { position: absolute; left: 5px; right: 5px; bottom: 5px; height: 8px;
  background: repeating-linear-gradient(90deg, rgba(0,0,0,.35) 0 2px, transparent 2px 4px); }
.col-gap { position: relative; flex: none; width: var(--w); height: var(--hh); border: 2px dashed var(--wanted); background: rgba(255,90,90,.06);
  padding: 0; outline: none; animation: col-gap 2.4s steps(4) infinite; color: var(--wanted); }
@keyframes col-gap { 50% { background: rgba(255,90,90,.14); } }
.col-gap:hover, .col-gap.sel, .col-gap:focus-visible { border-style: solid; transform: translateY(-4px); }
.col-gap .t { position: absolute; inset: 4px 0; writing-mode: vertical-rl; display: flex; align-items: center; justify-content: center;
  font-size: 16px; white-space: nowrap; overflow: hidden; }
.col-gap .price { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); background: #f2efe6; color: #1b1a2a; font-size: 16px;
  line-height: 1; padding: 1px 4px; white-space: nowrap; box-shadow: 1px 1px 0 var(--ink); z-index: 3; }
.col-gap.glow { animation: col-glow .8s steps(2) infinite; }
.col-gap.dim { opacity: .35; }
.col-slot { flex: none; width: var(--w); height: var(--hh); border: 2px dashed rgba(255,255,255,.18); background: rgba(255,255,255,.02); }
.col-slot.add { display: grid; place-items: center; color: rgba(255,255,255,.55); font-size: 22px; border-color: rgba(255,255,255,.35);
  background: rgba(255,255,255,.04); }
.col-slot.add:hover { border-style: solid; border-color: var(--color-accent-bright); color: #fff; }
.col-run { display: flex; align-items: flex-end; gap: 1px; position: relative; padding: 0 3px; }
.col-run.series { background: rgba(255,255,255,.04); box-shadow: inset 0 -3px 0 var(--series); margin: 0 6px; }
.col-run .plaque { position: absolute; bottom: -16px; left: 2px; max-width: calc(100% - 4px); overflow: hidden; font-size: 16px; line-height: 16px;
  color: #f2d58a; white-space: nowrap; z-index: 3; background: var(--wood); padding: 0 4px; }
.col-more { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; font-size: 16px; color: var(--color-text-muted); }

/* empty */
.col-empty { position: absolute; left: 202px; right: 12px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center;
  gap: 18px; padding: 0 30px 30px; }
.col-empty h2 { margin: 0; font-size: 36px; font-weight: normal; text-shadow: 2px 2px 0px var(--ink); }
.col-empty p { margin: 0; font-size: 20px; color: var(--color-text-muted); max-width: 620px; line-height: 1.25; }
.col-empty .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

/* "se busca" poster */
.col-poster { position: absolute; right: 22px; bottom: 18px; width: 320px; background: #f1e3c0; color: #3a2410; padding: 10px 14px 12px;
  z-index: 18; box-shadow: 2px 2px 0 var(--ink), 4px 4px 0 var(--ink); transform: rotate(1deg); font-size: 18px; line-height: 1.2;
  animation: col-pop .25s steps(3); }
@keyframes col-pop { from { opacity: 0; transform: translateY(8px) rotate(1deg); } }
.col-poster h4 { margin: 0; text-align: center; font-size: 30px; font-weight: normal; letter-spacing: 3px; color: #8a2229; }
.col-poster .name { text-align: center; font-size: 22px; margin: 4px 0 8px; }
.col-poster .p { display: flex; justify-content: space-between; gap: 10px; border-top: 2px dashed #c9b48a; padding: 4px 0; }
.col-poster .p span:last-child { text-align: right; }
.col-poster .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.col-poster .acts button { background: #3a2410; color: #fff; border: 2px solid #3a2410; padding: 2px 8px; font-size: 16px; }
.col-poster .acts button.yes { background: #2f6b2a; border-color: #2f6b2a; }
.col-poster .acts button.ghost { background: none; color: #3a2410; }
.col-poster .acts button.danger { background: #8a2229; border-color: #8a2229; }

/* the case */
.col-veil { position: absolute; inset: 0; background: rgba(8,8,16,.75); z-index: 20; animation: col-fade .3s; }
@keyframes col-fade { from { background: rgba(8,8,16,0); } }
.col-table { position: absolute; left: 50%; top: calc(50% - 30px); width: 0; height: 0; z-index: 21; perspective: 1600px; }
.col-case { position: absolute; left: -340px; top: -235px; width: 680px; height: 470px; transform-style: preserve-3d; }
.col-case .base { position: absolute; left: 340px; top: 0; width: 340px; height: 470px; background: #1d1d24;
  box-shadow: inset 0 0 0 6px var(--cb), 4px 4px 0 var(--ink); display: grid; place-items: center; }
.col-case .lid { position: absolute; left: 340px; top: 0; width: 340px; height: 470px; transform-origin: left center; transform-style: preserve-3d; }
.col-case .face { position: absolute; inset: 0; backface-visibility: hidden; }
.col-case .front { background: var(--cb); padding: 10px; box-shadow: 4px 4px 0 var(--ink); display: flex; flex-direction: column; gap: 0; }
.col-case .front .band { height: 36px; background: var(--cband); display: flex; align-items: center; padding: 0 10px; font-size: 18px;
  color: var(--cbt); letter-spacing: 1px; flex: none; }
.col-case .front canvas { width: 100%; flex: 1; min-height: 0; image-rendering: pixelated; display: block; }
.col-case .front .label { position: absolute; left: 22px; right: 22px; bottom: 26px; background: rgba(10,10,20,.82); color: #fff; padding: 6px 8px;
  font-size: 22px; line-height: 1.05; box-shadow: 2px 2px 0 var(--ink); }
.col-case .back { transform: rotateY(180deg); background: var(--paper); color: var(--paper-ink); padding: 18px 22px;
  box-shadow: inset -10px 0 0 -6px rgba(0,0,0,.15); overflow-y: auto; scrollbar-width: thin; }
.col-case .back .cons { display: inline-block; font-size: 16px; padding: 2px 6px; background: var(--cb); color: var(--ct); }
.col-case .back h2 { margin: 8px 0 4px; font-size: 30px; font-weight: normal; line-height: 1.02; overflow-wrap: anywhere; }
.col-case .back .line { font-size: 18px; color: var(--paper-muted); margin-bottom: 12px; }
.col-case .back .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.col-case .back .facts div { background: rgba(0,0,0,.05); padding: 4px 8px; font-size: 18px; line-height: 1.1; }
.col-case .back .facts span { display: block; font-size: 16px; color: var(--paper-muted); }
.col-case .back h4 { margin: 12px 0 6px; font-size: 16px; font-weight: normal; color: var(--paper-muted); letter-spacing: 1px; text-transform: uppercase; }
.col-case .back .series { display: flex; gap: 4px; flex-wrap: wrap; }
.col-case .back .series i { width: 22px; height: 30px; background: var(--cb); box-shadow: inset 0 3px 0 var(--cband); }
.col-case .back .series i.gap { background: transparent; border: 2px dashed #b0472f; box-shadow: none; }
.col-case .back .series i.me { outline: 2px solid var(--paper-ink); outline-offset: 1px; }
.col-case .back .small { font-size: 16px; color: var(--paper-muted); margin-top: 6px; }
.col-case .back .notes { font-size: 18px; white-space: pre-line; overflow-wrap: anywhere; }
.col-disc { width: 240px; height: 240px; image-rendering: pixelated; animation: col-spin 6s linear infinite; }
.col-disc.mini { width: 170px; height: 170px; }
@keyframes col-spin { to { transform: rotate(360deg); } }
.col-cartridge { width: 210px; height: 231px; image-rendering: pixelated; }
.col-controls { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 8px; z-index: 22;
  animation: col-fade-in .3s .9s both; flex-wrap: nowrap; }
@keyframes col-fade-in { from { opacity: 0; } }

/* sheets: form and "¿Qué jugamos hoy?" */
.col-sheet { position: absolute; left: 50%; top: 84px; transform: translateX(-50%); width: min(720px, calc(100% - 32px));
  max-height: calc(100% - 100px); overflow-y: auto; background: var(--color-bg); border: 2px solid var(--color-accent-bright);
  box-shadow: 2px 2px 0 var(--ink), 4px 4px 0 var(--ink); z-index: 25; padding: 14px 18px 16px; animation: col-pop2 .2s steps(3);
  scrollbar-width: thin; }
@keyframes col-pop2 { from { opacity: 0; transform: translate(-50%, 8px); } }
.col-sheet h3 { margin: 0 0 8px; font-size: 26px; font-weight: normal; display: flex; align-items: center; gap: 10px; }
.col-sheet h3 .x { margin-left: auto; }
.col-q { display: flex; align-items: center; gap: 6px; margin: 8px 0; font-size: 18px; flex-wrap: wrap; }
.col-q > .k { width: 150px; color: var(--color-text-muted); flex: none; }
.col-q .grow { flex: 1; min-width: 0; }
.col-input { width: 100%; background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 4px 8px; outline: none;
  font-size: 20px; color: var(--color-text); }
.col-input:focus { border-color: var(--color-accent-bright); }
.col-input::placeholder { color: var(--color-text-muted); }
textarea.col-input { resize: none; height: 70px; line-height: 1.2; font-size: 18px; }
.col-plats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; flex: 1; }
.col-plats .col-chip { font-size: 16px; padding: 2px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-saved { color: var(--color-status-success); font-size: 18px; }
.col-sheet h3 .col-saved, .col-sheet h3 .col-err { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.col-err { color: var(--color-warning); font-size: 18px; }
.col-foot { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.col-foot .hint { font-size: 16px; color: var(--color-text-muted); }
.col-hints { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.col-hints button { font-size: 16px; padding: 0 6px; background: none; border: 2px solid var(--series); color: #f2d58a; }
.col-res { margin-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.col-res button { background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 8px; text-align: left; font-size: 18px;
  display: flex; gap: 8px; line-height: 1.1; }
.col-res button:hover { border-color: var(--color-accent-bright); }
.col-res canvas { width: 44px; height: 60px; image-rendering: pixelated; flex: none; }
.col-res small { display: block; color: var(--color-text-muted); font-size: 16px; margin-top: 4px; line-height: 1.15; }
.col-res .none { grid-column: 1 / -1; color: var(--color-text-muted); font-size: 18px; padding: 10px 0; }
.col-pads { margin-left: auto; display: flex; gap: 6px; }
.col-pad { width: 48px; height: 28px; image-rendering: pixelated; }
.col-pad.buzz { animation: col-buzz .12s steps(2) 4; }
@keyframes col-buzz { 50% { transform: translate(2px, -1px) rotate(2deg); } }
.col-problems { position: absolute; left: 202px; right: 12px; bottom: 6px; font-size: 16px; color: color-mix(in srgb, var(--color-warning) 85%, #fff);
  z-index: 5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.col-locked { position: absolute; inset: 0; display: grid; place-items: center; padding: 40px; text-align: center; font-size: 22px;
  color: var(--color-text-muted); }
@media (prefers-reduced-motion: reduce) {
  .col-panel *, .col-panel *::before, .col-panel *::after { animation: none !important; transition: none !important; }
}
`;
