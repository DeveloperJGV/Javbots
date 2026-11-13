import * as path from 'path';

import { findBin } from '../../../server/src/cliPath.js';

export const LOG_PREFIX = '[GitHub]';

/** How often `gh` is asked again while a page is open (also on open, at most this often). */
export const GITHUB_REFRESH_MS = 10 * 60_000;
/** The tick: cheap, it only checks whether a refresh or a login check is due. */
export const GITHUB_TICK_MS = 30_000;
/** While an account has no working login, its cheap check is repeated this often (quietly) to notice it came back. */
export const GITHUB_RECHECK_MS = 60_000;
export const GITHUB_TIMEOUT_MS = 30_000;

/**
 * ~/.pixel-agents/sala-github.json: `{ "ghConfigDir": "~/.config/gh-personal" }`. The gh login (GH_CONFIG_DIR) of the
 * offices that don't pick their own (a private pack can pick one per office). Without it: gh's own default login.
 */
export const GITHUB_CONFIG_FILE = 'sala-github.json';

/** Repositories asked for (newest push first): more than the room has cabinets. */
export const GITHUB_MAX_REPOS = 40;
/** Open pull requests kept per repository. */
export const GITHUB_PRS_PER_REPO = 5;
/** Weeks of the contribution calendar sent to the page. */
export const GITHUB_WEEKS = 12;

/**
 * `gh` itself, as absolute paths: PATH plus the usual installs (an app opened from the Dock has a minimal PATH), then
 * GH_PATH if set. Never the bare name: the office must not depend on the shell it was started from.
 */
export function ghBins(): string[] {
  const bins: string[] = [];
  const found = findBin('gh');
  if (found) bins.push(found);
  if (process.env['GH_PATH']) bins.push(process.env['GH_PATH']);
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
    bins.push(path.join(programFiles, 'GitHub CLI', 'gh.exe'));
  } else {
    bins.push('/opt/homebrew/bin/gh', '/usr/local/bin/gh');
  }
  return [...new Set(bins)];
}
