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
/** A result's own short facts (`detalles`: pay, published, client…), at most this many. */
export const MAX_DETAILS = 6;
export const MAX_DETAIL_LABEL_CHARS = 40;
export const MAX_DETAIL_VALUE_CHARS = 160;
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
/**
 * Fallback when `herdr agent start` refuses the new tab's shell (`agent_pane_busy`, seen on Windows + Git Bash): Claude
 * is typed into the pane with `herdr pane run`, then this long is waited for herdr to see it working or asking.
 */
export const HERDR_RUN_WAIT_MS = 60_000;
/** Pause between `herdr agent wait` tries while Claude is still starting (herdr has no agent in the pane yet). */
export const HERDR_RUN_RETRY_MS = 1_000;
/** A Claude Code model name or alias (sonnet, opus, claude-sonnet-4-5…): anything else is not passed to herdr. */
export const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
