import assert from 'node:assert/strict';

import { test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import {
  BUBBLE_ATTENTION_SPRITES,
  BUBBLE_PERMISSION_SPRITE,
} from '../src/office/sprites/spriteData.js';
import type { OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

// Agent attention bubbles (docs/atencion-agentes.md): waiting on you, stuck and failed.

function floorLayout(cols = 9, rows = 7): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
  };
}

test('three distinct bubbles, framed like the permission one (11x13)', () => {
  const sprites = Object.values(BUBBLE_ATTENTION_SPRITES);
  assert.equal(sprites.length, 3);
  for (const s of sprites) {
    assert.equal(s.length, BUBBLE_PERMISSION_SPRITE.length);
    assert.equal(s[0].length, BUBBLE_PERMISSION_SPRITE[0].length);
  }
  const keys = new Set([BUBBLE_PERMISSION_SPRITE, ...sprites].map((s) => JSON.stringify(s)));
  assert.equal(keys.size, 4, 'each bubble looks different from the others and from permission');
});

test('setAgentAttention reports entering a state once, and clears with null', () => {
  const os = new OfficeState(floorLayout());
  os.addAgent(1);
  const stuck = { estado: 'atorado' as const, motivo: 'sin-eventos', desde: 1 };
  assert.equal(os.setAgentAttention(1, stuck), true);
  assert.equal(os.setAgentAttention(1, { ...stuck, desde: 2 }), false, 'same state: no new chime');
  assert.equal(os.characters.get(1)?.attention?.estado, 'atorado');
  assert.equal(
    os.setAgentAttention(1, { estado: 'fallo', motivo: 'limite-de-uso', desde: 3 }),
    true,
  );
  assert.equal(os.setAgentAttention(1, null), false);
  assert.equal(os.characters.get(1)?.attention, null);
  assert.equal(os.setAgentAttention(99, stuck), false, 'unknown agent');
});
