import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  AREA_DEFAULT_COLORS,
  CLONE_SPAWN_SEC,
  FIRE_TRAIL_LENGTH_PX,
  FLUX_SPARK_COLORS,
  FLUX_SPARK_COUNT,
  PETRIFY_SEC,
  STONE_COLORS,
  STONE_CRACK_COLOR,
  ZONE_MIN_STAY_SEC,
  ZONE_SWITCH_DELAY_SEC,
} from '../src/constants.js';
import { setParticlesEnabled } from '../src/office/effects/effectsSettings.js';
import { ParticleSystem } from '../src/office/effects/particles.js';
import { advanceMatrixEffect, effectDurationSec } from '../src/office/engine/matrixEffectState.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { stonePixel } from '../src/office/engine/stone.js';
import type { OfficeLayout } from '../src/office/types.js';
import { MATRIX_EFFECT_DURATION, TileType } from '../src/office/types.js';

test('interns use the slower clone / petrify effects; agents keep the matrix rain', () => {
  const os = new OfficeState({
    version: 1,
    cols: 6,
    rows: 4,
    tiles: new Array<TileType>(24).fill(TileType.FLOOR_1),
    furniture: [],
  });
  os.addAgent(1, 0, 0);
  const agent = os.characters.get(1)!;
  assert.equal(effectDurationSec(agent), MATRIX_EFFECT_DURATION);

  const sub = os.characters.get(os.addSubagent(1, 'toolu_1'))!;
  assert.equal(sub.matrixEffect, 'spawn');
  assert.equal(effectDurationSec(sub), CLONE_SPAWN_SEC);
  assert.equal(advanceMatrixEffect(sub, MATRIX_EFFECT_DURATION + 0.01), 'running');
  assert.equal(advanceMatrixEffect(sub, CLONE_SPAWN_SEC), 'spawned');

  os.removeSubagent(1, 'toolu_1');
  assert.equal(sub.matrixEffect, 'despawn');
  assert.equal(effectDurationSec(sub), PETRIFY_SEC);
  assert.equal(advanceMatrixEffect(sub, PETRIFY_SEC - 0.1), 'running');
  assert.equal(advanceMatrixEffect(sub, 0.2), 'despawned');
});

test('stone keeps the shape: dark pixels stay dark, light ones light', () => {
  const crack = (c: string) => c === STONE_CRACK_COLOR;
  let dark = 0;
  let light = 0;
  for (let i = 0; i < 40; i++) {
    const d = stonePixel(STONE_CRACK_COLOR, i, 3);
    const l = stonePixel(FLUX_SPARK_COLORS[0], i, 3);
    if (!crack(d)) dark += d === STONE_COLORS[0] ? 1 : 0;
    if (!crack(l)) light += l === STONE_COLORS[STONE_COLORS.length - 1] ? 1 : 0;
  }
  assert.ok(dark > 30 && light > 30);
});

test('88 mph: flux sparks plus two fire trails', () => {
  const ps = new ParticleSystem(() => 0.5);
  ps.burst88mph(50, 50);
  assert.equal(ps.particles.length, FLUX_SPARK_COUNT + FIRE_TRAIL_LENGTH_PX * 2);
  assert.ok(
    ps.particles.every((p) => p.kind === 'spark'),
    'glows over the night tint',
  );
});

test('a command finishing in the DeLorean workshop hits 88 mph, elsewhere not', () => {
  setParticlesEnabled(true);
  const cols = 10;
  const layout: OfficeLayout = {
    version: 1,
    cols,
    rows: 3,
    tiles: new Array<TileType>(cols * 3).fill(TileType.FLOOR_1),
    furniture: [],
    areas: [{ label: 'taller', color: AREA_DEFAULT_COLORS[0], zoneKind: 'commands' }],
    areaTiles: Array.from({ length: cols * 3 }, (_, i) => (i % cols >= 7 ? 'taller' : null)),
  };
  const os = new OfficeState(layout);
  os.addAgent(1, 0, 0, undefined, true);
  os.setAgentActivity(1, 'Running: make');
  os.setAgentActive(1, true);
  os.onToolDone(1);
  assert.equal(os.particles.particles.length, 0, 'not in the workshop yet');
  for (let t = 0; t < ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 6; t += 0.1) os.update(0.1);
  os.particles.particles.length = 0;
  os.onToolDone(1);
  assert.ok(os.particles.particles.length >= FLUX_SPARK_COUNT);
});
