import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { GOOGLE_CONFIG_FILE, LOG_PREFIX } from './constants.js';

/**
 * ~/.pixel-agents/google.json. `clientId` and `clientSecret` are filled by hand (a Desktop app client of the
 * owner's Google Cloud project); the session fields are written by the server. Unknown fields are kept.
 */
export interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  /** ISO time of the login that issued the refresh token (Testing apps lose it 7 days later). */
  connectedAt?: string;
  /** The permissions the owner granted on that login. */
  scopes?: string[];
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function googleConfigPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', GOOGLE_CONFIG_FILE);
}

export function readGoogleConfig(file = googleConfigPath()): {
  config: GoogleConfig;
  raw: Record<string, unknown>;
} {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  const config: GoogleConfig = {
    clientId: text(raw.clientId),
    clientSecret: text(raw.clientSecret),
    refreshToken: text(raw.refreshToken),
    connectedAt: text(raw.connectedAt),
  };
  if (Array.isArray(raw.scopes))
    config.scopes = raw.scopes.filter((s): s is string => typeof s === 'string');
  return { config, raw };
}

/** Merges `changes` into the file (undefined deletes the field), atomically. Re-reads first: the user edits it too. */
export function updateGoogleConfig(
  changes: Partial<GoogleConfig>,
  file = googleConfigPath(),
): void {
  const { raw } = readGoogleConfig(file);
  const next: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
