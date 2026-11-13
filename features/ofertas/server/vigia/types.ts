/**
 * Contract of the price watch core (features/ofertas). Everything under this folder is plain Node: it never imports
 * the office (no Fastify, no page, no core/ protocol), so the same code runs inside the office and as a console
 * program on a small always-on machine.
 */

import type { BusquedaSimilares, InvestigacionPrecio } from '../asistente/trabajos.js';

/** One product at one price in one store. Prices are Mexican pesos. */
export interface Offer {
  sourceId: string;
  /** The store as a person reads it ("Elektra"). */
  store: string;
  /** Stable inside its source (SKU, product id or the product URL). */
  id: string;
  title: string;
  price: number;
  /** The "before" price as the store states it. Never trusted: the watch compares against what it saw itself. */
  listPrice?: number;
  brand?: string;
  seller?: string;
  /** Sold by the store itself or by a brand's official store (not a marketplace reseller). */
  official: boolean;
  /** The source does not say who sells it (Amazon's results page): neither "the store" nor "a reseller". */
  sellerUnknown?: boolean;
  freeShipping?: boolean;
  url: string;
  image?: string;
  /** Months without interest, only when the store itself says so for this product. */
  installments?: Installments;
}

/**
 * "Meses sin intereses" as the source states them. Months may be unknown ("MSI" with no number); the bank only when
 * the source names it. Never inferred.
 */
export interface Installments {
  months?: number;
  bank?: string;
}

/** A deal the community posted (votes as "temperature"). */
export interface CommunityDeal {
  id: string;
  title: string;
  price?: number;
  merchant?: string;
  temperature: number;
  url: string;
  /** ISO time. */
  publishedAt?: string;
  expired: boolean;
  /** Read from the deal's title ("12 MSI con <banco>"). */
  installments?: Installments;
}

export interface SourceAnswer {
  offers: Offer[];
  deals: CommunityDeal[];
}

/** The store refused (captcha, 403, bot wall). The watch backs off for a long time and never insists. */
export class SourceBlocked extends Error {
  constructor(message = 'blocked') {
    super(message);
    this.name = 'SourceBlocked';
  }
}

/** The source needs a key that is not set. */
export class SourceNoKey extends Error {
  constructor(message = 'no key') {
    super(message);
    this.name = 'SourceNoKey';
  }
}

/**
 * ok = answered; error = failed (network, changed page); blocked = the store refused; nokey = needs a key that is
 * not set; off = turned off in the settings; idle = not asked yet.
 */
export type SourceState = 'ok' | 'error' | 'blocked' | 'nokey' | 'off' | 'idle';

/** One place to search. Each one fails alone: search() may throw, the watch catches it per source. */
export interface Source {
  readonly id: string;
  readonly name: string;
  /** It reads a results page that is not an API: it can break or block at any time. */
  readonly fragile: boolean;
  /** How it reads, in plain Spanish, for the connections board ("JSON público de la tienda, sin llave"). */
  readonly access: string;
  /** Least time between two automatic checks of the same watch on this source (fragile ones go slower). */
  readonly minIntervalMs?: number;
  /** false = it needs a key that is not set: state "nokey", search() is never called. */
  ready(): boolean;
  /** Throws SourceBlocked when the store refuses, any other Error when it fails. Never retries by itself. */
  search(query: string, signal?: AbortSignal): Promise<SourceAnswer>;
  /** The page a person opens to see this search in the store. */
  searchUrl(query: string): string;
}

/** A store that is not read automatically: just the link to its own search. */
export interface StoreLink {
  name: string;
  url: string;
}

/** Keys of ~/.pixel-agents/ofertas.json → "llaves". */
export interface OfertasKeys {
  mercadolibre?: { clientId?: string; clientSecret?: string; accessToken?: string };
}

export interface SourceOptions {
  /** Tests pass a double; nothing here touches the network by itself. */
  fetch?: typeof fetch;
  /** Read again on every search: the keys are pasted by hand while it runs. */
  keys?: () => OfertasKeys;
}

// ── The watch ────────────────────────────────────────────────────────────────

export interface WatchInput {
  id?: string;
  query: string;
  target?: number;
  mustHave?: string[];
  exclude?: string[];
  /** Saved as is; an edit (with id) that does not send it removes it, like the target. */
  reference?: ManualReference;
}

export interface PricePoint {
  /** ISO time. */
  at: string;
  price: number;
  sourceId?: string;
  /** Cheapest offer sold by a store itself (not a reseller) in that check; absent when none was. */
  storePrice?: number;
}

/** A price the person saw by hand ("Lo he visto en $…" on a date): one more fact for the verdict, marked as theirs. */
export interface ManualReference {
  price: number;
  /** ISO date (the day it was seen). */
  at: string;
}

export type VerdictKind = 'good' | 'normal' | 'expensive' | 'unknown';

/** Is it a good price? A label and one line with the reason ("El más bajo en 34 días · el más barato de 5 tiendas"). */
export interface Verdict {
  kind: VerdictKind;
  reason: string;
}

/** The one option to buy of a product: the cheapest sold by the store itself, and why. */
export interface Pick {
  offer: Offer;
  reason: string;
}

/** One saved search and what the watch knows about it. */
export interface Watch {
  id: string;
  query: string;
  /** Alert at or under this price. */
  target?: number;
  /** Words the title must have (besides the query's own words). */
  mustHave: string[];
  /** Words that discard a title (cases, spare parts, "compatible con"…), added to the built-in list. */
  exclude: string[];
  createdAt: string;
  /** Cheapest relevant offer of the last check. */
  best?: Offer;
  /** The next cheapest offers of the last check, one per store. */
  others: Offer[];
  /** The lowest price the watch has seen, and when. */
  lowest?: number;
  lowestAt?: string;
  /** Best price of each check, oldest first, capped. */
  history: PricePoint[];
  checkedAt?: string;
  nextCheckAt?: string;
  /** A line in plain Spanish: "Bajó 18 % desde ayer", "El más bajo que ha visto la oficina". */
  note?: string;
  /** The best price is at or under the target. */
  reached: boolean;
  /** Why the last check gave nothing ("Ninguna tienda contestó"). */
  error?: string;
  /** Community deals already told about (ids), so each one alerts once. */
  seenDeals: string[];
  /** A price the person saw elsewhere, by hand. */
  reference?: ManualReference;
  /** "Esta es la mejor" of the last check (may differ from best: a reseller can be cheaper). */
  pick?: Pick;
  /** Is the pick a good price? Recomputed on every check and when the reference changes. */
  verdict?: Verdict;
  /** The last answers of the optional assistant (kept so seeing them again costs nothing); capped in age. */
  asistente?: WatchAssistant;
}

/** What the optional assistant (asistente/) found for a watched search, each answer with its own date. */
export interface WatchAssistant {
  precio?: InvestigacionPrecio;
  similares?: BusquedaSimilares;
}

/** The assistant's prices as one more (weaker) fact for the verdict. */
export interface AssistantFacts {
  typical?: number;
  low?: number;
}

export type AlertKind = 'target' | 'drop' | 'lowest' | 'community';

export interface Alert {
  id: string;
  watchId: string;
  /** ISO time. */
  at: string;
  kind: AlertKind;
  /** The whole message in Spanish, ready for a notification. */
  text: string;
  price?: number;
  store?: string;
  url?: string;
  seen: boolean;
}

export interface Settings {
  /** Minutes between checks of each watch; a random variation is added. */
  everyMinutes: number;
  /** Sale mode: checks more often. */
  buenFin: boolean;
  /** Alert when the best price falls this percent against the previous check. */
  dropPercent: number;
  /** Source ids turned off. */
  disabledSources: string[];
}

export interface SourceStatus {
  id: string;
  name: string;
  state: SourceState;
  fragile: boolean;
  enabled: boolean;
  access: string;
  /** In Spanish: "Bloqueó la consulta; reintento después de las 21:40". */
  detail?: string;
  /** Offers it gave in the search this status belongs to. */
  count?: number;
  /** ISO time of the last good answer. */
  lastOkAt?: string;
}

/** The same product across stores, cheapest offer first. */
export interface OfferGroup {
  key: string;
  title: string;
  offers: Offer[];
  pick?: Pick;
  verdict?: Verdict;
}

export interface SearchOutcome {
  query: string;
  /** Cheapest group first. */
  groups: OfferGroup[];
  deals: CommunityDeal[];
  /** How each source did in this search. */
  sources: SourceStatus[];
  links: StoreLink[];
}

export interface VigiaState {
  watches: Watch[];
  /** Newest first, capped. */
  alerts: Alert[];
  sources: SourceStatus[];
  settings: Settings;
  /** A round is running right now. */
  checking: boolean;
}

/** Where an alert goes (desktop notification, console, a phone push…). Add one without touching the watch. */
export interface Notifier {
  readonly id: string;
  /** May throw or reject: the watch logs it and goes on with the others. */
  notify(alert: Alert, watch: Watch): void | Promise<void>;
}

export interface VigiaOptions {
  /** The folder that holds .pixel-agents/ (default: the user's home). */
  home?: string;
  sources: Source[];
  /** Link-only stores for a query. */
  links?: (query: string) => StoreLink[];
  notifiers?: Notifier[];
  /** Milliseconds; tests pass a fake clock. */
  now?: () => number;
  /** 0..1, for the variation of the schedule; tests pass a fixed one. */
  random?: () => number;
  /** false in tests: they call tick() themselves. */
  timers?: boolean;
}

/** The watch: live searches, saved searches checked on a schedule, price history and alerts. */
export interface Vigia {
  state(): VigiaState;
  /** Search every enabled source now. Nothing is saved. Never rejects because of a source. */
  search(query: string): Promise<SearchOutcome>;
  /** Create (first check as soon as possible) or change a watch. */
  saveWatch(input: WatchInput): Watch;
  deleteWatch(id: string): void;
  /** Keeps the assistant's answer on a watch (and the verdict takes its price into account). false = no such watch. */
  setAssistant(id: string, answer: WatchAssistant): boolean;
  /** "La mejor" and the verdict of a live search's product again, with the assistant's prices as one more fact. */
  rejudge(group: OfferGroup, query: string, assistant?: AssistantFacts): OfferGroup;
  /** Check one watch now, or all of them. Still skips a source that is backing off after a block. */
  check(id?: string): Promise<void>;
  setSettings(changes: Partial<Settings>): void;
  markAlertsSeen(): void;
  /** Called after every change of state(). Returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Check the watches whose time is up (the timer calls it; tests too). */
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}
