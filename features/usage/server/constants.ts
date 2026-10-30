export const LOG_PREFIX = '[Uso]';

/**
 * Where the Claude Code statusline script leaves a copy per profile (see features/usage/README.md):
 * ~/.pixel-agents/uso/<perfil>.json.
 */
export const USAGE_SUBDIR = 'uso';

/** The files only change while a session is open; reading them is cheap. */
export const USAGE_POLL_MS = 30_000;

/** Sessions shown per profile (the most expensive first). */
export const MAX_SESSIONS = 30;

/** Asking Claude Code for `/usage` (Fable's weekly limit only comes there): when a page opens, then this often. */
export const USAGE_COMMAND_MS = 5 * 60_000;
export const USAGE_COMMAND_TIMEOUT_MS = 60_000;
