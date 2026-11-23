/** The piece that opens the library panel (features/libros/assets/furniture/LIBROS_SHELF). */
export const LIBROS_SHELF_TYPE = 'LIBROS_SHELF';
export const LIBROS_PANEL_TYPES: readonly string[] = [LIBROS_SHELF_TYPE];

/** Opening the page with this hash opens the panel (a link, or a check script, without the furniture). */
export const LIBROS_OPEN_HASH = '#libros';

// ── Shelves ────────────────────────────────────────────────────────────────────────────────
/** Pixels an arrow button moves a shelf. */
export const SHELF_ARROW_STEP_PX = 420;
/** A press that moves less than this is a click, not a drag. */
export const SHELF_DRAG_SLOP_PX = 6;
/** Margin kept between a focused book and the shelf's edges when it scrolls to it. */
export const SHELF_FOCUS_MARGIN_PX = 60;
/** Empty slots drawn on an empty shelf (the invitation to fill it). */
export const EMPTY_SLOTS = 11;
/** A book added in the last days gets its little star. */
export const NEW_STAR_DAYS = 7;
/** "Borrar" goes back to normal after this long without the second click. */
export const CONFIRM_RESET_MS = 4000;
/** "✓ Guardado" stays this long in the form. */
export const SAVED_NOTE_MS = 2600;
/** Most suggestions under the search box. */
export const SUGGEST_LIMIT = 8;
/** How long the book takes to come out of the shelf before it opens (ms). */
export const PULL_OUT_MS = 260;

/** Spine sizes (px): heights by format, widths from the pages (or a guess when it does not say). */
export const SPINE = {
  hardH: 120,
  softH: 102,
  digitalH: 92,
  /** A few px of height more or less, by book, so a shelf is not a wall. */
  heightJitter: 12,
  minW: 16,
  maxW: 44,
  /** Px of spine per this many pages. */
  pagesPerPx: 16,
  /** Width of a book that does not say its pages: this plus up to `guessJitter`. */
  guessW: 20,
  guessJitter: 8,
  digitalW: 14,
} as const;

// ── Covers ─────────────────────────────────────────────────────────────────────────────────
/** Where a book's cover is served (+ book id), and a candidate's thumbnail (+ book id / n). */
export const COVER_PATH = '/api/libros/portada/';
export const COVER_CANDIDATE_PATH = '/api/libros/candidata/';
/** What may be uploaded as a cover (the server checks it again by its bytes). */
export const COVER_UPLOAD_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
export const COVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Where a cover came from, said under it. */
export const COVER_SOURCE_TEXT: Record<string, string> = {
  openlibrary: 'Portada: Open Library',
  subida: 'Portada subida a mano',
};

// ── Texts ──────────────────────────────────────────────────────────────────────────────────
export const FORMAT_LABEL: Record<string, string> = {
  'pasta-dura': 'Pasta dura',
  'pasta-blanda': 'Pasta blanda',
  digital: 'Digital',
};
export const READING_LABEL: Record<string, string> = {
  'sin-leer': 'Sin leer',
  leyendo: 'Leyendo',
  leido: 'Leído',
  'a-medias': 'A medias',
};
export const GROUPING_LABEL: Record<string, string> = {
  genero: 'Género',
  autor: 'Autor',
  editorial: 'Editorial',
  saga: 'Saga',
};
export const LENGTH_LABEL: Record<string, string> = {
  corto: 'Corto',
  medio: 'Medio',
  largo: 'Largo',
};
export const MOOD_LABEL: Record<string, string> = {
  seguir: 'Seguir uno empezado',
  saga: 'El que sigue de una saga',
  pendiente: 'Uno que espera en la repisa',
  cualquiera: 'Sorpréndeme',
};

// ── Colors (only here: lint rule no-inline-colors) ─────────────────────────────────────────
export const LIB_INK = '#0a0a14';
/** The panel's light: a reading lamp's warm green, mixed with the genre you are on. */
export const LIB_DEFAULT_TINT = '#2c3a1f';
export const LIB_TINT_BASE = '#0c0c14';
export const LIB_WANTED = '#ff8a8a';
export const LIB_SERIES = '#cca700';
export const LIB_PAPER = '#f1e7cf';
export const LIB_PAPER_INK = '#2b2233';

/** Book cloth and paperback colors: the spine, its lettering and its bands (picked by book, the same every time). */
export interface Cloth {
  cloth: string;
  ink: string;
  band: string;
}
export const CLOTHS: readonly Cloth[] = [
  { cloth: '#7a1f24', ink: '#f2e2b6', band: '#d4a24c' },
  { cloth: '#1f3a6a', ink: '#e8e8ec', band: '#d4a24c' },
  { cloth: '#245a35', ink: '#f2e2b6', band: '#e0c070' },
  { cloth: '#c89a2e', ink: '#2a1a10', band: '#5e3b2e' },
  { cloth: '#e9dfc8', ink: '#2b2233', band: '#8a2229' },
  { cloth: '#1d1d22', ink: '#e8e8ec', band: '#c8a040' },
  { cloth: '#1e6a6a', ink: '#f2f2ea', band: '#e8d6a8' },
  { cloth: '#5a3424', ink: '#f2e2b6', band: '#d4a24c' },
  { cloth: '#5a2a5e', ink: '#f2e2f2', band: '#e0aa3e' },
  { cloth: '#d86a2a', ink: '#1b1a2a', band: '#f2efe6' },
  { cloth: '#f2f0ea', ink: '#1b1a2a', band: '#2b5aa8' },
  { cloth: '#3a6ad8', ink: '#ffffff', band: '#f2efe6' },
  { cloth: '#8a8f99', ink: '#16161b', band: '#f2f2f6' },
  { cloth: '#b8323a', ink: '#ffffff', band: '#1d1d22' },
];
/** An e-book on the shelf: a dark slab with its screen. */
export const DIGITAL_LOOK: Cloth = { cloth: '#26262e', ink: '#bfe8d8', band: '#3a4a46' };

/** Each usual genre's color (rail swatch, shelf light, panel tint); other genres get one by name. */
export const GENRE_ACCENTS: Record<string, string> = {
  novela: '#c8503a',
  cuento: '#e0aa3e',
  poesia: '#b06ad8',
  teatro: '#d14249',
  'ciencia ficcion': '#38a8e8',
  fantasia: '#6a5acd',
  terror: '#8a2229',
  policiaca: '#5a6a7a',
  historica: '#b07a48',
  romance: '#e85a8a',
  'comic y manga': '#f2c22e',
  'infantil y juvenil': '#5ccf3c',
  biografia: '#d4a24c',
  ensayo: '#9aa0a8',
  historia: '#a8743a',
  ciencia: '#2fbf8f',
  filosofia: '#7a68b8',
  psicologia: '#e07a8a',
  negocios: '#3c9a2f',
  tecnologia: '#2b8ad8',
  'arte y diseno': '#e8434b',
  viajes: '#2fa8a8',
  cocina: '#e8843a',
  religion: '#c8b070',
  referencia: '#8a8f99',
};
export const OTHER_ACCENTS: readonly string[] = [
  '#c87a2a',
  '#5a8ad8',
  '#8bac0f',
  '#d8608a',
  '#4aa89a',
  '#a86ad8',
];
/** The shelf of the books that do not say (no genre, no author…). */
export const NONE_ACCENT = '#6a6f78';

// ── CSS (classes start with lib-) ──────────────────────────────────────────────────────────
export const LIBROS_CSS = `
@property --lib-tint { syntax: '<color>'; inherits: true; initial-value: ${LIB_DEFAULT_TINT}; }
.lib-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); }
.lib-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); width: min(1120px, 96vw);
  height: min(760px, calc(100vh - 24px)); overflow: hidden; color: var(--color-text); border: 2px solid var(--color-border);
  box-shadow: 2px 2px 0px ${LIB_INK}, 4px 4px 0px ${LIB_INK}; --ink: ${LIB_INK}; --lib-tint: ${LIB_DEFAULT_TINT};
  --wood: #7a4a2a; --wood-light: #a8703e; --wood-dark: #46281a; --wood-back: #1e120c; --wanted: ${LIB_WANTED};
  --series: ${LIB_SERIES}; --paper: ${LIB_PAPER}; --paper-ink: ${LIB_PAPER_INK}; --paper-muted: #7b6a58; --paper-line: #d8c8a4;
  transition: --lib-tint .7s ease;
  background: radial-gradient(ellipse 70% 55% at 50% 30%, color-mix(in srgb, var(--lib-tint) 55%, transparent) 0, transparent 70%),
    linear-gradient(180deg, color-mix(in srgb, var(--lib-tint) 30%, var(--color-bg-dark)) 0, var(--color-bg-dark) 85%); }
.lib-panel::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 40;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px); }
.lib-panel button, .lib-panel input, .lib-panel textarea { font: inherit; color: inherit; border-radius: 0; }
.lib-panel button { cursor: pointer; }
.lib-panel button:disabled { cursor: default; opacity: var(--btn-disabled-opacity); }
.lib-panel :focus-visible { outline: 2px solid var(--color-accent-bright); outline-offset: 1px; }
.lib-head { position: absolute; left: 0; right: 0; top: 0; height: 72px; display: flex; align-items: center; gap: 12px;
  padding: 0 16px; z-index: 6; }
.lib-head h1 { margin: 0; font-size: 30px; font-weight: normal; text-shadow: 2px 2px 0px var(--ink); white-space: nowrap; line-height: 1; }
.lib-head .sub { font-size: 16px; color: var(--color-text-muted); margin-top: 4px; white-space: nowrap; }
.lib-head .sub b { color: var(--color-text); font-weight: normal; } .lib-head .sub i { font-style: normal; color: var(--wanted); }
.lib-search { position: relative; margin-left: auto; flex: 0 1 280px; min-width: 150px; }
.lib-search input { width: 100%; background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 5px 10px 5px 32px;
  outline: none; box-shadow: 2px 2px 0px var(--ink); font-size: 18px; }
.lib-search input:focus { border-color: var(--color-accent-bright); }
.lib-search input::placeholder { color: var(--color-text-muted); }
.lib-search svg { position: absolute; left: 10px; top: 12px; opacity: .6; }
.lib-sugg { position: absolute; top: 42px; right: 0; width: 400px; background: var(--color-bg); border: 2px solid var(--color-accent-bright);
  box-shadow: 2px 2px 0px var(--ink); z-index: 30; }
.lib-sugg button { display: flex; width: 100%; gap: 10px; align-items: center; background: none; border: 0; padding: 5px 10px;
  text-align: left; font-size: 18px; }
.lib-sugg button[aria-selected=true], .lib-sugg button:hover { background: var(--color-active-bg); }
.lib-sugg .mini { width: 10px; height: 26px; flex: none; background: var(--cl); box-shadow: inset 0 3px 0 var(--cb), inset 0 -3px 0 var(--cb); }
.lib-sugg .mini.gap { background: none; box-shadow: none; border: 2px dashed var(--wanted); }
.lib-sugg .mini.grp { background: var(--series); box-shadow: none; width: 14px; }
.lib-sugg .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.lib-sugg small { margin-left: auto; color: var(--color-text-muted); font-size: 16px; white-space: nowrap; }
.lib-sugg .none { padding: 8px 10px; font-size: 16px; color: var(--color-text-muted); }
.lib-btn { background: var(--color-btn-bg); border: 2px solid var(--color-border); box-shadow: 2px 2px 0px var(--ink); padding: 4px 12px;
  font-size: 18px; white-space: nowrap; }
.lib-btn:hover:not(:disabled) { background: var(--color-btn-hover); border-color: var(--color-accent-bright); }
.lib-btn.big { background: #f2efe6; color: #1b1a2a !important; border-color: #fff; padding: 6px 14px;
  box-shadow: 2px 2px 0px var(--ink), 4px 4px 0px var(--ink); }
.lib-btn.big:hover:not(:disabled) { background: #fff; }
.lib-btn.acc { background: var(--color-accent); border-color: var(--color-accent-bright); }
.lib-btn.acc:hover:not(:disabled) { background: var(--color-accent-bright); }
.lib-btn.danger { background: var(--color-danger); border-color: var(--color-danger); }
.lib-btn.ghost { background: none; box-shadow: none; border-color: transparent; color: var(--color-text-muted); }
.lib-btn.ghost:hover:not(:disabled) { color: var(--color-text); background: none; }
.lib-sq { width: 36px; height: 36px; padding: 0; display: grid; place-items: center; font-size: 22px; line-height: 1; flex: none; }
.lib-body { position: absolute; inset: 72px 0 0 0; }

/* rail */
.lib-rail { position: absolute; left: 12px; top: 4px; bottom: 12px; width: 186px; display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; scrollbar-width: none; }
.lib-rail .hd { font-size: 16px; color: var(--color-text-muted); margin: 6px 0 4px 4px; text-transform: uppercase; letter-spacing: 1px; }
.lib-rail .by { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 6px; }
.lib-rail .by .lib-chip { text-align: center; font-size: 16px; padding: 2px 4px; }
.lib-rail button.s { display: flex; align-items: center; justify-content: flex-start; gap: 8px; background: none; border: 2px solid transparent; padding: 2px 6px;
  font-size: 18px; text-align: left; min-width: 0; }
.lib-rail button.s:hover { background: rgba(255,255,255,.06); }
.lib-rail button.s.on { border-color: var(--color-accent-bright); background: var(--color-active-bg); }
.lib-rail button.s i { width: 8px; height: 18px; flex: none; background: var(--acc); box-shadow: inset -2px 0 0 rgba(0,0,0,.35); }
.lib-rail button.s .nm { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.lib-rail button.s span { margin-left: auto; color: var(--color-text-muted); font-size: 16px; }
.lib-rail .opts { margin-top: auto; display: flex; flex-direction: column; gap: 6px; padding-top: 10px; }
.lib-chip { background: var(--color-btn-bg); border: 2px solid var(--color-border); padding: 3px 8px; font-size: 18px; text-align: left; }
.lib-chip:hover:not(:disabled) { border-color: var(--color-accent-bright); }
.lib-chip[aria-pressed=true] { background: var(--color-active-bg); border-color: var(--color-accent-bright); }
.lib-chip .sw { display: inline-block; width: 8px; height: 14px; margin-right: 6px; background: var(--acc); vertical-align: -1px; }

/* shelves */
.lib-shelves { position: absolute; left: 210px; right: 12px; top: 0; bottom: 0; overflow-y: auto; overflow-x: hidden;
  scroll-behavior: smooth; padding: 18px 10px 40px 4px; scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
.lib-shelf { position: relative; margin-bottom: 22px; }
.lib-shelf .top { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px 2px; }
.lib-shelf .top h3 { margin: 0; font-size: 22px; font-weight: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-shelf .top .count { font-size: 16px; color: var(--color-text-muted); white-space: nowrap; }
.lib-shelf .top .count b { color: var(--color-text); font-weight: normal; } .lib-shelf .top .count em { font-style: normal; color: var(--wanted); }
.lib-shelf .top .arrows { margin-left: auto; display: flex; gap: 4px; }
.lib-shelf .top .arrows button { width: 28px; height: 24px; padding: 0; background: var(--color-btn-bg); border: 2px solid var(--color-border);
  font-size: 14px; line-height: 1; }
.lib-shelf .top .arrows button:hover:not(:disabled) { border-color: var(--color-accent-bright); }
.lib-wood { position: relative; background: var(--wood-back); padding: 12px 0 0; overflow: hidden; touch-action: pan-y;
  box-shadow: inset 4px 0 0 var(--wood), inset -4px 0 0 var(--wood), inset 0 4px 0 var(--wood), 3px 3px 0 rgba(0,0,0,.35); }
.lib-wood::before { content: ''; position: absolute; left: 4px; right: 4px; top: 4px; height: 26px; z-index: 0;
  background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, transparent), transparent); }
.lib-wood::after { z-index: 1; content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: var(--wood);
  box-shadow: inset 0 3px 0 var(--wood-light), inset 0 -3px 0 var(--wood-dark); }
.lib-track { z-index: 2; position: relative; display: flex; align-items: flex-end; gap: 0; padding: 0 14px 16px; height: var(--h);
  transition: transform .35s cubic-bezier(.2,.8,.2,1); will-change: transform; width: max-content; min-width: 100%; }
.lib-track.dragging { transition: none; }
.lib-book { position: relative; flex: none; width: var(--w); height: var(--hh); border: 0; padding: 0; background: var(--cl);
  box-shadow: inset 1px 0 0 rgba(255,255,255,.18), inset -2px 0 0 rgba(0,0,0,.45); transition: transform .12s steps(3), filter .3s;
  outline: none; overflow: hidden; }
.lib-book:hover, .lib-book.sel { transform: translateY(-10px); }
.lib-book.sel, .lib-book:focus-visible { box-shadow: 0 0 0 2px #fff; outline: none; z-index: 3; }
.lib-book.out { transform: translateY(-34px); transition: transform .26s steps(4); }
.lib-book.dim { filter: brightness(.35) saturate(.4); }
.lib-book.glow { animation: lib-glow .8s steps(2) infinite; }
@keyframes lib-glow { 50% { box-shadow: 0 0 0 2px #fff3b0, 0 0 12px 2px #e0aa3e; } }
.lib-book .t { position: absolute; left: 0; right: 0; top: 10px; bottom: 16px; writing-mode: vertical-rl; display: flex; align-items: center;
  justify-content: center; font-size: 16px; line-height: 1; white-space: nowrap; overflow: hidden; color: var(--ci); }
.lib-book .t small { font-size: 16px; opacity: .75; margin-top: 6px; }
.lib-book.hard::before, .lib-book.hard::after { content: ''; position: absolute; left: 0; right: 0; height: 2px; background: var(--cb);
  box-shadow: 0 4px 0 var(--cb); }
.lib-book.hard::before { top: 4px; } .lib-book.hard::after { bottom: 10px; }
.lib-book.soft .logo { position: absolute; left: 50%; bottom: 4px; width: 8px; height: 8px; margin-left: -4px; background: var(--cb); }
.lib-book.soft .crown { position: absolute; left: 0; right: 0; top: 0; height: 8px; background: var(--cb); }
.lib-book.digital { box-shadow: inset 0 0 0 2px rgba(0,0,0,.6); }
.lib-book.digital .screen { position: absolute; left: 3px; right: 3px; top: 6px; bottom: 12px; background: var(--cb); }
.lib-book.digital .t { color: var(--ci); top: 8px; bottom: 14px; }
.lib-book.digital .dot { position: absolute; left: 50%; bottom: 4px; width: 4px; height: 4px; margin-left: -2px; background: var(--ci); }
.lib-book .lent { position: absolute; top: 0; right: -1px; width: 6px; height: 14px; background: #ffd84a; box-shadow: 1px 1px 0 var(--ink); }
.lib-book .mark { position: absolute; top: -2px; left: 50%; margin-left: -3px; width: 6px; height: 16px; background: #d14249;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%); }
.lib-book .new { position: absolute; top: 2px; left: 50%; width: 6px; height: 6px; margin-left: -3px; background: #fff3b0;
  box-shadow: 0 0 0 1px #e0aa3e; animation: lib-star 1s steps(2) infinite; }
@keyframes lib-star { 50% { transform: scale(.5); } }
.lib-gap { position: relative; flex: none; width: var(--w); height: var(--hh); border: 2px dashed var(--wanted); background: rgba(255,90,90,.06);
  padding: 0; outline: none; animation: lib-gap 2.4s steps(4) infinite; color: var(--wanted); margin: 0 2px; }
@keyframes lib-gap { 50% { background: rgba(255,90,90,.14); } }
.lib-gap:hover, .lib-gap.sel, .lib-gap:focus-visible { border-style: solid; transform: translateY(-4px); }
.lib-gap .t { position: absolute; inset: 4px 0; writing-mode: vertical-rl; display: flex; align-items: center; justify-content: center;
  font-size: 16px; white-space: nowrap; overflow: hidden; }
.lib-gap .price { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); background: #f2efe6; color: #1b1a2a; font-size: 16px;
  line-height: 1; padding: 1px 4px; white-space: nowrap; box-shadow: 1px 1px 0 var(--ink); z-index: 3; }
.lib-gap.glow { animation: lib-glow .8s steps(2) infinite; }
.lib-gap.dim { opacity: .35; }
.lib-slot { flex: none; width: var(--w); height: var(--hh); border: 2px dashed rgba(255,255,255,.18); background: rgba(255,255,255,.02); margin-right: 2px; }
.lib-slot.add { display: grid; place-items: center; color: rgba(255,255,255,.55); font-size: 22px; border-color: rgba(255,255,255,.35);
  background: rgba(255,255,255,.04); margin-left: 8px; }
.lib-slot.add:hover { border-style: solid; border-color: var(--color-accent-bright); color: #fff; }
.lib-end { flex: none; width: 10px; height: 46px; margin: 0 6px; background: var(--wood-light); box-shadow: inset -3px 0 0 var(--wood-dark), 2px 0 0 var(--ink); }
.lib-run { display: flex; align-items: flex-end; position: relative; padding: 0 3px; }
.lib-run.series { box-shadow: inset 0 -3px 0 var(--series); margin: 0 6px; }
.lib-run .plaque { position: absolute; bottom: -16px; left: 2px; max-width: calc(100% - 4px); overflow: hidden; font-size: 16px; line-height: 16px;
  color: #f2d58a; white-space: nowrap; z-index: 3; background: var(--wood); padding: 0 4px; text-overflow: ellipsis; }

/* empty */
.lib-empty { position: absolute; left: 210px; right: 12px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center;
  gap: 18px; padding: 0 30px 30px; }
.lib-empty h2 { margin: 0; font-size: 36px; font-weight: normal; text-shadow: 2px 2px 0px var(--ink); }
.lib-empty p { margin: 0; font-size: 20px; color: var(--color-text-muted); max-width: 640px; line-height: 1.25; }
.lib-empty .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

/* the open book */
.lib-veil { position: absolute; inset: 0; background: rgba(8,8,16,.78); z-index: 20; animation: lib-fade .3s; }
@keyframes lib-fade { from { background: rgba(8,8,16,0); } }
.lib-table { position: absolute; left: 50%; top: calc(50% - 30px); width: 0; height: 0; z-index: 21; perspective: 1800px; }
.lib-open { position: absolute; left: -380px; top: -250px; width: 760px; height: 500px; transform-style: preserve-3d;
  animation: lib-rise .35s steps(5); }
@keyframes lib-rise { from { transform: translateY(40px) scale(.6); opacity: 0; } }
.lib-open .page { position: absolute; top: 0; width: 380px; height: 500px; background: var(--paper); color: var(--paper-ink);
  padding: 18px 22px; overflow-y: auto; scrollbar-width: thin;
  background-image: linear-gradient(90deg, rgba(0,0,0,.10), transparent 18px); }
.lib-open .right { left: 380px; box-shadow: inset 0 0 0 4px var(--cl), 4px 4px 0 var(--ink); }
.lib-open .cover { position: absolute; left: 380px; top: 0; width: 380px; height: 500px; transform-origin: left center; transform-style: preserve-3d;
  animation: lib-flip .9s .25s cubic-bezier(.4,.1,.2,1) both; }
@keyframes lib-flip { from { transform: rotateY(0deg); } to { transform: rotateY(-180deg); } }
.lib-open .face { position: absolute; inset: 0; backface-visibility: hidden; }
.lib-open .front { background: var(--cl); box-shadow: 4px 4px 0 var(--ink); overflow: hidden; }
.lib-open .front img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lib-open .inside { transform: rotateY(180deg); background: var(--paper); color: var(--paper-ink); padding: 18px 22px; overflow-y: auto;
  background-image: linear-gradient(270deg, rgba(0,0,0,.10), transparent 18px); box-shadow: inset 0 0 0 4px var(--cl), -4px 4px 0 var(--ink);
  scrollbar-width: thin; }
.lib-open .tag { display: inline-block; font-size: 16px; padding: 2px 6px; background: var(--cl); color: var(--ci); }
.lib-open h2 { margin: 8px 0 2px; font-size: 30px; font-weight: normal; line-height: 1.02; overflow-wrap: anywhere; }
.lib-open .by { font-size: 20px; color: var(--paper-muted); margin-bottom: 12px; overflow-wrap: anywhere; }
.lib-open .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.lib-open .facts div { background: rgba(0,0,0,.05); padding: 4px 8px; font-size: 18px; line-height: 1.1; overflow-wrap: anywhere; }
.lib-open .facts span { display: block; font-size: 16px; color: var(--paper-muted); }
.lib-open .facts .wide { grid-column: 1 / -1; }
.lib-open h4 { margin: 12px 0 6px; font-size: 16px; font-weight: normal; color: var(--paper-muted); letter-spacing: 1px; text-transform: uppercase; }
.lib-open .saga { display: flex; gap: 3px; flex-wrap: wrap; align-items: flex-end; }
.lib-open .saga button { width: 18px; height: 34px; border: 0; padding: 0; background: var(--sc); box-shadow: inset 0 3px 0 rgba(0,0,0,.25);
  font-size: 16px; line-height: 1; color: var(--paper); display: grid; place-items: end center; padding-bottom: 2px; }
.lib-open .saga button.gap { background: transparent; border: 2px dashed #b0472f; color: #b0472f; box-shadow: none; }
.lib-open .saga button.me { outline: 2px solid var(--paper-ink); outline-offset: 1px; }
.lib-open .small { font-size: 16px; color: var(--paper-muted); margin-top: 6px; }
.lib-open .notes { font-size: 18px; white-space: pre-line; overflow-wrap: anywhere; }
.lib-open .exlibris { border: 2px solid var(--paper-line); padding: 10px 12px; text-align: center; margin-bottom: 10px; }
.lib-open .exlibris .k { font-size: 16px; letter-spacing: 3px; color: var(--paper-muted); text-transform: uppercase; }
.lib-open .exlibris .who { font-size: 24px; margin-top: 2px; overflow-wrap: anywhere; }
.lib-open .lentbox { background: #ffe9a8; color: #3a2410; padding: 6px 10px; margin-bottom: 10px; font-size: 18px; box-shadow: 2px 2px 0 rgba(0,0,0,.2); }
.lib-open .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.lib-pa { background: transparent; border: 2px solid var(--paper-ink); color: var(--paper-ink) !important; padding: 0 8px; font-size: 16px;
  line-height: 22px; white-space: nowrap; }
.lib-pa:hover:not(:disabled) { background: var(--paper-ink); color: var(--paper) !important; }
.lib-pa.on { background: var(--paper-ink); color: var(--paper) !important; }
.lib-pa.danger { border-color: #8a2229; color: #8a2229 !important; }
.lib-pa.danger:hover:not(:disabled) { background: #8a2229; color: #fff !important; }
.lib-err { color: #b0472f; font-size: 16px; margin-top: 6px; }
.lib-controls { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 8px; z-index: 22;
  animation: lib-fade-in .3s .9s both; flex-wrap: nowrap; }
@keyframes lib-fade-in { from { opacity: 0; } }

/* a cover drawn by code (no image) */
.lib-drawn { position: absolute; inset: 0; background: var(--cl); color: var(--ci); display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 14px; padding: 40px 34px; text-align: center; }
.lib-drawn::before { content: ''; position: absolute; inset: 14px; border: 2px solid var(--cb); box-shadow: inset 0 0 0 4px var(--cl), inset 0 0 0 6px var(--cb); }
.lib-drawn .ti { font-size: 34px; line-height: 1.05; overflow-wrap: anywhere; position: relative; }
.lib-drawn .au { font-size: 20px; opacity: .85; position: relative; }
.lib-drawn .orn { width: 60px; height: 6px; background: var(--cb); position: relative; box-shadow: 0 -10px 0 -2px var(--cb), 0 10px 0 -2px var(--cb); }
.lib-drawn.digital::before { inset: 22px; border-color: var(--cb); box-shadow: none; }

/* covers in the left page */
.lib-cover-row { display: flex; gap: 10px; align-items: flex-start; }
.lib-cover-row img { width: 96px; height: 140px; object-fit: cover; box-shadow: 2px 2px 0 rgba(0,0,0,.35); flex: none; }
.lib-choose { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 6px; }
.lib-choose button { background: rgba(0,0,0,.05); border: 2px solid var(--paper-line); padding: 4px; display: flex; flex-direction: column;
  align-items: center; gap: 2px; min-width: 0; color: var(--paper-ink); }
.lib-choose button:hover:not(:disabled) { border-color: var(--paper-ink); }
.lib-choose button.cur { border-color: #2f6b2a; }
.lib-choose img { width: 100%; height: 110px; object-fit: contain; }
.lib-choose .nm { font-size: 16px; line-height: 1.05; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lib-choose small { font-size: 16px; color: var(--paper-muted); }
.lib-drop.over { outline: 2px dashed var(--paper-ink); outline-offset: 4px; }

/* "se busca" card */
.lib-poster { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-1deg); width: 360px; background: #f1e3c0; color: #3a2410;
  padding: 12px 16px 14px; z-index: 21; box-shadow: 2px 2px 0 var(--ink), 4px 4px 0 var(--ink); font-size: 18px; line-height: 1.2;
  animation: lib-fade-in .25s steps(3); }
.lib-poster h4 { margin: 0; text-align: center; font-size: 30px; font-weight: normal; letter-spacing: 3px; color: #8a2229; }
.lib-poster .name { text-align: center; font-size: 22px; margin: 4px 0 2px; overflow-wrap: anywhere; }
.lib-poster .by { text-align: center; font-size: 18px; margin-bottom: 8px; color: #7b5a3a; }
.lib-poster .p { display: flex; justify-content: space-between; gap: 10px; border-top: 2px dashed #c9b48a; padding: 4px 0; }
.lib-poster .p span:last-child { text-align: right; overflow-wrap: anywhere; }
.lib-poster .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.lib-poster .acts button { background: #3a2410; color: #fff; border: 2px solid #3a2410; padding: 2px 8px; font-size: 16px; }
.lib-poster .acts button.yes { background: #2f6b2a; border-color: #2f6b2a; }
.lib-poster .acts button.ghost { background: none; color: #3a2410; }
.lib-poster .acts button.danger { background: #8a2229; border-color: #8a2229; }

/* sheets: form, «¿Qué leo ahora?», covers */
.lib-sheet { position: absolute; left: 50%; top: 84px; transform: translateX(-50%); width: min(760px, calc(100% - 32px));
  max-height: calc(100% - 100px); overflow-y: auto; background: var(--color-bg); border: 2px solid var(--color-accent-bright);
  box-shadow: 2px 2px 0 var(--ink), 4px 4px 0 var(--ink); z-index: 25; padding: 14px 18px 16px; animation: lib-pop .2s steps(3);
  scrollbar-width: thin; }
@keyframes lib-pop { from { opacity: 0; transform: translate(-50%, 8px); } }
.lib-sheet h3 { margin: 0 0 8px; font-size: 26px; font-weight: normal; display: flex; align-items: center; gap: 10px; }
.lib-sheet h3 .x { margin-left: auto; }
.lib-sheet h3 .lib-saved, .lib-sheet h3 .lib-warn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.lib-q { display: flex; align-items: center; gap: 6px; margin: 7px 0; font-size: 18px; flex-wrap: wrap; }
.lib-q > .k { width: 130px; color: var(--color-text-muted); flex: none; }
.lib-q .grow { flex: 1; min-width: 0; }
.lib-q .num { width: 90px; flex: none; }
.lib-q .lbl { color: var(--color-text-muted); font-size: 16px; }
.lib-input { width: 100%; background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 4px 8px; outline: none;
  font-size: 20px; color: var(--color-text); }
.lib-input:focus { border-color: var(--color-accent-bright); }
.lib-input::placeholder { color: var(--color-text-muted); }
textarea.lib-input { resize: none; height: 64px; line-height: 1.2; font-size: 18px; }
.lib-genres { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.lib-genres .lib-chip { font-size: 16px; padding: 1px 6px; }
.lib-saved { color: var(--color-status-success); font-size: 18px; }
.lib-warn { color: var(--color-warning); font-size: 18px; }
.lib-foot { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.lib-foot .hint { font-size: 16px; color: var(--color-text-muted); }
.lib-hints { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.lib-hints button { font-size: 16px; padding: 0 6px; background: none; border: 2px solid var(--series); color: #f2d58a; }
.lib-found { border: 2px solid var(--color-accent-bright); background: var(--color-bg-dark); padding: 8px 10px; margin: 6px 0 4px 136px; font-size: 18px; }
.lib-found .hd { font-size: 16px; color: var(--color-text-muted); margin-bottom: 4px; }
.lib-found .ln { line-height: 1.2; overflow-wrap: anywhere; }
.lib-found .ln span { color: var(--color-text-muted); }
.lib-found .acts { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
.lib-found .hint { font-size: 16px; color: var(--color-text-muted); }
.lib-found.bad { border-color: var(--color-warning); color: var(--color-warning); }
.lib-res { margin-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.lib-res button { background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 8px; text-align: left; font-size: 18px;
  display: flex; gap: 10px; line-height: 1.1; min-width: 0; }
.lib-res button:hover { border-color: var(--color-accent-bright); }
.lib-res .sp { width: 16px; height: 62px; flex: none; background: var(--cl); box-shadow: inset 0 4px 0 var(--cb), inset 0 -4px 0 var(--cb), 2px 2px 0 var(--ink); }
.lib-res .tx { min-width: 0; overflow-wrap: anywhere; }
.lib-res small { display: block; color: var(--color-text-muted); font-size: 16px; margin-top: 4px; line-height: 1.15; }
.lib-res .none { grid-column: 1 / -1; color: var(--color-text-muted); font-size: 18px; padding: 10px 0; }
.lib-lamp { margin-left: 4px; width: 28px; height: 28px; image-rendering: pixelated; }
.lib-bar { height: 12px; background: var(--color-bg-dark); border: 2px solid var(--color-border); margin: 8px 0; }
.lib-bar i { display: block; height: 100%; transition: width .3s steps(4);
  background: repeating-linear-gradient(90deg, var(--color-accent-bright) 0 6px, var(--color-accent) 6px 8px); }
.lib-covers-intro { margin: 0 0 8px; font-size: 18px; color: var(--color-text-muted); line-height: 1.2; }
.lib-problems { position: absolute; left: 210px; right: 12px; bottom: 6px; font-size: 16px; color: color-mix(in srgb, var(--color-warning) 85%, #fff);
  z-index: 5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lib-locked { position: absolute; inset: 0; display: grid; place-items: center; padding: 40px; text-align: center; font-size: 22px;
  color: var(--color-text-muted); }
@media (prefers-reduced-motion: reduce) {
  .lib-panel *, .lib-panel *::before, .lib-panel *::after { animation: none !important; transition: none !important; }
  .lib-open .cover { transform: rotateY(-180deg); }
}
`;
