import { execFile } from 'child_process';

import { herdrBins } from '../../herdr/server/constants.js';
import {
  HERDR_CHECK_MS,
  HERDR_QUICK_MS,
  HERDR_START_MS,
  HERDR_START_TIMEOUT_ARG,
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

const NOT_READY = /agent_not_ready|agent_blocked/;

/**
 * Agents in herdr (herdr.dev), the terminal the owner already uses: a new tab in the agent's folder, `herdr agent
 * start --kind claude` (Claude Code with its normal permissions: never --dangerously-skip-permissions), then the prompt
 * through `herdr agent prompt`, which types it into Claude, not into a shell. The prompt never reaches a command line.
 */
export function createHerdrLauncher(
  exec: HerdrExec = createHerdrExec(),
  now = Date.now,
): AgentLauncher {
  let checked: { at: number; available: boolean; detail?: string } | null = null;

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
        try {
          await exec(['agent', 'prompt', agent, prompt], HERDR_QUICK_MS);
          return { agent, ready: true };
        } catch (err) {
          if (NOT_READY.test((err as Error).message))
            return { agent, ready: false, detail: 'Claude sigue esperando tu respuesta en herdr.' };
          // The agent is gone (tab closed): open a new one below.
        }
      }
      const tab = await exec(
        ['tab', 'create', '--cwd', cwd, '--label', label, '--no-focus'],
        HERDR_QUICK_MS,
      );
      const pane = paneIdOf(tab);
      if (!pane) throw new Error('herdr no dijo qué panel abrió.');
      checked = { at: now(), available: true };
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
          ],
          HERDR_START_MS,
        );
      } catch (err) {
        if (NOT_READY.test((err as Error).message))
          return { agent: name, ready: false, detail: 'Claude espera tu respuesta en herdr.' };
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
    },
  };
}
