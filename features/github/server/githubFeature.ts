import { execFile } from 'child_process';

import type { GithubPullRequest, GithubRepo, GithubStatus } from '../../../core/src/messages.js';
import { createPollingFeature } from '../../../server/src/pollingFeature.js';
import {
  ghBins,
  GITHUB_MAX_REPOS,
  GITHUB_PRS_PER_REPO,
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

/** Runs the query with `gh` (its own login); null when there is no `gh` or it failed. */
export function runGithubQuery(bins: string[] = ghBins()): Promise<unknown> {
  const tryBin = (i: number): Promise<unknown> =>
    new Promise((resolve) => {
      if (i >= bins.length) return resolve(null);
      execFile(
        bins[i],
        ['api', 'graphql', '-f', `query=${GITHUB_QUERY}`],
        { timeout: GITHUB_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 << 20 },
        (err, stdout) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT')
            return resolve(tryBin(i + 1));
          if (err) {
            console.warn(`${LOG_PREFIX} gh falló:`, err.message.split('\n')[0]);
            return resolve(null);
          }
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(null);
          }
        },
      );
    });
  return tryBin(0);
}

/**
 * The GitHub room (features/github): repositories, open PRs and the contribution calendar, asked to `gh` when a page
 * opens and every GITHUB_REFRESH_MS while one is open. Privileged clients only. Without `gh` it sends nothing.
 */
export function createGithubFeature(
  opts: { query?: () => Promise<unknown>; now?: () => Date; tickMs?: number } = {},
): ReturnType<typeof createPollingFeature<GithubStatus>> {
  const query = opts.query ?? (() => runGithubQuery());
  const now = opts.now ?? (() => new Date());
  let latest: GithubStatus | null = null;
  let askedAt = -Infinity;
  let feature: ReturnType<typeof createPollingFeature<GithubStatus>> | null = null;
  feature = createPollingFeature({
    name: 'github',
    everyMs: opts.tickMs ?? GITHUB_TICK_MS,
    enabled: true,
    read: async () => {
      if (!feature?.listeners || now().getTime() - askedAt < GITHUB_REFRESH_MS) return null;
      askedAt = now().getTime();
      const status = parseGithub(await query(), now());
      if (!status) return null;
      latest = status;
      return status;
    },
    snapshot: () => latest,
    logPrefix: LOG_PREFIX,
  });
  // A page that opens gets the last answer right away and a fresh one if it's due
  const ready = feature.handleClientMessage?.bind(feature);
  feature.handleClientMessage = (msg, client) => {
    const handled = ready?.(msg, client) ?? false;
    if (msg.type === 'webviewReady' && client.privileged) void feature?.poll();
    return handled;
  };
  return feature;
}
