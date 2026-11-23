import { execFile, spawn } from 'child_process';

import type { RuedaStatus } from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import {
  ARGS,
  COMMAND_TIMEOUT_MS,
  LOG_PREFIX,
  MESSAGE_MS,
  POLL_FAST_FOR_MS,
  POLL_FAST_MS,
  POLL_MS,
  RUEDA_PROGRAM_DIR_ENV,
} from './constants.js';
import {
  type Launcher,
  pidAlive,
  readLauncher,
  readStatus,
  ruedaDir,
  validatePatch,
  writeSettings,
} from './ruedaFiles.js';

/** How the office runs the program. Always the launcher's interpreter + script, plus fixed arguments. */
export interface RuedaRunner {
  /** Starts the program and lets it live on its own (it outlives the office). */
  start(launcher: Launcher, env: NodeJS.ProcessEnv): void;
  /** Runs a short command of the program; resolves with its exit code (null: it did not finish). */
  run(launcher: Launcher, args: readonly string[], env: NodeJS.ProcessEnv): Promise<number | null>;
}

/** The message while the program starts. */
const STARTING = 'Prendiendo…';

export const processRunner: RuedaRunner = {
  start(launcher, env) {
    const child = spawn(launcher.python, [launcher.script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
    child.on('error', (e) => console.warn(`${LOG_PREFIX} No arrancó: ${e.message}`));
    child.unref();
  },
  run(launcher, args, env) {
    return new Promise((resolve) => {
      execFile(
        launcher.python,
        [launcher.script, ...args],
        { timeout: COMMAND_TIMEOUT_MS, windowsHide: true, env },
        (err) => {
          if (!err) return resolve(0);
          const code = (err as NodeJS.ErrnoException & { code?: unknown }).code;
          resolve(typeof code === 'number' ? code : null);
        },
      );
    });
  },
};

export interface RuedaOptions {
  /** The program's data folder (default: JAVBOTS_RUEDA_DIR, else %APPDATA%\rueda-volumen). */
  dataDir?: string;
  /** Only Windows has the program; elsewhere the feature stays off. */
  platform?: NodeJS.Platform;
  runner?: RuedaRunner;
  alive?: (pid: number) => boolean;
  /** Off in tests: they call poll() themselves. */
  timers?: boolean;
  now?: () => number;
}

export interface Rueda {
  connect(client: FeatureClient): () => void;
  /** Sends the status to a page that just opened (privileged only). */
  greet(client: FeatureClient): void;
  /** Handles `ruedaCommand`; resolves when the action is done (tests wait on it). */
  handle(msg: Record<string, unknown>, client: FeatureClient): Promise<void>;
  status(): RuedaStatus;
  /** Reads the files and tells the pages if something changed. */
  poll(): void;
  dispose(): void;
}

/**
 * "Rueda de volumen" seen from the office (features/musica/rueda): a separate Windows program that sends the volume
 * keys to the Spotify device that is playing. The office reads its state file, writes its settings file and runs
 * only the launcher the program wrote about itself, with fixed arguments. Owner (privileged) pages only.
 */
export function createRueda(opts: RuedaOptions = {}): Rueda {
  const enabled = (opts.platform ?? process.platform) === 'win32';
  const dir = opts.dataDir ?? ruedaDir();
  const runner = opts.runner ?? processRunner;
  const alive = opts.alive ?? pidAlive;
  const now = opts.now ?? Date.now;
  const clients = new Set<FeatureClient>();
  const env = (): NodeJS.ProcessEnv => ({ ...process.env, [RUEDA_PROGRAM_DIR_ENV]: dir });
  let lastSent = '';
  let busy = false;
  let message: string | undefined;
  let messageAt = 0;
  let timer: NodeJS.Timeout | null = null;
  let fastUntil = 0;

  function status(): RuedaStatus {
    const s = readStatus(dir, alive);
    // "Prendiendo…" is done once it runs
    if (message === STARTING && s.running) message = undefined;
    if (busy) s.busy = true;
    if (message && (busy || now() - messageAt < MESSAGE_MS)) s.message = message;
    return s;
  }

  function broadcast(s: RuedaStatus): void {
    const msg = s as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  }

  function poll(): void {
    if (!enabled || clients.size === 0) return;
    const s = status();
    const json = JSON.stringify(s);
    if (json === lastSent) return;
    lastSent = json;
    broadcast(s);
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (opts.timers === false || !enabled || clients.size === 0) return;
    timer = setTimeout(
      () => {
        poll();
        schedule();
      },
      Date.now() < fastUntil ? POLL_FAST_MS : POLL_MS,
    );
    timer.unref?.();
  }

  function hurry(): void {
    fastUntil = Date.now() + POLL_FAST_FOR_MS;
    schedule();
  }

  function say(text: string | undefined): void {
    message = text;
    messageAt = now();
    poll();
  }

  async function command(
    launcher: Launcher,
    args: readonly string[],
    ok: string,
    failed: string,
  ): Promise<void> {
    busy = true;
    say(message);
    let code: number | null = null;
    try {
      code = await runner.run(launcher, args, env());
    } catch {
      code = null;
    }
    busy = false;
    console.log(`${LOG_PREFIX} ${args.join(' ')} → ${code === null ? 'sin respuesta' : code}`);
    say(code === 0 ? ok : failed);
    hurry();
  }

  async function handle(msg: Record<string, unknown>, client: FeatureClient): Promise<void> {
    if (!enabled || !client.privileged || busy) return;
    const action = msg.action;
    const launcher = readLauncher(dir);
    const now = readStatus(dir, alive);
    switch (action) {
      case 'set': {
        const checked = validatePatch(msg.settings);
        if ('error' in checked) return say(checked.error);
        const problem = writeSettings(dir, checked.ok);
        say(problem ?? undefined);
        if (!problem) hurry();
        return;
      }
      case 'start': {
        if (now.running) return say('Ya está prendida.');
        if (!launcher)
          return say(
            'Prende la rueda una vez a mano (doble clic en rueda.pyw); después ya se prende desde aquí.',
          );
        try {
          runner.start(launcher, env());
          console.log(`${LOG_PREFIX} Prendiendo la rueda`);
          say(STARTING);
        } catch (e) {
          say(`No arrancó (${(e as Error).message}).`);
        }
        hurry();
        return;
      }
      case 'stop': {
        if (!now.running) return say('Ya estaba apagada.');
        if (!launcher) return say('No encontré con qué apagarla: ciérrala desde su ícono.');
        return command(launcher, ARGS.stop, 'Apagada.', 'No contestó; ciérrala desde su ícono.');
      }
      case 'signIn': {
        if (!now.running) return say('Primero prende la rueda.');
        if (!launcher) return say('Inicia sesión desde el ícono junto al reloj.');
        return command(
          launcher,
          ARGS.signIn,
          'Se abrió el inicio de sesión de Spotify en tu navegador.',
          'No contestó: inicia sesión desde el ícono junto al reloj.',
        );
      }
      case 'startup': {
        if (typeof msg.on !== 'boolean') return;
        if (!launcher) return say('Prende la rueda una vez a mano primero.');
        return command(
          launcher,
          msg.on ? ARGS.startupOn : ARGS.startupOff,
          msg.on ? 'Se prenderá sola al entrar a Windows.' : 'Ya no se prende sola con Windows.',
          'No pude cambiar el arranque con Windows.',
        );
      }
      default:
        return;
    }
  }

  return {
    connect(client) {
      if (!enabled || !client.privileged) return () => {};
      clients.add(client);
      schedule();
      return () => {
        clients.delete(client);
        if (clients.size === 0) {
          if (timer) clearTimeout(timer);
          timer = null;
          lastSent = '';
        }
      };
    },
    greet(client) {
      if (!enabled || !client.privileged) return;
      client.send(status() as unknown as Record<string, unknown>);
    },
    handle,
    status,
    poll,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      clients.clear();
    },
  };
}
