import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  BUBBLE_SITTING_OFFSET_PX,
  CHARACTER_SITTING_OFFSET_PX,
  PALETTE_COUNT,
} from '../src/constants.js';
import { createCharacter } from '../src/office/engine/characters.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import {
  bubbleSittingDropPx,
  isFloating,
  sittingDropPx,
} from '../src/office/engine/posture.js';
import { CharacterState } from '../src/office/types.js';

function seatedAt(palette: number) {
  const ch = createCharacter(1, palette, 'seat-1', null);
  ch.state = CharacterState.TYPE;
  return ch;
}

test('Wheatley (char_9) floats: no drop into the chair, bubble stays put', () => {
  const wheatley = seatedAt(9);
  assert.equal(isFloating(wheatley), true);
  assert.equal(sittingDropPx(wheatley), 0);
  assert.equal(bubbleSittingDropPx(wheatley), 0);
});

test('a walking character still sinks into its chair', () => {
  const doc = seatedAt(0);
  assert.equal(isFloating(doc), false);
  assert.equal(sittingDropPx(doc), CHARACTER_SITTING_OFFSET_PX);
  assert.equal(bubbleSittingDropPx(doc), BUBBLE_SITTING_OFFSET_PX);
});

test('standing characters never drop', () => {
  const doc = createCharacter(1, 0, 'seat-1', null);
  doc.state = CharacterState.IDLE;
  assert.equal(sittingDropPx(doc), 0);
});

test('a restored agent never keeps an intern sheet as its boss', () => {
  const os = new OfficeState();
  os.addAgent(1, 9, 0, undefined, true); // persisted by an older page: Wheatley
  os.addAgent(2, 3, 90, undefined, true);
  const ch1 = os.characters.get(1)!;
  assert.ok(ch1.palette < PALETTE_COUNT, `got palette ${ch1.palette}`);
  assert.equal(os.characters.get(2)!.palette, 3, 'a boss palette is kept');
  assert.equal(os.characters.get(2)!.hueShift, 90);
});
