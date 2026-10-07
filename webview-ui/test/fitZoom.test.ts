import assert from 'node:assert/strict';

import { test } from 'vitest';

import { fitView } from '../src/office/projection.js';

// 44×30 tiles of 16 px = 704 sprite px wide, (30 + 1 wall tile) × 16 = 496 tall.
test('draws at the whole zoom above the exact fit and shrinks to it', () => {
  // 1288 / 704 = 1.83 wide, 800 / 496 = 1.61 tall -> exact 1.61: draw at 2, shrink by 2 / 1.61
  const fit = fitView(1288, 800, 44, 30, 1, 1, 10);
  assert.equal(fit.zoom, 2);
  assert.ok(Math.abs(fit.scale - 2 / (800 / 496)) < 1e-9);
});

test('an exact whole fit is not shrunk', () => {
  assert.deepEqual(fitView(704 * 3, 496 * 3, 44, 30, 1, 1, 10), { zoom: 3, scale: 1 });
  assert.deepEqual(fitView(704 * 3 - 10, 496 * 3, 44, 30, 1, 1, 10), { zoom: 3, scale: 1 });
});

test('huge screens cap at max; tiny ones shrink below 1x', () => {
  assert.deepEqual(fitView(50_000, 50_000, 44, 30, 1, 1, 10), { zoom: 10, scale: 1 });
  const tiny = fitView(352, 248, 44, 30, 1, 1, 10); // exact 0.5
  assert.equal(tiny.zoom, 1);
  assert.equal(tiny.scale, 2);
});
