/**
 * Unit tests for the office owner's emotes (office/owner/ownerEmotes.ts + ownerPresence.ts): when each one plays
 * (arriving, a click on him, a finished turn with its rest, the party, standing around), that he stands still and
 * faces front while it lasts, that leaving or walking to a panel cuts it, that without emotes nothing changes, and
 * that he never counts as an agent. Sheets are made up in code.
 */

import assert from 'node:assert/strict';

import { afterEach, beforeEach, test, vi } from 'vitest';

import {
  OWNER_CHEER_COOLDOWN_SEC,
  OWNER_IDLE_EMOTE_SEC,
  PARTY_GATHER_MAX_SEC,
} from '../src/constants.js';
import { setDayNightMode, setParticlesEnabled } from '../src/office/effects/effectsSettings.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { setOwnerCover } from '../src/office/owner/ownerCover.js';
import type { OwnerEmote } from '../src/office/owner/ownerEmotes.js';
import { emoteDurationSec, ownerEmoteFrame } from '../src/office/owner/ownerEmotes.js';
import { ownerBoxAt } from '../src/office/owner/ownerPresence.js';
import { ownerStore } from '../src/office/owner/ownerStore.js';
import { panelClosed, panelOpened, panelsOpen } from '../src/office/owner/panelPresence.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import type { OfficeLayout, PlacedFurniture } from '../src/office/types.js';
import { CharacterState, Direction, TileType } from '../src/office/types.js';

const FRAMES = Array.from({ length: 8 }, () => [['']]);
const SHEET = { down: FRAMES, up: FRAMES, right: FRAMES };
const SHEETS = 8;
const OWNER_SHEET = SHEETS - 1;

/** A made-up emote: `frames` cells of 32×48, each one told apart by its first pixel. */
function emote(id: string, frames: number, fps: number, loops: number, idle = false): OwnerEmote {
  return {
    id,
    frames: Array.from({ length: frames }, (_, f) => [[`${id}${f}`]]),
    fps,
    loops,
    ...(idle ? { idle } : {}),
  };
}

const GREET = emote('greet', 4, 8, 1); // 0.5 s
const CHEER = emote('cheer', 4, 8, 1); // 0.5 s
const DANCE = emote('dance', 4, 8, 3, true); // 1.5 s
const DRINK = emote('drink', 4, 8, 1, true); // 0.5 s
const ALL = [GREET, CHEER, DANCE, DRINK];
/** A little while after a cheer: still inside its rest. */
const CHEER_REST_PROBE = 2;

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

function office(cols: number, rows: number, furniture: PlacedFurniture[] = []): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture,
  };
}

const CHAIRS: PlacedFurniture[] = [
  { uid: 'a', type: 'OFFICE_CHAIR', col: 8, row: 6 },
  { uid: 'b', type: 'OFFICE_CHAIR', col: 10, row: 6 },
];

function run(os: OfficeState, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    os.update(0.05);
    each?.();
  }
}

/** Runs until `done` holds (at most `max` seconds); true when it did. */
function runUntil(os: OfficeState, done: () => boolean, max = 30): boolean {
  for (let t = 0; t < max; t += 0.05) {
    if (done()) return true;
    os.update(0.05);
  }
  return done();
}

/** The owner has come in and is done greeting (or never greets). */
function settled(os: OfficeState): void {
  assert.ok(
    runUntil(
      os,
      () => !!os.owner && !os.owner.matrixEffect && os.owner.state !== CharacterState.WALK,
    ),
  );
  os.update(0.05); // the arrival greet (if any) starts on the next frame
  runUntil(os, () => os.ownerEmote === null, 5);
}

/** Agent `id` works and finishes its turn (as on the hook's waiting status). */
function turnEnd(os: OfficeState, id: number): 'cheer' | 'party' | null {
  os.setAgentActive(id, true);
  os.setAgentActive(id, false);
  return os.celebrateTurnEnd(id);
}

beforeEach(() => {
  setOwnerCover(() => false);
  loadCatalog();
  setDayNightMode('day');
  setParticlesEnabled(false);
  setCharacterTemplates(new Array(SHEETS).fill(SHEET));
  ownerStore.setSheet(undefined);
  ownerStore.setEnabled(true);
  while (panelsOpen() > 0) panelClosed();
});

afterEach(() => {
  setOwnerCover(null);
  ownerStore.setSheet(undefined);
  ownerStore.setEnabled(true);
  while (panelsOpen() > 0) panelClosed();
  vi.restoreAllMocks();
});

test('he greets once he is done walking in, frozen and facing front, then goes on', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: ALL });
  os.update(0.05);
  assert.equal(os.ownerEmote, null, 'not while fading in');
  assert.ok(
    runUntil(os, () => os.ownerEmote === 'greet'),
    'greets on arrival',
  );
  const ch = os.owner!;
  assert.notEqual(ch.state, CharacterState.WALK, 'only once he has arrived');
  assert.equal(ch.dir, Direction.DOWN, 'facing front');
  assert.equal(ownerEmoteFrame(ch), GREET.frames[0], 'the renderer draws the emote frame');
  const at = { x: ch.x, y: ch.y };
  run(os, 0.3);
  assert.equal(
    ownerEmoteFrame(ch),
    GREET.frames[2],
    'frames advance at its fps (0.35 s × 8 = frame 2)',
  );
  assert.deepEqual({ x: ch.x, y: ch.y }, at, 'does not move while it plays');
  run(os, emoteDurationSec(GREET));
  assert.equal(os.ownerEmote, null, 'over after its frames × loops / fps');
  assert.equal(ownerEmoteFrame(ch), null, 'back to his own frame');
});

test('without emotes nothing changes: no emote, a click on him does nothing new, turns end as before', () => {
  const os = new OfficeState(office(14, 10, CHAIRS));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.addAgent(1, 0, 0, 'a', true);
  let seen = false;
  run(os, 3, () => (seen ||= os.ownerEmote !== null));
  assert.ok(os.owner);
  assert.equal(os.ownerClicked(), false, 'the click goes on as before');
  assert.equal(turnEnd(os, 1), 'cheer', 'the agent still cheers');
  run(os, 2, () => (seen ||= os.ownerEmote !== null));
  assert.equal(seen, false);
  assert.equal(ownerEmoteFrame(os.owner!), null);
});

test('a click on him greets, and he is still not an agent', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [GREET] });
  settled(os);
  const ch = os.owner!;
  assert.equal(os.getCharacterAt(ch.x, ch.y - 4), null, 'a click never selects him');
  assert.equal(os.isOwnerAt(ch.x, ch.y - 4), true);
  assert.equal(os.ownerClicked(), true);
  os.update(0.05);
  assert.equal(os.ownerEmote, 'greet');
  assert.equal(os.characters.size, 0, 'not in the agents map');
  assert.equal(os.selectedAgentId, null);
});

test('he cheers a finished turn while free, with a rest between cheers', () => {
  const os = new OfficeState(office(14, 10, CHAIRS));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [CHEER] });
  os.addAgent(1, 0, 0, 'a', true);
  settled(os);

  assert.equal(turnEnd(os, 1), 'cheer');
  os.update(0.05);
  assert.equal(os.ownerEmote, 'cheer', 'cheers with the agent');
  run(os, emoteDurationSec(CHEER) + 0.1);
  assert.equal(os.ownerEmote, null);

  run(os, CHEER_REST_PROBE);
  assert.equal(turnEnd(os, 1), 'cheer');
  os.update(0.05);
  assert.equal(os.ownerEmote, null, 'too soon after the last one');

  run(os, OWNER_CHEER_COOLDOWN_SEC);
  assert.equal(turnEnd(os, 1), 'cheer');
  os.update(0.05);
  assert.equal(os.ownerEmote, 'cheer', 'again after the rest');
});

test('he does not cheer while at a piece whose panel is open', () => {
  const os = new OfficeState(office(14, 10, CHAIRS));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [CHEER] });
  os.addAgent(1, 0, 0, 'a', true);
  settled(os);
  os.noteCanvasClick(5 * 16, 3 * 16);
  panelOpened();
  os.update(0.05);
  assert.equal(os.ownerMode, 'visit');
  turnEnd(os, 1);
  run(os, 0.2);
  assert.equal(os.ownerEmote, null);
});

test('he dances while the party dances, where he stands, and stops with it', () => {
  const os = new OfficeState(office(14, 10, CHAIRS));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [DANCE] });
  os.addAgent(1, 0, 0, 'a', true);
  os.addAgent(2, 0, 0, 'b', true);
  settled(os);
  runUntil(os, () => os.ownerEmote === null && os.owner!.state !== CharacterState.WALK);
  os.setAgentActive(1, true);
  os.setAgentActive(2, true);
  os.setAgentActive(1, false);
  os.celebrateTurnEnd(1);
  os.setAgentActive(2, false);
  assert.equal(os.celebrateTurnEnd(2), 'party');
  assert.ok(
    runUntil(os, () => os.party?.danceSec != null, PARTY_GATHER_MAX_SEC + 1),
    'the party dances',
  );
  os.update(0.05);
  assert.equal(os.ownerEmote, 'dance');
  const ch = os.owner!;
  assert.equal(ch.partySpot ?? null, null, 'not a party guest');
  const at = { col: ch.tileCol, row: ch.tileRow };
  // Longer than the emote's own 1.5 s: it lasts as long as the party
  run(os, emoteDurationSec(DANCE) + 0.5);
  assert.equal(os.ownerEmote, 'dance');
  assert.deepEqual({ col: ch.tileCol, row: ch.tileRow }, at, 'where he stood');
  assert.ok(runUntil(os, () => os.party === null, 20));
  os.update(0.05);
  assert.equal(os.ownerEmote, null, 'stops with the party');
  assert.equal(os.characters.size, 2, 'still only the two agents');
});

test('standing around he now and then plays an idle emote, never the same twice in a row', () => {
  // One tile: nowhere to stroll, so he stands still
  const os = new OfficeState(office(1, 1));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [GREET, CHEER, DANCE, DRINK] });
  settled(os);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const played: string[] = [];
  let last: string | null = null;
  run(os, (OWNER_IDLE_EMOTE_SEC + emoteDurationSec(DANCE)) * 4, () => {
    const now = os.ownerEmote;
    if (now && now !== last) played.push(now);
    last = now;
  });
  assert.ok(played.length >= 3, `played ${played.join(',')}`);
  assert.ok(
    played.every((id) => id === 'dance' || id === 'drink'),
    'only the idle ones',
  );
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
});

test('no idle emote with a panel open', () => {
  const os = new OfficeState(office(1, 1));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [DRINK] });
  settled(os);
  vi.spyOn(Math, 'random').mockReturnValue(0);
  panelOpened();
  let seen = false;
  run(os, OWNER_IDLE_EMOTE_SEC * 2, () => (seen ||= os.ownerEmote !== null));
  assert.equal(seen, false);
});

test('changing floor cuts the emote: he heads out at once', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [emote('greet', 8, 1, 10)] }); // 80 s greet
  assert.ok(runUntil(os, () => os.ownerEmote === 'greet'));
  let left = false;
  os.ownerLeave(() => (left = true));
  assert.equal(os.ownerEmote, null, 'cut right away');
  assert.equal(ownerEmoteFrame(os.owner!), null);
  assert.ok(
    runUntil(os, () => left, 3),
    'gone well before the emote would have ended',
  );
});

test('a panel opened by a click cuts the emote: he walks to it', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [emote('greet', 8, 1, 10)] });
  assert.ok(runUntil(os, () => os.ownerEmote === 'greet'));
  const ch = os.owner!;
  os.noteCanvasClick((ch.tileCol + 5) * 16, (ch.tileRow + 2) * 16);
  panelOpened();
  os.update(0.05);
  assert.equal(os.ownerEmote, null);
  assert.equal(os.ownerMode, 'visit');
  assert.equal(ch.state, CharacterState.WALK);
});

test('turning the setting off cuts the emote', () => {
  const os = new OfficeState(office(14, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET, emotes: [emote('greet', 8, 1, 10)] });
  assert.ok(runUntil(os, () => os.ownerEmote === 'greet'));
  ownerStore.setEnabled(false);
  os.update(0.05);
  assert.equal(os.ownerEmote, null);
  assert.equal(os.owner?.matrixEffect, 'despawn');
});

test('he never walks in to, nor strolls to, a tile the elevator plate covers', () => {
  // The plate hides the top-left corner: he comes in at the first tile it leaves visible and, walking in or
  // strolling later, never stops where it hides him
  const hidden = (b: { left: number; top: number }) => b.left < 6 * 16 && b.top < 4 * 16 - 16;
  setOwnerCover((box) => hidden(box));
  const os = new OfficeState(office(16, 10));
  ownerStore.setSheet({ sheet: OWNER_SHEET });
  os.update(0.05);
  const ch = os.owner!;
  let stoodHidden = 0;
  run(os, 300, () => {
    if (os.owner && os.owner.state !== CharacterState.WALK) {
      if (hidden(ownerBoxAt({ col: os.owner.tileCol, row: os.owner.tileRow }))) stoodHidden++;
    }
  });
  assert.ok(ch);
  assert.equal(stoodHidden, 0);
});
