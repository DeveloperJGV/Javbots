import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  BREATH_PERIOD_SEC,
  FIRE_FLICKER_PERIOD_SEC,
  FIRE_FLICKER_SWAPS,
  FLUX_CORE,
  FLUX_DIM_CORE,
  FLUX_PULSE_PERIOD_SEC,
  NIGHT_TINT_ALPHA,
  RING_GLINT,
  RING_GLINT_PERIOD_SEC,
  RING_GOLD,
  SHADOW_CORE_COLOR,
  SHADOW_EDGE_COLOR,
  SPARK_COUNT,
  STANDBY_LED_COLOR,
  WINDOW_CLOUD,
  WINDOW_MOON,
  WINDOW_NIGHT_UPPER,
  WINDOW_SKY_UPPER,
  WINDOW_STAR,
} from '../src/constants.js';
import {
  applyAmbientAnimation,
  clockSprite,
  cycleSprite,
  cycleStep,
  getAmbientSpec,
  handPixels,
  pulseSwapped,
  skyPhase,
  swayOffset,
  swaySprite,
  windowSprite,
} from '../src/office/effects/ambientFurniture.js';
import { ambientFor, ambientForHour } from '../src/office/effects/dayNight.js';
import { nextDayNightMode } from '../src/office/effects/effectsSettings.js';
import { inhaleSprite, isInhaling, pickLookDirection } from '../src/office/effects/idleMotion.js';
import {
  collectLights,
  computeLightmap,
  lightStrengthAt,
  moonlightFor,
  quantizeLight,
} from '../src/office/effects/lighting.js';
import { ParticleSystem, steppedAlpha } from '../src/office/effects/particles.js';
import { ellipseShadowSprite, furnitureShadowFor } from '../src/office/effects/shadows.js';
import type { FurnitureInstance, SpriteData } from '../src/office/types.js';
import { Direction } from '../src/office/types.js';

// Pure sprite logic only compares pixel strings, so any token stands in for a color.
const X = 'X';

/** Build a sprite from rows of '.' (clear) and '#' (X). */
function sprite(rows: string[], color = X): SpriteData {
  return rows.map((r) => [...r].map((c) => (c === '#' ? color : '')));
}

function mask(s: SpriteData): string[] {
  return s.map((r) => r.map((px) => (px ? '#' : '.')).join(''));
}

describe('shadows', () => {
  test('character shadow is a 3-row ellipse with a soft rim', () => {
    const s = ellipseShadowSprite(10);
    assert.deepEqual(mask(s), ['..######..', '##########', '..######..']);
    assert.equal(s[1][0], SHADOW_EDGE_COLOR);
    assert.equal(s[1][5], SHADOW_CORE_COLOR);
  });

  test('furniture shadow spans the base and shifts one pixel right', () => {
    const base = sprite(['......', '.####.', '.#..#.']);
    const shadow = furnitureShadowFor(base);
    assert.ok(shadow);
    // Base covers x 1..4 → shadow starts at x 1, one column wider on the right
    assert.equal(shadow.dx, 1);
    assert.equal(shadow.dy, 2);
    assert.deepEqual(mask(shadow.sprite), ['.####', '.####', '.###.']);
  });

  test('mirrored furniture mirrors the base extents', () => {
    const base = sprite(['##....']);
    assert.equal(furnitureShadowFor(base, true)?.dx, 4);
    assert.equal(furnitureShadowFor(base, false)?.dx, 0);
  });

  test('a fully transparent sprite casts nothing', () => {
    assert.equal(furnitureShadowFor(sprite(['...', '...'])), null);
  });
});

describe('idle motion', () => {
  test('breathing alternates inhale and exhale over one period', () => {
    assert.equal(isInhaling(0.1), true);
    assert.equal(isInhaling(BREATH_PERIOD_SEC * 0.9), false);
    assert.equal(isInhaling(BREATH_PERIOD_SEC + 0.1), true);
  });

  test('inhale lifts the torso one pixel and keeps the legs planted', () => {
    // 10 rows: head at row 2, feet at row 9
    const rows = ['....', '....', '.H..', '.##.', '.##.', '.##.', '.##.', '.LL.', '.LL.', '.LL.'];
    const s = rows.map((r) => [...r].map((c) => (c === '.' ? '' : c)));
    const out = inhaleSprite(s);
    assert.equal(out[1][1], 'H', 'head moved up a row');
    assert.deepEqual(out.slice(7), s.slice(7), 'legs unchanged');
    assert.equal(out.length, s.length);
  });

  test('a sprite touching the top edge is left alone', () => {
    const s = sprite(['#', '#']);
    assert.equal(inhaleSprite(s), s);
  });

  test('glancing picks a different direction', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      assert.notEqual(
        pickLookDirection(Direction.LEFT, () => r),
        Direction.LEFT,
      );
      assert.notEqual(
        pickLookDirection(Direction.DOWN, () => r),
        Direction.DOWN,
      );
    }
  });
});

describe('ambient furniture', () => {
  test('hand pixels step outward from the pivot', () => {
    assert.deepEqual(handPixels(5, 5, 0, 2), [
      [5, 4],
      [5, 3],
    ]);
    assert.deepEqual(handPixels(5, 5, Math.PI / 2, 2), [
      [6, 5],
      [7, 5],
    ]);
  });

  test('the clock shows 3:00 with the old hands erased', () => {
    const F = 'face';
    const H = 'hand';
    const face: SpriteData = Array.from({ length: 9 }, () => new Array<string>(9).fill(F));
    face[1][4] = H; // painted hand pointing up, to be erased
    const spec = {
      kind: 'clock' as const,
      cx: 4,
      cy: 4,
      face: [0, 0] as [number, number],
      hand: [4, 1] as [number, number],
      minuteLen: 3,
      hourLen: 2,
    };
    const out = clockSprite(face, spec, 3, 0);
    assert.equal(out[1][4], H, 'minute hand at 12');
    assert.equal(out[4][6], H, 'hour hand at 3');
    assert.equal(out[2][4], H);
    assert.equal(out[4][2], F, 'nothing pointing left');
    assert.equal(face[4][6], F, 'source sprite untouched');
  });

  test('plants sway 0 → +1 → 0 → −1', () => {
    const offsets = [0, 1, 2, 3].map((i) => swayOffset(i * 0.8 + 0.01, 0));
    assert.deepEqual(offsets, [0, 1, 0, -1]);
  });

  test('sway moves the foliage and leaves the pot', () => {
    const plant = sprite(['.#..', '.#..', '.#..', '.#..', '.#..', '.#..']);
    const out = swaySprite(plant, 1, false);
    assert.equal(out[0][2], X, 'top shifted right');
    assert.equal(out[5][1], X, 'pot stays');
    const hanging = swaySprite(plant, 1, true);
    assert.equal(hanging[0][1], X, 'hook stays');
    assert.equal(hanging[5][2], X, 'bottom sways');
  });

  test('applyAmbientAnimation only touches known furniture', () => {
    const pc = sprite(Array.from({ length: 16 }, () => '################'));
    const desk = sprite(['##']);
    const instances: FurnitureInstance[] = [
      { sprite: pc, x: 0, y: 0, zY: 16, type: 'PC_FRONT_OFF' },
      { sprite: desk, x: 0, y: 0, zY: 1, type: 'DESK_FRONT' },
    ];
    const out = applyAmbientAnimation(instances, 0.1, new Date(2026, 0, 1, 12, 0));
    assert.equal(out[0].sprite[12][12], STANDBY_LED_COLOR, 'LED on early in its cycle');
    assert.equal(out[1], instances[1]);
  });
});

describe('day and night', () => {
  test('noon is clear daylight, midnight is full night', () => {
    assert.equal(ambientForHour(12).alpha, 0);
    assert.equal(ambientForHour(12).lights, 0);
    assert.equal(ambientForHour(0).alpha, NIGHT_TINT_ALPHA);
    assert.equal(ambientForHour(23).lights, 1);
  });

  test('evening ramps from day toward night', () => {
    const dusk = ambientForHour(18.75).alpha;
    assert.ok(dusk > 0 && dusk < NIGHT_TINT_ALPHA);
    assert.ok(ambientForHour(19.5).alpha > dusk);
  });

  test('the toolbar modes override the clock', () => {
    const midnight = new Date(2026, 0, 1, 0, 0);
    assert.equal(ambientFor('day', midnight).alpha, 0);
    assert.equal(ambientFor('night', new Date(2026, 0, 1, 12, 0)).alpha, NIGHT_TINT_ALPHA);
    assert.equal(nextDayNightMode('auto'), 'day');
    assert.equal(nextDayNightMode('day'), 'night');
    assert.equal(nextDayNightMode('night'), 'auto');
  });

  test('light quantizes to bands', () => {
    assert.equal(quantizeLight(0, 0, 0), 0);
    assert.equal(quantizeLight(1, 3, 3), 1);
    assert.equal(quantizeLight(0.5, 1, 1), 0.5);
  });

  test('a lamp lifts the darkness around it and void stays clear', () => {
    const night = ambientFor('night', new Date());
    const lamp = {
      x: 8,
      y: 8,
      radius: 8,
      intensity: 1,
      color: [255, 200, 100] as [number, number, number],
    };
    const data = computeLightmap(32, 16, 0, night, [lamp], (x) => x >= 24);
    const alphaAt = (x: number, y: number) => data[(y * 32 + x) * 4 + 3];
    assert.ok(alphaAt(8, 8) < alphaAt(20, 8), 'lit center is less dark than the far side');
    assert.equal(alphaAt(28, 8), 0, 'void untouched');
  });
});

describe('particles', () => {
  const coffee: FurnitureInstance = {
    sprite: sprite(['################']),
    x: 32,
    y: 48,
    zY: 49,
    type: 'COFFEE',
  };

  test('coffee mugs steam', () => {
    const ps = new ParticleSystem(() => 0.5);
    for (let i = 0; i < 20; i++) ps.update(0.1, [coffee], true);
    const steam = ps.particles.filter((p) => p.kind === 'steam');
    assert.ok(steam.length > 0);
    assert.ok(
      steam.every((p) => p.y < 48),
      'rises above the mug',
    );
  });

  test('nothing ambient spawns while particles are off', () => {
    const ps = new ParticleSystem(() => 0.5);
    for (let i = 0; i < 50; i++) ps.update(0.1, [coffee], false);
    assert.equal(ps.particles.length, 0);
  });

  test('sparks burst and burn out', () => {
    const ps = new ParticleSystem(() => 0.5);
    ps.burstSparks(10, 10);
    assert.equal(ps.particles.length, SPARK_COUNT);
    for (let i = 0; i < 20; i++) ps.update(0.1, [], false);
    assert.equal(ps.particles.length, 0);
  });

  test('fades in steps', () => {
    assert.equal(steppedAlpha(0, 3), 1);
    assert.equal(steppedAlpha(1.5, 3), 0.66);
    assert.equal(steppedAlpha(2.9, 3), 0.33);
  });
});

describe('pulsing furniture', () => {
  test('the flux capacitor Y pulses between bright and dim', () => {
    const sprite: SpriteData = [[FLUX_CORE.toUpperCase(), STANDBY_LED_COLOR]];
    const inst = { type: 'FLUX_CAPACITOR', sprite, x: 0, y: 0, zY: 0 } as FurnitureInstance;
    const [bright] = applyAmbientAnimation([inst], FLUX_PULSE_PERIOD_SEC * 0.9, new Date());
    assert.equal(bright.sprite, sprite, 'bright is the art as drawn');
    const [dim] = applyAmbientAnimation([inst], 0, new Date());
    assert.equal(dim.sprite[0][0], FLUX_DIM_CORE);
    assert.equal(dim.sprite[0][1], STANDBY_LED_COLOR, 'other pixels stay');
  });

  test('basement flames flicker', () => {
    const [from, to] = FIRE_FLICKER_SWAPS[0];
    const sprite: SpriteData = [[from.toUpperCase()]];
    const inst = { type: 'BASEMENT_FIRE', sprite, x: 0, y: 0, zY: 0 } as FurnitureInstance;
    assert.equal(applyAmbientAnimation([inst], 0, new Date())[0].sprite[0][0], to);
    assert.equal(applyAmbientAnimation([inst], FIRE_FLICKER_PERIOD_SEC * 0.9, new Date())[0].sprite, sprite);
  });

  test('the ring glints for a moment, then stays plain gold', () => {
    const spec = getAmbientSpec('RING_PEDESTAL');
    assert.ok(spec?.kind === 'pulse');
    assert.ok(pulseSwapped(0, spec));
    assert.ok(!pulseSwapped(RING_GLINT_PERIOD_SEC * 0.5, spec));
    const sprite: SpriteData = [[RING_GOLD.toUpperCase()]];
    const inst = { type: 'RING_PEDESTAL', sprite, x: 0, y: 0, zY: 0 } as FurnitureInstance;
    assert.equal(applyAmbientAnimation([inst], 0, new Date())[0].sprite[0][0], RING_GLINT);
    assert.equal(applyAmbientAnimation([inst], RING_GLINT_PERIOD_SEC * 0.5, new Date())[0].sprite, sprite);
  });
});

describe('night lights', () => {
  const night = ambientFor('night', new Date());
  const day = ambientFor('day', new Date());

  test('windows show the sky of the moment', () => {
    // Loaded sprites carry upper-case hex
    const U = WINDOW_SKY_UPPER.toUpperCase();
    const glass: SpriteData = Array.from({ length: 20 }, () => new Array<string>(16).fill(U));
    glass[13][5] = WINDOW_CLOUD.toUpperCase();
    const spec = {
      kind: 'window' as const,
      splitY: 19,
      stars: [[10, 13]] as Array<[number, number]>,
    };
    assert.equal(skyPhase(day), 'day');
    assert.equal(skyPhase(night), 'night');
    assert.equal(windowSprite(glass, spec, 'day'), glass);
    const out = windowSprite(glass, spec, 'night');
    assert.equal(out[0][0], WINDOW_NIGHT_UPPER);
    assert.equal(out[13][5], WINDOW_MOON, 'cloud in the upper pane becomes the moon');
    assert.equal(out[13][10], WINDOW_STAR);
  });

  test('moonlight falls as a slanted beam below the window', () => {
    const beam = {
      x: 8,
      y: 0,
      radius: 40,
      intensity: 1,
      color: [200, 200, 255] as [number, number, number],
      beam: { length: 40, halfTop: 4, halfBottom: 8, skew: 0.5 },
    };
    assert.equal(lightStrengthAt(beam, 8, -1), 0, 'nothing above the wall');
    assert.ok(lightStrengthAt(beam, 8, 1) > 0.9);
    // 20 px down the beam has drifted 10 px sideways
    assert.ok(lightStrengthAt(beam, 18, 20) > 0);
    assert.equal(lightStrengthAt(beam, 8, 20), 0);
    assert.equal(lightStrengthAt(beam, 8, 41), 0);
  });

  test('every screen, lamp and window gives light; moonlight only at night', () => {
    const tall = sprite(Array.from({ length: 32 }, () => '################'));
    const furniture: FurnitureInstance[] = [
      { sprite: tall, x: 0, y: 0, zY: 32, type: 'PC_FRONT_OFF' },
      { sprite: tall, x: 32, y: 0, zY: 32, type: 'PC_SIDE:left' },
      { sprite: tall, x: 64, y: 0, zY: 32, type: 'LAMP' },
      { sprite: tall, x: 96, y: 0, zY: 32, type: 'WINDOW' },
      { sprite: tall, x: 128, y: 0, zY: 32, type: 'DESK_FRONT' },
    ];
    assert.equal(collectLights([], furniture, moonlightFor(night)).length, 4);
    const dusk = ambientForHour(18.75);
    assert.equal(moonlightFor(dusk), 0);
    assert.equal(collectLights([], furniture, moonlightFor(dusk)).length, 3);
  });
});

describe('portal swirl (color cycle)', () => {
  test('each step moves every band color one place along the ring', () => {
    const spec = getAmbientSpec('PORTAL_BLUE');
    assert.ok(spec && spec.kind === 'cycle');
    const [a, b, c, d] = spec.colors;
    const sprite = [[a, b, c, d, '']];
    assert.deepEqual(cycleSprite(sprite, spec, 1), [[b, c, d, a, '']]);
    assert.equal(cycleStep(0, spec), 0);
    assert.equal(cycleStep(spec.stepSec * 5, spec), 1);
  });
});
