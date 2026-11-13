/** Furniture of the playlist corner in the music room (features/musica). */
export const MUSICA_PLAYLIST_PRESS = 'MUSICA_PLAYLIST_PRESS';
export const MUSICA_PLAYLIST_REJECT_BIN = 'MUSICA_PLAYLIST_REJECT_BIN';
export const MUSICA_PLAYLIST_NEON = 'MUSICA_PLAYLIST_NEON';

export type PlaylistPiece = 'press' | 'bin' | 'neon';
export type PlaylistTab = 'armar' | 'repisa' | 'bote';

/** Base furniture type → piece (rotations and states share the base type). */
export const PLAYLIST_PIECES: Readonly<Record<string, PlaylistPiece>> = {
  [MUSICA_PLAYLIST_PRESS]: 'press',
  [MUSICA_PLAYLIST_REJECT_BIN]: 'bin',
  [MUSICA_PLAYLIST_NEON]: 'neon',
};

/** Name of a list built in the builder without saving it as a recipe. */
export const PLAYLIST_CUSTOM_NAME = 'A mi gusto';

/** Length buttons, one at a time. */
export const PLAYLIST_MINUTES: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
];

/** Decade buttons; 1970 means "the 70s and before". */
export const PLAYLIST_DECADES: ReadonlyArray<{ decade: number; label: string }> = [
  { decade: 1970, label: '70s y antes' },
  { decade: 1980, label: '80s' },
  { decade: 1990, label: '90s' },
  { decade: 2000, label: '00s' },
  { decade: 2010, label: '10s' },
  { decade: 2020, label: '20s' },
];

export const PLAYLIST_TABS: ReadonlyArray<{ id: PlaylistTab; label: string }> = [
  { id: 'armar', label: 'Armar' },
  { id: 'repisa', label: 'Mis listas' },
  { id: 'bote', label: 'Esta no' },
];

/** Status line while the server works. */
export const PLAYLIST_BUSY_TEXT: Readonly<Record<string, string>> = {
  sources: 'Leyendo tus listas…',
  preview: 'Armando…',
  creating: 'Creando en Spotify…',
  deleting: 'Borrando…',
  loading: 'Leyendo de Spotify…',
  searching: 'Buscando…',
  saving: 'Guardando en Spotify…',
  improving: 'Pensando cambios…',
};

/** Example in the "Dime qué quieres" box. */
export const PLAYLIST_DESCRIBE_EXAMPLE = 'Ej. rock en español de los 90 para manejar de noche';
export const PLAYLIST_DESCRIBE_MAX = 200;

/** "Mejorar": what can be done without understanding words like "más movida". */
export const PLAYLIST_IMPROVE_BUTTONS: ReadonlyArray<{
  mode: 'more' | 'bin' | 'reroll' | 'discover';
  label: string;
}> = [
  { mode: 'more', label: 'Más canciones (+30 min)' },
  { mode: 'bin', label: 'Cambia las que mandé al bote' },
  { mode: 'reroll', label: 'Otra tirada con la misma idea' },
  { mode: 'discover', label: 'Más para descubrir' },
];

// ── The press "working" (sprite pixels, 32×48) ──
/** The round window of the press. */
export const PRESS_WINDOW = { x0: 13, x1: 18, y0: 11, y1: 16 } as const;
export const PRESS_BLINK_SEC = 0.4;
/** Its colors live in ../constants.ts (PLAYLIST_PRESS_COLORS): color literals only in a feature's top constants. */
