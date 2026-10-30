import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { UsageLimit } from '../../../core/src/messages.js';
import { USAGE_COMMAND_TIMEOUT_MS } from './constants.js';

/** What `/usage` said, by the statusline's key names: five_hour, seven_day, seven_day_fable… */
export type CommandLimits = Record<string, UsageLimit>;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * "Oct 28, 7am", "6:40am" (today) → the moment, in this machine's time zone (the one `/usage` prints).
 * A date already past this year is next year's.
 */
export function parseResetsAt(text: string, now: Date): string | undefined {
  const m = /^(?:([A-Za-z]{3})\w*\s+(\d{1,2}),?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(
    text.trim(),
  );
  if (!m) return undefined;
  const month = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : now.getMonth();
  if (month < 0) return undefined;
  const day = m[2] ? Number(m[2]) : now.getDate();
  const hour = (Number(m[3]) % 12) + (m[5].toLowerCase() === 'pm' ? 12 : 0);
  const at = new Date(now.getFullYear(), month, day, hour, m[4] ? Number(m[4]) : 0);
  if (m[1] && at.getTime() < now.getTime() - 24 * 3600_000) at.setFullYear(at.getFullYear() + 1);
  return at.toISOString();
}

/** The plan lines of `/usage` ("Current session: 1% used · resets …", "Current week (Fable): 96% used …"). */
export function parseUsageCommand(text: string, now: Date): CommandLimits {
  const out: CommandLimits = {};
  for (const line of text.split(/\r?\n/)) {
    const m =
      /^\s*Current (session|week)(?:\s*\(([^)]+)\))?:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+))?$/i.exec(
        line,
      );
    if (!m) continue;
    let key = 'five_hour';
    if (m[1].toLowerCase() === 'week') {
      const scope = (m[2] ?? 'all models').trim().toLowerCase();
      key = scope === 'all models' ? 'seven_day' : `seven_day_${scope.replace(/\W+/g, '_')}`;
    }
    const limit: UsageLimit = { pct: Math.min(100, Number(m[3])) };
    const resetsAt = m[4] ? parseResetsAt(m[4], now) : undefined;
    if (resetsAt) limit.resetsAt = resetsAt;
    out[key.slice(0, 60)] = limit;
  }
  return out;
}

/** `claude` itself: PATH first, then the native install (the office console may not have it on PATH). */
export function claudeBins(): string[] {
  const local = path.join(os.homedir(), '.local', 'bin');
  return [
    'claude',
    ...['claude.exe', 'claude'].map((f) => path.join(local, f)).filter((f) => fs.existsSync(f)),
  ];
}

export interface UsageCommandResult {
  text: string;
  /** What the run cost: 0 when `/usage` was answered by Claude Code itself, as it should be. */
  costUsd: number;
}

/**
 * Asks Claude Code for `/usage` without opening a session: print mode, no hooks (the office would see an agent),
 * nothing saved, one turn of the cheapest model in case `/usage` ever stops being a local command.
 */
export function runUsageCommand(bins: string[] = claudeBins()): Promise<UsageCommandResult | null> {
  const args = [
    '-p',
    '/usage',
    '--no-session-persistence',
    '--output-format',
    'json',
    '--max-turns',
    '1',
    '--model',
    'haiku',
    '--settings',
    JSON.stringify({ disableAllHooks: true }),
  ];
  const tryBin = (i: number): Promise<UsageCommandResult | null> =>
    new Promise((resolve) => {
      if (i >= bins.length) return resolve(null);
      execFile(
        bins[i],
        args,
        {
          timeout: USAGE_COMMAND_TIMEOUT_MS,
          windowsHide: true,
          cwd: os.tmpdir(),
          maxBuffer: 1 << 20,
        },
        (err, stdout) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT')
            return resolve(tryBin(i + 1));
          try {
            const json = JSON.parse(stdout) as { result?: unknown; total_cost_usd?: unknown };
            resolve({
              text: typeof json.result === 'string' ? json.result : '',
              costUsd: typeof json.total_cost_usd === 'number' ? json.total_cost_usd : 0,
            });
          } catch {
            resolve(null);
          }
        },
      );
    });
  return tryBin(0);
}
