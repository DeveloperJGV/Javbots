import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import type { RuedaStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { RUEDA_DIR_ENV } from '../../server/rueda/constants.js';
import { createRueda, type RuedaRunner } from '../../server/rueda/ruedaFeature.js';
import { readLauncher, ruedaDir, validatePatch } from '../../server/rueda/ruedaFiles.js';

/** A made-up program state, as the program writes it. */
const STATE = {
  version: 1,
  pid: 4242,
  prendido: true,
  pausado: false,
  sesion: true,
  modo: 'spotify',
  motivo: 'spotify',
  aparato: {
    nombre: 'Bocina Sala',
    tipo: 'Speaker',
    volumen: 31,
    suena: true,
    es_esta_lap: false,
    soporta_volumen: true,
  },
  paso: 3,
  arrancar_con_windows: false,
  iniciando_sesion: false,
  ultima_tecla: { a: 'windows', motivo: 'nada_suena', cuando: '2026-11-23T10:00:00-0600' },
  actualizado: '2026-11-23T10:00:01-0600',
};

describe('rueda de volumen (server)', () => {
  let dir: string;
  let runs: {
    kind: 'start' | 'run';
    args: readonly string[];
    env: NodeJS.ProcessEnv;
    python: string;
  }[];
  let exitCode: number | null;
  let alivePids: Set<number>;
  let sent: RuedaStatus[];

  const write = (file: string, value: unknown) =>
    fs.writeFileSync(path.join(dir, file), JSON.stringify(value), 'utf8');
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const runner: RuedaRunner = {
    start: (l, env) => runs.push({ kind: 'start', args: [l.script], env, python: l.python }),
    run: async (l, args, env) => {
      runs.push({ kind: 'run', args: [l.script, ...args], env, python: l.python });
      return exitCode;
    },
  };
  const client = (privileged: boolean): FeatureClient => ({
    privileged,
    send: (m) => {
      if (m.type === 'ruedaStatus') sent.push(m as unknown as RuedaStatus);
    },
  });
  const feature = (platform: NodeJS.Platform = 'win32') =>
    createRueda({ dataDir: dir, platform, runner, alive: (p) => alivePids.has(p), timers: false });
  const last = () => sent[sent.length - 1]!;
  /** A launcher with real files (the office checks they exist). */
  const installLauncher = (python = 'pythonw.exe', script = 'rueda.pyw') => {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    fs.writeFileSync(path.join(bin, python), '');
    fs.writeFileSync(path.join(bin, script), '');
    write('lanzador.json', {
      version: 1,
      python: path.join(bin, python),
      script: path.join(bin, script),
    });
    return { python: path.join(bin, python), script: path.join(bin, script) };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-rueda-'));
    runs = [];
    exitCode = 0;
    alivePids = new Set();
    sent = [];
  });

  it('never ran here: not installed, off, and says how to start it the first time', async () => {
    const r = feature();
    const page = client(true);
    r.connect(page);
    r.greet(page);
    expect(last()).toMatchObject({ installed: false, running: false });
    expect(last().settings).toEqual({
      paused: false,
      step: 3,
      toast: true,
      startWithWindows: false,
      computerName: '',
    });
    await r.handle({ type: 'ruedaCommand', action: 'start' }, page);
    expect(runs).toEqual([]);
    expect(last().message).toMatch(/una vez a mano/);
  });

  it('reads the state file: device, volume, mode, last key; a dead pid means off', () => {
    installLauncher();
    write('estado.json', STATE);
    write('ajustes.json', {
      pausado: false,
      paso: 5,
      aviso: false,
      nombre_lap: 'MI-COMPU',
      client_id: 'x',
    });
    const r = feature();
    alivePids.add(4242);
    expect(r.status()).toMatchObject({
      installed: true,
      running: true,
      session: true,
      mode: 'spotify',
      reason: 'spotify',
      device: {
        name: 'Bocina Sala',
        kind: 'Speaker',
        volume: 31,
        playing: true,
        thisComputer: false,
      },
      lastKey: { to: 'windows', reason: 'nothing_playing' },
      settings: { step: 5, toast: false, computerName: 'MI-COMPU' },
    });
    alivePids.clear();
    const off = r.status();
    expect(off.running).toBe(false);
    expect(off.device).toBeUndefined();
  });

  it('only the owner gets the status or drives it; off outside Windows', async () => {
    installLauncher();
    const r = feature();
    const guest = client(false);
    r.connect(guest);
    r.greet(guest);
    await r.handle({ type: 'ruedaCommand', action: 'start' }, guest);
    await r.handle({ type: 'ruedaCommand', action: 'set', settings: { paused: true } }, guest);
    expect(sent).toEqual([]);
    expect(runs).toEqual([]);
    expect(fs.existsSync(path.join(dir, 'ajustes.json'))).toBe(false);

    const mac = feature('darwin');
    const owner = client(true);
    mac.connect(owner);
    mac.greet(owner);
    await mac.handle({ type: 'ruedaCommand', action: 'start' }, owner);
    expect(sent).toEqual([]);
    expect(runs).toEqual([]);
  });

  it('settings: validated, merged into the file atomically, other keys kept', async () => {
    write('ajustes.json', {
      pausado: false,
      paso: 3,
      aviso: true,
      nombre_lap: 'A',
      client_id: 'keep-me',
    });
    const r = feature();
    const page = client(true);
    r.connect(page);
    await r.handle(
      {
        type: 'ruedaCommand',
        action: 'set',
        settings: { paused: true, step: 10, computerName: '  OTRA-PC ' },
      },
      page,
    );
    expect(read('ajustes.json')).toEqual({
      pausado: true,
      paso: 10,
      aviso: true,
      nombre_lap: 'OTRA-PC',
      client_id: 'keep-me',
    });
    expect(last().settings).toMatchObject({ paused: true, step: 10, computerName: 'OTRA-PC' });
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);

    for (const bad of [
      { step: 0 },
      { step: 26 },
      { step: 2.5 },
      { step: '3' },
      { paused: 'yes' },
      { toast: 1 },
      { computerName: '' },
      { computerName: 'x'.repeat(65) },
      { computerName: 'a\nb' },
      { client_id: 'evil' },
      {},
    ]) {
      await r.handle({ type: 'ruedaCommand', action: 'set', settings: bad }, page);
      expect(last().message, JSON.stringify(bad)).toBeTruthy();
    }
    expect(read('ajustes.json').paso).toBe(10);
    expect(read('ajustes.json').client_id).toBe('keep-me');
  });

  it('a damaged settings file is left alone', async () => {
    fs.writeFileSync(path.join(dir, 'ajustes.json'), '{ esto no es json', 'utf8');
    const r = feature();
    const page = client(true);
    r.connect(page);
    await r.handle({ type: 'ruedaCommand', action: 'set', settings: { paused: true } }, page);
    expect(fs.readFileSync(path.join(dir, 'ajustes.json'), 'utf8')).toBe('{ esto no es json');
    expect(last().message).toMatch(/dañado/);
  });

  it('start / stop / sign in / startup run only the launcher with fixed arguments and the data folder', async () => {
    const l = installLauncher();
    const r = feature();
    const page = client(true);
    r.connect(page);

    await r.handle({ type: 'ruedaCommand', action: 'start' }, page);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: 'start', python: l.python, args: [l.script] });
    expect(runs[0]!.env.RUEDA_CARPETA).toBe(dir);

    // Now it runs
    write('estado.json', STATE);
    alivePids.add(4242);
    await r.handle({ type: 'ruedaCommand', action: 'start' }, page);
    expect(runs).toHaveLength(1);
    expect(last().message).toMatch(/Ya está prendida/);

    await r.handle({ type: 'ruedaCommand', action: 'signIn' }, page);
    await r.handle({ type: 'ruedaCommand', action: 'startup', on: true }, page);
    await r.handle({ type: 'ruedaCommand', action: 'startup', on: false }, page);
    await r.handle({ type: 'ruedaCommand', action: 'stop' }, page);
    expect(runs.slice(1).map((x) => x.args.slice(1))).toEqual([
      ['--iniciar-sesion'],
      ['--arranque', 'si'],
      ['--arranque', 'no'],
      ['--salir'],
    ]);
    for (const x of runs) expect(x.python).toBe(l.python);

    // Text from the page never reaches the command line
    await r.handle({ type: 'ruedaCommand', action: 'startup', on: 'si; del *' }, page);
    await r.handle({ type: 'ruedaCommand', action: 'rm -rf' }, page);
    expect(runs).toHaveLength(5);
  });

  it('a failing command says so and frees the panel', async () => {
    installLauncher();
    write('estado.json', STATE);
    alivePids.add(4242);
    exitCode = 3;
    const r = feature();
    const page = client(true);
    r.connect(page);
    await r.handle({ type: 'ruedaCommand', action: 'signIn' }, page);
    expect(last().busy).toBeUndefined();
    expect(last().message).toMatch(/ícono junto al reloj/);
  });

  it('sign in and stop need it running', async () => {
    installLauncher();
    const r = feature();
    const page = client(true);
    r.connect(page);
    await r.handle({ type: 'ruedaCommand', action: 'signIn' }, page);
    expect(last().message).toMatch(/Primero prende/);
    await r.handle({ type: 'ruedaCommand', action: 'stop' }, page);
    expect(last().message).toMatch(/apagada/);
    expect(runs).toEqual([]);
  });

  it('ignores a launcher that points elsewhere', () => {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    for (const f of ['cmd.exe', 'pythonw.exe', 'rueda.pyw', 'otro.py'])
      fs.writeFileSync(path.join(bin, f), '');
    const cases = [
      { python: path.join(bin, 'cmd.exe'), script: path.join(bin, 'rueda.pyw') },
      { python: path.join(bin, 'pythonw.exe'), script: path.join(bin, 'otro.py') },
      { python: 'pythonw.exe', script: path.join(bin, 'rueda.pyw') },
      { python: path.join(bin, 'pythonw.exe'), script: 'rueda.pyw' },
      { python: path.join(bin, 'nope', 'pythonw.exe'), script: path.join(bin, 'rueda.pyw') },
      { python: path.join(bin, 'pythonw.exe') },
    ];
    for (const c of cases) {
      write('lanzador.json', c);
      expect(readLauncher(dir), JSON.stringify(c)).toBeNull();
    }
    write('lanzador.json', {
      python: path.join(bin, 'pythonw.exe'),
      script: path.join(bin, 'rueda.pyw'),
    });
    expect(readLauncher(dir)).not.toBeNull();
  });

  it('polling only tells the pages when something changed', () => {
    const r = feature();
    const page = client(true);
    r.connect(page);
    r.poll();
    r.poll();
    expect(sent).toHaveLength(1);
    write('ajustes.json', { paso: 2 });
    r.poll();
    expect(sent).toHaveLength(2);
    expect(last().settings.step).toBe(2);
  });

  it('a result in words goes away by itself', async () => {
    let t = 1000;
    const r = createRueda({
      dataDir: dir,
      platform: 'win32',
      runner,
      alive: () => false,
      timers: false,
      now: () => t,
    });
    const page = client(true);
    r.connect(page);
    await r.handle({ type: 'ruedaCommand', action: 'stop' }, page);
    expect(last().message).toMatch(/apagada/);
    t += 11_000;
    r.poll();
    expect(last().message).toBeUndefined();
  });

  it('finds its folder: the variable first, then APPDATA', () => {
    expect(ruedaDir({ [RUEDA_DIR_ENV]: 'C:\\x' })).toBe('C:\\x');
    expect(ruedaDir({ APPDATA: path.join('C:', 'Roaming') })).toBe(
      path.join('C:', 'Roaming', 'rueda-volumen'),
    );
    expect(validatePatch({ toast: false })).toEqual({ ok: { aviso: false } });
  });
});
