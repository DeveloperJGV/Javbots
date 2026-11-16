import { type ChildProcess, spawn, type SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import type { AccesosStatus, AccesoView } from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { type Acceso, type AccesosConfig, localUrl, readAccesosFile } from './accesosConfig.js';
import {
  ACCESOS_FILE,
  CHECK_EVERY_MS,
  CHECK_TIMEOUT_MS,
  ENV_DROP_PREFIXES,
  ENV_SECRET_PATTERN,
  LOG_DIR,
  LOG_PREFIX,
  MESSAGES,
  START_POLL_MS,
  START_TIMEOUT_MS,
} from './constants.js';

export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface AccesosFeatureOptions {
  /** The home folder (tests: a temp folder); the list is <home>/.pixel-agents/accesos.json. */
  home?: string;
  platform?: NodeJS.Platform;
  /** Whether the page answers (tests: a double). Only ever called with a checked local address. */
  check?: (url: string) => Promise<boolean>;
  /** How a page is started (tests: a double). */
  spawnProcess?: SpawnFn;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  checkEveryMs?: number;
  startPollMs?: number;
  startTimeoutMs?: number;
}

const send = (client: FeatureClient, msg: object) =>
  client.send(msg as unknown as Record<string, unknown>);

/**
 * Whether a page on this computer answers: one GET with a short time limit, any HTTP answer counts (a 404 is still
 * a server that is on). Redirects are not followed, and anything that is not a local address is never asked.
 */
export function checkLocalPage(url: string, timeoutMs = CHECK_TIMEOUT_MS): Promise<boolean> {
  const safe = localUrl(url);
  if (!safe) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (on: boolean) => {
      if (done) return;
      done = true;
      resolve(on);
    };
    try {
      const req = http.get(safe, { agent: false, timeout: timeoutMs }, (res) => {
        res.resume();
        finish(true);
        req.destroy();
      });
      req.on('timeout', () => {
        req.destroy();
        finish(false);
      });
      req.on('error', () => finish(false));
    } catch {
      finish(false);
    }
  });
}

/** The office's environment without its own variables, the Claude Code session markers or anything secret. */
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    const up = k.toUpperCase();
    if (ENV_DROP_PREFIXES.some((pre) => up.startsWith(pre))) continue;
    if (ENV_SECRET_PATTERN.test(up)) continue;
    out[k] = v;
  }
  return out;
}

function isFolder(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pages that run on this computer, opened from a piece of furniture (features/accesos). The list is the owner's
 * hand-written ~/.pixel-agents/accesos.json; the office checks whether each page answers and, when the file says how,
 * starts it. Only tokened connections see the list or start anything, and a start message carries just the id: the
 * command always comes from the file.
 */
export function createAccesosFeature(opts: AccesosFeatureOptions = {}): ServerFeature & {
  /** For tests: check every page now and send the result. */
  refresh(): Promise<void>;
  /** For tests: whether the page is being started. */
  isStarting(id: string): boolean;
} {
  const pixelDir = path.join(opts.home ?? os.homedir(), '.pixel-agents');
  const file = path.join(pixelDir, ACCESOS_FILE);
  const platform = opts.platform ?? process.platform;
  const check = opts.check ?? ((url: string) => checkLocalPage(url));
  const spawnProcess: SpawnFn = opts.spawnProcess ?? ((c, a, o) => spawn(c, a, o));
  const now = opts.now ?? Date.now;
  const checkEveryMs = opts.checkEveryMs ?? CHECK_EVERY_MS;
  const pollMs = opts.startPollMs ?? START_POLL_MS;
  const startTimeoutMs = opts.startTimeoutMs ?? START_TIMEOUT_MS;

  const clients = new Set<FeatureClient>();
  /** Last answer of each page (by id); missing = not checked yet. */
  const on = new Map<string, boolean>();
  /** Pages being started, with their poll timer. */
  const starting = new Map<string, { timer: ReturnType<typeof setInterval> | null }>();
  /** The last start that went wrong, per page, in words. */
  const errors = new Map<string, string>();
  let config: AccesosConfig = { accesos: [], problems: [] };
  let periodic: ReturnType<typeof setInterval> | null = null;
  let refreshing: Promise<void> | null = null;
  let disposed = false;

  const load = (): AccesosConfig => (config = readAccesosFile(file, platform));

  function view(a: Acceso): AccesoView {
    const state = starting.has(a.id)
      ? 'starting'
      : on.has(a.id)
        ? on.get(a.id)
          ? 'on'
          : 'off'
        : 'unknown';
    const out: AccesoView = {
      id: a.id,
      name: a.nombre,
      description: a.descripcion,
      url: a.url,
      canStart: !!a.iniciar,
      state,
    };
    const error = errors.get(a.id);
    if (error && state !== 'on') out.error = error;
    return out;
  }

  function status(): AccesosStatus {
    return {
      type: 'accesosStatus',
      accesos: config.accesos.map(view),
      file,
      problems: config.problems,
    };
  }

  const broadcast = () => {
    if (disposed) return;
    const msg = status();
    for (const c of clients) send(c, msg);
  };

  /** Re-reads the list and asks every page (not the ones being started: their own poll does). */
  function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    load();
    const ids = new Set(config.accesos.map((a) => a.id));
    for (const id of [...on.keys()]) if (!ids.has(id)) on.delete(id);
    refreshing = Promise.all(
      config.accesos
        .filter((a) => !starting.has(a.id))
        .map(async (a) => {
          const answered = await check(a.url).catch(() => false);
          if (!starting.has(a.id)) on.set(a.id, answered);
          if (answered) errors.delete(a.id);
        }),
    ).then(
      () => {
        refreshing = null;
        broadcast();
      },
      () => {
        refreshing = null;
      },
    );
    return refreshing;
  }

  function stopStarting(id: string, error?: string): void {
    const s = starting.get(id);
    if (!s) return;
    if (s.timer) clearInterval(s.timer);
    starting.delete(id);
    if (error) {
      errors.set(id, error);
      on.set(id, false);
      console.warn(`${LOG_PREFIX} ${id}: ${error}`);
    }
    broadcast();
  }

  /** Starts a page with the command of the owner's file (never one from a message), apart from the office. */
  async function start(id: unknown): Promise<void> {
    if (typeof id !== 'string') return;
    load();
    const acceso = config.accesos.find((a) => a.id === id);
    if (!acceso) {
      broadcast();
      return;
    }
    if (starting.has(id)) return; // at most one start per page at a time
    const run = acceso.iniciar;
    if (!run) {
      errors.set(id, 'El archivo no dice cómo prender esta página.');
      broadcast();
      return;
    }
    starting.set(id, { timer: null });
    errors.delete(id);
    broadcast();
    // Already on (or started by hand meanwhile): nothing to start
    if (await check(acceso.url).catch(() => false)) {
      on.set(id, true);
      stopStarting(id);
      return;
    }
    if (!isFolder(run.carpeta)) {
      stopStarting(id, `No existe la carpeta ${run.carpeta}.`);
      return;
    }
    let out: number | 'ignore' = 'ignore';
    try {
      const logs = path.join(pixelDir, LOG_DIR);
      fs.mkdirSync(logs, { recursive: true });
      out = fs.openSync(path.join(logs, `${id}.log`), 'w');
    } catch {
      out = 'ignore';
    }
    let child: ChildProcess;
    try {
      child = spawnProcess(run.comando, run.argumentos, {
        cwd: run.carpeta,
        env: cleanEnv(opts.env ?? process.env),
        detached: true,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', out, out],
      });
    } catch (err) {
      stopStarting(id, `No se pudo prender: ${(err as Error).message}`);
      return;
    } finally {
      if (typeof out === 'number') {
        try {
          fs.closeSync(out);
        } catch {
          /* already closed */
        }
      }
    }
    child.on('error', (err: NodeJS.ErrnoException) => {
      stopStarting(
        id,
        err.code === 'ENOENT'
          ? `No encontré el programa «${run.comando}».`
          : `No se pudo prender: ${err.message}`,
      );
    });
    child.on('exit', (code) => {
      // A launcher that hands the page to another process and ends well is fine: the poll keeps asking
      if (starting.has(id) && code !== 0)
        stopStarting(
          id,
          `Se cerró antes de contestar (código ${code ?? '?'}). Lo que escribió está en ${path.join(LOG_DIR, `${id}.log`)}.`,
        );
    });
    child.unref();
    console.log(`${LOG_PREFIX} Prendiendo ${id} (pid ${child.pid ?? '?'})`);

    const startedAt = now();
    let asking = false;
    const s = starting.get(id);
    if (!s) return;
    s.timer = setInterval(() => {
      if (asking || !starting.has(id)) return;
      if (now() - startedAt > startTimeoutMs) {
        stopStarting(
          id,
          `No contestó en ${Math.round(startTimeoutMs / 1000)} s. Puede que siga arrancando: revisa en un rato.`,
        );
        return;
      }
      asking = true;
      void check(acceso.url)
        .catch(() => false)
        .then((answered) => {
          asking = false;
          if (answered && starting.has(id)) {
            on.set(id, true);
            stopStarting(id);
          }
        });
    }, pollMs);
  }

  function startPeriodic(): void {
    if (periodic || checkEveryMs <= 0) return;
    periodic = setInterval(() => void refresh(), checkEveryMs);
    periodic.unref?.();
  }

  function stopPeriodic(): void {
    if (periodic) clearInterval(periodic);
    periodic = null;
  }

  return {
    name: 'accesos',
    refresh,
    isStarting: (id) => starting.has(id),

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      startPeriodic();
      return () => {
        clients.delete(client);
        if (clients.size === 0) stopPeriodic();
      };
    },

    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady') {
        if (client.privileged) {
          load();
          send(client, status());
          void refresh();
        }
        return false; // the core handler still runs
      }
      if (!(MESSAGES as readonly string[]).includes(String(msg.type))) return false;
      if (!client.privileged) {
        console.warn(`${LOG_PREFIX} Ignorando ${String(msg.type)} de un cliente sin token.`);
        return true;
      }
      if (msg.type === 'accesosOpen') {
        load();
        send(client, status());
        void refresh();
      } else if (msg.type === 'accesosStart') {
        start(msg.id).catch((err) =>
          console.warn(`${LOG_PREFIX} No pude prender ${String(msg.id)}:`, (err as Error).message),
        );
      }
      return true;
    },

    dispose() {
      disposed = true;
      stopPeriodic();
      for (const s of starting.values()) if (s.timer) clearInterval(s.timer);
      starting.clear();
    },
  };
}
