/**
 * "Leer con el navegador" without a real browser and without network: a fake browser answers the debugging protocol
 * (CDP) over a fake socket, so the real client, the real page reading (Fetch pauses, redirects, the HTML read), the
 * real queue and the real profile folder all run. Time is fake (vitest timers): the pauses of 20–40 s cost nothing.
 */
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NAVEGADOR_HARD_LIFE_MS,
  NAVEGADOR_MAX_BODY,
  NAVEGADOR_MAX_LIFE_MS,
  NAVEGADOR_PAGE_TIMEOUT_MS,
  NAVEGADOR_PAUSE_MIN_MS,
  NAVEGADOR_STALE_PROFILE_MS,
  SOURCE_TIMEOUT_MS,
} from '../../server/vigia/constants.js';
import type { Launcher } from '../../server/vigia/navegador/arranque.js';
import { browserArgs, realLauncher, windowsTool } from '../../server/vigia/navegador/arranque.js';
import { browserCandidates, findBrowser } from '../../server/vigia/navegador/buscar.js';
import { type CdpSocket, cdpOver, pipeSocket } from '../../server/vigia/navegador/cdp.js';
import { orphans } from '../../server/vigia/navegador/huerfanos.js';
import {
  type ProcessInfo,
  type ProcessTools,
  profileFromCommand,
} from '../../server/vigia/navegador/huerfanos.js';
import { createLector, type Lector, profilesDir } from '../../server/vigia/navegador/lector.js';
import { allowedHost, READ_EXPRESSION } from '../../server/vigia/navegador/pagina.js';
import { fetchText } from '../../server/vigia/sources/http.js';
import { createSources } from '../../server/vigia/sources/index.js';
import { ofertasPath, wordList } from '../../server/vigia/storage.js';
import type { Source, SourceOptions } from '../../server/vigia/types.js';
import { SourceBlocked, SourceInterrupted, SourceReadError } from '../../server/vigia/types.js';
import { createVigia } from '../../server/vigia/vigia.js';

const SAMPLES = path.join(__dirname, '..', 'muestras');
const sample = (name: string) => fs.readFileSync(path.join(SAMPLES, name), 'utf8');
const QUERY = 'audifonos bluetooth';

// ── The fake browser ─────────────────────────────────────────────────────────

/** What the fake browser shows for a URL. */
interface FakePage {
  status?: number;
  mime?: string;
  body?: string;
  /** The server answers with a redirect to this URL (Fetch pauses again on it). */
  redirect?: string;
  /** Where the page ends after it loads (location.href), when not the URL itself. */
  href?: string;
  /** Milliseconds until the load event; Infinity = never loads. */
  loadMs?: number;
  /** A frame inside the page, on another host. */
  iframe?: string;
  /** After its first answer the page reloads itself and the second answer is a 200 (a challenge that passes). */
  thenOk?: boolean;
  /** The page opens a new window of its own (a popup). */
  popup?: boolean;
  /** The tab crashes instead of answering. */
  crash?: boolean;
  /** The whole browser dies instead of answering. */
  die?: boolean;
}

interface Command {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
  at: number;
}

class FakeBrowser {
  site: (url: string) => FakePage = () => ({ body: '<html><body>hola</body></html>' });
  commands: Command[] = [];
  launches = 0;
  profiles: string[] = [];
  kills = 0;
  /** false = Browser.close is ignored (a hung browser): only killing it ends it. */
  closesWhenAsked = true;
  /** An account signed in to the profile: from the start, after the first page, or a file that cannot be read. */
  account: 'none' | 'atLaunch' | 'afterPage' | 'garbage' = 'none';
  private profile = '';

  private writePrefs(text: string): void {
    fs.mkdirSync(path.join(this.profile, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(this.profile, 'Default', 'Preferences'), text);
  }

  private signIn(): void {
    this.writePrefs(JSON.stringify({ account_info: [{ account_id: 'cuenta-de-prueba' }] }));
  }
  private alive = false;
  private exitWaiters: Array<() => void> = [];
  private socket: CdpSocket | undefined;
  private n = 0;
  private nav = new Map<string, { url: string; frame: string }>();

  get running(): boolean {
    return this.alive;
  }

  sent(method: string): Command[] {
    return this.commands.filter((c) => c.method === method);
  }

  private exit(): void {
    if (!this.alive) return;
    this.alive = false;
    const s = this.socket;
    queueMicrotask(() => s?.onclose?.({}));
    for (const w of this.exitWaiters.splice(0)) w();
  }

  launcher: Launcher = async (profile) => {
    this.launches++;
    this.profiles.push(profile);
    // Like a real profile: files appear in it
    fs.writeFileSync(path.join(profile, 'Local State'), '{}');
    this.profile = profile;
    if (this.account === 'atLaunch') this.signIn();
    else if (this.account === 'garbage') this.writePrefs('{ a medio escribir');
    else this.writePrefs(JSON.stringify({ account_info: [] }));
    this.alive = true;
    const socket: CdpSocket = {
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: (data) =>
        this.handle(
          JSON.parse(data) as {
            id: number;
            method: string;
            params: Record<string, unknown>;
            sessionId?: string;
          },
        ),
      close: () => undefined,
    };
    this.socket = socket;
    return {
      cdp: cdpOver(socket),
      pid: 4242,
      waitExit: (ms) =>
        !this.alive
          ? Promise.resolve(true)
          : new Promise<boolean>((resolve) => {
              const t = setTimeout(() => resolve(!this.alive), ms);
              this.exitWaiters.push(() => {
                clearTimeout(t);
                resolve(true);
              });
            }),
      killTree: () => {
        this.kills++;
        this.exit();
      },
      killTreeSync: () => {
        this.kills++;
        this.exit();
      },
    };
  };

  private reply(id: number, result: Record<string, unknown>): void {
    const s = this.socket;
    queueMicrotask(() => s?.onmessage?.({ data: JSON.stringify({ id, result }) }));
  }

  private discovering = false;

  private emitBrowser(method: string, params: Record<string, unknown>): void {
    const s = this.socket;
    queueMicrotask(() => s?.onmessage?.({ data: JSON.stringify({ method, params }) }));
  }

  private emit(method: string, params: Record<string, unknown>, sessionId: string): void {
    const s = this.socket;
    queueMicrotask(() => s?.onmessage?.({ data: JSON.stringify({ method, params, sessionId }) }));
  }

  private respond(sessionId: string): void {
    const nav = this.nav.get(sessionId)!;
    const page = this.site(nav.url);
    if (page.crash) {
      this.emit('Inspector.targetCrashed', {}, sessionId);
      return;
    }
    if (page.die) {
      this.exit(); // the whole browser dies by itself
      return;
    }
    if (page.redirect) {
      nav.url = page.redirect;
      this.emit(
        'Fetch.requestPaused',
        { requestId: 'R', request: { url: nav.url }, frameId: nav.frame, resourceType: 'Document' },
        sessionId,
      );
      return;
    }
    this.emit(
      'Network.responseReceived',
      {
        requestId: 'R',
        type: 'Document',
        frameId: nav.frame,
        response: { status: page.status ?? 200, url: nav.url, mimeType: page.mime ?? 'text/html' },
      },
      sessionId,
    );
    if (page.thenOk) {
      this.emit(
        'Network.responseReceived',
        {
          requestId: 'R2',
          type: 'Document',
          frameId: nav.frame,
          response: { status: 200, url: nav.url, mimeType: 'text/html' },
        },
        sessionId,
      );
    }
    this.emit(
      'Network.loadingFinished',
      { requestId: 'R', encodedDataLength: (page.body ?? '').length },
      sessionId,
    );
    const loadMs = page.loadMs ?? 0;
    if (loadMs !== Infinity) {
      setTimeout(() => this.emit('Page.loadEventFired', {}, sessionId), loadMs);
    }
  }

  private handle(m: {
    id: number;
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
  }): void {
    this.commands.push({
      method: m.method,
      params: m.params,
      sessionId: m.sessionId,
      at: Date.now(),
    });
    const sid = m.sessionId ?? '';
    switch (m.method) {
      case 'Target.createTarget':
        this.n++;
        // Like the real one: the "created" event may come before the answer that names it
        if (this.discovering)
          this.emitBrowser('Target.targetCreated', {
            targetInfo: { targetId: `T${this.n}`, type: 'page' },
          });
        return this.reply(m.id, { targetId: `T${this.n}` });
      case 'Target.getTargets':
        return this.reply(m.id, { targetInfos: [{ targetId: 'INICIAL', type: 'page' }] });
      case 'Target.setDiscoverTargets':
        this.discovering = true;
        return this.reply(m.id, {});
      case 'Target.attachToTarget':
        return this.reply(m.id, { sessionId: `S${String(m.params.targetId).slice(1)}` });
      case 'Page.getFrameTree':
        return this.reply(m.id, { frameTree: { frame: { id: `F${sid.slice(1)}` } } });
      case 'Page.navigate': {
        const url = String(m.params.url);
        const frame = `F${sid.slice(1)}`;
        this.nav.set(sid, { url, frame });
        if (this.account === 'afterPage') this.signIn();
        this.reply(m.id, { frameId: frame });
        const page = this.site(url);
        if (page.popup) {
          this.emitBrowser('Target.targetCreated', {
            targetInfo: { targetId: 'POPUP', type: 'page' },
          });
        }
        if (page.iframe) {
          this.emit(
            'Fetch.requestPaused',
            {
              requestId: 'RI',
              request: { url: page.iframe },
              frameId: 'hijo',
              resourceType: 'Document',
            },
            sid,
          );
        }
        this.emit(
          'Fetch.requestPaused',
          { requestId: 'R', request: { url }, frameId: frame, resourceType: 'Document' },
          sid,
        );
        return;
      }
      case 'Fetch.continueRequest':
        this.reply(m.id, {});
        if (m.params.requestId === 'R') this.respond(sid);
        return;
      case 'Runtime.evaluate': {
        const nav = this.nav.get(sid)!;
        const page = this.site(nav.url);
        const html = page.body ?? '';
        // What the fixed expression does: no HTML when it is bigger than the limit
        return this.reply(m.id, {
          result: {
            value:
              html.length > NAVEGADOR_MAX_BODY
                ? { href: page.href ?? nav.url, tooBig: true }
                : { href: page.href ?? nav.url, html },
          },
        });
      }
      case 'Network.getResponseBody': {
        const nav = this.nav.get(sid)!;
        return this.reply(m.id, { body: this.site(nav.url).body ?? '', base64Encoded: false });
      }
      case 'Browser.close':
        if (!this.closesWhenAsked) return; // hangs: never answers
        this.reply(m.id, {});
        queueMicrotask(() => this.exit());
        return;
      default:
        return this.reply(m.id, {});
    }
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

let home: string;
let browser: FakeBrowser;
let lectores: Lector[];

let hangups = 0;

function lector(extra: { launch?: Launcher; processes?: ProcessTools | null } = {}): Lector {
  const l = createLector({
    home,
    launch: extra.launch ?? browser.launcher,
    random: () => 0,
    // No real process listing in these tests (it would start PowerShell)
    processes: extra.processes ?? null,
    hangup: () => {
      hangups++;
    },
  });
  lectores.push(l);
  return l;
}

/** Runs a promise while the fake clock moves, then returns its outcome. */
async function settle<T>(p: Promise<T>, ms = 5 * 60_000): Promise<T> {
  let done = false;
  const out = p.finally(() => {
    done = true;
  });
  out.catch(() => undefined);
  for (let t = 0; t < ms && !done; t += 500) await vi.advanceTimersByTimeAsync(500);
  return out;
}

const profiles = () => {
  try {
    return fs.readdirSync(profilesDir(home));
  } catch {
    return [];
  }
};

beforeEach(() => {
  hangups = 0;
  vi.useFakeTimers({ now: new Date(2026, 10, 20, 9, 0) });
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertas-navegador-'));
  browser = new FakeBrowser();
  lectores = [];
});

afterEach(async () => {
  for (const l of lectores) await settle(l.close());
  vi.useRealTimers();
  fs.rmSync(home, { recursive: true, force: true });
});

// ── The page reader ─────────────────────────────────────────────────────────

describe('ofertas: reading a page with the browser', () => {
  it('gives the status and the drawn HTML, in a profile under the given home, deleted when it closes', async () => {
    browser.site = () => ({ body: '<html><body><p>Precio $1,299</p></body></html>' });
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const res = await settle(f('https://www.tienda.example/buscar?q=x'));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Precio $1,299');
    // The only expression evaluated is ours
    expect(browser.sent('Runtime.evaluate').map((c) => c.params.expression)).toEqual([
      READ_EXPRESSION,
    ]);
    // The profile lived inside <home>/.pixel-agents/ofertas-navegador/
    expect(path.dirname(browser.profiles[0]!)).toBe(
      path.join(home, '.pixel-agents', 'ofertas-navegador'),
    );
    // Nobody else waits: the browser closed and its profile is gone
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.sent('Browser.close')).toHaveLength(1);
    expect(browser.running).toBe(false);
    expect(l.open).toBe(false);
    expect(profiles()).toEqual([]);
    expect(browser.sent('Target.closeTarget')).toHaveLength(1);
    // Downloads are denied; nothing changes the browser's identity
    expect(browser.sent('Browser.setDownloadBehavior')[0]!.params).toEqual({ behavior: 'deny' });
    expect(browser.commands.some((c) => /UserAgent|setExtraHTTPHeaders/.test(c.method))).toBe(
      false,
    );
  });

  it('a document that is not HTML (a store JSON) comes back raw, not drawn', async () => {
    browser.site = () => ({ mime: 'application/json', body: '[{"productName":"X"}]' });
    const f = lector().fetchFor(['www.tienda.example']);
    const res = await settle(f('https://www.tienda.example/api?q=x'));
    expect(await res.text()).toBe('[{"productName":"X"}]');
    expect(browser.sent('Runtime.evaluate')).toHaveLength(0);
    expect(browser.sent('Network.getResponseBody')).toHaveLength(1);
  });

  it('a redirect of the main document to another host is cut before it leaves; frames inside the page load', async () => {
    browser.site = (url) =>
      url.startsWith('https://www.tienda.example/')
        ? { redirect: 'https://otro.example/trampa', iframe: 'https://anuncios.example/marco' }
        : { body: 'nunca' };
    const f = lector().fetchFor(['www.tienda.example']);
    const err = await settle(f('https://www.tienda.example/buscar?q=x')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceReadError);
    expect((err as Error).message).toBe('La tienda mandó a otro sitio');
    const failed = browser.sent('Fetch.failRequest');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.params.requestId).toBe('R');
    // The frame of another host was let through (a resource of the page, not the page)
    expect(browser.sent('Fetch.continueRequest').map((c) => c.params.requestId)).toContain('RI');
    // Only document requests are paused, before they leave
    expect(browser.sent('Fetch.enable')[0]!.params).toEqual({
      patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
    });
    expect(browser.sent('Target.closeTarget')).toHaveLength(1);
  });

  it('a URL outside the list is never opened; only GET', async () => {
    const f = lector().fetchFor(['www.tienda.example']);
    await expect(settle(f('https://otro.example/'))).rejects.toThrow(
      'La tienda mandó a otro sitio',
    );
    await expect(
      settle(f('https://www.tienda.example/', { method: 'POST', body: 'x' })),
    ).rejects.toThrow('El navegador solo abre páginas');
    expect(browser.sent('Page.navigate')).toHaveLength(0);
  });

  it('a sign-in page on the store host is a block; a 403 is a block through fetchText; neither is retried', async () => {
    browser.site = () => ({
      href: 'https://www.tienda.example/ap/signin?openid=x',
      body: '<form>',
    });
    const f = lector().fetchFor(['www.tienda.example']);
    const login = await settle(fetchText(f, 'https://www.tienda.example/s?k=x')).catch(
      (e: unknown) => e,
    );
    expect(login).toBeInstanceOf(SourceBlocked);
    expect((login as Error).message).toBe('La tienda pidió iniciar sesión');

    browser.site = () => ({ status: 403, body: '<html>Access denied</html>' });
    const denied = await settle(fetchText(f, 'https://www.tienda.example/s?k=x')).catch(
      (e: unknown) => e,
    );
    expect(denied).toBeInstanceOf(SourceBlocked);
    expect(browser.sent('Page.navigate')).toHaveLength(2);
  });

  it('a refusal stays a refusal even if the page reloads itself into a 200', async () => {
    browser.site = () => ({ status: 503, thenOk: true, body: '<html>ok ya</html>' });
    const f = lector().fetchFor(['www.tienda.example']);
    const err = await settle(fetchText(f, 'https://www.tienda.example/s?k=x')).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SourceBlocked);
  });

  it('only https and no port; plain http and a port only when a test builds the reader that way', async () => {
    const allow = { hosts: ['www.tienda.example'] };
    expect(allowedHost('https://www.tienda.example/a', allow)).toBe(true);
    expect(allowedHost('http://www.tienda.example/a', allow)).toBe(false);
    expect(allowedHost('https://www.tienda.example:8443/a', allow)).toBe(false);
    expect(allowedHost('file:///C:/secreto.txt', allow)).toBe(false);
    expect(
      allowedHost('http://www.tienda.example:81/a', { ...allow, plainHttpForTests: true }),
    ).toBe(true);
    const f = lector().fetchFor(['www.tienda.example']);
    await expect(settle(f('http://www.tienda.example/'))).rejects.toThrow(
      'La tienda mandó a otro sitio',
    );
    expect(browser.sent('Page.navigate')).toHaveLength(0);
  });

  it('a page bigger than the limit is an error, drawn or raw, and its raw body is not even asked for', async () => {
    const f = lector().fetchFor(['www.tienda.example']);
    browser.site = () => ({ body: 'x'.repeat(NAVEGADOR_MAX_BODY + 1) });
    await expect(settle(f('https://www.tienda.example/a'))).rejects.toThrow(
      'La página de la tienda es demasiado grande para leerla',
    );
    browser.site = () => ({ mime: 'application/json', body: 'x'.repeat(NAVEGADOR_MAX_BODY + 1) });
    await expect(settle(f('https://www.tienda.example/b'))).rejects.toThrow(
      'La página de la tienda es demasiado grande para leerla',
    );
    expect(browser.sent('Network.getResponseBody')).toHaveLength(0);
  });

  it("a new tab or window the page opens is closed; the reader's own tabs are not", async () => {
    browser.site = () => ({ popup: true, body: '<html>ok</html>' });
    const f = lector().fetchFor(['www.tienda.example']);
    const res = await settle(f('https://www.tienda.example/'));
    expect(res.status).toBe(200);
    const closed = browser.sent('Target.closeTarget').map((c) => c.params.targetId);
    expect(closed).toContain('POPUP');
    // Its own tab is closed once, when the read ends (not as a stranger before it starts)
    expect(closed.filter((id) => id === 'T1')).toHaveLength(1);
    expect(closed).not.toContain('INICIAL');
  });

  it('a page that never loads gives up at the page limit and closes its tab', async () => {
    browser.site = () => ({ loadMs: Infinity });
    const f = lector().fetchFor(['www.tienda.example']);
    const started = Date.now();
    const err = await settle(f('https://www.tienda.example/')).catch((e: unknown) => e);
    expect((err as Error).message).toBe('La tienda tardó demasiado en cargar en el navegador');
    expect(Date.now() - started).toBeGreaterThanOrEqual(NAVEGADOR_PAGE_TIMEOUT_MS);
    expect(browser.sent('Target.closeTarget')).toHaveLength(1);
  });
});

// ── The queue ────────────────────────────────────────────────────────────────

describe('ofertas: the browser queue', () => {
  it('one page at a time with a pause between pages; one browser for the batch, closed when it empties', async () => {
    browser.site = () => ({ loadMs: 3000 });
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const one = async (n: number) => {
      const turn = await l.turn();
      try {
        return await fetchText(f, `https://www.tienda.example/p${n}`);
      } finally {
        turn.release();
      }
    };
    const all = settle(Promise.all([one(1), one(2), one(3)]));
    // While the batch runs the browser stays open
    await vi.advanceTimersByTimeAsync(10_000);
    expect(l.open).toBe(true);
    await all;
    const navs = browser.sent('Page.navigate').map((c) => c.at);
    // A page ends when its tab is closed
    const ends = browser.sent('Target.closeTarget').map((c) => c.at);
    expect(navs).toHaveLength(3);
    expect(ends).toHaveLength(3);
    // The pause runs from the end of a page to the start of the next one (pages last 4.5 s here)
    for (let i = 1; i < navs.length; i++) {
      expect(navs[i]! - ends[i - 1]!).toBeGreaterThanOrEqual(NAVEGADOR_PAUSE_MIN_MS);
    }
    expect(browser.launches).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.running).toBe(false);
    expect(profiles()).toEqual([]);
  });

  it('a new batch after the browser closed opens a new browser with a new profile', async () => {
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    await settle(f('https://www.tienda.example/a'));
    await vi.advanceTimersByTimeAsync(2000);
    await settle(f('https://www.tienda.example/b'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.launches).toBe(2);
    expect(new Set(browser.profiles).size).toBe(2);
    expect(profiles()).toEqual([]);
  });

  it('a browser that does not close when asked is killed by its own process tree', async () => {
    browser.closesWhenAsked = false;
    const f = lector().fetchFor(['www.tienda.example']);
    await settle(f('https://www.tienda.example/a'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(browser.kills).toBe(1);
    expect(browser.running).toBe(false);
    expect(profiles()).toEqual([]);
  });

  it('past its life it closes when the turn in course is released; the next turn opens a new one', async () => {
    const l = lector();
    const turn = await settle(l.turn());
    const next = l.turn();
    await vi.advanceTimersByTimeAsync(NAVEGADOR_MAX_LIFE_MS + 60_000);
    // Still open: a turn holds it
    expect(browser.running).toBe(true);
    turn.release();
    const second = await settle(next);
    expect(browser.sent('Browser.close')).toHaveLength(1);
    expect(browser.launches).toBe(2);
    second.release();
  });

  it('past the hard limit it closes even if the turn is never given back', async () => {
    const l = lector();
    const turn = await settle(l.turn());
    await vi.advanceTimersByTimeAsync(NAVEGADOR_HARD_LIFE_MS - 60_000);
    expect(browser.running).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(browser.running).toBe(false);
    expect(profiles()).toEqual([]);
    turn.release();
  });

  it('a page cut by the browser closing is interrupted, not a store failure', async () => {
    browser.site = () => ({ loadMs: Infinity });
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const page = f('https://www.tienda.example/');
    page.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(3000);
    await settle(l.close());
    const err = await settle(page).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceInterrupted);
  });

  it('a turn given back without reading a page leaves no pause behind', async () => {
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const release = l.hold();
    const first = await settle(l.turn());
    await settle(fetchText(f, 'https://www.tienda.example/a'));
    first.release();
    const second = await settle(l.turn());
    const givenBack = Date.now();
    second.release(); // given back unused
    const third = await settle(l.turn());
    // Only a page read starts a pause: the unused turn adds none
    expect(Date.now() - givenBack).toBeLessThan(NAVEGADOR_PAUSE_MIN_MS);
    third.release();
    release();
  });

  it('one browser per batch: while a batch holds it, it stays open between turns', async () => {
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const release = l.hold();
    for (const n of [1, 2]) {
      const turn = await settle(l.turn());
      await settle(fetchText(f, `https://www.tienda.example/${n}`));
      turn.release();
      await vi.advanceTimersByTimeAsync(2000);
      expect(browser.running).toBe(true);
    }
    expect(browser.launches).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.running).toBe(false);
  });

  it('close() does not wait out the pause between pages', async () => {
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    const first = await settle(l.turn());
    await settle(fetchText(f, 'https://www.tienda.example/a'));
    const waiting = l.turn();
    waiting.catch(() => undefined);
    first.release();
    const before = Date.now();
    await settle(l.close());
    expect(Date.now() - before).toBeLessThan(NAVEGADOR_PAUSE_MIN_MS);
    await expect(waiting).rejects.toBeInstanceOf(SourceInterrupted);
  });

  it('a read asked while the browser is closing never opens a new one if the reader closes meanwhile', async () => {
    browser.closesWhenAsked = false;
    const l = lector();
    const f = l.fetchFor(['www.tienda.example']);
    await settle(f('https://www.tienda.example/a'));
    // The first browser is closing (slowly): a new read waits for it, then the reader closes
    const late = f('https://www.tienda.example/b');
    late.catch(() => undefined);
    const closed = l.close();
    await settle(closed);
    await expect(settle(late)).rejects.toBeInstanceOf(SourceInterrupted);
    expect(browser.launches).toBe(1);
  });

  it('close() rejects whoever waits and leaves nothing behind', async () => {
    const l = lector();
    const first = await settle(l.turn());
    const second = l.turn();
    second.catch(() => undefined);
    await settle(l.close());
    await expect(second).rejects.toThrow('Se cerró el navegador');
    first.release();
    expect(browser.running).toBe(false);
    expect(profiles()).toEqual([]);
    await expect(l.turn()).rejects.toThrow('Se cerró el navegador');
  });

  it('old leftover profiles are deleted, only inside its own folder', async () => {
    const base = profilesDir(home);
    fs.mkdirSync(base, { recursive: true });
    const old = path.join(base, 'perfil-viejo');
    const fresh = path.join(base, 'perfil-reciente');
    const other = path.join(base, 'otra-cosa');
    const outside = path.join(home, '.pixel-agents', 'perfil-fuera');
    for (const d of [old, fresh, other, outside]) fs.mkdirSync(d, { recursive: true });
    // The clock of these tests is fake: every date is set by hand
    const long = (Date.now() - NAVEGADOR_STALE_PROFILE_MS - 60_000) / 1000;
    const recent = (Date.now() - 60_000) / 1000;
    for (const d of [old, other, outside]) fs.utimesSync(d, long, long);
    fs.utimesSync(fresh, recent, recent);
    await settle(lector().fetchFor(['www.tienda.example'])('https://www.tienda.example/'));
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true); // may belong to another office running now
    expect(fs.existsSync(other)).toBe(true); // not a profile of ours
    expect(fs.existsSync(outside)).toBe(true); // outside the folder
  });
});

// ── Orphans and the console closing ─────────────────────────────────────────

describe('ofertas: browsers left alive by a program that died', () => {
  it('reads the profile of a command line, quoted or not', () => {
    expect(
      profileFromCommand(
        String.raw`"C:\Edge\msedge.exe" --headless=new --user-data-dir=C:\h\perfil-1 --x`,
      ),
    ).toBe(String.raw`C:\h\perfil-1`);
    expect(profileFromCommand(String.raw`msedge.exe "--user-data-dir=C:\a b\perfil-1" --x`)).toBe(
      String.raw`C:\a b\perfil-1`,
    );
    // ps (macOS/Linux) does not quote: a path with a space comes out cut, so it is never inside the folder
    expect(profileFromCommand('/opt/edge --user-data-dir=/home/a b/perfil-1 --x')).toBe('/home/a');
    expect(profileFromCommand('msedge.exe --no-first-run')).toBeUndefined();
  });

  it('a profile of this very process that its reader still uses is never an orphan', () => {
    const base = profilesDir(home);
    const mine = path.join(base, `perfil-${Date.now().toString(36)}-m`);
    fs.mkdirSync(mine, { recursive: true });
    fs.writeFileSync(path.join(mine, 'pixel-agents-dueno.pid'), String(process.pid));
    const procs = [{ pid: 9, command: `msedge --user-data-dir=${mine}` }];
    const alive = { alive: () => false };
    expect(orphans(base, procs, alive, Date.now(), process.platform, (p) => p === mine)).toEqual(
      [],
    );
    // Forgotten by its reader (it died with an error), it is one
    expect(orphans(base, procs, alive, Date.now(), process.platform, () => false)).toHaveLength(1);
  });

  it('a PID that now belongs to another process (Windows reuses them) is not killed', async () => {
    const base = profilesDir(home);
    const dead = path.join(base, `perfil-${Date.now().toString(36)}-z`);
    fs.mkdirSync(dead, { recursive: true });
    fs.utimesSync(dead, Date.now() / 1000, Date.now() / 1000);
    const killed: number[] = [];
    const tools: ProcessTools = {
      list: async () => [
        { pid: 11, command: `msedge --user-data-dir=${dead}`, startedAt: '2026-11-20T08:00:00Z' },
        { pid: 12, command: `msedge --user-data-dir=${dead}`, startedAt: '2026-11-20T08:00:01Z' },
      ],
      killTree: (pid) => void killed.push(pid),
      alive: () => false,
      // 11 was reused by something else since the listing; 12 is still the same browser
      startedAt: async (pid) => (pid === 11 ? '2026-11-20T09:30:00Z' : '2026-11-20T08:00:01Z'),
    };
    await settle(
      lector({ processes: tools }).fetchFor(['www.tienda.example'])('https://www.tienda.example/'),
    );
    expect(killed).toEqual([12]);
  });

  it('kills by PID only orphans of its own folder: dead owner or older than any browser lives', async () => {
    const base = profilesDir(home);
    const otherHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ofertas-otro-home-'));
    const now = Date.now();
    const young = (now - 60_000).toString(36);
    const old = (now - NAVEGADOR_MAX_LIFE_MS - 60_000).toString(36);
    const mk = (dir: string, owner?: number) => {
      fs.mkdirSync(dir, { recursive: true });
      if (owner !== undefined)
        fs.writeFileSync(path.join(dir, 'pixel-agents-dueno.pid'), String(owner));
      // The clock of these tests is fake: the folder's date goes by hand
      fs.utimesSync(dir, (now - 60_000) / 1000, (now - 60_000) / 1000);
      return dir;
    };
    const LIVE = 70001;
    const DEAD = 70002;
    const dirs = {
      deadOwner: mk(path.join(base, `perfil-${young}-a`), DEAD),
      noOwner: mk(path.join(base, `perfil-${young}-b`)),
      liveYoung: mk(path.join(base, `perfil-${young}-c`), LIVE),
      liveOld: mk(path.join(base, `perfil-${old}-d`), LIVE),
      sibling: mk(
        path.join(home, '.pixel-agents', 'ofertas-navegador-x', `perfil-${young}-e`),
        DEAD,
      ),
      otherHome: mk(
        path.join(otherHome, '.pixel-agents', 'ofertas-navegador', `perfil-${young}-f`),
        DEAD,
      ),
    };
    const pids: Record<keyof typeof dirs, number> = {
      deadOwner: 1,
      noOwner: 2,
      liveYoung: 3,
      liveOld: 4,
      sibling: 5,
      otherHome: 6,
    };
    const procs: ProcessInfo[] = Object.entries(dirs).map(([k, d]) => ({
      pid: pids[k as keyof typeof dirs],
      command: `msedge.exe --headless=new --user-data-dir=${d} about:blank`,
      startedAt: `inicio-${k}`,
    }));
    const killed: number[] = [];
    const tools: ProcessTools = {
      list: async () => procs,
      killTree: (pid) => void killed.push(pid),
      alive: (pid) => pid === LIVE,
      startedAt: async (pid) => {
        const k = (Object.keys(pids) as Array<keyof typeof pids>).find((x) => pids[x] === pid);
        return `inicio-${k}`;
      },
    };
    await settle(
      lector({ processes: tools }).fetchFor(['www.tienda.example'])('https://www.tienda.example/'),
    );
    expect(killed.sort()).toEqual([1, 2, 4]);
    expect(fs.existsSync(dirs.deadOwner)).toBe(false);
    expect(fs.existsSync(dirs.liveYoung)).toBe(true);
    expect(fs.existsSync(dirs.sibling)).toBe(true);
    expect(fs.existsSync(dirs.otherHome)).toBe(true);
    fs.rmSync(otherHome, { recursive: true, force: true });
  });

  it('a listing that fails does not stop the browser; it is looked at once per reader', async () => {
    let lists = 0;
    const tools: ProcessTools = {
      list: async () => {
        lists++;
        throw new Error('sin PowerShell');
      },
      killTree: () => undefined,
      alive: () => false,
      startedAt: async () => undefined,
    };
    const f = lector({ processes: tools }).fetchFor(['www.tienda.example']);
    expect((await settle(f('https://www.tienda.example/a'))).status).toBe(200);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await settle(f('https://www.tienda.example/b'))).status).toBe(200);
    expect(lists).toBe(1);
  });

  it('its profile says who started it and when', async () => {
    const turn = await settle(lector().turn());
    const profile = browser.profiles[0]!;
    expect(fs.readFileSync(path.join(profile, 'pixel-agents-dueno.pid'), 'utf8')).toBe(
      String(process.pid),
    );
    expect(path.basename(profile)).toMatch(
      new RegExp(`^perfil-${Date.now().toString(36).slice(0, 4)}`),
    );
    turn.release();
  });

  it('the console closing (SIGHUP) kills the browser at once, and ends the process as before if nobody else listens', async () => {
    const others = process.listenerCount('SIGHUP');
    const turn = await settle(lector().turn());
    expect(process.listenerCount('SIGHUP')).toBe(others + 1);
    process.emit('SIGHUP');
    expect(browser.kills).toBe(1);
    expect(browser.running).toBe(false);
    expect(hangups).toBe(others === 0 ? 1 : 0);
    expect(process.listenerCount('SIGHUP')).toBe(others);
    turn.release();
  });

  it('with no browser open nothing listens to SIGHUP (the process keeps its own default)', async () => {
    const others = process.listenerCount('SIGHUP');
    const f = lector().fetchFor(['www.tienda.example']);
    await settle(f('https://www.tienda.example/'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.running).toBe(false);
    expect(process.listenerCount('SIGHUP')).toBe(others);
  });
});

// ── Starting the real browser (without starting it) ─────────────────────────

describe('ofertas: starting the browser', () => {
  it('starts with exactly these arguments: no window, own profile, its own pipe, no port, nothing that hides it', () => {
    const args = browserArgs('/tmp/perfil-x');
    expect(args).toEqual([
      '--headless=new',
      '--user-data-dir=/tmp/perfil-x',
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-sync',
      '--disable-features=msImplicitSignin',
      '--js-flags=--max-old-space-size=512',
      'about:blank',
    ]);
    const joined = args.join(' ');
    for (const banned of [
      '--user-agent',
      'AutomationControlled',
      'remote-allow-origins',
      'remote-debugging-port',
      'remote-debugging-address',
      'proxy',
    ]) {
      expect(joined).not.toContain(banned);
    }
  });

  it('runs Windows tools by their full path', () => {
    expect(windowsTool('taskkill.exe')).toMatch(/\\System32\\taskkill\.exe$/i);
    expect(path.win32.isAbsolute(windowsTool('taskkill.exe'))).toBe(true);
  });

  it('looks for Edge before Chrome', () => {
    const env = { ProgramFiles: 'C:\\PF', 'ProgramFiles(x86)': 'C:\\PF86', LOCALAPPDATA: 'C:\\L' };
    const list = browserCandidates('win32', env);
    expect(list[0]).toBe('C:\\PF86\\Microsoft\\Edge\\Application\\msedge.exe');
    expect(list.findIndex((f) => f.includes('chrome.exe'))).toBeGreaterThan(
      list.findIndex((f) => f.includes('msedge.exe')),
    );
    const chromeOnly = (f: string) => f.endsWith('chrome.exe');
    expect(findBrowser({ platform: 'win32', env, exists: chromeOnly })).toBe(
      'C:\\PF86\\Google\\Chrome\\Application\\chrome.exe',
    );
    expect(findBrowser({ platform: 'linux', env: {}, exists: () => false })).toBeUndefined();
    expect(browserCandidates('darwin', {})[0]).toContain('Microsoft Edge');
  });

  it('talks through its pipe (fd 3 and 4, each message ending in NUL); a start that never answers is killed and tried once more', async () => {
    const NUL = '\u0000';
    const spawned: Array<{ args: string[]; stdio: unknown }> = [];
    const fakeSpawn = ((_exe: string, args: string[], options: { stdio: unknown }) => {
      spawned.push({ args, stdio: options.stdio });
      const toBrowser = new PassThrough();
      const fromBrowser = new PassThrough();
      const answers = spawned.length === 2;
      let buffered = '';
      toBrowser.on('data', (chunk: Buffer) => {
        buffered += chunk.toString('utf8');
        let end: number;
        while ((end = buffered.indexOf(NUL)) >= 0) {
          const msg = JSON.parse(buffered.slice(0, end)) as { id: number };
          buffered = buffered.slice(end + 1);
          // The first start never answers (as seen with an empty user folder)
          if (answers) {
            fromBrowser.write(JSON.stringify({ id: msg.id, result: { product: 'Edg/1' } }) + NUL);
          }
        }
      });
      return Object.assign(new EventEmitter(), {
        pid: undefined,
        exitCode: null,
        stdio: [null, null, null, toBrowser, fromBrowser],
      });
    }) as unknown as typeof import('child_process').spawn;
    const profile = fs.mkdtempSync(path.join(home, 'perfil-'));
    const launch = realLauncher({
      find: () => 'navegador',
      spawn: fakeSpawn,
      platform: 'linux',
      launchTimeoutMs: 2000,
    });
    const proc = await settle(launch(profile));
    expect(spawned).toHaveLength(2);
    expect(spawned[0]!.args).toEqual(browserArgs(profile));
    expect(spawned[0]!.stdio).toEqual(['ignore', 'ignore', 'ignore', 'pipe', 'pipe']);
    expect((await settle(proc.cdp.send('Browser.getVersion'))).product).toBe('Edg/1');
    expect(fs.existsSync(path.join(profile, 'DevToolsActivePort'))).toBe(false);
    proc.cdp.close();
  });

  it('without a browser: a clear error, and no profile left', async () => {
    const none = lector({ launch: realLauncher({ find: () => undefined }) });
    await expect(settle(none.turn())).rejects.toThrow('No encontré Edge ni Chrome en esta máquina');
    expect(profiles()).toEqual([]);
  });
});

// ── The watch with the browser ───────────────────────────────────────────────

interface Call {
  url: string;
}

/** The plain fetch: records every call and answers with the store's sample. */
function plainFetch(): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fn = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url });
    return new Response(pageFor(url).body ?? '', { status: pageFor(url).status ?? 200 });
  };
  return { fetch: fn as typeof fetch, calls };
}

/** The same sample for both ways of reading. */
function pageFor(url: string): FakePage {
  if (url.includes('amazon')) return { body: sample('amazon.html') };
  if (url.includes('elpalaciodehierro')) return { body: sample('palacio.html') };
  if (url.includes('elektra')) return { mime: 'application/json', body: sample('elektra.json') };
  if (url.includes('walmart')) return { body: sample('walmart.html') };
  return { status: 500, body: 'no' };
}

describe('ofertas: the watch reading with the browser', () => {
  const pick = (ids: string[], opts: SourceOptions): Source[] =>
    createSources(opts).filter((s) => ids.includes(s.id));
  const make = (sources: Source[]) => createVigia({ home, sources, timers: false });

  beforeEach(() => {
    browser.site = pageFor;
  });

  it('factory: off, with Amazon, El Palacio de Hierro and Elektra marked; the file keeps only stores it can read', () => {
    expect(make([]).state().settings.navegador).toEqual({
      on: false,
      sources: ['amazon', 'palacio', 'elektra'],
    });
    const file = ofertasPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        ajustes: {
          navegador: { on: 'yes', sources: ['mercadolibre', 'walmart', 'nada', 'walmart', 3] },
        },
      }),
    );
    expect(make([]).state().settings.navegador).toEqual({ on: false, sources: ['walmart'] });
  });

  it('switched off: the browser is never started, and the plain fetch is used', async () => {
    const plain = plainFetch();
    const v = make(pick(['amazon', 'palacio'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [] });
    const r = await settle(v.search(QUERY));
    expect(browser.launches).toBe(0);
    expect(profiles()).toEqual([]);
    expect(fs.existsSync(profilesDir(home))).toBe(false);
    expect(plain.calls).toHaveLength(2);
    expect(r.sources.every((s) => s.browser === true && s.viaBrowser === undefined)).toBe(true);
  });

  it('each store reads the way the settings say on every call', async () => {
    const plain = plainFetch();
    const v = make(pick(['amazon', 'palacio'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    let r = await settle(v.search(QUERY));
    expect(plain.calls.map((c) => new URL(c.url).hostname)).toEqual(['www.amazon.com.mx']);
    expect(
      browser.sent('Page.navigate').map((c) => new URL(String(c.params.url)).hostname),
    ).toEqual(['www.elpalaciodehierro.com']);
    expect(r.sources.find((s) => s.id === 'palacio')).toMatchObject({
      state: 'ok',
      viaBrowser: true,
    });

    v.setSettings({ navegador: { on: true, sources: ['amazon'] } });
    r = await settle(v.search(QUERY));
    expect(plain.calls.map((c) => new URL(c.url).hostname)).toEqual([
      'www.amazon.com.mx',
      'www.elpalaciodehierro.com',
    ]);
    expect(
      browser.sent('Page.navigate').map((c) => new URL(String(c.params.url)).hostname),
    ).toEqual(['www.elpalaciodehierro.com', 'www.amazon.com.mx']);
    expect(r.sources.find((s) => s.id === 'amazon')).toMatchObject({
      state: 'ok',
      viaBrowser: true,
    });
  });

  it('the time in the queue does not count: the third store answers long after the 25 s limit and is ok', async () => {
    browser.site = (url) => ({ ...pageFor(url), loadMs: 4000 });
    const plain = plainFetch();
    const v = make(
      pick(['amazon', 'palacio', 'elektra'], { fetch: plain.fetch, navegador: lector() }),
    );
    v.setSettings({
      disabledSources: [],
      navegador: { on: true, sources: ['amazon', 'palacio', 'elektra'] },
    });
    const started = Date.now();
    const r = await settle(v.search(QUERY));
    expect(Date.now() - started).toBeGreaterThan(SOURCE_TIMEOUT_MS * 2);
    expect(r.sources.map((s) => [s.id, s.state])).toEqual([
      ['elektra', 'ok'],
      ['palacio', 'ok'],
      ['amazon', 'ok'],
    ]);
    expect(r.sources.every((s) => (s.count ?? 0) > 0)).toBe(true);
    expect(plain.calls).toHaveLength(0);
    expect(browser.launches).toBe(1);
  });

  it('robots stores: only a link unless turned on by hand, and then only with the browser, never with fetch', async () => {
    const plain = plainFetch();
    const v = make(pick(['walmart'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [] });
    let r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'off', linkOnly: true, browser: true });
    expect(r.links.map((l) => l.name)).toContain('Walmart');

    // The switch on is not enough: the store must be marked
    v.setSettings({ navegador: { on: true, sources: ['amazon'] } });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'off', linkOnly: true });

    v.setSettings({ navegador: { on: true, sources: ['walmart'] } });
    r = await settle(v.search(QUERY));
    // Still says its robots.txt does not allow it, and it was read with the browser
    expect(r.sources[0]).toMatchObject({ state: 'ok', linkOnly: true, viaBrowser: true });
    expect(browser.sent('Page.navigate')).toHaveLength(1);
    expect(plain.calls).toHaveLength(0);

    // The bare source refuses a plain read
    await expect(pick(['walmart'], { fetch: plain.fetch })[0]!.search(QUERY)).rejects.toThrow(
      'robots.txt',
    );
    expect(plain.calls).toHaveLength(0);
  });

  it('"dónde buscó" says it was read with the browser, and keeps it after a restart', async () => {
    const plain = plainFetch();
    const sources = pick(['amazon', 'palacio'], { fetch: plain.fetch, navegador: lector() });
    const v = make(sources);
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    const w = v.saveWatch({ query: QUERY });
    await settle(v.check(w.id));
    const stores = v.state().watches[0]!.stores!;
    expect(stores.find((s) => s.id === 'palacio')?.viaBrowser).toBe(true);
    expect(stores.find((s) => s.id === 'amazon')?.viaBrowser).toBeUndefined();
    expect(
      make([])
        .state()
        .watches[0]!.stores!.find((s) => s.id === 'palacio')?.viaBrowser,
    ).toBe(true);
  });

  it('a block through the browser backs off as always; switching off and on again never clears the pause', async () => {
    browser.site = (url) => ({ ...pageFor(url), status: 403 });
    const plain = plainFetch();
    const v = make(pick(['palacio'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    let r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'blocked', viaBrowser: true });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]!.detail).toMatch(/^En pausa hasta/);
    expect(browser.sent('Page.navigate')).toHaveLength(1);

    // Off and on again: the pause of the browser is still there (a captcha is never sidestepped)
    v.setSettings({ navegador: { on: false, sources: ['palacio'] } });
    v.setSettings({ navegador: { on: true, sources: ['palacio'] } });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]!.detail).toMatch(/^En pausa hasta/);
    expect(browser.sent('Page.navigate')).toHaveLength(1);
    expect(plain.calls).toHaveLength(0);
  });

  it('each way of reading keeps its own state: a block by plain request is not cleared by reading with the browser', async () => {
    const plain = plainFetch();
    const blocked: typeof fetch = (async () => new Response('no', { status: 403 })) as typeof fetch;
    const v = make(pick(['palacio'], { fetch: blocked, navegador: lector() }));
    v.setSettings({ disabledSources: [] });
    let r = await settle(v.search(QUERY));
    expect(r.sources[0]!.state).toBe('blocked');
    // With the browser it is another way: it reads
    v.setSettings({ navegador: { on: true, sources: ['palacio'] } });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'ok', viaBrowser: true });
    // Back to the plain request: its own pause is still there
    v.setSettings({ navegador: { on: false, sources: ['palacio'] } });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]!.detail).toMatch(/^En pausa hasta/);
    expect(plain.calls).toHaveLength(0);
  });

  it('a round of several watches uses one browser, not one per watch', async () => {
    const v = make(pick(['palacio'], { navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    v.saveWatch({ query: QUERY });
    v.saveWatch({ query: 'otra bocina' });
    await settle(v.check());
    expect(browser.sent('Page.navigate')).toHaveLength(2);
    expect(browser.launches).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.running).toBe(false);
  });

  it('a read cut by the office closing is not saved as the store result, and costs the store nothing', async () => {
    browser.site = (url) => ({ ...pageFor(url), loadMs: 10_000 });
    const l = lector();
    const v = make(pick(['palacio'], { navegador: l }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    const w = v.saveWatch({ query: QUERY });
    await settle(v.check(w.id));
    const first = v.state().watches[0]!.stores!;
    expect(first[0]).toMatchObject({ result: 'found', viaBrowser: true });
    // A second check that the office cuts: it stops, the browser closes mid-page
    await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
    const running = v.check(w.id);
    await vi.advanceTimersByTimeAsync(3000);
    v.stop();
    await settle(l.close());
    await settle(running);
    expect(v.state().watches[0]!.stores).toEqual(first);
    expect(v.state().sources[0]!.state).not.toBe('error');
  });

  it('an interrupted store keeps what it said last time; the back-off does not grow', async () => {
    let cut = false;
    const s: Source = {
      id: 'x',
      name: 'X',
      fragile: false,
      access: 'prueba',
      ready: () => true,
      searchUrl: (q) => `https://x.example/?q=${q}`,
      async search() {
        if (cut) throw new SourceInterrupted('Se cerró el navegador');
        return {
          offers: [
            {
              sourceId: 'x',
              store: 'X',
              id: '1',
              title: QUERY,
              price: 100,
              official: true,
              url: 'https://x.example/1',
            },
          ],
          deals: [],
        };
      },
    };
    const v = make([s]);
    const w = v.saveWatch({ query: QUERY });
    await settle(v.check(w.id));
    const before = v.state().watches[0]!;
    cut = true;
    await settle(v.check(w.id));
    expect(v.state().watches[0]).toEqual(before);
    expect(v.state().sources[0]!.state).toBe('ok');
  });

  it('a tab that crashes, or a browser that dies by itself, is an error with the usual pause, not opened again each minute', async () => {
    browser.site = (url) => ({ ...pageFor(url), crash: true });
    const v = make(pick(['palacio'], { navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    let r = await settle(v.search(QUERY));
    expect(r.sources[0]!.state).toBe('error');
    r = await settle(v.search(QUERY));
    expect(r.sources[0]!.detail).toMatch(/^En pausa hasta/);
    expect(browser.sent('Page.navigate')).toHaveLength(1);

    browser.site = (url) => ({ ...pageFor(url), die: true });
    const f = lector().fetchFor(['www.tienda.example']);
    const err = await settle(f('https://www.tienda.example/')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceReadError);
    expect(err).not.toBeInstanceOf(SourceInterrupted);
  });

  it('an answer that arrives after the way of reading changed goes to the way it was read', async () => {
    browser.site = (url) => ({ ...pageFor(url), status: 403, loadMs: 8000 });
    const plain = plainFetch();
    const v = make(pick(['palacio'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    const first = v.search(QUERY);
    await vi.advanceTimersByTimeAsync(3000);
    // Switched to the plain request while the browser was still reading
    v.setSettings({ navegador: { on: false, sources: ['palacio'] } });
    await settle(first);
    // The plain way was not touched by that block: it reads
    let r = await settle(v.search(QUERY));
    expect(r.sources[0]!.state).toBe('ok');
    expect(plain.calls).toHaveLength(1);
    // The browser way got it: back on, it is paused
    v.setSettings({ navegador: { on: true, sources: ['palacio'] } });
    r = await settle(v.search(QUERY));
    expect(r.sources[0]!.detail).toMatch(/^En pausa hasta/);
    expect(browser.sent('Page.navigate')).toHaveLength(1);
  });

  it('the pipe decodes a character split between two chunks', async () => {
    const toBrowser = new PassThrough();
    const fromBrowser = new PassThrough();
    const cdp = cdpOver(pipeSocket(toBrowser, fromBrowser));
    const got = new Promise<string>((resolve) =>
      cdp.on((_m, params) => resolve(String(params.title))),
    );
    const bytes = Buffer.from(`${JSON.stringify({ method: 'X', params: { title: 'Año' } })}\u0000`);
    const cut = bytes.indexOf(Buffer.from('ñ')) + 1; // between the two bytes of «ñ»
    fromBrowser.write(bytes.subarray(0, cut));
    fromBrowser.write(bytes.subarray(cut));
    expect(await settle(got)).toBe('Año');
    cdp.close();
  });

  it('an account signed in to the profile (from the start, after a page, or unreadable): nothing is read, the browser and its profile go', async () => {
    const ACCOUNT = 'Edge abrió con una cuenta iniciada; no se leyó nada por seguridad';
    for (const account of ['atLaunch', 'afterPage', 'garbage'] as const) {
      browser = new FakeBrowser();
      browser.site = pageFor;
      browser.account = account;
      const f = lector().fetchFor(['www.elpalaciodehierro.com']);
      const err = await settle(f('https://www.elpalaciodehierro.com/buscar?q=x')).catch(
        (e: unknown) => e,
      );
      expect(err, account).toBeInstanceOf(SourceReadError);
      expect((err as Error).message, account).toBe(ACCOUNT);
      // Before navigating when the account is there from the start
      expect(browser.sent('Page.navigate'), account).toHaveLength(account === 'afterPage' ? 1 : 0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(browser.running, account).toBe(false);
      expect(profiles(), account).toEqual([]);
    }
  });

  it('the store says why in its line, in Spanish, with the usual pause', async () => {
    browser.account = 'afterPage';
    const v = make(pick(['palacio'], { navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    const r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'error', viaBrowser: true });
    expect(r.sources[0]!.detail).toMatch(
      /^Edge abrió con una cuenta iniciada; no se leyó nada por seguridad; reintento después de/,
    );
    expect(r.groups).toEqual([]);
  });

  it('Costco and Mercado Libre are never read with the browser', () => {
    const byId = new Map(createSources({ navegador: lector() }).map((s) => [s.id, s]));
    expect(byId.get('costco')!.browser).toBeUndefined();
    expect(byId.get('mercadolibre')!.browser).toBeUndefined();
    expect(byId.get('amazon')!.browser).toBeDefined();
  });

  it('a word list is cut before its repeats are removed (a long list is never walked whole)', () => {
    const long = [
      ...Array.from({ length: 20 }, () => 'a'),
      'b',
      ...Array.from({ length: 1e5 }, () => 'c'),
    ];
    expect(wordList(long)).toEqual(['a']);
  });

  it('a captcha page drawn by the browser is a block (the reader finds no results and sees the wall)', async () => {
    browser.site = () => ({
      body: '<html><form action="/errors/validateCaptcha">Escribe los caracteres</form></html>',
    });
    const v = make(pick(['amazon'], { navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['amazon'] } });
    const r = await settle(v.search(QUERY));
    expect(r.sources[0]).toMatchObject({ state: 'blocked', viaBrowser: true });
  });

  it('without a browser on the machine the store says so, in Spanish, and nothing breaks', async () => {
    const plain = plainFetch();
    const none = lector({
      launch: realLauncher({ find: () => undefined }),
    });
    const v = make(pick(['amazon', 'palacio'], { fetch: plain.fetch, navegador: none }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['amazon'] } });
    const r = await settle(v.search(QUERY));
    expect(r.sources.find((s) => s.id === 'amazon')).toMatchObject({ state: 'error' });
    expect(r.sources.find((s) => s.id === 'amazon')!.detail).toMatch(
      /^No encontré Edge ni Chrome en esta máquina; reintento después de/,
    );
    expect(r.sources.find((s) => s.id === 'palacio')!.state).toBe('ok');
    expect(profiles()).toEqual([]);
  });

  it('read with the browser, a store is asked at most every 3 h per watch', async () => {
    const plain = plainFetch();
    const v = make(pick(['palacio'], { fetch: plain.fetch, navegador: lector() }));
    v.setSettings({ disabledSources: [], navegador: { on: true, sources: ['palacio'] } });
    const w = v.saveWatch({ query: QUERY });
    await settle(v.check(w.id));
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await settle(v.check(w.id));
    expect(browser.sent('Page.navigate')).toHaveLength(1);
    expect(v.state().watches[0]!.stores![0]).toMatchObject({ reused: true, viaBrowser: true });
  });
});
