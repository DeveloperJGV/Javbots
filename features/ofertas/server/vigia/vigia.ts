/**
 * The price watch: live searches over every source, saved searches checked one after another on a schedule with
 * random variation, price history, alerts and a polite back-off for stores that fail or block. Plain Node.
 */
import { randomUUID } from 'crypto';
import * as os from 'os';

import {
  ALERTS_CAP,
  ASSISTANT_KEEP_DAYS,
  BLOCKED_BACKOFF_BASE_MS,
  BLOCKED_BACKOFF_CAP_MS,
  BUEN_FIN_EVERY_MINUTES,
  DAY_MS,
  ERROR_BACKOFF_BASE_MS,
  ERROR_BACKOFF_CAP_MS,
  HISTORY_CAP,
  LOG_PREFIX,
  OTHERS_CAP,
  SCHEDULE_JITTER,
  SEEN_DEALS_CAP,
  SOURCE_TIMEOUT_MS,
  TEXT,
  TICK_MS,
} from './constants.js';
import { bestPerStore, groupOffers } from './grouping.js';
import type { RelevanceRule } from './relevance.js';
import { isRelevant, normalize } from './relevance.js';
import { alertsFor, describeTrend, suspiciousListPrice, untilText } from './rules.js';
import { parseReference, parseSettings, readData, wordList, writeData } from './storage.js';
import type {
  Alert,
  AssistantFacts,
  CommunityDeal,
  Offer,
  OfferGroup,
  PricePoint,
  SearchOutcome,
  Settings,
  Source,
  SourceAnswer,
  SourceState,
  SourceStatus,
  StoreLink,
  Vigia,
  VigiaOptions,
  VigiaState,
  Watch,
  WatchAssistant,
  WatchInput,
} from './types.js';
import { judge, pickOffer } from './verdict.js';

const MIN = 60_000;

/** The assistant's prices of a watch, while its answer is recent enough to count. */
export function assistantFacts(
  answer: WatchAssistant | undefined,
  nowMs: number,
): AssistantFacts | undefined {
  const p = answer?.precio;
  if (!p || nowMs - Date.parse(p.revisado) > ASSISTANT_KEEP_DAYS * DAY_MS) return undefined;
  if (p.precioTipico === undefined && p.minimoVisto === undefined) return undefined;
  return { typical: p.precioTipico, low: p.minimoVisto };
}

/** What the watch remembers of a source between searches (memory only). */
interface SourceRuntime {
  state: SourceState;
  detail?: string;
  count?: number;
  lastOkAt?: string;
  /** Failures in a row (the back-off grows with them). */
  failures: number;
  /** Backing off until then (ms). */
  nextTryAt?: number;
}

interface Asked {
  status: SourceStatus;
  answer?: SourceAnswer;
}

const isBlocked = (err: unknown) => err instanceof Error && err.name === 'SourceBlocked';
const isNoKey = (err: unknown) => err instanceof Error && err.name === 'SourceNoKey';

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('timeout'));
    }, ms);
    timer.unref?.();
  });
  return Promise.race([run(ctrl.signal), timeout]).finally(() => clearTimeout(timer));
}

const cleanTarget = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

export function createVigia(opts: VigiaOptions): Vigia {
  const home = opts.home ?? os.homedir();
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const sources = opts.sources;
  const notifiers = opts.notifiers ?? [];

  const data = readData(home);
  let settings: Settings = data.settings;
  let watches: Watch[] = data.watches;
  let alerts: Alert[] = data.alerts;
  let checking = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const runtime = new Map<string, SourceRuntime>(
    sources.map((s) => [s.id, { state: 'idle', failures: 0 }]),
  );
  /** watch id → source id → last automatic answer (minIntervalMs is kept per watch and source). */
  const lastAsk = new Map<string, Map<string, { at: number; answer: SourceAnswer }>>();

  const iso = (ms: number) => new Date(ms).toISOString();
  const rt = (id: string) => runtime.get(id)!;

  function emit(): void {
    for (const l of [...listeners]) {
      try {
        l();
      } catch (err) {
        console.warn(`${LOG_PREFIX} Error en un oyente:`, err);
      }
    }
  }

  function save(): void {
    writeData(home, { settings, watches, alerts });
  }

  function changed(): void {
    save();
    emit();
  }

  const enabled = (s: Source) => !settings.disabledSources.includes(s.id);

  function statusOf(s: Source): SourceStatus {
    const r = rt(s.id);
    const on = enabled(s);
    let ready = true;
    try {
      ready = s.ready();
    } catch {
      ready = false;
    }
    const status: SourceStatus = {
      id: s.id,
      name: s.name,
      state: !on ? 'off' : !ready ? 'nokey' : r.state,
      fragile: s.fragile,
      enabled: on,
      access: s.access,
    };
    const detail = !on ? TEXT.off : !ready ? TEXT.noKey : r.detail;
    if (detail) {
      status.detail = detail;
    }
    if (r.count !== undefined && on && ready) {
      status.count = r.count;
    }
    if (r.lastOkAt) {
      status.lastOkAt = r.lastOkAt;
    }
    return status;
  }

  function backoff(r: SourceRuntime, blocked: boolean, at: number): number {
    r.failures++;
    const base = blocked ? BLOCKED_BACKOFF_BASE_MS : ERROR_BACKOFF_BASE_MS;
    const cap = blocked ? BLOCKED_BACKOFF_CAP_MS : ERROR_BACKOFF_CAP_MS;
    const wait = Math.min(cap, base * 2 ** Math.min(r.failures - 1, 16));
    r.nextTryAt = at + wait;
    return r.nextTryAt;
  }

  /** Ask one source, keeping its state. Never rejects. */
  async function ask(s: Source, query: string): Promise<Asked> {
    const r = rt(s.id);
    const status = statusOf(s);
    if (status.state === 'off' || status.state === 'nokey') {
      return { status };
    }
    const t = now();
    if (r.nextTryAt !== undefined && r.nextTryAt > t) {
      const why = r.state === 'blocked' ? TEXT.pausedBlocked : TEXT.pausedError;
      r.detail = `En pausa hasta ${untilText(r.nextTryAt, t)} (${why})`;
      r.count = 0;
      return { status: statusOf(s) };
    }
    try {
      const answer = await withTimeout((signal) => s.search(query, signal), SOURCE_TIMEOUT_MS);
      const offers = Array.isArray(answer?.offers) ? answer.offers : [];
      const deals = Array.isArray(answer?.deals) ? answer.deals : [];
      Object.assign(r, { state: 'ok', failures: 0, nextTryAt: undefined, detail: undefined });
      r.count = offers.length || deals.length;
      r.lastOkAt = iso(now());
      return { status: statusOf(s), answer: { offers, deals } };
    } catch (err) {
      const at = now();
      r.count = 0;
      if (isNoKey(err)) {
        Object.assign(r, { state: 'nokey', detail: TEXT.noKey });
      } else if (isBlocked(err)) {
        const until = backoff(r, true, at);
        Object.assign(r, {
          state: 'blocked',
          detail: `${TEXT.blocked}; reintento después de ${untilText(until, at)}`,
        });
      } else {
        const until = backoff(r, false, at);
        Object.assign(r, {
          state: 'error',
          detail: `${TEXT.noAnswer}; reintento después de ${untilText(until, at)}`,
        });
        console.warn(`${LOG_PREFIX} ${s.name} falló:`, err instanceof Error ? err.message : err);
      }
      return { status: statusOf(s) };
    }
  }

  const relevantDeals = (deals: readonly CommunityDeal[], rule: RelevanceRule) => {
    const seen = new Set<string>();
    return deals
      .filter((d) => {
        if (d.expired || seen.has(d.id) || !isRelevant(d.title, rule)) {
          return false;
        }
        seen.add(d.id);
        return true;
      })
      .sort((a, b) => b.temperature - a.temperature);
  };

  /**
   * "Esta es la mejor" and the verdict of one product of a live search. When a saved search of the same words last
   * picked this very offer, its history and the price seen by hand count too.
   */
  function withVerdict(
    group: OfferGroup,
    query: string,
    nowMs: number,
    assistant?: AssistantFacts,
  ): OfferGroup {
    const pick = pickOffer(group.offers);
    if (!pick) return group;
    const key = (o: Offer) => `${o.sourceId}:${o.id}`;
    const watch = watches.find(
      (w) =>
        normalize(w.query) === normalize(query) &&
        [w.pick?.offer, w.best].some((o) => o !== undefined && key(o) === key(pick.offer)),
    );
    const verdict = judge({
      offer: pick.offer,
      peers: group.offers,
      history: watch?.history,
      reference: watch?.reference,
      assistant: assistant ?? assistantFacts(watch?.asistente, nowMs),
      nowMs,
    });
    return { ...group, pick, verdict };
  }

  async function search(query: string): Promise<SearchOutcome> {
    const q = query.trim();
    const settled = await Promise.allSettled(sources.map((s) => ask(s, q)));
    const asked = settled.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { status: statusOf(sources[i]!) },
    );
    const rule = { query: q };
    const offers = asked
      .flatMap((a) => a.answer?.offers ?? [])
      .filter((o) => isRelevant(o.title, rule));
    const deals = relevantDeals(
      asked.flatMap((a) => a.answer?.deals ?? []),
      rule,
    );
    // Sources switched off still give their own search page, to open by hand
    let links: StoreLink[] = [];
    for (const s of sources) {
      if (enabled(s)) continue;
      try {
        links.push({ name: s.name, url: s.searchUrl(q) });
      } catch {
        // no link for this one
      }
    }
    try {
      links = [...links, ...(opts.links?.(q) ?? [])];
    } catch {
      // keep the switched-off sources' links
    }
    emit();
    const t = now();
    return {
      query: q,
      groups: groupOffers(offers).map((g) => withVerdict(g, q, t)),
      deals,
      sources: asked.map((a) => a.status),
      links,
    };
  }

  function nextCheckMs(from: number): number {
    const minutes = settings.buenFin
      ? Math.min(BUEN_FIN_EVERY_MINUTES, settings.everyMinutes)
      : settings.everyMinutes;
    const jitter = 1 + (random() * 2 - 1) * SCHEDULE_JITTER;
    return from + Math.round(minutes * MIN * jitter);
  }

  async function notifyAll(alert: Alert, watch: Watch): Promise<void> {
    await Promise.allSettled(
      notifiers.map(async (n) => {
        try {
          await n.notify(alert, watch);
        } catch (err) {
          console.warn(
            `${LOG_PREFIX} El avisador ${n.id} falló:`,
            err instanceof Error ? err.message : err,
          );
        }
      }),
    );
  }

  /** One watch: ask the sources (respecting minIntervalMs), update best, history, note and alerts. */
  async function checkOne(id: string): Promise<void> {
    const before = watches.find((w) => w.id === id);
    if (!before) {
      return;
    }
    const startedAt = now();
    const cache = lastAsk.get(id) ?? new Map<string, { at: number; answer: SourceAnswer }>();
    lastAsk.set(id, cache);
    const answers = await Promise.allSettled(
      sources.map(async (s): Promise<SourceAnswer | undefined> => {
        const prevAsk = cache.get(s.id);
        const status = statusOf(s);
        if (status.state === 'off' || status.state === 'nokey') {
          return undefined;
        }
        if (prevAsk && s.minIntervalMs && startedAt - prevAsk.at < s.minIntervalMs) {
          return prevAsk.answer;
        }
        const got = await ask(s, before.query);
        if (got.answer) {
          cache.set(s.id, { at: startedAt, answer: got.answer });
        }
        return got.answer;
      }),
    );
    const prev = watches.find((w) => w.id === id);
    if (!prev || prev.query !== before.query) {
      return; // deleted or changed while it was checking
    }
    const got = answers.flatMap((a) => (a.status === 'fulfilled' && a.value ? [a.value] : []));
    const t = now();
    const at = iso(t);
    const next: Watch = { ...prev, checkedAt: at, nextCheckAt: iso(nextCheckMs(t)) };
    const offers = got
      .flatMap((a) => a.offers)
      .filter((o) => Number.isFinite(o.price) && o.price > 0 && isRelevant(o.title, prev))
      .sort((a, b) => a.price - b.price);
    const deals = relevantDeals(
      got.flatMap((a) => a.deals),
      prev,
    );
    const best: Offer | undefined = offers[0];
    const drafts = alertsFor(prev, { best, deals }, settings, t);

    if (got.length === 0) {
      next.error = TEXT.noStoreAnswered;
    } else if (!best) {
      next.error = TEXT.noStoreHasIt;
      delete next.best;
      next.others = [];
      next.reached = false;
      delete next.note;
      delete next.pick;
      delete next.verdict;
    } else {
      delete next.error;
      next.best = best;
      next.others = bestPerStore(offers)
        .filter((o) => o.store !== best.store)
        .slice(0, OTHERS_CAP);
      const storeOffer = offers.find((o) => o.official);
      const point: PricePoint = { at, price: best.price, sourceId: best.sourceId };
      if (storeOffer) point.storePrice = storeOffer.price;
      next.history = [...prev.history, point].slice(-HISTORY_CAP);
      const pick = pickOffer(offers);
      if (pick) {
        next.pick = pick;
        next.verdict = judge({
          offer: pick.offer,
          history: prev.history,
          peers: offers,
          reference: prev.reference,
          assistant: assistantFacts(prev.asistente, t),
          nowMs: t,
        });
      }
      if (next.lowest === undefined || best.price < next.lowest) {
        next.lowest = best.price;
        next.lowestAt = at;
      }
      const trend = describeTrend(next.history, t);
      // The verdict already warns about an invented "before" price; the note only says it when there is none
      const listNote = next.verdict ? undefined : suspiciousListPrice(best, prev.history).note;
      const note = [trend, listNote].filter(Boolean).join('. ');
      if (note) {
        next.note = note;
      } else {
        delete next.note;
      }
      next.reached = prev.target !== undefined && best.price <= prev.target;
    }
    if (got.length > 0) {
      const ids = deals.map((d) => d.id).filter((d) => !prev.seenDeals.includes(d));
      next.seenDeals = [...prev.seenDeals, ...ids].slice(-SEEN_DEALS_CAP);
    }

    watches = watches.map((w) => (w.id === id ? next : w));
    const fresh: Alert[] = drafts.map((d) => ({ ...d, id: randomUUID().slice(0, 8), seen: false }));
    if (fresh.length > 0) {
      alerts = [...fresh, ...alerts].slice(0, ALERTS_CAP);
    }
    changed();
    for (const a of fresh) {
      await notifyAll(a, next);
    }
  }

  /** Rounds never overlap: a second one waits for the first. */
  async function exclusive(fn: () => Promise<void>): Promise<void> {
    while (running) {
      await running.catch(() => undefined);
    }
    const p = fn();
    running = p;
    try {
      await p;
    } finally {
      if (running === p) {
        running = undefined;
      }
    }
  }

  async function round(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    checking = true;
    emit();
    try {
      for (const id of ids) {
        try {
          await checkOne(id);
        } catch (err) {
          console.warn(`${LOG_PREFIX} La revisión de una búsqueda falló:`, err);
        }
      }
    } finally {
      checking = false;
      emit();
    }
  }

  const vigia: Vigia = {
    state(): VigiaState {
      return structuredClone({
        watches,
        alerts,
        sources: sources.map(statusOf),
        settings,
        checking,
      });
    },

    search,

    saveWatch(input: WatchInput): Watch {
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query) {
        throw new Error(TEXT.emptyQuery);
      }
      const t = now();
      const target = cleanTarget(input.target);
      const reference = parseReference(input.reference);
      const existing = input.id ? watches.find((w) => w.id === input.id) : undefined;
      let saved: Watch;
      if (existing) {
        const sameQuery = existing.query === query;
        saved = {
          ...existing,
          query,
          mustHave: input.mustHave !== undefined ? wordList(input.mustHave) : existing.mustHave,
          exclude: input.exclude !== undefined ? wordList(input.exclude) : existing.exclude,
        };
        if (target !== undefined) {
          saved.target = target;
        } else {
          delete saved.target;
        }
        if (reference) {
          saved.reference = reference;
        } else {
          delete saved.reference;
        }
        if (!sameQuery) {
          // Another product: start over.
          Object.assign(saved, { others: [], history: [], seenDeals: [], reached: false });
          for (const k of [
            'best',
            'lowest',
            'lowestAt',
            'checkedAt',
            'note',
            'error',
            'pick',
            'verdict',
            'asistente',
          ] as const) {
            delete saved[k];
          }
          lastAsk.delete(saved.id);
        }
        if (!sameQuery || target !== existing.target) {
          // A new target alerts again when it is met; check soon.
          saved.reached = false;
          saved.nextCheckAt = iso(t);
        }
        if (sameQuery && saved.pick) {
          // The price seen by hand changes the verdict right away (the check that follows refreshes it all)
          const earlier = saved.history.filter((p) => p.at !== saved.checkedAt);
          saved.verdict = judge({
            offer: saved.pick.offer,
            history: earlier,
            peers: [...(saved.best ? [saved.best] : []), ...saved.others],
            reference: saved.reference,
            assistant: assistantFacts(saved.asistente, t),
            nowMs: t,
          });
        }
        watches = watches.map((w) => (w.id === saved.id ? saved : w));
      } else {
        saved = {
          id: randomUUID().slice(0, 8),
          query,
          mustHave: wordList(input.mustHave),
          exclude: wordList(input.exclude),
          createdAt: iso(t),
          others: [],
          history: [],
          reached: false,
          seenDeals: [],
          nextCheckAt: iso(t),
        };
        if (target !== undefined) {
          saved.target = target;
        }
        if (reference) {
          saved.reference = reference;
        }
        watches = [saved, ...watches];
      }
      changed();
      return structuredClone(saved);
    },

    setAssistant(id: string, answer: WatchAssistant): boolean {
      const prev = watches.find((w) => w.id === id);
      if (!prev) return false;
      const t = now();
      const saved: Watch = { ...prev, asistente: { ...prev.asistente, ...answer } };
      if (answer.precio && saved.pick) {
        // Its price counts right away (the last check's own point is not "before" this price)
        const earlier = saved.history.filter((p) => p.at !== saved.checkedAt);
        saved.verdict = judge({
          offer: saved.pick.offer,
          history: earlier,
          peers: [...(saved.best ? [saved.best] : []), ...saved.others],
          reference: saved.reference,
          assistant: assistantFacts(saved.asistente, t),
          nowMs: t,
        });
      }
      watches = watches.map((w) => (w.id === id ? saved : w));
      changed();
      return true;
    },

    rejudge(group: OfferGroup, query: string, assistant?: AssistantFacts): OfferGroup {
      return withVerdict(group, query, now(), assistant);
    },

    deleteWatch(id: string): void {
      if (!watches.some((w) => w.id === id)) {
        return;
      }
      watches = watches.filter((w) => w.id !== id);
      alerts = alerts.filter((a) => a.watchId !== id);
      lastAsk.delete(id);
      changed();
    },

    check(id?: string): Promise<void> {
      return exclusive(() =>
        round(id ? watches.filter((w) => w.id === id).map((w) => w.id) : watches.map((w) => w.id)),
      );
    },

    setSettings(changes: Partial<Settings>): void {
      const wasBuenFin = settings.buenFin;
      settings = parseSettings({ ...settings, ...changes });
      if (settings.buenFin && !wasBuenFin) {
        // Sale mode starts now: nobody waits the long interval.
        const soon = now() + BUEN_FIN_EVERY_MINUTES * MIN;
        watches = watches.map((w) =>
          !w.nextCheckAt || Date.parse(w.nextCheckAt) > soon
            ? { ...w, nextCheckAt: iso(nextCheckMs(now())) }
            : w,
        );
      }
      changed();
    },

    markAlertsSeen(): void {
      if (alerts.every((a) => a.seen)) {
        return;
      }
      alerts = alerts.map((a) => (a.seen ? a : { ...a, seen: true }));
      changed();
    },

    onChange(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async tick(): Promise<void> {
      if (running) {
        return; // a round is going on; the next tick looks again
      }
      const t = now();
      const due = watches
        .filter((w) => !w.nextCheckAt || Date.parse(w.nextCheckAt) <= t)
        .map((w) => w.id);
      if (due.length === 0) {
        return;
      }
      await exclusive(() => round(due));
    },

    start(): void {
      if (opts.timers === false || timer) {
        return;
      }
      timer = setInterval(() => {
        void vigia.tick();
      }, TICK_MS);
      timer.unref?.();
      setTimeout(() => void vigia.tick(), 0).unref?.();
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
  return vigia;
}
