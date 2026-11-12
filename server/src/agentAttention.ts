import type {
  AgentAttention,
  AgentAttentionApi,
  AttentionChange,
  AttentionReason,
  AttentionState,
} from '../../core/src/attention.js';
import { NEEDS_YOU_STATES } from '../../core/src/attention.js';
import type { AgentEvent } from '../../core/src/provider.js';
import type { AgentStateStore } from './agentStateStore.js';
import { readAgentAttentionSettings } from './configPersistence.js';
import {
  ATTENTION_CHECK_MS,
  ATTENTION_HERDR_IDLE_GRACE_MS,
  ATTENTION_NOTIFY_TITLE,
  ATTENTION_WAITING_NOTIFY_DELAY_MS,
} from './constants.js';
import { notifyMac } from './notifyMac.js';

/**
 * Agent attention (docs/atencion-agentes.md): derives, per agent, whether it is working, waiting on the person,
 * stuck or failed, and writes it to the AgentStateStore.
 *
 * Inputs, in this order of authority:
 * - the store's broadcasts: the same messages the page gets, so hook routing (inline teammates) and the transcript
 *   fallback (no hooks) are already applied;
 * - provider events (`agentEvent`, emitted by the hook handler BEFORE it dispatches): what broadcasts can't say — a
 *   failed turn, an Esc, a question rather than a permission, and that a permission was answered;
 * - herdr's agent_status, as a second signal (noteHerdrStatus);
 * - the clock: `trabajando` with no event for N minutes becomes `atorado` (check()).
 *
 * It never kills or changes an agent: it only marks.
 */

/** What herdr reports per pane (`agent_status` in `herdr pane list`). */
export type HerdrAgentStatus = 'working' | 'blocked' | 'done' | 'idle';

export interface AttentionTrackerOptions {
  store: AgentStateStore;
  /** Clock (ms since epoch). Tests pass a fake one. */
  now?: () => number;
  /** Minutes without events before `atorado`, in ms. Default: config.json (agentAttention.stuckMinutes). */
  stuckAfterMs?: () => number;
  /** How the office names an agent (herdr tab, teammate, folder) and its Claude Code profile. */
  describe?: (agentId: number) => { nombre?: string; perfil?: string };
  /** How often to look for stuck agents; 0 = never on its own (tests call check()). */
  checkEveryMs?: number;
}

export class AttentionTracker {
  private readonly store: AgentStateStore;
  private readonly now: () => number;
  private readonly stuckMs: () => number;
  private readonly describe: (agentId: number) => { nombre?: string; perfil?: string };
  private readonly timer: ReturnType<typeof setInterval> | null;
  private readonly off: Array<() => void> = [];

  constructor(opts: AttentionTrackerOptions) {
    this.store = opts.store;
    this.now = opts.now ?? Date.now;
    this.stuckMs = opts.stuckAfterMs ?? (() => readAgentAttentionSettings().stuckMinutes * 60_000);
    this.describe = opts.describe ?? (() => ({}));

    const onAdded = (id: number): void => this.set(id, 'termino', 'inicio');
    const onBroadcast = (msg: Record<string, unknown>): void => this.onBroadcast(msg);
    const onEvent = (id: number, event: AgentEvent): void => this.onAgentEvent(id, event);
    this.store.on('agentAdded', onAdded);
    this.store.on('broadcast', onBroadcast);
    this.store.on('agentEvent', onEvent);
    this.off.push(
      () => this.store.off('agentAdded', onAdded),
      () => this.store.off('broadcast', onBroadcast),
      () => this.store.off('agentEvent', onEvent),
    );
    for (const id of this.store.keys()) {
      if (!this.store.getAttention(id)) onAdded(id);
    }

    const every = opts.checkEveryMs ?? ATTENTION_CHECK_MS;
    this.timer = every > 0 ? setInterval(() => this.check(), every) : null;
    this.timer?.unref?.();
  }

  stuckAfterMs(): number {
    return this.stuckMs();
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    for (const off of this.off) off();
    this.off.length = 0;
  }

  // ── Inputs ─────────────────────────────────────────────────

  /** One of the store's broadcasts (the page's protocol messages). */
  private onBroadcast(msg: Record<string, unknown>): void {
    const id = msg.id;
    if (typeof id !== 'number' || !this.store.has(id)) return;
    const cur = this.store.getAttention(id);
    if (!cur) return;
    switch (msg.type) {
      case 'agentToolStart': {
        // Background spawns are re-sent at every turn end: they are not this agent working.
        if (msg.runInBackground === true) return this.touch(id);
        if (msg.toolName === 'AskUserQuestion') return this.set(id, 'esperandote', 'pregunta');
        // The transcript re-announcing the tool the person is being asked about.
        if (msg.permissionActive === true) return this.touch(id);
        return this.set(id, 'trabajando', 'herramienta');
      }
      case 'agentToolDone': {
        this.touch(id);
        if (cur.estado !== 'esperandote') return;
        // A hook agent's permission ends with its own PostToolUse (see onAgentEvent): the transcript's done can be an
        // earlier tool's, delayed. Without hooks, this IS the signal.
        const agent = this.store.get(id);
        if (cur.motivo === 'pregunta' || (cur.motivo === 'permiso' && !agent?.hookDelivered)) {
          this.set(id, 'trabajando', 'herramienta');
        }
        return;
      }
      case 'agentToolPermission':
        // Keep a more precise reason (a question) if it already has one.
        if (cur.estado === 'esperandote' && cur.motivo !== 'herdr-bloqueado') return this.touch(id);
        return this.set(id, 'esperandote', 'permiso');
      case 'agentToolPermissionClear':
        if (cur.estado === 'esperandote') return this.set(id, 'trabajando', 'herramienta');
        return this.touch(id);
      case 'agentStatus': {
        const status = msg.status;
        if (status === 'thinking') return this.set(id, 'trabajando', 'pensando');
        if (status === 'active') {
          // The transcript can say "active" after the permission hook: it doesn't answer the permission.
          if (cur.estado === 'esperandote') return this.touch(id);
          return this.set(
            id,
            'trabajando',
            cur.estado === 'trabajando' ? cur.motivo : 'herramienta',
          );
        }
        if (status === 'waiting') {
          // A failed turn also ends with "waiting" (and idle_prompt follows it): it stays `fallo` until the next
          // prompt. An already finished turn keeps its reason (interrumpido, fin-de-turno).
          if (cur.estado === 'fallo' || cur.estado === 'termino') return this.touch(id);
          return this.set(
            id,
            'termino',
            msg.awaitingInput === true ? 'esperando-entrada' : 'fin-de-turno',
          );
        }
        return;
      }
      case 'agentToolsClear':
      case 'agentContextUsage':
      case 'subagentToolStart':
      case 'subagentToolDone':
      case 'subagentToolPermission':
      case 'subagentClear':
        return this.touch(id);
      default:
        return;
    }
  }

  /** A provider event reached agent `id` (before the runtime handled it). */
  private onAgentEvent(id: number, event: AgentEvent): void {
    const cur = this.store.getAttention(id);
    if (!cur) return;
    this.touch(id);
    switch (event.kind) {
      case 'turnFailed':
        return this.set(
          id,
          'fallo',
          event.error === 'rate_limit' ? 'limite-de-uso' : 'error-api',
          event.error ?? 'unknown',
        );
      case 'toolEnd':
        if (event.subagentId) return;
        if (event.interrupted) return this.set(id, 'termino', 'interrumpido');
        // The tool ran: whatever it was waiting on (a permission, a question) was answered.
        if (this.store.getAttention(id)?.estado === 'esperandote') {
          this.set(id, 'trabajando', 'herramienta');
        }
        return;
      case 'permissionRequest':
        if (event.ask === 'question') this.set(id, 'esperandote', 'pregunta');
        return;
      default:
        return;
    }
  }

  /** herdr's agent_status for this agent's pane, every poll (features/herdr). A second signal, never the first. */
  noteHerdrStatus(id: number, status: string): void {
    const cur = this.store.getAttention(id);
    if (!cur) return;
    const fromHerdr = cur.estado === 'esperandote' && cur.motivo === 'herdr-bloqueado';
    if (status === 'blocked') {
      if (cur.estado !== 'esperandote' && cur.estado !== 'fallo') {
        this.set(id, 'esperandote', 'herdr-bloqueado');
      }
      return;
    }
    if (status === 'working') {
      if (fromHerdr) this.set(id, 'trabajando', 'herdr');
      return;
    }
    if (status === 'idle' || status === 'done') {
      const quiet = this.now() - this.lastActivity(id) >= ATTENTION_HERDR_IDLE_GRACE_MS;
      if (fromHerdr || ((cur.estado === 'trabajando' || cur.estado === 'atorado') && quiet)) {
        this.set(id, 'termino', 'herdr-inactivo');
      }
    }
  }

  // ── Clock ──────────────────────────────────────────────────

  /** Mark `atorado` whoever works with no event for N minutes; lift it when the transcript moved again. */
  check(): void {
    const now = this.now();
    const stuckMs = this.stuckMs();
    for (const cur of this.store.attentionList()) {
      const last = this.lastActivity(cur.agentId);
      if (cur.estado === 'trabajando' && now - last >= stuckMs) {
        this.set(cur.agentId, 'atorado', 'sin-eventos', undefined, last);
      } else if (cur.estado === 'atorado' && last > cur.desde) {
        this.set(cur.agentId, 'trabajando', 'herramienta');
      } else {
        this.refreshName(cur);
      }
    }
  }

  // ── Writes ─────────────────────────────────────────────────

  /** Newest of: the last event this tracker saw, the transcript growing. */
  private lastActivity(id: number): number {
    const cur = this.store.getAttention(id);
    const transcriptAt = this.store.get(id)?.lastTranscriptAt ?? 0;
    return Math.max(cur?.ultimoEvento ?? 0, transcriptAt);
  }

  /** Something arrived from the agent: note the time, and a stuck agent is working again. */
  private touch(id: number): void {
    const cur = this.store.getAttention(id);
    if (!cur) return;
    if (cur.estado === 'atorado') {
      this.set(id, 'trabajando', 'herramienta');
      return;
    }
    this.store.setAttention({ ...cur, ultimoEvento: this.now() });
  }

  private set(
    id: number,
    estado: AttentionState,
    motivo: AttentionReason,
    detalle?: string,
    desde?: number,
  ): void {
    const agent = this.store.get(id);
    if (!agent) return;
    const prev = this.store.getAttention(id);
    const now = this.now();
    const { nombre, perfil } = this.names(id);
    const next: AgentAttention = {
      agentId: id,
      sessionId: agent.sessionId,
      estado,
      motivo,
      desde: desde ?? (prev && prev.estado === estado ? prev.desde : now),
      // Entering `atorado` is the clock's doing, not an event.
      ultimoEvento: estado === 'atorado' ? (prev?.ultimoEvento ?? now) : now,
      nombre,
      ...(perfil ? { perfil } : {}),
      ...(estado === 'fallo' && detalle ? { detalle } : {}),
    };
    this.store.setAttention(next);
  }

  private refreshName(cur: AgentAttention): void {
    const { nombre, perfil } = this.names(cur.agentId);
    if (nombre === cur.nombre && perfil === cur.perfil) return;
    const next: AgentAttention = { ...cur, nombre };
    if (perfil) next.perfil = perfil;
    else delete next.perfil;
    this.store.setAttention(next);
  }

  private names(id: number): { nombre: string; perfil?: string } {
    let described: { nombre?: string; perfil?: string } = {};
    try {
      described = this.describe(id);
    } catch {
      /* a name is never worth breaking the tracker */
    }
    const agent = this.store.get(id);
    return {
      nombre: described.nombre || agent?.agentName || agent?.folderName || `Agente ${id}`,
      ...(described.perfil ? { perfil: described.perfil } : {}),
    };
  }
}

/** What features and packs get (ctx.attention): read the states, subscribe to changes. */
export function createAttentionApi(
  store: AgentStateStore,
  tracker: AttentionTracker,
): AgentAttentionApi {
  return {
    list: () => store.attentionList(),
    get: (agentId) => store.getAttention(agentId),
    subscribe: (listener) => {
      const safe = (change: AttentionChange): void => {
        try {
          listener(change);
        } catch (err) {
          console.error('[Atención] Un suscriptor falló:', err);
        }
      };
      store.on('attentionChanged', safe);
      return () => {
        store.off('attentionChanged', safe);
      };
    },
    stuckAfterMs: () => tracker.stuckAfterMs(),
  };
}

// ── Desktop notification ─────────────────────────────────────

/** The notification's text for an agent that needs the person (no emoji, plain Spanish). */
export function attentionNotice(a: AgentAttention, now: number): string {
  switch (a.estado) {
    case 'esperandote':
      if (a.motivo === 'pregunta') return `${a.nombre} te hizo una pregunta`;
      if (a.motivo === 'herdr-bloqueado') return `${a.nombre} te espera en la terminal`;
      return `${a.nombre} te pide permiso`;
    case 'atorado': {
      const minutes = Math.max(1, Math.round((now - a.desde) / 60_000));
      return `${a.nombre} lleva ${minutes} min sin avanzar`;
    }
    case 'fallo':
      if (a.motivo === 'limite-de-uso') return `${a.nombre} se detuvo: llegó al límite de uso`;
      return `${a.nombre} se detuvo por un error del API (${a.detalle ?? 'unknown'})`;
    default:
      return a.nombre;
  }
}

/**
 * Notify the computer when an agent ENTERS a state that needs the person. `esperandote` waits a little first
 * (answering right away never rings); `atorado` and `fallo` ring at once. Returns the cleanup.
 */
export function attachAttentionNotifier(
  api: AgentAttentionApi,
  opts: {
    notify?: (title: string, message: string) => void;
    enabled?: () => boolean;
    now?: () => number;
    waitingDelayMs?: number;
  } = {},
): () => void {
  const notify = opts.notify ?? notifyMac;
  const enabled = opts.enabled ?? (() => readAgentAttentionSettings().notify);
  const now = opts.now ?? Date.now;
  const delay = opts.waitingDelayMs ?? ATTENTION_WAITING_NOTIFY_DELAY_MS;
  const pending = new Map<number, ReturnType<typeof setTimeout>>();

  const ring = (a: AgentAttention): void => {
    if (enabled()) notify(ATTENTION_NOTIFY_TITLE, attentionNotice(a, now()));
  };
  const cancel = (id: number): void => {
    const t = pending.get(id);
    if (t) clearTimeout(t);
    pending.delete(id);
  };

  const unsubscribe = api.subscribe(({ agentId, actual, anterior }) => {
    const entered =
      actual && NEEDS_YOU_STATES.has(actual.estado) && anterior?.estado !== actual.estado;
    if (!actual || actual.estado !== 'esperandote') cancel(agentId);
    if (!entered || !actual) return;
    if (actual.estado !== 'esperandote') return ring(actual);
    const desde = actual.desde;
    pending.set(
      agentId,
      setTimeout(() => {
        pending.delete(agentId);
        const still = api.get(agentId);
        if (still?.estado === 'esperandote' && still.desde === desde) ring(still);
      }, delay),
    );
  });

  return () => {
    unsubscribe();
    for (const id of [...pending.keys()]) cancel(id);
  };
}
