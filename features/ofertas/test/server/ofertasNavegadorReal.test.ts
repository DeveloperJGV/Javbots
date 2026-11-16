/**
 * The real browser (Edge or Chrome of this machine) against a small HTTP server on 127.0.0.1: no internet, no store.
 * It opens a browser, so it only runs when asked (OFERTAS_NAVEGADOR_REAL=1) and a browser is installed:
 *
 *   OFERTAS_NAVEGADOR_REAL=1 npm run test:server -- ofertasNavegadorReal
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { realLauncher, windowsTool } from '../../server/vigia/navegador/arranque.js';
import { findBrowser } from '../../server/vigia/navegador/buscar.js';
import { createLector, type Lector, profilesDir } from '../../server/vigia/navegador/lector.js';
import { readPage } from '../../server/vigia/navegador/pagina.js';
import { fetchText } from '../../server/vigia/sources/http.js';
import { SourceBlocked, SourceReadError } from '../../server/vigia/types.js';

const RUN = process.env.OFERTAS_NAVEGADOR_REAL === '1' && findBrowser() !== undefined;

describe.skipIf(!RUN)('ofertas: the real browser against a local server', () => {
  let server: http.Server;
  let base: string;
  let home: string;
  let lector: Lector;
  const seen: string[] = [];

  beforeAll(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertas-navegador-real-'));
    server = http.createServer((req, res) => {
      seen.push(`${req.headers.host}${req.url}`);
      const port = (server.address() as AddressInfo).port;
      if (req.url === '/buscar') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(
          '<html><body><p>Resultados</p>' +
            `<iframe src="http://localhost:${port}/marco"></iframe>` +
            "<script>document.body.insertAdjacentHTML('beforeend','<p id=\"pintado\">$1,299</p>')</script>" +
            '</body></html>',
        );
      } else if (req.url === '/marco') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<p>marco</p>');
      } else if (req.url === '/json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[{"productName":"Bocina"}]');
      } else if (req.url === '/fuera') {
        res.writeHead(302, { location: `http://localhost:${port}/trampa` });
        res.end();
      } else if (req.url === '/entrar') {
        res.writeHead(302, { location: '/ap/signin?x=1' });
        res.end();
      } else if (req.url?.startsWith('/ap/signin')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<form>Inicia sesión</form>');
      } else if (req.url === '/prohibido') {
        res.writeHead(403, { 'content-type': 'text/html' });
        res.end('<p>no</p>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The tests run with an empty user folder (isolateHome): the very first start of the browser never answers and
    // the launcher's own retry has to get it going (part of what this checks)
    lector = createLector({ home, random: () => 0, plainHttpForTests: true });
  }, 30_000);

  afterAll(async () => {
    await lector?.close();
    await new Promise<void>((r) => server.close(() => r()));
    fs.rmSync(home, { recursive: true, force: true });
    // The browser also writes in the user folder; here it is the throwaway one of isolateHome: clean it, only it
    const userHome = process.env.USERPROFILE ?? '';
    if (
      path.dirname(userHome) === path.resolve(os.tmpdir()) &&
      path.basename(userHome).startsWith('pxl-test-home-')
    ) {
      for (let i = 0; i < 10; i++) {
        try {
          fs.rmSync(path.join(userHome, 'AppData'), { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }, 60_000);

  const f = () => lector.fetchFor(['127.0.0.1']);

  it('reads the drawn HTML (what the page script added) and the status', async () => {
    const turn = await lector.turn();
    try {
      const { status, text } = await fetchText(f(), `${base}/buscar`);
      expect(status).toBe(200);
      expect(text).toContain('id="pintado"');
      expect(text).toContain('$1,299');
      // The frame on another host loaded (a resource of the page)
      expect(seen.some((s) => s.startsWith('localhost:') && s.endsWith('/marco'))).toBe(true);
    } finally {
      turn.release();
    }
  }, 60_000);

  it('a JSON document comes back raw', async () => {
    const { text } = await fetchText(f(), `${base}/json`);
    expect(JSON.parse(text)).toEqual([{ productName: 'Bocina' }]);
  }, 60_000);

  it('a redirect to another host is cut before it leaves', async () => {
    const before = seen.length;
    const err = await fetchText(f(), `${base}/fuera`).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceReadError);
    expect((err as Error).message).toBe('La tienda mandó a otro sitio');
    expect(seen.slice(before).some((s) => s.includes('/trampa'))).toBe(false);
  }, 60_000);

  it('a sign-in page and a 403 are blocks', async () => {
    await expect(fetchText(f(), `${base}/entrar`)).rejects.toBeInstanceOf(SourceBlocked);
    await expect(fetchText(f(), `${base}/prohibido`)).rejects.toBeInstanceOf(SourceBlocked);
  }, 60_000);

  it('closes when idle: no profile left', async () => {
    await new Promise((r) => setTimeout(r, 8000));
    expect(lector.open).toBe(false);
    expect(fs.existsSync(profilesDir(home)) ? fs.readdirSync(profilesDir(home)) : []).toEqual([]);
  }, 30_000);

  it('the launcher itself: no port and no port file, no account signed in, and its process exits on close', async () => {
    const profile = fs.mkdtempSync(path.join(home, 'perfil-'));
    const proc = await realLauncher()(profile);
    try {
      const version = await proc.cdp.send('Browser.getVersion');
      expect(String(version.product)).toMatch(/Edg|Chrome/);
      // The pipe: nothing written for others to find, nothing listening
      expect(fs.existsSync(path.join(profile, 'DevToolsActivePort'))).toBe(false);
      if (process.platform === 'win32') {
        const out = spawnSync(
          windowsTool('WindowsPowerShell', 'v1.0', 'powershell.exe'),
          [
            '-NoProfile',
            '-Command',
            `$ids = @(${proc.pid}) + @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${proc.pid}" | ForEach-Object { $_.ProcessId }); @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess }).Count`,
          ],
          { encoding: 'utf8', windowsHide: true },
        );
        expect(out.stdout.trim()).toBe('0');
      }
      // A read, then: did the profile get the Windows or Microsoft account signed in?
      const res = await readPage(
        proc.cdp,
        `${base}/buscar`,
        { hosts: ['127.0.0.1'], plainHttpForTests: true },
        { timeoutMs: 30_000, settleMs: 1000 },
      );
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 3000));
      const prefsFile = path.join(profile, 'Default', 'Preferences');
      const prefs = fs.existsSync(prefsFile)
        ? (JSON.parse(fs.readFileSync(prefsFile, 'utf8')) as Record<string, unknown>)
        : {};
      const accounts = (prefs.account_info as unknown[] | undefined) ?? [];
      // Only the count is looked at: the account data itself is never printed nor kept
      expect(accounts).toEqual([]);
    } finally {
      await proc.cdp.send('Browser.close').catch(() => undefined);
      proc.cdp.close();
      if (!(await proc.waitExit(5000))) proc.killTree();
      expect(await proc.waitExit(5000)).toBe(true);
      for (let i = 0; i < 10; i++) {
        try {
          fs.rmSync(profile, { recursive: true, force: true });
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    expect(proc.pid).toBeGreaterThan(0);
    let alive = true;
    try {
      process.kill(proc.pid!, 0);
    } catch {
      alive = false;
    }
    expect(alive).toBe(false);
  }, 90_000);
});
