/**
 * The browser reader: reads stores "like a person". One page at a time in the whole office, a random pause between
 * pages, the browser opens for the first page of a batch and closes as soon as nobody is waiting, with a limit on
 * its life and on each page. Its profile is a new folder under <home>/.pixel-agents/ofertas-navegador/, deleted on
 * close. Nothing here runs (no folder, no process) until a source asks for a turn or a page.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  NAVEGADOR_CLOSE_WAIT_MS,
  NAVEGADOR_DIR,
  NAVEGADOR_FETCH_TIMEOUT_MS,
  NAVEGADOR_HARD_LIFE_MS,
  NAVEGADOR_MAX_LIFE_MS,
  NAVEGADOR_OWNER_FILE,
  NAVEGADOR_PAGE_TIMEOUT_MS,
  NAVEGADOR_PAUSE_MAX_MS,
  NAVEGADOR_PAUSE_MIN_MS,
  NAVEGADOR_PROFILE_PREFIX,
  NAVEGADOR_RM_TRIES,
  NAVEGADOR_RM_WAIT_MS,
  NAVEGADOR_SETTLE_MS,
  NAVEGADOR_STALE_PROFILE_MS,
  NAVEGADOR_TURN_TIMEOUT_MS,
  OFERTAS_DIR,
  TEXT,
} from '../constants.js';
import type { SlowFetch } from '../sources/http.js';
import type { BrowserReader, BrowserTurn } from '../types.js';
import { SourceInterrupted, SourceReadError } from '../types.js';
import { type BrowserProcess, type Launcher, realLauncher } from './arranque.js';
import { type ProcessTools, realProcessTools, sweepOrphans } from './huerfanos.js';
import { readPage, type TabOwner } from './pagina.js';

export interface LectorOptions {
  /** The folder that holds .pixel-agents/ (the watch's own home, already resolved by the caller). */
  home: string;
  /** Tests pass a double (a fake browser over a fake debugging protocol). */
  launch?: Launcher;
  /** 0..1, for the pause between pages. */
  random?: () => number;
  /**
   * How orphan browsers (left by a program that died) are found and killed before the first launch; null = never
   * look. Tests pass a double.
   */
  processes?: ProcessTools | null;
  /**
   * What happens after the browser was killed on SIGHUP (the console window closed), when nothing else listens to
   * it: by default the process ends as it did before a listener existed. Tests pass a double.
   */
  hangup?: () => void;
  /**
   * Only for tests against a local server: also plain http and an explicit port in the allowed URLs. Set only by the
   * code that builds the reader in a test; the office never sets it and no setting can reach it.
   */
  plainHttpForTests?: boolean;
}

/**
 * Listening to SIGHUP takes Node's default (ending the process) away. When the reader is the only listener, it ends
 * the process as before: re-raised on macOS/Linux, exit code 129 (128 + SIGHUP) on Windows, where the signal is the
 * console closing and Windows ends the process a few seconds later anyway.
 */
function endAsBefore(): void {
  if (process.platform === 'win32') process.exit(129);
  else process.kill(process.pid, 'SIGHUP');
}

export interface Lector extends BrowserReader {
  /** A browser is running now. */
  readonly open: boolean;
}

interface Running {
  proc: BrowserProcess;
  profile: string;
  /** Past its life: it closes as soon as the turn in course is released. */
  retiring: boolean;
  /** The reader closed it (not a crash): a page cut by that is an interruption, not a failure. */
  closedByReader?: boolean;
  lifeTimer: ReturnType<typeof setTimeout>;
  hardTimer: ReturnType<typeof setTimeout>;
  /** Tabs the reader opened (and the first blank one); any other new tab or window is closed. */
  tabs: Set<string>;
  /** Tabs of ours opening right now (their id is not known yet). */
  opening: number;
  /** New tabs seen while one of ours was opening: decided when it is known. */
  pendingForeign: string[];
  exitHook: () => void;
  hangupHook: () => void;
  dead: boolean;
  shutdown?: Promise<void>;
}

interface Waiter {
  resolve: (turn: BrowserTurn) => void;
  reject: (err: Error) => void;
}

/**
 * A wait that can be cancelled (its promise then resolves at once). Only the limit raced against the browser closing
 * is unref'd: the pause between pages and the retries to delete a profile keep Node alive until they are done, or a
 * one-shot console run could end before its profile is deleted.
 */
function delay(ms: number, unref = false): { done: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((r) => {
    finish = r;
    timer = setTimeout(r, ms);
    if (unref) timer.unref?.();
  });
  return {
    done,
    cancel() {
      clearTimeout(timer);
      finish();
    },
  };
}

const sleep = (ms: number) => delay(ms).done;

/**
 * Is any account signed in to this profile? Edge may sign a new profile in with the person's Windows or Microsoft
 * account by itself; a flag stops it (arranque.ts), and this lock does not trust the flag: it reads the profile's own
 * Default/Preferences. Missing file = no account yet. A file that exists but cannot be read counts as signed in (fail
 * closed).
 */
export function profileHasAccount(profile: string): boolean {
  const file = path.join(profile, 'Default', 'Preferences');
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
  try {
    const prefs = JSON.parse(text) as { account_info?: unknown };
    const accounts = prefs?.account_info;
    if (accounts === undefined || accounts === null) return false;
    return !Array.isArray(accounts) || accounts.length > 0;
  } catch {
    return true;
  }
}

/** <home>/.pixel-agents/ofertas-navegador: every profile of the reader lives here, and only here. */
export function profilesDir(home: string): string {
  return path.join(home, OFERTAS_DIR, NAVEGADOR_DIR);
}

/** dir is a profile inside base (never base itself, never outside it). */
function insideBase(base: string, dir: string): boolean {
  const rel = path.relative(base, dir);
  return (
    rel !== '' &&
    !rel.startsWith('..') &&
    !path.isAbsolute(rel) &&
    path.basename(dir).startsWith(NAVEGADOR_PROFILE_PREFIX)
  );
}

/** Deletes one profile, retrying while Windows keeps its files busy. */
async function removeProfile(base: string, dir: string): Promise<void> {
  if (!insideBase(base, dir)) return;
  for (let i = 0; i < NAVEGADOR_RM_TRIES; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await sleep(NAVEGADOR_RM_WAIT_MS);
    }
  }
  console.warn(`[Ofertas] No pude borrar el perfil del navegador: ${dir}`);
}

/** Profiles left by a crash or a killed program, older than the browser can live. Only inside base. */
function removeStaleProfiles(base: string, nowMs: number): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const dir = path.join(base, e.name);
    if (!insideBase(base, dir)) continue;
    try {
      const st = fs.lstatSync(dir);
      if (nowMs - st.mtimeMs < NAVEGADOR_STALE_PROFILE_MS) continue;
      // A link is removed as a link: never what it points to
      if (st.isSymbolicLink() || !st.isDirectory()) fs.unlinkSync(dir);
      else fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // busy or gone: the next launch tries again
    }
  }
}

export function createLector(opts: LectorOptions): Lector {
  const base = profilesDir(opts.home);
  const launch = opts.launch ?? realLauncher();
  const random = opts.random ?? Math.random;
  const tools = opts.processes === undefined ? realProcessTools() : opts.processes;
  const hangup = opts.hangup ?? endAsBefore;
  const plainHttpForTests = opts.plainHttpForTests === true;
  /** Orphans are looked for once, before the first browser of this reader. */
  let swept = false;

  const waiters: Waiter[] = [];
  /** A turn is held, or being handed out (its pause is running). */
  let holding = false;
  let granting = false;
  /** The pause before the next turn, cancelled by close(). */
  let pause: { cancel: () => void } | undefined;
  /** Batches holding the browser open between turns (a round, a live search). */
  let holds = 0;
  let pages = 0;
  let pageLock: Promise<void> = Promise.resolve();
  /** When the last page ended, and the pause that follows it (only a page read sets them). */
  let lastEndAt: number | undefined;
  let pauseMs = 0;
  let running: Running | undefined;
  let starting: Promise<Running> | undefined;
  let closing: Promise<void> | undefined;
  let disposed = false;

  /** ours = the reader decided to close it (idle, its life, close()); not = it died by itself. */
  function shutdown(r: Running, ours = true): Promise<void> {
    if (r.shutdown) return r.shutdown;
    r.closedByReader = ours;
    r.dead = true;
    if (running === r) running = undefined;
    clearTimeout(r.lifeTimer);
    clearTimeout(r.hardTimer);
    r.shutdown = (async () => {
      const wait = delay(NAVEGADOR_CLOSE_WAIT_MS, true);
      try {
        await Promise.race([r.proc.cdp.send('Browser.close'), wait.done]);
      } catch {
        // it closed (or the connection did) before answering
      } finally {
        wait.cancel();
      }
      r.proc.cdp.close();
      if (!(await r.proc.waitExit(NAVEGADOR_CLOSE_WAIT_MS))) {
        r.proc.killTree();
        await r.proc.waitExit(NAVEGADOR_CLOSE_WAIT_MS);
      }
      process.removeListener('exit', r.exitHook);
      process.removeListener('SIGHUP', r.hangupHook);
      await removeProfile(base, r.profile);
    })();
    const done = r.shutdown.finally(() => {
      if (closing === done) closing = undefined;
    });
    closing = done;
    return r.shutdown;
  }

  /** Any new tab or window that is not one the reader opened is closed (a popup, a window.open). */
  function closeForeign(r: Running, targetId: string): void {
    if (r.tabs.has(targetId)) return;
    void r.proc.cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
  }

  function watchTargets(r: Running): void {
    r.proc.cdp.on((method, params, sessionId) => {
      if (sessionId || method !== 'Target.targetCreated') return;
      const info = params.targetInfo as { targetId?: unknown; type?: unknown } | undefined;
      const id = typeof info?.targetId === 'string' ? info.targetId : undefined;
      if (!id || info?.type !== 'page' || r.tabs.has(id)) return;
      if (r.opening > 0) r.pendingForeign.push(id);
      else closeForeign(r, id);
    });
  }

  async function launchNew(): Promise<Running> {
    fs.mkdirSync(base, { recursive: true });
    if (!swept && tools) {
      swept = true;
      // Browsers left alive by a program that died, before anything else (their profiles go right after)
      const known = (dir: string) => running !== undefined && running.profile === dir;
      for (const dir of await sweepOrphans(base, tools, Date.now(), known)) {
        await removeProfile(base, dir);
      }
    }
    removeStaleProfiles(base, Date.now());
    // The name carries when it was made: an orphan older than any browser's life is known as such
    const profile = fs.mkdtempSync(
      path.join(base, `${NAVEGADOR_PROFILE_PREFIX}${Date.now().toString(36)}-`),
    );
    let proc: BrowserProcess;
    try {
      fs.writeFileSync(path.join(profile, NAVEGADOR_OWNER_FILE), String(process.pid));
      proc = await launch(profile);
    } catch (err) {
      await removeProfile(base, profile);
      if (err instanceof SourceReadError) throw err;
      throw new SourceReadError(`${TEXT.browserFailed} (${(err as Error).message})`);
    }
    const r: Running = {
      proc,
      profile,
      dead: false,
      retiring: false,
      tabs: new Set(),
      opening: 0,
      pendingForeign: [],
      exitHook: () => proc.killTreeSync(),
      // The console window closed: kill it now (synchronously), then end as the process did before
      hangupHook: () => {
        process.removeListener('SIGHUP', r.hangupHook);
        proc.killTreeSync();
        if (process.listenerCount('SIGHUP') === 0) hangup();
      },
      // Past its life it goes when the turn in course is released; past the hard limit, at once
      lifeTimer: setTimeout(() => {
        r.retiring = true;
        closeIfIdle();
      }, NAVEGADOR_MAX_LIFE_MS),
      hardTimer: setTimeout(() => void shutdown(r), NAVEGADOR_HARD_LIFE_MS),
    };
    r.lifeTimer.unref?.();
    r.hardTimer.unref?.();
    process.on('exit', r.exitHook);
    process.on('SIGHUP', r.hangupHook);
    // The browser died by itself: clean its process tree and profile
    proc.cdp.onClose(() => void shutdown(r, false));
    running = r;
    try {
      // Tabs that exist already (the first blank one) are the browser's own
      const known = await proc.cdp.send('Target.getTargets');
      for (const t of (known.targetInfos as Array<{ targetId?: unknown }> | undefined) ?? []) {
        if (typeof t.targetId === 'string') r.tabs.add(t.targetId);
      }
      watchTargets(r);
      await proc.cdp.send('Target.setDiscoverTargets', { discover: true });
    } catch {
      // without it, a popup simply stays until the browser closes
    }
    try {
      // Downloads would land outside the profile: none
      await proc.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    } catch {
      // older browsers: nothing is downloaded by a search page anyway
    }
    if (disposed) {
      await shutdown(r);
      throw new SourceInterrupted(TEXT.browserClosed);
    }
    // Before any store is opened: no account in this profile, or nothing is read
    if (profileHasAccount(profile)) {
      await shutdown(r);
      throw new SourceReadError(TEXT.browserAccount);
    }
    return r;
  }

  async function ensureBrowser(): Promise<Running> {
    if (disposed) throw new SourceInterrupted(TEXT.browserClosed);
    if (running && !running.dead && !running.retiring) return running;
    // Past its life and asked again: it goes now (pages are one at a time, so none of its own is open)
    if (running && running.retiring) void shutdown(running);
    // A browser closing is finished before a new one (and a new profile) starts
    if (closing) await closing;
    if (disposed) throw new SourceInterrupted(TEXT.browserClosed);
    if (running && !running.dead && !running.retiring) return running;
    if (!starting) {
      starting = launchNew().finally(() => {
        starting = undefined;
      });
    }
    return starting;
  }

  /**
   * Nothing holds it: no turn, no page, nobody waiting and no batch. Then the browser goes. A browser past its life
   * goes as soon as no turn and no page hold it, even if others wait (the next turn opens a new one).
   */
  function closeIfIdle(): void {
    if (!running) return;
    if (running.retiring && !holding && pages === 0) {
      void shutdown(running);
      return;
    }
    if (holding || granting || waiters.length > 0 || pages > 0 || holds > 0) return;
    void shutdown(running);
  }

  async function grant(): Promise<void> {
    if (holding || granting || waiters.length === 0 || disposed) return;
    granting = true;
    const wait = lastEndAt === undefined ? 0 : Math.max(0, lastEndAt + pauseMs - Date.now());
    if (wait > 0) {
      const d = delay(wait);
      pause = d;
      await d.done;
      pause = undefined;
    }
    granting = false;
    if (disposed) return; // close() already rejected whoever waited
    const w = waiters.shift();
    if (!w) {
      closeIfIdle();
      return;
    }
    holding = true;
    try {
      await ensureBrowser();
    } catch (err) {
      holding = false;
      w.reject(err instanceof Error ? err : new SourceReadError(TEXT.browserFailed));
      if (waiters.length > 0) void grant();
      else closeIfIdle();
      return;
    }
    let released = false;
    w.resolve({
      timeoutMs: NAVEGADOR_TURN_TIMEOUT_MS,
      // Releasing marks no pause by itself: only a page read does (a turn given back unused costs nothing)
      release() {
        if (released) return;
        released = true;
        holding = false;
        if (waiters.length > 0) void grant();
        closeIfIdle();
      },
    });
  }

  /** Opens one of the reader's own tabs (so a new tab it did not open can be told apart and closed). */
  function tabsOf(r: Running): TabOwner {
    return {
      async open() {
        r.opening++;
        let id: string | undefined;
        try {
          const created = await r.proc.cdp.send('Target.createTarget', { url: 'about:blank' });
          id = typeof created.targetId === 'string' ? created.targetId : '';
          r.tabs.add(id);
          return id;
        } finally {
          r.opening--;
          if (r.opening === 0) {
            for (const other of r.pendingForeign.splice(0)) closeForeign(r, other);
          }
        }
      },
      closed(targetId) {
        r.tabs.delete(targetId);
      },
    };
  }

  function fetchFor(hosts: readonly string[]): typeof fetch {
    const allow = { hosts: [...hosts], plainHttpForTests };
    const f = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      // Headers are ignored on purpose: the browser keeps its own identity
      if (method !== 'GET') throw new SourceReadError(TEXT.browserGetOnly);
      if (disposed) throw new SourceInterrupted(TEXT.browserClosed);
      const before = pageLock;
      let unlock: () => void = () => undefined;
      pageLock = new Promise<void>((r) => {
        unlock = r;
      });
      pages++;
      let browserOfPage: Running | undefined;
      try {
        await before;
        const r = await ensureBrowser();
        browserOfPage = r;
        const page = await readPage(
          r.proc.cdp,
          url,
          allow,
          { timeoutMs: NAVEGADOR_PAGE_TIMEOUT_MS, settleMs: NAVEGADOR_SETTLE_MS },
          init?.signal ?? undefined,
          tabsOf(r),
        );
        // After every page too (the sign-in may come late): the page is not given, the browser and its profile go
        if (profileHasAccount(r.profile)) {
          await shutdown(r);
          throw new SourceReadError(TEXT.browserAccount);
        }
        return page;
      } catch (err) {
        // Cut because the browser died by itself (a crash): the store gets the usual back-off, so a
        // crashing page is not opened again every minute
        const r = browserOfPage;
        if (err instanceof SourceInterrupted && !disposed && r && r.closedByReader === false) {
          throw new SourceReadError(TEXT.browserClosed);
        }
        throw err;
      } finally {
        pages--;
        lastEndAt = Date.now();
        pauseMs =
          NAVEGADOR_PAUSE_MIN_MS + random() * (NAVEGADOR_PAUSE_MAX_MS - NAVEGADOR_PAUSE_MIN_MS);
        unlock();
        closeIfIdle();
      }
    };
    const slow: SlowFetch = { requestTimeoutMs: NAVEGADOR_FETCH_TIMEOUT_MS };
    return Object.assign(f, slow) as unknown as typeof fetch;
  }

  return {
    get open() {
      return running !== undefined && !running.dead;
    },
    turn(): Promise<BrowserTurn> {
      if (disposed) return Promise.reject(new SourceInterrupted(TEXT.browserClosed));
      return new Promise<BrowserTurn>((resolve, reject) => {
        waiters.push({ resolve, reject });
        void grant();
      });
    },
    hold(): () => void {
      holds++;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        holds--;
        closeIfIdle();
      };
    },
    fetchFor,
    async close(): Promise<void> {
      disposed = true;
      pause?.cancel();
      for (const w of waiters.splice(0)) w.reject(new SourceInterrupted(TEXT.browserClosed));
      if (starting) await starting.catch(() => undefined);
      if (running) await shutdown(running);
      if (closing) await closing;
    },
  };
}
