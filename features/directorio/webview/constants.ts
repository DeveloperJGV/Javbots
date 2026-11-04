/** The room's id in the search messages (features/busquedas). Same as server/constants.ts DIRECTORIO_ROOM. */
export const DIRECTORIO_ROOM = 'directorio';

/** Furniture of the Directorio room; a click on any of them opens the panel. */
export const DIRECTORIO_BOARD_TYPE = 'DIRECTORIO_BOARD';
export const DIRECTORIO_DESK_TYPE = 'DIRECTORIO_DESK';
export const DIRECTORIO_KEYS_TYPE = 'DIRECTORIO_KEYS';
export const DIRECTORIO_PHONE_TYPE = 'DIRECTORIO_PHONE';
export const DIRECTORIO_FURNITURE_TYPES: readonly string[] = [
  DIRECTORIO_BOARD_TYPE,
  DIRECTORIO_DESK_TYPE,
  DIRECTORIO_KEYS_TYPE,
  DIRECTORIO_PHONE_TYPE,
];

export const DIRECTORIO_KIND_LABELS: Record<string, string> = {
  oficial: 'Oficial o autorizado',
  establecido: 'Negocio establecido',
  otro: 'Otro',
};

/** First word of the calendar title (provisional; same as server/constants.ts SERVICE_EVENT_PREFIX). */
export const SERVICE_EVENT_PREFIX = 'Servicio:';
