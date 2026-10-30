import { describe, expect, it } from 'vitest';

import { createGithubFeature, parseGithub } from '../../server/githubFeature.js';

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
      query: async () => {
        asked++;
        return answer;
      },
    });
    await feature.poll(); // the read at start (nobody listening)
    expect(asked).toBe(0);
    const sent: Array<Record<string, unknown>> = [];
    const guest: Array<Record<string, unknown>> = [];
    const page = { privileged: true, send: (m: Record<string, unknown>) => sent.push(m) };
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
});
