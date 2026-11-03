import assert from 'node:assert/strict';

import { afterEach, beforeEach, test } from 'vitest';

import { LAMP_LIGHT_COLOR, LEISURE_START_SEC, STAFF_BOX_COLORS } from '../src/constants.js';
import { hexToRgb } from '../src/office/effects/dayNight.js';
import { setDayNightMode } from '../src/office/effects/effectsSettings.js';
import { collectLights } from '../src/office/effects/lighting.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import {
  atLeisureStop,
  findLeisureSpots,
  leisureLabel,
  leisurePose,
  sleepingIn,
} from '../src/office/leisure/leisure.js';
import { bossSheet, setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { FurnitureInstance, OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, TileType } from '../src/office/types.js';
import { registerPack, resetPacksForTests, setPackOffice } from '../src/packs/registry.js';

// What a private pack adds to the office through packs/registry.ts: free-time activities (a bed to nap in), a calm
// office, lights by furniture type, and its own cast of bosses and interns.

const COLS = 20;
const ROWS = 12;
const item = (uid: string, type: string, col: number, row: number): PlacedFurniture => ({
  uid,
  type,
  col,
  row,
});

function loadCatalog(): void {
  const sprite = [['']];
  buildDynamicCatalog({
    catalog: [
      {
        id: 'OFFICE_CHAIR',
        label: 'OFFICE_CHAIR',
        category: 'chairs',
        width: 16,
        height: 16,
        footprintW: 1,
        footprintH: 1,
        isDesk: false,
      },
      // A bed: empty, or with someone asleep in it
      ...(['off', 'on'] as const).map((state) => ({
        id: `BED_${state.toUpperCase()}`,
        label: 'BED',
        category: 'decor',
        width: 32,
        height: 32,
        footprintW: 2,
        footprintH: 2,
        isDesk: false,
        groupId: 'BED',
        state,
      })),
    ],
    sprites: Object.fromEntries(['OFFICE_CHAIR', 'BED_OFF', 'BED_ON'].map((id) => [id, sprite])),
  });
}

function office(furniture: PlacedFurniture[]): OfficeLayout {
  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles: new Array<TileType>(COLS * ROWS).fill(TileType.FLOOR_1),
    furniture,
  };
}

function run(os: OfficeState, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) os.update(0.1);
}

function idleAgent(os: OfficeState, id: number, seat = 'desk'): void {
  os.addAgent(id, 0, 0, seat, true);
  os.setAgentActive(id, false);
}

const INK = STAFF_BOX_COLORS.outline;
const FRAMES = Array.from({ length: 8 }, () => [[INK]]);
const SHEET = { down: FRAMES, up: FRAMES, right: FRAMES };

beforeEach(() => {
  loadCatalog();
  setDayNightMode('day');
});
afterEach(() => resetPacksForTests());

test('a pack nap: night only, one sleeper per bed, and the bed shows him tucked in', () => {
  registerPack({
    name: 'prueba',
    leisure: {
      nap: {
        label: 'Durmiendo',
        pose: 'sleep',
        standBy: ['BED_OFF'],
        nightOnly: true,
        onePerPiece: true,
      },
    },
    agentLeisure: ['nap'],
  });
  assert.equal(leisureLabel('nap'), 'Durmiendo');
  const layout = office([
    item('desk', 'OFFICE_CHAIR', 1, 1),
    item('desk2', 'OFFICE_CHAIR', 3, 1),
    item('bed-a', 'BED_OFF', 8, 2),
    item('bed-b', 'BED_OFF', 12, 2),
  ]);
  const day = new OfficeState(layout);
  idleAgent(day, 1);
  run(day, LEISURE_START_SEC + 1);
  assert.equal(day.characters.get(1)!.leisure, null, 'by day the beds are no option');

  setDayNightMode('night');
  const os = new OfficeState(layout);
  const naps = findLeisureSpots('nap', os.layout, os.seats, os.tileMap, os.blockedTiles);
  assert.deepEqual(
    naps.map((g) => g.length),
    [1, 1],
    'a single spot next to each bed',
  );
  idleAgent(os, 1, 'desk');
  idleAgent(os, 2, 'desk2');
  run(os, LEISURE_START_SEC + 10);
  const beds = [1, 2].map((id) => {
    const ch = os.characters.get(id)!;
    assert.equal(ch.leisure?.activity, 'nap');
    assert.equal(leisurePose(ch), 'sleep', 'in bed');
    return sleepingIn(ch);
  });
  assert.deepEqual(beds.sort(), ['bed-a', 'bed-b'], 'each in his own bed');
  assert.equal(os.furniture.filter((f) => f.type === 'BED_ON').length, 2);

  os.setAgentActive(1, true);
  run(os, 0.2);
  assert.equal(os.furniture.filter((f) => f.type === 'BED_ON').length, 1, 'back to work: empty');
});

test('an unknown activity has no spots (a pack that is not installed)', () => {
  const os = new OfficeState(office([item('bed', 'BED_OFF', 8, 2)]));
  assert.deepEqual(findLeisureSpots('nap', os.layout, os.seats, os.tileMap, os.blockedTiles), []);
});

test('calm office: between turns the agent stays at its desk, then free time, then back to it', () => {
  registerPack({
    name: 'prueba',
    offices: ['tranquila'],
    agentsStayAtDesk: true,
    leisure: { siesta: { label: 'Siesta', pose: 'sleep', standBy: ['BED_OFF'] } },
    agentLeisure: ['siesta'],
  });
  setPackOffice('tranquila');
  const os = new OfficeState(
    office([item('desk', 'OFFICE_CHAIR', 1, 1), item('bed', 'BED_OFF', 8, 2)]),
  );
  idleAgent(os, 1);
  const seat = os.seats.get('desk')!;
  const ch = os.characters.get(1)!;
  for (let t = 0; t < LEISURE_START_SEC - 1; t += 0.1) {
    os.update(0.1);
    assert.equal(`${ch.tileCol},${ch.tileRow}`, `${seat.seatCol},${seat.seatRow}`);
    assert.equal(ch.state, CharacterState.TYPE);
  }
  run(os, 2);
  assert.ok(ch.leisure, 'picked an activity');
  for (let t = 0; t < 30 && !atLeisureStop(ch); t += 0.1) os.update(0.1);
  assert.ok(atLeisureStop(ch), 'got there');
  ch.leisure = null;
  ch.idleSec = 0;
  run(os, 15);
  assert.equal(`${ch.tileCol},${ch.tileRow}`, `${seat.seatCol},${seat.seatRow}`, 'walked home');
  assert.equal(ch.state, CharacterState.TYPE);
});

test('a pack light by furniture type, only where the pack is active', () => {
  registerPack({
    name: 'prueba',
    offices: ['otra'],
    glow: { FLOOR_LAMP_X: { y: 8, color: LAMP_LIGHT_COLOR, radius: 80, intensity: 1 } },
  });
  const lamp: FurnitureInstance = {
    sprite: [[INK, INK]],
    x: 10,
    y: 20,
    zY: 30,
    type: 'FLOOR_LAMP_X',
  };
  assert.equal(collectLights([], [lamp]).length, 0);
  setPackOffice('otra');
  const [light] = collectLights([], [lamp]);
  assert.deepEqual(
    { x: light.x, y: light.y, radius: light.radius, color: light.color },
    { x: 11, y: 28, radius: 80, color: hexToRgb(LAMP_LIGHT_COLOR) },
  );
});

test('the office cast: agents keep their slot but draw as the pack bosses; interns from one shared pool', () => {
  registerPack({
    name: 'prueba',
    offices: ['otra'],
    cast: { bosses: ['jefa-a', 'jefa-b'], interns: ['bec-1', 'bec-2', 'bec-3'] },
  });
  setCharacterTemplates(new Array(26).fill(SHEET), {
    'jefa-a': 21,
    'jefa-b': 22,
    'bec-1': 23,
    'bec-2': 24,
    'bec-3': 25,
  });
  assert.equal(bossSheet(1), 1, 'main office: its own bosses');
  setPackOffice('otra');
  assert.equal(bossSheet(0), 21);
  assert.equal(bossSheet(1), 22);
  assert.equal(bossSheet(3), 3, 'a slot without a pack boss keeps the default one');

  const os = new OfficeState(office([]));
  os.addAgent(1, 5, 0);
  const interns = [0, 1, 2].map((i) => os.characters.get(os.addSubagent(1, `toolu_${i}`))!);
  assert.deepEqual(
    interns.map((ch) => ch.palette).sort((a, b) => a - b),
    [23, 24, 25],
  );
  assert.ok(interns.every((ch) => ch.hueShift === 0));
  const extra = os.characters.get(os.addSubagent(1, 'toolu_extra'))!;
  assert.ok([23, 24, 25].includes(extra.palette));
  assert.ok(extra.hueShift > 0, 'the pool is used up: a repeat in other colors');
});

test('without the pack sheets loaded, the cast falls back to the default characters', () => {
  registerPack({ name: 'prueba', cast: { bosses: ['jefa-a'], interns: ['bec-1'] } });
  setCharacterTemplates(new Array(21).fill(SHEET));
  assert.equal(bossSheet(0), 0);
  const os = new OfficeState(office([]));
  os.addAgent(1, 5, 0);
  const ch = os.characters.get(os.addSubagent(1, 'toolu_a'))!;
  assert.ok([13, 14].includes(ch.palette), "the boss's own interns");
});
