import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  AREA_DEFAULT_COLORS,
  ZONE_ERROR_COOLDOWN_SEC,
  ZONE_ERROR_HOLD_SEC,
  ZONE_MIN_STAY_SEC,
  ZONE_SWITCH_DELAY_SEC,
} from '../src/constants.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { isSeated } from '../src/office/engine/posture.js';
import type { OfficeLayout, Seat } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';
import type { ZoneKind } from '../src/office/zones/taskZones.js';
import { findZoneSpots, pickZoneSpot, tileZoneKind } from '../src/office/zones/zoneSpots.js';

/** All-floor layout; columns >= zoneFromCol are painted as one task zone. */
function zonedLayout(kind: ZoneKind, zoneFromCol = 8, cols = 12, rows = 6): OfficeLayout {
  const areaTiles: Array<string | null> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) areaTiles.push(c >= zoneFromCol ? 'zona' : null);
  }
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
    areas: [{ label: 'zona', color: AREA_DEFAULT_COLORS[0], zoneKind: kind }],
    areaTiles,
  };
}

function run(os: OfficeState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) os.update(0.1);
}

function placeAgent(os: OfficeState, id: number, col: number, row: number): void {
  os.addAgent(id, 0, 0, undefined, true);
  const ch = os.characters.get(id)!;
  ch.tileCol = col;
  ch.tileRow = row;
  ch.x = col * 16 + 8;
  ch.y = row * 16 + 8;
}

test('a lasting activity walks the agent into its zone, standing', () => {
  const os = new OfficeState(zonedLayout('library'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActivity(1, 'Reading foo.ts');
  os.setAgentActive(1, true);
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 6);
  const ch = os.characters.get(1)!;
  assert.equal(ch.zoneAt, 'library');
  assert.ok(ch.zoneSpot, 'reserved a spot');
  assert.equal(tileZoneKind(os.layout, ch.tileCol, ch.tileRow), 'library');
  assert.equal(ch.state, CharacterState.TYPE);
  assert.equal(isSeated(ch), false, 'works standing, not sitting on the floor');
});

test('turn end releases the zone at once', () => {
  const os = new OfficeState(zonedLayout('library'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActivity(1, 'Reading foo.ts');
  os.setAgentActive(1, true);
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 1);
  assert.equal(os.characters.get(1)!.zoneAt, 'library');
  os.setAgentActive(1, false);
  const ch = os.characters.get(1)!;
  assert.equal(ch.zoneAt, null);
  assert.equal(ch.zoneSpot, null);
  assert.equal(ch.activityZone, null);
});

test('a brief activity does not move the agent', () => {
  const os = new OfficeState(zonedLayout('library'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActive(1, true);
  run(os, ZONE_MIN_STAY_SEC); // settled at its place
  os.setAgentActivity(1, 'Reading foo.ts');
  run(os, ZONE_SWITCH_DELAY_SEC / 2);
  os.setAgentActivity(1, 'Planning'); // back to desk work before the delay ran out
  run(os, ZONE_SWITCH_DELAY_SEC * 2);
  assert.equal(os.characters.get(1)!.zoneAt, null);
});

test('no area of that kind: the agent stays where it works', () => {
  const os = new OfficeState(zonedLayout('tests'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActivity(1, 'Reading foo.ts');
  os.setAgentActive(1, true);
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 1);
  const ch = os.characters.get(1)!;
  assert.equal(ch.zoneSpot, null);
  assert.equal(ch.tileCol, 1);
});

test('permission sends the agent to the permission zone', () => {
  const os = new OfficeState(zonedLayout('permission'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActivity(1, 'Running: rm -rf build');
  os.setAgentActive(1, true);
  os.showPermissionBubble(1);
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 6);
  const ch = os.characters.get(1)!;
  assert.equal(ch.zoneAt, 'permission');
  assert.equal(tileZoneKind(os.layout, ch.tileCol, ch.tileRow), 'permission');
});

test('interns head to the interns room and keep their spot between tools', () => {
  const os = new OfficeState(zonedLayout('interns'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActive(1, true);
  const subId = os.addSubagent(1, 'toolu_1');
  const sub = os.characters.get(subId)!;
  sub.matrixEffect = null; // skip the spawn effect
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 6);
  assert.equal(sub.zoneAt, 'interns');
  assert.equal(tileZoneKind(os.layout, sub.tileCol, sub.tileRow), 'interns');
  os.setAgentActive(subId, false);
  assert.ok(sub.zoneSpot, 'an idle intern keeps its desk in the room');
});

test('two agents never get the same spot', () => {
  const os = new OfficeState(zonedLayout('library', 10, 11, 1)); // a single zone tile
  placeAgent(os, 1, 0, 0);
  placeAgent(os, 2, 1, 0);
  for (const id of [1, 2]) {
    os.setAgentActivity(id, 'Reading foo.ts');
    os.setAgentActive(id, true);
  }
  run(os, ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC + 8);
  const spots = [1, 2].map((id) => os.characters.get(id)!.zoneSpot).filter(Boolean);
  assert.equal(spots.length, 1);
});

test('spots: free zone chairs first, then floor facing furniture', () => {
  const layout = zonedLayout('library', 0, 4, 3);
  const tileMap = [0, 1, 2].map(() => new Array<TileType>(4).fill(TileType.FLOOR_1));
  const seats = new Map<string, Seat>([
    ['free', { uid: 'free', seatCol: 0, seatRow: 2, facingDir: Direction.UP, assigned: false }],
    ['owned', { uid: 'owned', seatCol: 3, seatRow: 2, facingDir: Direction.UP, assigned: true }],
  ]);
  // A bookshelf across row 0, plus the two chair tiles
  const blocked = new Set(['0,0', '1,0', '2,0', '3,0', '0,2', '3,2']);
  const tiers = findZoneSpots(layout, 'library', seats, tileMap, blocked);
  assert.deepEqual(
    tiers[0].map((s) => s.seatUid),
    ['free'],
  );
  assert.ok(tiers[1].every((s) => s.row === 1 && s.dir === Direction.UP));
  assert.equal(pickZoneSpot(tiers, new Set(['0,2']))?.row, 1, 'skips a taken chair');
});

test('a failed tool sends the agent to the error zone at once, then back', () => {
  const os = new OfficeState(zonedLayout('error'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActivity(1, 'Running: npm run build');
  os.setAgentActive(1, true);
  run(os, 1);
  os.onToolFailed(1);
  run(os, 0.2); // no ZONE_SWITCH_DELAY_SEC wait for a failure
  assert.equal(os.characters.get(1)!.zoneAt, 'error');
  run(os, ZONE_ERROR_HOLD_SEC + ZONE_MIN_STAY_SEC + ZONE_SWITCH_DELAY_SEC);
  assert.equal(os.characters.get(1)!.zoneAt, 'commands', 'resumes its real work');
});

test('right after a trip, further failures do not send it again', () => {
  const os = new OfficeState(zonedLayout('error'));
  placeAgent(os, 1, 1, 2);
  os.setAgentActive(1, true);
  os.onToolFailed(1);
  run(os, ZONE_ERROR_HOLD_SEC + 1);
  os.onToolFailed(1);
  assert.equal(os.characters.get(1)!.errorHoldSec, 0);
  run(os, ZONE_ERROR_COOLDOWN_SEC);
  os.onToolFailed(1);
  assert.equal(os.characters.get(1)!.errorHoldSec, ZONE_ERROR_HOLD_SEC);
});
