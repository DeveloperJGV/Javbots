import * as path from 'path';
import { describe, expect, it } from 'vitest';

import {
  childEnv,
  completeProcessPath,
  expandHome,
  findBin,
  fullPath,
  usualBinDirs,
} from '../src/cliPath.js';

/** The office must work the same from the Dock (PATH=/usr/bin:/bin:/usr/sbin:/sbin), a terminal or after a reboot. */
describe.skipIf(process.platform === 'win32')('cliPath', () => {
  const dirs = usualBinDirs('/Users/x', '/opt/homebrew/Cellar/node/25/bin/node', 'darwin');

  it('the usual folders: node own folder first (the hooks call `node`), then ~/.local/bin and Homebrew', () => {
    expect(dirs.slice(0, 3)).toEqual([
      '/opt/homebrew/Cellar/node/25/bin',
      '/Users/x/.local/bin',
      '/opt/homebrew/bin',
    ]);
  });

  it('completes a Dock PATH without duplicates, keeping what it had first', () => {
    const p = fullPath('/usr/bin:/bin:/usr/sbin:/sbin', dirs, ':').split(':');
    expect(p.slice(0, 4)).toEqual(['/usr/bin', '/bin', '/usr/sbin', '/sbin']);
    expect(p).toContain('/opt/homebrew/bin');
    expect(p).toContain('/Users/x/.local/bin');
    expect(new Set(p).size).toBe(p.length);
    expect(fullPath(undefined, dirs, ':').split(':')[0]).toBe('/opt/homebrew/Cellar/node/25/bin');
  });

  it('completeProcessPath and childEnv give children the full PATH, plus their own variables', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    completeProcessPath(env);
    expect(env.PATH?.split(path.delimiter)).toContain('/opt/homebrew/bin');
    const child = childEnv({ GH_CONFIG_DIR: '/c' }, { PATH: '/usr/bin', HOME: '/h' });
    expect(child).toMatchObject({ HOME: '/h', GH_CONFIG_DIR: '/c' });
    expect(child.PATH?.split(path.delimiter)).toContain(path.dirname(process.execPath));
  });

  it('findBin resolves a name to an absolute path in PATH or the usual folders', () => {
    const exists = (p: string) => p === '/opt/homebrew/bin/gh';
    expect(findBin('gh', { env: { PATH: '/usr/bin:/bin' }, exists })).toBe('/opt/homebrew/bin/gh');
    expect(findBin('nada', { env: { PATH: '/usr/bin' }, exists })).toBeNull();
    expect(findBin('sh', { env: { PATH: '' } })).toMatch(/^\/.*\/sh$/);
  });

  it('expandHome', () => {
    expect(expandHome('~/.config/gh-a', '/h')).toBe('/h/.config/gh-a');
    expect(expandHome('/abs', '/h')).toBe('/abs');
  });
});
