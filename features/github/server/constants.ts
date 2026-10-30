import * as path from 'path';

export const LOG_PREFIX = '[GitHub]';

/** How often `gh` is asked again while a page is open (also on open, at most this often). */
export const GITHUB_REFRESH_MS = 10 * 60_000;
/** The polling tick: cheap, it only checks whether a refresh is due. */
export const GITHUB_TICK_MS = 30_000;
export const GITHUB_TIMEOUT_MS = 30_000;

/** Repositories asked for (newest push first): more than the room has cabinets. */
export const GITHUB_MAX_REPOS = 40;
/** Open pull requests kept per repository. */
export const GITHUB_PRS_PER_REPO = 5;
/** Weeks of the contribution calendar sent to the page. */
export const GITHUB_WEEKS = 12;

/** `gh` itself: PATH first, then the usual installs (the office console may not have it on PATH). */
export function ghBins(): string[] {
  const bins = ['gh'];
  if (process.env['GH_PATH']) bins.push(process.env['GH_PATH']);
  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] ?? 'C:\Program Files';
    bins.push(path.join(programFiles, 'GitHub CLI', 'gh.exe'));
  } else {
    bins.push('/opt/homebrew/bin/gh', '/usr/local/bin/gh');
  }
  return bins;
}
