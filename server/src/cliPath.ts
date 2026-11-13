import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The office never depends on the shell it was started from. Opened from the Dock (or after a reboot) a Mac app gets
 * PATH=/usr/bin:/bin:/usr/sbin:/sbin and none of the profile's exports, so `node`, `gh`, `claude` or `herdr` would not
 * be found by the server nor by anything it launches (a `claude -p` whose hooks call `node`). These helpers give every
 * child process the usual install folders, and resolve a binary to its absolute path.
 */

/** Install folders a CLI usually lives in, besides PATH: node's own folder first (the hooks call `node`). */
export function usualBinDirs(
  home: string = os.homedir(),
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const nodeDir = path.dirname(execPath);
  if (platform === 'win32') return [nodeDir];
  return [
    nodeDir,
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
}

/** `current` (PATH) with the usual folders that are missing appended, in order, without duplicates. */
export function fullPath(
  current: string | undefined,
  dirs: string[] = usualBinDirs(),
  delimiter: string = path.delimiter,
): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of [...(current ?? '').split(delimiter), ...dirs]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
  }
  return out.join(delimiter);
}

/** Called once at startup (server/src/cli.ts): every child the office starts inherits a complete PATH. */
export function completeProcessPath(env: NodeJS.ProcessEnv = process.env): void {
  env.PATH = fullPath(env.PATH);
}

/** The absolute path of `name` in PATH or the usual folders (first that exists), or null. */
export function findBin(
  name: string,
  opts: { env?: NodeJS.ProcessEnv; extra?: string[]; exists?: (p: string) => boolean } = {},
): string | null {
  if (path.isAbsolute(name)) return (opts.exists ?? fs.existsSync)(name) ? name : null;
  const exists = opts.exists ?? fs.existsSync;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  const dirs = [
    ...fullPath((opts.env ?? process.env).PATH).split(path.delimiter),
    ...(opts.extra ?? []),
  ];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/** An environment for a child: the given one (default: this process's) with a complete PATH, plus `extra`. */
export function childEnv(
  extra: NodeJS.ProcessEnv = {},
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return { ...base, PATH: fullPath(base.PATH), ...extra };
}

/** `~` and `~/x` → the home folder. */
export function expandHome(p: string, home: string = os.homedir()): string {
  return p === '~' || p.startsWith('~/') ? path.join(home, p.slice(1)) : p;
}
