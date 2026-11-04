import assert from 'node:assert/strict';

import { test } from 'vitest';

import { digitalClockSprite, getAmbientSpec } from '../src/office/effects/ambientFurniture.js';
import type { SpriteData } from '../src/office/types.js';

// Digital wall clocks: the live HH:MM painted over the art's fixed digits.

const BLANK: SpriteData = Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ''));

function read(sprite: SpriteData, x: number, y: number, on: string): string {
  return Array.from({ length: 5 }, (_, dy) =>
    Array.from({ length: 3 }, (_, dx) => (sprite[y + dy][x + dx] === on ? '#' : '.')).join(''),
  ).join('/');
}

test('every clock in the office is digital', () => {
  for (const type of ['MANDO_CLOCK', 'RELOJ_DIGITAL', 'DIRECTORIO_CLOCK', 'POMODORO_TIMER_WALL']) {
    assert.equal(getAmbientSpec(type)?.kind, 'digital', type);
  }
});

test('a stacked clock shows the hours on top and the minutes below, in 24 h', () => {
  const spec = getAmbientSpec('RELOJ_DIGITAL');
  assert.ok(spec && spec.kind === 'digital');
  const out = digitalClockSprite(BLANK, spec, 17, 5, true);
  assert.equal(read(out, 5, 7, spec.on), '.#./##./.#./.#./###', '1');
  assert.equal(read(out, 9, 7, spec.on), '###/..#/..#/..#/..#', '7');
  assert.equal(read(out, 5, 14, spec.on), '###/#.#/#.#/#.#/###', '0');
  assert.equal(read(out, 9, 14, spec.on), '###/#../###/..#/###', '5');
  assert.equal(BLANK[7][5], '', 'the original sprite is untouched');
});

test('the colon blinks on clocks that have one', () => {
  const spec = getAmbientSpec('MANDO_CLOCK');
  assert.ok(spec && spec.kind === 'digital' && spec.colon);
  const [x, y] = spec.colon[0];
  assert.equal(digitalClockSprite(BLANK, spec, 9, 30, true)[y][x], spec.on);
  assert.equal(digitalClockSprite(BLANK, spec, 9, 30, false)[y][x], spec.off);
});
