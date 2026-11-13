/**
 * Runs the local Claude Code CLI headless (`-p`) with a small model and only the web tools, and hands back its
 * structured answer. One run at a time, a time limit, cancelable, and it never throws: every failure comes back as
 * `{ ok: false, reason }`. The answer is untrusted data: each job validates and trims it (see trabajos.ts).
 *
 * The prompt goes through stdin (never the command line), the working folder is a fresh empty temp folder, and the
 * environment is the office's minus its own variables and anything that looks like a secret.
 */
import { type ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { type AsistenteConfig, readAsistenteConfig } from './config.js';
import {
  ASISTENTE_LOG_PREFIX,
  AUTH_METHOD_PAID,
  AUTH_PROVIDER_OK,
  AUTH_STATUS_ARGS,
  AUTH_TIMEOUT_MS,
  DETAIL_MAX,
  ENV_DROP_EXACT,
  ENV_DROP_PREFIXES,
  ENV_KEEP_PREFIXES,
  ENV_PAID_PREFIXES,
  ENV_SECRET_PATTERN,
  MAX_BUDGET_USD,
  MAX_TURNS,
  NATIVE_INSTALL_DIR,
  STDERR_CAP_BYTES,
  STDOUT_CAP_BYTES,
  TMP_DIR_PREFIX,
  WEB_TOOLS,
  WINDOWS_PATHEXT_FALLBACK,
} from './constants.js';

/** Why a run gave nothing usable. */
export type FalloAsistente =
  | 'no-cli' // the CLI is not installed (or its path in the config is wrong)
  | 'off' // turned off in ofertas.json
  | 'busy' // another run is going on
  | 'no-subscription' // the CLI is not signed in with a subscription (it would bill by use): never run
  | 'timeout'
  | 'cancelled'
  | 'bad-output' // it ran, but the answer was not the expected JSON
  | 'failed'; // it ran and reported an error (login, network, limits…)

export interface RunMeta {
  ms: number;
  model: string;
  /** The CLI's own estimate; with a subscription it is not billed as such. */
  costUsd?: number;
  turns?: number;
}

export type RunResult<T> =
  { ok: true; data: T; meta: RunMeta } | { ok: false; reason: FalloAsistente; detail?: string };

export interface RunJob<T> {
  prompt: string;
  /** JSON Schema of the answer, passed to --json-schema. */
  schema: object;
  /** Validates and trims the structured answer; undefined = unusable. */
  parse: (structured: unknown) => T | undefined;
}

export interface RunnerOptions {
  home?: string;
  /** Read before every run (the file is edited by hand). Default: ofertas.json → "asistente". */
  config?: () => AsistenteConfig;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Arguments put before the CLI's own: lets tests run a Node script as the CLI (command = node). */
  argsPrefix?: string[];
  log?: (msg: string) => void;
}

/** What the settings show: is the CLI there, is it turned on, which model. */
export interface RunnerInfo {
  installed: boolean;
  enabled: boolean;
  model: string;
}

export interface Runner {
  /** Whether the CLI can be found (and the assistant is not turned off). */
  available(): boolean;
  info(): RunnerInfo;
  busy(): boolean;
  run<T>(job: RunJob<T>, signal?: AbortSignal): Promise<RunResult<T>>;
  /** Stops the run in progress. false when there was none. */
  cancel(): boolean;
}

// ── Finding the CLI ──────────────────────────────────────────────────────────

function isFile(p: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(p).isFile()) {
      return false;
    }
    if (platform !== 'win32') {
      fs.accessSync(p, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key ? env[key] : undefined;
}

/**
 * Resolves the command like a shell would: a path is checked as is; a bare name is looked up in PATH (with PATHEXT
 * on Windows) and then in the native installer's folder. undefined when nothing is there.
 */
export function findCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string | undefined {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const exts =
    platform === 'win32'
      ? ['', ...(envValue(env, 'PATHEXT') ?? WINDOWS_PATHEXT_FALLBACK).split(';').filter(Boolean)]
      : [''];
  const tryBase = (base: string): string | undefined => {
    for (const ext of exts) {
      // On Windows a bare name with no extension is not runnable: only try it as is when it has one.
      if (platform === 'win32' && ext === '' && !p.extname(base)) {
        continue;
      }
      const f = base + ext.toLowerCase();
      if (isFile(f, platform)) {
        return f;
      }
    }
    return undefined;
  };
  if (command.includes('/') || command.includes('\\')) {
    return tryBase(p.resolve(command));
  }
  const dirs = (envValue(env, 'PATH') ?? '').split(p.delimiter).filter(Boolean);
  dirs.push(p.join(home, ...NATIVE_INSTALL_DIR));
  for (const dir of dirs) {
    const found = tryBase(p.join(dir.replace(/^"|"$/g, ''), command));
    if (found) {
      return found;
    }
  }
  return undefined;
}

// ── Command line ─────────────────────────────────────────────────────────────

/** The CLI's arguments. Every flag is documented in the module's README with where it came from. */
export function buildArgs(model: string, schema: object): string[] {
  const tools = WEB_TOOLS.join(',');
  return [
    '-p',
    '--model',
    model,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(schema),
    '--tools',
    tools,
    '--allowedTools',
    tools,
    '--disallowedTools',
    'mcp__*',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--restricted',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--no-chrome',
    '--disable-slash-commands',
    '--settings',
    JSON.stringify({ disableAllHooks: true }),
    '--max-turns',
    String(MAX_TURNS),
    '--max-budget-usd',
    String(MAX_BUDGET_USD),
  ];
}

/**
 * The office's environment minus its own variables, the nested-session markers, anything secret-looking and every
 * variable that gives the CLI paid access (ANTHROPIC_API_KEY and friends): the run can only use the subscription.
 */
export function cleanEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      continue;
    }
    const up = k.toUpperCase();
    if (ENV_DROP_PREFIXES.some((pre) => up.startsWith(pre))) {
      continue;
    }
    if ((ENV_DROP_EXACT as readonly string[]).includes(up)) {
      continue;
    }
    if (ENV_PAID_PREFIXES.some((pre) => up.startsWith(pre))) {
      continue;
    }
    if (ENV_SECRET_PATTERN.test(up) && !ENV_KEEP_PREFIXES.some((pre) => up.startsWith(pre))) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

// cmd.exe quoting for .cmd/.bat shims (the same rules as the cross-spawn package): Node will not run them
// without a shell, and a shim passes %* on to a second parse, so the metacharacters are escaped twice.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

export function escapeCmdCommand(file: string): string {
  return file.replace(CMD_META, '^$1');
}

export function escapeCmdArgument(arg: string, twice: boolean): string {
  let a = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  a = a.replace(/(?=(\\+?)?)\1$/, '$1$1');
  a = `"${a}"`;
  a = a.replace(CMD_META, '^$1');
  return twice ? a.replace(CMD_META, '^$1') : a;
}

function spawnCli(
  file: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): ChildProcess {
  const base = { cwd, env, windowsHide: true, stdio: 'pipe' as const };
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
    const line = [escapeCmdCommand(file), ...args.map((a) => escapeCmdArgument(a, true))].join(' ');
    const shell = envValue(env, 'COMSPEC') ?? 'cmd.exe';
    return spawn(shell, ['/d', '/s', '/c', `"${line}"`], {
      ...base,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(file, args, base);
}

function killTree(child: ChildProcess, platform: NodeJS.Platform): void {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }
  if (platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      }).on('error', () => child.kill());
    } catch {
      child.kill();
    }
    return;
  }
  child.kill('SIGTERM');
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, 2000).unref();
}

// ── Reading the answer ───────────────────────────────────────────────────────

const short = (s: string): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > DETAIL_MAX ? `${t.slice(0, DETAIL_MAX - 1)}…` : t;
};

/** The JSON envelope `--output-format json` prints: the whole stdout, or failing that its last line. */
export function parseEnvelope(stdout: string): Record<string, unknown> | undefined {
  const tryParse = (s: string): Record<string, unknown> | undefined => {
    try {
      const v = JSON.parse(s) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(stdout.trim());
  if (whole) {
    return whole;
  }
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
  return lines.length ? tryParse(lines[lines.length - 1]) : undefined;
}

/** structured_output, or a JSON object written as the plain result (older CLIs, or a model that ignored the tool). */
export function structuredFrom(env: Record<string, unknown>): unknown {
  if (env.structured_output !== undefined) {
    return env.structured_output;
  }
  if (typeof env.result === 'string') {
    const m = /\{[\s\S]*\}/.exec(env.result);
    if (m) {
      try {
        return JSON.parse(m[0]) as unknown;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// ── Subscription check ───────────────────────────────────────────────────────

/**
 * Reads `claude auth status --json`. Only a first-party login that is not an API key (the claude.ai subscription,
 * or its setup-token) may run: anything else would bill by use. Unreadable output (an old CLI) is a refusal too.
 */
export function loginVerdict(stdout: string): 'ok' | 'no-subscription' | 'unknown' {
  const env = parseEnvelope(stdout);
  if (!env) {
    return 'unknown';
  }
  const method = typeof env.authMethod === 'string' ? env.authMethod : '';
  if (
    env.loggedIn === true &&
    env.apiProvider === AUTH_PROVIDER_OK &&
    method &&
    !AUTH_METHOD_PAID.test(method)
  ) {
    return 'ok';
  }
  return 'no-subscription';
}

// ── The runner ───────────────────────────────────────────────────────────────

export function createRunner(opts: RunnerOptions = {}): Runner {
  const home = opts.home ?? os.homedir();
  const config = opts.config ?? (() => readAsistenteConfig(home));
  const platform = opts.platform ?? process.platform;
  const baseEnv = (): NodeJS.ProcessEnv => opts.env ?? process.env;
  const log = opts.log ?? ((m: string) => console.log(`${ASISTENTE_LOG_PREFIX} ${m}`));
  let current: { stop: (why: 'cancelled' | 'timeout') => void } | undefined;

  const resolveCommand = (cfg: AsistenteConfig) =>
    findCommand(cfg.command, baseEnv(), platform, home);

  /** `claude auth status --json` with the run's own environment; never rejects. */
  function checkLogin(
    file: string,
    env: NodeJS.ProcessEnv,
    onChild: (c: ChildProcess) => void,
  ): Promise<'ok' | 'no-subscription' | 'unknown'> {
    return new Promise((resolve) => {
      let out = '';
      let child: ChildProcess;
      try {
        child = spawnCli(
          file,
          [...(opts.argsPrefix ?? []), ...AUTH_STATUS_ARGS],
          os.tmpdir(),
          env,
          platform,
        );
      } catch {
        resolve('unknown');
        return;
      }
      onChild(child);
      const timer = setTimeout(() => killTree(child, platform), AUTH_TIMEOUT_MS);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        if (out.length < STDERR_CAP_BYTES) {
          out += d;
        }
      });
      child.stdin?.on('error', () => {});
      child.stdin?.end();
      child.on('error', () => {
        clearTimeout(timer);
        resolve('unknown');
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(loginVerdict(out));
      });
    });
  }

  async function run<T>(job: RunJob<T>, signal?: AbortSignal): Promise<RunResult<T>> {
    let cfg: AsistenteConfig;
    try {
      cfg = config();
    } catch {
      return { ok: false, reason: 'failed', detail: 'No se pudo leer la configuración' };
    }
    if (!cfg.enabled) {
      return { ok: false, reason: 'off' };
    }
    if (current) {
      return { ok: false, reason: 'busy' };
    }
    if (signal?.aborted) {
      return { ok: false, reason: 'cancelled' };
    }
    const file = resolveCommand(cfg);
    if (!file) {
      return { ok: false, reason: 'no-cli' };
    }
    const env = cleanEnv(baseEnv());

    // Taken right away: a second call while the login is being checked is busy too, and cancel reaches it.
    let early: 'cancelled' | 'timeout' | undefined;
    let authChild: ChildProcess | undefined;
    current = {
      stop: (why) => {
        if (!early) {
          early = why;
          if (authChild) {
            killTree(authChild, platform);
          }
        }
      },
    };
    const onEarlyAbort = () => current?.stop('cancelled');
    signal?.addEventListener('abort', onEarlyAbort, { once: true });
    const login = await checkLogin(file, env, (c) => (authChild = c));
    signal?.removeEventListener('abort', onEarlyAbort);
    if (early || login !== 'ok') {
      current = undefined;
      const r: RunResult<T> = early
        ? { ok: false, reason: early }
        : login === 'no-subscription'
          ? { ok: false, reason: 'no-subscription' }
          : {
              ok: false,
              reason: 'failed',
              detail: 'No se pudo comprobar la sesión de Claude Code',
            };
      if (!r.ok) {
        log(`sin resultado: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`);
      }
      return r;
    }

    let cwd: string;
    try {
      cwd = fs.mkdtempSync(path.join(os.tmpdir(), TMP_DIR_PREFIX));
    } catch (e) {
      current = undefined;
      return { ok: false, reason: 'failed', detail: short(String(e)) };
    }

    const started = Date.now();
    return new Promise<RunResult<T>>((resolve) => {
      let child: ChildProcess;
      let stdout = '';
      let stderr = '';
      let stopped: 'cancelled' | 'timeout' | 'overflow' | undefined;
      let settled = false;

      const finish = (r: RunResult<T>) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        current = undefined;
        try {
          fs.rmSync(cwd, { recursive: true, force: true });
        } catch {
          // A leftover empty temp folder is harmless.
        }
        if (!r.ok) {
          log(`sin resultado: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`);
        }
        resolve(r);
      };

      const stop = (why: 'cancelled' | 'timeout' | 'overflow') => {
        if (stopped || settled) {
          return;
        }
        stopped = why;
        killTree(child, platform);
      };
      const onAbort = () => stop('cancelled');
      const timer = setTimeout(() => stop('timeout'), cfg.timeoutMs);
      current = { stop };

      try {
        child = spawnCli(
          file,
          [...(opts.argsPrefix ?? []), ...buildArgs(cfg.model, job.schema)],
          cwd,
          env,
          platform,
        );
      } catch (e) {
        finish({ ok: false, reason: 'failed', detail: short(String(e)) });
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        stdout += d;
        if (stdout.length > STDOUT_CAP_BYTES) {
          stop('overflow');
        }
      });
      child.stderr?.on('data', (d: string) => {
        if (stderr.length < STDERR_CAP_BYTES) {
          stderr += d;
        }
      });
      child.stdin?.on('error', () => {
        // The CLI may exit before reading stdin (bad flag, no login): its exit says why.
      });
      child.stdin?.end(job.prompt, 'utf8');

      child.on('error', (e: NodeJS.ErrnoException) => {
        finish(
          e.code === 'ENOENT'
            ? { ok: false, reason: 'no-cli' }
            : { ok: false, reason: 'failed', detail: short(e.message) },
        );
      });

      child.on('close', (code) => {
        if (stopped === 'timeout' || stopped === 'cancelled') {
          finish({ ok: false, reason: stopped });
          return;
        }
        if (stopped === 'overflow') {
          finish({ ok: false, reason: 'bad-output', detail: 'Respuesta demasiado larga' });
          return;
        }
        const env = parseEnvelope(stdout);
        if (!env) {
          finish(
            code === 0
              ? { ok: false, reason: 'bad-output', detail: 'La salida no es JSON' }
              : {
                  ok: false,
                  reason: 'failed',
                  detail: short(stderr || stdout || `salió con código ${code}`),
                },
          );
          return;
        }
        const subtype = typeof env.subtype === 'string' ? env.subtype : '';
        if (env.is_error === true || (subtype && subtype !== 'success')) {
          const text = typeof env.result === 'string' ? env.result : '';
          finish({
            ok: false,
            reason: /structured/i.test(subtype) ? 'bad-output' : 'failed',
            detail: short([subtype, text].filter(Boolean).join(': ') || `código ${code}`),
          });
          return;
        }
        const structured = structuredFrom(env);
        let data: T | undefined;
        try {
          data = structured === undefined ? undefined : job.parse(structured);
        } catch {
          data = undefined;
        }
        if (data === undefined) {
          finish({ ok: false, reason: 'bad-output', detail: 'La respuesta no cumple el formato' });
          return;
        }
        const meta: RunMeta = { ms: Date.now() - started, model: cfg.model };
        if (typeof env.total_cost_usd === 'number' && Number.isFinite(env.total_cost_usd)) {
          meta.costUsd = env.total_cost_usd;
        }
        if (typeof env.num_turns === 'number') {
          meta.turns = env.num_turns;
        }
        finish({ ok: true, data, meta });
      });
    });
  }

  return {
    available() {
      try {
        const cfg = config();
        return cfg.enabled && resolveCommand(cfg) !== undefined;
      } catch {
        return false;
      }
    },
    info() {
      try {
        const cfg = config();
        return {
          installed: resolveCommand(cfg) !== undefined,
          enabled: cfg.enabled,
          model: cfg.model,
        };
      } catch {
        return { installed: false, enabled: false, model: '' };
      }
    },
    busy: () => current !== undefined,
    run,
    cancel() {
      if (!current) {
        return false;
      }
      current.stop('cancelled');
      return true;
    },
  };
}
