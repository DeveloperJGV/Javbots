import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { STAFF_BOX_COLORS } from '../src/constants.js';
import { setDayNightMode } from '../src/office/effects/effectsSettings.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import { buildDynamicCatalog } from '../src/office/layout/furnitureCatalog.js';
import { setCharacterTemplates } from '../src/office/sprites/spriteData.js';
import { nearestWalkable, StaffCrew } from '../src/office/staff/staffCrew.js';
import type {
  OfficeLayout,
  PlacedFurniture,
  TileType as TileTypeVal,
} from '../src/office/types.js';
import { TileType } from '../src/office/types.js';
import {
  registerPack,
  resetPacksForTests,
  setPackOffice,
  type StaffRole,
} from '../src/packs/registry.js';

// Walking staff (office/staff): furniture a private pack draws as people.

const ROLES = new Map<string, StaffRole>([
  ['WORKER', { sheet: 'obrero', role: 'worker' }],
  ['GUARD', { sheet: 'guardia', role: 'guard' }],
  ['KEEPER', { sheet: 'encargado', role: 'keeper' }],
]);

/** 12×6 open floor with walls around. */
function room(): TileTypeVal[][] {
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) =>
      r === 0 || r === 5 || c === 0 || c === 11 ? TileType.WALL : TileType.FLOOR_1,
    ),
  );
}

const worker: PlacedFurniture = { uid: 'w', type: 'WORKER', col: 1, row: 2 };

type Peek = { workers: Array<Record<string, unknown>>; queue: unknown[] };
const peek = (crew: StaffCrew) => crew as unknown as Peek;

/** Runs the crew in 50 ms steps until `done` or the time is up; returns the elapsed seconds. */
function run(crew: StaffCrew, map: TileTypeVal[][], seconds: number, done: () => boolean): number {
  for (let t = 0; t < seconds; t += 0.05) {
    crew.update(0.05, map, new Set());
    if (done()) return t;
  }
  return Infinity;
}

describe('staff crew', () => {
  it('a worker picks the box up at one tile, carries it to the other and goes home', () => {
    const crew = new StaffCrew();
    crew.rebuild([worker], ROLES);
    const map = room();
    crew.carry({ col: 4, row: 2 }, { col: 9, row: 4 });
    const w = peek(crew).workers[0];

    expect(run(crew, map, 20, () => w.carrying === true)).toBeLessThan(20);
    expect(w).toMatchObject({ col: 4, row: 2 });
    expect(run(crew, map, 20, () => w.carrying === false)).toBeLessThan(20);
    expect(w).toMatchObject({ col: 9, row: 4, job: null });
    expect(run(crew, map, 20, () => w.phase === 'work')).toBeLessThan(20);
    expect(w).toMatchObject({ col: 1, row: 3 });
  });

  it('furniture types no pack registers are not staff', () => {
    const crew = new StaffCrew();
    crew.rebuild([worker, { uid: 'x', type: 'SOFA', col: 5, row: 2 }], new Map());
    expect(crew.size).toBe(0);
  });

  it('finds the closest free tile next to a piece', () => {
    const map = room();
    expect(nearestWalkable(0, 0, map, new Set())).toEqual({ col: 1, row: 1 });
    expect(nearestWalkable(5, 3, map, new Set(['5,3']))).not.toEqual({ col: 5, row: 3 });
  });

  it('the guard keeps his post, ignores boxes and checks a tile on an alarm', () => {
    const crew = new StaffCrew();
    crew.rebuild([{ uid: 'g', type: 'GUARD', col: 1, row: 2 }], ROLES);
    const map = room();
    const g = peek(crew).workers[0];
    crew.carry({ col: 4, row: 2 }, { col: 9, row: 4 });
    run(crew, map, 30, () => false);
    expect(g).toMatchObject({ col: 1, row: 3, carrying: false });

    expect(crew.alarm({ col: 8, row: 2 }, map, new Set())).toBe(true);
    expect(run(crew, map, 20, () => g.col === 8 && g.row === 2)).toBeLessThan(20);
    expect(run(crew, map, 20, () => g.phase === 'work')).toBeLessThan(20);
    expect(g).toMatchObject({ col: 1, row: 3, job: null });
  });

  it('a keeper strolls around his room but leaves the boxes to the workers', () => {
    const crew = new StaffCrew();
    crew.rebuild(
      [
        { uid: 'k', type: 'KEEPER', col: 8, row: 2 },
        { uid: 'w', type: 'WORKER', col: 1, row: 2 },
      ],
      ROLES,
    );
    const map = room();
    const [k, w] = peek(crew).workers;
    crew.carry({ col: 4, row: 2 }, { col: 9, row: 4 });
    expect(run(crew, map, 20, () => w.carrying === true)).toBeLessThan(20);
    expect(k.job).toBeNull();
    expect(run(crew, map, 40, () => k.phase === 'walk')).toBeLessThan(40);
    expect(k.carrying).toBe(false);
  });

  it('nobody queues a box when only a keeper is around', () => {
    const crew = new StaffCrew();
    crew.rebuild([{ uid: 'k', type: 'KEEPER', col: 8, row: 2 }], ROLES);
    crew.carry({ col: 4, row: 2 }, { col: 9, row: 4 });
    expect(peek(crew).queue).toHaveLength(0);
  });

  it('a busy keeper goes back to his post and stays there until it ends', () => {
    const crew = new StaffCrew();
    crew.rebuild([{ uid: 'k', type: 'KEEPER', col: 3, row: 2 }], ROLES);
    const map = room();
    const k = peek(crew).workers[0];
    expect(crew.positionOf('KEEPER')).toEqual({ x: 3 * 16 + 8, y: 3 * 16 + 8 });
    expect(crew.positionOf('WORKER')).toBeNull();
    expect(run(crew, map, 40, () => k.phase === 'walk')).toBeLessThan(40);
    crew.setBusy('KEEPER', true);
    expect(run(crew, map, 20, () => k.col === 3 && k.row === 3 && k.phase === 'work')).toBeLessThan(
      20,
    );
    expect(run(crew, map, 60, () => k.phase !== 'work')).toBe(Infinity);
    crew.setBusy('KEEPER', false);
    expect(run(crew, map, 40, () => k.phase === 'walk')).toBeLessThan(40);
  });

  it('gives a delivery up when the tile cannot be reached, and a layout change cancels the queue', () => {
    const crew = new StaffCrew();
    crew.rebuild([worker], ROLES);
    const map = room();
    for (let r = 0; r < 6; r++) map[r][6] = TileType.WALL; // wall the right half off
    const w = peek(crew).workers[0];
    crew.carry({ col: 9, row: 2 }, { col: 2, row: 2 });
    crew.update(0.05, map, new Set());
    expect(w.job).toBeNull();
    expect(w.carrying).toBe(false);

    crew.carry({ col: 4, row: 2 }, { col: 2, row: 4 });
    crew.rebuild([worker], ROLES);
    run(crew, map, 30, () => false);
    expect(w.carrying).toBe(false);
    expect(w.job).toBeNull();
  });
});

// ── In the office, registered by a pack ──

const PIECES: Array<[string, number, number, number]> = [
  // id, footprint w, h, background rows
  ['WORKER', 2, 2, 1],
  ['GUARD', 2, 2, 1],
  ['COUNTER', 3, 2, 1],
  ['VAULT', 3, 3, 2],
];

function loadCatalog(): void {
  buildDynamicCatalog({
    catalog: PIECES.map(([id, w, h, bg]) => ({
      id,
      label: id,
      category: 'misc',
      width: w * 16,
      height: h * 16,
      footprintW: w,
      footprintH: h,
      isDesk: false,
      backgroundTiles: bg,
    })),
    sprites: Object.fromEntries(PIECES.map(([id]) => [id, [['']]])),
  });
}

const COLS = 16;
const ROWS = 12;
const item = (uid: string, type: string, col: number, row: number): PlacedFurniture => ({
  uid,
  type,
  col,
  row,
});

function office(furniture: PlacedFurniture[]): OfficeLayout {
  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles: new Array(COLS * ROWS).fill(TileType.FLOOR_1),
    furniture,
  };
}

function runOffice(os: OfficeState, seconds: number, until?: () => boolean): void {
  for (let t = 0; t < seconds; t += 0.05) {
    os.update(0.05);
    if (until?.()) return;
  }
}

const INK = STAFF_BOX_COLORS.outline;
const FRAMES = Array.from({ length: 8 }, () => [[INK]]);
const SHEET = { down: FRAMES, up: FRAMES, right: FRAMES };

describe('staff in the office', () => {
  /** The office's drawables that are not placed furniture (the staff and their boxes). */
  const staffDrawables = (os: OfficeState) =>
    os.furniture.filter((f) => !PIECES.some(([id]) => id === f.type));

  beforeEach(() => {
    loadCatalog();
    setDayNightMode('day');
    // Six bundled sheets, then the pack's named ones
    setCharacterTemplates(new Array(8).fill(SHEET), { obrero: 6, guardia: 7 });
    registerPack({
      name: 'prueba',
      offices: ['otra'],
      staff: Object.fromEntries(ROLES),
    });
    setPackOffice('otra');
  });
  afterEach(() => resetPacksForTests());

  it('a worker carries a box between two pieces (one extra drawable while he carries it)', () => {
    const os = new OfficeState(
      office([
        item('w', 'WORKER', 1, 8),
        item('counter', 'COUNTER', 2, 2),
        item('vault', 'VAULT', 10, 1),
      ]),
    );
    runOffice(os, 0.1);
    expect(staffDrawables(os)).toHaveLength(1);
    expect(os.furniture.some((f) => f.type === 'WORKER')).toBe(false); // drawn as a person, not the piece
    expect(os.carryBetween('COUNTER', 'VAULT')).toBe(true);
    runOffice(os, 20, () => staffDrawables(os).length === 2);
    expect(staffDrawables(os)).toHaveLength(2); // the worker and the box
    runOffice(os, 30, () => staffDrawables(os).length === 1);
    expect(staffDrawables(os)).toHaveLength(1);
  });

  it('in another office (or without the pack) the piece is still furniture', () => {
    setPackOffice('principal');
    const os = new OfficeState(office([item('w', 'WORKER', 1, 8)]));
    runOffice(os, 0.1);
    expect(os.furniture.map((f) => f.type)).toEqual(['WORKER']);
    expect(os.carryBetween('WORKER', 'WORKER')).toBe(false);
  });

  it('cannot carry without staff or without the pieces', () => {
    const empty = new OfficeState(office([item('counter', 'COUNTER', 2, 2)]));
    expect(empty.carryBetween('COUNTER', 'VAULT')).toBe(false);
    expect(empty.soundAlarm('VAULT')).toBe(false);
  });

  it('the alarm sends the guard to the piece and back', () => {
    const os = new OfficeState(office([item('g', 'GUARD', 12, 9), item('vault', 'VAULT', 2, 1)]));
    runOffice(os, 0.1);
    const at = () => {
      const d = staffDrawables(os)[0];
      return `${d.x},${d.y}`;
    };
    const start = at();
    expect(os.soundAlarm('VAULT')).toBe(true);
    runOffice(os, 2);
    expect(at()).not.toBe(start); // on his way
    runOffice(os, 40);
    expect(at()).toBe(start); // back at his post
  });

  it('a pack tick adds sprites that move every frame, and the next tick replaces them', () => {
    let x = 0;
    registerPack({
      name: 'cinta',
      tick: (dt) => {
        x += dt * 100;
        return [{ sprite: [[INK]], x: Math.round(x), y: 0, zY: 1, type: 'CAJA' }];
      },
    });
    const os = new OfficeState(office([]));
    runOffice(os, 0.05);
    const first = os.furniture.filter((f) => f.type === 'CAJA');
    runOffice(os, 0.5);
    const later = os.furniture.filter((f) => f.type === 'CAJA');
    expect(first).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(later[0].x).toBeGreaterThan(first[0].x);
  });
});
