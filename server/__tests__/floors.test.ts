import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  floorButton,
  floorLayoutFileName,
  type FloorSpec,
  GROUND_FLOOR,
  isValidFloorId,
  MAIN_OFFICE,
  type OfficeDef,
  sortFloorsTopDown,
} from '../../core/src/offices.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  type AssetCache,
  type ClientMessageContext,
  type ClientSession,
  handleClientMessage,
} from '../src/clientMessageHandler.js';
import { FileStateAdapter } from '../src/fileStateAdapter.js';
import { floorFromUrl } from '../src/httpServer.js';
import { readLayoutFromFile } from '../src/layoutPersistence.js';
import {
  addFloors,
  floorDefaultLayout,
  getFloors,
  getOffices,
  knownFloor,
  setOffices,
} from '../src/officeRegistry.js';
import { loadPacks } from '../src/packLoader.js';
import type { ServerFeature } from '../src/serverFeature.js';

const OFFICES: OfficeDef[] = [{ id: 'taller', label: 'Taller', profiles: ['equipo'] }];
const ROOM = { version: 1, cols: 4, rows: 1, tiles: [1, 1, 1, 1], furniture: [] };

/** A feature that only adds floors, the way a real one (agenda…) would. */
function exampleFeature(): ServerFeature {
  return {
    name: 'ejemplo',
    floors: () => [
      { id: 'azotea', level: 2, label: 'Azotea', defaultLayout: ROOM },
      { id: 'oficinas', level: 1, label: 'Oficinas' },
      { id: 'bodega', level: -1, label: 'Bodega', office: 'taller' },
    ],
  };
}

describe('floors (core)', () => {
  it('names each floor file after its office file, and the ground floor keeps it', () => {
    expect(floorLayoutFileName(MAIN_OFFICE)).toBe('layout.json');
    expect(floorLayoutFileName(MAIN_OFFICE, GROUND_FLOOR)).toBe('layout.json');
    expect(floorLayoutFileName(MAIN_OFFICE, 'agenda')).toBe('layout~agenda.json');
    expect(floorLayoutFileName('taller')).toBe('layout-taller.json');
    expect(floorLayoutFileName('taller', 'agenda')).toBe('layout-taller~agenda.json');
  });

  it('gives each floor a button and orders them like an elevator panel', () => {
    expect(floorButton({ level: 1 })).toBe('1');
    expect(floorButton({ level: -1 })).toBe('S');
    expect(floorButton({ level: -2 })).toBe('S2');
    expect(floorButton({ level: 3, button: 'A' })).toBe('A');
    expect(
      sortFloorsTopDown([{ level: -1 }, { level: 0 }, { level: 2 }]).map((f) => f.level),
    ).toEqual([2, 0, -1]);
    expect(isValidFloorId('agenda')).toBe(true);
    expect(isValidFloorId(GROUND_FLOOR)).toBe(false);
    expect(isValidFloorId('a~b')).toBe(false);
  });
});

describe('floor registry', () => {
  beforeEach(() => {
    setOffices(OFFICES);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    setOffices([]);
    vi.restoreAllMocks();
  });

  it('adds the floors a feature declares, each to its building', () => {
    const feature = exampleFeature();
    expect(addFloors(feature.floors!(), feature.name)).toBe(3);
    expect(getFloors(MAIN_OFFICE).map((f) => f.id)).toEqual(['azotea', 'oficinas']);
    expect(getFloors('taller')).toEqual([{ id: 'bodega', level: -1, label: 'Bodega' }]);
    expect(floorDefaultLayout(MAIN_OFFICE, 'azotea')).toEqual(ROOM);
    expect(floorDefaultLayout(MAIN_OFFICE, 'oficinas')).toBeNull();
    expect(getOffices()[0].floors?.map((f) => f.id)).toEqual(['bodega']);
    expect(knownFloor(MAIN_OFFICE, 'azotea')).toBe('azotea');
    expect(knownFloor('taller', 'azotea')).toBe(GROUND_FLOOR);
    expect(knownFloor(MAIN_OFFICE, undefined)).toBe(GROUND_FLOOR);
  });

  it('skips floors of unknown buildings, bad ids or levels, and repeated ones', () => {
    const bad: FloorSpec[] = [
      { id: 'a', level: 1, label: 'A', office: 'nadie' },
      { id: 'Mal', level: 1, label: 'Mal' },
      { id: GROUND_FLOOR, level: 1, label: 'Otra PB' },
      { id: 'cero', level: 0, label: 'Cero' },
      { id: 'medio', level: 1.5, label: 'Medio' },
      { id: 'uno', level: 1, label: 'Uno' },
      { id: 'uno', level: 2, label: 'Uno otra vez' },
      { id: 'otro-uno', level: 1, label: 'Mismo nivel' },
    ];
    expect(addFloors(bad, 'prueba')).toBe(1);
    expect(getFloors(MAIN_OFFICE).map((f) => f.id)).toEqual(['uno']);
  });

  it('keeps the roof on top, above floors added before or after it', () => {
    expect(addFloors([{ id: 'jardin', level: 0, label: 'Azotea', roof: true }], 'jardin')).toBe(1);
    expect(getFloors(MAIN_OFFICE)).toEqual([
      { id: 'jardin', level: 1, label: 'Azotea', roof: true },
    ]);
    // A floor added later at the roof's current level still fits, and the roof goes up
    addFloors(
      [
        { id: 'personal', level: 1, label: 'Personal' },
        { id: 'taller-alto', level: 3, label: 'Taller' },
      ],
      'otra',
    );
    const floors = getFloors(MAIN_OFFICE);
    expect(floors.map((f) => [f.id, f.level])).toEqual([
      ['jardin', 4],
      ['taller-alto', 3],
      ['personal', 1],
    ]);
    expect(floorButton(floors[0])).toBe('R');
    expect(floorButton({ level: 4, roof: true, button: 'R' })).toBe('R');
    // One roof per building
    expect(addFloors([{ id: 'otra-azotea', level: 9, label: 'Otra', roof: true }], 'x')).toBe(0);
  });

  it('a roof can be the only floor of another building, and sorts first even with a tie', () => {
    addFloors([{ id: 'techo', level: 0, label: 'Techo', roof: true, office: 'taller' }], 'x');
    addFloors([{ id: 'bodega', level: -1, label: 'Bodega', office: 'taller' }], 'x');
    expect(getFloors('taller').map((f) => [f.id, f.level])).toEqual([
      ['techo', 1],
      ['bodega', -1],
    ]);
    expect(
      sortFloorsTopDown([
        { id: 'a', level: 2 },
        { id: 'r', level: 2, roof: true },
      ]).map((f) => f.id),
    ).toEqual(['r', 'a']);
  });

  it('forgets the floors when the offices are set again', () => {
    addFloors(exampleFeature().floors!(), 'ejemplo');
    setOffices(OFFICES);
    expect(getFloors(MAIN_OFFICE)).toEqual([]);
  });

  it('reads the floor from the /ws URL, only when that office has it', () => {
    addFloors(exampleFeature().floors!(), 'ejemplo');
    expect(floorFromUrl('/ws?office=principal&floor=azotea', MAIN_OFFICE)).toBe('azotea');
    expect(floorFromUrl('/ws?office=taller&floor=azotea', 'taller')).toBe(GROUND_FLOOR);
    expect(floorFromUrl('/ws', MAIN_OFFICE)).toBe(GROUND_FLOOR);
  });
});

describe('clientMessageHandler per floor', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let store: AgentStateStore;
  let adapter: FileStateAdapter;
  let sent: Array<Record<string, unknown>>;

  const MAIN_DEFAULT = { version: 1, cols: 2, rows: 2, tiles: [1, 1, 1, 1], furniture: [] };
  const cache = { defaultLayout: MAIN_DEFAULT, officeLayouts: {} } as unknown as AssetCache;
  const ctxFor = (session: ClientSession): ClientMessageContext => ({ store, cache, session });
  const ready = (session: ClientSession, msg: Record<string, unknown>): void => {
    sent = [];
    handleClientMessage({ type: 'webviewReady', ...msg }, (m) => sent.push(m), ctxFor(session));
  };
  const layoutSent = (): unknown => sent.find((m) => m.type === 'layoutLoaded')?.layout;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-floors-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    store = new AgentStateStore();
    adapter = new FileStateAdapter({ namespace: 'standalone' });
    store.setAdapter(adapter);
    setOffices(OFFICES);
    addFloors(exampleFeature().floors!(), 'ejemplo');
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    store.dispose();
    setOffices([]);
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('tells the page its floor and every building floor list, and sends that floor layout', () => {
    const session: ClientSession = { office: MAIN_OFFICE, known: false };
    ready(session, { office: MAIN_OFFICE, floor: 'azotea' });
    expect(session.floor).toBe('azotea');
    expect(sent[0]).toMatchObject({
      type: 'officesLoaded',
      current: MAIN_OFFICE,
      floor: 'azotea',
      mainFloors: [
        { id: 'azotea', level: 2, label: 'Azotea' },
        { id: 'oficinas', level: 1, label: 'Oficinas' },
      ],
      offices: [{ id: 'taller', floors: [{ id: 'bodega', level: -1, label: 'Bodega' }] }],
    });
    expect(layoutSent()).toEqual(ROOM);

    // A floor without a starting layout: the page builds its empty room
    ready(session, { office: MAIN_OFFICE, floor: 'oficinas' });
    expect(layoutSent()).toBeNull();

    // An unknown floor, or none: the ground floor, as always
    ready(session, { office: MAIN_OFFICE, floor: 'nada' });
    expect(session.floor).toBe(GROUND_FLOOR);
    expect(layoutSent()).toEqual(MAIN_DEFAULT);
    ready(session, { office: MAIN_OFFICE });
    expect(sent[0]).toMatchObject({ floor: GROUND_FLOOR });
    expect(layoutSent()).toEqual(MAIN_DEFAULT);
  });

  it('saves the layout of the floor the page shows, in its own file', () => {
    const edited = { ...ROOM, cols: 7 };
    handleClientMessage(
      { type: 'saveLayout', layout: edited },
      () => {},
      ctxFor({ office: MAIN_OFFICE, floor: 'azotea', known: true }),
    );
    expect(readLayoutFromFile(MAIN_OFFICE, 'azotea')).toEqual(edited);
    expect(fs.existsSync(path.join(tempHome, '.pixel-agents', 'layout~azotea.json'))).toBe(true);
    expect(readLayoutFromFile(MAIN_OFFICE)).toBeNull();

    // Once saved, the page gets the saved one
    const session: ClientSession = { office: MAIN_OFFICE, known: true };
    ready(session, { office: MAIN_OFFICE, floor: 'azotea' });
    expect(layoutSent()).toEqual(edited);

    handleClientMessage(
      { type: 'saveLayout', layout: edited },
      () => {},
      ctxFor({ office: 'taller', floor: 'bodega', known: true }),
    );
    expect(fs.existsSync(path.join(tempHome, '.pixel-agents', 'layout-taller~bodega.json'))).toBe(
      true,
    );
  });

  it('only keeps seats from the ground floor (the other floors have no agents)', () => {
    adapter.saveSeats({ '1': { seatId: 'silla-1' } });
    handleClientMessage(
      { type: 'saveAgentSeats', seats: {} },
      () => {},
      ctxFor({ office: MAIN_OFFICE, floor: 'azotea', known: true }),
    );
    expect(adapter.loadSeats()).toEqual({ '1': { seatId: 'silla-1' } });

    handleClientMessage(
      { type: 'saveAgentSeats', seats: { '2': { seatId: 'silla-2' } } },
      () => {},
      ctxFor({ office: MAIN_OFFICE, floor: GROUND_FLOOR, known: true }),
    );
    expect(adapter.loadSeats()).toEqual({ '2': { seatId: 'silla-2' } });
  });
});

describe('private packs with floors', () => {
  it('reads the floors of the main office and of each pack office', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-packs-floors-'));
    const pack = path.join(dist, 'packs', 'mio');
    fs.mkdirSync(path.join(pack, 'planos'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'planos', 'azotea.json'), JSON.stringify(ROOM));
    fs.writeFileSync(
      path.join(pack, 'pack.json'),
      JSON.stringify({
        name: 'mio',
        mainOffice: {
          floors: [
            {
              id: 'azotea',
              level: 2,
              button: 'A',
              label: 'Azotea',
              defaultLayout: 'planos/azotea.json',
            },
            { id: 'fuera', level: 3, label: 'Fuera', defaultLayout: '../../secreto.json' },
            { id: 'sin-nivel', label: 'Sin nivel' },
          ],
        },
        offices: [
          { id: 'taller', label: 'Taller', profiles: [], floors: [{ id: 'bodega', level: -1 }] },
        ],
      }),
    );
    const loaded = loadPacks(dist);
    expect(loaded.floors).toEqual([
      {
        id: 'azotea',
        level: 2,
        button: 'A',
        label: 'Azotea',
        office: MAIN_OFFICE,
        defaultLayout: ROOM,
      },
      { id: 'fuera', level: 3, label: 'Fuera', office: MAIN_OFFICE, defaultLayout: null },
      { id: 'bodega', level: -1, label: 'bodega', office: 'taller', defaultLayout: null },
    ]);
    fs.rmSync(dist, { recursive: true, force: true });
  });
});
