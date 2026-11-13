/** The shelf that opens the decks panel (features/decks/assets/furniture/DECKS_SHELF). */
export const DECKS_SHELF_TYPE = 'DECKS_SHELF';
export const DECKS_PANEL_TYPES: readonly string[] = [DECKS_SHELF_TYPE, `${DECKS_SHELF_TYPE}_ON`];

/** Opening the page with this hash opens the panel (a link, or a check script, without the shelf). */
export const DECKS_OPEN_HASH = '#decks';

// ── Row of boxes ───────────────────────────────────────────────────────────────────────────
/** Boxes drawn behind / in front of the chosen one; the rest of a long row is not in the page at all. */
export const ROW_WINDOW_BACK = 3;
export const ROW_WINDOW_FRONT = 14;
/** Pixels of drag that move the row one box. */
export const ROW_DRAG_STEP_PX = 38;
/** Wheel delta that moves the row one box. */
export const ROW_WHEEL_STEP = 60;
/** A press that moves less than this is a click, not a drag. */
export const ROW_CLICK_SLOP_PX = 6;
/** Most ticks the ruler draws (a long row is sampled). */
export const RULER_MAX_TICKS = 60;
/** "Escoge uno": how many hops (min + random extra) and their delay (base + slowdown × hop²). */
export const PICK_MIN_HOPS = 10;
export const PICK_EXTRA_HOPS = 6;
export const PICK_HOP_BASE_MS = 50;
export const PICK_HOP_SLOWDOWN_MS = 2.2;
/** The "Escogiendo…" label stays this long after landing. */
export const PICK_LABEL_LINGER_MS = 350;
/** Side (px) of the low-res cover drawn on the boxes: the pixel-art look. */
export const COVER_PIXELS = 40;

// ── Cards and search ───────────────────────────────────────────────────────────────────────
/** The card search waits this long after the last key. */
export const SEARCH_DEBOUNCE_MS = 220;
export const SEARCH_MIN_LENGTH = 2;
/** Most cards asked in one decksCards message. */
export const CARDS_BATCH_MAX = 200;
/** "Borrar" goes back to normal after this long without the second click. */
export const CONFIRM_RESET_MS = 4000;
/** "Copiado" shows this long. */
export const COPIED_MS = 1600;
export const IMPORT_TEXT_MAX = 20_000;

// ── Colors (only here: lint rule no-inline-colors) ─────────────────────────────────────────
export const DECKS_INK = '#0a0a14';
/** Background tint before any cover is known. */
export const DECKS_DEFAULT_TINT = '#2c2b6d';
/** Box colors offered in the editor. */
export const BOX_COLOR_CHOICES: readonly string[] = [
  '#7a1f2b',
  '#a3471c',
  '#7a5a1f',
  '#1f5a4a',
  '#2b6a7a',
  '#2b3f7a',
  '#5b2b7a',
  '#7a2b5e',
  '#3a3a4a',
  '#d8d8e0',
];
/** Tint made from a cover: its hue, saturation clamped to this range, this lightness (HSL, 0-1). */
export const TINT_SAT_MIN = 0.45;
export const TINT_SAT_MAX = 0.8;
export const TINT_GRAY_SAT = 0.2;
export const TINT_LIGHTNESS = 0.34;
/** A tint as CSS (hue in degrees, saturation and lightness in percent). */
export const tintCss = (h: number, s: number, l: number): string => `hsl(${h} ${s}% ${l}%)`;

/**
 * The panel's styles. The 3D row needs real CSS (faces, perspective, transitions), so it lives here as a string the
 * panel injects, like the music column's keyframes.
 */
export const DECKS_CSS = `
@property --decks-tint { syntax: '<color>'; inherits: true; initial-value: ${DECKS_DEFAULT_TINT}; }
.decks-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); }
.decks-phone { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
  width: min(400px, 94vw); height: min(780px, calc(100vh - 24px)); overflow: hidden; display: flex; flex-direction: column;
  border: 2px solid var(--color-border); box-shadow: 2px 2px 0px ${DECKS_INK}, 4px 4px 0px ${DECKS_INK};
  --ink: ${DECKS_INK}; --decks-tint: ${DECKS_DEFAULT_TINT}; transition: --decks-tint .7s ease; color: var(--color-text);
  background:
    radial-gradient(ellipse 120% 70% at 70% 35%, color-mix(in srgb, var(--decks-tint) 70%, transparent) 0%, transparent 70%),
    linear-gradient(180deg, color-mix(in srgb, var(--decks-tint) 45%, var(--color-bg-dark)) 0%, var(--color-bg-dark) 80%); }
.decks-phone::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 30;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0 2px, transparent 2px 4px); }
.decks-phone button { font: inherit; color: inherit; border-radius: 0; cursor: pointer; }
.decks-phone button:disabled { cursor: default; opacity: var(--btn-disabled-opacity); }
.decks-phone :focus-visible { outline: 2px solid var(--color-accent-bright); outline-offset: 1px; }
.decks-top { display: flex; align-items: flex-start; gap: 8px; padding: 16px 16px 0; position: relative; z-index: 5; }
.decks-title { flex: 1; text-align: center; min-width: 0; }
.decks-title h2 { margin: 0; font-size: 36px; font-weight: normal; line-height: 1; text-shadow: 2px 2px 0px var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .2s, transform .2s; }
.decks-title .meta { font-size: 18px; color: var(--color-text-muted); margin-top: 4px; transition: opacity .2s; }
.decks-title .meta b { color: var(--color-text); font-weight: normal; }
.decks-title.swap h2, .decks-title.swap .meta { opacity: 0; transform: translateY(-4px); }
.decks-sq { width: 36px; height: 36px; flex: none; display: grid; place-items: center; padding: 0;
  background: color-mix(in srgb, var(--ink) 55%, transparent); border: 2px solid color-mix(in srgb, var(--color-text) 25%, transparent);
  box-shadow: 2px 2px 0px var(--ink); font-size: 20px; line-height: 1; }
.decks-sq:hover:not(:disabled) { border-color: var(--color-accent-bright); }
.decks-pill { position: absolute; top: 100px; left: 50%; transform: translateX(-50%); font-size: 18px; padding: 2px 10px; z-index: 6;
  border: 2px solid color-mix(in srgb, var(--color-text) 30%, transparent); background: color-mix(in srgb, var(--ink) 55%, transparent);
  opacity: 0; transition: opacity .2s; white-space: nowrap; pointer-events: none; }
.decks-pill.on { opacity: 1; }
.decks-stage { position: relative; flex: 1; min-height: 0; perspective: 1000px; perspective-origin: 40% 25%; touch-action: none;
  cursor: grab; user-select: none; }
.decks-stage:active { cursor: grabbing; }
.decks-world { position: absolute; left: 31%; top: 62%; transform-style: preserve-3d; }
.decks-box { position: absolute; width: 140px; height: 200px; left: -70px; top: -100px; transform-style: preserve-3d;
  transition: transform .55s cubic-bezier(.2,.8,.2,1), filter .4s, opacity .4s; will-change: transform; --box: ${DECKS_DEFAULT_TINT}; }
.decks-box .face { position: absolute; backface-visibility: hidden; }
.decks-box .front { inset: 0; transform: translateZ(18px); background: var(--box); border: 2px solid var(--ink); overflow: hidden;
  display: flex; flex-direction: column; }
.decks-box .front canvas, .decks-box .front .art { display: block; width: 100%; aspect-ratio: 1; image-rendering: pixelated; flex: none;
  background: color-mix(in srgb, var(--box) 70%, #000); }
.decks-box .front img.sharp { position: absolute; top: 0; left: 0; width: 100%; aspect-ratio: 1; object-fit: cover; opacity: 0;
  transition: opacity .4s .2s; }
.decks-box.sel .front img.sharp { opacity: 1; }
.decks-box .band { flex: 1; padding: 4px 6px; font-size: 16px; line-height: 1; color: #fff; text-shadow: 1px 1px 0px var(--ink);
  border-top: 2px solid var(--ink); display: flex; align-items: center; overflow: hidden; }
.decks-box .band span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.decks-box .front::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(115deg, rgba(255,255,255,.18) 0 18%, transparent 18% 100%); }
.decks-box .back { inset: 0; transform: rotateY(180deg) translateZ(18px); background: var(--box); border: 2px solid var(--ink); }
.decks-box .spine { width: 36px; height: 100%; left: 52px; transform: rotateY(-90deg) translateZ(70px);
  background: color-mix(in srgb, var(--box) 80%, #000); border: 2px solid var(--ink); display: flex; flex-direction: column;
  align-items: center; padding: 6px 0; gap: 6px; overflow: hidden; }
.decks-box .spine canvas { width: 26px; height: 26px; image-rendering: pixelated; border: 2px solid var(--ink); flex: none; }
.decks-box .spine .t { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 16px; color: #fff; white-space: nowrap;
  text-shadow: 1px 1px 0px var(--ink); }
.decks-box .rside { width: 36px; height: 100%; left: 52px; transform: rotateY(90deg) translateZ(70px);
  background: color-mix(in srgb, var(--box) 60%, #000); border: 2px solid var(--ink); }
.decks-box .lid { width: 140px; height: 36px; top: 82px; transform: rotateX(90deg) translateZ(100px);
  background: color-mix(in srgb, var(--box) 85%, #fff); border: 2px solid var(--ink); }
.decks-box::before { content: ''; position: absolute; left: -10px; right: -10px; bottom: -14px; height: 22px; background: rgba(0,0,0,.45);
  transform: rotateX(90deg) translateZ(-4px); opacity: 0; transition: opacity .4s; }
.decks-box.sel::before { opacity: 1; }
.decks-floor { position: absolute; left: -400px; top: 100px; width: 1200px; height: 600px; transform: rotateX(90deg); transform-origin: top;
  background: radial-gradient(ellipse 40% 30% at 45% 10%, rgba(0,0,0,.45), transparent 70%); pointer-events: none; }
.decks-hint { text-align: center; font-size: 16px; color: var(--color-text-muted); height: 20px; }
.decks-ruler { position: relative; margin: 6px 24px 0; height: 40px; touch-action: none; cursor: ew-resize; flex: none; }
.decks-ruler .ticks { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: space-between; }
.decks-ruler .tk { width: 2px; background: color-mix(in srgb, var(--color-text) 35%, transparent); transition: height .3s, background .3s; }
.decks-ruler .tk.on { background: #fff; }
.decks-ruler .mark { position: absolute; bottom: 0; width: 2px; height: 40px; background: #fff; transition: left .35s cubic-bezier(.2,.8,.2,1); }
.decks-ruler .mark::before { content: ''; position: absolute; top: -6px; left: -3px; width: 8px; height: 8px; background: #fff;
  box-shadow: 2px 2px 0px var(--ink); }
.decks-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 16px; flex: none; position: relative; z-index: 5; }
.decks-pick { padding: 8px 18px; background: var(--color-text); color: var(--ink) !important; border: 2px solid var(--ink);
  box-shadow: 2px 2px 0px var(--ink); font-size: 22px; display: flex; gap: 8px; align-items: center; }
.decks-pick:hover:not(:disabled) { background: #fff; }
.decks-pick:active:not(:disabled) { transform: translate(2px,2px); box-shadow: none; }

.decks-sheet { position: absolute; inset: 0; background: var(--color-bg-dark); display: flex; flex-direction: column; z-index: 10;
  animation: decks-up .45s cubic-bezier(.2,.8,.2,1); }
@keyframes decks-up { from { transform: translateY(100%); } to { transform: none; } }
.decks-head { padding: 14px 14px 12px; display: flex; gap: 12px; align-items: center; border-bottom: 2px solid var(--color-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--decks-tint) 45%, var(--color-bg-dark)), var(--color-bg-dark)); }
.decks-head .cov { width: 54px; height: 54px; object-fit: cover; border: 2px solid var(--ink); box-shadow: 2px 2px 0px var(--ink);
  flex: none; background: var(--box); }
.decks-head h3 { margin: 0; font-size: 26px; font-weight: normal; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.decks-head .meta { font-size: 18px; color: var(--color-text-muted); margin-top: 4px; }
.decks-counts { display: flex; margin: 10px 14px 0; border: 2px solid var(--color-border); }
.decks-counts span { flex: 1; text-align: center; font-size: 16px; color: var(--color-text-muted); padding: 3px 0; }
.decks-counts span + span { border-left: 2px solid var(--color-border); }
.decks-counts span.bad b { color: var(--color-warning); }
.decks-counts b { font-weight: normal; color: var(--color-text); font-size: 22px; display: block; line-height: 1; }
.decks-warns { margin: 10px 14px 0; padding: 4px 10px; border: 2px solid color-mix(in srgb, var(--color-warning) 50%, transparent);
  color: color-mix(in srgb, var(--color-warning) 85%, #fff); font-size: 16px; }
.decks-warns summary { cursor: pointer; list-style: none; }
.decks-warns summary::-webkit-details-marker { display: none; }
.decks-warns ul { margin: 4px 0 2px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.decks-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 14px 14px; scrollbar-width: thin;
  scrollbar-color: var(--color-border) var(--color-bg-dark); }
.decks-grp { margin-top: 14px; }
.decks-grp h4 { margin: 0 0 6px; font-size: 18px; font-weight: normal; color: var(--color-accent-bright); display: flex;
  justify-content: space-between; border-bottom: 2px solid var(--color-border); padding-bottom: 2px; text-transform: uppercase; letter-spacing: 1px; }
.decks-row { display: flex; align-items: center; gap: 10px; padding: 3px 4px; width: 100%; background: none; border: 2px solid transparent;
  text-align: left; }
.decks-row:hover { background: var(--color-btn-bg); border-color: var(--color-border); }
.decks-row .thumb { width: 30px; height: 44px; border: 1px solid var(--ink); flex: none; object-fit: cover;
  background: var(--color-bg-thumb); }
.decks-row .n { flex: 1; min-width: 0; font-size: 18px; line-height: 1.05; overflow-wrap: anywhere; }
.decks-row .n small { display: block; font-size: 16px; color: var(--color-text-muted); }
.decks-row .x { font-size: 22px; }
.decks-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px; border-top: 2px solid var(--color-border); align-items: center; }
.decks-btn { padding: 4px 12px; background: var(--color-btn-bg); border: 2px solid transparent; font-size: 20px; }
.decks-btn:hover:not(:disabled) { background: var(--color-btn-hover); }
.decks-btn.ghost { background: none; color: var(--color-text-muted); }
.decks-btn.ghost:hover:not(:disabled) { background: none; color: var(--color-text); }
.decks-btn.acc { background: var(--color-accent); border-color: var(--color-accent); }
.decks-btn.acc:hover:not(:disabled) { background: var(--color-accent-bright); border-color: var(--color-accent-bright); }
.decks-btn.danger { background: var(--color-danger); border-color: var(--color-danger); }
.decks-btn.on { background: var(--color-active-bg); border-color: var(--color-accent); }
.decks-big { position: absolute; inset: 0; z-index: 20; background: rgba(10,10,20,.86); display: flex; flex-direction: column;
  align-items: center; padding: 22px 20px; gap: 12px; animation: decks-fade .25s; }
@keyframes decks-fade { from { opacity: 0; } to { opacity: 1; } }
.decks-big img { width: 230px; max-height: 50%; object-fit: contain; box-shadow: 2px 2px 0px var(--ink), 4px 4px 0px var(--ink);
  border: 2px solid var(--ink); animation: decks-flip .5s cubic-bezier(.2,.8,.2,1); flex: none; }
@keyframes decks-flip { from { transform: perspective(700px) rotateY(-30deg) scale(.9); } to { transform: none; } }
.decks-big .txt { font-size: 18px; line-height: 1.2; background: var(--color-bg); border: 2px solid var(--color-border); padding: 8px 10px;
  overflow-y: auto; flex: 1; width: 100%; white-space: pre-line; }
.decks-big .txt b { font-weight: normal; color: var(--color-accent-bright); font-size: 22px; display: block; }
.decks-big .txt .sub { color: var(--color-text-muted); display: block; margin-bottom: 8px; }
.decks-ban { color: var(--color-warning); }
.decks-input { width: 100%; padding: 4px 8px; background: var(--color-bg); border: 2px solid var(--color-border); color: var(--color-text);
  font-size: 20px; border-radius: 0; outline: none; }
.decks-input:focus { border-color: var(--color-accent-bright); }
.decks-input::placeholder { color: var(--color-text-muted); }
textarea.decks-input { resize: none; font-size: 18px; line-height: 1.2; }
.decks-label { font-size: 16px; color: var(--color-text-muted); display: block; margin: 10px 0 4px; }
.decks-swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.decks-swatch { width: 26px; height: 26px; border: 2px solid var(--ink); padding: 0; }
.decks-swatch.on { outline: 2px solid #fff; outline-offset: 1px; }
.decks-sugg { border: 2px solid var(--color-border); border-top: none; background: var(--color-bg); max-height: 240px; overflow-y: auto; }
.decks-note { font-size: 16px; color: var(--color-text-muted); margin: 4px 0 0; }
.decks-tabs { display: flex; gap: 0; margin-top: 12px; }
.decks-tabs button { flex: 1; padding: 4px 0; font-size: 18px; background: none; border: 2px solid var(--color-border);
  color: var(--color-text-muted); }
.decks-tabs button + button { border-left: none; }
.decks-tabs button.on { background: var(--color-active-bg); border-color: var(--color-accent); color: var(--color-text); }
.decks-qty { display: flex; align-items: center; gap: 4px; flex: none; }
.decks-qty button { width: 26px; height: 26px; padding: 0; background: var(--color-btn-bg); border: 2px solid transparent; font-size: 18px;
  line-height: 1; }
.decks-qty button:hover:not(:disabled) { background: var(--color-btn-hover); }
.decks-qty .x { min-width: 30px; text-align: center; }
.decks-move { font-size: 16px; padding: 0 4px; background: none; border: 2px solid var(--color-border); color: var(--color-text-muted); }
.decks-move:hover:not(:disabled) { color: var(--color-text); border-color: var(--color-accent-bright); }
.decks-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px;
  text-align: center; }
.decks-empty .ghostbox { width: 120px; height: 170px; border: 2px dashed color-mix(in srgb, var(--color-text) 40%, transparent);
  display: grid; place-items: center; font-size: 64px; color: color-mix(in srgb, var(--color-text) 50%, transparent);
  transform: perspective(600px) rotateY(-18deg); animation: decks-bob 3s ease-in-out infinite; }
@keyframes decks-bob { 50% { transform: perspective(600px) rotateY(-10deg) translateY(-6px); } }
.decks-status { font-size: 16px; color: var(--color-text-muted); text-align: center; padding: 0 16px; }
.decks-problems { font-size: 16px; color: color-mix(in srgb, var(--color-warning) 85%, #fff); margin: 6px 0 0; padding: 0; list-style: none; }
@media (prefers-reduced-motion: reduce) {
  .decks-box, .decks-ruler .mark, .decks-sheet, .decks-big img { transition: none !important; animation: none !important; }
}
`;
