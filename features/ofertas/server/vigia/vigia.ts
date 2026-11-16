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
  NAVEGADOR_MIN_INTERVAL_MS,
  OTHERS_CAP,
  SCHEDULE_JITTER,
  SEEN_DEALS_CAP,
  SOURCE_TIMEOUT_MS,
  STORE_CLOSEST_MAX,
  TEXT,
  TICK_MS,
} from './constants.js';
import { bestPerStore, groupOffers } from './grouping.js';
import type { RelevanceRule } from './relevance.js';
import { isRelevant, normalize } from './relevance.js';
import { alertsFor, describeTrend, suspiciousListPrice, untilText } from './rules.js';
import {
  cleanGroup,
  parseReference,
  parseSettings,
  readData,
  sameGroupName,
  wordList,
  writeData,
} from './storage.js';
import type {
  Alert,
  AssistantFacts,
  BrowserTurn,
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
  StoreCheck,
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
  /** It was read (or tried) with the browser. */
  viaBrowser?: boolean;
  /** The office cut the read (the browser closed): no answer, and no result to keep. */
  interrupted?: boolean;
}

/** One source in a check of a watch: its status, and its answer with the time it was given. */
interface SourceAsked extends Asked {
  source: Source;
  /** ms of the answer. */
  at?: number;
  /** An earlier answer, reused because the source is asked at most every minIntervalMs. */
  reused?: boolean;
}

/** The last automatic answer of a source for one watch, and how it was read. */
interface LastAnswer {
  at: number;
  answer: SourceAnswer;
  viaBrowser?: boolean;
}

const isBlocked = (err: unknown) => err instanceof Error && err.name === 'SourceBlocked';
const isNoKey = (err: unknown) => err instanceof Error && err.name === 'SourceNoKey';
/** Its message is already the one the person reads ("No encontré Edge ni Chrome en esta máquina"). */
const isReadError = (err: unknown) => err instanceof Error && err.name === 'SourceReadError';
const isInterrupted = (err: unknown) => err instanceof Error && err.name === 'SourceInterrupted';

/**
 * This source is read with the browser now: it can be, the switch is on and the person marked it. The one rule for
 * both asking (robots stores) and reading.
 */
export function readsWithBrowser(s: Source, settings: Settings): boolean {
  return (
    s.browser !== undefined && settings.navegador.on && settings.navegador.sources.includes(s.id)
  );
}

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
  /**
   * What the watch remembers of each source, apart for each way of reading it (plain request or browser): a pause
   * earned one way is never cleared by switching to the other and back.
   */
  const runtime = new Map<string, SourceRuntime>();
  /** stop() was called: a check still running does not save what it got (the browser closing is not an answer). */
  let stopped = false;
  /** watch id → source id → last automatic answer (minIntervalMs is kept per watch and source). */
  const lastAsk = new Map<string, Map<string, LastAnswer>>();

  const iso = (ms: number) => new Date(ms).toISOString();
  function rt(s: Source, browser: boolean = viaBrowser(s)): SourceRuntime {
    const key = browser ? `${s.id}|navegador` : s.id;
    let r = runtime.get(key);
    if (!r) {
      r = { state: 'idle', failures: 0 };
      runtime.set(key, r);
    }
    return r;
  }

  /** Every browser queue of the sources: held for a whole batch so one browser serves it. */
  function holdBrowsers(): () => void {
    const queues = [...new Set(sources.flatMap((s) => (s.browser ? [s.browser] : [])))];
    const releases = queues.map((q) => q.hold());
    return () => {
      for (const release of releases) release();
    };
  }

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

  /**
   * A group that already exists but for accents or capitals ("bocinas" with "Bocinas" there) is that one, with the
   * name it already has: never two groups that look the same. `exceptId` = the watch being changed.
   */
  function groupAsExisting(group: string | undefined, exceptId?: string): string | undefined {
    if (!group) return group;
    const known = [
      ...watches.filter((w) => w.id !== exceptId).map((w) => w.group),
      ...settings.groupOrder,
    ].find((g): g is string => !!g && sameGroupName(g, group));
    return known ?? group;
  }

  const viaBrowser = (s: Source) => readsWithBrowser(s, settings);
  /**
   * Asked at all: not turned off, and not a store that only gets its link (linkOnly) unless the person turned it on
   * with the browser.
   */
  const enabled = (s: Source) =>
    (!s.linkOnly || viaBrowser(s)) && !settings.disabledSources.includes(s.id);
  /** Least time between two automatic answers of this source for one watch (longer when read with the browser). */
  const minIntervalOf = (s: Source): number | undefined =>
    viaBrowser(s) ? Math.max(s.minIntervalMs ?? 0, NAVEGADOR_MIN_INTERVAL_MS) : s.minIntervalMs;

  function statusOf(s: Source): SourceStatus {
    const r = rt(s);
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
    if (s.linkOnly) {
      status.linkOnly = true;
    }
    if (s.browser) {
      status.browser = true;
      if (viaBrowser(s)) status.viaBrowser = true;
    }
    const offDetail = s.linkOnly && !viaBrowser(s) ? s.linkOnly : TEXT.off;
    const detail = !on ? offDetail : !ready ? TEXT.noKey : r.detail;
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

  /** The source is backing off: its status says until when (nothing is asked). */
  function pausedStatus(s: Source, r: SourceRuntime, t: number): SourceStatus | undefined {
    if (r.nextTryAt === undefined || r.nextTryAt <= t) return undefined;
    const why = r.state === 'blocked' ? TEXT.pausedBlocked : TEXT.pausedError;
    r.detail = `En pausa hasta ${untilText(r.nextTryAt, t)} (${why})`;
    r.count = 0;
    return statusOf(s);
  }

  /**
   * Ask one source, keeping its state. Never rejects. Read with the browser, it first waits for its turn in the
   * browser's queue: that wait does not count against the time limit, and after it everything is looked at again
   * (it may have been switched off, or have blocked another search while this one waited).
   */
  async function ask(s: Source, query: string): Promise<Asked> {
    const status = statusOf(s);
    if (status.state === 'off' || status.state === 'nokey') {
      return { status };
    }
    let browser = viaBrowser(s);
    // The state of the way it is read: an answer that comes after a switch goes to the way it was read
    let r = rt(s, browser);
    const paused = pausedStatus(s, r, now());
    if (paused) return { status: paused, viaBrowser: browser };
    let turn: BrowserTurn | undefined;
    try {
      if (browser && s.browser) {
        turn = await s.browser.turn();
        const again = statusOf(s);
        if (again.state === 'off' || again.state === 'nokey') return { status: again };
        browser = viaBrowser(s);
        r = rt(s, browser);
        const pausedNow = pausedStatus(s, r, now());
        if (pausedNow) return { status: pausedNow, viaBrowser: browser };
        if (!browser) {
          turn.release();
          turn = undefined;
        }
      }
      const how = { browser };
      const answer = await withTimeout(
        (signal) => s.search(query, signal, how),
        turn?.timeoutMs ?? SOURCE_TIMEOUT_MS,
      );
      const offers = Array.isArray(answer?.offers) ? answer.offers : [];
      const deals = Array.isArray(answer?.deals) ? answer.deals : [];
      Object.assign(r, { state: 'ok', failures: 0, nextTryAt: undefined, detail: undefined });
      r.count = offers.length || deals.length;
      r.lastOkAt = iso(now());
      return { status: statusOf(s), answer: { offers, deals }, viaBrowser: browser };
    } catch (err) {
      // Cut by the office (closing, the browser's life limit): not the store's fault, nothing changes
      if (isInterrupted(err))
        return { status: statusOf(s), viaBrowser: browser, interrupted: true };
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
        const said = isReadError(err) ? (err as Error).message : TEXT.noAnswer;
        Object.assign(r, {
          state: 'error',
          detail: `${said}; reintento después de ${untilText(until, at)}`,
        });
        console.warn(`${LOG_PREFIX} ${s.name} falló:`, err instanceof Error ? err.message : err);
      }
      return { status: statusOf(s), viaBrowser: browser };
    } finally {
      turn?.release();
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
    const release = holdBrowsers();
    let settled: PromiseSettledResult<Asked>[];
    try {
      settled = await Promise.allSettled(sources.map((s) => ask(s, q)));
    } finally {
      release();
    }
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

  /**
   * "Dónde buscó": what each store said in this check, in the order of the sources, then the stores that are only
   * linked. Nothing here asks a store again.
   */
  function storeChecks(asked: readonly SourceAsked[], watch: Watch, t: number): StoreCheck[] {
    const out: StoreCheck[] = asked.map((a) => {
      const s = a.source;
      const check: StoreCheck = { id: s.id, name: s.name, result: 'error' };
      try {
        check.url = s.searchUrl(watch.query);
      } catch {
        // no link for this one
      }
      if (a.viaBrowser) check.viaBrowser = true;
      if (!a.answer) {
        const state = a.status.state;
        // A robots store the person turned on with the browser is a store like the others (it can block)
        check.result =
          s.linkOnly && !a.status.enabled
            ? 'link'
            : state === 'off'
              ? 'off'
              : state === 'nokey'
                ? 'nokey'
                : state === 'blocked'
                  ? 'blocked'
                  : 'error';
        if (a.status.detail) check.detail = a.status.detail;
        check.at = iso(t);
        return check;
      }
      check.at = iso(a.at ?? t);
      if (a.reused) check.reused = true;
      const offers = a.answer.offers.filter((o) => Number.isFinite(o.price) && o.price > 0);
      const relevant = offers.filter((o) => isRelevant(o.title, watch));
      const deals = a.answer.deals.filter((d) => !d.expired);
      const relevantDeals = deals.filter((d) => isRelevant(d.title, watch));
      const returned = offers.length + deals.length;
      check.returned = returned;
      check.discarded = returned - relevant.length - relevantDeals.length;
      const prices = [
        ...relevant.map((o) => o.price),
        ...relevantDeals.flatMap((d) => (d.price !== undefined && d.price > 0 ? [d.price] : [])),
      ];
      if (relevant.length + relevantDeals.length > 0) {
        check.result = 'found';
        if (prices.length > 0) check.price = Math.min(...prices);
      } else {
        check.result = 'none';
        const first = offers[0]?.title ?? deals[0]?.title;
        if (first) check.closest = first.slice(0, STORE_CLOSEST_MAX);
      }
      return check;
    });
    let links: StoreLink[] = [];
    try {
      links = opts.links?.(watch.query) ?? [];
    } catch {
      // no extra links
    }
    for (const l of links) {
      if (out.some((c) => c.name === l.name)) continue;
      out.push({
        id: `link:${l.name}`,
        name: l.name,
        result: 'link',
        detail: TEXT.linkOnly,
        url: l.url,
      });
    }
    return out;
  }

  /** One watch: ask the sources (respecting minIntervalMs), update best, history, note and alerts. */
  async function checkOne(id: string): Promise<void> {
    const before = watches.find((w) => w.id === id);
    if (!before) {
      return;
    }
    const startedAt = now();
    const cache = lastAsk.get(id) ?? new Map<string, LastAnswer>();
    lastAsk.set(id, cache);
    const answers = await Promise.allSettled(
      sources.map(async (s): Promise<SourceAsked> => {
        const prevAsk = cache.get(s.id);
        const status = statusOf(s);
        if (status.state === 'off' || status.state === 'nokey') {
          return { source: s, status };
        }
        const minInterval = minIntervalOf(s);
        if (prevAsk && minInterval && startedAt - prevAsk.at < minInterval) {
          return {
            source: s,
            status,
            answer: prevAsk.answer,
            at: prevAsk.at,
            reused: true,
            viaBrowser: prevAsk.viaBrowser,
          };
        }
        const got = await ask(s, before.query);
        if (got.answer) {
          cache.set(s.id, { at: startedAt, answer: got.answer, viaBrowser: got.viaBrowser });
        }
        return {
          source: s,
          status: got.status,
          answer: got.answer,
          at: now(),
          viaBrowser: got.viaBrowser,
          interrupted: got.interrupted,
        };
      }),
    );
    // The office is closing: what this check got is not saved (an interrupted store is not a result)
    if (stopped) return;
    const prev = watches.find((w) => w.id === id);
    if (!prev || prev.query !== before.query) {
      return; // deleted or changed while it was checking
    }
    const asked = answers.map((a, i): SourceAsked =>
      a.status === 'fulfilled' ? a.value : { source: sources[i]!, status: statusOf(sources[i]!) },
    );
    const got = asked.flatMap((a) => (a.answer ? [a.answer] : []));
    // Nothing but interruptions: the watch stays as it was and due (the next tick checks it again)
    if (got.length === 0 && asked.some((a) => a.interrupted)) return;
    const t = now();
    const at = iso(t);
    const next: Watch = { ...prev, checkedAt: at, nextCheckAt: iso(nextCheckMs(t)) };
    // An interrupted store keeps what it said last time (or says nothing): the cut is not its answer
    next.stores = storeChecks(asked, prev, t).flatMap((c) => {
      if (!asked.some((a) => a.interrupted && a.source.id === c.id)) return [c];
      const last = prev.stores?.find((p) => p.id === c.id);
      return last ? [last] : [];
    });
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
    // One browser for the whole round, not one per watch
    const release = holdBrowsers();
    try {
      for (const id of ids) {
        try {
          await checkOne(id);
        } catch (err) {
          console.warn(`${LOG_PREFIX} La revisión de una búsqueda falló:`, err);
        }
      }
    } finally {
      release();
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
        if (input.group !== undefined) {
          const group = groupAsExisting(cleanGroup(input.group), saved.id);
          if (group) saved.group = group;
          else delete saved.group;
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
            'stores',
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
        const group = groupAsExisting(cleanGroup(input.group));
        if (group) {
          saved.group = group;
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

    setGroup(id: string, group: string): boolean {
      const prev = watches.find((w) => w.id === id);
      if (!prev) return false;
      const clean = groupAsExisting(cleanGroup(group), id);
      if (clean === prev.group) return true;
      const saved: Watch = { ...prev };
      if (clean) saved.group = clean;
      else delete saved.group;
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
      stopped = false;
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
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
  return vigia;
}
