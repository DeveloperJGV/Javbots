export const LOG_PREFIX = '[Búsquedas]';

/** Inside a room's folder (~/.pixel-agents/<room>/). */
export const REQUESTS_DIR = 'pedidos';
export const RESULTS_DIR = 'resultados';
export const STATE_FILE = 'estado.json';

/** How often the results folder is read (fs.watch is unreliable on Windows). */
export const RESULTS_POLL_MS = 2_000;

export const MAX_REQUESTS = 50;
export const MAX_RESULTS = 25;
export const MAX_TEXT_CHARS = 500;
export const MAX_FIELD_CHARS = 300;
export const MAX_WHY_CHARS = 800;
/** A results file bigger than this is not read. */
export const MAX_RESULTS_FILE_BYTES = 512 * 1024;

export const MAX_CRITERIA_SETS = 12;
export const MAX_RULES = 12;
export const MAX_RULE_CHARS = 300;

// ── herdr (the terminal the agent opens in) ──
export const HERDR_QUICK_MS = 10_000;
/** `herdr agent start` waits until Claude Code is ready for input. */
export const HERDR_START_MS = 60_000;
export const HERDR_START_TIMEOUT_ARG = '45000';
/** `herdr agent list` is asked at most this often to know if herdr is there. */
export const HERDR_CHECK_MS = 30_000;
