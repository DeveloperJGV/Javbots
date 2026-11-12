import { execFile } from 'child_process';

import type { ConnectionInfo, HerdrTabLabels } from '../../../core/src/messages.js';
import { createPollingFeature } from '../../../server/src/pollingFeature.js';
import {
  HERDR_POLL_MS,
  HERDR_TIMEOUT_MS,
  herdrBins,
  HOOK_PANE_FIELD,
  LOG_PREFIX,
  MAX_LABEL_CHARS,
} from './constants.js';

/** Runs the herdr CLI; injectable for tests. Resolves with stdout, rejects on failure. */
export type HerdrRunner = (args: string[]) => Promise<string>;

function runWith(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: HERDR_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error((stderr || err.message).trim()), { code: err.code }));
      else resolve(stdout);
    });
  });
}

/** The first herdr binary that exists wins and is remembered. */
export function createHerdrRunner(bins: string[] = herdrBins()): HerdrRunner {
  let found: string | null = null;
  return async (args) => {
    if (found) return runWith(found, args);
    let lastErr: unknown = new Error('herdr not found');
    for (const bin of bins) {
      try {
        const out = await runWith(bin, args);
        found = bin;
        return out;
      } catch (err) {
        lastErr = err;
        if ((err as { code?: unknown }).code !== 'ENOENT') throw err; // it exists but failed
      }
    }
    throw lastErr;
  };
}

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** `herdr <cmd> list` → its `result[key]` array (empty on anything unexpected). */
function listOf(stdout: string, key: string): Raw[] {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    const list = isObject(parsed) && isObject(parsed.result) ? parsed.result[key] : undefined;
    return Array.isArray(list) ? list.filter(isObject) : [];
  } catch {
    return [];
  }
}

export interface HerdrSnapshot {
  /** pane_id → tab label */
  tabOfPane: Map<string, string>;
  /** Claude session id herdr last saw in each pane → pane_id. Can be stale (herdr keeps the first id of a pane). */
  paneOfSession: Map<string, string>;
  /** pane_id → herdr's agent_status there (working, blocked, done, idle), for panes running an agent. */
  statusOfPane: Map<string, string>;
}

export function parseHerdr(paneListOut: string, tabListOut: string): HerdrSnapshot {
  const labelOfTab = new Map<string, string>();
  for (const tab of listOf(tabListOut, 'tabs')) {
    const id = str(tab.tab_id);
    const label = str(tab.label)?.trim();
    if (id && label) labelOfTab.set(id, label.slice(0, MAX_LABEL_CHARS));
  }
  const tabOfPane = new Map<string, string>();
  const paneOfSession = new Map<string, string>();
  const statusOfPane = new Map<string, string>();
  for (const pane of listOf(paneListOut, 'panes')) {
    const paneId = str(pane.pane_id);
    const status = str(pane.agent_status);
    if (paneId && status) statusOfPane.set(paneId, status);
    const label = labelOfTab.get(str(pane.tab_id) ?? '');
    if (!paneId || !label) continue;
    tabOfPane.set(paneId, label);
    const session = isObject(pane.agent_session) ? str(pane.agent_session.value) : undefined;
    if (session) paneOfSession.set(session, paneId);
  }
  return { tabOfPane, paneOfSession, statusOfPane };
}

/** The pane an agent's session runs in: the hook's (authoritative) or the one herdr recorded. */
function paneOf(
  sessionId: string,
  hookPanes: ReadonlyMap<string, string>,
  herdr: HerdrSnapshot,
): string | undefined {
  return hookPanes.get(sessionId) ?? herdr.paneOfSession.get(sessionId);
}

/** Each agent's herdr agent_status (docs/atencion-agentes.md uses it as a second signal). */
export function agentStatuses(
  agents: Iterable<[number, { sessionId: string }]>,
  hookPanes: ReadonlyMap<string, string>,
  herdr: HerdrSnapshot,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const [id, agent] of agents) {
    const pane = paneOf(agent.sessionId, hookPanes, herdr);
    const status = pane ? herdr.statusOfPane.get(pane) : undefined;
    if (status) out.set(id, status);
  }
  return out;
}

/**
 * Each agent's label: the name of the herdr tab its session runs in. The pane comes from the hook (authoritative:
 * the hook script runs inside the session) or, until a hook arrives, from the session id herdr itself recorded.
 */
export function tabLabels(
  agents: Iterable<[number, { sessionId: string }]>,
  hookPanes: ReadonlyMap<string, string>,
  herdr: HerdrSnapshot,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, agent] of agents) {
    const pane = paneOf(agent.sessionId, hookPanes, herdr);
    const label = pane ? herdr.tabOfPane.get(pane) : undefined;
    if (label) out[id] = label;
  }
  return out;
}

/**
 * herdr tab names (features/herdr): every character is labelled with the name of its terminal tab in herdr,
 * instead of the folder. Asks the herdr CLI every few seconds while a page is open; without herdr it sends nothing
 * and the office keeps the folder names.
 */
export function createHerdrFeature(opts: {
  agents: () => Iterable<[number, { sessionId: string }]>;
  run?: HerdrRunner;
  pollMs?: number;
  /** Every poll, herdr's agent_status for each agent it can place (agent attention's second signal). */
  onAgentStatus?: (agentId: number, status: string) => void;
}) {
  const run = opts.run ?? createHerdrRunner();
  const hookPanes = new Map<string, string>();
  let current: HerdrTabLabels = { type: 'herdrTabLabels', labels: {} };
  let last = JSON.stringify(current);
  let warned = false;
  let okAt = 0;

  let feature: ReturnType<typeof createPollingFeature<HerdrTabLabels>> | null = null;
  feature = createPollingFeature({
    name: 'herdr',
    everyMs: opts.pollMs ?? HERDR_POLL_MS,
    enabled: true,
    read: async () => {
      if (!feature?.listeners) return null;
      let snapshot: HerdrSnapshot;
      try {
        const [panes, tabs] = await Promise.all([run(['pane', 'list']), run(['tab', 'list'])]);
        snapshot = parseHerdr(panes, tabs);
        warned = false;
        okAt = Date.now();
      } catch (err) {
        // herdr closed or not installed: keep the last names rather than flicker back to folders
        if (!warned) console.log(`${LOG_PREFIX} Sin herdr por ahora:`, (err as Error).message);
        warned = true;
        return null;
      }
      if (opts.onAgentStatus) {
        for (const [id, status] of agentStatuses(opts.agents(), hookPanes, snapshot)) {
          opts.onAgentStatus(id, status);
        }
      }
      const msg: HerdrTabLabels = {
        type: 'herdrTabLabels',
        labels: tabLabels(opts.agents(), hookPanes, snapshot),
      };
      const key = JSON.stringify(msg);
      if (key === last) return null;
      last = key;
      current = msg;
      return msg;
    },
    snapshot: () => current,
    logPrefix: LOG_PREFIX,
  });

  return Object.assign(feature, {
    connections: (): ConnectionInfo[] => [
      {
        id: 'herdr',
        name: 'Herdr',
        feature: 'Nombres de pestañas',
        purpose: 'Nombre de la pestaña de terminal de cada agente',
        auth: 'CLI local, sin llave',
        state: warned ? 'warn' : okAt ? 'ok' : 'off',
        detail: warned
          ? 'Herdr cerrado o no instalado'
          : okAt
            ? 'Leyendo pestañas'
            : 'Aún no se ha preguntado',
        ...(okAt ? { lastUsedAt: new Date(okAt).toISOString() } : {}),
      },
    ],
    /** The herdr tab name of an agent, as last sent to the page. */
    labelOf(agentId: number): string | undefined {
      return current.labels[String(agentId)];
    },
    /** Every hook event: remember which herdr pane its session runs in. */
    noteHookEvent(event: Record<string, unknown>): void {
      const session = str(event.session_id);
      const pane = str(event[HOOK_PANE_FIELD]);
      if (!session || !pane || hookPanes.get(session) === pane) return;
      hookPanes.set(session, pane);
      void feature?.poll();
    },
  });
}
