/**
 * Unit tests for the office's owner (office/owner): a character that is not an agent and walks around the floor
 * the page shows. These cover the OfficeState half: when it exists, where it comes in, that it never takes an
 * agent's place (characters, seats, saved seats, hit-testing), walking to the piece whose panel is open, and
 * leaving the floor before the page changes it.
 */

import assert from 'node:assert/strict';

import { afterEach, beforeEach, test, vi } from 'vitest';

import { perfilStore } from '../../features/perfil/webview/perfilStore.js';
import {
  FLOOR_URL_PARAM,
  LEISURE_START_SEC,
  OWNER_COVER_WAIT_SEC,
  OWNER_DEFAULT_LABEL,
  OWNER_FADE_SEC,
  OWNER_LEAVE_MAX_SEC,
  OWNER_PANEL_CLICK_WINDOW_SEC,
} from '../src/constants.js';
import { setDayNightMode } from '../src/office/effects/effectsSettings.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { setOwnerCover } from '../src/office/owner/ownerCover.js';
import { ownerBoxAt } from '../src/office/owner/ownerPresence.js';
import { ownerLabel, ownerStore } from '../src/office/owner/ownerStore.js';
import { panelClosed, panelOpened, panelsOpen } from '../src/office/owner/panelPresence.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, Direction, TILE_SIZE, TileType } from '../src/office/types.js';
import { setBeforeLeave, switchFloor } from '../src/offices.js';

const FRAMES = Array.from({ length: 8 }, () => [['']]);
const SHEET = { down: FRAMES, up: FRAMES, right: FRAMES };
const SHEETS = 8;
const OWNER_SHEET = SHEETS - 1;

const PIECES: Array<[string, string, number, number]> = [
  // id, category, footprintW, footprintH
  ['OFFICE_CHAIR', 'chairs', 1, 1],
  ['SOFA_SIMPSON', 'chairs', 3, 1],
  ['ARCADE', 'electronics', 1, 1],
  ['COFFEE_MAKER', 'misc', 1, 1],
  ['STATUE_LINK', 'decor', 1, 1],
  ['WALL_METER', 'wall', 2, 1],
];

function loadCatalog(): void {
  buildDynamicCatalog({
    catalog: PIECES.map(([id, category, w, h]) => ({
      id,
      label: id,
      category,
      width: 16,
      height: 16,
      footprintW: w,
      footprintH: h,
      isDesk: false,
      ...(category === 'wall' ? { canPlaceOnWalls: true } : {}),
    })),
    sprites: Object.fromEntries(PIECES.map(([id]) => [id, [['']]])),
  });
}

/** All-floor office; `voids` are "col,row" tiles left out of the floor. */
function office(
  cols: number,
  rows: number,
  furniture: PlacedFurniture[] = [],
  voids: string[] = [],
): OfficeLayout {
  const tiles: TileType[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push(voids.includes(`${c},${r}`) ? TileType.VOID : TileType.FLOOR_1);
    }
  }
  return { version: 1, cols, rows, tiles, furniture };
}

const DESKS: PlacedFurniture[] = [
  { uid: 'a', type: 'OFFICE_CHAIR', col: 3, row: 2 },
  { uid: 'b', type: 'OFFICE_CHAIR', col: 5, row: 2 },
  { uid: 'c', type: 'OFFICE_CHAIR', col: 7, row: 2 },
  { uid: 'd', type: 'OFFICE_CHAIR', col: 9, row: 2 },
  { uid: 'sofa', type: 'SOFA_SIMPSON', col: 5, row: 7 },
  { uid: 'arcade', type: 'ARCADE', col: 14, row: 5 },
  { uid: 'coffee', type: 'COFFEE_MAKER', col: 18, row: 1 },
  { uid: 'link', type: 'STATUE_LINK', col: 10, row: 9 },
];

/** Advances the office `seconds` in steps of 0.1 s, calling `each` after every step. */
function run(os: OfficeState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    os.update(0.1);
    each?.();
  }
}

const tileOf = (os: OfficeState) => ({ col: os.owner!.tileCol, row: os.owner!.tileRow });

/** The walkable tile closest (Manhattan) to the top-left corner, first in scan order on a tie. */
function closestToCorner(os: OfficeState): { col: number; row: number } {
  let best = os.walkableTiles[0];
  for (const t of os.walkableTiles) if (t.col + t.row < best.col + best.row) best = t;
  return best;
}

beforeEach(() => {
  // As the page does once mounted: nothing covers the canvas
  setOwnerCover(() => false);
  loadCatalog();
  setDayNightMode('day');
  setCharacterTemplates(new Array(SHEETS).fill(SHEET));
  ownerStore.setSheet(undefined);
  ownerStore.setEnabled(true);
  perfilStore.setProfile(undefined);
  while (panelsOpen() > 0) panelClosed();
});

afterEach(() => {
  setOwnerCover(null);
  ownerStore.setSheet(undefined);
  ownerStore.setEnabled(true);
  perfilStore.setProfile(undefined);
  while (panelsOpen() > 0) panelClosed();
  vi.unstubAllGlobals();
});

test('no avatar sheet: no owner', () => {
  const os = new OfficeState(office(12, 8));
  run(os, 2);
  assert.equal(os.owner, null);
  assert.equal(os.getCharacters().length, 0);
});

test('with a sheet and the setting on he comes in next to the corner, not as an agent', () => {
  // The corner itself is not floor: he takes the walkable tile closest to it
  const os = new OfficeState(office(12, 8, [], ['0,0', '1,0', '0,1']));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.update(0.05);

  const ch = os.owner;
  assert.ok(ch, 'the owner is on the floor');
  assert.equal(ch.isOwner, true);
  assert.equal(ch.palette, OWNER_SHEET);
  assert.deepEqual(tileOf(os), closestToCorner(os), 'starts at the walkable tile closest to (0,0)');
  assert.equal(ch.matrixEffect, 'spawn', 'fades in');

  assert.equal(os.characters.size, 0, 'not in the agents map');
  assert.ok(![...os.characters.values()].includes(ch));
  assert.deepEqual(os.getPersistableSeats(), {}, 'never saved as a seat');
  assert.ok(os.getCharacters().includes(ch), 'drawn with everyone else');

  run(os, 1); // fade-in done
  const x = os.owner!.x;
  const y = os.owner!.y - 4;
  assert.equal(os.getCharacterAt(x, y), null, 'clicks do not select him as an agent');
  assert.equal(os.isOwnerAt(x, y), true, 'but the cursor knows he is there');
  assert.equal(os.isOwnerAt(x + 200, y + 200), false);
});

test('a sheet index past the loaded sheets: no owner', () => {
  const os = new OfficeState(office(12, 8));
  ownerStore.setSheet({ sheet: SHEETS });
  run(os, 2);
  assert.equal(os.owner, null);
});

test('after coming in he walks inward, off the entry tile', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.update(0.05);
  const entry = tileOf(os);
  run(os, 5);
  assert.ok(os.owner);
  assert.notDeepEqual(tileOf(os), entry, 'no longer on the entry tile');
});

test('the setting turns him off (fading out) and back on', () => {
  const os = new OfficeState(office(12, 8));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 2);
  assert.ok(os.owner);

  ownerStore.setEnabled(false);
  os.update(0.05);
  assert.equal(os.owner?.matrixEffect, 'despawn', 'fades out where he stands');
  run(os, OWNER_FADE_SEC + 0.2);
  assert.equal(os.owner, null);
  run(os, 2);
  assert.equal(os.owner, null, 'stays away while off');

  ownerStore.setEnabled(true);
  os.update(0.05);
  assert.ok(os.owner, 'back with the setting on');
});

test('he follows the floor the page shows: another layout without seats has him too', () => {
  const ground = new OfficeState(office(20, 12, DESKS));
  const upstairs = new OfficeState(office(9, 6, [], ['0,0']));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  ground.update(0.05);
  upstairs.update(0.05);
  assert.ok(ground.owner);
  assert.equal(upstairs.seats.size, 0);
  assert.ok(upstairs.owner, 'there with no seats at all');
  assert.deepEqual(tileOf(upstairs), closestToCorner(upstairs), 'next to its own corner');
  run(upstairs, 5);
  assert.ok(upstairs.owner, 'and stays');
});

test('ownerLeave: done runs once, after he is gone, and he does not come back', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 3);
  assert.ok(os.owner);

  let calls = 0;
  os.ownerLeave(() => calls++);
  assert.equal(calls, 0, 'not right away: he walks out first');
  assert.equal(os.ownerMode, 'leaving');

  let elapsed = 0;
  const limit = OWNER_LEAVE_MAX_SEC + OWNER_FADE_SEC + 0.3;
  while (calls === 0 && elapsed < limit) {
    os.update(0.05);
    elapsed += 0.05;
  }
  assert.equal(calls, 1, `done ran within ${limit.toFixed(2)} s`);
  assert.equal(os.owner, null);

  run(os, 5);
  assert.equal(calls, 1, 'only once');
  assert.equal(os.owner, null, 'does not come back in on this page');
});

test('ownerLeave twice: each done runs exactly once', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 3);

  let first = 0;
  let second = 0;
  os.ownerLeave(() => first++);
  os.update(0.05);
  os.ownerLeave(() => second++);
  run(os, OWNER_LEAVE_MAX_SEC + OWNER_FADE_SEC + 2);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(os.owner, null);
});

test('ownerLeave without an owner: done runs right away', () => {
  const os = new OfficeState(office(12, 8));
  let calls = 0;
  os.ownerLeave(() => calls++);
  assert.equal(calls, 1);
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 2);
  assert.equal(os.owner, null, 'the page is leaving: he does not come in');
});

test('a panel opened by a click: he walks to the piece and stays while it is open', () => {
  const os = new OfficeState(office(20, 12));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 2);

  const target = { col: 15, row: 8 };
  os.noteCanvasClick(
    target.col * TILE_SIZE + TILE_SIZE / 2,
    target.row * TILE_SIZE + TILE_SIZE / 2,
  );
  panelOpened();
  os.update(0.05);
  assert.equal(os.ownerMode, 'visit');

  run(os, 20);
  const there = tileOf(os);
  const dist = Math.abs(there.col - target.col) + Math.abs(there.row - target.row);
  assert.ok(dist <= 2, `next to the clicked point (${dist} tiles away)`);
  assert.notEqual(os.owner!.state, CharacterState.WALK);

  const { x, y } = os.owner!;
  run(os, 30, () => {
    assert.equal(os.owner!.x, x, 'stays put while the panel is open');
    assert.equal(os.owner!.y, y);
  });
  assert.equal(os.ownerMode, 'visit');

  panelClosed();
  os.update(0.05);
  assert.equal(os.ownerMode, 'free');
});

test('the tile behind the elevator plate is skipped: he comes in where he can be seen', () => {
  // The plate hides everything up to 4 tiles from the corner, as with a wide office at normal zoom
  const hidden = 4 * TILE_SIZE;
  setOwnerCover((box) => box.left < hidden && box.top < hidden);
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.update(0.05);
  const entry = tileOf(os);
  const covered = (t: { col: number; row: number }) => {
    const b = ownerBoxAt(t);
    return b.left < hidden && b.top < hidden;
  };
  assert.equal(covered(entry), false, 'not behind the plate');
  // ...and still the closest visible one to the corner
  const best = Math.min(...os.walkableTiles.filter((t) => !covered(t)).map((t) => t.col + t.row));
  assert.equal(entry.col + entry.row, best);
});

test('before the page says what covers the canvas he waits a moment, then comes in anyway', () => {
  setOwnerCover(null);
  const os = new OfficeState(office(12, 8));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, OWNER_COVER_WAIT_SEC / 2);
  assert.equal(os.owner, null, 'still waiting');
  run(os, OWNER_COVER_WAIT_SEC);
  assert.ok(os.owner, 'came in without it');
});

test('nothing visible at all: the tile closest to the corner, as before', () => {
  setOwnerCover(() => true);
  const os = new OfficeState(office(12, 8, [], ['0,0']));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.update(0.05);
  assert.deepEqual(tileOf(os), closestToCorner(os));
});

test('a wall piece: he stands a row lower than right under it, facing it', () => {
  const top = Array.from({ length: 20 }, (_, c) => `${c},0`); // row 0 is the wall
  const os = new OfficeState(
    office(20, 12, [{ uid: 'meter', type: 'WALL_METER', col: 10, row: 0 }], top),
  );
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 2);

  os.noteCanvasClick(10 * TILE_SIZE + TILE_SIZE, TILE_SIZE / 2);
  panelOpened();
  os.update(0.05);
  assert.equal(os.ownerMode, 'visit');
  run(os, 20);
  const there = tileOf(os);
  assert.equal(there.row, 2, 'one row below the tile right under the piece');
  assert.ok(there.col === 10 || there.col === 11, `under the piece (col ${there.col})`);
  assert.equal(os.owner!.dir, Direction.UP, 'looking at it');
});

test('a panel opened without a recent click does not send him anywhere', () => {
  const os = new OfficeState(office(20, 12));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 2);

  // No click at all
  panelOpened();
  run(os, 1);
  assert.equal(os.ownerMode, 'free');
  panelClosed();
  os.update(0.05);

  // A click too long before the panel opened
  os.noteCanvasClick(15 * TILE_SIZE, 8 * TILE_SIZE);
  run(os, OWNER_PANEL_CLICK_WINDOW_SEC + 0.3);
  panelOpened();
  run(os, 1);
  assert.equal(os.ownerMode, 'free');
});

test('he never takes an agent seat, through minutes of strolls and breaks', () => {
  const os = new OfficeState(office(20, 12, DESKS));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.addAgent(1, 0, 0, 'a', true);
  os.addAgent(2, 0, 0, 'b', true);
  os.addAgent(3, 0, 0, 'c', true);
  for (const id of [1, 2, 3]) os.setAgentActive(id, false);

  const assignedTiles = () =>
    new Set(
      [...os.seats.values()].filter((s) => s.assigned).map((s) => `${s.seatCol},${s.seatRow}`),
    );
  const seatsBefore = [...os.seats.entries()].map(([id, s]) => [id, s.assigned]);

  let tookBreak = false;
  run(os, LEISURE_START_SEC + 180, () => {
    const ch = os.owner;
    if (!ch) return;
    if (ch.leisure) tookBreak = true;
    assert.equal(ch.seatId, null, 'never holds a seat id');
    if (ch.state !== CharacterState.WALK) {
      assert.ok(
        !assignedTiles().has(`${ch.tileCol},${ch.tileRow}`),
        `stopped on an agent seat at ${ch.tileCol},${ch.tileRow}`,
      );
    }
  });
  assert.ok(os.owner, 'still around');
  assert.ok(tookBreak, 'he took at least one break in that time');
  assert.deepEqual(
    [...os.seats.entries()].map(([id, s]) => [id, s.assigned]),
    seatsBefore,
    'no seat changed hands because of him',
  );

  os.addAgent(4, 0, 0, undefined, true);
  const late = os.characters.get(4)?.seatId;
  assert.ok(late, 'an agent added later still gets a seat');
  assert.ok(!['a', 'b', 'c'].includes(late), 'a free one');
});

test('a layout rebuild that voids his tile moves him to a walkable one', () => {
  const os = new OfficeState(office(12, 8));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  run(os, 3);
  const { col, row } = tileOf(os);

  os.rebuildFromLayout(office(12, 8, [], [`${col},${row}`]));
  const now = tileOf(os);
  assert.notDeepEqual(now, { col, row });
  assert.ok(
    os.walkableTiles.some((t) => t.col === now.col && t.row === now.row),
    'on a walkable tile',
  );
  run(os, 2);
  assert.ok(os.owner, 'still there');
});

test('ownerLabel: profile name, else the avatar name, else the default', () => {
  assert.equal(ownerLabel(), OWNER_DEFAULT_LABEL);
  assert.equal(OWNER_DEFAULT_LABEL, 'Tú');

  ownerStore.setSheet({ sheet: OWNER_SHEET, name: 'Ada' });
  assert.equal(ownerLabel(), 'Ada');

  perfilStore.setProfile({ code: 'X', name: 'Grace', traits: [] });
  assert.equal(ownerLabel(), 'Grace', 'the profile wins');
});

test('changing floor waits for the before-leave handler, and leaves once', () => {
  const assign = vi.fn();
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/office', assign },
    localStorage: { getItem: () => null, setItem: () => undefined },
  });
  const asked: Array<() => void> = [];
  setBeforeLeave((g) => {
    asked.push(g);
  });
  try {
    switchFloor('second');
    assert.equal(asked.length, 1, 'the handler was asked first');
    assert.equal(assign.mock.calls.length, 0, 'the page waits for it');
    switchFloor('third');
    asked[0]();
    assert.equal(assign.mock.calls.length, 1, 'leaves once');
    const url = new URL(String(assign.mock.calls[0][0]));
    assert.equal(url.searchParams.get(FLOOR_URL_PARAM), 'second');
  } finally {
    setBeforeLeave(null);
  }
});
