/**
 * <home>/.pixel-agents/ofertas.json. Read field by field (never throws, extra fields are ignored); an unreadable file
 * is kept aside as ofertas.json.roto and the watch starts clean. Written atomically (tmp + rename). "llaves",
 * "avisadores" and "asistente" are pasted by hand (or set apart): every write keeps them exactly as they are on disk.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseInvestigacion, parseSimilares } from '../asistente/trabajos.js';
import {
  ALERTS_CAP,
  ASSISTANT_KEEP_DAYS,
  BROKEN_FILE_SUFFIX,
  DAY_MS,
  DEFAULT_DISABLED_SOURCES,
  DEFAULT_DROP_PERCENT,
  DEFAULT_EVERY_MINUTES,
  DROP_PERCENT_MAX,
  DROP_PERCENT_MIN,
  EVERY_MINUTES_MAX,
  EVERY_MINUTES_MIN,
  HISTORY_CAP,
  LOG_PREFIX,
  NTFY_TOPIC_PATTERN,
  OFERTAS_DIR,
  OFERTAS_FILE,
  OFERTAS_FILE_VERSION,
  OTHERS_CAP,
  SEEN_DEALS_CAP,
  WORD_LIST_CAP,
} from './constants.js';
import type {
  Alert,
  AlertKind,
  Installments,
  ManualReference,
  OfertasKeys,
  Offer,
  Pick,
  PricePoint,
  Settings,
  Verdict,
  VerdictKind,
  Watch,
  WatchAssistant,
} from './types.js';

/** What the watch keeps (the file also holds "llaves" and "avisadores", read on their own). */
export interface OfertasData {
  settings: Settings;
  watches: Watch[];
  alerts: Alert[];
}

/** Where alerts go besides the console: "avisadores" in the file. */
export interface NotifierConfig {
  ntfy?: { topic?: string; server?: string };
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const iso = (v: unknown): string | undefined => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : undefined;
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function ofertasPath(home: string = os.homedir()): string {
  return path.join(home, OFERTAS_DIR, OFERTAS_FILE);
}

export function defaultSettings(): Settings {
  return {
    everyMinutes: DEFAULT_EVERY_MINUTES,
    buenFin: false,
    dropPercent: DEFAULT_DROP_PERCENT,
    disabledSources: [...DEFAULT_DISABLED_SOURCES],
  };
}

export function wordList(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: string[] = [];
  for (const w of v) {
    const t = typeof w === 'string' ? w.trim() : '';
    if (t && !out.includes(t)) {
      out.push(t);
    }
  }
  return out.slice(0, WORD_LIST_CAP);
}

/** Settings with every number inside its range. */
export function parseSettings(raw: unknown): Settings {
  const r = rec(raw);
  const d = defaultSettings();
  const every = num(r.everyMinutes);
  const drop = num(r.dropPercent);
  return {
    everyMinutes:
      every === undefined
        ? d.everyMinutes
        : Math.round(clamp(every, EVERY_MINUTES_MIN, EVERY_MINUTES_MAX)),
    buenFin: r.buenFin === true,
    dropPercent:
      drop === undefined
        ? d.dropPercent
        : Math.round(clamp(drop, DROP_PERCENT_MIN, DROP_PERCENT_MAX)),
    // A file that never chose keeps the factory choice (the opt-in sources stay off).
    disabledSources: Array.isArray(r.disabledSources)
      ? wordList(r.disabledSources)
      : [...DEFAULT_DISABLED_SOURCES],
  };
}

export function parseOffer(raw: unknown): Offer | undefined {
  const r = rec(raw);
  const sourceId = str(r.sourceId);
  const store = str(r.store);
  const id = str(r.id);
  const title = str(r.title);
  const url = str(r.url);
  const price = num(r.price);
  if (!sourceId || !store || !id || !title || !url || price === undefined) {
    return undefined;
  }
  const offer: Offer = { sourceId, store, id, title, price, url, official: r.official === true };
  const listPrice = num(r.listPrice);
  if (listPrice !== undefined) {
    offer.listPrice = listPrice;
  }
  for (const k of ['brand', 'seller', 'image'] as const) {
    const v = str(r[k]);
    if (v) {
      offer[k] = v;
    }
  }
  if (typeof r.freeShipping === 'boolean') {
    offer.freeShipping = r.freeShipping;
  }
  if (r.sellerUnknown === true && !offer.official) {
    offer.sellerUnknown = true;
  }
  const installments = parseInstallments(r.installments);
  if (installments) {
    offer.installments = installments;
  }
  return offer;
}

export function parseInstallments(raw: unknown): Installments | undefined {
  // {} is valid: "MSI" without a number of months
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = rec(raw);
  const months = num(r.months);
  const bank = str(r.bank);
  const out: Installments = {};
  if (months !== undefined && Number.isInteger(months) && months > 1) out.months = months;
  if (bank) out.bank = bank;
  return out;
}

/** A price seen by hand: positive, with a valid date. */
export function parseReference(raw: unknown): ManualReference | undefined {
  const r = rec(raw);
  const price = num(r.price);
  const at = iso(r.at);
  return price !== undefined && price > 0 && at ? { price, at } : undefined;
}

const VERDICT_KINDS: readonly VerdictKind[] = ['good', 'normal', 'expensive', 'unknown'];

function parseVerdict(raw: unknown): Verdict | undefined {
  const r = rec(raw);
  const kind = r.kind as VerdictKind;
  const reason = str(r.reason);
  return VERDICT_KINDS.includes(kind) && reason ? { kind, reason } : undefined;
}

function parsePick(raw: unknown): Pick | undefined {
  const r = rec(raw);
  const offer = parseOffer(r.offer);
  const reason = str(r.reason);
  return offer && reason ? { offer, reason } : undefined;
}

function parsePoint(raw: unknown): PricePoint | undefined {
  const r = rec(raw);
  const at = iso(r.at);
  const price = num(r.price);
  if (!at || price === undefined) {
    return undefined;
  }
  const point: PricePoint = { at, price };
  const sourceId = str(r.sourceId);
  if (sourceId) {
    point.sourceId = sourceId;
  }
  const storePrice = num(r.storePrice);
  if (storePrice !== undefined && storePrice > 0) {
    point.storePrice = storePrice;
  }
  return point;
}

const defined = <T>(v: T | undefined): v is T => v !== undefined;

/**
 * The assistant's last answers of a watch, validated again like a fresh answer (the file is editable) and with their
 * own date kept. Answers older than ASSISTANT_KEEP_DAYS are dropped.
 */
export function parseWatchAssistant(
  raw: unknown,
  nowMs: number = Date.now(),
): WatchAssistant | undefined {
  const r = rec(raw);
  const when = (v: unknown): Date | undefined => {
    const at = iso(rec(v).revisado);
    const ms = at ? Date.parse(at) : NaN;
    return ms <= nowMs + DAY_MS && nowMs - ms <= ASSISTANT_KEEP_DAYS * DAY_MS
      ? new Date(ms)
      : undefined;
  };
  const out: WatchAssistant = {};
  const precioAt = when(r.precio);
  const precio = precioAt ? parseInvestigacion(r.precio, precioAt) : undefined;
  if (precio) out.precio = precio;
  const similaresAt = when(r.similares);
  // No product to compare with here: the names were already checked when the answer came
  const similares = similaresAt ? parseSimilares(r.similares, '', similaresAt) : undefined;
  if (similares) out.similares = similares;
  return out.precio || out.similares ? out : undefined;
}

export function parseWatch(raw: unknown): Watch | undefined {
  const r = rec(raw);
  const id = str(r.id);
  const query = str(r.query);
  if (!id || !query) {
    return undefined;
  }
  const w: Watch = {
    id,
    query: query.trim(),
    mustHave: wordList(r.mustHave),
    exclude: wordList(r.exclude),
    createdAt: iso(r.createdAt) ?? new Date(0).toISOString(),
    others: (Array.isArray(r.others) ? r.others.map(parseOffer).filter(defined) : []).slice(
      0,
      OTHERS_CAP,
    ),
    history: (Array.isArray(r.history) ? r.history.map(parsePoint).filter(defined) : []).slice(
      -HISTORY_CAP,
    ),
    reached: r.reached === true,
    seenDeals: idList(r.seenDeals),
  };
  const target = num(r.target);
  if (target !== undefined && target > 0) {
    w.target = target;
  }
  const best = parseOffer(r.best);
  if (best) {
    w.best = best;
  }
  const reference = parseReference(r.reference);
  if (reference) {
    w.reference = reference;
  }
  const pick = parsePick(r.pick);
  if (pick) {
    w.pick = pick;
  }
  const verdict = parseVerdict(r.verdict);
  if (verdict) {
    w.verdict = verdict;
  }
  const asistente = parseWatchAssistant(r.asistente);
  if (asistente) {
    w.asistente = asistente;
  }
  const lowest = num(r.lowest);
  if (lowest !== undefined) {
    w.lowest = lowest;
  }
  for (const k of ['lowestAt', 'checkedAt', 'nextCheckAt'] as const) {
    const v = iso(r[k]);
    if (v) {
      w[k] = v;
    }
  }
  for (const k of ['note', 'error'] as const) {
    const v = str(r[k]);
    if (v) {
      w[k] = v;
    }
  }
  return w;
}

/** Ids of deals already told about (no word cap, its own cap). */
function idList(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(-SEEN_DEALS_CAP);
}

const KINDS: readonly AlertKind[] = ['target', 'drop', 'lowest', 'community'];

export function parseAlert(raw: unknown): Alert | undefined {
  const r = rec(raw);
  const id = str(r.id);
  const watchId = str(r.watchId);
  const at = iso(r.at);
  const text = str(r.text);
  const kind = r.kind as AlertKind;
  if (!id || !watchId || !at || !text || !KINDS.includes(kind)) {
    return undefined;
  }
  const a: Alert = { id, watchId, at, kind, text, seen: r.seen === true };
  const price = num(r.price);
  if (price !== undefined) {
    a.price = price;
  }
  for (const k of ['store', 'url'] as const) {
    const v = str(r[k]);
    if (v) {
      a[k] = v;
    }
  }
  return a;
}

export function parseData(raw: unknown): OfertasData {
  const r = rec(raw);
  const watches: Watch[] = [];
  for (const w of Array.isArray(r.busquedas) ? r.busquedas.map(parseWatch).filter(defined) : []) {
    if (!watches.some((x) => x.id === w.id)) {
      watches.push(w);
    }
  }
  return {
    settings: parseSettings(r.ajustes),
    watches,
    alerts: (Array.isArray(r.avisos) ? r.avisos.map(parseAlert).filter(defined) : []).slice(
      0,
      ALERTS_CAP,
    ),
  };
}

type RawRead = { ok: true; raw: unknown } | { ok: false; missing: boolean };

function readRaw(file: string): RawRead {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return { ok: false, missing: true };
  }
  try {
    return { ok: true, raw: JSON.parse(text.replace(/^﻿/, '')) as unknown };
  } catch {
    return { ok: false, missing: false };
  }
}

/** The whole file; a broken one is kept aside as .roto and the watch starts clean. Never throws. */
export function readData(home: string = os.homedir()): OfertasData {
  const file = ofertasPath(home);
  const got = readRaw(file);
  if (got.ok) {
    return parseData(got.raw);
  }
  if (!got.missing) {
    try {
      fs.renameSync(file, file + BROKEN_FILE_SUFFIX);
      console.warn(
        `${LOG_PREFIX} ${OFERTAS_FILE} no se pudo leer; quedó como ${OFERTAS_FILE}${BROKEN_FILE_SUFFIX}`,
      );
    } catch (err) {
      console.warn(`${LOG_PREFIX} ${OFERTAS_FILE} no se pudo leer ni respaldar:`, err);
    }
  }
  return parseData({});
}

/** Atomic write, private to the user, keeping "llaves" and "avisadores" from disk. Failures are logged. */
export function writeData(home: string, data: OfertasData): void {
  const file = ofertasPath(home);
  try {
    const onDisk = readRaw(file);
    const disk = onDisk.ok ? rec(onDisk.raw) : {};
    const out: Rec = {
      version: OFERTAS_FILE_VERSION,
      ajustes: data.settings,
      busquedas: data.watches,
      avisos: data.alerts,
    };
    if (disk.llaves !== undefined) {
      out.llaves = disk.llaves;
    }
    if (disk.avisadores !== undefined) {
      out.avisadores = disk.avisadores;
    }
    if (disk.asistente !== undefined) {
      out.asistente = disk.asistente;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`${LOG_PREFIX} No se pudo guardar ${OFERTAS_FILE}:`, err);
  }
}

/** "llaves": only strings are passed on. Read on every search: they are pasted by hand while it runs. */
export function readKeys(home: string = os.homedir()): OfertasKeys {
  const got = readRaw(ofertasPath(home));
  if (!got.ok) {
    return {};
  }
  const ml = rec(rec(rec(got.raw).llaves).mercadolibre);
  const mercadolibre: NonNullable<OfertasKeys['mercadolibre']> = {};
  for (const k of ['clientId', 'clientSecret', 'accessToken'] as const) {
    const v = str(ml[k]);
    if (v) {
      mercadolibre[k] = v.trim();
    }
  }
  return Object.keys(mercadolibre).length > 0 ? { mercadolibre } : {};
}

/** "avisadores": { ntfy: { tema, servidor } }. A topic that is not a plain name is ignored. */
export function readNotifierConfig(home: string = os.homedir()): NotifierConfig {
  const got = readRaw(ofertasPath(home));
  if (!got.ok) {
    return {};
  }
  const n = rec(rec(rec(got.raw).avisadores).ntfy);
  const topic = str(n.tema)?.trim();
  const server = str(n.servidor)?.trim();
  if (!topic || !NTFY_TOPIC_PATTERN.test(topic)) {
    return {};
  }
  const ntfy: NonNullable<NotifierConfig['ntfy']> = { topic };
  if (server && /^https?:\/\//.test(server)) {
    ntfy.server = server;
  }
  return { ntfy };
}
