/**
 * Starts the browser for the reader: no shell (a list of arguments), no window, a profile of its own, and the
 * debugging protocol over the browser's own pipe (fd 3 and 4), not a TCP port: no other local program can connect to
 * it, and if Node dies the browser loses its pipe. It never changes the User-Agent nor hides that it is automated.
 * Closing it kills only its own process tree (by PID), never other browsers by name.
 */
import { type ChildProcess, execFile, spawn, spawnSync } from 'child_process';
import * as path from 'path';
import type { Readable, Writable } from 'stream';

import {
  NAVEGADOR_CLOSE_WAIT_MS,
  NAVEGADOR_JS_HEAP_MB,
  NAVEGADOR_LAUNCH_TIMEOUT_MS,
  NAVEGADOR_LAUNCH_TRIES,
  TEXT,
} from '../constants.js';
import { SourceReadError } from '../types.js';
import { findBrowser } from './buscar.js';
import { type Cdp, cdpOver, pipeSocket } from './cdp.js';

/** A running browser of the reader. */
export interface BrowserProcess {
  cdp: Cdp;
  pid?: number;
  /** true when the process exited within ms. */
  waitExit(ms: number): Promise<boolean>;
  /** Kills this PID and its children (never by name). */
  killTree(): void;
  /** The same, synchronously: for when Node is exiting. */
  killTreeSync(): void;
}

export type Launcher = (profileDir: string) => Promise<BrowserProcess>;

/** Windows tools by their full path (a taskkill.exe earlier in PATH is never run). */
export function windowsTool(...parts: string[]): string {
  return path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', ...parts);
}

/** Every argument the browser gets. Nothing that hides automation, changes the identity or opens a port. */
export function browserArgs(profileDir: string): string[] {
  return [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-pipe',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    // Without it Edge signs the new profile in with the Windows or Microsoft account of the person (checked:
    // account_info with their account in Default/Preferences after one page). The reader never has an account.
    '--disable-features=msImplicitSignin',
    `--js-flags=--max-old-space-size=${NAVEGADOR_JS_HEAP_MB}`,
    'about:blank',
  ];
}

export interface RealLauncherOptions {
  /** Where the browser is (tests: none). */
  find?: () => string | undefined;
  spawn?: typeof spawn;
  platform?: NodeJS.Platform;
  /** How long a start may take to answer (tests make it short). */
  launchTimeoutMs?: number;
}

function killer(child: ChildProcess, platform: NodeJS.Platform, gone: () => boolean) {
  const pid = child.pid;
  const posixKill = (): void => {
    if (pid === undefined) return;
    try {
      process.kill(-pid, 'SIGKILL'); // its own process group (detached)
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  };
  return {
    killTree(): void {
      if (pid === undefined || gone()) return;
      if (platform === 'win32') {
        execFile(
          windowsTool('taskkill.exe'),
          ['/PID', String(pid), '/T', '/F'],
          { windowsHide: true },
          () => {
            // gone or not, nothing else to do
          },
        );
      } else posixKill();
    },
    killTreeSync(): void {
      if (pid === undefined || gone()) return;
      if (platform === 'win32') {
        // The whole tree; if taskkill cannot run (the console is going away), at least the browser itself
        spawnSync(windowsTool('taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 3000,
        });
        if (!gone()) {
          try {
            process.kill(pid);
          } catch {
            // gone
          }
        }
      } else posixKill();
    },
  };
}

/** The real launcher: finds Edge or Chrome, starts it and talks to it through its pipe. */
export function realLauncher(opts: RealLauncherOptions = {}): Launcher {
  const platform = opts.platform ?? process.platform;
  const spawnFn = opts.spawn ?? spawn;
  const launchTimeout = opts.launchTimeoutMs ?? NAVEGADOR_LAUNCH_TIMEOUT_MS;

  /** One start: spawn, wait for the first answer through the pipe. Kills its own tree when it fails. */
  async function startOnce(exe: string, profileDir: string): Promise<BrowserProcess> {
    let child: ChildProcess;
    try {
      child = spawnFn(exe, browserArgs(profileDir), {
        // fd 3: commands to the browser; fd 4: its answers
        stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        // On macOS/Linux its own process group, so the whole tree can be killed by its PID
        detached: platform !== 'win32',
      });
    } catch (err) {
      throw new SourceReadError(`${TEXT.browserFailed} (${(err as Error).message})`);
    }
    let exited = false;
    const exitWaiters = new Set<() => void>();
    const markExit = (): void => {
      exited = true;
      for (const w of [...exitWaiters]) w();
    };
    child.once('exit', markExit);
    child.once('error', markExit);
    const kill = killer(child, platform, () => exited);

    const waitExit = (ms: number): Promise<boolean> =>
      exited
        ? Promise.resolve(true)
        : new Promise<boolean>((resolve) => {
            const done = (): void => {
              clearTimeout(timer);
              exitWaiters.delete(done);
              resolve(true);
            };
            const timer = setTimeout(() => {
              exitWaiters.delete(done);
              resolve(exited);
            }, ms);
            timer.unref?.();
            exitWaiters.add(done);
          });

    const toBrowser = child.stdio[3] as Writable | null | undefined;
    const fromBrowser = child.stdio[4] as Readable | null | undefined;
    let cdp: Cdp | undefined;
    try {
      if (!toBrowser || !fromBrowser) throw new SourceReadError(TEXT.browserFailed);
      cdp = cdpOver(pipeSocket(toBrowser, fromBrowser), launchTimeout);
      // The first answer says it is ready
      await cdp.send('Browser.getVersion');
      return { cdp, pid: child.pid, waitExit, ...kill };
    } catch {
      cdp?.close();
      kill.killTree();
      await waitExit(NAVEGADOR_CLOSE_WAIT_MS);
      throw new SourceReadError(TEXT.browserFailed);
    }
  }

  return async (profileDir) => {
    const exe = (opts.find ?? (() => findBrowser({ platform })))();
    if (!exe) throw new SourceReadError(TEXT.noBrowser);
    // The very first start for a user folder may never answer; the next one does
    let last: unknown;
    for (let i = 0; i < NAVEGADOR_LAUNCH_TRIES; i++) {
      try {
        return await startOnce(exe, profileDir);
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new SourceReadError(TEXT.browserFailed);
  };
}
