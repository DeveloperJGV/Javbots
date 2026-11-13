/**
 * The two jobs' answers, validated and trimmed. What survives is plain data the panel can show as text: no HTML is
 * kept special, links are only http(s), numbers have sense, and whatever the model added beyond the schema is dropped.
 */
import {
  CONFIDENCE_LEVELS,
  NAME_MAX,
  NOTE_FALLBACK,
  NOTE_MAX,
  NOTE_NO_SOURCES,
  PRODUCT_MAX,
  REASON_MAX,
  SIMILAR_KINDS,
  SIMILAR_SOURCES_CAP,
  SIMILARS_MAX,
  SOURCES_CAP,
  TITLE_MAX,
} from './constants.js';
import { oneOf, pastDate, price, rec, safeUrl, text } from './sanitize.js';

export type Confianza = (typeof CONFIDENCE_LEVELS)[number];
export type TipoSimilar = (typeof SIMILAR_KINDS)[number];

export interface Fuente {
  titulo: string;
  url: string;
  fecha?: string;
  precio?: number;
}

export interface InvestigacionPrecio {
  precioTipico?: number;
  minimoVisto?: number;
  maximoVisto?: number;
  nota: string;
  confianza: Confianza;
  fuentes: Fuente[];
  /** When the office got the answer (ISO), not something the model said. */
  revisado: string;
}

export interface Similar {
  tipo: TipoSimilar;
  nombre: string;
  porque: string;
  precioAprox?: number;
  /** Ready for the office's own store search. */
  consulta: string;
  fuentes: Fuente[];
}

export interface BusquedaSimilares {
  similares: Similar[];
  revisado: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function parseFuentes(v: unknown, cap: number, now: Date, reference?: number): Fuente[] {
  if (!Array.isArray(v)) {
    return [];
  }
  const out: Fuente[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const r = rec(item);
    const url = r ? safeUrl(r.url) : undefined;
    if (!r || !url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const f: Fuente = { titulo: text(r.titulo, TITLE_MAX) ?? new URL(url).hostname, url };
    const fecha = pastDate(r.fecha, now);
    if (fecha) {
      f.fecha = fecha;
    }
    const p = price(r.precio, reference);
    if (p !== undefined) {
      f.precio = p;
    }
    out.push(f);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

export function parseInvestigacion(
  raw: unknown,
  now: Date,
  precioActual?: number,
): InvestigacionPrecio | undefined {
  const r = rec(raw);
  if (!r) {
    return undefined;
  }
  const fuentes = parseFuentes(r.fuentes, SOURCES_CAP, now, precioActual);
  const out: InvestigacionPrecio = {
    nota: text(r.nota, NOTE_MAX) ?? NOTE_FALLBACK,
    confianza: oneOf(r.confianza, CONFIDENCE_LEVELS, 'baja'),
    fuentes,
    revisado: now.toISOString(),
  };
  let tipico = price(r.precioTipico, precioActual);
  let minimo = price(r.minimoVisto, precioActual);
  let maximo = price(r.maximoVisto, precioActual);
  if (minimo !== undefined && maximo !== undefined && minimo > maximo) {
    minimo = undefined;
    maximo = undefined;
  }
  // Numbers with nothing behind them are not believed.
  if (fuentes.length === 0 && (tipico ?? minimo ?? maximo) !== undefined) {
    tipico = minimo = maximo = undefined;
    out.nota = text(`${out.nota} ${NOTE_NO_SOURCES}`, NOTE_MAX) ?? NOTE_NO_SOURCES;
  }
  if (fuentes.length === 0) {
    out.confianza = 'baja';
  }
  if (tipico !== undefined) {
    out.precioTipico = tipico;
  }
  if (minimo !== undefined) {
    out.minimoVisto = minimo;
  }
  if (maximo !== undefined) {
    out.maximoVisto = maximo;
  }
  return out;
}

export function parseSimilares(
  raw: unknown,
  producto: string,
  now: Date,
  presupuesto?: number,
): BusquedaSimilares | undefined {
  const r = rec(raw);
  if (!r || !Array.isArray(r.similares)) {
    return undefined;
  }
  const self = norm(producto);
  const names = new Set<string>();
  const out: Similar[] = [];
  for (const item of r.similares) {
    const s = rec(item);
    const nombre = s ? text(s.nombre, NAME_MAX) : undefined;
    if (!s || !nombre) {
      continue;
    }
    const key = norm(nombre);
    if (!key || key === self || names.has(key)) {
      continue;
    }
    names.add(key);
    const similar: Similar = {
      tipo:
        oneOf(s.tipo, SIMILAR_KINDS, 'alternativa') === 'compa' &&
        !out.some((o) => o.tipo === 'compa')
          ? 'compa'
          : 'alternativa',
      nombre,
      porque: text(s.porque, REASON_MAX) ?? '',
      consulta: text(s.consulta, PRODUCT_MAX) ?? text(nombre, PRODUCT_MAX) ?? nombre,
      fuentes: parseFuentes(s.fuentes, SIMILAR_SOURCES_CAP, now, presupuesto),
    };
    const p = price(s.precioAprox, presupuesto);
    if (p !== undefined) {
      similar.precioAprox = p;
    }
    out.push(similar);
    if (out.length >= SIMILARS_MAX) {
      break;
    }
  }
  if (out.length === 0) {
    return undefined;
  }
  // The closest match goes first.
  out.sort((a, b) => Number(b.tipo === 'compa') - Number(a.tipo === 'compa'));
  return { similares: out, revisado: now.toISOString() };
}
