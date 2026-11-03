import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadExternalCharacterSprites, mergeCharacterSprites } from '../src/assetLoader.js';

const SAMPLE = path.join(__dirname, '../../webview-ui/public/assets/characters/char_0.png');

const dirs: string[] = [];
function externalDir(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-sheets-'));
  dirs.push(root);
  const chars = path.join(root, 'assets', 'characters');
  fs.mkdirSync(chars, { recursive: true });
  for (const f of files) fs.copyFileSync(SAMPLE, path.join(chars, f));
  return root;
}

afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('named character sheets', () => {
  it('loads char_N first, then named sheets by name, and reports their indexes', async () => {
    const dir = externalDir(['zeta.png', 'char_7.png', 'alfa-1.png', 'Mayus.png', 'notes.txt']);
    const loaded = await loadExternalCharacterSprites(dir);
    expect(loaded?.characters).toHaveLength(3);
    // char_7 is index 0; named sheets follow, sorted; names with capitals are not sheets
    expect(loaded?.names).toEqual({ 'alfa-1': 1, zeta: 2 });
  });

  it('a dir with only numbered sheets has no names (as before)', async () => {
    const loaded = await loadExternalCharacterSprites(externalDir(['char_0.png']));
    expect(loaded?.characters).toHaveLength(1);
    expect(loaded?.names).toBeUndefined();
  });

  it('merging shifts the second set of names past the first set of sheets; the first name wins', () => {
    const sheet = { down: [], up: [], right: [] } as never;
    const a = { characters: [sheet, sheet], names: { jefe: 1 } };
    const b = { characters: [sheet, sheet, sheet], names: { jefe: 0, becario: 2 } };
    expect(mergeCharacterSprites(a, b).names).toEqual({ jefe: 1, becario: 4 });
    expect(mergeCharacterSprites({ characters: [sheet] }, { characters: [sheet] }).names).toBe(
      undefined,
    );
  });
});
