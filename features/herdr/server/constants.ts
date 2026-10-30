import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const LOG_PREFIX = '[Herdr]';

/**
 * Where to look for the herdr CLI. The office console (or an app opened from the Dock) doesn't get herdr's PATH, so
 * after the plain name come HERDR_BIN_PATH, the Windows install (~/.herdr/packages/standalone/releases/<version>/,
 * newest first) and the Homebrew paths.
 */
export function herdrBins(): string[] {
  const bins = ['herdr'];
  if (process.env['HERDR_BIN_PATH']) bins.push(process.env['HERDR_BIN_PATH']);
  const releases = path.join(os.homedir(), '.herdr', 'packages', 'standalone', 'releases');
  try {
    for (const dir of fs.readdirSync(releases).sort().reverse()) {
      for (const exe of ['herdr.exe', 'herdr']) {
        const bin = path.join(releases, dir, exe);
        if (fs.existsSync(bin)) bins.push(bin);
      }
    }
  } catch {
    // no Windows install here
  }
  bins.push('/opt/homebrew/bin/herdr', '/usr/local/bin/herdr');
  return bins;
}

export const HERDR_TIMEOUT_MS = 3_000;

/** Tab names change by hand (rename in herdr); a few seconds late is fine. */
export const HERDR_POLL_MS = 5_000;

/** Field the hook script adds to every event: the herdr pane the Claude session runs in (HERDR_PANE_ID). */
export const HOOK_PANE_FIELD = 'herdr_pane_id';

/** Longest tab name shown above a character. */
export const MAX_LABEL_CHARS = 40;
