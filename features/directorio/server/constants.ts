import type { SearchCriteriaSet } from '../../../core/src/messages.js';

export const LOG_PREFIX = '[Directorio]';

/** The room's id in the search messages (features/busquedas) and its folder name. */
export const DIRECTORIO_ROOM = 'directorio';
/** Tab name of the agent in herdr. */
export const DIRECTORIO_TAB_LABEL = 'Directorio';
/** ~/.pixel-agents/directorio.json: the criteria sets (the office writes it when they are saved in the panel). */
export const DIRECTORIO_CONFIG_FILE = 'directorio.json';
/** ~/.pixel-agents/directorio/: the agent's folder (pedidos/, resultados/, estado.json). */
export const DIRECTORIO_DIR = 'directorio';
/** Where the build copies the skill (esbuild.js: features/<name>/skill → dist/<name>/skill). */
export const DIRECTORIO_SKILL_FILE = 'SKILL.md';

/** Kinds of result, best first. */
export const DIRECTORIO_KINDS = ['oficial', 'establecido', 'otro'] as const;

/** First word of the calendar title for a service visit (provisional). */
export const SERVICE_EVENT_PREFIX = 'Servicio:';
export const MAX_EVENT_TITLE = 200;

/** Criteria sets until the owner saves his own, the first one is the default. */
export const DEFAULT_CRITERIA: SearchCriteriaSet[] = [
  {
    id: 'tecnicos',
    label: 'Técnicos y servicios',
    rules: [
      'Primero, el servicio oficial o autorizado de la marca (que aparezca en el sitio de la marca).',
      'Negocio establecido: dirección física, factura, garantía por escrito y muchas reseñas reales y recientes (por ejemplo, 4.3 o más con 50 o más reseñas en Google Maps).',
      'Descartar a quien no tenga negocio visible (solo WhatsApp, sin dirección, reseñas raras o pocas), aunque sea más barato.',
    ],
  },
  {
    id: 'doctores',
    label: 'Doctores y clínicas',
    rules: [
      'Cédula profesional (y de especialidad) que se pueda comprobar en el buscador de cédulas de la SEP; mejor si tiene la certificación de su consejo de especialidad.',
      'Consultorio en un hospital o una clínica establecida, con dirección y teléfono fijos.',
      'Muchas reseñas reales y recientes (Doctoralia, Google Maps), sin quejas graves repetidas.',
      'Descartar a quien no muestre cédula ni consultorio, aunque sea más barato.',
    ],
  },
  {
    id: 'restaurantes',
    label: 'Restaurantes',
    rules: [
      'Calificación alta y reciente (por ejemplo, 4.4 o más con 200 o más reseñas en Google Maps).',
      'Que tome reservaciones y tenga horario, menú y precios a la vista.',
      'Descartar lugares con quejas repetidas de higiene o de cobros.',
    ],
  },
];
