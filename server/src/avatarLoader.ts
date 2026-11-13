/**
 * Office owner loader: an optional character sheet that is not an agent.
 *
 * Reads `<root>/assets/avatar/manifest.json` (`{ "sheet"?: string, "name"?: string, "emotes"?: {...} }`)
 * and the sheet it names (192×132, same layout as char_N.png). Never throws: any problem is a warning
 * and `null`, so a missing or broken owner folder leaves the office as it was. A broken `emotes` block
 * only drops the emotes (with a warning): the owner still loads, as without them.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

import { rgbaToHex } from '../../core/src/assets/colorUtils.js';
import {
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHAR_FRAMES_PER_ROW,
  CHARACTER_DIRECTIONS,
} from '../../core/src/assets/constants.js';
import { decodeCharacterPng } from '../../core/src/assets/pngDecoder.js';
import type { CharacterDirectionSprites } from '../../core/src/assets/types.js';
import {
  AVATAR_DEFAULT_SHEET,
  AVATAR_DIR,
  AVATAR_EMOTE_CELL_H,
  AVATAR_EMOTE_CELL_MAX_H,
  AVATAR_EMOTE_CELL_MAX_W,
  AVATAR_EMOTE_CELL_MIN,
  AVATAR_EMOTE_CELL_W,
  AVATAR_EMOTE_DEFAULT_SHEET,
  AVATAR_EMOTE_FPS_DEFAULT,
  AVATAR_EMOTE_FPS_MAX,
  AVATAR_EMOTE_FPS_MIN,
  AVATAR_EMOTE_ID,
  AVATAR_EMOTE_LOOPS_MAX,
  AVATAR_EMOTE_MAX_COUNT,
  AVATAR_EMOTE_MAX_FRAMES,
  AVATAR_NAME_MAX_LENGTH,
  MAX_AVATAR_PNG_SIZE,
} from './constants.js';

/** One emote of the owner: its frames (cells of the emotes sheet, left to right) and how to play them. */
export interface LoadedOwnerEmote {
  id: string;
  frames: string[][][];
  fps: number;
  loops: number;
  /** Played now and then while he stands around. */
  idle?: boolean;
}

export interface LoadedAvatar {
  sheet: CharacterDirectionSprites;
  name?: string;
  emotes?: LoadedOwnerEmote[];
}

const SHEET_WIDTH = CHAR_FRAME_W * CHAR_FRAMES_PER_ROW;
const SHEET_HEIGHT = CHAR_FRAME_H * CHARACTER_DIRECTIONS.length;
/** A plain file name ending in .png: no separators, no leading dot. */
const SHEET_FILE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.png$/i;

/** Width and height from the PNG header (signature + IHDR), or null when it is not a PNG. */
function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (
    buf.length < 24 ||
    buf.readUInt32BE(0) !== 0x89504e47 ||
    buf.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** A sheet file name inside the avatar folder, resolved; null when it is not a plain .png name inside it. */
function sheetPathIn(avatarDir: string, file: unknown): string | null {
  if (typeof file !== 'string' || !SHEET_FILE.test(file) || file.includes('..')) return null;
  const resolvedDir = path.resolve(avatarDir);
  const sheetPath = path.resolve(avatarDir, file);
  return sheetPath.startsWith(resolvedDir + path.sep) ? sheetPath : null;
}

/**
 * The owner's emotes (`manifest.emotes`): one row of `cellW`×`cellH` cells per emote in their own sheet. Any
 * problem drops all of them with a warning (null), never the owner. An empty list is just no emotes.
 */
function loadEmotes(avatarDir: string, raw: unknown): LoadedOwnerEmote[] | null {
  const skip = (why: string): null => {
    console.warn(`  [AssetLoader] Owner in ${avatarDir} loads without emotes: ${why}`);
    return null;
  };
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return skip('emotes is not an object');
    }
    const spec = raw as { sheet?: unknown; cellW?: unknown; cellH?: unknown; list?: unknown };

    const cellW = spec.cellW === undefined ? AVATAR_EMOTE_CELL_W : spec.cellW;
    const cellH = spec.cellH === undefined ? AVATAR_EMOTE_CELL_H : spec.cellH;
    if (
      !isInt(cellW) ||
      !isInt(cellH) ||
      cellW < AVATAR_EMOTE_CELL_MIN ||
      cellH < AVATAR_EMOTE_CELL_MIN ||
      cellW > AVATAR_EMOTE_CELL_MAX_W ||
      cellH > AVATAR_EMOTE_CELL_MAX_H
    ) {
      return skip(
        `cells must be whole px, ${AVATAR_EMOTE_CELL_MIN} to ${AVATAR_EMOTE_CELL_MAX_W}×${AVATAR_EMOTE_CELL_MAX_H}`,
      );
    }

    if (!Array.isArray(spec.list)) return skip('emotes.list is not a list');
    if (spec.list.length > AVATAR_EMOTE_MAX_COUNT) {
      return skip(`more than ${AVATAR_EMOTE_MAX_COUNT} emotes`);
    }
    const plans: Array<Omit<LoadedOwnerEmote, 'frames'> & { row: number; count: number }> = [];
    const seen = new Set<string>();
    for (const item of spec.list as unknown[]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return skip('an emote is not an object');
      }
      const e = item as {
        id?: unknown;
        row?: unknown;
        frames?: unknown;
        fps?: unknown;
        loops?: unknown;
        idle?: unknown;
      };
      if (typeof e.id !== 'string' || !AVATAR_EMOTE_ID.test(e.id)) {
        return skip('an emote has an invalid id');
      }
      if (seen.has(e.id)) return skip(`emote "${e.id}" is listed twice`);
      seen.add(e.id);
      if (!isInt(e.row) || e.row < 0) return skip(`emote "${e.id}" has an invalid row`);
      if (!isInt(e.frames) || e.frames < 1 || e.frames > AVATAR_EMOTE_MAX_FRAMES) {
        return skip(`emote "${e.id}" needs 1 to ${AVATAR_EMOTE_MAX_FRAMES} frames`);
      }
      const fps = e.fps === undefined ? AVATAR_EMOTE_FPS_DEFAULT : e.fps;
      if (
        typeof fps !== 'number' ||
        !Number.isFinite(fps) ||
        fps < AVATAR_EMOTE_FPS_MIN ||
        fps > AVATAR_EMOTE_FPS_MAX
      ) {
        return skip(
          `emote "${e.id}" fps must be ${AVATAR_EMOTE_FPS_MIN} to ${AVATAR_EMOTE_FPS_MAX}`,
        );
      }
      const loops = e.loops === undefined ? 1 : e.loops;
      if (!isInt(loops) || loops < 1 || loops > AVATAR_EMOTE_LOOPS_MAX) {
        return skip(`emote "${e.id}" loops must be 1 to ${AVATAR_EMOTE_LOOPS_MAX}`);
      }
      if (e.idle !== undefined && typeof e.idle !== 'boolean') {
        return skip(`emote "${e.id}" idle must be true or false`);
      }
      plans.push({
        id: e.id,
        row: e.row,
        count: e.frames,
        fps,
        loops,
        ...(e.idle ? { idle: true } : {}),
      });
    }
    if (plans.length === 0) return [];

    const sheetPath = sheetPathIn(
      avatarDir,
      spec.sheet === undefined ? AVATAR_EMOTE_DEFAULT_SHEET : spec.sheet,
    );
    if (!sheetPath) return skip('invalid emotes sheet name');
    if (!fs.existsSync(sheetPath)) return skip(`${path.basename(sheetPath)} not found`);
    const size = fs.statSync(sheetPath).size;
    if (size > MAX_AVATAR_PNG_SIZE) {
      return skip(`emotes sheet is ${size} bytes (max ${MAX_AVATAR_PNG_SIZE})`);
    }
    const buffer = fs.readFileSync(sheetPath);
    const dims = pngSize(buffer);
    if (!dims) return skip('emotes sheet is not a PNG');
    if (
      dims.width > cellW * AVATAR_EMOTE_MAX_FRAMES ||
      dims.height > cellH * AVATAR_EMOTE_MAX_COUNT
    ) {
      return skip(`emotes sheet is too big (${dims.width}×${dims.height})`);
    }
    for (const p of plans) {
      if ((p.row + 1) * cellH > dims.height || p.count * cellW > dims.width) {
        return skip(`emote "${p.id}" (row ${p.row}, ${p.count} frames) falls outside the sheet`);
      }
    }

    const png = PNG.sync.read(buffer);
    return plans.map(({ row, count, ...emote }) => ({
      ...emote,
      frames: Array.from({ length: count }, (_, f) =>
        cellOf(png, f * cellW, row * cellH, cellW, cellH),
      ),
    }));
  } catch (err) {
    return skip(err instanceof Error ? err.message : String(err));
  }
}

/** One cell of a decoded PNG as sprite data ('' = transparent). */
function cellOf(png: PNG, x0: number, y0: number, w: number, h: number): string[][] {
  const rows: string[][] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * png.width + (x0 + x)) * 4;
      row.push(rgbaToHex(png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]));
    }
    rows.push(row);
  }
  return rows;
}

/** Load the office owner from `<root>/assets/avatar/`, or null when there is none (or it is invalid). */
export function loadAvatar(root: string): LoadedAvatar | null {
  const avatarDir = path.join(root, 'assets', AVATAR_DIR);
  const manifestPath = path.join(avatarDir, 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return null;

    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      console.warn(`  [AssetLoader] Skipping owner in ${avatarDir}: manifest is not an object`);
      return null;
    }
    const manifest = raw as { sheet?: unknown; name?: unknown; emotes?: unknown };

    const sheetFile = manifest.sheet === undefined ? AVATAR_DEFAULT_SHEET : manifest.sheet;
    if (typeof sheetFile !== 'string' || !SHEET_FILE.test(sheetFile) || sheetFile.includes('..')) {
      console.warn(`  [AssetLoader] Skipping owner in ${avatarDir}: invalid sheet name`);
      return null;
    }
    const resolvedDir = path.resolve(avatarDir);
    const sheetPath = path.resolve(avatarDir, sheetFile);
    if (!sheetPath.startsWith(resolvedDir + path.sep)) {
      console.warn(`  [AssetLoader] Skipping owner with path outside directory: ${sheetFile}`);
      return null;
    }
    if (!fs.existsSync(sheetPath)) {
      console.warn(`  [AssetLoader] Skipping owner in ${avatarDir}: ${sheetFile} not found`);
      return null;
    }
    const size = fs.statSync(sheetPath).size;
    if (size > MAX_AVATAR_PNG_SIZE) {
      console.warn(
        `  [AssetLoader] Skipping oversized owner sheet: ${size} bytes (max ${MAX_AVATAR_PNG_SIZE})`,
      );
      return null;
    }

    const buffer = fs.readFileSync(sheetPath);
    const dims = pngSize(buffer);
    if (!dims || dims.width !== SHEET_WIDTH || dims.height !== SHEET_HEIGHT) {
      const got = dims ? `${dims.width}×${dims.height}` : 'not a PNG';
      console.warn(
        `  [AssetLoader] Skipping owner sheet ${sheetFile}: ${got}, expected ${SHEET_WIDTH}×${SHEET_HEIGHT}`,
      );
      return null;
    }

    let name: string | undefined;
    if (typeof manifest.name === 'string') {
      const trimmed = manifest.name.trim().slice(0, AVATAR_NAME_MAX_LENGTH).trim();
      if (trimmed) name = trimmed;
    }

    const avatar: LoadedAvatar = { sheet: decodeCharacterPng(buffer) };
    if (name) avatar.name = name;
    if (manifest.emotes !== undefined) {
      const emotes = loadEmotes(avatarDir, manifest.emotes);
      if (emotes && emotes.length > 0) avatar.emotes = emotes;
    }
    return avatar;
  } catch (err) {
    console.warn(
      `  [AssetLoader] Skipping owner in ${avatarDir}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
