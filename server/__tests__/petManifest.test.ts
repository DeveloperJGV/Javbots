import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadExternalPetSprites } from '../src/assetLoader.js';

// eslint-disable-next-line pixel-agents/no-inline-colors -- manifest data, not a UI color
const BLUE = '#9fd0ff';

/** 96×96 = the 3×3 grid of 32 px pet frames; blank pixels are enough here. */
function blankPetPng(): Buffer {
  return PNG.sync.write(new PNG({ width: 96, height: 96 }));
}

function writePet(root: string, dir: string, manifest: object): void {
  const petDir = path.join(root, 'assets', 'pets', dir);
  fs.mkdirSync(petDir, { recursive: true });
  fs.writeFileSync(path.join(petDir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(petDir, 'pet.png'), blankPetPng());
}

describe('pet manifest lightColor', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-pets-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('keeps a #rrggbb lightColor and drops a malformed one without skipping the pet', async () => {
    writePet(root, 'a', { id: 'a', name: 'A', lightColor: BLUE });
    writePet(root, 'b', { id: 'b', name: 'B', lightColor: 'blue' });
    writePet(root, 'c', { id: 'c', name: 'C' });

    const loaded = await loadExternalPetSprites(root);

    expect(loaded?.manifests).toEqual([
      { id: 'a', name: 'A', lightColor: BLUE },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]);
  });
});
