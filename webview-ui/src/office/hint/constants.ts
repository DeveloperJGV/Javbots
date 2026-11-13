/** What each piece that opens something says when the mouse is over it (office/hint). Short, no final period. */
export const HINT_LABELS = {
  agenda: 'Agenda: hoy y esta semana',
  directorio: 'Directorio',
  pomodoro: 'Pomodoro',
  jardinToday: 'Jardín: lo de hoy',
  jardinSupplies: 'Jardín: inventario',
  /** Followed by the plant's name. */
  jardinPlantPrefix: 'Jardín: ',
  musicPlayer: 'Música',
  playlist: 'Playlist del día',
  playlistBin: 'Playlist: esta no',
  ofertas: 'Ofertas',
  decks: 'Decks',
  bodega: 'Bodega',
  concerts: 'Boletos de conciertos',
  perfil: 'Perfil',
  connections: 'Conexiones',
  usage: 'Uso de Claude',
  board: 'Pizarrón de actividad',
} as const;

/** Where the sign sits from the cursor, CSS px (right of it and a little above, like the GitHub one was). */
export const HINT_OFFSET_X = 14;
export const HINT_OFFSET_Y = -30;
/** Closest the sign gets to the window's edges, CSS px. */
export const HINT_EDGE_MARGIN = 4;
