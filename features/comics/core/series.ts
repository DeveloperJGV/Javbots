import { isIsoTime } from '../../coleccion/core/cover.js';
import { cleanText, isGameId, isoDay, newGameId } from '../../coleccion/core/game.js';
import { parseAuthors } from '../../libros/core/book.js';
import { cleanIsbn } from '../../libros/core/isbn.js';
import {
  COVER_KEY_MAX,
  DEFAULT_TITLE,
  GENRE_MAX,
  LANGUAGE_MAX,
  NOTES_MAX,
  OWNER_MAX,
  PEOPLE_COUNT_MAX,
  PRICE_MAX,
  PUBLISHER_MAX,
  RANGE_MAX,
  SERIES_MAX,
  TITLE_MAX,
  VOLUME_MAX,
  VOLUMES_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from './constants.js';
import {
  COMIC_COVER_SOURCES,
  COMIC_COVER_TYPES,
  COMIC_FORMATS,
  type ComicCoverArt,
  type ComicCoverSource,
  type ComicCoverType,
  type ComicFormat,
  type ComicKind,
  KINDS,
  type ReadSeries,
  type Series,
  type Volume,
} from './types.js';

export { isoDay };

/** Series ids look like the collection's game ids: lowercase letters and digits. */
export const isSeriesId = isGameId;
export const newSeriesId = newGameId;

const KNOWN_FIELDS = new Set([
  'id',
  'title',
  'writers',
  'artists',
  'publisher',
  'localPublisher',
  'kind',
  'genre',
  'year',
  'language',
  'format',
  'totalVolumes',
  'finished',
  'readUpTo',
  'owner',
  'notes',
  'volumes',
  'addedAt',
  'updatedAt',
  'coverArt',
  'coverNone',
]);

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const line = (value: unknown, max: number) =>
  cleanText(typeof value === 'string' ? value.replace(/\s+/g, ' ') : value, max);
const day = (value: unknown): string =>
  typeof value === 'string' && DAY_PATTERN.test(value) ? value : '';
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : '';
}
function whole(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const n = Math.round(value);
  return n >= min && n <= max ? n : 0;
}
const people = (v: unknown) => parseAuthors(v).slice(0, PEOPLE_COUNT_MAX);

/**
 * The volume numbers a person writes: «1-12, 15, 17 a 20» (commas or spaces between, «-», «–» or «a» in a range).
 * Repeats out, sorted. Null when something is not a number or a range is upside down or too long.
 */
export function parseVolumeList(text: string): number[] | null {
  const out = new Set<number>();
  // «17 a 20», «17 – 20» and «17-20» are the same range; then commas, semicolons or spaces between parts
  const parts = text
    .replace(/\s*(?:-|–|\ba\b)\s*/g, '-')
    .split(/[,;\s]+/)
    .filter(Boolean);
  for (const p of parts) {
    const range = /^(\d{1,4})-(\d{1,4})$/.exec(p);
    const single = /^\d{1,4}$/.exec(p);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (b < a || b - a + 1 > RANGE_MAX || b > VOLUME_MAX) return null;
      for (let n = a; n <= b; n++) out.add(n);
    } else if (single) {
      const n = Number(single[0]);
      if (n > VOLUME_MAX) return null;
      out.add(n);
    } else return null;
    if (out.size > RANGE_MAX) return null;
  }
  return [...out].sort((a, b) => a - b);
}

/** Numbers written back short: [1,2,3,5,7,8] → «1-3, 5, 7-8». */
export function volumeListText(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return out.join(', ');
}

/** The volumes on the shelf, by number. */
export const ownedNumbers = (s: Pick<Series, 'volumes'>): number[] =>
  s.volumes.filter((v) => v.owned).map((v) => v.number);

/**
 * How far the series goes on the shelf: its volume count, or the highest number known if that is higher (a series
 * still coming out). 0 = nothing known.
 */
export function seriesSpan(s: Pick<Series, 'volumes' | 'totalVolumes'>): number {
  return Math.max(s.totalVolumes, ...s.volumes.map((v) => v.number), 0);
}

/** The volumes missing between 1 and the span (the series' «se busca»). */
export function missingNumbers(s: Pick<Series, 'volumes' | 'totalVolumes'>): number[] {
  const owned = new Set(ownedNumbers(s as Series));
  const out: number[] = [];
  for (let n = 1; n <= seriesSpan(s); n++) if (!owned.has(n)) out.push(n);
  return out;
}

/** A series' cover from anything; null when any part of it is not right. */
export function normalizeComicCover(raw: unknown): ComicCoverArt | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!(COMIC_COVER_SOURCES as readonly unknown[]).includes(r.source)) return null;
  if (!(COMIC_COVER_TYPES as readonly unknown[]).includes(r.type)) return null;
  if (typeof r.key !== 'string' || r.key.length > COVER_KEY_MAX) return null;
  if (r.key !== '' && !/^(isbn:[0-9X]{10,13}|id:\d{1,12}|al:\d{1,12})$/.test(r.key)) return null;
  if (!isIsoTime(r.at)) return null;
  return {
    source: r.source as ComicCoverSource,
    key: r.key,
    at: r.at,
    type: r.type as ComicCoverType,
  };
}

/** Volumes from anything: valid numbers only, one per number (the first wins), sorted, capped. */
function normalizeVolumes(raw: unknown, problems: string[]): Volume[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push('"volumes" no es una lista.');
    return [];
  }
  const seen = new Map<number, Volume>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const number =
      typeof r.number === 'number' && Number.isInteger(r.number) ? r.number : Number.NaN;
    if (!(number >= 0 && number <= VOLUME_MAX) || seen.has(number)) continue;
    const owned = r.owned === true;
    seen.set(number, {
      number,
      owned,
      isbn: cleanIsbn(r.isbn),
      addedAt: owned ? day(r.addedAt) : '',
      price: owned ? '' : line(r.price, PRICE_MAX),
    });
  }
  const list = [...seen.values()]
    // A missing one with nothing said is not worth keeping
    .filter((v) => v.owned || v.price || v.isbn)
    .sort((a, b) => a.number - b.number);
  if (list.length > VOLUMES_MAX)
    problems.push(`tiene ${list.length} tomos anotados; se leen ${VOLUMES_MAX}.`);
  return list.slice(0, VOLUMES_MAX);
}

export function emptySeries(today: string, keep: Partial<Series> = {}): Series {
  return {
    id: '',
    title: '',
    writers: [],
    artists: [],
    publisher: '',
    localPublisher: '',
    kind: '',
    genre: '',
    year: 0,
    language: '',
    format: '',
    totalVolumes: 0,
    finished: false,
    readUpTo: 0,
    owner: '',
    notes: '',
    volumes: [],
    addedAt: today,
    updatedAt: '',
    ...keep,
  };
}

/** A series from anything (the file, a message). Null when it is not even an object. */
export function normalizeSeries(raw: unknown, today: string): ReadSeries | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!KNOWN_FIELDS.has(k)) unknown[k] = v;
  let title = line(r.title, TITLE_MAX);
  if (!title) {
    title = DEFAULT_TITLE;
    problems.push('no tenía título.');
  }
  const series: Series = {
    id: isSeriesId(r.id) ? r.id : '',
    title,
    writers: people(r.writers),
    artists: people(r.artists),
    publisher: line(r.publisher, PUBLISHER_MAX),
    localPublisher: line(r.localPublisher, PUBLISHER_MAX),
    kind: oneOf(r.kind, KINDS) as ComicKind,
    genre: line(r.genre, GENRE_MAX),
    year: whole(r.year, YEAR_MIN, YEAR_MAX),
    language: line(r.language, LANGUAGE_MAX),
    format: oneOf(r.format, COMIC_FORMATS) as ComicFormat,
    totalVolumes: whole(r.totalVolumes, 1, VOLUME_MAX),
    finished: r.finished === true,
    readUpTo: whole(r.readUpTo, 1, VOLUME_MAX),
    owner: line(r.owner, OWNER_MAX),
    notes: cleanText(r.notes, NOTES_MAX),
    volumes: normalizeVolumes(r.volumes, problems),
    addedAt: day(r.addedAt) || today,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '',
  };
  if (r.coverArt !== undefined) {
    const art = normalizeComicCover(r.coverArt);
    if (art) series.coverArt = art;
    else problems.push('los datos de su portada no se entienden; se ignoran.');
  }
  if (isIsoTime(r.coverNone)) series.coverNone = r.coverNone;
  return { series, unknown, problems };
}

export function seriesFileContent(
  s: Series,
  unknown: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: s.id,
    title: s.title,
    writers: [...s.writers],
    artists: [...s.artists],
    publisher: s.publisher,
    localPublisher: s.localPublisher,
    kind: s.kind,
    genre: s.genre,
    year: s.year,
    language: s.language,
    format: s.format,
    totalVolumes: s.totalVolumes,
    finished: s.finished,
    readUpTo: s.readUpTo,
    owner: s.owner,
    notes: s.notes,
    volumes: s.volumes.map((v) => ({ ...v })),
    addedAt: s.addedAt,
    updatedAt: s.updatedAt,
  };
  if (s.coverArt) out.coverArt = { ...s.coverArt };
  if (s.coverNone) out.coverNone = s.coverNone;
  for (const [k, v] of Object.entries(unknown)) if (!(k in out)) out[k] = v;
  return out;
}

export interface ReadComics {
  series: ReadSeries[];
  unknown: Record<string, unknown>;
  trash: unknown[];
  problems: string[];
}

/** The comics file's content (already parsed JSON). Never throws. */
export function readComics(raw: unknown, today: string): ReadComics {
  const out: ReadComics = { series: [], unknown: {}, trash: [], problems: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    out.problems.push('El archivo no es una colección de cómics.');
    return out;
  }
  const r = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(r))
    if (k !== 'version' && k !== 'series' && k !== 'trash') out.unknown[k] = v;
  if (Array.isArray(r.trash)) out.trash = r.trash;
  if (r.series !== undefined && !Array.isArray(r.series))
    out.problems.push('"series" no es una lista.');
  const list = Array.isArray(r.series) ? r.series : [];
  if (list.length > SERIES_MAX)
    out.problems.push(`Tiene ${list.length} series; solo se leen las primeras ${SERIES_MAX}.`);
  const seen = new Set<string>();
  list.slice(0, SERIES_MAX).forEach((item, i) => {
    const read = normalizeSeries(item, today);
    if (!read) {
      out.problems.push(`El renglón ${i + 1} no es una serie.`);
      return;
    }
    if (!read.series.id || seen.has(read.series.id)) {
      let id = `x${String(i).padStart(4, '0')}`;
      while (seen.has(id)) id += 'x';
      read.problems.push(`no tenía un id propio; uso ${id}.`);
      read.series.id = id;
    }
    seen.add(read.series.id);
    for (const p of read.problems) out.problems.push(`${read.series.title}: ${p}`);
    out.series.push(read);
  });
  return out;
}

/**
 * Applies a save on top of what was there: id and arrival stay; a volume that arrives now (owned, and it was not)
 * gets today as its arrival.
 */
export function mergeSave(
  previous: Series | undefined,
  next: Series,
  today: string,
  nowIso: string,
): Series {
  const before = new Map((previous?.volumes ?? []).map((v) => [v.number, v]));
  const volumes = next.volumes.map((v) => {
    if (!v.owned) return { ...v, addedAt: '' };
    const was = before.get(v.number);
    return { ...v, addedAt: v.addedAt || (was?.owned ? was.addedAt : '') || today };
  });
  const s: Series = { ...next, volumes, updatedAt: nowIso };
  s.addedAt = previous ? previous.addedAt : today;
  if (previous) s.id = previous.id;
  return s;
}

/**
 * The volumes after the person says which ones are here («1-12, 15»): the ones listed are owned (keeping what each
 * had: ISBN, arrival), the rest stay only when they say something (a price, an ISBN) as missing.
 */
export function withOwned(volumes: readonly Volume[], owned: readonly number[]): Volume[] {
  const set = new Set(owned);
  const by = new Map(volumes.map((v) => [v.number, v]));
  const out: Volume[] = [];
  for (const n of set) {
    const was = by.get(n);
    out.push({
      number: n,
      owned: true,
      isbn: was?.isbn ?? '',
      addedAt: was?.addedAt ?? '',
      price: '',
    });
  }
  for (const v of volumes)
    if (!set.has(v.number) && (v.price || v.isbn)) out.push({ ...v, owned: false, addedAt: '' });
  return out.sort((a, b) => a.number - b.number);
}

/** One volume turned on or off the shelf (the series card's quick toggle). */
export function toggleVolume(volumes: readonly Volume[], number: number): Volume[] {
  const owned = new Set(volumes.filter((v) => v.owned).map((v) => v.number));
  if (owned.has(number)) owned.delete(number);
  else owned.add(number);
  return withOwned(volumes, [...owned]);
}

/** Title order (Spanish, accents ignored, numbers as numbers), then id. */
export const byTitle = (a: Series, b: Series): number =>
  a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true }) ||
  a.id.localeCompare(b.id);
