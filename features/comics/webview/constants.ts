/** The piece that opens the comics panel (features/comics/assets/furniture/COMICS_SHELF). */
export const COMICS_SHELF_TYPE = 'COMICS_SHELF';
export const COMICS_PANEL_TYPES: readonly string[] = [COMICS_SHELF_TYPE];
export const COMICS_OPEN_HASH = '#comics';

export const COMIC_COVER_PATH = '/api/comics/portada/';
export const COMIC_CANDIDATE_PATH = '/api/comics/candidata/';

/** A series that is not «se busca» enough to light in «Solo lo que falta». */
export const SUGGEST_LIMIT = 8;
export const SAVED_NOTE_MS = 2600;
/** More volumes than this in one series: the card's grid of numbers scrolls. */
export const GRID_MANY = 120;
/** Most numbers the card paints; past it, «Tengo» in the form handles the rest. */
export const GRID_MAX = 400;

/** Volume spine sizes (px) by format; a manga volume is smaller than a Western one. */
export const VOLUME_SPINE = {
  tomoW: 18,
  grapaW: 10,
  integralW: 28,
  lujoW: 30,
  mangaH: 92,
  comicH: 106,
  bigH: 120,
} as const;

export const KIND_LABEL: Record<string, string> = {
  manga: 'Manga',
  comic: 'Cómic',
  'novela-grafica': 'Novela gráfica',
};
export const COMIC_FORMAT_LABEL: Record<string, string> = {
  tomo: 'Tomo',
  grapa: 'Grapa',
  integral: 'Integral',
  lujo: 'Edición de lujo',
};
export const COMIC_GROUPING_LABEL: Record<string, string> = {
  tipo: 'Tipo',
  editorial: 'Editorial',
  genero: 'Género',
};
export const COMIC_COVER_SOURCE_TEXT: Record<string, string> = {
  anilist: 'Portada: AniList',
  openlibrary: 'Portada: Open Library',
  subida: 'Portada subida a mano',
};

// ── Colors (only here: lint rule no-inline-colors) ─────────────────────────────────────────
/** Each kind's color (rail swatch, shelf light, panel tint). */
export const KIND_ACCENTS: Record<string, string> = {
  manga: '#e8434b',
  comic: '#3a6ad8',
  'novela grafica': '#c89a2e',
};

/** What the comics panel adds to the library's styles (it reuses LIBROS_CSS: lib- classes). */
export const COMICS_CSS = `
.com-vol { position: relative; flex: none; width: var(--w); height: var(--hh); border: 0; padding: 0; background: var(--cl);
  box-shadow: inset 1px 0 0 rgba(255,255,255,.18), inset -2px 0 0 rgba(0,0,0,.45); outline: none; overflow: hidden;
  transition: transform .12s steps(3), filter .3s; }
.com-vol:hover, .com-vol.sel { transform: translateY(-8px); }
.com-vol.sel, .com-vol:focus-visible { box-shadow: 0 0 0 2px #fff; z-index: 3; }
.com-vol .top { position: absolute; left: 0; right: 0; top: 0; height: 10px; background: var(--cb); }
.com-vol .t { position: absolute; left: 0; right: 0; top: 13px; bottom: 22px; writing-mode: vertical-rl; display: flex; align-items: center;
  justify-content: flex-start; font-size: 16px; line-height: 1; white-space: nowrap; overflow: hidden; color: var(--ci); }
.com-vol .n { position: absolute; left: 0; right: 0; bottom: 3px; height: 16px; display: grid; place-items: center; font-size: 16px;
  line-height: 1; color: var(--cl); background: var(--ci); }
.com-vol.grapa .n { font-size: 16px; background: none; color: var(--ci); }
.com-vol.read::after { content: ''; position: absolute; right: 1px; top: 12px; width: 3px; height: 8px; background: #5ccf3c; }
.com-vol.dim, .com-gap.dim { filter: brightness(.35) saturate(.4); }
.com-vol.glow { animation: lib-glow .8s steps(2) infinite; }
.com-gap { position: relative; flex: none; width: var(--w); height: var(--hh); border: 2px dashed var(--wanted); background: rgba(255,90,90,.06);
  color: var(--wanted); padding: 0; display: grid; place-items: end center; font-size: 16px; padding-bottom: 4px; outline: none; }
.com-gap:hover, .com-gap:focus-visible { border-style: solid; }
.com-gap.glow { animation: lib-glow .8s steps(2) infinite; }
.com-gap.more { place-items: center; writing-mode: vertical-rl; }
.com-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: min(860px, calc(100% - 32px));
  max-height: calc(100% - 40px); overflow-y: auto; z-index: 21; background: var(--paper); color: var(--paper-ink);
  box-shadow: inset 0 0 0 4px var(--cl), 4px 4px 0 var(--ink); display: grid; grid-template-columns: 250px 1fr; gap: 18px;
  padding: 18px 22px; animation: lib-fade-in .25s steps(3); scrollbar-width: thin; }
.com-card .cov { position: relative; width: 250px; height: 360px; box-shadow: 3px 3px 0 rgba(0,0,0,.3); overflow: hidden; background: var(--cl); }
.com-card .cov img { width: 100%; height: 100%; object-fit: cover; display: block; }
.com-card h2 { margin: 6px 0 2px; font-size: 30px; font-weight: normal; line-height: 1.02; overflow-wrap: anywhere; }
.com-card .by { font-size: 18px; color: var(--paper-muted); margin-bottom: 10px; overflow-wrap: anywhere; }
.com-card .tag { display: inline-block; font-size: 16px; padding: 2px 6px; background: var(--cl); color: var(--ci); margin-right: 4px; }
.com-card .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.com-card .facts div { background: rgba(0,0,0,.05); padding: 4px 8px; font-size: 18px; line-height: 1.1; overflow-wrap: anywhere; }
.com-card .facts span { display: block; font-size: 16px; color: var(--paper-muted); }
.com-card h4 { margin: 12px 0 6px; font-size: 16px; font-weight: normal; color: var(--paper-muted); letter-spacing: 1px; text-transform: uppercase;
  display: flex; gap: 8px; align-items: center; }
.com-card .small { font-size: 16px; color: var(--paper-muted); margin-top: 6px; }
.com-card .notes { font-size: 18px; white-space: pre-line; overflow-wrap: anywhere; }
.com-card .lib-err { color: #b0472f; font-size: 16px; margin-top: 6px; }
.com-card .lib-btn { color: var(--color-text); }
.com-card .lib-btn.ghost { color: var(--paper-muted); }
.com-card .acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.com-grid { display: flex; flex-wrap: wrap; gap: 3px; max-height: 180px; overflow-y: auto; scrollbar-width: thin; }
.com-grid button { min-width: 30px; height: 28px; padding: 0 4px; font-size: 16px; border: 2px dashed #b0472f; background: transparent; color: #b0472f; }
.com-grid button.own { border: 2px solid var(--cl); background: var(--cl); color: var(--ci); }
.com-grid button.read { box-shadow: inset 0 -4px 0 #2f6b2a; }
.com-grid button.me { outline: 2px solid var(--paper-ink); outline-offset: 1px; }
.com-grid button:disabled { opacity: .6; cursor: default; }
.com-lookup { display: grid; gap: 6px; margin: 6px 0 4px 136px; }
.com-lookup button { text-align: left; background: var(--color-bg-dark); border: 2px solid var(--color-border); padding: 6px 10px; font-size: 18px; }
.com-lookup button:hover { border-color: var(--color-accent-bright); }
.com-lookup small { display: block; color: var(--color-text-muted); font-size: 16px; }
.com-lookup .hd { font-size: 16px; color: var(--color-text-muted); }
`;
