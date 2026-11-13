import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  ConnectionInfo,
  GithubNotice,
  GithubPullRequest,
  GithubRepo,
  GithubStatus,
} from '../../../core/src/messages.js';
import { MAIN_OFFICE } from '../../../core/src/offices.js';
import { childEnv, expandHome } from '../../../server/src/cliPath.js';
import { LAYOUT_FILE_DIR } from '../../../server/src/constants.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import {
  ghBins,
  GITHUB_CONFIG_FILE,
  GITHUB_MAX_REPOS,
  GITHUB_PRS_PER_REPO,
  GITHUB_RECHECK_MS,
  GITHUB_REFRESH_MS,
  GITHUB_TICK_MS,
  GITHUB_TIMEOUT_MS,
  GITHUB_WEEKS,
  LOG_PREFIX,
} from './constants.js';

/** One GraphQL call: repositories with commits and open PRs, plus the contribution calendar. */
export const GITHUB_QUERY = `query {
  viewer {
    login
    repositories(first: ${GITHUB_MAX_REPOS}, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes {
        name url isPrivate pushedAt stargazerCount
        defaultBranchRef { target { ... on Commit { history { totalCount } } } }
        pullRequests(states: OPEN, first: ${GITHUB_PRS_PER_REPO}, orderBy: {field: CREATED_AT, direction: DESC}) {
          totalCount
          nodes { number title url author { login } }
        }
      }
    }
    contributionsCollection { contributionCalendar { weeks { contributionDays { contributionCount } } } }
  }
}`;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** `gh api graphql` output → what the room shows. Null when it isn't the expected shape. */
export function parseGithub(raw: unknown, now: Date): GithubStatus | null {
  const viewer = obj(obj(obj(raw).data).viewer);
  const login = str(viewer.login, 80);
  if (!login) return null;
  const repos: GithubRepo[] = [];
  const pullRequests: GithubPullRequest[] = [];
  const repositories = obj(viewer.repositories);
  for (const n of arr(repositories.nodes)) {
    const r = obj(n);
    const name = str(r.name, 100);
    if (!name) continue;
    const prs = obj(r.pullRequests);
    const repo: GithubRepo = {
      name,
      url: str(r.url, 300),
      private: r.isPrivate === true,
      stars: num(r.stargazerCount),
      commits: num(obj(obj(obj(obj(r.defaultBranchRef).target).history)).totalCount),
      openPullRequests: num(prs.totalCount),
    };
    const pushedAt = str(r.pushedAt, 40);
    if (pushedAt) repo.pushedAt = pushedAt;
    repos.push(repo);
    for (const p of arr(prs.nodes)) {
      const pr = obj(p);
      const item: GithubPullRequest = {
        repo: name,
        number: num(pr.number),
        title: str(pr.title),
        url: str(pr.url, 300),
      };
      const author = str(obj(pr.author).login, 80);
      if (author) item.author = author;
      pullRequests.push(item);
    }
  }
  const weeks = arr(obj(obj(viewer.contributionsCollection).contributionCalendar).weeks)
    .map((w) => arr(obj(w).contributionDays).map((d) => num(obj(d).contributionCount)))
    .slice(-GITHUB_WEEKS);
  return {
    type: 'githubStatus',
    login,
    totalRepos: num(repositories.totalCount),
    repos,
    pullRequests,
    weeks,
    updatedAt: now.toISOString(),
  };
}

// ── gh ─────────────────────────────────────────────────────

/** Why gh gave no data: not installed, no working login (none, expired or revoked token), or something else. */
export type GhProblem = 'sin-gh' | 'sin-sesion' | 'error';
export type GhAnswer =
  { ok: true; stdout: string } | { ok: false; problem: GhProblem; detail: string };

const AUTH_PROBLEM =
  /not logged in|gh auth login|authentication|bad credentials|HTTP 401|token .*(invalid|expired|revoked)/i;

/** The line of a failed gh run worth logging: its own message (stderr), not the echoed command. */
export function usefulGhLine(stderr: string, message: string): string {
  const fromStderr = stderr
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (fromStderr) return fromStderr.slice(0, 300);
  const lines = message.split('\n').map((l) => l.trim());
  return (lines.find((l) => l && !l.startsWith('Command failed')) ?? lines[0] ?? '').slice(0, 300);
}

export function ghProblemOf(text: string): GhProblem {
  return AUTH_PROBLEM.test(text) ? 'sin-sesion' : 'error';
}

/**
 * The environment of one gh run: nothing inherited decides the login. A complete PATH, GH_CONFIG_DIR set to the
 * account's folder (or removed: gh's default login), and gh never prompting.
 */
export function ghEnv(
  ghConfigDir?: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = childEnv({ GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }, base);
  delete env.GH_CONFIG_DIR;
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (ghConfigDir) env.GH_CONFIG_DIR = ghConfigDir;
  return env;
}

/** One gh run with the first binary that exists, as `ghConfigDir`'s login. Never rejects. */
export function runGh(
  args: string[],
  ghConfigDir?: string,
  bins: string[] = ghBins(),
  base: NodeJS.ProcessEnv = process.env,
): Promise<GhAnswer> {
  const env = ghEnv(ghConfigDir, base);
  const tryBin = (i: number): Promise<GhAnswer> =>
    new Promise((resolve) => {
      if (i >= bins.length)
        return resolve({ ok: false, problem: 'sin-gh', detail: 'No encontré gh en esta Mac' });
      execFile(
        bins[i],
        args,
        { timeout: GITHUB_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 << 20, env },
        (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT')
            return resolve(tryBin(i + 1));
          if (err) {
            const detail = usefulGhLine(String(stderr ?? ''), err.message);
            return resolve({
              ok: false,
              problem: ghProblemOf(`${stderr}\n${err.message}`),
              detail,
            });
          }
          resolve({ ok: true, stdout: String(stdout) });
        },
      );
    });
  return tryBin(0);
}

/** The room's query as `ghConfigDir`'s login: the parsed JSON, or why not. */
export async function runGithubQuery(
  ghConfigDir?: string,
  bins?: string[],
  base?: NodeJS.ProcessEnv,
): Promise<GhQueryAnswer> {
  const r = await runGh(['api', 'graphql', '-f', `query=${GITHUB_QUERY}`], ghConfigDir, bins, base);
  if (!r.ok) return r;
  try {
    return { ok: true, data: JSON.parse(r.stdout) as unknown };
  } catch {
    return { ok: false, problem: 'error', detail: 'gh contestó algo que no es JSON' };
  }
}
export type GhQueryAnswer = { ok: true; data: unknown } | Extract<GhAnswer, { ok: false }>;

/** The cheap check: gh is there, has a login, and its token still works (one small API call). */
export async function checkGhLogin(
  ghConfigDir?: string,
  bins?: string[],
  base?: NodeJS.ProcessEnv,
): Promise<GhQueryAnswer> {
  const r = await runGh(['api', 'user', '--jq', '.login'], ghConfigDir, bins, base);
  if (!r.ok) return r;
  const login = r.stdout.trim();
  return login
    ? { ok: true, data: login }
    : { ok: false, problem: 'error', detail: 'gh no dijo con qué cuenta entró' };
}

/** ~/.pixel-agents/sala-github.json's ghConfigDir (read each time: editing it applies without a restart). */
export function readDefaultGhConfigDir(home: string = os.homedir()): string | undefined {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(home, LAYOUT_FILE_DIR, GITHUB_CONFIG_FILE), 'utf-8'),
    ) as unknown;
    const dir = (raw as Record<string, unknown> | null)?.ghConfigDir;
    return typeof dir === 'string' && dir.trim() ? expandHome(dir.trim(), home) : undefined;
  } catch {
    return undefined;
  }
}

/** `/Users/x/.config/gh-a` → `~/.config/gh-a` (what the person types). */
function tilde(dir: string, home: string): string {
  return dir === home || dir.startsWith(home + path.sep) ? '~' + dir.slice(home.length) : dir;
}

/** The office's notice when an account's gh doesn't work: what's missing and the exact command that fixes it. */
export function ghNoticeText(
  problem: GhProblem,
  ghConfigDir: string | undefined,
  detail: string,
  home: string = os.homedir(),
): { text: string; command?: string } {
  const account = ghConfigDir
    ? `la cuenta de ${tilde(ghConfigDir, home)}`
    : 'la cuenta normal de gh';
  if (problem === 'sin-gh')
    return {
      text: 'GitHub: no encontré el programa gh en esta Mac. Instálalo con:',
      command: 'brew install gh',
    };
  if (problem === 'sin-sesion')
    return ghConfigDir
      ? {
          text: `GitHub: gh no tiene una sesión que sirva en ${account}. Entra otra vez en una terminal con:`,
          command: `GH_CONFIG_DIR=${tilde(ghConfigDir, home)} gh auth login`,
        }
      : {
          text:
            'GitHub: gh no tiene una sesión que sirva en la cuenta normal de gh. Entra con el comando de abajo, o ' +
            'si tu sesión vive en otra carpeta, ponla en ~/.pixel-agents/sala-github.json ({"ghConfigDir": "<carpeta>"}).',
          command: 'gh auth login',
        };
  return { text: `GitHub: gh no contestó con ${account} (${detail}). Lo vuelvo a intentar solo.` };
}

// ── The feature ────────────────────────────────────────────

interface Account {
  dir?: string;
  /** When its login was last checked (0 = never). */
  checkedAt: number;
  checking: boolean;
  problem: { problem: GhProblem; detail: string } | null;
  latest: GithubStatus | null;
  askedAt: number;
  okAt: number;
  /** The last line logged for it: the same failure is logged once, not every tick. */
  logged: string | null;
}

export interface GithubFeatureOptions {
  /** Injectable for tests. Both get the account's gh folder (undefined = gh's default login). */
  query?: (ghConfigDir?: string) => Promise<GhQueryAnswer>;
  check?: (ghConfigDir?: string) => Promise<GhQueryAnswer>;
  now?: () => Date;
  tickMs?: number;
  /** The login of the offices that don't pick one. Default: ~/.pixel-agents/sala-github.json. */
  defaultConfigDir?: () => string | undefined;
  home?: string;
  /** For tests: the gh binaries to try and the environment the runs start from (default: this process's). */
  bins?: string[];
  baseEnv?: NodeJS.ProcessEnv;
}

/**
 * The GitHub room (features/github): repositories, open PRs and the contribution calendar of the gh login the page's
 * office uses (`useConfigDirFor`; the others use sala-github.json or gh's default). At startup, and whenever an
 * office's folder changes, each login is checked once with a cheap call; a broken one gets ONE notice in the pages of
 * the offices that use it (`githubNotice`, with the command that fixes it) and one log line, and is re-checked quietly
 * until it works again, with no restart. Privileged clients only.
 */
export function createGithubFeature(opts: GithubFeatureOptions = {}): ServerFeature & {
  /** One tick right now (also what the timer calls). */
  poll(): Promise<void>;
  readonly listeners: number;
  connections(): ConnectionInfo[];
  /** A pack picks the gh login of one of its offices (read each tick). */
  useConfigDirFor(office: string, dir: () => string | undefined): void;
} {
  const query = opts.query ?? ((dir) => runGithubQuery(dir, opts.bins, opts.baseEnv));
  const check = opts.check ?? ((dir) => checkGhLogin(dir, opts.bins, opts.baseEnv));
  const now = opts.now ?? (() => new Date());
  const home = opts.home ?? os.homedir();
  const defaultDir = opts.defaultConfigDir ?? (() => readDefaultGhConfigDir(home));
  const officeDirs = new Map<string, () => string | undefined>();
  const accounts = new Map<string, Account>();
  const clients = new Set<FeatureClient>();
  let ticking: Promise<void> | null = null;

  const safe = (f: () => string | undefined): string | undefined => {
    try {
      return f() || undefined;
    } catch {
      return undefined;
    }
  };
  const dirFor = (office: string | undefined): string | undefined => {
    const own = office !== undefined ? officeDirs.get(office) : undefined;
    return own ? safe(own) : safe(defaultDir);
  };
  const account = (dir: string | undefined): Account => {
    const key = dir ?? '';
    let a = accounts.get(key);
    if (!a) {
      a = {
        dir,
        checkedAt: 0,
        checking: false,
        problem: null,
        latest: null,
        askedAt: -Infinity,
        okAt: 0,
        logged: null,
      };
      accounts.set(key, a);
    }
    return a;
  };
  const accountOf = (client: FeatureClient): Account =>
    account(dirFor(client.office ?? MAIN_OFFICE));
  /** The offices whose GitHub room uses this account. */
  const officesOf = (a: Account): string[] =>
    [MAIN_OFFICE, ...officeDirs.keys()].filter((o) => dirFor(o) === a.dir);
  const send = (client: FeatureClient, msg: object) => client.send(msg as Record<string, unknown>);

  function noticeFor(a: Account): GithubNotice {
    if (!a.problem) return { type: 'githubNotice' };
    return {
      type: 'githubNotice',
      ...ghNoticeText(a.problem.problem, a.dir, a.problem.detail, home),
    };
  }
  function tellClients(a: Account, msg: object): void {
    for (const c of clients) if (accountOf(c) === a) send(c, msg);
  }

  /** A failure: noted, logged once per distinct message, and the account's pages get the notice. */
  function failed(a: Account, r: Extract<GhAnswer, { ok: false }>): void {
    const changed = a.problem?.problem !== r.problem || a.problem?.detail !== r.detail;
    a.problem = { problem: r.problem, detail: r.detail };
    a.checkedAt = now().getTime();
    const who = a.dir ? `la cuenta de ${tilde(a.dir, home)}` : 'la cuenta normal de gh';
    const line =
      r.problem === 'sin-sesion'
        ? `gh no tiene sesión en ${who} (oficina ${officesOf(a).join(', ') || '—'}): ${r.detail}. ` +
          `Arréglalo con: ${noticeFor(a).command ?? 'gh auth login'}`
        : r.problem === 'sin-gh'
          ? 'No encontré gh (brew install gh).'
          : `gh falló con ${who}: ${r.detail}`;
    if (a.logged !== line) {
      console.warn(`${LOG_PREFIX} ${line}`);
      a.logged = line;
    }
    if (changed) tellClients(a, noticeFor(a));
  }
  function recovered(a: Account, login?: string): void {
    const was = a.problem;
    a.problem = null;
    a.checkedAt = now().getTime();
    if (was) {
      console.log(`${LOG_PREFIX} gh ya funciona otra vez${login ? ` (${login})` : ''}.`);
      a.logged = null;
      a.askedAt = -Infinity; // fresh data right away
      tellClients(a, noticeFor(a));
    }
  }

  async function tick(): Promise<void> {
    const t = now().getTime();
    // Every login some office uses gets its check, even with no page open (startup and folder changes).
    const inUse = new Set<Account>([account(dirFor(MAIN_OFFICE))]);
    for (const office of officeDirs.keys()) inUse.add(account(dirFor(office)));
    const listened = new Set<Account>();
    for (const c of clients) listened.add(accountOf(c));
    for (const a of listened) inUse.add(a);

    for (const a of inUse) {
      const due = a.checkedAt === 0 || (a.problem !== null && t - a.checkedAt >= GITHUB_RECHECK_MS);
      if (!due || a.checking) continue;
      a.checking = true;
      try {
        const r = await check(a.dir);
        if (r.ok) recovered(a, typeof r.data === 'string' ? r.data : undefined);
        else failed(a, r);
      } finally {
        a.checking = false;
      }
    }

    for (const a of listened) {
      if (a.problem || now().getTime() - a.askedAt < GITHUB_REFRESH_MS) continue;
      a.askedAt = now().getTime();
      const r = await query(a.dir);
      if (!r.ok) {
        failed(a, r);
        continue;
      }
      const status = parseGithub(r.data, now());
      if (!status) {
        failed(a, { ok: false, problem: 'error', detail: 'la respuesta no traía al usuario' });
        continue;
      }
      recovered(a, status.login);
      a.okAt = now().getTime();
      a.latest = status;
      tellClients(a, status);
    }
  }

  function poll(): Promise<void> {
    ticking ??= tick()
      .catch((err: unknown) => console.warn(`${LOG_PREFIX} Falló la revisión:`, err))
      .finally(() => (ticking = null));
    return ticking;
  }

  // The first tick waits for the packs to pick their offices' logins (they are created right after this feature).
  const first = setTimeout(() => void poll(), 0);
  first.unref?.();
  const timer = setInterval(() => void poll(), opts.tickMs ?? GITHUB_TICK_MS);
  timer.unref?.();

  return {
    name: 'github',
    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },
    handleClientMessage(msg, client) {
      if (msg.type !== 'webviewReady' || !client.privileged) return false;
      // After the core handler has read the page's office from this same message.
      queueMicrotask(() => {
        const a = accountOf(client);
        if (a.latest) send(client, a.latest);
        if (a.problem) send(client, noticeFor(a));
        void poll();
      });
      return false; // the core handler still runs
    },
    dispose() {
      clearTimeout(first);
      clearInterval(timer);
    },
    poll,
    get listeners() {
      return clients.size;
    },
    useConfigDirFor(office, dir) {
      officeDirs.set(office, dir);
    },
    connections: (): ConnectionInfo[] =>
      [...accounts.values()].map((a) => {
        const offices = officesOf(a);
        return {
          id: a.dir ? `github:${tilde(a.dir, home)}` : 'github',
          name: 'GitHub (gh)',
          feature: 'Sala de GitHub',
          purpose: 'Repositorios, pull requests abiertos y calendario de contribuciones',
          auth: a.dir
            ? `El login de gh en ${tilde(a.dir, home)} (oficina ${offices.join(', ') || '—'})`
            : `El login normal de gh (oficina ${offices.join(', ') || '—'})`,
          state: a.problem ? 'warn' : a.checkedAt ? 'ok' : 'off',
          detail: a.problem
            ? [noticeFor(a).text, noticeFor(a).command].filter(Boolean).join(' ')
            : a.latest
              ? `Conectado como ${a.latest.login}`
              : a.checkedAt
                ? 'Con sesión; aún sin abrir la sala'
                : 'Aún no se ha preguntado',
          ...(a.okAt ? { lastUsedAt: new Date(a.okAt).toISOString() } : {}),
        };
      }),
  };
}
