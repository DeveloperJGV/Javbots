/** Fixed numbers and texts of the optional assistant (a small model that researches prices on the web). */

export const ASISTENTE_LOG_PREFIX = '[Ofertas/asistente]';

// ── The local CLI ────────────────────────────────────────────────────────────
/** Command looked up on PATH (Windows adds PATHEXT: claude.exe, claude.cmd…). "asistente.comando" overrides it. */
export const DEFAULT_COMMAND = 'claude';
/** Model alias passed to --model. "asistente.modelo" overrides it. */
export const DEFAULT_MODEL = 'haiku';
/** What the panel lets you choose (the file may name another model by hand). */
export const MODEL_CHOICES = ['haiku', 'sonnet'] as const;
/** The only tools the run gets. Everything else (files, shell, MCP, sub-agents) stays out. */
export const WEB_TOOLS = ['WebSearch', 'WebFetch'] as const;
/** Extensions tried on Windows when PATHEXT is not set. */
export const WINDOWS_PATHEXT_FALLBACK = '.COM;.EXE;.BAT;.CMD';
/** Where the native installer puts the CLI (the office console may not have it on PATH). */
export const NATIVE_INSTALL_DIR = ['.local', 'bin'] as const;

// ── Limits of one run ────────────────────────────────────────────────────────
const MIN = 60_000;
export const DEFAULT_TIMEOUT_MS = 4 * MIN;
export const TIMEOUT_MIN_MS = 30_000;
export const TIMEOUT_MAX_MS = 15 * MIN;
/** Agentic turns per run (each search or page read is one; the structured answer is one more). */
export const MAX_TURNS = 24;
/** Spend cap per run in USD (the CLI's own estimate). A small model researching one product stays far below. */
export const MAX_BUDGET_USD = 0.5;
/** Bytes of stdout kept; a run that prints more is cut and counted as bad output. */
export const STDOUT_CAP_BYTES = 2 * 1024 * 1024;
/** Bytes of stderr kept for the log. */
export const STDERR_CAP_BYTES = 16 * 1024;
/** Longest failure detail handed back (characters). */
export const DETAIL_MAX = 300;
/** Prefix of the temporary working folder of each run. */
export const TMP_DIR_PREFIX = 'ofertas-asistente-';

/**
 * Environment variables never handed to the run: the office's own, the ones that make the CLI think it is nested in
 * another session, anything that looks like a secret, and everything that would make the CLI bill by use instead of
 * the subscription (an API key, a gateway token, a cloud provider). Only the subscription login of the CLI is kept.
 */
export const ENV_DROP_PREFIXES = ['PIXEL_AGENTS', 'OFERTAS_'] as const;
export const ENV_DROP_EXACT = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SSE_PORT',
] as const;
/** Paid access: every ANTHROPIC_* (API key, auth token, base URL…) and the Bedrock/Vertex/Foundry switches. */
export const ENV_PAID_PREFIXES = [
  'ANTHROPIC_',
  'CLAUDE_CODE_USE_',
  'AWS_',
  'VERTEX_',
  'CLOUD_ML_',
] as const;
export const ENV_SECRET_PATTERN =
  /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i;
/** The subscription token of `claude setup-token` (a login, not a paid key). */
export const ENV_KEEP_PREFIXES = ['CLAUDE_CODE_OAUTH'] as const;

// ── Subscription check (before every run) ───────────────────────────────────
/** `claude auth status --json`: run with the same clean environment before each query. */
export const AUTH_STATUS_ARGS = ['auth', 'status', '--json'] as const;
/** The only provider that bills through the subscription. */
export const AUTH_PROVIDER_OK = 'firstParty';
/** An auth method that names a key or a helper is paid access: never run with it. */
export const AUTH_METHOD_PAID = /api|key|helper/i;
export const AUTH_TIMEOUT_MS = 20_000;

// ── Sanitizing the answer (the model's output is untrusted data) ────────────
export const PRODUCT_MAX = 120;
export const STORE_MAX = 60;
export const NOTE_MAX = 400;
export const TITLE_MAX = 120;
export const URL_MAX = 500;
export const NAME_MAX = 100;
export const REASON_MAX = 220;
export const SOURCES_CAP = 8;
export const SIMILAR_SOURCES_CAP = 4;
export const SIMILARS_MIN = 3;
export const SIMILARS_MAX = 6;
/** Highest price believed, in MXN. */
export const PRICE_MAX = 2_000_000;
/** With a current price, numbers farther than this factor from it are thrown away as nonsense. */
export const PRICE_SANITY_FACTOR = 20;

export const CONFIDENCE_LEVELS = ['alta', 'media', 'baja'] as const;
export const SIMILAR_KINDS = ['compa', 'alternativa'] as const;

/** Note used when the model left none. */
export const NOTE_FALLBACK = 'El asistente no dejó nota.';
/** Note appended when numbers came without any source and were thrown away. */
export const NOTE_NO_SOURCES = 'Sin fuentes verificables: se descartaron los números.';
