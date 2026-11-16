/**
 * Browsers of the reader left alive by a program that died (a console closed hard, Node killed): found by the
 * profile folder in their command line, killed by their own PID. Never by name: the person's own Edge or Chrome is
 * never touched. A browser whose owner (the Node process that started it, written in its profile) is still alive
 * belongs to another office or console sharing the same home, and is left alone while it is younger than its limit.
 * Before killing, the PID must still be the same process (same start time): Windows reuses PIDs.
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  NAVEGADOR_DIR,
  NAVEGADOR_LIST_TIMEOUT_MS,
  NAVEGADOR_MAX_LIFE_MS,
  NAVEGADOR_OWNER_FILE,
  NAVEGADOR_PROFILE_PREFIX,
} from '../constants.js';
import { windowsTool } from './arranque.js';

export interface ProcessInfo {
  pid: number;
  command: string;
  /** When it started, as the system says it (to know a PID was not reused before killing it). */
  startedAt?: string;
}

/** How the sweep sees and stops processes (tests pass a double). */
export interface ProcessTools {
  /** Processes whose command line mentions the reader's folder. Rejects or times out → nothing is done. */
  list(): Promise<ProcessInfo[]>;
  /** Kills this PID and its children. */
  killTree(pid: number): void;
  /** The process exists. */
  alive(pid: number): boolean;
  /** When this PID started, now (undefined = gone or unknown). */
  startedAt(pid: number): Promise<string | undefined>;
}

/**
 * The --user-data-dir of a command line (quoted whole, quoted value, or bare). A bare path with spaces (ps on
 * macOS/Linux does not quote) comes out cut at the first space, so it is never inside the folder: nothing is killed.
 */
export function profileFromCommand(command: string): string | undefined {
  const m =
    /"--user-data-dir=([^"]+)"/.exec(command) ??
    /--user-data-dir="([^"]+)"/.exec(command) ??
    /--user-data-dir=(\S+)/.exec(command);
  return m?.[1];
}

const fold = (p: string, platform: NodeJS.Platform) =>
  platform === 'win32' || platform === 'darwin' ? path.resolve(p).toLowerCase() : path.resolve(p);

/** dir is a profile directly inside base, by resolved path (not by text). */
export function profileInside(
  base: string,
  dir: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const b = fold(base, platform);
  const d = fold(dir, platform);
  return (
    path.dirname(d) === b && path.basename(d).startsWith(NAVEGADOR_PROFILE_PREFIX.toLowerCase())
  );
}

/** The time a profile was made, from its name ("perfil-<ms in base 36>-…"); undefined for older names. */
export function profileBornAt(dir: string): number | undefined {
  const m = new RegExp(`^${NAVEGADOR_PROFILE_PREFIX}([0-9a-z]+)-`).exec(path.basename(dir));
  if (!m) return undefined;
  const n = parseInt(m[1]!, 36);
  return Number.isFinite(n) ? n : undefined;
}

/** The PID written in a profile by the Node process that started it. */
export function profileOwner(dir: string): number | undefined {
  try {
    const n = Number(fs.readFileSync(path.join(dir, NAVEGADOR_OWNER_FILE), 'utf8').trim());
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which listed processes are orphans of the reader under base: their profile is inside base and either its owner
 * is gone (or unknown), or it is older than any browser of the reader may live. A profile of this very process that
 * its reader still uses is never one.
 */
export function orphans(
  base: string,
  procs: readonly ProcessInfo[],
  tools: Pick<ProcessTools, 'alive'>,
  nowMs: number,
  platform: NodeJS.Platform = process.platform,
  known: (profile: string) => boolean = () => false,
): Array<ProcessInfo & { profile: string }> {
  const out: Array<ProcessInfo & { profile: string }> = [];
  for (const p of procs) {
    if (p.pid === process.pid) continue;
    const profile = profileFromCommand(p.command);
    if (!profile || !profileInside(base, profile, platform)) continue;
    const owner = profileOwner(profile);
    if (owner === process.pid && known(profile)) continue;
    const born = profileBornAt(profile);
    const tooOld = born !== undefined && nowMs - born > NAVEGADOR_MAX_LIFE_MS;
    const ownerAlive = owner !== undefined && owner !== process.pid && tools.alive(owner);
    if (ownerAlive && !tooOld) continue;
    out.push({ ...p, profile });
  }
  return out;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The start time of a process, as Windows says it (UTC, round trip). */
const WIN_START = "@{n='Start';e={$_.CreationDate.ToUniversalTime().ToString('o')}}";
/** ps lstart: "Mon Nov 16 14:28:48 2026". */
const PS_LINE = /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/;

/** The real tools: PowerShell (CIM) on Windows, ps elsewhere, by full path; no shell, with a time limit. */
export function realProcessTools(platform: NodeJS.Platform = process.platform): ProcessTools {
  const run = (file: string, args: string[]) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        file,
        args,
        { windowsHide: true, timeout: NAVEGADOR_LIST_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(String(stdout))),
      );
    });
  const powershell = (script: string) =>
    run(windowsTool('WindowsPowerShell', 'v1.0', 'powershell.exe'), [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`,
    ]);
  return {
    async list() {
      if (platform === 'win32') {
        const out = (
          await powershell(
            `Get-CimInstance Win32_Process -Filter "CommandLine like '%${NAVEGADOR_DIR}%'" | ` +
              `Select-Object ProcessId,CommandLine,${WIN_START} | ConvertTo-Json -Compress`,
          )
        ).trim();
        if (!out) return [];
        const data = JSON.parse(out) as unknown;
        const rows = (Array.isArray(data) ? data : [data]) as Array<{
          ProcessId?: unknown;
          CommandLine?: unknown;
          Start?: unknown;
        }>;
        return rows
          .filter((r) => typeof r.ProcessId === 'number' && typeof r.CommandLine === 'string')
          .map((r) => ({
            pid: r.ProcessId as number,
            command: r.CommandLine as string,
            startedAt: typeof r.Start === 'string' ? r.Start : undefined,
          }));
      }
      const out = await run('/bin/ps', ['-axww', '-o', 'pid=,lstart=,args=']);
      return out
        .split('\n')
        .map((line) => PS_LINE.exec(line))
        .filter((m): m is RegExpExecArray => m !== null && m[3]!.includes(NAVEGADOR_DIR))
        .map((m) => ({
          pid: Number(m[1]),
          startedAt: m[2]!.replace(/\s+/g, ' '),
          command: m[3]!,
        }));
    },
    async startedAt(pid) {
      try {
        if (platform === 'win32') {
          const out = await powershell(
            `Get-CimInstance Win32_Process -Filter "ProcessId=${Math.trunc(pid)}" | ` +
              "ForEach-Object { $_.CreationDate.ToUniversalTime().ToString('o') }",
          );
          return out.trim() || undefined;
        }
        const out = await run('/bin/ps', ['-o', 'lstart=', '-p', String(Math.trunc(pid))]);
        return out.trim() ? out.trim().replace(/\s+/g, ' ') : undefined;
      } catch {
        return undefined;
      }
    },
    killTree(pid) {
      if (platform === 'win32') {
        execFile(
          windowsTool('taskkill.exe'),
          ['/PID', String(pid), '/T', '/F'],
          { windowsHide: true },
          () => {
            // gone or not
          },
        );
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // gone
          }
        }
      }
    },
    alive: isAlive,
  };
}

/** Finds and kills the orphans under base. Never throws; returns the profiles whose browser was killed. */
export async function sweepOrphans(
  base: string,
  tools: ProcessTools,
  nowMs: number,
  known?: (profile: string) => boolean,
): Promise<string[]> {
  let procs: ProcessInfo[];
  try {
    procs = await tools.list();
  } catch {
    return [];
  }
  const found = orphans(base, procs, tools, nowMs, process.platform, known);
  const killed = new Set<number>();
  const profiles = new Set<string>();
  for (const o of found) {
    if (killed.has(o.pid)) continue;
    // Still the same process (Windows reuses PIDs): its start time must not have changed since the listing
    if (!o.startedAt || (await tools.startedAt(o.pid)) !== o.startedAt) continue;
    killed.add(o.pid);
    profiles.add(o.profile);
    try {
      tools.killTree(o.pid);
    } catch {
      // gone already
    }
  }
  return [...profiles];
}
