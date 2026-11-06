import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OFFICE_TOKEN_FILE, SERVER_JSON_DIR } from './constants.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function officeTokenPath(): string {
  return path.join(os.homedir(), SERVER_JSON_DIR, OFFICE_TOKEN_FILE);
}

function readSavedToken(filePath: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { token?: unknown };
    return typeof parsed.token === 'string' && UUID_PATTERN.test(parsed.token)
      ? parsed.token
      : null;
  } catch {
    return null;
  }
}

/**
 * The standalone office token: the saved one when it is there and well formed, else a new one that is saved
 * (owner-only file, tmp + rename). `fresh` always mints a new one, which locks out every tab holding the old.
 * A failed save still returns the new token: this run works, the next start just mints another.
 */
export function loadOrCreateOfficeToken(options?: { fresh?: boolean; filePath?: string }): string {
  const filePath = options?.filePath ?? officeTokenPath();
  if (!options?.fresh) {
    const saved = readSavedToken(filePath);
    if (saved) return saved;
  }
  const token = crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify({ token, createdAt: Date.now() }, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`[Pixel Agents] Could not save the office token: ${err}`);
  }
  return token;
}
