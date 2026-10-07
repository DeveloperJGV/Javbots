import assert from 'node:assert/strict';

import { test } from 'vitest';

import { CAPTURE_PAD_TILES, CAPTURE_TOP_PAD_TILES } from '../src/constants.js';
import { captureFileName, captureFrame } from '../src/office/captureFrame.js';
import { mapOffset } from '../src/office/projection.js';
import { TILE_SIZE } from '../src/office/types.js';

test('the capture frames the whole map, with room for the walls above row 0', () => {
  const zoom = 4;
  const tile = TILE_SIZE * zoom;
  const f = captureFrame(44, 30, zoom);
  assert.equal(f.width, (44 + 2 * CAPTURE_PAD_TILES) * tile);
  assert.equal(f.height, (30 + CAPTURE_TOP_PAD_TILES + CAPTURE_PAD_TILES) * tile);
  // Where renderFrame will put the map's top-left corner
  const { offsetX, offsetY } = mapOffset(f.width, f.height, 44, 30, zoom, f.panX, f.panY);
  assert.equal(offsetX, CAPTURE_PAD_TILES * tile);
  assert.equal(offsetY, CAPTURE_TOP_PAD_TILES * tile);
});

test('capture file name carries the local date and time', () => {
  assert.equal(
    captureFileName(new Date(2026, 9, 6, 15, 30, 12)),
    'pixel-agents-2026-10-06-153012.png',
  );
});
