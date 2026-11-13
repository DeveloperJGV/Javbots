import type {
  OfertasAsistenteFallo,
  OfertasAsistenteFuente,
  OfertasAsistenteInvestigacion,
  OfertasInstallments,
  OfertasOffer,
  OfertasPoint,
  OfertasReference,
  OfertasSource,
  OfertasVerdictKind,
  OfertasWatch,
} from '../../../core/src/messages.js';
import {
  AMAZON_ASIN_RE,
  KEEPA_PRODUCT_URL,
  PROFECO_BUEN_FIN_UNTIL,
  PROFECO_BUEN_FIN_URL,
  PROFECO_LINK_NAME,
  PROFECO_QQP_URL,
  SELLER_RESELLER_TITLE,
  SELLER_STORE_TITLE,
  SELLER_UNKNOWN_TITLE,
} from './constants.js';

const pad = (n: number) => String(n).padStart(2, '0');

/** Pesos the way a store writes them: "$1,499", or "$1,499.50" when there are cents. */
export function money(value: number): string {
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}${rest ? `.${pad(rest)}` : ''}`;
}

/** "21:40", always digital, local time. */
export function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "hoy", "ayer" or "12 nov" (local day). */
export function shortDate(iso: string, nowMs: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const now = new Date(nowMs);
  if (day(d) === day(now)) return 'hoy';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (day(d) === day(yesterday)) return 'ayer';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "hace un momento", "hace 12 min", "hace 3 h", "hace 2 días". */
export function ago(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.floor(Math.max(0, nowMs - t) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** "Revisó hace 12 min · próxima 21:40" (each half only when the server sent it). */
export function checkedText(watch: OfertasWatch, nowMs: number = Date.now()): string {
  const parts: string[] = [];
  parts.push(watch.checkedAt ? `Revisó ${ago(watch.checkedAt, nowMs)}` : 'Aún no revisa');
  if (watch.nextCheckAt) parts.push(`próxima ${clock(watch.nextCheckAt)}`);
  return parts.join(' · ');
}

/** The real discount against the "before" price the store states, or undefined if there is none. */
export function realDiscount(price: number, listPrice: number | undefined): number | undefined {
  if (!listPrice || listPrice <= price || price <= 0) return undefined;
  return Math.round((1 - price / listPrice) * 100);
}

/** "A", "A y B", "A, B y C". */
function names(list: string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

/**
 * One sentence about the sources that failed in a search ("Walmart no contestó; lo demás sí"), or undefined when
 * every turned-on source answered. Sources turned off or never asked do not count.
 */
export function sourcesSentence(sources: OfertasSource[]): string | undefined {
  const pick = (state: OfertasSource['state']) =>
    sources.filter((s) => s.state === state).map((s) => s.name);
  const error = pick('error');
  const blocked = pick('blocked');
  const nokey = pick('nokey');
  const parts: string[] = [];
  if (error.length)
    parts.push(`${names(error)} ${error.length > 1 ? 'no contestaron' : 'no contestó'}`);
  if (blocked.length)
    parts.push(`${names(blocked)} ${blocked.length > 1 ? 'bloquearon' : 'bloqueó'} la consulta`);
  if (nokey.length)
    parts.push(`${nokey.length > 1 ? 'Faltan las llaves' : 'Falta la llave'} de ${names(nokey)}`);
  if (!parts.length) return undefined;
  if (sources.some((s) => s.state === 'ok')) parts.push('lo demás sí');
  return parts.join('; ');
}

/** Whether every turned-on source failed (nothing to show but the problem). */
export function allSourcesFailed(sources: OfertasSource[]): boolean {
  const asked = sources.filter((s) => s.state !== 'off' && s.state !== 'idle');
  return asked.length > 0 && asked.every((s) => s.state !== 'ok');
}

export type ChipTone = 'ok' | 'bad' | 'muted';

/** What a source's chip says after a search: "✓ 12", "no contestó", "bloqueó", "falta llave", "apagada". */
export function sourceChip(source: OfertasSource): { text: string; tone: ChipTone } {
  switch (source.state) {
    case 'ok':
      return { text: `✓ ${source.count ?? 0}`, tone: 'ok' };
    case 'error':
      return { text: 'no contestó', tone: 'bad' };
    case 'blocked':
      return { text: 'bloqueó', tone: 'bad' };
    case 'nokey':
      return { text: 'falta llave', tone: 'bad' };
    case 'off':
      return { text: 'apagada', tone: 'muted' };
    default:
      return { text: 'sin consultar', tone: 'muted' };
  }
}

/** What a source's state means in the settings tab. */
export const SOURCE_STATE_LABEL: Record<OfertasSource['state'], string> = {
  ok: 'funciona',
  error: 'no contestó la última vez',
  blocked: 'bloqueó la última consulta',
  nokey: 'falta su llave',
  off: 'apagada',
  idle: 'sin consultar todavía',
};

export interface ChartShape {
  /** Points of a stepped line (SVG polyline). */
  points: string;
  /** Where the lowest price sits. */
  low: { x: number; y: number };
}

/**
 * The watch's history as a stepped line in a `width`×`height` box (integer pixels, oldest on the left), with the
 * lowest point marked. Undefined with fewer than two points: there is no line to draw yet.
 */
export function chartShape(
  history: OfertasPoint[],
  width: number,
  height: number,
  padPx = 0,
): ChartShape | undefined {
  if (history.length < 2) return undefined;
  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const innerW = width - padPx * 2;
  const innerH = height - padPx * 2;
  const x = (i: number) => Math.round(padPx + (i * innerW) / (history.length - 1));
  const y = (price: number) =>
    max === min
      ? Math.round(height / 2)
      : Math.round(padPx + ((max - price) * innerH) / (max - min));
  const pts: string[] = [`${x(0)},${y(prices[0])}`];
  for (let i = 1; i < prices.length; i++) {
    pts.push(`${x(i)},${y(prices[i - 1])}`, `${x(i)},${y(prices[i])}`);
  }
  // The last time the lowest price showed up (the most recent one is the one that matters)
  const lowIndex = prices.lastIndexOf(min);
  return { points: pts.join(' '), low: { x: x(lowIndex), y: y(min) } };
}

/** "audífonos, bluetooth ," → ["audífonos", "bluetooth"]. */
export function splitWords(text: string): string[] {
  return text
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
}

/** The fields of a saved search's form, as typed text. */
export interface WatchFields {
  target: string;
  mustHave: string;
  exclude: string;
  /** "Lo he visto en $…" and the day (YYYY-MM-DD, as a date field gives it). */
  refPrice: string;
  refDate: string;
}

/** YYYY-MM-DD of a moment, local day (what a date field reads and writes). */
export function dateField(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The price seen by hand from the form, or undefined when the price is empty or not a positive amount. */
export function referenceFromFields(
  fields: { refPrice: string; refDate: string },
  nowMs: number = Date.now(),
): OfertasReference | undefined {
  const price = parsePrice(fields.refPrice);
  if (price === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fields.refDate.trim());
  // Noon of that local day: the date survives the hours between time zones
  const day = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : new Date(nowMs);
  return { price, at: (Number.isNaN(day.getTime()) ? new Date(nowMs) : day).toISOString() };
}

/** A saved search as its edit form starts: the target, the word lists and the price seen by hand as typed text. */
export function watchFormFields(
  watch: {
    target?: number;
    mustHave: string[];
    exclude: string[];
    reference?: OfertasReference;
  },
  nowMs: number = Date.now(),
): WatchFields {
  return {
    target: watch.target !== undefined ? String(watch.target) : '',
    mustHave: watch.mustHave.join(', '),
    exclude: watch.exclude.join(', '),
    refPrice: watch.reference ? String(watch.reference.price) : '',
    refDate: dateField(watch.reference ? Date.parse(watch.reference.at) : nowMs),
  };
}

/**
 * The message that changes a saved search: same id and query (so its history stays), the fields as edited. An empty
 * target removes it (saveOfertasWatch without target), and so does an empty "Lo he visto en".
 */
export function watchEditMessage(
  watch: { id: string; query: string },
  fields: WatchFields,
  nowMs: number = Date.now(),
): {
  type: 'saveOfertasWatch';
  id: string;
  query: string;
  target?: number;
  mustHave: string[];
  exclude: string[];
  reference?: OfertasReference;
} {
  const target = parsePrice(fields.target);
  const reference = referenceFromFields(fields, nowMs);
  return {
    type: 'saveOfertasWatch',
    id: watch.id,
    query: watch.query,
    ...(target !== undefined ? { target } : {}),
    mustHave: splitWords(fields.mustHave),
    exclude: splitWords(fields.exclude),
    ...(reference ? { reference } : {}),
  };
}

/** "$1,499.50" or "1499" → 1499.5; undefined when it is not a positive amount. */
export function parsePrice(text: string): number | undefined {
  const clean = text.replace(/[$,\s]/g, '');
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** A result group's offers, the cheapest first. */
export const byPrice = (offers: OfertasOffer[]): OfertasOffer[] =>
  [...offers].sort((a, b) => a.price - b.price);

/** "Buscando en 4 tiendas…". */
export function searchingText(sources: OfertasSource[]): string {
  const on = sources.filter((s) => s.enabled && s.state !== 'off').length;
  return on > 0 ? `Buscando en ${on} ${on === 1 ? 'tienda' : 'tiendas'}…` : 'Buscando…';
}

// ── "¿Es oferta de verdad?" ──────────────────────────────────────────────────────────────────────────────────

export type TagTone = ChipTone | 'warn';

/** The verdict's label and its tone. */
export function verdictTag(kind: OfertasVerdictKind): { text: string; tone: TagTone } {
  switch (kind) {
    case 'good':
      return { text: 'Buen precio', tone: 'ok' };
    case 'expensive':
      return { text: 'Caro', tone: 'bad' };
    case 'normal':
      return { text: 'Precio normal', tone: 'warn' };
    default:
      return { text: 'Todavía no sé', tone: 'muted' };
  }
}

/** "Lo vende la tienda", "Revendedor" or "No dice quién lo vende", with what it means on hover. */
export function sellerTag(offer: { official: boolean; sellerUnknown?: boolean }): {
  text: string;
  title: string;
} {
  if (offer.official) return { text: 'Lo vende la tienda', title: SELLER_STORE_TITLE };
  if (offer.sellerUnknown) return { text: 'No dice quién lo vende', title: SELLER_UNKNOWN_TITLE };
  return { text: 'Revendedor', title: SELLER_RESELLER_TITLE };
}

/** "MSI: hasta 12 meses", "MSI: hasta 12 meses con BBVA", "MSI" (only what the source said). */
export function msiText(i: OfertasInstallments): string {
  const months = i.months ? `: hasta ${i.months} meses` : '';
  const bank = i.bank ? ` con ${i.bank}` : '';
  return `MSI${months}${bank}`;
}

/** Keepa's price history of an Amazon product, from its /dp/ link; undefined for any other store. */
export function keepaUrl(offer: { sourceId: string; url: string }): string | undefined {
  if (offer.sourceId !== 'amazon') return undefined;
  const asin = AMAZON_ASIN_RE.exec(offer.url)?.[1];
  return asin ? `${KEEPA_PRODUCT_URL}${asin}` : undefined;
}

/** Profeco's comparator for today: the Buen Fin one until the sale ends, then the everyday one. */
export function profecoLink(nowMs: number = Date.now()): { name: string; url: string } {
  return {
    name: PROFECO_LINK_NAME,
    url: nowMs < PROFECO_BUEN_FIN_UNTIL ? PROFECO_BUEN_FIN_URL : PROFECO_QQP_URL,
  };
}

const localDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * "mínimo $X (12 nov) · máximo $Y (3 nov) · N días" from the office's own history (the most recent day of each
 * extreme). Undefined with no points.
 */
export function rangeText(history: OfertasPoint[], nowMs: number = Date.now()): string | undefined {
  if (history.length === 0) return undefined;
  let low = history[0]!;
  let high = history[0]!;
  for (const p of history) {
    if (p.price <= low.price) low = p;
    if (p.price >= high.price) high = p;
  }
  const first = Math.min(...history.map((p) => localDay(Date.parse(p.at))));
  const days = Math.round((localDay(nowMs) - first) / 86_400_000) + 1;
  const when = (iso: string) => shortDate(iso, nowMs);
  return `mínimo ${money(low.price)} (${when(low.at)}) · máximo ${money(high.price)} (${when(high.at)}) · ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** "Lo viste en $7,139.05 el 9 nov" ("hoy", "ayer" without "el"). */
export function referenceText(ref: OfertasReference, nowMs: number = Date.now()): string {
  const d = shortDate(ref.at, nowMs);
  return `Lo viste en ${money(ref.price)} ${d === 'hoy' || d === 'ayer' ? d : `el ${d}`}`;
}

// ── The optional assistant ───────────────────────────────────────────────────────────────────────────────────

/** Why a query gave nothing, in plain words (the CLI's own text only goes in the tooltip). */
export const ASISTENTE_ERROR_TEXT: Record<OfertasAsistenteFallo, string> = {
  timeout: 'El asistente tardó demasiado y se detuvo. Intenta de nuevo en un rato.',
  busy: 'El asistente está ocupado con otra consulta. Espera a que termine.',
  failed: 'El asistente no pudo terminar la búsqueda. Intenta de nuevo en un rato.',
  'bad-output': 'El asistente respondió algo que no se pudo leer. Intenta de nuevo.',
  cancelled: 'Cancelaste la búsqueda.',
  'no-subscription':
    'Claude Code de esta máquina no tiene una sesión con suscripción. El asistente nunca usa llaves de pago, así que no buscó.',
  'no-cli': 'Claude Code ya no está en esta máquina.',
  off: 'El asistente está apagado en Ajustes.',
};

/** "0:42", "1:05": how long the query has run (digital). */
export function elapsedText(fromIso: string | undefined, nowMs: number = Date.now()): string {
  const t = fromIso ? Date.parse(fromIso) : NaN;
  const s = Number.isNaN(t) ? 0 : Math.max(0, Math.floor((nowMs - t) / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** "Lo investigó un asistente el 13 nov · 21:40" (always the day and a digital time). */
export function asistenteFooter(revisado: string, verb = 'Lo investigó'): string {
  const d = new Date(revisado);
  if (Number.isNaN(d.getTime())) return `${verb} un asistente`;
  return `${verb} un asistente el ${d.getDate()} ${MONTHS[d.getMonth()]} · ${clock(revisado)}`;
}

/** The numbers it found, each with its label: "Precio típico $1,899", "Mínimo visto $1,599"… */
export function precioFacts(p: OfertasAsistenteInvestigacion): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (p.precioTipico !== undefined)
    out.push({ label: 'Precio típico', value: money(p.precioTipico) });
  if (p.minimoVisto !== undefined) out.push({ label: 'Mínimo visto', value: money(p.minimoVisto) });
  if (p.maximoVisto !== undefined) out.push({ label: 'Máximo visto', value: money(p.maximoVisto) });
  return out;
}

/** "Confianza alta", and the tag's tone. */
export function confianzaTag(c: OfertasAsistenteInvestigacion['confianza']): {
  text: string;
  tone: TagTone;
} {
  return {
    text: `Confianza ${c}`,
    tone: c === 'alta' ? 'ok' : c === 'media' ? 'warn' : 'muted',
  };
}

/** A source's line: its title, and its price and date when it said them. */
export function fuenteText(f: OfertasAsistenteFuente): string {
  const extra = [f.precio !== undefined ? money(f.precio) : '', f.fecha ? shortDay(f.fecha) : '']
    .filter(Boolean)
    .join(' · ');
  return extra ? `${f.titulo} · ${extra}` : f.titulo;
}

/** "9 nov" of a date the assistant gave (YYYY-MM-DD or ISO), without moving it a day by the time zone. */
function shortDay(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim();
}

/** "El compa" or "Alternativa". */
export const similarTag = (tipo: 'compa' | 'alternativa'): string =>
  tipo === 'compa' ? 'Su compa' : 'Alternativa';
