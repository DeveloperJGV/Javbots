import assert from 'node:assert/strict';

import { test } from 'vitest';

import { sortFloorsTopDown } from '../../core/src/offices.js';
import {
  displayArrow,
  floorCaption,
  floorRows,
  ledText,
  pixelDisc,
} from '../src/components/elevatorParts.js';

// The elevator plate (components/Elevator.tsx): the round buttons' pixel discs, the display's arrow, the caption
// under it and the order of the floor buttons.

test('a pixel disc is symmetric and fills its middle rows edge to edge', () => {
  const d = 14;
  const runs = pixelDisc(d);
  assert.equal(runs.length, d);
  runs.forEach(([x, y, w], i) => {
    assert.equal(y, i);
    assert.equal(x + w + x, d, `row ${y} is centered`);
    const [mx, , mw] = runs[d - 1 - i];
    assert.equal(mx, x, `row ${y} mirrors row ${d - 1 - y}`);
    assert.equal(mw, w);
  });
  assert.deepEqual(runs[d / 2], [0, d / 2, d]);
  assert.ok(runs[0][2] < d / 2, 'the top row is narrow: it reads as round, not square');
});

test('a pixel disc can be offset (ring and shadow layers)', () => {
  assert.deepEqual(
    pixelDisc(4, 2, 3).map(([x, y]) => [x - 2, y - 3]),
    pixelDisc(4).map(([x, y]) => [x, y]),
  );
});

test('the display shows ▲ above the ground floor, ▼ below and nothing on it', () => {
  assert.equal(displayArrow(1), 'up');
  assert.equal(displayArrow(3), 'up');
  assert.equal(displayArrow(-1), 'down');
  assert.equal(displayArrow(0), null);
});

test('the caption says the button and the name', () => {
  assert.equal(floorCaption({ level: 1, label: 'Personal' }), '1 · Personal');
  assert.equal(floorCaption({ level: 0, button: 'PB', label: 'Planta baja' }), 'PB · Planta baja');
  assert.equal(floorCaption({ level: -1, label: 'Bodega' }), 'S · Bodega');
  assert.equal(floorCaption({ level: 2, button: 'R', label: 'Roof garden' }), 'R · Roof garden');
});

test('floor buttons go in a single column, top floor first; a lone ground floor gets none', () => {
  const f = (id: string, level: number) => ({ id, level });
  assert.deepEqual(
    floorRows([f('azotea', 2), f('agenda', 1), f('pb', 0), f('bodega', -1)]).map((r) =>
      r.map((x) => x.id),
    ),
    [['azotea'], ['agenda'], ['pb'], ['bodega']],
  );
  assert.deepEqual(
    floorRows([f('agenda', 1), f('pb', 0), f('bodega', -1)], 2).map((r) => r.map((x) => x.id)),
    [['agenda', 'pb'], ['bodega']],
  );
  assert.deepEqual(floorRows([f('pb', 0)]), []);
});

test('the roof goes on the top button and reads R', () => {
  const roof = { id: 'jardin', level: 3, label: 'Azotea', roof: true };
  const floors = sortFloorsTopDown([
    { id: 'pb', level: 0, label: 'Planta baja' },
    roof,
    { id: 'agenda', level: 1, label: 'Personal' },
    { id: 'taller', level: 2, label: 'Taller' },
  ]);
  assert.deepEqual(
    floorRows(floors).map((r) => r.map((x) => x.id)),
    [['jardin'], ['taller'], ['agenda'], ['pb']],
  );
  assert.equal(floorCaption(roof), 'R · Azotea');
  assert.equal(displayArrow(roof.level), 'up');
});

test('floor buttons are drawn in LED pixels; unknown letters fall back to the font', () => {
  const pb = ledText('PB');
  assert.ok(pb);
  assert.equal(pb.w, 11);
  assert.ok(pb.runs.every(([x, y, w]) => x >= 0 && x + w <= 11 && y >= 0 && y < 7));
  assert.equal(ledText('1')?.w, 5);
  assert.equal(ledText('s2')?.w, 11);
  assert.equal(ledText('R')?.w, 5, 'the roof button has an LED letter');
  assert.equal(ledText('TL'), null);
  assert.equal(ledText(''), null);
});
