import assert from 'node:assert/strict';

import { beforeEach, test } from 'vitest';

import {
  AREA_DEFAULT_COLORS,
  CHEER_SEC,
  HOP_PERIOD_SEC,
  PARTY_GATHER_MAX_SEC,
  PARTY_SEC,
} from '../src/constants.js';
import { setDayNightMode, setParticlesEnabled } from '../src/office/effects/effectsSettings.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { hopOffsetPx } from '../src/office/party/party.js';
import type { Character, OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';

// Party mode (Fase 5.5): a small cheer for every finished turn, a party when all are done.

function loadCatalog(): void {
  buildDynamicCatalog({
    catalog: [
      {
        id: 'OFFICE_CHAIR',
        label: 'chair',
        category: 'chairs',
        width: 16,
        height: 16,
        footprintW: 1,
        footprintH: 1,
        isDesk: false,
      },
    ],
    sprites: { OFFICE_CHAIR: [['']] },
  });
}

const COLS = 20;
const ROWS = 10;
const INTERNS_FROM_COL = 14;

/** All-floor office with three desk chairs on the left; columns >= INTERNS_FROM_COL are the
 *  interns' room (or no zone at all with `withRoom` false). */
function office(withRoom = true): OfficeLayout {
  const areaTiles: Array<string | null> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      areaTiles.push(withRoom && c >= INTERNS_FROM_COL ? 'becarios' : null);
    }
  }
  const furniture: PlacedFurniture[] = [
    { uid: 'a', type: 'OFFICE_CHAIR', col: 1, row: 1 },
    { uid: 'b', type: 'OFFICE_CHAIR', col: 3, row: 1 },
    { uid: 'c', type: 'OFFICE_CHAIR', col: 5, row: 1 },
  ];
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

function run(os: OfficeState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.05) os.update(0.05);
}

/** Agents at their desks, all working. */
function working(os: OfficeState, ...ids: number[]): void {
  const seats = ['a', 'b', 'c'];
  for (const id of ids) {
    os.addAgent(id, 0, 0, seats[id - 1], true);
    os.setAgentActive(id, true);
  }
}

/** What useExtensionMessages does on `agentStatus: waiting`. */
function finish(os: OfficeState, id: number): 'cheer' | 'party' | null {
  os.setAgentActive(id, false);
  return os.celebrateTurnEnd(id);
}

function ch(os: OfficeState, id: number): Character {
  return os.characters.get(id)!;
}

function inRoom(c: Character): boolean {
  return c.tileCol >= INTERNS_FROM_COL;
}

beforeEach(() => {
  loadCatalog();
  setDayNightMode('day');
  setParticlesEnabled(true);
});

test('one agent finishing: a small cheer, hopping in place, then back to normal', () => {
  const os = new OfficeState(office());
  working(os, 1);
  run(os, 1);
  const before = [ch(os, 1).tileCol, ch(os, 1).tileRow];

  assert.equal(finish(os, 1), 'cheer');
  assert.equal(os.party, null, 'no party for a lone agent');
  run(os, HOP_PERIOD_SEC / 2);
  assert.ok(hopOffsetPx(ch(os, 1)) > 0, 'in the air mid-hop');
  run(os, CHEER_SEC / 2);
  assert.deepEqual([ch(os, 1).tileCol, ch(os, 1).tileRow], before, 'hops where it is');

  run(os, CHEER_SEC);
  assert.equal(ch(os, 1).cheerSec, 0);
  assert.equal(hopOffsetPx(ch(os, 1)), 0);
});

test('the cheer throws a little confetti (only with particles on)', () => {
  const os = new OfficeState(office());
  working(os, 1, 2);
  finish(os, 1);
  assert.ok(os.particles.particles.some((p) => p.kind === 'confetti'));

  setParticlesEnabled(false);
  const quiet = new OfficeState(office());
  working(quiet, 1, 2);
  finish(quiet, 1);
  assert.ok(!quiet.particles.particles.some((p) => p.kind === 'confetti'));
});

test('no cheer for an agent that did not work since its last one (a repeated status)', () => {
  const os = new OfficeState(office());
  working(os, 1);
  assert.equal(finish(os, 1), 'cheer');
  assert.equal(finish(os, 1), null);
  os.addAgent(2, 0, 0, 'b', true); // restored idle: never worked here
  assert.equal(finish(os, 2), null);
});

test('the last of two working agents to finish starts the party in the interns room', () => {
  const os = new OfficeState(office());
  working(os, 1, 2);
  run(os, 1);
  assert.equal(finish(os, 1), 'cheer', 'the other one is still working');
  assert.equal(finish(os, 2), 'party');
  assert.ok(os.party);
  for (const id of [1, 2]) {
    const spot = ch(os, id).partySpot!;
    assert.ok(spot.col >= INTERNS_FROM_COL, 'a spot in the interns room');
  }

  run(os, 1);
  assert.ok(os.characters.get(1)!.cheerSec > 0, 'still finishing its own cheer');
  // Walk over (13–26 tiles at 3 tiles/s, after the cheer), dance, done
  let waited = 0;
  while (!(inRoom(ch(os, 1)) && inRoom(ch(os, 2))) && waited < CHEER_SEC + 12) {
    run(os, 0.5);
    waited += 0.5;
  }
  assert.ok(inRoom(ch(os, 1)) && inRoom(ch(os, 2)), 'both made it to the room');
  assert.notEqual(os.party!.danceSec, null, 'dancing');
  assert.ok(ch(os, 1).cheerSec > 0 || ch(os, 2).cheerSec > 0, 'hopping');
  const confetti = os.particles.particles.filter((p) => p.kind === 'confetti');
  assert.ok(confetti.length > 0, 'confetti falling');

  run(os, PARTY_SEC + 1);
  assert.equal(os.party, null);
  assert.equal(ch(os, 1).partySpot, null);
  assert.equal(ch(os, 2).cheerSec, 0);
});

test('one agent working alone among idle ones: just the cheer', () => {
  const os = new OfficeState(office());
  working(os, 1, 2);
  finish(os, 1);
  finish(os, 2); // party #1
  run(os, PARTY_GATHER_MAX_SEC + PARTY_SEC + 1);
  assert.equal(os.party, null);

  os.setAgentActive(1, true);
  run(os, 1);
  assert.equal(finish(os, 1), 'cheer', 'only one worked since the last party');
  assert.equal(os.party, null);
});

test('an intern still on its task holds the party back', () => {
  const os = new OfficeState(office());
  working(os, 1, 2);
  const intern = os.addSubagent(1, 'tool-1');
  os.setAgentActive(intern, true);
  finish(os, 1);
  assert.equal(finish(os, 2), 'cheer');
  assert.equal(os.party, null);
});

test('going back to work leaves the party; the others keep dancing', () => {
  const os = new OfficeState(office());
  working(os, 1, 2);
  finish(os, 1);
  finish(os, 2);
  run(os, CHEER_SEC + 6);
  assert.ok(os.party);

  os.setAgentActive(1, true);
  assert.equal(ch(os, 1).partySpot, null);
  assert.equal(ch(os, 1).cheerSec, 0);
  run(os, 0.5);
  assert.ok(os.party, 'still on for agent 2');
  run(os, 8);
  assert.equal(ch(os, 1).state, CharacterState.TYPE, 'back at its desk');
  assert.deepEqual([ch(os, 1).tileCol, ch(os, 1).tileRow], [1, 1]);
});

test('without an interns room everyone dances where they are', () => {
  const os = new OfficeState(office(false));
  working(os, 1, 2);
  run(os, 1);
  finish(os, 1);
  run(os, CHEER_SEC + 0.5);
  const at = [ch(os, 2).tileCol, ch(os, 2).tileRow];
  assert.equal(finish(os, 2), 'party');
  assert.deepEqual([ch(os, 2).partySpot!.col, ch(os, 2).partySpot!.row], at);
  run(os, 0.2);
  assert.notEqual(os.party!.danceSec, null, 'already there: the dance starts at once');
});

test('disco lights only at night, and only once the dance is on', () => {
  setDayNightMode('night');
  const os = new OfficeState(office());
  working(os, 1, 2);
  finish(os, 1);
  finish(os, 2);
  assert.equal(os.getDisco(), null, 'still on their way');
  run(os, CHEER_SEC + 8);
  const disco = os.getDisco();
  assert.ok(disco && disco.lights.length > 0);
  assert.ok(disco.bounds.x >= INTERNS_FROM_COL * 16, 'over the interns room');

  setDayNightMode('day');
  assert.equal(os.getDisco(), null);
});
