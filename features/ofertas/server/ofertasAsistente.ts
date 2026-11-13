/**
 * Plugs the optional assistant (./asistente) into the Ofertas panel: who may ask (privileged clients only: every query
 * starts a process that spends subscription usage), one query at a time, where its answer goes (a watched search keeps
 * it in ofertas.json; a product of a live search gets its verdict again), and its two settings.
 */
import type {
  OfertasAsistenteEstado,
  OfertasAsistenteJob,
  OfertasAsistenteResultado,
} from '../../../core/src/messages.js';
import type { FeatureClient } from '../../../server/src/serverFeature.js';
import type { Asistente } from './asistente/asistente.js';
import { writeAsistenteSettings } from './asistente/config.js';
import { MODEL_CHOICES, PRODUCT_MAX, STORE_MAX } from './asistente/constants.js';
import { ASISTENTE_IDS_MAX, ASISTENTE_SEARCHES_KEPT, LOG_PREFIX } from './constants.js';
import type { SearchOutcome, Vigia } from './vigia/types.js';
import { assistantFacts } from './vigia/vigia.js';

export const ASISTENTE_MESSAGES = [
  'ofertasAsistenteInvestigar',
  'ofertasAsistenteSimilares',
  'ofertasAsistenteCancelar',
  'setOfertasAsistente',
];

type Msg = Record<string, unknown>;

/** Where an answer goes: a watched search, or one product of a live search. */
interface Target {
  watchId?: string;
  requestId?: string;
  groupKey?: string;
}

interface Running extends Target {
  job: OfertasAsistenteJob;
  product: string;
  startedAt: string;
  client: FeatureClient;
}

export interface AsistenteBridgeOptions {
  asistente: Asistente;
  vigia: Vigia;
  home: string;
  /** To every privileged client. */
  broadcast: (msg: Msg) => void;
  /** A live search's product got a new verdict: its results again, to the client that searched. */
  resend: (client: FeatureClient, requestId: string, outcome: SearchOutcome) => void;
  now?: () => Date;
}

export interface AsistenteBridge {
  estado(): OfertasAsistenteEstado;
  /** The live searches answered lately (the assistant's price can re-judge one of their products). */
  rememberSearch(requestId: string, outcome: SearchOutcome, client: FeatureClient): void;
  /** One of ASISTENTE_MESSAGES from a privileged client. */
  handle(msg: Msg, client: FeatureClient): void;
  /** The client that asked went away: its query is stopped (nobody would see it). */
  clientGone(client: FeatureClient): void;
  dispose(): void;
}

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= max ? t : undefined;
};
const amount = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/** Copy only what is defined (the protocol has additionalProperties: false). */
function defined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function createAsistenteBridge(o: AsistenteBridgeOptions): AsistenteBridge {
  const now = o.now ?? (() => new Date());
  let running: Running | undefined;
  const searches = new Map<string, { outcome: SearchOutcome; client: FeatureClient }>();

  function estado(): OfertasAsistenteEstado {
    const info = o.asistente.info();
    return defined<OfertasAsistenteEstado>({
      type: 'ofertasAsistenteEstado',
      installed: info.installed,
      enabled: info.enabled,
      available: info.installed && info.enabled,
      model: info.model,
      busy: running !== undefined,
      job: running?.job,
      product: running?.product,
      startedAt: running?.startedAt,
      watchId: running?.watchId,
      requestId: running?.requestId,
      groupKey: running?.groupKey,
    });
  }
  const broadcastEstado = () => o.broadcast(estado() as unknown as Msg);

  function target(msg: Msg): Target {
    return {
      watchId: text(msg.watchId, ASISTENTE_IDS_MAX),
      requestId: text(msg.requestId, ASISTENTE_IDS_MAX),
      groupKey: text(msg.groupKey, PRODUCT_MAX * 4),
    };
  }

  function reply(client: FeatureClient, r: Omit<OfertasAsistenteResultado, 'type'>): void {
    client.send(defined({ type: 'ofertasAsistenteResultado', ...r }) as unknown as Msg);
  }

  /** The price found counts for the product of a live search: its verdict again, sent with its results. */
  function rejudgeSearch(t: Target, facts: ReturnType<typeof assistantFacts>): void {
    if (!facts || !t.requestId || !t.groupKey) return;
    const kept = searches.get(t.requestId);
    const group = kept?.outcome.groups.find((g) => g.key === t.groupKey);
    if (!kept || !group) return;
    const groups = kept.outcome.groups.map((g) =>
      g === group ? o.vigia.rejudge(g, kept.outcome.query, facts) : g,
    );
    kept.outcome = { ...kept.outcome, groups };
    o.resend(kept.client, t.requestId, kept.outcome);
  }

  async function ask(job: OfertasAsistenteJob, msg: Msg, client: FeatureClient): Promise<void> {
    const product = text(msg.producto, PRODUCT_MAX);
    const t = target(msg);
    if (!product) return;
    if (running || o.asistente.busy()) {
      reply(client, { job, product, ok: false, reason: 'busy', ...t });
      return;
    }
    running = { job, product, startedAt: now().toISOString(), client, ...t };
    broadcastEstado();
    try {
      if (job === 'precio') {
        const r = await o.asistente.investigarPrecio(product, {
          precioActual: amount(msg.precioActual),
          tienda: text(msg.tienda, STORE_MAX),
        });
        if (r.ok) {
          if (t.watchId) o.vigia.setAssistant(t.watchId, { precio: r.data });
          else rejudgeSearch(t, assistantFacts({ precio: r.data }, now().getTime()));
          reply(client, { job, product, ok: true, precio: r.data, ...t });
        } else {
          reply(client, { job, product, ok: false, reason: r.reason, detail: r.detail, ...t });
        }
      } else {
        const r = await o.asistente.buscarSimilares(product, {
          presupuesto: amount(msg.presupuesto),
        });
        if (r.ok) {
          if (t.watchId) o.vigia.setAssistant(t.watchId, { similares: r.data });
          reply(client, { job, product, ok: true, similares: r.data, ...t });
        } else {
          reply(client, { job, product, ok: false, reason: r.reason, detail: r.detail, ...t });
        }
      }
    } catch (err) {
      // The assistant never throws; a failure of ours (saving, sending) must not leave it "busy"
      console.warn(`${LOG_PREFIX} El asistente no pudo terminar:`, (err as Error).message);
      reply(client, { job, product, ok: false, reason: 'failed', ...t });
    } finally {
      running = undefined;
      broadcastEstado();
    }
  }

  return {
    estado,

    rememberSearch(requestId, outcome, client) {
      searches.delete(requestId);
      searches.set(requestId, { outcome, client });
      while (searches.size > ASISTENTE_SEARCHES_KEPT) {
        searches.delete(searches.keys().next().value!);
      }
    },

    handle(msg, client) {
      if (msg.type === 'ofertasAsistenteInvestigar') void ask('precio', msg, client);
      else if (msg.type === 'ofertasAsistenteSimilares') void ask('similares', msg, client);
      else if (msg.type === 'ofertasAsistenteCancelar') o.asistente.cancel();
      else if (msg.type === 'setOfertasAsistente') {
        const changes: { enabled?: boolean; model?: string } = {};
        if (typeof msg.enabled === 'boolean') changes.enabled = msg.enabled;
        if (
          typeof msg.model === 'string' &&
          (MODEL_CHOICES as readonly string[]).includes(msg.model)
        )
          changes.model = msg.model;
        if (Object.keys(changes).length === 0) return;
        if (!writeAsistenteSettings(changes, o.home)) {
          console.warn(`${LOG_PREFIX} No se pudieron guardar los ajustes del asistente.`);
        }
        if (changes.enabled === false) o.asistente.cancel();
        broadcastEstado();
      }
    },

    clientGone(client) {
      for (const [id, s] of searches) if (s.client === client) searches.delete(id);
      if (running?.client === client) o.asistente.cancel();
    },

    dispose() {
      o.asistente.cancel();
      searches.clear();
    },
  };
}
