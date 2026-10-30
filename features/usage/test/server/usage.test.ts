import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { parseResetsAt, parseUsageCommand } from '../../server/usageCommand.js';
import { createUsageFeature, mergeCommandLimits, parseUsage } from '../../server/usageFeature.js';

const NOW = new Date('2026-10-16T15:00:00.000Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

describe('usage', () => {
  it('reads the limits, drops the expired ones, and sorts sessions by cost', () => {
    const p = parseUsage(
      'personal',
      {
        updatedAt: sec('2026-10-16T14:59:00Z'),
        rate_limits: {
          five_hour: { used_percentage: 23.5, resets_at: sec('2026-10-16T17:00:00Z') },
          seven_day: { used_percentage: 41, resets_at: sec('2026-10-16T10:00:00Z') },
          seven_day_fable: { used_percentage: 12, resets_at: sec('2026-10-20T10:00:00Z') },
        },
        sessions: {
          a: {
            cwd: '/x/repo-a',
            costUsd: 0.5,
            inputTokens: 1000,
            outputTokens: 200,
            contextPct: 12.4,
          },
          b: { cwd: '/x/repo-b', costUsd: 3.456 },
        },
      },
      NOW,
    )!;
    expect(p.fiveHour).toEqual({ pct: 23.5, resetsAt: '2026-10-16T17:00:00.000Z' });
    expect(p.sevenDay).toBeUndefined();
    expect(p.otherLimits).toEqual([
      { key: 'seven_day_fable', pct: 12, resetsAt: '2026-10-20T10:00:00.000Z' },
    ]);
    expect(p.sessions.map((s) => s.folder)).toEqual(['repo-b', 'repo-a']);
    expect(p.sessions[0].costUsd).toBe(3.46);
    expect(p.sessions[1]).toMatchObject({ tokens: 1200, contextPct: 12 });
  });

  it('sends the profiles to privileged clients only', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-uso-'));
    fs.writeFileSync(path.join(dir, 'personal.json'), JSON.stringify({ sessions: {} }));
    fs.writeFileSync(path.join(dir, 'roto.json'), '{');
    const feature = createUsageFeature({ dir, now: () => NOW, pollMs: 3_600_000 });
    const sent: Array<Record<string, unknown>> = [];
    const guest: Array<Record<string, unknown>> = [];
    feature.connect?.({ privileged: true, send: (m) => sent.push(m) });
    feature.connect?.({ privileged: false, send: (m) => guest.push(m) });
    feature.handleClientMessage?.(
      { type: 'webviewReady' },
      { privileged: true, send: (m) => sent.push(m) },
    );
    feature.handleClientMessage?.(
      { type: 'webviewReady' },
      { privileged: false, send: (m) => guest.push(m) },
    );
    expect(sent[0]).toMatchObject({ type: 'usageStatus', profiles: [{ profile: 'personal' }] });
    expect(guest).toHaveLength(0);
    feature.dispose?.();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads /usage: session, week and the per-model week', () => {
    const now = new Date(2026, 9, 25, 2, 0);
    const text = [
      'You are currently using your subscription to power your Claude Code usage',
      '',
      'Current session: 1% used · resets Oct 25, 6:40am (America/Mexico_City)',
      'Current week (all models): 58% used · resets Oct 28, 7am (America/Mexico_City)',
      'Current week (Fable): 96% used · resets Oct 28, 7am (America/Mexico_City)',
      '  78%  Start fresh when you switch tasks · run /clear',
    ].join('\n');
    const limits = parseUsageCommand(text, now);
    expect(Object.keys(limits)).toEqual(['five_hour', 'seven_day', 'seven_day_fable']);
    expect(limits.seven_day_fable.pct).toBe(96);
    expect(limits.five_hour.resetsAt).toBe(new Date(2026, 9, 25, 6, 40).toISOString());
    expect(parseResetsAt('Jan 2, 3pm (X)', now)).toBe(new Date(2027, 0, 2, 15).toISOString());
    expect(parseResetsAt('11:30pm', now)).toBe(new Date(2026, 9, 25, 23, 30).toISOString());
  });

  it('puts /usage into the personal profile; the 5 hours and week only when newer', () => {
    const later = new Date(NOW.getTime() + 60_000);
    const fable = { pct: 96, resetsAt: '2026-10-20T10:00:00.000Z' };
    const statusline = {
      profile: 'personal',
      updatedAt: NOW.toISOString(),
      sessions: [],
      fiveHour: { pct: 10 },
    };
    const out = mergeCommandLimits(
      [{ ...statusline }],
      {
        five_hour: { pct: 30 },
        seven_day_fable: fable,
        seven_day_old: { pct: 5, resetsAt: '2026-10-01T00:00:00Z' },
      },
      later,
      NOW,
    );
    expect(out[0].fiveHour).toEqual({ pct: 30 });
    expect(out[0].otherLimits).toEqual([{ key: 'seven_day_fable', ...fable }]);
    const older = mergeCommandLimits(
      [{ ...statusline }],
      { five_hour: { pct: 30 } },
      new Date(0),
      NOW,
    );
    expect(older[0].fiveHour).toEqual({ pct: 10 });
    expect(mergeCommandLimits([], { seven_day_fable: fable }, later, NOW)[0].profile).toBe(
      'personal',
    );
  });

  it('asks /usage when a page opens, and never again if it ever cost anything', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-uso-'));
    let clock = NOW.getTime();
    let runs = 0;
    let cost = 0;
    const feature = createUsageFeature({
      dir,
      now: () => new Date(clock),
      pollMs: 3_600_000,
      command: async () => {
        runs++;
        return { text: 'Current week (Fable): 40% used', costUsd: cost };
      },
    });
    const sent: Array<Record<string, unknown>> = [];
    const page = { privileged: true, send: (m: Record<string, unknown>) => sent.push(m) };
    await feature.poll(); // the read at start (nobody listening yet)
    feature.connect?.(page);
    feature.handleClientMessage?.({ type: 'webviewReady' }, page);
    await feature.poll();
    expect(runs).toBe(1);
    expect(sent.at(-1)).toMatchObject({
      profiles: [{ profile: 'personal', otherLimits: [{ key: 'seven_day_fable', pct: 40 }] }],
    });
    await feature.poll(); // too soon
    expect(runs).toBe(1);
    clock += 6 * 60_000;
    cost = 0.01;
    await feature.poll();
    clock += 6 * 60_000;
    await feature.poll();
    expect(runs).toBe(2);
    feature.dispose?.();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
