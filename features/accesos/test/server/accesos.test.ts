import type { ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import { cleanText, localUrl, parseAccesos, readAccesosFile } from '../../server/accesosConfig.js';
import {
  checkLocalPage,
  cleanEnv,
  createAccesosFeature,
  type SpawnFn,
} from '../../server/accesosFeature.js';
import { FILE_MAX_BYTES } from '../../server/constants.js';

const homes: string[] = [];
const servers: http.Server[] = [];
const features: { dispose?: () => void }[] = [];

afterEach(async () => {
  for (const f of features.splice(0)) f.dispose?.();
  for (const s of servers.splice(0)) await new Promise((r) => s.close(() => r(null)));
  for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  homes.push(dir);
  return dir;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await wait(10);
  }
}

/** A local HTTP server on a free port; resolves with its port. */
async function localServer(handler?: http.RequestListener): Promise<number> {
  const server = http.createServer(handler ?? ((_req, res) => res.end('ok')));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return (server.address() as AddressInfo).port;
}

/** A port nobody listens on (taken and released). */
async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  await new Promise((r) => server.close(() => r(null)));
  return port;
}

/** A child process double: tests make it fail or exit. */
class FakeChild extends EventEmitter {
  pid = 4242;
  unref() {}
}

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
  child: FakeChild;
}

function setup(
  list: unknown,
  opts: {
    check?: (url: string) => Promise<boolean>;
    spawn?: SpawnFn;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const home = tempDir('accesos-home-');
  const pixel = path.join(home, '.pixel-agents');
  fs.mkdirSync(pixel, { recursive: true });
  if (list !== undefined) fs.writeFileSync(path.join(pixel, 'accesos.json'), JSON.stringify(list));
  const calls: SpawnCall[] = [];
  const spawnProcess: SpawnFn =
    opts.spawn ??
    ((command, args, options) => {
      const child = new FakeChild();
      calls.push({ command, args, options, child });
      return child as unknown as ChildProcess;
    });
  const feature = createAccesosFeature({
    home,
    platform: 'linux',
    check: opts.check ?? (async () => false),
    spawnProcess,
    env: opts.env ?? { PATH: '/usr/bin' },
    checkEveryMs: 0,
    startPollMs: 10,
    startTimeoutMs: 400,
  });
  features.push(feature);
  const client = (privileged = true) => {
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged, send: (m) => sent.push(m) };
    feature.connect?.(c);
    const last = () =>
      [...sent].reverse().find((m) => m.type === 'accesosStatus') as
        { accesos: Record<string, unknown>[]; problems: string[]; file: string } | undefined;
    return { c, sent, last };
  };
  const msg = (m: Record<string, unknown>, c: FeatureClient) => feature.handleClientMessage?.(m, c);
  return { home, pixel, feature, client, msg, calls };
}

const PAGE = (extra: Record<string, unknown> = {}) => ({
  id: 'mapa',
  nombre: 'Mapa',
  descripcion: 'Un mapa de prueba',
  url: 'http://localhost:3440/',
  ...extra,
});

describe('accesos: reading the list', () => {
  it('takes only local http addresses with a port', () => {
    expect(localUrl('http://localhost:3440/')).toBe('http://localhost:3440/');
    expect(localUrl('http://127.0.0.1:8080/mapa?x=1')).toBe('http://127.0.0.1:8080/mapa?x=1');
    for (const bad of [
      'https://localhost:3440/',
      'http://example.com:3440/',
      'http://localhost/',
      'http://user:pw@localhost:3440/',
      'http://localhost.example.com:3440/',
      'http://192.168.1.5:3440/',
      'javascript:alert(1)',
      'file:///C:/',
      'http://[::1]:3440/',
      42,
    ])
      expect(localUrl(bad)).toBeNull();
  });

  it('rejects an outside url and keeps the rest', () => {
    const { accesos, problems } = parseAccesos({
      accesos: [PAGE({ id: 'fuera', url: 'https://example.com/' }), PAGE()],
    });
    expect(accesos.map((a) => a.id)).toEqual(['mapa']);
    expect(problems.join(' ')).toMatch(/fuera/);
  });

  it('leaves out bad ids, repeated ids and non-objects, saying why', () => {
    const { accesos, problems } = parseAccesos({
      accesos: [PAGE({ id: 'Con Espacios' }), 'texto', PAGE(), PAGE({ nombre: 'Otro' })],
    });
    expect(accesos).toHaveLength(1);
    expect(problems).toHaveLength(3);
  });

  it('a file without a list, or not JSON, shows nothing and says so', () => {
    expect(parseAccesos({ paginas: [] }).problems).toHaveLength(1);
    expect(parseAccesos([]).accesos).toEqual([]);
    const dir = tempDir('accesos-file-');
    const file = path.join(dir, 'accesos.json');
    expect(readAccesosFile(file)).toEqual({ accesos: [], problems: [] });
    fs.writeFileSync(file, '{ "accesos": [ ');
    expect(readAccesosFile(file).problems[0]).toMatch(/JSON/);
    fs.writeFileSync(file, ' '.repeat(FILE_MAX_BYTES + 1));
    expect(readAccesosFile(file).problems[0]).toMatch(/grande/);
  });

  it('cleans and cuts the texts before they are shown', () => {
    expect(cleanText('  Hola\u0000\u202e mundo\n\tbonito ', 40)).toBe('Hola mundo bonito');
    expect(cleanText('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(cleanText({}, 10)).toBe('');
    const [a] = parseAccesos({
      accesos: [PAGE({ nombre: 'n'.repeat(80), descripcion: 7 })],
    }).accesos;
    expect(Array.from(a.nombre)).toHaveLength(40);
    expect(a.descripcion).toBe('');
  });

  it('drops a wrong "iniciar" but keeps the page', () => {
    const cases = [
      { comando: '', carpeta: '/tmp' },
      { comando: 'node', argumentos: 'app.mjs', carpeta: '/tmp' },
      { comando: 'node', argumentos: [1], carpeta: '/tmp' },
      { comando: 'node', carpeta: 'relativa/carpeta' },
      'node app.mjs',
    ];
    for (const iniciar of cases) {
      const { accesos, problems } = parseAccesos({ accesos: [PAGE({ iniciar })] }, 'linux');
      expect(accesos[0].iniciar).toBeUndefined();
      expect(problems).toHaveLength(1);
    }
    const cmd = parseAccesos(
      { accesos: [PAGE({ iniciar: { comando: 'npm.cmd', carpeta: 'C:\\x' } })] },
      'win32',
    );
    expect(cmd.accesos[0].iniciar).toBeUndefined();
    expect(cmd.problems[0]).toMatch(/\.exe/);
    const ok = parseAccesos(
      {
        accesos: [
          PAGE({ iniciar: { comando: 'node', argumentos: ['app/s.mjs'], carpeta: '/srv/x' } }),
        ],
      },
      'linux',
    );
    expect(ok.accesos[0].iniciar).toEqual({
      comando: 'node',
      argumentos: ['app/s.mjs'],
      carpeta: '/srv/x',
    });
  });
});

describe('accesos: who sees and starts', () => {
  it('a client without the office key gets nothing and cannot start', async () => {
    const folder = tempDir('accesos-run-');
    const { client, msg, calls } = setup({
      accesos: [PAGE({ iniciar: { comando: 'node', carpeta: folder } })],
    });
    const guest = client(false);
    expect(msg({ type: 'webviewReady' }, guest.c)).toBe(false);
    expect(msg({ type: 'accesosOpen' }, guest.c)).toBe(true);
    expect(msg({ type: 'accesosStart', id: 'mapa' }, guest.c)).toBe(true);
    await wait(50);
    expect(guest.sent).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('a tokened client gets the list, without the command, and whether each page answers', async () => {
    const folder = tempDir('accesos-run-');
    const { client, msg, feature } = setup(
      {
        accesos: [
          PAGE({ iniciar: { comando: 'node', argumentos: ['s.mjs'], carpeta: folder } }),
          PAGE({ id: 'otra', nombre: 'Otra', url: 'http://127.0.0.1:5000/' }),
        ],
      },
      { check: async (url) => url.includes('5000') },
    );
    const owner = client();
    msg({ type: 'webviewReady' }, owner.c);
    expect(owner.last()?.accesos.map((a) => a.state)).toEqual(['unknown', 'unknown']);
    await feature.refresh();
    const status = owner.last();
    expect(status?.accesos.map((a) => [a.id, a.state, a.canStart])).toEqual([
      ['mapa', 'off', true],
      ['otra', 'on', false],
    ]);
    expect(JSON.stringify(status)).not.toMatch(/s\.mjs|"comando"|iniciar/);
    expect(status?.file).toMatch(/accesos\.json$/);
  });
});

describe('accesos: starting a page', () => {
  it('runs the command of the file, not one from the message, without a shell or the office secrets', async () => {
    const folder = tempDir('accesos-run-');
    let up = false;
    const { client, msg, calls } = setup(
      {
        accesos: [
          PAGE({ iniciar: { comando: 'node', argumentos: ['app/s.mjs'], carpeta: folder } }),
        ],
      },
      {
        check: async () => up,
        env: {
          PATH: '/bin',
          PIXEL_AGENTS_TOKEN: 'x',
          MY_API_KEY: 'y',
          CLAUDECODE: '1',
          LANG: 'es',
        },
      },
    );
    const owner = client();
    msg(
      {
        type: 'accesosStart',
        id: 'mapa',
        comando: 'calc.exe',
        iniciar: { comando: 'calc.exe', carpeta: 'C:\\' },
      },
      owner.c,
    );
    await until(() => calls.length === 1);
    const [call] = calls;
    expect(call.command).toBe('node');
    expect(call.args).toEqual(['app/s.mjs']);
    expect(call.options).toMatchObject({ cwd: folder, shell: false, detached: true });
    expect(call.options.env).toEqual({ PATH: '/bin', LANG: 'es' });
    expect(owner.last()?.accesos[0].state).toBe('starting');
    up = true;
    await until(() => owner.last()?.accesos[0].state === 'on');
  });

  it('starts once even when asked twice, and not at all when it is already on', async () => {
    const folder = tempDir('accesos-run-');
    let up = false;
    const { client, msg, calls, feature } = setup(
      { accesos: [PAGE({ iniciar: { comando: 'node', carpeta: folder } })] },
      { check: async () => up },
    );
    const owner = client();
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    await until(() => calls.length === 1);
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    await wait(60);
    expect(calls).toHaveLength(1);
    expect(feature.isStarting('mapa')).toBe(true);
    up = true;
    await until(() => !feature.isStarting('mapa'));
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    await wait(60);
    expect(calls).toHaveLength(1);
    expect(owner.last()?.accesos[0].state).toBe('on');
  });

  it('a command that is not found, or ends with an error, says so and stops waiting', async () => {
    const folder = tempDir('accesos-run-');
    const { client, msg, calls, feature } = setup({
      accesos: [
        PAGE({ iniciar: { comando: 'no-existe', carpeta: folder } }),
        PAGE({
          id: 'falla',
          url: 'http://localhost:3441/',
          iniciar: { comando: 'node', carpeta: folder },
        }),
      ],
    });
    const owner = client();
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    msg({ type: 'accesosStart', id: 'falla' }, owner.c);
    await until(() => calls.length === 2);
    const err = Object.assign(new Error('spawn no-existe ENOENT'), { code: 'ENOENT' });
    calls[0].child.emit('error', err);
    calls[1].child.emit('exit', 1, null);
    await until(() => !feature.isStarting('mapa') && !feature.isStarting('falla'));
    const [mapa, falla] = owner.last()!.accesos;
    expect(mapa).toMatchObject({ state: 'off', error: expect.stringMatching(/no-existe/) });
    expect(falla).toMatchObject({ state: 'off', error: expect.stringMatching(/código 1/) });
  });

  it('gives up when the page never answers, and refuses a folder that does not exist', async () => {
    const folder = tempDir('accesos-run-');
    const { client, msg, calls, feature } = setup({
      accesos: [
        PAGE({ iniciar: { comando: 'node', carpeta: folder } }),
        PAGE({
          id: 'sin-carpeta',
          url: 'http://localhost:3442/',
          iniciar: { comando: 'node', carpeta: path.join(folder, 'no-esta') },
        }),
        PAGE({ id: 'sin-iniciar', url: 'http://localhost:3443/' }),
      ],
    });
    const owner = client();
    msg({ type: 'accesosStart', id: 'sin-carpeta' }, owner.c);
    msg({ type: 'accesosStart', id: 'sin-iniciar' }, owner.c);
    msg({ type: 'accesosStart', id: 'no-esta-en-la-lista' }, owner.c);
    msg({ type: 'accesosStart', id: 'mapa' }, owner.c);
    await until(() => !feature.isStarting('mapa') && calls.length === 1, 3000);
    const byId = Object.fromEntries(owner.last()!.accesos.map((a) => [a.id, a]));
    expect(byId['mapa'].error).toMatch(/No contestó/);
    expect(byId['sin-carpeta'].error).toMatch(/No existe la carpeta/);
    expect(byId['sin-iniciar'].error).toMatch(/no dice cómo/);
    expect(calls.map((c) => c.options.cwd)).toEqual([folder]);
  });

  it('really starts a page apart from the office and sees it answer', async () => {
    const folder = tempDir('accesos-run-');
    const port = await freePort();
    // A tiny page: answers with the names of its environment variables, and ends on /salir (or after 15 s)
    fs.writeFileSync(
      path.join(folder, 'pagina.cjs'),
      `const http = require('http');
       const s = http.createServer((req, res) => {
         res.end(JSON.stringify(Object.keys(process.env)));
         if (req.url === '/salir') { s.close(); process.exit(0); }
       });
       s.listen(${port}, '127.0.0.1');
       setTimeout(() => process.exit(0), 15000).unref();`,
    );
    const home = tempDir('accesos-home-');
    fs.mkdirSync(path.join(home, '.pixel-agents'));
    fs.writeFileSync(
      path.join(home, '.pixel-agents', 'accesos.json'),
      JSON.stringify({
        accesos: [
          PAGE({
            url: `http://127.0.0.1:${port}/`,
            iniciar: { comando: process.execPath, argumentos: ['pagina.cjs'], carpeta: folder },
          }),
        ],
      }),
    );
    const feature = createAccesosFeature({
      home,
      checkEveryMs: 0,
      startPollMs: 100,
      startTimeoutMs: 8000,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PIXEL_AGENTS_TOKEN: 'secreto',
        SOME_SECRET: 'x',
      },
    });
    features.push(feature);
    const sent: Record<string, unknown>[] = [];
    const c: FeatureClient = { privileged: true, send: (m) => sent.push(m) };
    feature.connect?.(c);
    feature.handleClientMessage?.({ type: 'accesosStart', id: 'mapa' }, c);
    const state = () =>
      (
        [...sent].reverse().find((m) => m.type === 'accesosStatus') as
          { accesos: { state: string }[] } | undefined
      )?.accesos[0].state;
    await until(() => state() === 'on', 9000);
    const keys = await new Promise<string[]>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/salir`, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => resolve(JSON.parse(body)));
        })
        .on('error', reject);
    });
    const upper = keys.map((k) => k.toUpperCase());
    expect(upper).not.toContain('PIXEL_AGENTS_TOKEN');
    expect(upper).not.toContain('SOME_SECRET');
    expect(fs.existsSync(path.join(home, '.pixel-agents', 'accesos-logs', 'mapa.log'))).toBe(true);
    // The page ended (its folder can be removed once it is gone)
    let gone = false;
    for (let i = 0; i < 50 && !gone; i++) {
      gone = !(await checkLocalPage(`http://127.0.0.1:${port}/`, 200));
      if (!gone) await wait(50);
    }
    expect(gone).toBe(true);
    await wait(300);
  }, 15000);
});

describe('accesos: is the page on?', () => {
  it('asks only local addresses, with a time limit', async () => {
    const port = await localServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    expect(await checkLocalPage(`http://127.0.0.1:${port}/`)).toBe(true);
    expect(await checkLocalPage(`http://localhost:${port}/`)).toBe(true);
    expect(await checkLocalPage(`http://127.0.0.1:${await freePort()}/`)).toBe(false);
    expect(await checkLocalPage('http://example.com:80/')).toBe(false);
    const slow = await localServer(() => {
      /* never answers */
    });
    const t0 = Date.now();
    expect(await checkLocalPage(`http://127.0.0.1:${slow}/`, 200)).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('the environment of a started page leaves out the office and anything secret', () => {
    expect(
      cleanEnv({
        PATH: 'p',
        pixel_agents_port: '1',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ANTHROPIC_API_KEY: 'k',
        GITHUB_TOKEN: 't',
        DB_PASSWORD: 'p',
        LANG: 'es',
      }),
    ).toEqual({ PATH: 'p', LANG: 'es' });
  });
});
