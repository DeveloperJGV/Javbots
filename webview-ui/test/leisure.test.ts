import assert from 'node:assert/strict';

import { beforeEach, test } from 'vitest';

import {
  AREA_DEFAULT_COLORS,
  INTERN_LEAVE_MAX_SEC,
  INTERN_REST_MAX_SEC,
  LEISURE_START_SEC,
} from '../src/constants.js';
import { setDayNightMode } from '../src/office/effects/effectsSettings.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { isSeated } from '../src/office/engine/posture.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import {
  atLeisureStop,
  findLeisureSpots,
  INTERN_LEISURE,
  leisureStop,
} from '../src/office/leisure/leisure.js';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

// Free time (Fase 5.1): idle agents pick an activity at a piece of furniture.

const PIECES: Array<[string, string, number, number]> = [
  // id, category, footprintW, footprintH
  ['OFFICE_CHAIR', 'chairs', 1, 1],
  ['SOFA_SIMPSON', 'chairs', 3, 1],
  ['JEDI_CUSHION', 'chairs', 1, 1],
  ['HOLO_TABLE', 'desks', 2, 2],
  ['ARCADE', 'electronics', 1, 1],
  ['SENKU_TELESCOPE', 'decor', 1, 1],
  ['STATUE_LINK', 'decor', 1, 1],
  ['STATUE_MARIO', 'decor', 1, 1],
  ['COFFEE_MAKER', 'misc', 1, 1],
];

function loadCatalog(sofaWidth = 3): void {
  const sprite = [['']]; // transparent pixel: only the footprint matters here
  buildDynamicCatalog({
    catalog: PIECES.map(([id, category, w, h]) => ({
      id,
      label: id,
      category,
      width: 16,
      height: 16,
      footprintW: id === 'SOFA_SIMPSON' ? sofaWidth : w,
      footprintH: h,
      isDesk: category === 'desks',
    })),
    sprites: Object.fromEntries(PIECES.map(([id]) => [id, sprite])),
  });
}

const COLS = 20;
const ROWS = 12;

function item(uid: string, type: string, col: number, row: number): PlacedFurniture {
  return { uid, type, col, row };
}

/** All-floor office: a desk chair, a couch, cushions, the arcade, a telescope,
 *  two statues and a coffee maker. Columns >= internsFromCol are the interns' room. */
function office(furniture: PlacedFurniture[], internsFromCol?: number): OfficeLayout {
  const areaTiles: Array<string | null> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      areaTiles.push(internsFromCol !== undefined && c >= internsFromCol ? 'becarios' : null);
    }
  }
  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles: new Array<TileType>(COLS * ROWS).fill(TileType.FLOOR_1),
    furniture,
    areas: [{ label: 'becarios', color: AREA_DEFAULT_COLORS[0], zoneKind: 'interns' }],
    areaTiles,
  };
}

const FULL: PlacedFurniture[] = [
  item('desk', 'OFFICE_CHAIR', 1, 1),
  item('desk2', 'OFFICE_CHAIR', 3, 1),
  item('sofa', 'SOFA_SIMPSON', 5, 5),
  item('cush-holo', 'JEDI_CUSHION', 10, 3),
  item('holo', 'HOLO_TABLE', 11, 1),
  item('cush-alone', 'JEDI_CUSHION', 16, 9),
  item('arcade', 'ARCADE', 14, 5),
  item('telescope', 'SENKU_TELESCOPE', 2, 9),
  item('link', 'STATUE_LINK', 6, 9),
  item('mario', 'STATUE_MARIO', 9, 9),
  item('coffee', 'COFFEE_MAKER', 18, 1),
];

function run(os: OfficeState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) os.update(0.1);
}

/** Agent sitting at its own desk chair, done with its turn. */
function idleAgent(os: OfficeState, id: number, seat = 'desk'): void {
  os.addAgent(id, 0, 0, seat, true);
  os.setAgentActive(id, false);
}

beforeEach(() => {
  loadCatalog();
  setDayNightMode('day');
});

test('spots come from the furniture: couch seats, the cushion by the holo table, in front of the arcade', () => {
  const os = new OfficeState(office(FULL));
  const spots = (a: Parameters<typeof findLeisureSpots>[0]) =>
    findLeisureSpots(a, os.layout, os.seats, os.tileMap, os.blockedTiles).flat();

  assert.deepEqual(
    spots('tv').map((s) => `${s.col},${s.row}`),
    ['5,5', '6,5', '7,5'],
  );
  assert.deepEqual(
    spots('meditate').map((s) => s.seatUid),
    ['cush-holo'],
    'only the cushion within reach of the holo table',
  );
  assert.equal(spots('read').length, 0, 'no study table: nothing to read at');
  assert.deepEqual(spots('pacman'), [{ col: 14, row: 6, dir: Direction.UP, seatUid: null }]);
  assert.equal(spots('gallery').length, 2, 'one stop per statue');
});

test('a desk chair someone owns is never offered', () => {
  const os = new OfficeState(office([item('sofa', 'SOFA_SIMPSON', 5, 5)]));
  os.addAgent(1, 0, 0, 'sofa', true);
  const tv = findLeisureSpots('tv', os.layout, os.seats, os.tileMap, os.blockedTiles).flat();
  assert.equal(tv.length, 2);
  assert.ok(!tv.some((s) => s.seatUid === 'sofa'));
});

test('free time only starts after LEISURE_START_SEC without work', () => {
  const os = new OfficeState(office(FULL));
  idleAgent(os, 1);
  run(os, LEISURE_START_SEC - 1);
  assert.equal(os.characters.get(1)!.leisure, null);
  run(os, 2);
  assert.ok(os.characters.get(1)!.leisure, 'picked an activity');
});

test('the agent walks to its activity and stays there', () => {
  const os = new OfficeState(office([item('desk', 'OFFICE_CHAIR', 1, 1), ...FULL.slice(2, 3)]));
  idleAgent(os, 1);
  run(os, LEISURE_START_SEC + 8);
  const ch = os.characters.get(1)!;
  assert.equal(ch.leisure?.activity, 'tv');
  assert.ok(atLeisureStop(ch), 'sitting on the couch');
  assert.equal(ch.state, CharacterState.TYPE);
  assert.ok(isSeated(ch));
  assert.equal(os.getLeisureActivity(1), 'tv');
});

test('back to work: leaves the couch and types at its own desk, not on the couch', () => {
  const os = new OfficeState(office([item('desk', 'OFFICE_CHAIR', 1, 1), ...FULL.slice(2, 3)]));
  idleAgent(os, 1);
  run(os, LEISURE_START_SEC + 8);
  assert.ok(atLeisureStop(os.characters.get(1)!));
  os.setAgentActive(1, true);
  const ch = os.characters.get(1)!;
  assert.equal(ch.leisure, null);
  assert.equal(ch.idleSec, 0);
  run(os, 8);
  assert.equal(ch.state, CharacterState.TYPE);
  assert.deepEqual([ch.tileCol, ch.tileRow], [1, 1], 'at its own desk chair');
});

test('stargazing only happens at night', () => {
  const layout = office([item('desk', 'OFFICE_CHAIR', 1, 1), item('t', 'SENKU_TELESCOPE', 2, 9)]);
  const day = new OfficeState(layout);
  idleAgent(day, 1);
  run(day, LEISURE_START_SEC + 1);
  assert.equal(day.characters.get(1)!.leisure, null, 'by day the telescope is no option');

  setDayNightMode('night');
  const night = new OfficeState(layout);
  idleAgent(night, 1);
  run(night, LEISURE_START_SEC + 1);
  assert.equal(night.characters.get(1)!.leisure?.activity, 'stars');
});

test('two agents never pick the same spot', () => {
  loadCatalog(1); // one-seat couch
  const os = new OfficeState(
    office([
      item('desk', 'OFFICE_CHAIR', 1, 1),
      item('desk2', 'OFFICE_CHAIR', 3, 1),
      item('sofa', 'SOFA_SIMPSON', 5, 5),
      item('arcade', 'ARCADE', 14, 5),
    ]),
  );
  idleAgent(os, 1, 'desk');
  idleAgent(os, 2, 'desk2');
  run(os, LEISURE_START_SEC + 1);
  const a = leisureStop(os.characters.get(1)!);
  const b = leisureStop(os.characters.get(2)!);
  assert.ok(a && b, 'both found something');
  assert.notEqual(`${a.col},${a.row}`, `${b.col},${b.row}`);
});

test('someone on a break makes room for an intern coming to work there', () => {
  loadCatalog(1); // one-seat couch, the only chair of the interns' room
  const os = new OfficeState(
    office(
      [
        item('desk', 'OFFICE_CHAIR', 1, 1),
        item('desk2', 'OFFICE_CHAIR', 3, 1),
        item('sofa', 'SOFA_SIMPSON', 15, 5),
      ],
      12,
    ),
  );
  idleAgent(os, 1);
  run(os, LEISURE_START_SEC + 12);
  const resting = os.characters.get(1)!;
  assert.equal(resting.leisure?.activity, 'tv');

  os.addAgent(2, 0, 0, 'desk2', true);
  os.setAgentActive(2, true);
  const subId = os.addSubagent(2, 'tool-1');
  run(os, 4);
  const intern = os.characters.get(subId)!;
  assert.equal(intern.zoneSpot?.seatUid, 'sofa', 'the intern gets the couch');
  assert.equal(resting.leisure?.stops.some((s) => s.seatUid === 'sofa') ?? false, false);
});

test('a finished intern rests in the interns room, then goes home', () => {
  const os = new OfficeState(office(FULL));
  os.addAgent(1, 0, 0, 'desk', true);
  os.setAgentActive(1, true);
  const subId = os.addSubagent(1, 'tool-1');
  run(os, 2);
  os.removeSubagent(1, 'tool-1');
  const intern = os.characters.get(subId)!;
  assert.notEqual(intern.internRestSec, null, 'resting first');
  assert.ok(intern.leisure && INTERN_LEISURE.includes(intern.leisure.activity));
  run(os, INTERN_REST_MAX_SEC + INTERN_LEAVE_MAX_SEC + 2);
  assert.equal(os.characters.has(subId), false, 'gone after the rest');
});

test('a finished intern leaves at once when its boss is gone', () => {
  const os = new OfficeState(office(FULL));
  os.addAgent(1, 0, 0, 'desk', true);
  const subId = os.addSubagent(1, 'tool-1');
  run(os, 2);
  os.removeSubagent(1, 'tool-1');
  os.removeAgent(1);
  run(os, 0.5);
  const intern = os.characters.get(subId);
  assert.ok(!intern || intern.internRestSec === null, 'no rest without a boss to go back to');
});
