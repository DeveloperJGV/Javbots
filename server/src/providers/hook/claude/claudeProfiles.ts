import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Claude Code profiles: every config directory a `claude` on this machine may be
 * running from. One person can keep several side by side (`CLAUDE_CONFIG_DIR=~/.claude-work`,
 * `~/.claude-personal`, ...), each with its own sessions, teams and settings.json —
 * the default `~/.claude` may even be empty. Sessions are read from all of them,
 * and hooks are installed (and consented to) per profile.
 */
export interface ClaudeProfile {
  /** Provider id for the profile's hooks: `claude` for `~/.claude`, `claude-<name>` otherwise. */
  id: string;
  /** Tag shown next to its agents; undefined for the default profile. */
  label?: string;
  /** Absolute config directory (what CLAUDE_CONFIG_DIR points at). */
  configDir: string;
}

const DEFAULT_PROFILE_DIR = '.claude';
const PROFILE_DIR_PREFIX = '.claude-';
const DEFAULT_PROFILE_ID = 'claude';

/** A config dir counts as a profile once Claude Code has used it. */
function looksLikeProfile(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'projects')) || fs.existsSync(path.join(dir, 'settings.json'))
  );
}

/** Provider ids must match the hook route's `^[a-z0-9-]+$`. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function profileFor(dir: string, home: string): ClaudeProfile | null {
  const resolved = path.resolve(dir);
  if (resolved === path.join(home, DEFAULT_PROFILE_DIR)) {
    return { id: DEFAULT_PROFILE_ID, configDir: resolved };
  }
  const base = path.basename(resolved);
  const name = base.startsWith(PROFILE_DIR_PREFIX)
    ? base.slice(PROFILE_DIR_PREFIX.length)
    : base.replace(/^\.+/, '');
  const id = slug(name);
  if (!id) return null;
  return { id: `${DEFAULT_PROFILE_ID}-${id}`, label: name, configDir: resolved };
}

/**
 * Every Claude Code profile in use on this machine: `~/.claude`, each `~/.claude-<name>`,
 * and the directory CLAUDE_CONFIG_DIR names (when the server itself was started from a
 * profile shell). Only directories Claude Code has used count. When none has been used yet,
 * the default `~/.claude` alone is returned, so a fresh machine behaves as before.
 * The default profile comes first, the rest alphabetically.
 */
export function discoverClaudeProfiles(env: NodeJS.ProcessEnv = process.env): ClaudeProfile[] {
  const home = os.homedir();
  const candidates = [path.join(home, DEFAULT_PROFILE_DIR)];
  try {
    for (const entry of fs.readdirSync(home, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(PROFILE_DIR_PREFIX)) {
        candidates.push(path.join(home, entry.name));
      }
    }
  } catch {
    /* unreadable home: the default profile is still tried */
  }
  if (env.CLAUDE_CONFIG_DIR) candidates.push(env.CLAUDE_CONFIG_DIR);

  const byId = new Map<string, ClaudeProfile>();
  for (const dir of candidates) {
    if (!looksLikeProfile(dir)) continue;
    const profile = profileFor(dir, home);
    if (profile && !byId.has(profile.id)) byId.set(profile.id, profile);
  }
  if (byId.size === 0) {
    return [{ id: DEFAULT_PROFILE_ID, configDir: path.join(home, DEFAULT_PROFILE_DIR) }];
  }
  return [...byId.values()].sort((a, b) =>
    a.id === DEFAULT_PROFILE_ID ? -1 : b.id === DEFAULT_PROFILE_ID ? 1 : a.id.localeCompare(b.id),
  );
}

/** The profile whose config directory holds `filePath` (a transcript or project dir). */
export function profileForPath(
  filePath: string,
  profiles: ClaudeProfile[] = discoverClaudeProfiles(),
): ClaudeProfile | undefined {
  if (!filePath) return undefined;
  const resolved = path.resolve(filePath);
  return profiles.find(
    (p) => resolved === p.configDir || resolved.startsWith(p.configDir + path.sep),
  );
}
