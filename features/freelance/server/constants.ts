export const LOG_PREFIX = '[Freelance]';

/** The room's id in the search messages (features/busquedas) and its folder name. */
export const FREELANCE_ROOM = 'freelance';
/** Tab name of the agent in herdr. */
export const FREELANCE_TAB_LABEL = 'Freelance';
/** ~/.pixel-agents/freelance.json: the offer, the model and the criteria sets (Spanish keys, editable by hand). */
export const FREELANCE_CONFIG_FILE = 'freelance.json';
/** ~/.pixel-agents/freelance/: the agent's folder (pedidos/, resultados/, estado.json). */
export const FREELANCE_DIR = 'freelance';
/** Where the build copies the skill (esbuild.js: features/<name>/skill → dist/<name>/skill). */
export const FREELANCE_SKILL_FILE = 'SKILL.md';

/** Kinds of result, best first. */
export const FREELANCE_KINDS = ['directo', 'plataforma', 'otro'] as const;

/** A result scored below this cannot be "recomendado": the search room shows it as "dudoso" (features/busquedas). */
export const FREELANCE_MIN_RECOMMENDED = 60;

/** Claude Code model the search agent starts with when freelance.json has no "modelo" ("" = machine default). */
export const FREELANCE_DEFAULT_MODEL = 'sonnet';

/** The offer, as kept: texts and lists are cut to these sizes. */
export const MAX_OFFER_TEXT = 200;
export const MAX_OFFER_ITEMS = 15;
export const MAX_OFFER_ITEM_CHARS = 200;

// ── Connections board (features/conexiones) ──
export const CONNECTION_FEATURE = 'Freelance';
export const HERDR_CONNECTION = {
  id: 'freelance-herdr',
  name: 'Herdr',
  purpose: 'Abre la pestaña "Freelance" con el agente que busca trabajo',
  auth: 'CLI local, sin llave',
} as const;
export const CLAUDE_CONNECTION = {
  id: 'freelance-claude',
  name: 'Claude Code',
  purpose:
    'Busca trabajo de freelance en páginas públicas (solo lee: no se registra ni manda nada)',
  auth: 'La sesión de Claude Code de la máquina',
} as const;
