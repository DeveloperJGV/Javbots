import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agentIdFromSeatKey,
  MAIN_OFFICE,
  type OfficeDef,
  officeLayoutFileName,
  officeSeatKey,
  officesForProfile,
  sitsInOffice,
} from '../../core/src/offices.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  type AssetCache,
  type ClientMessageContext,
  type ClientSession,
  handleClientMessage,
} from '../src/clientMessageHandler.js';
import { FileStateAdapter } from '../src/fileStateAdapter.js';
import { officeFromUrl, redactToken } from '../src/httpServer.js';
import { readLayoutFromFile } from '../src/layoutPersistence.js';
import { setOffices } from '../src/officeRegistry.js';
import { loadPacks } from '../src/packLoader.js';

const OFFICES: OfficeDef[] = [
  { id: 'taller', label: 'Taller', profiles: ['equipo', 'apoyo'], alsoInMain: ['apoyo'] },
];

describe('offices (core)', () => {
  it('seats each Claude Code profile in its offices', () => {
    expect(officesForProfile(undefined, OFFICES)).toEqual([MAIN_OFFICE]);
    expect(officesForProfile('personal', OFFICES)).toEqual([MAIN_OFFICE]);
    expect(officesForProfile('equipo', OFFICES)).toEqual(['taller']);
    expect(officesForProfile('apoyo', OFFICES)).toEqual([MAIN_OFFICE, 'taller']);
    expect(officesForProfile('equipo', [])).toEqual([MAIN_OFFICE]);
    expect(sitsInOffice('equipo', MAIN_OFFICE, OFFICES)).toBe(false);
    expect(sitsInOffice('otro-perfil', 'taller', OFFICES)).toBe(false);
  });

  it('keeps the main office on the original layout file and seat keys', () => {
    expect(officeLayoutFileName(MAIN_OFFICE)).toBe('layout.json');
    expect(officeLayoutFileName('taller')).toBe('layout-taller.json');
    expect(officeSeatKey(MAIN_OFFICE, 3)).toBe('3');
    expect(officeSeatKey('taller', 3)).toBe('taller:3');
    expect(agentIdFromSeatKey(MAIN_OFFICE, '3')).toBe('3');
    expect(agentIdFromSeatKey(MAIN_OFFICE, 'taller:3')).toBeNull();
    expect(agentIdFromSeatKey('taller', 'taller:3')).toBe('3');
    expect(agentIdFromSeatKey('taller', '3')).toBeNull();
  });
});

describe('clientMessageHandler per office', () => {
  let tempHome: string;
  let originalHome: string | undefined;
  let store: AgentStateStore;
  let adapter: FileStateAdapter;
  let sent: Array<Record<string, unknown>>;

  const MAIN_DEFAULT = { version: 1, cols: 2, rows: 2, tiles: [1, 1, 1, 1], furniture: [] };
  const TALLER_DEFAULT = { version: 1, cols: 3, rows: 1, tiles: [1, 1, 1], furniture: [] };
  const cache = {
    defaultLayout: MAIN_DEFAULT,
    officeLayouts: { taller: TALLER_DEFAULT },
  } as unknown as AssetCache;

  function ctxFor(session: ClientSession): ClientMessageContext {
    return { store, cache, session };
  }

  function layoutSent(): unknown {
    return sent.find((m) => m.type === 'layoutLoaded')?.layout;
  }

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-offices-'));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
    store = new AgentStateStore();
    adapter = new FileStateAdapter({ namespace: 'standalone' });
    store.setAdapter(adapter);
    sent = [];
    setOffices(OFFICES, { label: 'Casa' });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    store.dispose();
    setOffices([]);
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('sends each office its own starting layout', () => {
    const session: ClientSession = { office: MAIN_OFFICE, known: true };
    handleClientMessage(
      { type: 'webviewReady', office: 'taller' },
      (m) => sent.push(m),
      ctxFor(session),
    );
    expect(session.office).toBe('taller');
    expect(layoutSent()).toEqual(TALLER_DEFAULT);
    // The offices go first, before anything about agents
    expect(sent[0]).toMatchObject({
      type: 'officesLoaded',
      current: 'taller',
      mainLabel: 'Casa',
      offices: [{ id: 'taller', label: 'Taller' }],
    });

    sent = [];
    handleClientMessage({ type: 'webviewReady' }, (m) => sent.push(m), ctxFor(session));
    expect(session.office).toBe(MAIN_OFFICE);
    expect(layoutSent()).toEqual(MAIN_DEFAULT);
  });

  it('falls back to the main office for an unknown office', () => {
    const session: ClientSession = { office: 'taller', known: true };
    handleClientMessage(
      { type: 'webviewReady', office: 'x' },
      (m) => sent.push(m),
      ctxFor(session),
    );
    expect(session.office).toBe(MAIN_OFFICE);
  });

  it('saves each office layout to its own file', () => {
    const edited = { ...TALLER_DEFAULT, cols: 9 };
    handleClientMessage(
      { type: 'saveLayout', layout: edited },
      () => {},
      ctxFor({ office: 'taller', known: true }),
    );
    expect(readLayoutFromFile('taller')).toEqual(edited);
    expect(readLayoutFromFile(MAIN_OFFICE)).toBeNull();
  });

  it('refuses saves until the connection says its office (a reconnect would land in the main office)', () => {
    const session: ClientSession = { office: MAIN_OFFICE, known: false };
    adapter.saveSeats({ '1': { seatId: 'aviva-seat' } });
    handleClientMessage({ type: 'saveLayout', layout: TALLER_DEFAULT }, () => {}, ctxFor(session));
    handleClientMessage(
      { type: 'saveAgentSeats', seats: { '2': { seatId: 'gz-silla-1' } } },
      () => {},
      ctxFor(session),
    );
    expect(readLayoutFromFile(MAIN_OFFICE)).toBeNull();
    expect(adapter.loadSeats()).toEqual({ '1': { seatId: 'aviva-seat' } });

    handleClientMessage({ type: 'webviewReady', office: 'taller' }, () => {}, ctxFor(session));
    expect(session.known).toBe(true);
  });

  it('reads the office from the /ws URL and keeps the token out of the log', () => {
    expect(officeFromUrl('/ws?office=taller&token=abc')).toBe('taller');
    expect(officeFromUrl('/ws?office=x')).toBeNull();
    expect(officeFromUrl('/ws')).toBeNull();
    expect(redactToken('/ws?office=taller&token=abc-123')).toBe('/ws?office=taller&token=…');
    expect(redactToken('/?token=abc')).toBe('/?token=…');
  });

  it('keeps the other office seats when one office saves', () => {
    adapter.saveSeats({ '1': { seatId: 'aviva-seat' }, 'taller:2': { seatId: 'old' } });
    handleClientMessage(
      { type: 'saveAgentSeats', seats: { '2': { seatId: 'gz-silla-1' } } },
      () => {},
      ctxFor({ office: 'taller', known: true }),
    );
    expect(adapter.loadSeats()).toEqual({
      '1': { seatId: 'aviva-seat' },
      'taller:2': { seatId: 'gz-silla-1' },
    });

    handleClientMessage(
      { type: 'saveAgentSeats', seats: { '3': { seatId: 'aviva-other' } } },
      () => {},
      ctxFor({ office: MAIN_OFFICE, known: true }),
    );
    expect(adapter.loadSeats()).toEqual({
      '3': { seatId: 'aviva-other' },
      'taller:2': { seatId: 'gz-silla-1' },
    });
  });
});

describe('private packs', () => {
  it('reads offices, starting layouts and asset folders from dist/packs, and ignores bad entries', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-packs-'));
    const pack = path.join(dist, 'packs', 'mio');
    fs.mkdirSync(path.join(pack, 'planos'), { recursive: true });
    fs.mkdirSync(path.join(pack, 'assets', 'furniture'), { recursive: true });
    fs.writeFileSync(path.join(pack, 'planos', 'taller.json'), JSON.stringify({ version: 1 }));
    fs.writeFileSync(
      path.join(pack, 'pack.json'),
      JSON.stringify({
        name: 'mio',
        mainOffice: { label: 'Casa' },
        offices: [
          {
            id: 'taller',
            label: 'Taller',
            profiles: ['equipo'],
            defaultLayout: 'planos/taller.json',
          },
          { id: 'principal', label: 'No', profiles: [] },
          { id: 'Mal Nombre', label: 'No', profiles: [] },
          { id: 'fuera', label: 'Fuera', profiles: [], defaultLayout: '../../secreto.json' },
        ],
      }),
    );
    const loaded = loadPacks(dist);
    expect(loaded.offices.map((o) => o.id)).toEqual(['taller', 'fuera']);
    expect(loaded.officeLayouts).toEqual({ taller: { version: 1 }, fuera: null });
    expect(loaded.mainOffice).toEqual({ label: 'Casa', title: undefined });
    expect(loaded.assetDirs).toEqual([pack]);
    expect(loadPacks(path.join(dist, 'nada')).offices).toEqual([]);
    fs.rmSync(dist, { recursive: true, force: true });
  });
});
