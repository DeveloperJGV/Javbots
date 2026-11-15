import { execFile } from 'child_process';

import { herdrBins } from '../../herdr/server/constants.js';
import {
  HERDR_CHECK_MS,
  HERDR_QUICK_MS,
  HERDR_RUN_RETRY_MS,
  HERDR_RUN_WAIT_MS,
  HERDR_START_MS,
  HERDR_START_TIMEOUT_ARG,
  LOG_PREFIX,
  MODEL_RE,
} from './constants.js';

/** What a room needs to put an agent to work on a request. */
export interface AgentLauncher {
  /** Whether an agent can be opened from the office right now (cached; never throws). */
  check(): Promise<{ available: boolean; detail?: string }>;
  /**
   * Opens a terminal in `cwd` with Claude Code (normal permissions) and hands it `prompt`. With `agent`, only hands the
   * prompt again to that agent (it was waiting for the owner). `ready: false` = the agent waits for the owner in its
   * terminal (e.g. "do you trust this folder?") and has not taken the prompt yet.
   */
  launch(opts: {
    name: string;
    label: string;
    cwd: string;
    prompt: string;
    agent?: string;
  }): Promise<{ agent: string; ready: boolean; detail?: string }>;
}

/** Runs the herdr CLI with a timeout: stdout, or a rejection with herdr's own error text. Injectable for tests. */
export type HerdrExec = (args: string[], timeoutMs: number) => Promise<string>;

function execWith(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // execFile: no shell, so nothing in the arguments is ever interpreted.
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err)
        reject(
          Object.assign(new Error((stderr || stdout || err.message).trim()), { code: err.code }),
        );
      else resolve(stdout);
    });
  });
}

/** The first herdr binary that exists (features/herdr's list) wins and is remembered. */
export function createHerdrExec(bins: string[] = herdrBins()): HerdrExec {
  let found: string | null = null;
  return async (args, timeoutMs) => {
    if (found) return execWith(found, args, timeoutMs);
    let lastErr: unknown = new Error('herdr no está instalado');
    for (const bin of bins) {
      try {
        const out = await execWith(bin, args, timeoutMs);
        found = bin;
        return out;
      } catch (err) {
        lastErr = err;
        if ((err as { code?: unknown }).code !== 'ENOENT') throw err;
      }
    }
    throw lastErr;
  };
}

/** `.result.root_pane.pane_id` of `herdr tab create` (herdr's documented shape). */
export function paneIdOf(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as { result?: { root_pane?: { pane_id?: unknown } } };
    const id = parsed.result?.root_pane?.pane_id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/** `.result.tab.tab_id` of `herdr tab create`, to close it again if nothing could be started in it. */
export function tabIdOf(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as { result?: { tab?: { tab_id?: unknown } } };
    const id = parsed.result?.tab?.tab_id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/** `.result.agent.agent_status` of `herdr agent get` / `herdr agent wait` (working, blocked, idle, done, unknown). */
export function agentStatusOf(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as { result?: { agent?: { agent_status?: unknown } } };
    const status = parsed.result?.agent?.agent_status;
    return typeof status === 'string' && status ? status : null;
  } catch {
    return null;
  }
}

const NOT_READY = /agent_not_ready|agent_blocked/;
/** `herdr agent start` does not see the new tab's shell as free (Windows + Git Bash): Claude is typed in instead. */
const PANE_BUSY = /agent_pane_busy|not an available shell/;
/** A prompt typed into a shell goes between single quotes: these could end them or the line. */
const UNSAFE_IN_QUOTES = /['\u0000-\u001f\u007f]/;

/**
 * The line `herdr pane run` types into the new tab's shell when `agent start` cannot be used:
 * `claude [--model X] '<prompt>'`. Single quotes keep everything literal in bash and in PowerShell alike; a prompt with
 * a single quote or a control character is refused instead of escaped (the escapes differ between those shells). The
 * model is only added when it is a plain model id (`modelArgs`). Never --dangerously-skip-permissions.
 */
export function paneRunCommand(prompt: string, model: string | undefined): string {
  if (!prompt.trim() || UNSAFE_IN_QUOTES.test(prompt))
    throw new Error('el encargo tiene caracteres que no puedo escribir en la terminal');
  const flags = modelArgs(model).slice(1); // without the `--` herdr needs: Claude takes them directly
  return ['claude', ...flags, `'${prompt}'`].join(' ');
}

export interface HerdrLauncherOptions {
  /**
   * Claude Code model the agent starts with (`claude --model <it>`, through `herdr agent start … -- --model <it>`),
   * read on every launch. Empty or undefined = the machine's default. A name that is not a plain model id is ignored.
   */
  model?: () => string | undefined;
  /** Waits between `herdr agent wait` tries (tests make it instant). */
  sleep?: (ms: number) => Promise<void>;
}

/** The extra arguments herdr passes to Claude Code for `model` (none when it is empty or not a plain model id). */
export function modelArgs(model: string | undefined): string[] {
  const m = (model ?? '').trim();
  if (!m) return [];
  if (!MODEL_RE.test(m)) {
    console.warn(`${LOG_PREFIX} Modelo ignorado (no es un nombre de modelo): ${m.slice(0, 40)}`);
    return [];
  }
  return ['--', '--model', m];
}

/**
 * Agents in herdr (herdr.dev), the terminal the owner already uses: a new tab in the agent's folder, `herdr agent
 * start --kind claude` (Claude Code with its normal permissions: never --dangerously-skip-permissions), then the prompt
 * through `herdr agent prompt`, which types it into Claude, not into a shell.
 *
 * Where `agent start` refuses the new tab (`agent_pane_busy`: herdr does not see its shell as free, as on Windows with
 * Git Bash), Claude is typed into that tab instead: `herdr pane run <pane> "claude [--model X] '<prompt>'"` (the prompt
 * is one line the server builds; see `paneRunCommand`), then `herdr agent wait <pane> --until working --until blocked`
 * tells whether it took it. That agent is known by its pane id. If nothing worked, the tab this launch opened is closed
 * again, so no empty tabs pile up.
 */
export function createHerdrLauncher(
  exec: HerdrExec = createHerdrExec(),
  now = Date.now,
  options: HerdrLauncherOptions = {},
): AgentLauncher {
  let checked: { at: number; available: boolean; detail?: string } | null = null;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  /** Panes where Claude was started with the prompt on its command line (it must not be handed it twice). */
  const promptInLine = new Set<string>();

  /** Closes the tab this launch opened (best effort: a failure to close only leaves the tab). */
  async function closeTab(tab: string | null, pane: string): Promise<void> {
    try {
      await exec(tab ? ['tab', 'close', tab] : ['pane', 'close', pane], HERDR_QUICK_MS);
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude cerrar la pestaña de herdr:`, (err as Error).message);
    }
  }

  /** Waits until herdr sees Claude in `pane` working or asking something: its status, or the last error. */
  async function waitStarted(pane: string): Promise<string> {
    const until = now() + HERDR_RUN_WAIT_MS;
    let lastErr: unknown = new Error('Claude no arrancó a tiempo en herdr.');
    for (;;) {
      const left = until - now();
      if (left <= 0) throw lastErr;
      try {
        const out = await exec(
          [
            'agent',
            'wait',
            pane,
            '--until',
            'working',
            '--until',
            'blocked',
            '--timeout',
            String(left),
          ],
          left + HERDR_QUICK_MS,
        );
        return agentStatusOf(out) ?? 'working';
      } catch (err) {
        // No agent in the pane yet (Claude is still starting): ask again.
        lastErr = err;
        await sleep(HERDR_RUN_RETRY_MS);
      }
    }
  }

  /** The fallback: types Claude into the pane with the prompt on its command line. */
  async function runInPane(
    pane: string,
    prompt: string,
  ): Promise<{ agent: string; ready: boolean; detail?: string }> {
    await exec(['pane', 'run', pane, paneRunCommand(prompt, options.model?.())], HERDR_QUICK_MS);
    const status = await waitStarted(pane);
    promptInLine.add(pane);
    if (status === 'blocked')
      return {
        agent: pane,
        ready: false,
        detail:
          'Claude te pregunta algo en herdr antes de empezar (por ejemplo, si confías en la carpeta). Ya tiene el encargo: al contestarle empieza solo.',
      };
    return { agent: pane, ready: true };
  }

  return {
    async check() {
      if (checked && now() - checked.at < HERDR_CHECK_MS) return checked;
      try {
        await exec(['agent', 'list'], HERDR_QUICK_MS);
        checked = { at: now(), available: true };
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        checked = {
          at: now(),
          available: false,
          detail:
            code === 'ENOENT'
              ? 'No encontré herdr en esta computadora.'
              : 'herdr no respondió (¿está abierto?).',
        };
      }
      return checked;
    },

    async launch({ name, label, cwd, prompt, agent }) {
      if (agent) {
        if (promptInLine.has(agent)) {
          // Claude got the prompt when it started: hand it again only once it is no longer on it.
          try {
            const status = agentStatusOf(await exec(['agent', 'get', agent], HERDR_QUICK_MS));
            if (status === 'working') return { agent, ready: true };
            if (status === 'blocked')
              return {
                agent,
                ready: false,
                detail: 'Claude sigue esperando tu respuesta en herdr.',
              };
          } catch {
            // The agent is gone (tab closed): the prompt below fails too and a new one is opened.
          }
          promptInLine.delete(agent);
        }
        try {
          await exec(['agent', 'prompt', agent, prompt], HERDR_QUICK_MS);
          return { agent, ready: true };
        } catch (err) {
          if (NOT_READY.test((err as Error).message))
            return { agent, ready: false, detail: 'Claude sigue esperando tu respuesta en herdr.' };
          // The agent is gone (tab closed): open a new one below.
        }
      }
      const created = await exec(
        ['tab', 'create', '--cwd', cwd, '--label', label, '--no-focus'],
        HERDR_QUICK_MS,
      );
      const pane = paneIdOf(created);
      const tab = tabIdOf(created);
      if (!pane) {
        if (tab) await closeTab(tab, '');
        throw new Error('herdr no dijo qué panel abrió.');
      }
      checked = { at: now(), available: true };
      try {
        try {
          await exec(
            [
              'agent',
              'start',
              name,
              '--kind',
              'claude',
              '--pane',
              pane,
              '--timeout',
              HERDR_START_TIMEOUT_ARG,
              ...modelArgs(options.model?.()),
            ],
            HERDR_START_MS,
          );
        } catch (err) {
          const message = (err as Error).message;
          if (NOT_READY.test(message))
            return { agent: name, ready: false, detail: 'Claude espera tu respuesta en herdr.' };
          if (PANE_BUSY.test(message)) return await runInPane(pane, prompt);
          throw err;
        }
        try {
          await exec(['agent', 'prompt', name, prompt], HERDR_QUICK_MS);
        } catch (err) {
          if (NOT_READY.test((err as Error).message))
            return { agent: name, ready: false, detail: 'Claude espera tu respuesta en herdr.' };
          throw err;
        }
        return { agent: name, ready: true };
      } catch (err) {
        // Nothing could be started: close the tab this launch opened (only that one).
        await closeTab(tab, pane);
        throw err;
      }
    },
  };
}
