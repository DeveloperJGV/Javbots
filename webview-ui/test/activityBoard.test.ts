import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  BOARD_AREA,
  BOARD_MARK_COLORS,
  BOARD_MARK_MAX_LEN,
  BOARD_MARK_ROWS,
  BOARD_MARK_START_X,
  BOARD_WHITE,
} from '../src/constants.js';
import { ActivityLog, markLength } from '../src/office/board/activityLog.js';
import { boardSprite } from '../src/office/board/boardSprite.js';
import { activityLines, ago, listNames } from '../src/office/board/boardText.js';
import { computeNormalModeCursor } from '../src/office/components/officeCanvasCursor.js';
import type { SpriteData } from '../src/office/types.js';

describe('activity log', () => {
  test('sorts each tool into what the agent did, with file and command names', () => {
    const log = new ActivityLog(0);
    log.toolStart(1, 'tienda', 't1', 'Editing carrito.ts', 1);
    log.toolStart(1, 'tienda', 't2', 'Writing menu.tsx', 2);
    log.toolStart(1, 'tienda', 't3', 'Editing carrito.ts', 3);
    log.toolStart(1, 'tienda', 't4', 'Reading docs/guia.md', 4);
    log.toolStart(1, 'tienda', 't5', 'Searching code', 5);
    log.toolStart(1, 'tienda', 't6', 'Running: npm test', 6);
    log.toolStart(1, 'tienda', 't7', 'Running: git commit -m "Menú"', 7);
    log.toolStart(1, 'tienda', 't8', 'Running: git push', 8);
    log.toolStart(1, 'tienda', 't9', 'Fetching web content', 9);
    log.toolStart(1, 'tienda', 't10', 'Subtask: Revisar niveles', 10);
    const [a] = log.summaries();
    assert.deepEqual(a.edited, ['menu.tsx', 'carrito.ts'], 'distinct files, most recent last');
    assert.deepEqual(a.read, ['docs/guia.md']);
    assert.equal(a.searches, 1);
    assert.equal(a.commandCount, 3);
    assert.equal(a.testRuns, 1);
    assert.equal(a.commits, 1, 'a push is not a commit');
    assert.equal(a.webVisits, 1);
    assert.equal(a.subtasks, 1);
    assert.equal(a.tools, 10);
  });

  test('the same tool arriving twice (hook and transcript) counts once', () => {
    const log = new ActivityLog(0);
    log.toolStart(1, 'a', 'dup', 'Running: npm run build');
    log.toolStart(1, 'a', 'dup', 'Running: npm run build');
    log.toolDone(1, 'dup', true);
    log.toolDone(1, 'dup', true);
    const [a] = log.summaries();
    assert.equal(a.commandCount, 1);
    assert.equal(a.failures, 1);
  });

  test("an intern's work and finished subtasks count for its boss", () => {
    const log = new ActivityLog(0);
    log.toolStart(1, 'juego', 'task', 'Subtask: Revisar niveles');
    log.toolStart(1, 'juego', 'sub1', 'Editing nivel1.json');
    log.subtaskDone(1);
    log.subtaskDone(1);
    const [a] = log.summaries();
    assert.deepEqual(a.edited, ['nivel1.json']);
    assert.equal(a.subtasksDone, 1, 'never more finished than sent');
  });

  test('turn states, closing, and most recent first', () => {
    const log = new ActivityLog(0);
    log.toolStart(1, 'a', 'x', 'Reading a.ts', 10);
    log.toolStart(2, 'b', 'y', 'Reading b.ts', 20);
    log.setStatus(1, 'waiting', true);
    log.setStatus(2, 'waiting', false);
    assert.deepEqual(
      log.summaries().map((a) => [a.name, a.state]),
      [
        ['b', 'waiting'],
        ['a', 'awaitingInput'],
      ],
    );
    log.close(2);
    assert.equal(log.summaries()[0].state, 'closed');
    log.toolStart(1, 'a', 'z', 'Reading c.ts', 30);
    assert.equal(log.summaries()[0].name, 'a', 'working again moves it to the top');
    assert.equal(log.summaries()[0].state, 'working');
  });

  test('notifies subscribers on every change', () => {
    const log = new ActivityLog(0);
    let calls = 0;
    const off = log.subscribe(() => calls++);
    log.toolStart(1, 'a', 'x', 'Reading a.ts');
    log.toolDone(1, 'x', false); // not a failure: no change
    log.setStatus(1, 'waiting', false);
    off();
    log.close(1);
    assert.equal(calls, 2);
    assert.equal(log.getVersion(), 3);
  });

  test('board marks: one per recent agent, its own color, longer with more work', () => {
    const log = new ActivityLog(0);
    for (let i = 0; i < BOARD_MARK_ROWS.length + 2; i++) {
      log.toolStart(i, `a${i}`, `t${i}`, 'Reading x.ts', i);
    }
    for (let k = 0; k < 20; k++) log.toolStart(0, 'a0', `more${k}`, 'Reading y.ts', 100);
    const marks = log.marks();
    assert.equal(marks.length, BOARD_MARK_ROWS.length);
    assert.equal(marks[0].color, BOARD_MARK_COLORS[0], 'agent 0 keeps its first color');
    assert.ok(marks[0].length > marks[1].length);
    assert.equal(markLength(0), 0);
    assert.ok(markLength(1) > 0);
    assert.equal(markLength(1_000_000), BOARD_MARK_MAX_LEN);
  });
});

describe('activity panel text', () => {
  test('lists the most recent names first and sums up the rest', () => {
    assert.equal(listNames(['a', 'b', 'c', 'd', 'e', 'f'], 3), 'f, e, d y 3 más');
    assert.equal(listNames(['a', 'b'], 3), 'b, a');
  });

  test('only says what the agent did, in Spanish with plurals', () => {
    const log = new ActivityLog(0);
    log.toolStart(1, 'a', 't1', 'Editing carrito.ts');
    log.toolStart(1, 'a', 't2', 'Running: git commit -m x');
    log.toolDone(1, 't2', true);
    const lines = activityLines(log.summaries()[0]);
    assert.deepEqual(lines, [
      'Editó 1 archivo: carrito.ts',
      'Corrió 1 comando: git commit -m x',
      'Hizo 1 commit',
      '1 falla',
    ]);
  });

  test('relative time', () => {
    assert.equal(ago(0, 30_000), 'hace un momento');
    assert.equal(ago(0, 5 * 60_000), 'hace 5 min');
    assert.equal(ago(0, 125 * 60_000), 'hace 2 h');
  });
});

describe('whiteboard sprite', () => {
  const base: SpriteData = Array.from({ length: 32 }, () =>
    Array.from({ length: 32 }, () => BOARD_MARK_COLORS[5]),
  );

  test('keeps the original scribbles until someone works', () => {
    assert.equal(boardSprite(base, []), base);
  });

  test('wipes the writing area and draws a dot and a line per agent', () => {
    const marks = [
      { color: BOARD_MARK_COLORS[0], length: 3 },
      { color: BOARD_MARK_COLORS[1], length: 1 },
    ];
    const s = boardSprite(base, marks);
    assert.notEqual(s, base);
    assert.equal(s.length, 32);
    const y0 = BOARD_MARK_ROWS[0];
    assert.equal(s[y0][BOARD_AREA.x0 + 1], BOARD_MARK_COLORS[0], 'color dot');
    assert.equal(s[y0][BOARD_MARK_START_X + 2], BOARD_MARK_COLORS[0]);
    assert.equal(s[y0][BOARD_MARK_START_X + 3], BOARD_WHITE, 'line ends at its length');
    assert.equal(s[BOARD_MARK_ROWS[1]][BOARD_MARK_START_X], BOARD_MARK_COLORS[1]);
    assert.equal(s[BOARD_AREA.y1][BOARD_AREA.x1], BOARD_WHITE, 'area wiped');
    assert.equal(s[0][0], BOARD_MARK_COLORS[5], 'outside the area untouched');
    assert.equal(boardSprite(base, marks), s, 'same marks, same cached sprite');
  });
});

test('the cursor turns into a pointer over the whiteboard', () => {
  const state = {
    hitId: null,
    petId: null,
    selectedAgentId: null,
    tile: null,
    getSeatAtTile: () => null,
    getSeat: () => undefined,
    getCharacter: () => undefined,
  };
  assert.equal(computeNormalModeCursor({ ...state, boardHit: true }), 'pointer');
  assert.equal(computeNormalModeCursor(state), 'default');
});
