/**
 * Agent attention (docs/atencion-agentes.md): whether an agent is working, waiting on the person, stuck or failed.
 * The server derives it (server/src/agentAttention.ts) and keeps it in the AgentStateStore; the page draws a bubble
 * for the states that need the person and features/packs read it through `ctx.attention`.
 *
 * The values are Spanish on purpose: they are the contract the docs and the private packs use.
 */

export const ATTENTION_STATES = [
  'trabajando',
  'esperandote',
  'atorado',
  'fallo',
  'termino',
] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

/** Fixed codes (compare them; they are not text to show). The table in docs/atencion-agentes.md says where each comes from. */
export const ATTENTION_REASONS = [
  // trabajando
  'herramienta',
  'pensando',
  'herdr',
  // esperandote
  'permiso',
  'pregunta',
  'herdr-bloqueado',
  // atorado
  'sin-eventos',
  // fallo
  'limite-de-uso',
  'error-api',
  // termino
  'inicio',
  'fin-de-turno',
  'esperando-entrada',
  'interrumpido',
  'herdr-inactivo',
] as const;
export type AttentionReason = (typeof ATTENTION_REASONS)[number];

/** The states that need the person: they get a bubble and a desktop notification. */
export const NEEDS_YOU_STATES: ReadonlySet<AttentionState> = new Set<AttentionState>([
  'esperandote',
  'atorado',
  'fallo',
]);

export interface AgentAttention {
  agentId: number;
  sessionId: string;
  estado: AttentionState;
  motivo: AttentionReason;
  /** ms since epoch: when it entered this state. For `atorado`, the time of the last event (when it went quiet). */
  desde: number;
  /** ms since epoch: the last event that arrived from this agent. */
  ultimoEvento: number;
  /** Only for `fallo`: the CLI's error code (Claude Code: rate_limit, overloaded, server_error…). */
  detalle?: string;
  /** How the office names the agent: herdr tab, teammate name or folder. */
  nombre: string;
  /** Claude Code profile the session runs under; absent for the default one. */
  perfil?: string;
}

/** One change, in order. `actual` null = the agent left the office; `anterior` null = it just arrived. */
export interface AttentionChange {
  agentId: number;
  actual: AgentAttention | null;
  anterior: AgentAttention | null;
}

/** What features and packs get to read the attention states (ctx.attention). */
export interface AgentAttentionApi {
  list(): AgentAttention[];
  get(agentId: number): AgentAttention | undefined;
  /** Every change, synchronously. Returns the unsubscribe function. */
  subscribe(listener: (change: AttentionChange) => void): () => void;
  /** Minutes without events before `atorado`, in ms, as configured right now. */
  stuckAfterMs(): number;
}
