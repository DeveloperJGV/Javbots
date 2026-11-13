import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StateAdapter } from '../../core/src/adapter.js';
import { AttentionTracker } from '../src/agentAttention.js';
import { AgentRuntime } from '../src/agentRuntime.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { TRANSCRIPT_END_GRACE_MS } from '../src/constants.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { processTranscriptLine, transcriptEndedOnDisk } from '../src/transcriptParser.js';
import type { AgentState, PersistedAgent } from '../src/types.js';

/**
 * A session whose process exited (Claude Code appends a `cost-state` row on exit) is over even when no SessionEnd hook
 * arrived — e.g. a `claude -p` started by the office whose hooks could not run. It leaves its seat, it is never
 * `atorado`, and a restart does not bring it back.
 */

const USER = JSON.stringify({
  type: 'user',
  message: { role: 'user', content: 'hola' },
  sessionId: 's',
});
const TOOL = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'StructuredOutput', input: {} }],
  },
});
const LAST_PROMPT = JSON.stringify({ type: 'last-prompt', lastPrompt: 'x', sessionId: 's' });
const COST = JSON.stringify({
  type: 'cost-state',
  sessionId: 's',
  totalCostUSD: 0.33,
  modelUsage: { m: { inputTokens: 1 } },
});

function agentFor(id: number, file: string, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id,
    sessionId: `sess-${id}`,
    terminalRef: undefined,
    isExternal: true,
    projectDir: path.dirname(file),
    jsonlFile: file,
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    contextTokens: 0,
    maxContextTokens: 200_000,
    ...overrides,
  } as AgentState;
}

function adapterWith(persisted: PersistedAgent[]): StateAdapter {
  let current = persisted;
  return {
    loadAgents: () => current,
    saveAgents: (a) => {
      current = a;
    },
    loadSeats: () => ({}),
    saveSeats: () => {},
    getSetting: <T>(_k: string, d: T): T => d,
    setSetting: () => {},
  };
}

describe('a session that ended (cost-state)', () => {
  let dir: string;
  let runtime: AgentRuntime | undefined;
  const write = (name: string, lines: string[]): string => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-session-end-'));
  });
  afterEach(() => {
    runtime?.dispose();
    runtime = undefined;
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is seen on disk only when the exit row is the last one', () => {
    expect(transcriptEndedOnDisk(write('ended.jsonl', [USER, TOOL, LAST_PROMPT, COST]))).toBe(true);
    expect(transcriptEndedOnDisk(write('live.jsonl', [USER, TOOL]))).toBe(false);
    // Resumed later: the session wrote again after its first exit.
    expect(transcriptEndedOnDisk(write('resumed.jsonl', [USER, COST, USER]))).toBe(false);
    expect(transcriptEndedOnDisk(path.join(dir, 'missing.jsonl'))).toBe(false);
    // A real cost row (several models) after a long transcript.
    const big = JSON.stringify({ type: 'cost-state', modelUsage: { a: 'x'.repeat(8_000) } });
    expect(transcriptEndedOnDisk(write('big.jsonl', [USER, 'y'.repeat(200_000), big]))).toBe(true);
  });

  it('the character leaves its seat after the exit row, without any hook', () => {
    vi.useFakeTimers();
    const store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    const file = write('run.jsonl', [USER, TOOL]);
    store.set(1, agentFor(1, file));
    const sent: Array<Record<string, unknown>> = [];
    store.on('broadcast', (m: Record<string, unknown>) => sent.push(m));

    processTranscriptLine(1, TOOL, store, new Map(), new Map());
    processTranscriptLine(1, COST, store, new Map(), new Map());
    expect(store.get(1)?.transcriptEnded).toBe(true);
    // Done at once (not working), then gone.
    expect(sent.at(-1)).toMatchObject({ type: 'agentStatus', id: 1, status: 'waiting' });
    expect(store.has(1)).toBe(true);
    vi.advanceTimersByTime(TRANSCRIPT_END_GRACE_MS);
    expect(store.has(1)).toBe(false);
  });

  it('stays when the session writes again right after (a /resume)', () => {
    vi.useFakeTimers();
    const store = new AgentStateStore();
    runtime = new AgentRuntime(store, claudeProvider);
    const file = write('resume.jsonl', [USER]);
    store.set(2, agentFor(2, file));
    processTranscriptLine(2, COST, store, new Map(), new Map());
    processTranscriptLine(2, USER, store, new Map(), new Map());
    vi.advanceTimersByTime(TRANSCRIPT_END_GRACE_MS * 2);
    expect(store.has(2)).toBe(true);
    expect(store.get(2)?.transcriptEnded).toBe(false);
  });

  it('a restart does not bring back sessions that ended; live ones come back', () => {
    const ended = write('ended.jsonl', [USER, TOOL, LAST_PROMPT, COST]);
    const live = write('live.jsonl', [USER, TOOL]);
    const persisted: PersistedAgent[] = [
      {
        id: 1,
        sessionId: 'a',
        terminalName: '',
        isExternal: true,
        jsonlFile: ended,
        projectDir: dir,
      },
      {
        id: 3,
        sessionId: 'b',
        terminalName: '',
        isExternal: true,
        jsonlFile: live,
        projectDir: dir,
      },
    ];
    const store = new AgentStateStore();
    store.setAdapter(adapterWith(persisted));
    runtime = new AgentRuntime(store, claudeProvider);
    runtime.restoreExternalAgents();
    expect(store.has(1)).toBe(false);
    expect(store.has(3)).toBe(true);
  });

  it('is never marked atorado, even if it was working when it ended', () => {
    vi.useFakeTimers();
    const T0 = new Date('2026-11-13T15:17:00Z').getTime();
    vi.setSystemTime(T0);
    const store = new AgentStateStore();
    const tracker = new AttentionTracker({
      store,
      checkEveryMs: 0,
      stuckAfterMs: () => 15 * 60_000,
    });
    const file = write('stuck.jsonl', [USER, TOOL]);
    store.set(4, agentFor(4, file));
    store.broadcast({
      type: 'agentToolStart',
      id: 4,
      toolId: 'toolu_1',
      status: 'x',
      toolName: 'Bash',
    });
    expect(store.getAttention(4)?.estado).toBe('trabajando');

    // Ended without the turn-end signal (flag set directly, as a restored agent could be).
    store.get(4)!.transcriptEnded = true;
    vi.advanceTimersByTime(20 * 60_000);
    tracker.check();
    expect(store.getAttention(4)?.estado).toBe('termino');

    // And through the transcript: the exit row ends the turn right away.
    store.set(5, agentFor(5, file));
    store.broadcast({
      type: 'agentToolStart',
      id: 5,
      toolId: 'toolu_2',
      status: 'x',
      toolName: 'Bash',
    });
    processTranscriptLine(5, COST, store, new Map(), new Map());
    expect(store.getAttention(5)?.estado).toBe('termino');
    vi.advanceTimersByTime(20 * 60_000);
    tracker.check();
    expect(store.getAttention(5)?.estado).not.toBe('atorado');
    tracker.dispose();
  });
});
