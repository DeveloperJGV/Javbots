import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  ISAAC_AFRO_ROWS,
  ISAAC_AFRO_SIDE,
  ISAAC_CLICK_RESET_SEC,
  ISAAC_CLICKS_TO_DANCE,
  ISAAC_DANCE_SEC,
  ISAAC_DANCE_STEP_SEC,
  ISAAC_GLASSES_COLOR,
  ISAAC_GLASSES_LENSES,
  ISAAC_GLASSES_ROWS,
} from '../src/constants.js';
import {
  createIsaacDance,
  isaacDanceFrame,
  isaacDancePose,
  isaacDanceSprite,
  isIsaacDancing,
  pokeIsaac,
} from '../src/office/isaac/isaacDance.js';
import type { SpriteData } from '../src/office/types.js';

// Easter egg: eleven clicks on Isaac and he dances with a pink afro.

function clicks(n: number, state = createIsaacDance(), from = 0, gap = 0.3) {
  let last: ReturnType<typeof pokeIsaac> = 'count';
  for (let i = 0; i < n; i++) last = pokeIsaac(state, from + i * gap);
  return { state, last };
}

test('ten quick clicks only count; the eleventh starts the dance', () => {
  const { state, last } = clicks(ISAAC_CLICKS_TO_DANCE - 1);
  assert.equal(last, 'count');
  assert.equal(isIsaacDancing(state, 3), false);
  const now = (ISAAC_CLICKS_TO_DANCE - 1) * 0.3;
  assert.equal(pokeIsaac(state, now), 'dance');
  assert.equal(isIsaacDancing(state, now), true);
  assert.equal(isIsaacDancing(state, now + ISAAC_DANCE_SEC + 0.01), false);
});

test('a long pause between clicks starts the count over', () => {
  const { state } = clicks(ISAAC_CLICKS_TO_DANCE - 1);
  const later = 100;
  assert.equal(pokeIsaac(state, later), 'count');
  assert.equal(state.clicks, 1);
  // Right under the reset window keeps counting
  assert.equal(pokeIsaac(state, later + ISAAC_CLICK_RESET_SEC - 0.1), 'count');
  assert.equal(state.clicks, 2);
});

test('clicks while dancing are ignored and do not extend the dance', () => {
  const { state } = clicks(ISAAC_CLICKS_TO_DANCE);
  const started = state.danceStartedAt as number;
  assert.equal(pokeIsaac(state, started + 1), 'dancing');
  assert.equal(state.danceStartedAt, started);
  assert.equal(state.clicks, 0);
});

test('the step counter advances with the clock and is null when he is just crying', () => {
  const state = createIsaacDance();
  assert.equal(isaacDanceFrame(state, 5), null);
  clicks(ISAAC_CLICKS_TO_DANCE, state);
  const t0 = state.danceStartedAt as number;
  assert.equal(isaacDanceFrame(state, t0), 0);
  assert.equal(isaacDanceFrame(state, t0 + ISAAC_DANCE_STEP_SEC * 3.5), 3);
  assert.equal(isaacDanceFrame(state, t0 + ISAAC_DANCE_SEC), null);
});

test('the pose hops on odd steps and turns every four', () => {
  assert.deepEqual(isaacDancePose(0), { dy: 0, mirrored: false });
  assert.deepEqual(isaacDancePose(1), { dy: -1, mirrored: false });
  assert.deepEqual(isaacDancePose(2), { dy: 0, mirrored: true });
  assert.deepEqual(isaacDancePose(3), { dy: -1, mirrored: true });
  assert.deepEqual(isaacDancePose(4), { dy: 0, mirrored: false });
});

const SKIN = 'skin'; // any non-empty cell counts as painted

function cryingIsaac(): SpriteData {
  // A 16x16 blob roughly shaped like the sprite: a round head with a body below.
  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const dx = x - 7.5;
      const dy = y - 6;
      return (dx * dx) / 50 + (dy * dy) / 40 <= 1 || (y >= 10 && Math.abs(dx) <= 5) ? SKIN : '';
    }),
  );
}

test('the dancing sprite grows the afro rows on top and keeps the base below', () => {
  const base = cryingIsaac();
  const sprite = isaacDanceSprite(base, 0);
  assert.equal(sprite.length, base.length + ISAAC_AFRO_ROWS);
  assert.equal(sprite[0].length, base[0].length + 2 * ISAAC_AFRO_SIDE);
  // Something pink is painted in the new rows
  assert.ok(sprite.slice(0, ISAAC_AFRO_ROWS).some((row) => row.some((px) => px !== '')));
  // The body is untouched (shifted right by the side padding)
  const pad = Array.from({ length: ISAAC_AFRO_SIDE }, () => '');
  assert.deepEqual(sprite[ISAAC_AFRO_ROWS + 12], [...pad, ...base[12], ...pad]);
  // Glasses sit over the eyes
  const [y0] = ISAAC_GLASSES_ROWS;
  for (const [x0, x1] of ISAAC_GLASSES_LENSES) {
    assert.equal(sprite[ISAAC_AFRO_ROWS + y0 + 1][ISAAC_AFRO_SIDE + x1], ISAAC_GLASSES_COLOR);
    assert.equal(sprite[ISAAC_AFRO_ROWS + y0 + 1][ISAAC_AFRO_SIDE + x0], ISAAC_GLASSES_COLOR);
  }
  // Same step pattern → same cached object; the afro sways on the other half of the cycle
  assert.equal(isaacDanceSprite(base, 1), sprite);
  assert.notEqual(isaacDanceSprite(base, 2), sprite);
  assert.deepEqual(base, cryingIsaac(), 'the base sprite is not mutated');
});
