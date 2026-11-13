import { SearchRoomStore } from '../../busquedas/webview/searchRoomStore.js';
import { DIRECTORIO_FURNITURE_TYPES, DIRECTORIO_ROOM } from './constants.js';

/** The Directorio (features/directorio), outside React: the panel reads it, a click on its furniture opens it. */
export const directorioStore = new SearchRoomStore(DIRECTORIO_ROOM);

/** The Directorio piece that opens the panel, the front desk (rotations and states share the base type). */
export const isDirectorioFurniture = (type: string | undefined): boolean =>
  DIRECTORIO_FURNITURE_TYPES.includes((type ?? '').split(':')[0]);
