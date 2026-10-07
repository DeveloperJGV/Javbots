import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateAdapter } from '../../core/src/adapter.js';
import { resendAgentActivity } from '../src/agentActivityResend.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import {
  EXTERNAL_IDLE_REMOVE_MS,
  EXTERNAL_MISSING_FILE_GRACE_MS,
  EXTERNAL_STALE_CHECK_INTERVAL_MS,
} from '../src/constants.js';
import { setAgentRemovalCallback, startStaleExternalAgentCheck } from '../src/fileWatcher.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import type { AgentState, PersistedAgent } from '../src/types.js';

function agentFor(id: number, jsonlFile: string, extra: Partial<AgentState> = {}): AgentState {
  return {
    id,
    sessionId: `sess-${id}`,
    isExternal: true,
    projectDir: path.dirname(jsonlFile),
    jsonlFile,
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    ...extra,
  } as AgentState;
}

/** Ghosts (fork, Fase 5): sessions closed while nothing listened never send SessionEnd. */
describe('external agents idle for EXTERNAL_IDLE_REMOVE_MS', () => {
  let tmpDir: string;
  let fresh: string;
  let old: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-stale-'));
    fresh = path.join(tmpDir, 'fresh.jsonl');
    old = path.join(tmpDir, 'old.jsonl');
    fs.writeFileSync(fresh, '');
    fs.writeFileSync(old, '');
    const longAgo = (Date.now() - EXTERNAL_IDLE_REMOVE_MS - 60_000) / 1000;
    fs.utimesSync(old, longAgo, longAgo);
  });

  afterEach(() => {
    setAgentRemovalCallback(null);
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('the stale check removes them even with hooks on, and keeps live ones', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const store = new AgentStateStore();
    store.set(1, agentFor(1, fresh));
    store.set(2, agentFor(2, old));
    store.set(3, agentFor(3, old, { leadAgentId: 1 }));
    const removed: number[] = [];
    setAgentRemovalCallback((id) => removed.push(id));

    const timer = startStaleExternalAgentCheck(store, new Set(), { current: true });
    vi.advanceTimersByTime(EXTERNAL_STALE_CHECK_INTERVAL_MS);
    clearInterval(timer);

    expect(removed).toEqual([2]); // the teammate (3) leaves with its lead
  });

  it('with hooks on, a copy of a live session with no transcript goes at once', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const store = new AgentStateStore();
    store.set(1, agentFor(1, fresh, { sessionId: 'same' }));
    // The session changed folder: same id, transcript path that never appears.
    store.set(2, agentFor(2, path.join(tmpDir, 'never.jsonl'), { sessionId: 'same' }));
    const removed: number[] = [];
    setAgentRemovalCallback((id) => removed.push(id));

    const timer = startStaleExternalAgentCheck(store, new Set(), { current: true });
    vi.advanceTimersByTime(EXTERNAL_STALE_CHECK_INTERVAL_MS);
    clearInterval(timer);

    expect(removed).toEqual([2]);
  });

  it('with hooks on, any other missing transcript is waited out, then dropped', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const store = new AgentStateStore();
    store.set(1, agentFor(1, path.join(tmpDir, 'not-yet.jsonl')));
    const removed: number[] = [];
    setAgentRemovalCallback((id) => {
      removed.push(id);
      store.delete(id);
    });

    const timer = startStaleExternalAgentCheck(store, new Set(), { current: true });
    vi.advanceTimersByTime(EXTERNAL_STALE_CHECK_INTERVAL_MS);
    expect(removed).toEqual([]); // a just-opened session: no file until it's typed in

    vi.advanceTimersByTime(EXTERNAL_MISSING_FILE_GRACE_MS + EXTERNAL_STALE_CHECK_INTERVAL_MS);
    clearInterval(timer);
    expect(removed).toEqual([1]);
  });

  it('restoreExternalAgents does not bring a ghost back', () => {
    const persisted: PersistedAgent[] = [fresh, old].map((jsonlFile, i) => ({
      id: i + 1,
      sessionId: `sess-${i + 1}`,
      terminalName: '',
      isExternal: true,
      jsonlFile,
      projectDir: tmpDir,
      palette: i,
      hueShift: 0,
    }));
    const adapter: StateAdapter = {
      loadAgents: () => persisted,
      saveAgents: () => {},
      loadSeats: () => ({}),
      saveSeats: () => {},
      getSetting: <T>(_key: string, defaultValue: T): T => defaultValue,
      setSetting: () => {},
    };
    const store = new AgentStateStore();
    store.setAdapter(adapter);
    const runtime = new AgentRuntime(store, claudeProvider);

    runtime.restoreExternalAgents();

    expect(store.has(1)).toBe(true);
    expect(store.has(2)).toBe(false);
    // Restored = idle until it works again, so a connecting page gets "waiting"
    expect(store.get(1)?.isWaiting).toBe(true);
    const sent: Array<Record<string, unknown>> = [];
    resendAgentActivity((m) => sent.push(m), store);
    expect(sent).toContainEqual({ type: 'agentStatus', id: 1, status: 'waiting' });
    runtime.dispose();
  });
});
