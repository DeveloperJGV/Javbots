import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  AREA_DEFAULT_COLORS,
  BOSS_INTERNS,
  FIRE_TRAIL_LENGTH_PX,
  FLUX_SPARK_COUNT,
  INTERN_FADE_SEC,
  INTERN_LEAVE_MAX_SEC,
  TELEPORT_BEAM_COUNT,
  TELEPORT_BEAM_DURATION_SEC,
  TELEPORT_BEAM_HALF_WIDTH_PX,
  TELEPORT_BEAM_HOLD_FRACTION,
  WILDCARD_INTERNS,
  ZONE_MIN_STAY_SEC,
  ZONE_SWITCH_DELAY_SEC,
} from '../src/constants.js';
import { setParticlesEnabled } from '../src/office/effects/effectsSettings.js';
import { collectBeamLights } from '../src/office/effects/lighting.js';
import { beamStrength, ParticleSystem } from '../src/office/effects/particles.js';
import { advanceMatrixEffect, effectDurationSec } from '../src/office/engine/matrixEffectState.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { OfficeLayout } from '../src/office/types.js';
import { MATRIX_EFFECT_DURATION, TileType } from '../src/office/types.js';

function internOffice(): OfficeState {
  return new OfficeState({
    version: 1,
    cols: 12,
    rows: 4,
    tiles: new Array<TileType>(48).fill(TileType.FLOOR_1),
    furniture: [],
  });
}

test('interns fade in and out; agents keep the matrix rain', () => {
  const os = internOffice();
  os.addAgent(1, 0, 0);
  const agent = os.characters.get(1)!;
  assert.equal(effectDurationSec(agent), MATRIX_EFFECT_DURATION);

  const sub = os.characters.get(os.addSubagent(1, 'toolu_1'))!;
  assert.equal(sub.matrixEffect, 'spawn');
  assert.equal(effectDurationSec(sub), INTERN_FADE_SEC);
  assert.equal(advanceMatrixEffect(sub, INTERN_FADE_SEC - 0.1), 'running');
  assert.equal(advanceMatrixEffect(sub, 0.2), 'spawned');
});

test("a boss sends its own interns, one per task, with the boss's hue shift", () => {
  const os = internOffice();
  os.addAgent(1, 1, 90); // Senku: Chrome and Kohaku
  // With only the 6 bosses loaded, a boss sends a copy of itself (the pre-Fase 4B behavior,
  // kept for external characters without interns)
  setCharacterTemplates(new Array(6).fill(null).map(() => ({ down: [], up: [], right: [] })));
  assert.equal(os.characters.get(os.addSubagent(1, 'toolu_0'))!.palette, 1);

  setCharacterTemplates(new Array(15).fill(null).map(() => ({ down: [], up: [], right: [] })));
  const a = os.characters.get(os.addSubagent(1, 'toolu_a'))!;
  const b = os.characters.get(os.addSubagent(1, 'toolu_b'))!;
  assert.deepEqual([a.palette, b.palette], [...BOSS_INTERNS[1]]);
  assert.equal(b.hueShift, 90);
  // Both out: the next one repeats an intern instead of failing
  assert.ok(BOSS_INTERNS[1].includes(os.characters.get(os.addSubagent(1, 'toolu_c'))!.palette));
});

test('with all its own interns out, a boss sends a free wildcard in its own colors', () => {
  const os = internOffice();
  setCharacterTemplates(new Array(21).fill(null).map(() => ({ down: [], up: [], right: [] })));
  os.addAgent(1, 0, 120); // Doc: only Marty
  os.addAgent(2, 3, 0); // Neo: only Trinity
  assert.equal(os.characters.get(os.addSubagent(1, 'toolu_a'))!.palette, BOSS_INTERNS[0][0]);

  // Marty is out: wildcards next, never the same one twice at once (also across bosses)
  const seen = new Set<number>();
  for (let i = 0; i < WILDCARD_INTERNS.length; i++) {
    const owner = i % 2 === 0 ? 1 : 2;
    if (owner === 2 && i === 1) os.addSubagent(2, 'toolu_trinity'); // Neo's own intern goes first
    const sub = os.characters.get(os.addSubagent(owner, `toolu_w${i}`))!;
    assert.ok(WILDCARD_INTERNS.includes(sub.palette), `got ${sub.palette}`);
    assert.equal(sub.hueShift, 0, "wildcards don't take the boss's hue shift");
    seen.add(sub.palette);
  }
  assert.equal(seen.size, WILDCARD_INTERNS.length);

  // Every wildcard out: Doc repeats Marty, with his hue shift
  const again = os.characters.get(os.addSubagent(1, 'toolu_z'))!;
  assert.equal(again.palette, BOSS_INTERNS[0][0]);
  assert.equal(again.hueShift, 120);

  // A wildcard that is done (walking back) is free again
  os.removeSubagent(1, 'toolu_w0');
  const back = os.characters.get(os.addSubagent(1, 'toolu_y'))!;
  assert.ok(WILDCARD_INTERNS.includes(back.palette));
});

test('a finished intern walks back to its boss, then fades out', () => {
  const os = internOffice();
  os.addAgent(1, 0, 0);
  const boss = os.characters.get(1)!;
  const subId = os.addSubagent(1, 'toolu_1');
  const sub = os.characters.get(subId)!;
  advanceMatrixEffect(sub, INTERN_FADE_SEC + 0.1);
  // Put the intern across the room so there is a walk back
  sub.tileCol = boss.tileCol >= 6 ? 0 : 11;
  sub.x = sub.tileCol * 16 + 8;

  os.removeSubagent(1, 'toolu_1');
  assert.equal(sub.matrixEffect, null, 'walks first, no fade yet');
  assert.ok(sub.leavingSec !== null && sub.path.length > 0);

  // Walk until it arrives (or the walk times out), then the fade-out starts
  for (let t = 0; t < INTERN_LEAVE_MAX_SEC + 1 && sub.matrixEffect !== 'despawn'; t += 0.05) {
    os.update(0.05);
  }
  assert.equal(sub.matrixEffect, 'despawn');
  for (let t = 0; t <= INTERN_FADE_SEC + 0.1; t += 0.05) os.update(0.05);
  assert.equal(os.characters.has(subId), false);
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

test('teleport beam: a column of rising light inside the capsule', () => {
  const ps = new ParticleSystem(() => 0.9);
  ps.burstTeleport(50, 50);
  assert.equal(ps.particles.length, TELEPORT_BEAM_COUNT);
  for (const p of ps.particles) {
    assert.equal(p.kind, 'spark');
    assert.ok(Math.abs(p.x - 50) <= TELEPORT_BEAM_HALF_WIDTH_PX, 'stays inside the glass');
    assert.ok(p.vy < 0 && p.y <= 50, 'rises from the base');
  }
});

test('teleport beam: a steady column that holds, keeps sparking, then steps out', () => {
  const ps = new ParticleSystem(() => 0.5);
  ps.burstTeleport(50, 50);
  assert.equal(ps.beams.length, 1);
  const dt = 0.05;
  for (let t = 0; t < TELEPORT_BEAM_DURATION_SEC * TELEPORT_BEAM_HOLD_FRACTION - dt; t += dt) {
    ps.update(dt, [], false);
    assert.equal(beamStrength(ps.beams[0].age), 1, 'full strength while it holds');
  }
  assert.ok(ps.particles.length > 0, 'sparks keep rising long after the first burst died out');
  ps.update(TELEPORT_BEAM_DURATION_SEC, [], false);
  assert.equal(ps.beams.length, 0, 'gone once its time is up');
  const fading = [0.8, 0.9, 0.99].map((f) => beamStrength(TELEPORT_BEAM_DURATION_SEC * f));
  assert.ok(
    fading.every((v) => v > 0 && v < 1),
    'fades in steps before it ends',
  );
});

test('teleport beam: a second arrival restarts the column instead of stacking', () => {
  const ps = new ParticleSystem(() => 0.5);
  ps.burstTeleport(50, 50);
  ps.update(1, [], false);
  ps.burstTeleport(50, 50);
  assert.equal(ps.beams.length, 1);
  assert.equal(ps.beams[0].age, 0);
});

test('teleport beam lights the capsule at night while it lasts', () => {
  const ps = new ParticleSystem(() => 0.5);
  ps.burstTeleport(50, 50);
  const [light] = collectBeamLights(ps.beams);
  assert.ok(light && light.intensity > 0 && light.y < 50);
  ps.update(TELEPORT_BEAM_DURATION_SEC + 0.1, [], false);
  assert.equal(collectBeamLights(ps.beams).length, 0);
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
