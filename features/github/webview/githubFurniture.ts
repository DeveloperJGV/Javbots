import type { GithubRepo, GithubStatus } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import {
  CABINET_GOLD,
  CABINET_GOLD_COMMITS,
  CABINET_LABEL,
  CABINET_LABEL_PRIVATE,
  CABINET_LABELS,
  CABINET_LIGHT,
  CABINET_METAL,
  CABINET_METAL_COMMITS,
  CABINET_RECENT_MS,
  CABINET_SHEET_COLORS,
  CABINET_SHEET_COMMITS,
  CABINET_SHEET_EDGE,
  CABINET_SHEET_ROW,
  CABINET_WOOD,
  GITHUB_CABINET_TYPE,
  GITHUB_GRAPH_TYPE,
  GITHUB_PRS_TYPE,
  GRAPH_GREENS,
  GRAPH_ORIGIN,
  GRAPH_STEPS,
  GRAPH_WEEKS,
  PR_NOTE_COLORS,
  PR_NOTE_LINE,
  PR_NOTE_PIN,
  PR_NOTE_SIZE,
  PR_NOTE_SPOTS,
} from './constants.js';
import type { GithubState } from './githubStore.js';

const baseType = (type: string | undefined): string => (type ?? '').split(':')[0];
export const isCabinet = (f: FurnitureInstance): boolean =>
  baseType(f.type) === GITHUB_CABINET_TYPE;
export const isGraph = (f: FurnitureInstance): boolean => baseType(f.type) === GITHUB_GRAPH_TYPE;
export const isPrBoard = (f: FurnitureInstance): boolean => baseType(f.type) === GITHUB_PRS_TYPE;

export type CabinetLevel = 'wood' | 'metal' | 'gold';

export function cabinetLevel(commits: number): CabinetLevel {
  if (commits >= CABINET_GOLD_COMMITS) return 'gold';
  if (commits >= CABINET_METAL_COMMITS) return 'metal';
  return 'wood';
}

export const LEVEL_LABELS: Record<CabinetLevel, string> = {
  wood: 'Madera',
  metal: 'Metal',
  gold: 'Oro',
};

/** Sheets on top of a cabinet: one per threshold reached. */
export function sheetCount(commits: number): number {
  return CABINET_SHEET_COMMITS.filter((c) => commits >= c).length;
}

export function isRecent(repo: GithubRepo, now: Date): boolean {
  return !!repo.pushedAt && now.getTime() - Date.parse(repo.pushedAt) < CABINET_RECENT_MS;
}

const up = (c: string): string => c.toUpperCase();
const PALETTES: Record<CabinetLevel, Map<string, string>> = {
  wood: new Map(),
  metal: new Map(CABINET_WOOD.map((c, i) => [up(c), up(CABINET_METAL[i])])),
  gold: new Map(CABINET_WOOD.map((c, i) => [up(c), up(CABINET_GOLD[i])])),
};

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();
function cached(sprite: SpriteData, key: string, draw: () => SpriteData): SpriteData {
  let byKey = cache.get(sprite);
  if (!byKey) {
    byKey = new Map();
    cache.set(sprite, byKey);
  }
  let out = byKey.get(key);
  if (!out) {
    out = draw();
    byKey.set(key, out);
  }
  return out;
}

const paint = (out: SpriteData, x: number, y: number, color: string): void => {
  const row = out[y];
  if (row && x >= 0 && x < row.length) row[x] = color;
};

/** A cabinet for one repository: material by commits, sheets on top, light if pushed lately, red labels if private. */
export function cabinetSprite(sprite: SpriteData, repo: GithubRepo, now: Date): SpriteData {
  const level = cabinetLevel(repo.commits);
  const sheets = sheetCount(repo.commits);
  const recent = isRecent(repo, now);
  const key = `${level}/${sheets}/${recent ? 1 : 0}/${repo.private ? 1 : 0}`;
  return cached(sprite, key, () => {
    const palette = PALETTES[level];
    const label = up(CABINET_LABEL);
    const out = sprite.map((row) => row.map((c) => palette.get(up(c)) ?? c));
    if (repo.private) {
      for (const l of CABINET_LABELS) {
        for (let dx = 0; dx < l.w; dx++) {
          if (up(sprite[l.y]?.[l.x + dx] ?? '') === label)
            paint(out, l.x + dx, l.y, up(CABINET_LABEL_PRIVATE));
        }
      }
    }
    for (let i = 0; i < sheets; i++) {
      const y = CABINET_SHEET_ROW - i;
      const shift = i % 2;
      paint(out, 2 + shift, y, CABINET_SHEET_EDGE);
      for (let x = 3 + shift; x < 12 + shift; x++) paint(out, x, y, CABINET_SHEET_COLORS[shift]);
      paint(out, 12 + shift, y, CABINET_SHEET_EDGE);
    }
    if (recent) paint(out, CABINET_LIGHT.x, CABINET_LIGHT.y, CABINET_LIGHT.on);
    return out;
  });
}

/** Green shade index for a day's contributions (-1 = none). */
export function greenStep(count: number): number {
  let step = -1;
  GRAPH_STEPS.forEach((min, i) => {
    if (count >= min) step = i;
  });
  return step;
}

/** The contribution graph with the last GRAPH_WEEKS weeks (the newest on the right). */
export function graphSprite(sprite: SpriteData, weeks: readonly (readonly number[])[]): SpriteData {
  const shown = weeks.slice(-GRAPH_WEEKS);
  const key = shown.map((w) => w.map(greenStep).join('')).join('|');
  return cached(sprite, key, () => {
    const out = sprite.map((row) => row.slice());
    const offset = GRAPH_WEEKS - shown.length;
    shown.forEach((week, wi) => {
      week.forEach((count, day) => {
        const step = greenStep(count);
        if (step < 0) return;
        const x0 = GRAPH_ORIGIN.x + (wi + offset) * GRAPH_ORIGIN.step;
        const y0 = GRAPH_ORIGIN.y + day * GRAPH_ORIGIN.step;
        for (let dy = 0; dy < GRAPH_ORIGIN.cell; dy++)
          for (let dx = 0; dx < GRAPH_ORIGIN.cell; dx++)
            paint(out, x0 + dx, y0 + dy, GRAPH_GREENS[step]);
      });
    });
    return out;
  });
}

/** The cork board with a pinned note per open PR (as many as fit). */
export function prBoardSprite(sprite: SpriteData, count: number): SpriteData {
  const notes = Math.min(count, PR_NOTE_SPOTS.length);
  return cached(sprite, `prs/${notes}`, () => {
    const out = sprite.map((row) => row.slice());
    PR_NOTE_SPOTS.slice(0, notes).forEach((spot, i) => {
      for (let dy = 0; dy < PR_NOTE_SIZE; dy++)
        for (let dx = 0; dx < PR_NOTE_SIZE; dx++)
          paint(out, spot.x + dx, spot.y + dy, PR_NOTE_COLORS[i % PR_NOTE_COLORS.length]);
      for (let dx = 1; dx < PR_NOTE_SIZE - 1; dx++)
        paint(out, spot.x + dx, spot.y + 2, PR_NOTE_LINE);
      paint(out, spot.x + 2, spot.y, PR_NOTE_PIN);
    });
    return out;
  });
}

/** Cabinets in reading order (top row first, then left to right): the order repositories fill them in. */
export function cabinetOrder(instances: readonly FurnitureInstance[]): FurnitureInstance[] {
  return instances.filter(isCabinet).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The repository each cabinet holds: the newest push in the first cabinet. Cabinets left over stay plain wood. */
export function repoForCabinet(
  instances: readonly FurnitureInstance[],
  cabinet: FurnitureInstance,
  status: GithubStatus | undefined,
): GithubRepo | undefined {
  if (!status) return undefined;
  const i = cabinetOrder(instances).findIndex((c) => c.x === cabinet.x && c.y === cabinet.y);
  return i >= 0 ? status.repos[i] : undefined;
}

/** Every GitHub piece in the office shows the latest status. */
export function applyGithubFurniture(
  instances: FurnitureInstance[],
  state: GithubState,
  now: Date = new Date(),
): FurnitureInstance[] {
  const status = state.status;
  if (!status || !instances.some((f) => isCabinet(f) || isGraph(f) || isPrBoard(f)))
    return instances;
  const order = cabinetOrder(instances);
  const prCount = status.repos.reduce((sum, r) => sum + r.openPullRequests, 0);
  return instances.map((f) => {
    if (isCabinet(f)) {
      const repo = status.repos[order.indexOf(f)];
      return repo ? { ...f, sprite: cabinetSprite(f.sprite, repo, now) } : f;
    }
    if (isGraph(f)) return { ...f, sprite: graphSprite(f.sprite, status.weeks) };
    if (isPrBoard(f)) return { ...f, sprite: prBoardSprite(f.sprite, prCount) };
    return f;
  });
}
