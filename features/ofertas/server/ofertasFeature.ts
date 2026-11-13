import * as os from 'os';

import type {
  ConnectionInfo,
  ConnectionState,
  OfertasAlert,
  OfertasAsistenteEstado,
  OfertasDeal,
  OfertasGroup,
  OfertasInstallments,
  OfertasLink,
  OfertasOffer,
  OfertasPick,
  OfertasPoint,
  OfertasResults,
  OfertasSettings,
  OfertasSource,
  OfertasStatus,
  OfertasVerdict,
  OfertasWatch,
} from '../../../core/src/messages.js';
import { notifyDesktop } from '../../../server/src/notifyDesktop.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { type Asistente, createAsistente } from './asistente/asistente.js';
import {
  CONNECTIONS_FEATURE,
  CONNECTIONS_ID_PREFIX,
  CONNECTIONS_PURPOSE,
  FRAGILE_DEFAULT_DETAIL,
  FRAGILE_PREFIX,
  LOG_PREFIX,
  NOTIFICATION_TITLE,
  OFERTAS_QUERY_MAX,
  OFERTAS_WORD_MAX_LENGTH,
  OFERTAS_WORDS_MAX,
  SEARCH_FAILED_DETAIL,
} from './constants.js';
import { ASISTENTE_MESSAGES, createAsistenteBridge } from './ofertasAsistente.js';
import { createSources, storeLinks } from './vigia/sources/index.js';
import { parseReference, readKeys } from './vigia/storage.js';
import type {
  Alert,
  CommunityDeal,
  Installments,
  Notifier,
  Offer,
  OfferGroup,
  Pick,
  PricePoint,
  SearchOutcome,
  Settings,
  SourceState,
  SourceStatus,
  StoreLink,
  Verdict,
  Vigia,
  VigiaState,
  Watch,
  WatchInput,
} from './vigia/types.js';
import { createVigia } from './vigia/vigia.js';

export interface OfertasFeatureOptions {
  home?: string;
  /** Tests pass a double; without it the real watch is built and started. */
  vigia?: Vigia;
  notify?: (title: string, message: string) => void;
  /** Off in tests: no schedule runs by itself. */
  timers?: boolean;
  /** The optional assistant; tests pass one that runs a fake CLI. */
  asistente?: Asistente;
}

// ── Core state → protocol (the protocol has additionalProperties: false: copy only its fields) ────────────────

/** The same object without the keys whose value is undefined. */
function defined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function toOffer(o: Offer): OfertasOffer {
  return defined<OfertasOffer>({
    sourceId: o.sourceId,
    store: o.store,
    title: o.title,
    price: o.price,
    listPrice: o.listPrice,
    seller: o.seller,
    official: o.official,
    sellerUnknown: o.sellerUnknown,
    freeShipping: o.freeShipping,
    url: o.url,
    image: o.image,
    installments: o.installments ? toInstallments(o.installments) : undefined,
  });
}

function toInstallments(i: Installments): OfertasInstallments {
  return defined<OfertasInstallments>({ months: i.months, bank: i.bank });
}

function toPick(p: Pick): OfertasPick {
  return { offer: toOffer(p.offer), reason: p.reason };
}

function toVerdict(v: Verdict): OfertasVerdict {
  return { kind: v.kind, reason: v.reason };
}

function toPoint(p: PricePoint): OfertasPoint {
  return { at: p.at, price: p.price };
}

export function toWatch(w: Watch): OfertasWatch {
  return defined<OfertasWatch>({
    id: w.id,
    query: w.query,
    target: w.target,
    mustHave: [...w.mustHave],
    exclude: [...w.exclude],
    best: w.best ? toOffer(w.best) : undefined,
    others: w.others.map(toOffer),
    lowest: w.lowest,
    lowestAt: w.lowestAt,
    history: w.history.map(toPoint),
    checkedAt: w.checkedAt,
    nextCheckAt: w.nextCheckAt,
    note: w.note,
    reached: w.reached,
    error: w.error,
    reference: w.reference ? { price: w.reference.price, at: w.reference.at } : undefined,
    pick: w.pick ? toPick(w.pick) : undefined,
    verdict: w.verdict ? toVerdict(w.verdict) : undefined,
    // Already validated and trimmed to the protocol's fields (asistente/trabajos.ts)
    asistente: w.asistente ? structuredClone(w.asistente) : undefined,
  });
}

function toAlert(a: Alert): OfertasAlert {
  return defined<OfertasAlert>({
    id: a.id,
    watchId: a.watchId,
    at: a.at,
    kind: a.kind,
    text: a.text,
    price: a.price,
    store: a.store,
    url: a.url,
    seen: a.seen,
  });
}

export function toSource(s: SourceStatus): OfertasSource {
  return defined<OfertasSource>({
    id: s.id,
    name: s.name,
    state: s.state,
    fragile: s.fragile,
    enabled: s.enabled,
    detail: s.detail,
    count: s.count,
    lastOkAt: s.lastOkAt,
  });
}

function toSettings(s: Settings): OfertasSettings {
  return {
    everyMinutes: s.everyMinutes,
    buenFin: s.buenFin,
    dropPercent: s.dropPercent,
    disabledSources: [...s.disabledSources],
  };
}

function toGroup(g: OfferGroup): OfertasGroup {
  return defined<OfertasGroup>({
    key: g.key,
    title: g.title,
    offers: g.offers.map(toOffer),
    pick: g.pick ? toPick(g.pick) : undefined,
    verdict: g.verdict ? toVerdict(g.verdict) : undefined,
  });
}

function toDeal(d: CommunityDeal): OfertasDeal {
  return defined<OfertasDeal>({
    id: d.id,
    title: d.title,
    price: d.price,
    merchant: d.merchant,
    temperature: d.temperature,
    url: d.url,
    publishedAt: d.publishedAt,
    expired: d.expired,
    installments: d.installments ? toInstallments(d.installments) : undefined,
  });
}

function toLink(l: StoreLink): OfertasLink {
  return { name: l.name, url: l.url };
}

export function toStatus(state: VigiaState): OfertasStatus {
  return {
    type: 'ofertasStatus',
    watches: state.watches.map(toWatch),
    alerts: state.alerts.map(toAlert),
    sources: state.sources.map(toSource),
    settings: toSettings(state.settings),
    checking: state.checking,
  };
}

export function toResults(
  requestId: string,
  outcome: SearchOutcome,
  searching: boolean,
): OfertasResults {
  return {
    type: 'ofertasResults',
    requestId,
    query: outcome.query,
    searching,
    groups: outcome.groups.map(toGroup),
    deals: outcome.deals.map(toDeal),
    sources: outcome.sources.map(toSource),
    links: outcome.links.map(toLink),
  };
}

// ── Connections board ────────────────────────────────────────────────────────────────────────────────────────

const CONNECTION_STATE: Record<SourceState, ConnectionState> = {
  ok: 'ok',
  idle: 'ok',
  error: 'warn',
  blocked: 'warn',
  nokey: 'off',
  off: 'off',
};

export function toConnections(sources: SourceStatus[]): ConnectionInfo[] {
  const fromSources = sources.map((s) => {
    const detail = s.fragile ? `${FRAGILE_PREFIX}${s.detail ?? FRAGILE_DEFAULT_DETAIL}` : s.detail;
    return defined<ConnectionInfo>({
      id: `${CONNECTIONS_ID_PREFIX}${s.id}`,
      name: s.name,
      feature: CONNECTIONS_FEATURE,
      purpose: CONNECTIONS_PURPOSE,
      auth: s.access,
      state: CONNECTION_STATE[s.state] ?? 'off',
      detail,
      lastUsedAt: s.lastOkAt,
    });
  });
  return [
    ...fromSources,
    {
      id: `${CONNECTIONS_ID_PREFIX}fcm`,
      name: 'Firebase Cloud Messaging',
      feature: CONNECTIONS_FEATURE,
      purpose: 'Avisos al celular',
      auth: 'Proyecto de Firebase',
      state: 'idea',
      detail: 'Planeado: falta proyecto de Firebase y la app o página que reciba el aviso',
    },
    {
      id: `${CONNECTIONS_ID_PREFIX}ntfy`,
      name: 'ntfy',
      feature: CONNECTIONS_FEATURE,
      purpose: 'Avisos al celular sin cuenta (solo el vigía de consola)',
      auth: 'Tema público, sin cuenta',
      state: 'off',
      detail: 'Sin tema configurado',
    },
  ];
}

/** The optional assistant on the connections board: the local Claude Code, no key of its own. */
export function toAssistantConnection(e: OfertasAsistenteEstado): ConnectionInfo {
  return {
    id: `${CONNECTIONS_ID_PREFIX}asistente`,
    name: 'Claude Code (asistente)',
    feature: CONNECTIONS_FEATURE,
    purpose: 'Investigar el precio normal y buscar similares (opcional)',
    auth: 'La sesión de suscripción de Claude Code de esta máquina; nunca una llave de pago',
    state: e.available ? 'ok' : 'off',
    detail: !e.installed
      ? 'Claude Code no está instalado'
      : !e.enabled
        ? 'Apagado en Ajustes de Ofertas'
        : `Modelo ${e.model}; cada consulta tarda cerca de un minuto`,
  };
}

// ── Alerts ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Sends each alert as a desktop notification. */
export function createDesktopNotifier(notify: (title: string, message: string) => void): Notifier {
  return {
    id: 'desktop',
    notify(alert) {
      notify(NOTIFICATION_TITLE, alert.text);
    },
  };
}

// ── Validation of client messages ────────────────────────────────────────────────────────────────────────────

function cleanQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const q = value.trim();
  return q && q.length <= OFERTAS_QUERY_MAX ? q : null;
}

/** A list of words: strings only, trimmed, no empties or repeats, capped. */
export function cleanWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const word = item.trim().slice(0, OFERTAS_WORD_MAX_LENGTH);
    if (word && !out.includes(word)) out.push(word);
    if (out.length >= OFERTAS_WORDS_MAX) break;
  }
  return out;
}

/** The watch to save, or null when the message is not valid. */
export function parseWatchInput(msg: Record<string, unknown>): WatchInput | null {
  const query = cleanQuery(msg.query);
  if (!query) return null;
  const input: WatchInput = { query };
  if (msg.id !== undefined) {
    if (typeof msg.id !== 'string' || !msg.id) return null;
    input.id = msg.id;
  }
  if (msg.target !== undefined) {
    if (typeof msg.target !== 'number' || !Number.isFinite(msg.target) || msg.target <= 0)
      return null;
    input.target = msg.target;
  }
  if (msg.mustHave !== undefined) input.mustHave = cleanWords(msg.mustHave);
  if (msg.exclude !== undefined) input.exclude = cleanWords(msg.exclude);
  if (msg.reference !== undefined) {
    const reference = parseReference(msg.reference);
    if (!reference) return null;
    input.reference = reference;
  }
  return input;
}

/** Only the settings that came, each with the right type. */
export function parseSettings(msg: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  const positive = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (positive(msg.everyMinutes)) out.everyMinutes = msg.everyMinutes;
  if (positive(msg.dropPercent)) out.dropPercent = msg.dropPercent;
  if (typeof msg.buenFin === 'boolean') out.buenFin = msg.buenFin;
  if (Array.isArray(msg.disabledSources))
    out.disabledSources = msg.disabledSources.filter((s): s is string => typeof s === 'string');
  return out;
}

const MESSAGES = [
  'searchOfertas',
  'saveOfertasWatch',
  'deleteOfertasWatch',
  'checkOfertas',
  'setOfertasSettings',
  'markOfertasAlertsSeen',
];

/**
 * The price watch (features/ofertas): live searches across stores, saved searches checked on a schedule and alerts
 * as desktop notifications. This file only plugs the watch (./vigia, plain Node) into the office. Privileged
 * connections only.
 */
export function createOfertasFeature(opts: OfertasFeatureOptions = {}): ServerFeature {
  const notify = opts.notify ?? notifyDesktop;
  const home = opts.home ?? os.homedir();
  let vigia: Vigia;
  if (opts.vigia) {
    vigia = opts.vigia;
  } else {
    vigia = createVigia({
      home,
      sources: createSources({ keys: () => readKeys(home) }),
      links: storeLinks,
      notifiers: [createDesktopNotifier(notify)],
      timers: opts.timers,
    });
    vigia.start();
  }

  const clients = new Set<FeatureClient>();
  const status = () => toStatus(vigia.state()) as unknown as Record<string, unknown>;
  const unsubscribe = vigia.onChange(() => {
    const msg = status();
    for (const c of clients) c.send(msg);
  });
  const asistente = createAsistenteBridge({
    asistente: opts.asistente ?? createAsistente({ home }),
    vigia,
    home,
    broadcast: (msg) => {
      for (const c of clients) c.send(msg);
    },
    resend: (client, requestId, outcome) =>
      client.send(toResults(requestId, outcome, false) as unknown as Record<string, unknown>),
  });

  async function search(requestId: string, query: string, client: FeatureClient): Promise<void> {
    const empty: SearchOutcome = { query, groups: [], deals: [], sources: [], links: [] };
    client.send(toResults(requestId, empty, true) as unknown as Record<string, unknown>);
    let outcome: SearchOutcome;
    try {
      outcome = await vigia.search(query);
    } catch (err) {
      console.warn(`${LOG_PREFIX} La búsqueda falló:`, (err as Error).message);
      let sources: SourceStatus[] = [];
      try {
        sources = vigia
          .state()
          .sources.map((s) => ({ ...s, state: 'error' as const, detail: SEARCH_FAILED_DETAIL }));
      } catch {
        // Without the state there is nothing to list: the page shows an empty search
      }
      outcome = { ...empty, sources };
    }
    asistente.rememberSearch(requestId, outcome, client);
    client.send(toResults(requestId, outcome, false) as unknown as Record<string, unknown>);
  }

  /** One message of a privileged client (already known to be ours). */
  function apply(msg: Record<string, unknown>, client: FeatureClient): void {
    if (msg.type === 'searchOfertas') {
      const query = cleanQuery(msg.query);
      if (query && typeof msg.requestId === 'string') void search(msg.requestId, query, client);
    } else if (msg.type === 'saveOfertasWatch') {
      const input = parseWatchInput(msg);
      if (input) {
        // The first price shows up right away instead of waiting for the next tick
        const saved = vigia.saveWatch(input);
        void vigia.check(saved.id).catch((err: unknown) => {
          console.warn(`${LOG_PREFIX} La revisión falló:`, (err as Error).message);
        });
      }
    } else if (msg.type === 'deleteOfertasWatch') {
      if (typeof msg.id === 'string' && msg.id) vigia.deleteWatch(msg.id);
    } else if (msg.type === 'checkOfertas') {
      const id = typeof msg.id === 'string' && msg.id ? msg.id : undefined;
      void vigia.check(id).catch((err: unknown) => {
        console.warn(`${LOG_PREFIX} La revisión falló:`, (err as Error).message);
      });
    } else if (msg.type === 'setOfertasSettings') {
      const changes = parseSettings(msg);
      if (Object.keys(changes).length > 0) vigia.setSettings(changes);
    } else {
      vigia.markAlertsSeen();
    }
  }

  return {
    name: 'ofertas',
    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => {
        clients.delete(client);
        asistente.clientGone(client);
      };
    },
    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady') {
        if (client.privileged) {
          client.send(status());
          client.send(asistente.estado() as unknown as Record<string, unknown>);
        }
        return false; // the core handler still runs
      }
      if (ASISTENTE_MESSAGES.includes(String(msg.type))) {
        // Each query starts a process that spends subscription usage: only with the token
        if (!client.privileged) {
          console.warn(`${LOG_PREFIX} Ignorando ${String(msg.type)} de un cliente sin token.`);
          return true;
        }
        try {
          asistente.handle(msg, client);
        } catch (err) {
          console.warn(
            `${LOG_PREFIX} No pude atender ${String(msg.type)}:`,
            (err as Error).message,
          );
        }
        return true;
      }
      if (!MESSAGES.includes(String(msg.type))) return false;
      if (!client.privileged) {
        console.warn(`${LOG_PREFIX} Ignorando ${String(msg.type)} de un cliente sin token.`);
        return true;
      }
      try {
        apply(msg, client);
      } catch (err) {
        console.warn(`${LOG_PREFIX} No pude atender ${String(msg.type)}:`, (err as Error).message);
      }
      return true;
    },
    dispose() {
      unsubscribe();
      asistente.dispose();
      vigia.stop();
    },
    /** For the connections board (features/conexiones). No keys in here. */
    connections(): ConnectionInfo[] {
      return [...toConnections(vigia.state().sources), toAssistantConnection(asistente.estado())];
    },
  };
}
