import type { AgentAttentionApi } from '../../core/src/attention.js';
import type { ServerFeature } from './serverFeature.js';

/** What a private pack's server entry (privado/<pack>/server.ts) gets from the CLI. */
export interface PackServerContext {
  /** http://127.0.0.1:<port> once the server listens (null before). */
  serverUrl(): string | null;
  /** The office server token (privileged pages carry it), once known. */
  officeToken(): string | null;
  /** dist/packs/<pack>/: the pack's planos and assets as built. */
  packDir: string;
  /** The public features already created, to read from (e.g. the music feature). */
  features: readonly ServerFeature[];
  /** Each agent's attention state (working, waiting on you, stuck, failed): docs/atencion-agentes.md. */
  attention: AgentAttentionApi;
}

/** `export default function (ctx) { return [features…] }` in privado/<pack>/server.ts. */
export type PackServerEntry = (ctx: PackServerContext) => ServerFeature[];
