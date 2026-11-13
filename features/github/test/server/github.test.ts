import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GITHUB_RECHECK_MS } from '../../server/constants.js';
import {
  createGithubFeature,
  ghEnv,
  ghNoticeText,
  parseGithub,
  readDefaultGhConfigDir,
  runGh,
  usefulGhLine,
} from '../../server/githubFeature.js';

const NOW = new Date('2026-10-25T08:00:00.000Z');

const answer = {
  data: {
    viewer: {
      login: 'alguien',
      repositories: {
        totalCount: 2,
        nodes: [
          {
            name: 'mi-juego',
            url: 'https://github.com/alguien/mi-juego',
            isPrivate: true,
            pushedAt: '2026-10-24T10:00:00Z',
            stargazerCount: 2,
            defaultBranchRef: { target: { history: { totalCount: 120 } } },
            pullRequests: {
              totalCount: 1,
              nodes: [
                { number: 3, title: 'Arreglo', url: 'https://x/3', author: { login: 'bot' } },
              ],
            },
          },
          {
            name: 'vacio',
            url: 'https://x',
            isPrivate: false,
            defaultBranchRef: null,
            pullRequests: {},
          },
        ],
      },
      contributionsCollection: {
        contributionCalendar: {
          weeks: Array.from({ length: 20 }, (_, w) => ({
            contributionDays: Array.from({ length: 7 }, () => ({ contributionCount: w })),
          })),
        },
      },
    },
  },
};

describe('github', () => {
  it('reads repositories, PRs and the last weeks of the calendar', () => {
    const s = parseGithub(answer, NOW)!;
    expect(s.login).toBe('alguien');
    expect(s.repos[0]).toEqual({
      name: 'mi-juego',
      url: 'https://github.com/alguien/mi-juego',
      private: true,
      stars: 2,
      commits: 120,
      openPullRequests: 1,
      pushedAt: '2026-10-24T10:00:00Z',
    });
    expect(s.repos[1]).toMatchObject({ name: 'vacio', commits: 0, openPullRequests: 0 });
    expect(s.pullRequests).toEqual([
      { repo: 'mi-juego', number: 3, title: 'Arreglo', url: 'https://x/3', author: 'bot' },
    ]);
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks.at(-1)?.[0]).toBe(19);
    expect(parseGithub({ errors: ['x'] }, NOW)).toBeNull();
  });

  it('asks gh when a page opens, at most every 10 minutes, for privileged pages only', async () => {
    let clock = NOW.getTime();
    let asked = 0;
    const feature = createGithubFeature({
      now: () => new Date(clock),
      tickMs: 3_600_000,
      defaultConfigDir: () => undefined,
      check: async () => ({ ok: true, data: 'alguien' }),
      query: async () => {
        asked++;
        return { ok: true, data: answer };
      },
    });
    await feature.poll(); // the check at start (nobody listening): no query
    expect(asked).toBe(0);
    const sent: Array<Record<string, unknown>> = [];
    const guest: Array<Record<string, unknown>> = [];
    const page = {
      privileged: true,
      office: 'principal',
      send: (m: Record<string, unknown>) => sent.push(m),
    };
    feature.connect?.(page);
    feature.connect?.({ privileged: false, send: (m) => guest.push(m) });
    feature.handleClientMessage?.({ type: 'webviewReady' }, page);
    await feature.poll();
    expect(asked).toBe(1);
    expect(sent.at(-1)).toMatchObject({ type: 'githubStatus', login: 'alguien' });
    await feature.poll();
    expect(asked).toBe(1);
    clock += 11 * 60_000;
    await feature.poll();
    expect(asked).toBe(2);
    expect(guest).toHaveLength(0);
    feature.dispose?.();
  });

  it('logs the line that says why gh failed, not the echoed command', () => {
    const msg = 'Command failed: /opt/homebrew/bin/gh api graphql -f query=query {\n  viewer {';
    expect(
      usefulGhLine(
        'You are not logged into any GitHub hosts. To log in, run: gh auth login\n',
        msg,
      ),
    ).toBe('You are not logged into any GitHub hosts. To log in, run: gh auth login');
    expect(usefulGhLine('', msg)).toBe('viewer {');
  });
});

/**
 * A fake `gh` (a shell script): logged in only when GH_CONFIG_DIR has a hosts.yml, which holds the login. It answers
 * `api user` and `api graphql` like the real one, and the not-logged-in error exactly as gh prints it.
 */
const FAKE_GH = `#!/bin/sh
if [ -z "$GH_CONFIG_DIR" ] || [ ! -f "$GH_CONFIG_DIR/hosts.yml" ]; then
  echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2
  exit 4
fi
login=$(cat "$GH_CONFIG_DIR/hosts.yml")
case "$1 $2" in
  "api user") echo "$login" ;;
  "api graphql") printf '{"data":{"viewer":{"login":"%s","repositories":{"totalCount":0,"nodes":[]},"contributionsCollection":{"contributionCalendar":{"weeks":[]}}}}}' "$login" ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`;

describe.skipIf(process.platform === 'win32')(
  'github: logins per office, from an empty environment',
  () => {
    let home: string;
    let gh: string;
    let clock: number;
    /** What a Dock launch gives the office: no profile exports at all. */
    let emptyEnv: NodeJS.ProcessEnv;
    const login = (dir: string, who: string) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'hosts.yml'), who);
    };
    const page = (office: string) => {
      const sent: Array<Record<string, unknown>> = [];
      return {
        sent,
        client: { privileged: true, office, send: (m: Record<string, unknown>) => sent.push(m) },
      };
    };

    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-gh-'));
      gh = path.join(home, 'bin', 'gh');
      fs.mkdirSync(path.dirname(gh));
      fs.writeFileSync(gh, FAKE_GH, { mode: 0o755 });
      clock = NOW.getTime();
      emptyEnv = { PATH: '/usr/bin:/bin', HOME: home };
    });
    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(home, { recursive: true, force: true });
    });

    it('a gh run never inherits the login from the shell, and gets a complete PATH', () => {
      const env = ghEnv(undefined, {
        PATH: '/usr/bin:/bin',
        GH_CONFIG_DIR: '/otra',
        GH_TOKEN: 'x',
      });
      expect(env.GH_CONFIG_DIR).toBeUndefined();
      expect(env.GH_TOKEN).toBeUndefined();
      expect(env.PATH?.split(path.delimiter)).toEqual(
        expect.arrayContaining([
          '/usr/bin',
          '/bin',
          '/opt/homebrew/bin',
          path.dirname(process.execPath),
        ]),
      );
      expect(ghEnv('/cuenta', {}).GH_CONFIG_DIR).toBe('/cuenta');
    });

    it('finds each office its configured account with PATH=/usr/bin:/bin and no GH_CONFIG_DIR', async () => {
      const personal = path.join(home, '.config', 'gh-a');
      const work = path.join(home, '.config', 'gh-b');
      login(personal, 'cuenta-a');
      login(work, 'cuenta-b');
      fs.mkdirSync(path.join(home, '.pixel-agents'));
      fs.writeFileSync(
        path.join(home, '.pixel-agents', 'sala-github.json'),
        JSON.stringify({ ghConfigDir: '~/.config/gh-a' }),
      );
      expect(readDefaultGhConfigDir(home)).toBe(personal);
      // Same answer straight from gh, with the empty environment.
      expect(await runGh(['api', 'user'], work, [gh], emptyEnv)).toEqual({
        ok: true,
        stdout: 'cuenta-b\n',
      });

      const feature = createGithubFeature({
        now: () => new Date(clock),
        tickMs: 3_600_000,
        home,
        bins: [path.join(home, 'no-existe', 'gh'), gh],
        baseEnv: emptyEnv,
      });
      feature.useConfigDirFor('otra', () => work);
      const main = page('principal');
      const other = page('otra');
      for (const p of [main, other]) {
        feature.connect?.(p.client);
        feature.handleClientMessage?.({ type: 'webviewReady' }, p.client);
      }
      await Promise.resolve();
      await feature.poll();
      expect(main.sent.find((m) => m.type === 'githubStatus')).toMatchObject({ login: 'cuenta-a' });
      expect(other.sent.find((m) => m.type === 'githubStatus')).toMatchObject({
        login: 'cuenta-b',
      });
      expect([...main.sent, ...other.sent].some((m) => m.type === 'githubNotice')).toBe(false);
      expect(feature.connections().map((c) => c.state)).toEqual(['ok', 'ok']);
      feature.dispose?.();
    });

    it('without a login: ONE notice with the exact command, one log line, and it recovers by itself', async () => {
      const work = path.join(home, '.config', 'gh-b');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const feature = createGithubFeature({
        now: () => new Date(clock),
        tickMs: 3_600_000,
        home,
        defaultConfigDir: () => undefined,
        bins: [gh],
        baseEnv: emptyEnv,
      });
      feature.useConfigDirFor('otra', () => work);
      const p = page('otra');
      feature.connect?.(p.client);
      feature.handleClientMessage?.({ type: 'webviewReady' }, p.client);
      await Promise.resolve();
      await feature.poll();

      const notices = () => p.sent.filter((m) => m.type === 'githubNotice');
      expect(notices()).toHaveLength(1);
      expect(notices()[0]).toEqual({
        type: 'githubNotice',
        ...ghNoticeText('sin-sesion', work, '', home),
      });
      expect(notices()[0].text).toContain('~/.config/gh-b');
      expect(notices()[0].command).toBe('GH_CONFIG_DIR=~/.config/gh-b gh auth login');
      const workLines = () => warn.mock.calls.filter((c) => String(c[0]).includes('gh-b'));
      expect(workLines()).toHaveLength(1);
      expect(String(workLines()[0][0])).toContain('not logged into any GitHub hosts');

      // Ten more minutes of ticks: no new notice, no new log line.
      for (let i = 0; i < 10; i++) {
        clock += GITHUB_RECHECK_MS;
        await feature.poll();
      }
      expect(notices()).toHaveLength(1);
      expect(workLines()).toHaveLength(1);
      expect(p.sent.some((m) => m.type === 'githubStatus')).toBe(false);

      // The login comes back: the notice goes away and the data arrives, no restart.
      login(work, 'cuenta-b');
      clock += GITHUB_RECHECK_MS;
      await feature.poll();
      expect(notices().at(-1)).toEqual({ type: 'githubNotice' });
      expect(p.sent.find((m) => m.type === 'githubStatus')).toMatchObject({ login: 'cuenta-b' });
      feature.dispose?.();
    });

    it('says how to install gh when there is none', async () => {
      const feature = createGithubFeature({
        now: () => new Date(clock),
        tickMs: 3_600_000,
        home,
        defaultConfigDir: () => undefined,
        bins: [path.join(home, 'no-existe')],
        baseEnv: emptyEnv,
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const p = page('principal');
      feature.connect?.(p.client);
      await feature.poll();
      expect(p.sent.at(-1)).toMatchObject({ type: 'githubNotice', command: 'brew install gh' });
      feature.dispose?.();
    });
  },
);
