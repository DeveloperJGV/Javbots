import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rgbaToHex } from '../../core/src/assets/colorUtils.js';
import { CHAR_COUNT } from '../../core/src/assets/constants.js';
import { loadExternalCharacterSprites } from '../src/assetLoader.js';
import { loadAllCharacters } from '../src/assetReload.js';
import { loadAvatar } from '../src/avatarLoader.js';
import { AVATAR_NAME_MAX_LENGTH } from '../src/constants.js';

const SAMPLE_DIR = path.join(__dirname, '../../webview-ui/public/assets/characters');

const dirs: string[] = [];
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-avatar-'));
  dirs.push(dir);
  return dir;
}

/** A sheet of the given size; the top-left pixel is opaque so each sheet can be told apart. */
function sheetPng(width = 192, height = 132, red = 255): Buffer {
  const png = new PNG({ width, height });
  png.data[0] = red;
  png.data[3] = 255;
  return PNG.sync.write(png);
}

function writeAvatar(root: string, manifest: unknown, file = 'avatar.png', png = sheetPng()): void {
  const dir = path.join(root, 'assets', 'avatar');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  );
  fs.writeFileSync(path.join(dir, file), png);
}

/** A bundled-style root with the CHAR_COUNT boss sheets. */
function factoryRoot(): string {
  const root = tempDir();
  const chars = path.join(root, 'assets', 'characters');
  fs.mkdirSync(chars, { recursive: true });
  for (let i = 0; i < CHAR_COUNT; i++) {
    fs.copyFileSync(path.join(SAMPLE_DIR, `char_${i}.png`), path.join(chars, `char_${i}.png`));
  }
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('loadAvatar', () => {
  it('loads the default sheet with a valid manifest', () => {
    const root = tempDir();
    writeAvatar(root, { name: 'Dueña' });
    const avatar = loadAvatar(root);
    expect(avatar?.name).toBe('Dueña');
    expect(avatar?.sheet.down).toHaveLength(8);
    expect(avatar?.sheet.up).toHaveLength(8);
    expect(avatar?.sheet.right).toHaveLength(8);
  });

  it('uses the sheet named in the manifest and has no name when none is given', () => {
    const root = tempDir();
    writeAvatar(root, { sheet: 'jefa.png' }, 'jefa.png');
    const avatar = loadAvatar(root);
    expect(avatar).not.toBeNull();
    expect(avatar).not.toHaveProperty('name');
  });

  it('returns null without an avatar folder', () => {
    expect(loadAvatar(tempDir())).toBeNull();
  });

  it('returns null (with a warning) for a broken manifest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = tempDir();
    writeAvatar(root, '{ not json');
    expect(loadAvatar(root)).toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain('[AssetLoader]');
  });

  it('rejects a sheet path that leaves the folder', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = tempDir();
    writeAvatar(root, { sheet: '../avatar.png' });
    fs.writeFileSync(path.join(root, 'assets', 'avatar.png'), sheetPng());
    expect(loadAvatar(root)).toBeNull();
    writeAvatar(root, { sheet: 'sub/avatar.png' });
    expect(loadAvatar(root)).toBeNull();
    writeAvatar(root, { sheet: 'avatar.gif' });
    expect(loadAvatar(root)).toBeNull();
  });

  it('rejects a sheet of the wrong size', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = tempDir();
    writeAvatar(root, {}, 'avatar.png', sheetPng(96, 96));
    expect(loadAvatar(root)).toBeNull();
  });

  it('trims the name, caps its length and drops an empty one', () => {
    const root = tempDir();
    writeAvatar(root, { name: '  Dueño  ' });
    expect(loadAvatar(root)?.name).toBe('Dueño');
    writeAvatar(root, { name: 'x'.repeat(AVATAR_NAME_MAX_LENGTH + 10) });
    expect(loadAvatar(root)?.name).toHaveLength(AVATAR_NAME_MAX_LENGTH);
    writeAvatar(root, { name: '   ' });
    expect(loadAvatar(root)).not.toHaveProperty('name');
  });
});

describe('loadAllCharacters with an office owner', () => {
  it('has no owner when no dir has an avatar', async () => {
    const chars = await loadAllCharacters(factoryRoot(), []);
    expect(chars?.characters).toHaveLength(CHAR_COUNT);
    expect(chars).not.toHaveProperty('owner');
  });

  it('appends the owner sheet last, after numbered and named sheets, without moving names', async () => {
    const ext = tempDir();
    const extChars = path.join(ext, 'assets', 'characters');
    fs.mkdirSync(extChars, { recursive: true });
    fs.copyFileSync(path.join(SAMPLE_DIR, 'char_0.png'), path.join(extChars, 'becario.png'));
    writeAvatar(ext, { name: 'Dueño' });

    const root = factoryRoot();
    const without = await loadExternalCharacterSprites(ext);
    const chars = await loadAllCharacters(root, [ext]);

    expect(chars?.characters).toHaveLength(CHAR_COUNT + (without?.characters.length ?? 0) + 1);
    expect(chars?.owner).toEqual({ sheet: chars!.characters.length - 1, name: 'Dueño' });
    expect(chars?.names).toEqual({ becario: CHAR_COUNT });
  });

  it('the last dir with an avatar wins', async () => {
    const root = factoryRoot();
    writeAvatar(root, { name: 'Fábrica' });
    const a = tempDir();
    writeAvatar(a, { name: 'Primera' }, 'avatar.png', sheetPng(192, 132, 10));
    const b = tempDir();
    writeAvatar(b, { name: 'Segunda' }, 'avatar.png', sheetPng(192, 132, 20));
    const empty = tempDir();

    const chars = await loadAllCharacters(root, [a, b, empty]);
    expect(chars?.characters).toHaveLength(CHAR_COUNT + 1);
    expect(chars?.owner?.name).toBe('Segunda');
    expect(chars!.characters[chars!.owner!.sheet].down[0][0][0]).toBe(
      loadAvatar(b)!.sheet.down[0][0][0],
    );

    const onlyRoot = await loadAllCharacters(root, [empty]);
    expect(onlyRoot?.owner).toEqual({ sheet: CHAR_COUNT, name: 'Fábrica' });
  });

  it('has no owner when no characters loaded', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const root = tempDir();
    writeAvatar(root, { name: 'Dueño' });
    expect(await loadAllCharacters(root, [])).toBeNull();
  });
});

/** An emotes sheet: `rows` rows of `cols` cells; each cell's bottom-center pixel is painted with its row and frame. */
function emotesPng(cols = 8, rows = 4, cellW = 32, cellH = 48): Buffer {
  const png = new PNG({ width: cols * cellW, height: rows * cellH });
  for (let r = 0; r < rows; r++) {
    for (let f = 0; f < cols; f++) {
      const i = ((r * cellH + cellH - 1) * png.width + f * cellW + cellW / 2) * 4;
      png.data[i] = r * 10;
      png.data[i + 1] = f * 10;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const EMOTES = {
  sheet: 'emotes.png',
  cellW: 32,
  cellH: 48,
  list: [
    { id: 'greet', row: 0, frames: 8, fps: 8, loops: 1 },
    { id: 'dance', row: 1, frames: 8, fps: 8, loops: 3, idle: true },
    { id: 'cheer', row: 2, frames: 6, fps: 10, loops: 1 },
    { id: 'drink', row: 3, frames: 8, fps: 6, loops: 1, idle: true },
  ],
};

function writeEmotes(root: string, emotes: unknown, png: Buffer | null = emotesPng()): void {
  writeAvatar(root, { name: 'Dueño', emotes });
  if (png) fs.writeFileSync(path.join(root, 'assets', 'avatar', 'emotes.png'), png);
}

describe('loadAvatar emotes', () => {
  it('has no emotes without the block', () => {
    const root = tempDir();
    writeAvatar(root, {});
    expect(loadAvatar(root)).not.toHaveProperty('emotes');
  });

  it('loads each row as an emote, cell by cell, with its settings', () => {
    const root = tempDir();
    writeEmotes(root, EMOTES);
    const emotes = loadAvatar(root)?.emotes;
    expect(emotes?.map((e) => e.id)).toEqual(['greet', 'dance', 'cheer', 'drink']);
    const cheer = emotes![2];
    expect(cheer.frames).toHaveLength(6);
    expect(cheer.frames[0]).toHaveLength(48);
    expect(cheer.frames[0][0]).toHaveLength(32);
    expect(cheer).toMatchObject({ fps: 10, loops: 1 });
    expect(cheer).not.toHaveProperty('idle');
    expect(emotes![1].idle).toBe(true);
    // Row 2, frame 5: its own cell, not a neighbour's
    expect(cheer.frames[5][47][16]).toBe(rgbaToHex(20, 50, 0, 255));
  });

  it('uses the default sheet, cell size, fps and loops', () => {
    const root = tempDir();
    writeEmotes(root, { list: [{ id: 'wave', row: 0, frames: 2, idle: true }] });
    const [wave] = loadAvatar(root)!.emotes!;
    expect(wave).toMatchObject({ id: 'wave', fps: 8, loops: 1, idle: true });
    expect(wave.frames[0]).toHaveLength(48);
  });

  it('an empty list is no emotes, and the owner still loads', () => {
    const root = tempDir();
    writeEmotes(root, { list: [] }, null);
    const avatar = loadAvatar(root);
    expect(avatar).not.toBeNull();
    expect(avatar).not.toHaveProperty('emotes');
  });

  const broken: Array<[string, unknown, Buffer | null]> = [
    ['not an object', 'dance', emotesPng()],
    ['list is not a list', { list: {} }, emotesPng()],
    ['missing sheet', EMOTES, null],
    ['a row outside the sheet', { list: [{ id: 'x', row: 4, frames: 1 }] }, emotesPng()],
    ['more frames than the sheet', { list: [{ id: 'x', row: 0, frames: 9 }] }, emotesPng()],
    [
      'a sheet smaller than one cell',
      { list: [{ id: 'x', row: 0, frames: 1 }] },
      emotesPng(1, 1, 16, 16),
    ],
    [
      'repeated ids',
      {
        list: [
          { id: 'x', row: 0, frames: 1 },
          { id: 'x', row: 1, frames: 1 },
        ],
      },
      emotesPng(),
    ],
    ['zero frames', { list: [{ id: 'x', row: 0, frames: 0 }] }, emotesPng()],
    ['negative row', { list: [{ id: 'x', row: -1, frames: 1 }] }, emotesPng()],
    ['huge fps', { list: [{ id: 'x', row: 0, frames: 1, fps: 1e9 }] }, emotesPng()],
    ['zero fps', { list: [{ id: 'x', row: 0, frames: 1, fps: 0 }] }, emotesPng()],
    ['NaN-like fps', { list: [{ id: 'x', row: 0, frames: 1, fps: 'fast' }] }, emotesPng()],
    ['huge loops', { list: [{ id: 'x', row: 0, frames: 1, loops: 1000 }] }, emotesPng()],
    ['fractional loops', { list: [{ id: 'x', row: 0, frames: 1, loops: 1.5 }] }, emotesPng()],
    ['bad id', { list: [{ id: '../x', row: 0, frames: 1 }] }, emotesPng()],
    ['idle not boolean', { list: [{ id: 'x', row: 0, frames: 1, idle: 'yes' }] }, emotesPng()],
    ['huge cells', { cellW: 4096, list: [{ id: 'x', row: 0, frames: 1 }] }, emotesPng()],
    ['tiny cells', { cellH: 1, list: [{ id: 'x', row: 0, frames: 1 }] }, emotesPng()],
    [
      'sheet outside the folder',
      { sheet: '../emotes.png', list: [{ id: 'x', row: 0, frames: 1 }] },
      emotesPng(),
    ],
    [
      'too many emotes',
      { list: Array.from({ length: 17 }, (_, i) => ({ id: `e${i}`, row: 0, frames: 1 })) },
      emotesPng(),
    ],
    ['not a PNG', EMOTES, Buffer.from('nope')],
    ['a corrupt PNG', EMOTES, Buffer.concat([emotesPng().subarray(0, 40), Buffer.alloc(30)])],
  ];
  for (const [what, emotes, png] of broken) {
    it(`${what}: the owner loads without emotes and it warns`, () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = tempDir();
      writeEmotes(root, emotes, png);
      let avatar: ReturnType<typeof loadAvatar> = null;
      expect(() => (avatar = loadAvatar(root))).not.toThrow();
      expect(avatar).not.toBeNull();
      expect(avatar!.name).toBe('Dueño');
      expect(avatar).not.toHaveProperty('emotes');
      expect(warn).toHaveBeenCalled();
      expect(String(warn.mock.calls[0]?.[0])).toContain('without emotes');
    });
  }

  it('the emotes travel with the owner sheet', async () => {
    const root = factoryRoot();
    writeEmotes(root, EMOTES);
    const chars = await loadAllCharacters(root, []);
    expect(chars?.owner?.sheet).toBe(CHAR_COUNT);
    expect(chars?.owner?.emotes?.map((e) => e.id)).toEqual(['greet', 'dance', 'cheer', 'drink']);
  });
});
