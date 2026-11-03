import assert from 'node:assert/strict';

import { afterEach, test } from 'vitest';

import { GROUND_FLOOR, MAIN_OFFICE } from '../../core/src/offices.js';
import { floorsOf, officesStore } from '../src/offices.js';
import {
  activePacks,
  registerPack,
  resetPacksForTests,
  setPackOffice,
} from '../src/packs/registry.js';

// Floors (core/src/offices.ts), page side: agents only on the ground floor, each building's floor list, and packs
// that only run on some floors.

const OFFICES = [
  {
    id: 'taller',
    label: 'Taller',
    profiles: ['equipo'],
    floors: [{ id: 'bodega', level: -1, label: 'Bodega' }],
  },
];

afterEach(() => {
  officesStore.set({ current: MAIN_OFFICE, floor: GROUND_FLOOR, offices: [] });
  resetPacksForTests();
});

test('the page starts on the main office ground floor outside a browser', () => {
  assert.equal(officesStore.get().current, MAIN_OFFICE);
  assert.equal(officesStore.get().floor, GROUND_FLOOR);
  assert.equal(officesStore.onGroundFloor(), true);
});

test('agents are drawn only on the ground floor of their office', () => {
  officesStore.set({ current: MAIN_OFFICE, floor: GROUND_FLOOR, offices: OFFICES });
  assert.equal(officesStore.sitsHere('personal'), true);
  assert.equal(officesStore.sitsHere('equipo'), false);

  officesStore.set({ current: MAIN_OFFICE, floor: 'azotea', offices: OFFICES });
  assert.equal(officesStore.onGroundFloor(), false);
  assert.equal(officesStore.sitsHere('personal'), false);
  assert.equal(officesStore.sitsHere(undefined), false);
});

test('each building has its own floors', () => {
  const state = {
    current: MAIN_OFFICE,
    floor: GROUND_FLOOR,
    offices: OFFICES,
    mainFloors: [{ id: 'azotea', level: 2, label: 'Azotea' }],
  };
  assert.deepEqual(
    floorsOf(state, MAIN_OFFICE).map((f) => f.id),
    ['azotea'],
  );
  assert.deepEqual(
    floorsOf(state, 'taller').map((f) => f.id),
    ['bodega'],
  );
  assert.deepEqual(floorsOf({ ...state, mainFloors: undefined }, MAIN_OFFICE), []);
  assert.deepEqual(floorsOf(state, 'nadie'), []);
});

test('a pack can run only on some floors', () => {
  registerPack({ name: 'todo' });
  registerPack({ name: 'solo-pb', floors: [GROUND_FLOOR] });
  registerPack({ name: 'solo-azotea', offices: [MAIN_OFFICE], floors: ['azotea'] });
  setPackOffice(MAIN_OFFICE);
  assert.deepEqual(
    activePacks().map((p) => p.name),
    ['todo', 'solo-pb'],
  );
  setPackOffice(MAIN_OFFICE, 'azotea');
  assert.deepEqual(
    activePacks().map((p) => p.name),
    ['todo', 'solo-azotea'],
  );
  setPackOffice('taller', 'azotea');
  assert.deepEqual(
    activePacks().map((p) => p.name),
    ['todo'],
  );
});
