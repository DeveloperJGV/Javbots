import type { JardinCareKind, JardinSupplyCategory } from '../../../core/src/messages.js';

/** The roof's furniture that opens the garden panel: the control screen (today) and the shed (the supplies). The
 *  tool rack and the plant plaque are decoration. */
export const JARDIN_CONTROL_TYPE = 'JARDIN_CONTROL';
export const JARDIN_SHED_TYPE = 'JARDIN_SHED';
export const JARDIN_PANEL_TYPES: readonly string[] = [JARDIN_CONTROL_TYPE, JARDIN_SHED_TYPE];
/** Panel section each one opens on. */
export const JARDIN_PANEL_SECTION: Record<string, 'hoy' | 'inventario'> = {
  [JARDIN_CONTROL_TYPE]: 'hoy',
  [JARDIN_SHED_TYPE]: 'inventario',
};

export const CARE_ORDER: readonly JardinCareKind[] = ['regar', 'abonar', 'limpiar', 'podar'];
export const CARE_LABEL: Record<JardinCareKind, string> = {
  regar: 'Regar',
  abonar: 'Abonar',
  limpiar: 'Limpiar',
  podar: 'Podar',
};
/** Days a new care starts with in the form. */
export const CARE_DEFAULT_DAYS: Record<JardinCareKind, number> = {
  regar: 7,
  abonar: 30,
  limpiar: 14,
  podar: 90,
};

export const SUPPLY_ORDER: readonly JardinSupplyCategory[] = [
  'planta',
  'herramienta',
  'tierra',
  'abono',
  'maceta',
  'otro',
];
export const SUPPLY_LABEL: Record<JardinSupplyCategory, string> = {
  planta: 'Planta',
  herramienta: 'Herramienta',
  tierra: 'Tierra',
  abono: 'Abono',
  maceta: 'Maceta',
  otro: 'Otro',
};
/** Longest supply name and unit the server keeps (MAX_TEXT and the unit's cut in server/jardinFeature.ts). */
export const SUPPLY_NAME_MAX = 200;
export const SUPPLY_UNIT_MAX = 20;

/** A thirsty plant's look: this much of its color goes to gray, it gets this much darker, and its top droops. */
export const THIRSTY_GRAY = 0.65;
export const THIRSTY_DARKEN = 0.82;
/** The top part of the sprite (this fraction of its height) slides down this many pixels. */
export const THIRSTY_DROOP_PART = 0.45;
export const THIRSTY_DROOP_PX = 1;

export const PHOTO_PATH = '/api/jardin/fotos/';

/** Longest name, species, place and notes the panel lets you write: the same stops the server keeps (MAX_TEXT). */
export const PLANT_TEXT_MAX = 200;
export const PLANT_NOTES_MAX = 1000;
