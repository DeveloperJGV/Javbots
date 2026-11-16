import { spawnSync } from 'child_process';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HELP_TEXT, parseArgs } from '../../server/vigia/consolaArgs.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(here, '../../server/vigia/consola.ts');

describe('ofertas: the console program options', () => {
  it('reads --help, -h and the rest', () => {
    expect(parseArgs(['--help'], '/h')).toMatchObject({ help: true, unknown: [] });
    expect(parseArgs(['-h'], '/h').help).toBe(true);
    expect(parseArgs(['--una-vez', '--home', '/otra'], '/h')).toMatchObject({
      once: true,
      home: '/otra',
      help: false,
    });
    expect(parseArgs(['--buscar', 'audifonos'], '/h').search).toBe('audifonos');
    expect(parseArgs(['--ayuda'], '/h').unknown).toEqual(['--ayuda']);
  });

  it('the help wins anywhere, and a value that starts with "-" is not a value', () => {
    expect(parseArgs(['--home', '--help'], '/h')).toMatchObject({ help: true, home: '/h' });
    expect(parseArgs(['--buscar', '--help'], '/h')).toMatchObject({ help: true });
    expect(parseArgs(['--buscar', '--help'], '/h').search).toBeUndefined();
    expect(parseArgs(['--una-vez', '-h'], '/h').help).toBe(true);
    expect(parseArgs(['--una-vez', '/?'], '/h').help).toBe(true);
    expect(parseArgs(['--home', '--una-vez'], '/h')).toMatchObject({
      help: false,
      home: '/h',
      unknown: ['--home'],
    });
    expect(parseArgs(['--buscar', '-x'], '/h').unknown).toEqual(['--buscar', '-x']);
    expect(parseArgs(['--buscar'], '/h').unknown).toEqual(['--buscar']);
  });

  it('the help tells the truth about what writes', () => {
    expect(HELP_TEXT).toContain('solo --help y --buscar no escriben');
    expect(HELP_TEXT).toContain('--una-vez y la vigilancia sin opciones ESCRIBEN');
  });
});

/**
 * The real program, bundled into a temp folder (never dist/) and run with HOME and USERPROFILE in another temp
 * folder holding an ofertas.json: --help must print and leave that file exactly as it was.
 */
describe('ofertas: --help never touches ofertas.json', () => {
  let dir: string;
  let bundle: string;
  let home: string;
  let file: string;
  const original = '{"version":1,"busquedas":[{"id":"x","query":"algo"}]}\n';

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-ofertas-consola-'));
    bundle = path.join(dir, 'ofertas-vigia.cjs');
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: bundle,
      logLevel: 'silent',
    });
    home = path.join(dir, 'home');
    file = path.join(home, '.pixel-agents', 'ofertas.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, original);
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [bundle, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: 'utf-8',
      timeout: 20_000,
    });

  for (const flags of [
    ['--help'],
    ['-h'],
    ['--home', '--help'],
    ['--buscar', '--help'],
    ['--una-vez', '/?'],
  ]) {
    it(`${flags.join(' ')} prints the help and exits at once`, () => {
      const before = fs.statSync(file).mtimeMs;
      const r = run(...flags);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain(HELP_TEXT.split('\n')[0]);
      expect(r.stdout).toContain('--una-vez');
      expect(fs.readFileSync(file, 'utf-8')).toBe(original);
      expect(fs.statSync(file).mtimeMs).toBe(before);
      expect(fs.readdirSync(path.dirname(file))).toEqual(['ofertas.json']);
    });
  }

  it('an option it does not know prints the help with exit code 2, touching nothing', () => {
    const r = run('--ayuda');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--ayuda');
    expect(r.stdout).toContain('--help');
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['ofertas.json']);
  });

  it('--home with a value that starts with "-" is the help with exit code 2, touching nothing', () => {
    const r = run('--home', '--una-vez');
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('--help');
    expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['ofertas.json']);
  });
});
