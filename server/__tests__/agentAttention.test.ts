import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentAttentionApi, AttentionChange } from '../../core/src/attention.js';
import { resendAgentActivity } from '../src/agentActivityResend.js';
import {
  attachAttentionNotifier,
  attentionNotice,
  AttentionTracker,
  createAttentionApi,
} from '../src/agentAttention.js';
import { AgentStateStore } from '../src/agentStateStore.js';
import { readAgentAttentionSettings, readConfig, writeConfig } from '../src/configPersistence.js';
import { HookEventHandler } from '../src/hookEventHandler.js';
import { claudeProvider } from '../src/providers/hook/claude/claude.js';
import { SessionRouter } from '../src/sessionRouter.js';
import type { AgentState } from '../src/types.js';

const MIN = 60_000;
const T0 = new Date('2026-11-10T09:00:00Z').getTime();

function createTestAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 1,
    sessionId: 'sess-1',
    terminalRef: undefined,
    isExternal: true,
    projectDir: '/test',
    jsonlFile: '/test/session.jsonl',
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

/** A store + hook handler + tracker on a fake clock, fed with real Claude Code hook payloads. */
function setup() {
  const store = new AgentStateStore();
  const handler = new HookEventHandler(
    store,
    new Map(),
    new Map(),
    claudeProvider,
    new SessionRouter(),
  );
  const tracker = new AttentionTracker({
    store,
    describe: () => ({ nombre: 'MI-JUEGO', perfil: 'personal' }),
  });
  const api = createAttentionApi(store, tracker);
  store.set(1, createTestAgent({ id: 1, sessionId: 'sess-1' }));
  handler.registerAgent('sess-1', 1);
  const hook = (hook_event_name: string, extra: Record<string, unknown> = {}): void =>
    handler.handleEvent('claude', { hook_event_name, session_id: 'sess-1', ...extra });
  const state = () => store.getAttention(1);
  return { store, handler, tracker, api, hook, state };
}

describe('agent attention', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    ctx = setup();
  });

  afterEach(() => {
    ctx.tracker.dispose();
    vi.useRealTimers();
  });

  describe('estados', () => {
    it('a new agent starts as termino/inicio, with its name and profile', () => {
      expect(ctx.state()).toMatchObject({
        agentId: 1,
        sessionId: 'sess-1',
        estado: 'termino',
        motivo: 'inicio',
        desde: T0,
        nombre: 'MI-JUEGO',
        perfil: 'personal',
      });
    });

    it('trabajando: a prompt is "pensando", a tool is "herramienta"', () => {
      ctx.hook('UserPromptSubmit');
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', motivo: 'pensando' });
      vi.advanceTimersByTime(5_000);
      ctx.hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } });
      // Same state: `desde` keeps the moment it started working.
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', motivo: 'herramienta', desde: T0 });
    });

    it('esperandote/permiso on PermissionRequest; the tool running answers it', () => {
      ctx.hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
      ctx.hook('PermissionRequest', { tool_name: 'Bash' });
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'permiso' });
      ctx.hook('PostToolUse', { tool_name: 'Bash' });
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', motivo: 'herramienta' });
    });

    it.each(['permission_prompt', 'worker_permission_prompt'])(
      'esperandote/permiso on Notification(%s)',
      (notification_type) => {
        ctx.hook('UserPromptSubmit');
        ctx.hook('Notification', { notification_type });
        expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'permiso' });
      },
    );

    it('a hook agent stays esperandote when the transcript says "active" late', () => {
      ctx.hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
      ctx.hook('PermissionRequest');
      ctx.store.broadcast({ type: 'agentStatus', id: 1, status: 'active' });
      ctx.store.broadcast({ type: 'agentToolDone', id: 1, toolId: 'toolu_earlier' });
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'permiso' });
    });

    it('esperandote/pregunta on AskUserQuestion, answered when the tool ends', () => {
      ctx.hook('PreToolUse', { tool_name: 'AskUserQuestion', tool_input: {} });
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'pregunta' });
      // Claude Code also raises a permission-style prompt for it: the reason stays "pregunta".
      ctx.hook('PermissionRequest');
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'pregunta' });
      ctx.hook('PostToolUse', { tool_name: 'AskUserQuestion' });
      expect(ctx.state()?.estado).toBe('trabajando');
    });

    it.each(['elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'])(
      'esperandote/pregunta on Notification(%s)',
      (notification_type) => {
        ctx.hook('UserPromptSubmit');
        ctx.hook('Notification', { notification_type });
        expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'pregunta' });
      },
    );

    it('termino/fin-de-turno on Stop; idle_prompt later keeps it', () => {
      ctx.hook('UserPromptSubmit');
      vi.advanceTimersByTime(MIN);
      ctx.hook('Stop');
      expect(ctx.state()).toMatchObject({
        estado: 'termino',
        motivo: 'fin-de-turno',
        desde: T0 + MIN,
      });
      vi.advanceTimersByTime(MIN);
      ctx.hook('Notification', { notification_type: 'idle_prompt' });
      expect(ctx.state()).toMatchObject({ estado: 'termino', motivo: 'fin-de-turno' });
    });

    it('termino/interrumpido on Esc mid-tool, and the character stops working', () => {
      const sent: Array<Record<string, unknown>> = [];
      ctx.store.on('broadcast', (m) => sent.push(m));
      ctx.hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
      ctx.hook('PostToolUseFailure', { tool_name: 'Bash', is_interrupt: true });
      expect(ctx.state()).toMatchObject({ estado: 'termino', motivo: 'interrumpido' });
      expect(sent).toContainEqual(
        expect.objectContaining({ type: 'agentStatus', id: 1, status: 'waiting' }),
      );
    });

    it('fallo/limite-de-uso on StopFailure(rate_limit); it survives idle_prompt; a new prompt clears it', () => {
      ctx.hook('UserPromptSubmit');
      ctx.hook('StopFailure', {
        error: 'rate_limit',
        last_assistant_message: 'API Error: usage limit reached',
      });
      expect(ctx.state()).toMatchObject({
        estado: 'fallo',
        motivo: 'limite-de-uso',
        detalle: 'rate_limit',
      });
      ctx.hook('Notification', { notification_type: 'idle_prompt' });
      expect(ctx.state()?.estado).toBe('fallo');
      ctx.hook('UserPromptSubmit');
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', motivo: 'pensando' });
      expect(ctx.state()?.detalle).toBeUndefined();
    });

    it.each(['overloaded', 'server_error', 'billing_error', 'authentication_failed'])(
      'fallo/error-api on StopFailure(%s)',
      (error) => {
        ctx.hook('UserPromptSubmit');
        ctx.hook('StopFailure', { error });
        expect(ctx.state()).toMatchObject({ estado: 'fallo', motivo: 'error-api', detalle: error });
      },
    );

    it('StopFailure without an error code is fallo/error-api "unknown"', () => {
      ctx.hook('StopFailure');
      expect(ctx.state()).toMatchObject({
        estado: 'fallo',
        motivo: 'error-api',
        detalle: 'unknown',
      });
    });

    it('a failed turn is announced before the turn end, so the page can skip the cheer', () => {
      const order: string[] = [];
      ctx.store.on('broadcast', (m) => {
        if (m.type === 'agentAttention') order.push(`attention:${m.estado as string}`);
        if (m.type === 'agentStatus') order.push(`status:${m.status as string}`);
      });
      ctx.hook('StopFailure', { error: 'overloaded' });
      expect(order).toEqual(['attention:fallo', 'status:waiting']);
    });
  });

  describe('atorado (reloj falso)', () => {
    it('trabajando with no event for 15 min becomes atorado/sin-eventos, desde = last event', () => {
      ctx.hook('PreToolUse', { tool_name: 'Bash', tool_input: {} });
      const lastEvent = T0;
      vi.advanceTimersByTime(15 * MIN - 30_000);
      expect(ctx.state()?.estado).toBe('trabajando');
      vi.advanceTimersByTime(30_000); // the 30 s check lands exactly at 15 min
      expect(ctx.state()).toMatchObject({
        estado: 'atorado',
        motivo: 'sin-eventos',
        desde: lastEvent,
        ultimoEvento: lastEvent,
      });
    });

    it('any event lifts atorado back to trabajando', () => {
      ctx.hook('UserPromptSubmit');
      vi.advanceTimersByTime(16 * MIN);
      expect(ctx.state()?.estado).toBe('atorado');
      ctx.hook('PostToolUse', { tool_name: 'Bash' });
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', desde: T0 + 16 * MIN });
    });

    it('the transcript growing counts as an event', () => {
      ctx.hook('UserPromptSubmit');
      vi.advanceTimersByTime(10 * MIN);
      ctx.store.get(1)!.lastTranscriptAt = Date.now();
      vi.advanceTimersByTime(10 * MIN);
      expect(ctx.state()?.estado).toBe('trabajando');
      vi.advanceTimersByTime(6 * MIN);
      expect(ctx.state()?.estado).toBe('atorado');
      // ...and it moving again lifts it on the next check.
      ctx.store.get(1)!.lastTranscriptAt = Date.now();
      vi.advanceTimersByTime(30_000);
      expect(ctx.state()?.estado).toBe('trabajando');
    });

    it('only working agents get stuck: waiting on you or finished never become atorado', () => {
      ctx.hook('PermissionRequest');
      vi.advanceTimersByTime(60 * MIN);
      expect(ctx.state()?.estado).toBe('esperandote');
      ctx.hook('Stop');
      vi.advanceTimersByTime(60 * MIN);
      expect(ctx.state()?.estado).toBe('termino');
    });

    it('N comes from config.json (agentAttention.stuckMinutes)', () => {
      const cfg = readConfig();
      writeConfig({ ...cfg, agentAttention: { stuckMinutes: 5 } });
      try {
        ctx.hook('UserPromptSubmit');
        vi.advanceTimersByTime(5 * MIN);
        expect(ctx.state()?.estado).toBe('atorado');
        expect(ctx.api.stuckAfterMs()).toBe(5 * MIN);
      } finally {
        writeConfig(cfg);
      }
    });
  });

  describe('herdr como segunda señal', () => {
    it('blocked is esperandote/herdr-bloqueado; working again is trabajando/herdr', () => {
      ctx.hook('UserPromptSubmit');
      ctx.tracker.noteHerdrStatus(1, 'blocked');
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'herdr-bloqueado' });
      ctx.tracker.noteHerdrStatus(1, 'working');
      expect(ctx.state()).toMatchObject({ estado: 'trabajando', motivo: 'herdr' });
    });

    it('blocked never overrides a hook reason or a failure', () => {
      ctx.hook('PermissionRequest');
      ctx.tracker.noteHerdrStatus(1, 'blocked');
      expect(ctx.state()?.motivo).toBe('permiso');
      ctx.hook('StopFailure', { error: 'rate_limit' });
      ctx.tracker.noteHerdrStatus(1, 'blocked');
      expect(ctx.state()?.estado).toBe('fallo');
    });

    it('idle ends a quiet trabajando (Esc while thinking), but not within 60 s of an event', () => {
      ctx.hook('UserPromptSubmit');
      vi.advanceTimersByTime(30_000);
      ctx.tracker.noteHerdrStatus(1, 'idle');
      expect(ctx.state()?.estado).toBe('trabajando');
      vi.advanceTimersByTime(30_000);
      ctx.tracker.noteHerdrStatus(1, 'done');
      expect(ctx.state()).toMatchObject({ estado: 'termino', motivo: 'herdr-inactivo' });
    });
  });

  describe('sin hooks (transcripción)', () => {
    it('the heuristic permission bubble and its clear drive esperandote', () => {
      ctx.store.broadcast({ type: 'agentStatus', id: 1, status: 'active' });
      ctx.store.broadcast({ type: 'agentToolPermission', id: 1 });
      expect(ctx.state()).toMatchObject({ estado: 'esperandote', motivo: 'permiso' });
      ctx.store.broadcast({ type: 'agentToolPermissionClear', id: 1 });
      expect(ctx.state()?.estado).toBe('trabajando');
      ctx.store.broadcast({ type: 'agentToolPermission', id: 1 });
      ctx.store.broadcast({ type: 'agentToolDone', id: 1, toolId: 't1' });
      expect(ctx.state()?.estado).toBe('trabajando');
      ctx.store.broadcast({ type: 'agentStatus', id: 1, status: 'waiting', awaitingInput: false });
      expect(ctx.state()).toMatchObject({ estado: 'termino', motivo: 'fin-de-turno' });
    });

    it('background spawns re-sent at turn end do not make a finished agent work', () => {
      ctx.hook('Stop');
      ctx.store.broadcast({
        type: 'agentToolStart',
        id: 1,
        toolId: 'toolu_bg',
        status: 'Subtask: x',
        toolName: 'Agent',
        runInBackground: true,
      });
      expect(ctx.state()?.estado).toBe('termino');
    });
  });

  describe('API para paquetes (ctx.attention)', () => {
    it('list, get and subscribe, in order; removal reports actual: null', () => {
      const changes: AttentionChange[] = [];
      const off = ctx.api.subscribe((c) => changes.push(c));
      ctx.store.set(2, createTestAgent({ id: 2, sessionId: 'sess-2' }));
      ctx.hook('PermissionRequest');
      expect(ctx.api.list().map((a) => [a.agentId, a.estado])).toEqual([
        [1, 'esperandote'],
        [2, 'termino'],
      ]);
      expect(ctx.api.get(1)?.motivo).toBe('permiso');
      ctx.store.delete(2);
      expect(
        changes.map((c) => [c.agentId, c.anterior?.estado ?? null, c.actual?.estado ?? null]),
      ).toEqual([
        [2, null, 'termino'],
        [1, 'termino', 'esperandote'],
        [2, 'termino', null],
      ]);
      off();
      ctx.hook('Stop');
      expect(changes).toHaveLength(3);
    });

    it('a throwing subscriber does not break the runtime or the others', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const seen: string[] = [];
      ctx.api.subscribe(() => {
        throw new Error('boom');
      });
      ctx.api.subscribe((c) => seen.push(c.actual?.estado ?? ''));
      expect(() => ctx.hook('PermissionRequest')).not.toThrow();
      expect(seen).toEqual(['esperandote']);
      errSpy.mockRestore();
    });

    it('returns copies: a pack cannot change the office state', () => {
      const a = ctx.api.get(1)!;
      a.estado = 'fallo';
      ctx.api.list()[0].motivo = 'error-api';
      expect(ctx.api.get(1)).toMatchObject({ estado: 'termino', motivo: 'inicio' });
    });

    it('a connecting page gets each agent attention replayed', () => {
      ctx.hook('PermissionRequest');
      const sent: Array<Record<string, unknown>> = [];
      resendAgentActivity((m) => sent.push(m), ctx.store);
      expect(sent).toContainEqual({
        type: 'agentAttention',
        id: 1,
        estado: 'esperandote',
        motivo: 'permiso',
        desde: T0,
      });
    });
  });

  describe('aviso de la computadora', () => {
    function withNotifier(api: AgentAttentionApi, enabled = true) {
      const rung: Array<[string, string]> = [];
      const stop = attachAttentionNotifier(api, {
        notify: (title, message) => rung.push([title, message]),
        enabled: () => enabled,
      });
      return { rung, stop };
    }

    it('esperandote rings after 30 s only if still waiting', () => {
      const { rung, stop } = withNotifier(ctx.api);
      ctx.hook('PermissionRequest');
      vi.advanceTimersByTime(10_000);
      ctx.hook('PostToolUse');
      vi.advanceTimersByTime(60_000);
      expect(rung).toEqual([]);
      ctx.hook('PermissionRequest');
      vi.advanceTimersByTime(30_000);
      expect(rung).toEqual([['Javbots', 'MI-JUEGO te pide permiso']]);
      stop();
    });

    it('atorado and fallo ring at once, once per entry', () => {
      const { rung, stop } = withNotifier(ctx.api);
      ctx.hook('UserPromptSubmit');
      vi.advanceTimersByTime(15 * MIN);
      vi.advanceTimersByTime(5 * MIN); // more checks while stuck: no second ring
      ctx.hook('StopFailure', { error: 'rate_limit' });
      ctx.hook('Notification', { notification_type: 'idle_prompt' });
      expect(rung.map(([, m]) => m)).toEqual([
        'MI-JUEGO lleva 15 min sin avanzar',
        'MI-JUEGO se detuvo: llegó al límite de uso',
      ]);
      stop();
    });

    it('notify: false in config keeps quiet', () => {
      const { rung, stop } = withNotifier(ctx.api, false);
      ctx.hook('StopFailure', { error: 'overloaded' });
      expect(rung).toEqual([]);
      stop();
    });

    it('texts carry no emoji', () => {
      const base = { agentId: 1, sessionId: 's', nombre: 'X', desde: T0, ultimoEvento: T0 };
      const texts = [
        attentionNotice({ ...base, estado: 'esperandote', motivo: 'pregunta' }, T0),
        attentionNotice({ ...base, estado: 'esperandote', motivo: 'herdr-bloqueado' }, T0),
        attentionNotice(
          { ...base, estado: 'fallo', motivo: 'error-api', detalle: 'overloaded' },
          T0,
        ),
      ];
      expect(texts).toEqual([
        'X te hizo una pregunta',
        'X te espera en la terminal',
        'X se detuvo por un error del API (overloaded)',
      ]);
      for (const t of texts) expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });
});

describe('agentAttention config', () => {
  it('defaults to 15 min with notifications, clamps the minutes, and survives other writes', () => {
    const file = path.join(os.homedir(), '.pixel-agents', 'config.json');
    fs.rmSync(file, { force: true });
    expect(readAgentAttentionSettings()).toEqual({ stuckMinutes: 15, notify: true });

    writeConfig({ ...readConfig(), agentAttention: { stuckMinutes: 0, notify: false } });
    expect(readAgentAttentionSettings()).toEqual({ stuckMinutes: 1, notify: false });

    // Another writer (the hooks consent) must not drop the section.
    writeConfig({ ...readConfig(), hooksConsent: { claude: 'granted' } });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).agentAttention).toEqual({
      stuckMinutes: 0,
      notify: false,
    });
    fs.writeFileSync(file, JSON.stringify({ agentAttention: { stuckMinutes: 99999 } }));
    expect(readAgentAttentionSettings().stuckMinutes).toBe(1440);
    fs.rmSync(file, { force: true });
  });
});
