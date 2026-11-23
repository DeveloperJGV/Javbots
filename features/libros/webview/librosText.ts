import { agoText, daysBetween } from '../../coleccion/core/tonight.js';
import { authorsText } from '../core/book.js';
import { LENT_LONG_DAYS } from '../core/constants.js';
import { isbnValid } from '../core/isbn.js';
import type { Shelf } from '../core/shelves.js';
import type { Book } from '../core/types.js';
import { FORMAT_LABEL, NEW_STAR_DAYS, READING_LABEL } from './constants.js';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The header's line: «120 libros · 45 autores · 2 leyendo · 3 prestados · 4 se buscan». */
export function summaryParts(t: {
  owned: number;
  wanted: number;
  reading: number;
  lent: number;
  authors: number;
}): { owned: string; rest: string[]; wanted: string | null } {
  const rest: string[] = [];
  if (t.authors) rest.push(plural(t.authors, 'autor', 'autores'));
  if (t.reading) rest.push(`${t.reading} leyendo`);
  if (t.lent) rest.push(plural(t.lent, 'prestado', 'prestados'));
  return {
    owned: plural(t.owned, 'libro', 'libros'),
    rest,
    wanted: t.wanted ? `${t.wanted} se ${t.wanted === 1 ? 'busca' : 'buscan'}` : null,
  };
}

/** A shelf's counts: «12 · 1 se busca · 2 leyendo». */
export function shelfCount(s: Pick<Shelf, 'owned' | 'wanted' | 'reading'>): {
  owned: string;
  wanted: string | null;
  reading: string | null;
} {
  return {
    owned: plural(s.owned, 'libro', 'libros'),
    wanted: s.wanted ? `${s.wanted} se ${s.wanted === 1 ? 'busca' : 'buscan'}` : null,
    reading: s.reading ? `${s.reading} leyendo` : null,
  };
}

export const readingText = (b: Book) => READING_LABEL[b.reading] ?? 'Sin anotar';
export const formatText = (b: Book) => FORMAT_LABEL[b.format] ?? 'Sin anotar';
export const byLine = (b: Book) => (b.authors.length ? authorsText(b.authors) : 'Autor sin anotar');

/** «Saga Faro, 2» or «Saga Faro». */
export const sagaText = (b: Book) =>
  b.series ? `${b.series}${b.seriesNumber ? `, ${b.seriesNumber}` : ''}` : '';

/** The edition in one line: «Editorial Brújula · 2019 · 320 páginas · Español». */
export function editionLine(b: Book): string {
  const parts = [
    b.publisher,
    b.year ? String(b.year) : '',
    b.pages ? `${b.pages} páginas` : '',
    b.language,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** Who has it and since when: «Lo tiene Ana desde hace 3 meses» (and a note when it has been long). */
export function lentText(b: Book, today: string): { text: string; long: boolean } | null {
  if (!b.lentTo) return null;
  const since = b.lentAt ? ` desde ${agoText(b.lentAt, today)}` : '';
  return {
    text: `Lo tiene ${b.lentTo}${since}.`,
    long: !!b.lentAt && daysBetween(b.lentAt, today) >= LENT_LONG_DAYS,
  };
}

/** When it came: «Llegó hace 2 meses (2026-09-14)». */
export function addedText(b: Book, today: string): string {
  return `${b.wanted ? 'Anotado' : 'Llegó'} ${agoText(b.addedAt, today)} (${b.addedAt})`;
}

export const isNew = (b: Book, today: string) =>
  !b.wanted && !!b.addedAt && daysBetween(b.addedAt, today) < NEW_STAR_DAYS;

/** The price as short as it can go on a small tag: "$350 MXN" → "$350". */
export function shortPrice(price: string): string {
  const m = /^\s*([$€£¥]?\s?[\d.,]+)/.exec(price);
  return m ? m[1].replace(/\s/g, '') : price.slice(0, 8);
}

/** What stops a draft from being saved, or a warning that does not stop it. */
export function draftProblem(d: Pick<Book, 'title'>): string | null {
  if (!d.title.trim()) return 'Falta el título.';
  return null;
}
export function isbnWarning(isbn: string): string | null {
  if (!isbn) return null;
  return isbnValid(isbn) ? null : 'Ese ISBN no cuadra: revisa los dígitos (se guarda igual).';
}

/** What could not be read, in one line under the shelves. */
export function problemsLine(problems: readonly string[]): string {
  if (!problems.length) return '';
  return problems.length === 1
    ? problems[0]
    : `${problems[0]} (y ${problems.length - 1} ${problems.length === 2 ? 'aviso más' : 'avisos más'})`;
}
