import { describe, expect, it } from 'vitest';

import type { GithubRepo, GithubStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance } from '../../../../webview-ui/src/office/types.js';
import {
  CABINET_GOLD,
  CABINET_LABEL_PRIVATE,
  CABINET_LIGHT,
  CABINET_WOOD,
  GRAPH_GREENS,
  GRAPH_ORIGIN,
  GRAPH_WEEKS,
  PR_NOTE_PIN,
  PR_NOTE_SPOTS,
} from '../../webview/constants.js';
import {
  applyGithubFurniture,
  cabinetLevel,
  cabinetSprite,
  graphSprite,
  greenStep,
  prBoardSprite,
  sheetCount,
} from '../../webview/githubFurniture.js';
import { lastDays, nextLevelText, sinceText } from '../../webview/githubText.js';

const NOW = new Date('2026-10-25T08:00:00.000Z');
const WOOD_MID = CABINET_WOOD[2].toUpperCase();
const fill = (w: number, h: number, c: string) =>
  Array.from({ length: h }, () => new Array<string>(w).fill(c));
const repo = (over: Partial<GithubRepo>): GithubRepo => ({
  name: 'r',
  url: '',
  private: false,
  stars: 0,
  commits: 0,
  openPullRequests: 0,
  ...over,
});

describe('github room', () => {
  it('cabinet levels and sheets grow with commits', () => {
    expect([1, 19, 20, 99, 100].map(cabinetLevel)).toEqual([
      'wood',
      'wood',
      'metal',
      'metal',
      'gold',
    ]);
    expect([0, 1, 5, 59, 60, 400].map(sheetCount)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(nextLevelText(5)).toBe('15 para metal');
    expect(nextLevelText(150)).toBe('');
  });

  it('paints the cabinet: gold, light on after a recent push, red labels when private', () => {
    const wood = fill(16, 32, WOOD_MID);
    wood[11][4] = '#ECE4CE';
    const out = cabinetSprite(
      wood,
      repo({ commits: 150, private: true, pushedAt: '2026-10-24T00:00:00Z' }),
      NOW,
    );
    expect(out[20][2]).toBe(CABINET_GOLD[2].toUpperCase());
    expect(out[11][4]).toBe(CABINET_LABEL_PRIVATE.toUpperCase());
    expect(out[CABINET_LIGHT.y][CABINET_LIGHT.x]).toBe(CABINET_LIGHT.on);
    expect(wood[20][2]).toBe(WOOD_MID); // the original stays
    const old = cabinetSprite(wood, repo({ commits: 3, pushedAt: '2026-01-01T00:00:00Z' }), NOW);
    expect(old[CABINET_LIGHT.y][CABINET_LIGHT.x]).not.toBe(CABINET_LIGHT.on);
  });

  it('graph shows the newest weeks on the right; the board a note per PR', () => {
    expect([0, 1, 3, 4, 9].map(greenStep)).toEqual([-1, 0, 1, 2, 3]);
    const weeks = Array.from({ length: 12 }, (_, w) => new Array<number>(7).fill(w === 11 ? 9 : 0));
    const blank = '#000000';
    const g = graphSprite(fill(32, 32, blank), weeks);
    const lastX = GRAPH_ORIGIN.x + (GRAPH_WEEKS - 1) * GRAPH_ORIGIN.step;
    expect(g[GRAPH_ORIGIN.y][lastX]).toBe(GRAPH_GREENS[3]);
    expect(g[GRAPH_ORIGIN.y][GRAPH_ORIGIN.x]).toBe(blank);
    const b = prBoardSprite(fill(32, 32, blank), 99);
    const pins = PR_NOTE_SPOTS.filter((s) => b[s.y][s.x + 2] === PR_NOTE_PIN);
    expect(pins).toHaveLength(PR_NOTE_SPOTS.length);
    expect(
      lastDays(
        [
          [1, 1, 1, 1, 1, 1, 1],
          [2, 2],
        ],
        7,
      ),
    ).toBe(9);
    expect(sinceText('2026-10-22T08:00:00Z', NOW)).toBe('hace 3 días');
  });

  it('fills cabinets in reading order with the newest repositories', () => {
    const cab = (x: number, y: number): FurnitureInstance => ({
      sprite: fill(16, 32, WOOD_MID),
      x,
      y,
      zY: y,
      type: 'GITHUB_CABINET',
    });
    const status: GithubStatus = {
      type: 'githubStatus',
      login: 'a',
      totalRepos: 2,
      repos: [repo({ name: 'nuevo', commits: 200 }), repo({ name: 'viejo', commits: 30 })],
      pullRequests: [],
      weeks: [],
      updatedAt: NOW.toISOString(),
    };
    const out = applyGithubFurniture(
      [cab(32, 16), cab(0, 16), cab(0, 64)],
      { status, detailOpen: false, hover: null },
      NOW,
    );
    expect(out[1].sprite[20][2]).toBe(CABINET_GOLD[2].toUpperCase()); // top left: the newest
    expect(out[0].sprite[20][2]).not.toBe(WOOD_MID); // next: metal
    expect(out[2].sprite[20][2]).toBe(WOOD_MID); // no repo left: plain wood
  });
});
