import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  UsageLimit,
  UsageProfile,
  UsageSession,
  UsageStatus,
} from '../../../core/src/messages.js';
import { LAYOUT_FILE_DIR } from '../../../server/src/constants.js';
import { createPollingFeature } from '../../../server/src/pollingFeature.js';
import {
  LOG_PREFIX,
  MAX_SESSIONS,
  USAGE_COMMAND_MS,
  USAGE_POLL_MS,
  USAGE_SUBDIR,
} from './constants.js';
import { type CommandLimits, parseUsageCommand, type UsageCommandResult } from './usageCommand.js';

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v.slice(0, 300) : undefined;

function limit(v: unknown): UsageLimit | undefined {
  if (!isObject(v)) return undefined;
  const pct = num(v.used_percentage);
  const resets = num(v.resets_at);
  if (pct === undefined) return undefined;
  const out: UsageLimit = { pct: Math.min(100, pct) };
  if (resets !== undefined) out.resetsAt = new Date(resets * 1000).toISOString();
  return out;
}

/** One profile's file (written by the statusline script) → what the office shows. Limits past their reset are dropped. */
export function parseUsage(profile: string, raw: unknown, now: Date): UsageProfile | null {
  if (!isObject(raw)) return null;
  const out: UsageProfile = { profile, sessions: [] };
  const updated = num(raw.updatedAt);
  if (updated !== undefined) out.updatedAt = new Date(updated * 1000).toISOString();
  if (isObject(raw.rate_limits)) {
    for (const [key, field] of [
      ['five_hour', 'fiveHour'],
      ['seven_day', 'sevenDay'],
    ] as const) {
      const l = limit(raw.rate_limits[key]);
      if (l && (!l.resetsAt || Date.parse(l.resetsAt) > now.getTime())) out[field] = l;
    }
    // Limits Claude Code may add later (one per model, say): shown as they come
    for (const [key, value] of Object.entries(raw.rate_limits)) {
      if (key === 'five_hour' || key === 'seven_day') continue;
      const l = limit(value);
      if (!l || (l.resetsAt && Date.parse(l.resetsAt) <= now.getTime())) continue;
      (out.otherLimits ??= []).push({ key: key.slice(0, 60), ...l });
    }
  }
  if (isObject(raw.sessions)) {
    for (const [id, s] of Object.entries(raw.sessions)) {
      if (!isObject(s)) continue;
      const session: UsageSession = { id: id.slice(0, 80) };
      const cwd = str(s.cwd);
      if (cwd) session.folder = path.basename(cwd);
      const model = str(s.model);
      if (model) session.model = model;
      const cost = num(s.costUsd);
      if (cost !== undefined) session.costUsd = Math.round(cost * 100) / 100;
      const tokens = (num(s.inputTokens) ?? 0) + (num(s.outputTokens) ?? 0);
      if (tokens) session.tokens = Math.round(tokens);
      const ctx = num(s.contextPct);
      if (ctx !== undefined) session.contextPct = Math.round(ctx);
      const at = num(s.updatedAt);
      if (at !== undefined) session.updatedAt = new Date(at * 1000).toISOString();
      out.sessions.push(session);
    }
    out.sessions.sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
    out.sessions = out.sessions.slice(0, MAX_SESSIONS);
  }
  return out;
}

export function readUsage(dir: string, now: Date): UsageProfile[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: UsageProfile[] = [];
  for (const f of files.sort()) {
    try {
      const p = parseUsage(
        f.replace(/\.json$/, ''),
        JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')),
        now,
      );
      if (p) out.push(p);
    } catch {
      /* half-written or broken: next round */
    }
  }
  return out;
}

/**
 * What `/usage` said goes into the personal profile (the account `claude` is logged in with): the limits only it
 * knows (Fable's week) always, the 5 hours and week when it is newer than the statusline's copy.
 */
export function mergeCommandLimits(
  profiles: UsageProfile[],
  limits: CommandLimits,
  at: Date,
  now: Date,
): UsageProfile[] {
  const live = Object.entries(limits).filter(
    ([, l]) => !l.resetsAt || Date.parse(l.resetsAt) > now.getTime(),
  );
  if (live.length === 0) return profiles;
  let p = profiles.find((x) => x.profile === 'personal');
  if (!p) {
    p = { profile: 'personal', sessions: [] };
    profiles = [p, ...profiles];
  }
  const newer = !p.updatedAt || Date.parse(p.updatedAt) < at.getTime();
  for (const [key, l] of live) {
    if (key === 'five_hour' || key === 'seven_day') {
      const field = key === 'five_hour' ? 'fiveHour' : 'sevenDay';
      if (newer || !p[field]) p[field] = l;
      continue;
    }
    p.otherLimits = [...(p.otherLimits ?? []).filter((o) => o.key !== key), { key, ...l }];
  }
  return profiles;
}

/**
 * Claude usage (features/usage): the plan limits (5 hours, week) and each session's estimated cost, per Claude Code
 * profile, as the statusline script saw them, plus what `/usage` says (Fable's week) when `command` is given: run
 * when a page opens and every USAGE_COMMAND_MS while one is open. Privileged clients only.
 */
export function createUsageFeature(
  opts: {
    dir?: string;
    now?: () => Date;
    pollMs?: number;
    command?: () => Promise<UsageCommandResult | null>;
  } = {},
): ReturnType<typeof createPollingFeature<UsageStatus>> {
  const dir = opts.dir ?? path.join(os.homedir(), LAYOUT_FILE_DIR, USAGE_SUBDIR);
  const now = opts.now ?? (() => new Date());
  let last = '';
  let fromCommand: { limits: CommandLimits; at: Date } | null = null;
  let commandRanAt = 0;
  let commandOff = !opts.command;
  const runCommand = async (): Promise<void> => {
    if (commandOff || !opts.command || now().getTime() - commandRanAt < USAGE_COMMAND_MS) return;
    commandRanAt = now().getTime();
    const result = await opts.command();
    if (!result) return;
    if (result.costUsd > 0) {
      // `/usage` went to the model instead of being answered locally: never again this run
      commandOff = true;
      console.warn(`${LOG_PREFIX} /usage costó ${result.costUsd} USD; ya no se vuelve a pedir`);
      return;
    }
    const limits = parseUsageCommand(result.text, now());
    if (Object.keys(limits).length > 0) fromCommand = { limits, at: now() };
  };
  const status = (): UsageStatus => {
    const profiles = readUsage(dir, now());
    return {
      type: 'usageStatus',
      profiles: fromCommand
        ? mergeCommandLimits(profiles, fromCommand.limits, fromCommand.at, now())
        : profiles,
    };
  };
  console.log(`${LOG_PREFIX} Leyendo ${dir}`);
  let feature: ReturnType<typeof createPollingFeature<UsageStatus>> | null = null;
  feature = createPollingFeature({
    name: 'usage',
    everyMs: opts.pollMs ?? USAGE_POLL_MS,
    enabled: true,
    // Only when someone is looking, and only when something changed
    read: async () => {
      if (!feature?.listeners) return null;
      await runCommand();
      const msg = status();
      const key = JSON.stringify(msg);
      if (key === last) return null;
      last = key;
      return msg;
    },
    snapshot: status,
    logPrefix: LOG_PREFIX,
  });
  // A page that opens gets the files right away and `/usage` a few seconds later
  const ready = feature.handleClientMessage?.bind(feature);
  feature.handleClientMessage = (msg, client) => {
    const handled = ready?.(msg, client) ?? false;
    if (msg.type === 'webviewReady' && client.privileged) void feature?.poll();
    return handled;
  };
  return feature;
}
