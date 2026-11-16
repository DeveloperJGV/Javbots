export const LOG_PREFIX = '[Accesos]';

/** The owner's list, under ~/.pixel-agents/ (written by hand; the office never writes it). */
export const ACCESOS_FILE = 'accesos.json';
/** Where each started page writes what it prints, under ~/.pixel-agents/ (one <id>.log per page). */
export const LOG_DIR = 'accesos-logs';
/** Largest accesos.json read (bytes): a hand-written list is a few hundred bytes. */
export const FILE_MAX_BYTES = 64 * 1024;
/** Most pages in the list; the rest are left out with a warning. */
export const ACCESOS_MAX = 20;

/** An id: lower case letters, digits and dashes (it goes back in messages and in the log file name). */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 240;
export const URL_MAX = 300;
/** Only pages on this computer: the check and the link never leave it. */
export const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];
export const COMMAND_MAX = 260;
export const ARGS_MAX = 20;
export const ARG_MAX = 500;
export const FOLDER_MAX = 400;

/** How long the "is it on?" request waits for an answer. */
export const CHECK_TIMEOUT_MS = 1500;
/** Every this often, while a tokened page is connected, the office checks again (the candle on the table). */
export const CHECK_EVERY_MS = 20_000;
/** After starting a page: how often it asks whether it answers yet, and for how long before giving up. */
export const START_POLL_MS = 500;
export const START_TIMEOUT_MS = 30_000;

export const MESSAGES = ['accesosOpen', 'accesosStart'] as const;

/**
 * Environment variables never handed to a started page: the office's own (its token among them), the markers of a
 * Claude Code session, and anything that looks like a secret.
 */
export const ENV_DROP_PREFIXES = ['PIXEL_AGENTS', 'CLAUDE', 'ANTHROPIC_'] as const;
export const ENV_SECRET_PATTERN =
  /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|CREDENTIAL)/i;
