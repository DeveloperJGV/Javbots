import assert from 'node:assert/strict';

import { afterEach, describe, test } from 'vitest';

import type { GithubRepo, JardinPlant, JardinStatus } from '../../core/src/messages.js';
import { agendaStore } from '../../features/agenda/webview/agendaStore.js';
import { directorioStore } from '../../features/directorio/webview/directorioStore.js';
import { githubStore } from '../../features/github/webview/githubStore.js';
import { jardinStore } from '../../features/jardin/webview/jardinStore.js';
import { MUSICA_PLAYLIST_REJECT_BIN } from '../../features/musica/webview/playlists/constants.js';
import { pomodoroStore } from '../../features/pomodoro/webview/pomodoroStore.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { HINT_EDGE_MARGIN, HINT_OFFSET_X, HINT_OFFSET_Y } from '../src/office/hint/constants.js';
import { furnitureTargetAt } from '../src/office/hint/furnitureTargets.js';
import { hintPosition } from '../src/office/hint/hintPosition.js';
import { hintStore } from '../src/office/hint/hintStore.js';
import { panelClosed, panelOpened, panelsOpen } from '../src/office/owner/panelPresence.js';
import type { FurnitureInstance, OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';
import { registerPack, resetPacksForTests } from '../src/packs/registry.js';

// The hover sign and the click share one path (office/hint/furnitureTargets.ts): a piece that opens something gives
// the hand, its sign and the click; a decoration piece gives none of the three.

const COLS = 40;
const ROWS = 4;

function emptyOffice(): OfficeLayout {
  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles: new Array<TileType>(COLS * ROWS).fill(TileType.FLOOR_1),
    furniture: [],
  };
}

/** One 2×2 painted piece per type, side by side (8 px apart), so each is hit at its own point. */
function officeWith(types: string[]): { os: OfficeState; at: (type: string) => [number, number] } {
  const os = new OfficeState(emptyOffice());
  os.furniture = types.map((type, i): FurnitureInstance => ({
    type,
    x: i * 8,
    y: 0,
    zY: 2,
    // Any non-empty cell counts as painted for the hit test
    sprite: [
      ['p', 'p'],
      ['p', 'p'],
    ],
  }));
  return {
    os,
    at: (type) => {
      const i = types.indexOf(type);
      assert.ok(i >= 0, type);
      return [i * 8 + 1, 1];
    },
  };
}

const noBoard = { openBoard: () => {}, onIsaacDance: () => {} };

const plant = (id: string, name: string, furniture: string): JardinPlant => ({
  id,
  name,
  furniture,
  photos: [],
  cares: [],
});

const garden = (plants: JardinPlant[]): JardinStatus =>
  ({
    type: 'jardinStatus',
    connected: true,
    today: '2026-11-13',
    plants,
    supplies: [],
  }) as unknown as JardinStatus;

const repo = (name: string, commits: number): GithubRepo => ({
  name,
  url: '',
  private: false,
  stars: 0,
  commits,
  openPullRequests: 0,
});

afterEach(() => {
  agendaStore.close();
  pomodoroStore.close();
  directorioStore.close();
  jardinStore.close();
  githubStore.close();
  hintStore.clear();
  resetPacksForTests();
  while (panelsOpen() > 0) panelClosed();
});

describe('one clickable piece per feature', () => {
  const KEPT: Record<string, string> = {
    AGENDA_CONSOLE: 'Agenda: hoy y esta semana',
    DIRECTORIO_DESK: 'Directorio',
    POMODORO_TIMER_WALL: 'Pomodoro',
    POMODORO_TIMER: 'Pomodoro',
    JARDIN_CONTROL: 'Jardín: lo de hoy',
    JARDIN_SHED: 'Jardín: inventario',
    GITHUB_GRAPH: 'Contribuciones de las últimas semanas',
  };
  const DROPPED = [
    'AGENDA_WEEK_MAP',
    'AGENDA_RADAR',
    'AGENDA_TASKS',
    'DIRECTORIO_BOARD',
    'DIRECTORIO_KEYS',
    'DIRECTORIO_PHONE',
    'POMODORO_HOURGLASS',
    'POMODORO_HOURGLASS_BIG',
    'JARDIN_PLAQUE',
    'JARDIN_TOOL_RACK',
    'GITHUB_PRS',
  ];

  test('the kept pieces give a hand and say what they open', () => {
    const { os, at } = officeWith([...Object.keys(KEPT), ...DROPPED]);
    for (const [type, label] of Object.entries(KEPT)) {
      const t = furnitureTargetAt(os, ...at(type), noBoard);
      assert.ok(t, type);
      assert.equal(t.hand, true, type);
      assert.equal(t.hint, label, type);
    }
  });

  test('the dropped pieces give no hand, no sign and no click (also in their on / rotated variants)', () => {
    const variants = DROPPED.flatMap((t) => [t, `${t}:on`, `${t}:left`]);
    const { os, at } = officeWith(variants);
    for (const type of variants)
      assert.equal(furnitureTargetAt(os, ...at(type), noBoard), null, type);
  });

  test('each feature opens only from its own piece', () => {
    const { os, at } = officeWith([
      'AGENDA_CONSOLE',
      'AGENDA_RADAR',
      'POMODORO_TIMER_WALL',
      'POMODORO_HOURGLASS',
      'DIRECTORIO_DESK',
      'DIRECTORIO_PHONE',
    ]);
    furnitureTargetAt(os, ...at('AGENDA_CONSOLE'), noBoard)?.open();
    assert.equal(agendaStore.get().open, true);
    furnitureTargetAt(os, ...at('POMODORO_TIMER_WALL'), noBoard)?.open();
    assert.equal(pomodoroStore.get().open, true);
    // The Directorio's front desk now gives the hand too (it opened without one before)
    const desk = furnitureTargetAt(os, ...at('DIRECTORIO_DESK'), noBoard);
    assert.equal(desk?.hand, true);
    assert.equal(os.isDirectorioAt(...at('DIRECTORIO_PHONE')), false);
    assert.equal(os.isAgendaAt(...at('AGENDA_RADAR')), false);
    assert.equal(os.isPomodoroAt(...at('POMODORO_HOURGLASS')), false);
  });
});

describe('signs', () => {
  test('a plant says its name; the shed opens the supplies', () => {
    jardinStore.setStatus(garden([plant('m', 'Monstera', 'JARDIN_MONSTERA')]));
    const { os, at } = officeWith(['JARDIN_MONSTERA', 'JARDIN_SHED']);
    assert.equal(
      furnitureTargetAt(os, ...at('JARDIN_MONSTERA'), noBoard)?.hint,
      'Jardín: Monstera',
    );
    furnitureTargetAt(os, ...at('JARDIN_SHED'), noBoard)?.open();
    assert.equal(jardinStore.get().section, 'inventario');
  });

  test('GitHub keeps its own: the repository and its commits on a cabinet', () => {
    githubStore.setStatus({
      type: 'githubStatus',
      login: 'a',
      totalRepos: 1,
      repos: [repo('demo', 42)],
      pullRequests: [],
      weeks: [],
      updatedAt: '2026-11-13T00:00:00Z',
    });
    const { os, at } = officeWith(['GITHUB_CABINET']);
    const t = furnitureTargetAt(os, ...at('GITHUB_CABINET'), noBoard);
    assert.equal(t?.hint, 'demo · 42 commits');
    t?.open();
    assert.equal(githubStore.get().focusRepo, 'demo');
  });

  test('the other pieces of the office', () => {
    const SIGNS: Record<string, string> = {
      STORAGE_SHELF: 'Bodega',
      CONCERT_TICKETS: 'Boletos de conciertos',
      PERFIL_SCREEN: 'Perfil',
      CONNECTIONS_RACK: 'Conexiones',
      USAGE_METER: 'Uso de Claude',
      WHITEBOARD: 'Pizarrón de actividad',
      DECKS_SHELF: 'Decks',
      OFERTAS_KIOSK: 'Ofertas',
      [MUSICA_PLAYLIST_REJECT_BIN]: 'Playlist: esta no',
    };
    const { os, at } = officeWith(Object.keys(SIGNS));
    for (const [type, label] of Object.entries(SIGNS))
      assert.equal(furnitureTargetAt(os, ...at(type), noBoard)?.hint, label, type);
  });

  test('the whiteboard opens through the office, not a store', () => {
    let opened = 0;
    const { os, at } = officeWith(['WHITEBOARD']);
    furnitureTargetAt(os, ...at('WHITEBOARD'), {
      openBoard: () => opened++,
      onIsaacDance: () => {},
    })?.open();
    assert.equal(opened, 1);
  });

  test("Isaac's secret: a click, but no hand and no sign", () => {
    const { os, at } = officeWith(['ISAAC']);
    const t = furnitureTargetAt(os, ...at('ISAAC'), noBoard);
    assert.ok(t);
    assert.equal(t.hand, false);
    assert.equal(t.hint, null);
  });

  test('a pack gives its sign through the same path (or none, keeping the hand)', () => {
    const { os } = officeWith([]);
    let clicks = 0;
    registerPack({
      name: 'demo',
      hover: (x) => x < 100,
      hint: (x) => (x < 50 ? 'Sala demo' : null),
      click: () => {
        clicks++;
        return true;
      },
    });
    const near = furnitureTargetAt(os, 10, 1, noBoard);
    assert.equal(near?.hint, 'Sala demo');
    assert.equal(near?.hand, true);
    near?.open();
    assert.equal(clicks, 1);
    const far = furnitureTargetAt(os, 70, 1, noBoard);
    assert.equal(far?.hint, null);
    assert.equal(far?.hand, true);
  });
});

describe('the sign itself', () => {
  test('sits right of the cursor, flips left at the right edge and never leaves the window', () => {
    assert.deepEqual(hintPosition(100, 100, 80, 20, 800, 600), {
      left: 100 + HINT_OFFSET_X,
      top: 100 + HINT_OFFSET_Y,
    });
    // Right edge: to the cursor's left
    assert.equal(hintPosition(790, 100, 80, 20, 800, 600).left, 790 - HINT_OFFSET_X - 80);
    // Top edge: not above the window
    assert.equal(hintPosition(100, 5, 80, 20, 800, 600).top, HINT_EDGE_MARGIN);
    // Bottom edge
    assert.equal(hintPosition(100, 700, 80, 20, 800, 600).top, 600 - HINT_EDGE_MARGIN - 20);
    // Left edge after flipping (a sign wider than the room to the left)
    assert.equal(hintPosition(20, 100, 790, 20, 800, 600).left, HINT_EDGE_MARGIN);
  });

  test('opening a panel hides it', () => {
    hintStore.set({ label: 'Pomodoro', x: 1, y: 1 });
    panelOpened();
    assert.equal(hintStore.get(), null);
  });

  test('a repeated hover at the same spot does not notify again', () => {
    let calls = 0;
    const off = hintStore.subscribe(() => calls++);
    hintStore.set({ label: 'Bodega', x: 1, y: 1 });
    hintStore.set({ label: 'Bodega', x: 1, y: 1 });
    hintStore.clear();
    off();
    assert.equal(calls, 2);
  });
});
