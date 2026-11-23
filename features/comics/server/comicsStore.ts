import * as fs from 'fs';
import * as path from 'path';

import { COMICS_FILE_VERSION, SERIES_MAX, TRASH_MAX, VOLUMES_MAX } from '../core/constants.js';
import {
  isoDay,
  isSeriesId,
  mergeSave,
  newSeriesId,
  normalizeSeries,
  readComics,
  seriesFileContent,
} from '../core/series.js';
import type { ComicCoverArt, Series } from '../core/types.js';
import { COMICS_FILE, DAMAGED_PREFIX, FILE_MAX_BYTES, ID_TRIES } from './constants.js';
import { seriesCoverChanged } from './coverIdentity.js';

export interface ComicsStoreOptions {
  /** The office folder (~/.pixel-agents). */
  pixelDir: string;
  now?: () => number;
  random?: () => number;
}

export interface ComicsStore {
  file(): string;
  list(): Series[];
  get(id: string): Series | undefined;
  /** What could not be read, in Spanish. */
  problems(): string[];
  /** Reads the file again if it changed since the last read (or was never read); true when it did. */
  check(): boolean;
  /** Writes the series (a new id when it has none or an unknown one) and returns it as saved. Throws on failure. */
  save(input: unknown): Series;
  /** Takes the series out (it stays in the file's trash). False when there was no such series. */
  remove(id: string): boolean;
  /** Sets or clears a series's cover (the server's own field); a cover set also clears its «Ninguna». */
  setCover(id: string, cover: ComicCoverArt | null): boolean;
  /** Writes or clears the time the person answered «Ninguna» to its cover choice. */
  setCoverNone(id: string, at: string | null): boolean;
  /** The file exists and was read whole (not damaged, not too big): what it lacks is really not there. */
  readWhole(): boolean;
}

interface Entry {
  series: Series;
  unknown: Record<string, unknown>;
}

/** The whole comics collection in one JSON file (a copy of features/libros/server/libraryStore.ts for series), written atomically (tmp + rename), with a size cap. */
export function createComicsStore(opts: ComicsStoreOptions): ComicsStore {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const file = path.join(opts.pixelDir, COMICS_FILE);
  let entries = new Map<string, Entry>();
  let topUnknown: Record<string, unknown> = {};
  let trash: unknown[] = [];
  let problems: string[] = [];
  let signature: string | null = null;
  /** The file on disk could not be read: it is kept aside before the first write. */
  let damaged = false;
  /** The file is bigger than the cap: nothing is written over it. */
  let tooBig = false;
  /** Read in part: past the cap, or ids given anew (the cover cleanup at start must not trust it). */
  let partial = false;

  function fileSignature(): string {
    try {
      const st = fs.statSync(file);
      return `${st.size}:${st.mtimeMs}`;
    } catch {
      return 'none';
    }
  }

  function read(): void {
    signature = fileSignature();
    entries = new Map();
    topUnknown = {};
    trash = [];
    problems = [];
    damaged = false;
    tooBig = false;
    partial = false;
    if (signature === 'none') return;
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      return;
    }
    if (size > FILE_MAX_BYTES) {
      tooBig = true;
      problems.push(
        `${COMICS_FILE} pesa ${(size / 1024 / 1024).toFixed(1)} MB (el tope es ${FILE_MAX_BYTES / 1024 / 1024} MB): no lo leo ni escribo encima.`,
      );
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      damaged = true;
      problems.push(
        `${COMICS_FILE} no se pudo leer (${(err as Error).message}). Al guardar, se aparta como copia y empieza uno nuevo.`,
      );
      return;
    }
    const result = readComics(raw, isoDay(now()));
    const listed = (raw as { series?: unknown } | null)?.series;
    partial =
      (Array.isArray(listed) && listed.length !== result.series.length) ||
      result.problems.some((p) => p.includes('no tenía un id propio'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) damaged = true;
    const version = (raw as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > COMICS_FILE_VERSION)
      problems.push(
        `${COMICS_FILE} es de una versión más nueva (${version}); se conservan los campos que no conozco.`,
      );
    for (const r of result.series)
      entries.set(r.series.id, { series: r.series, unknown: r.unknown });
    topUnknown = result.unknown;
    trash = result.trash;
    problems.push(...result.problems);
  }

  function check(): boolean {
    if (signature !== null && fileSignature() === signature) return false;
    read();
    return true;
  }

  function write(): void {
    const content = {
      version: COMICS_FILE_VERSION,
      ...topUnknown,
      series: [...entries.values()].map((e) => seriesFileContent(e.series, e.unknown)),
      trash,
    };
    const text = `${JSON.stringify(content, null, 2)}\n`;
    if (Buffer.byteLength(text) > FILE_MAX_BYTES)
      throw new Error('la colección de cómics pasaría del tamaño máximo del archivo');
    fs.mkdirSync(opts.pixelDir, { recursive: true });
    if (damaged && fs.existsSync(file)) {
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(file, path.join(opts.pixelDir, `${DAMAGED_PREFIX}${stamp}.json`));
      damaged = false;
    }
    const tmp = path.join(opts.pixelDir, `.${COMICS_FILE}.${process.pid}.${now()}.tmp`);
    try {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, file);
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      throw err;
    }
    signature = fileSignature();
    problems = problems.filter((p) => !p.includes('no se pudo leer'));
  }

  /** Before any change: pick up edits made from outside, and refuse to write over a file too big to read. */
  function beforeChange(): void {
    check();
    if (tooBig) throw new Error('el archivo de cómics es demasiado grande');
  }

  /** Writes with one entry changed; when the file cannot be written, memory says what the disk says. */
  function writeEntry(id: string, next: Entry, before: Entry): void {
    entries.set(id, next);
    try {
      write();
    } catch (err) {
      entries.set(id, before);
      throw err;
    }
  }

  function save(input: unknown): Series {
    beforeChange();
    const today = isoDay(now());
    const sent = (input as { volumes?: unknown } | null)?.volumes;
    if (Array.isArray(sent) && sent.length > VOLUMES_MAX)
      throw new Error(`tiene ${sent.length} tomos anotados; el tope es ${VOLUMES_MAX}`);
    const read = normalizeSeries(input, today);
    if (!read) throw new Error('no es una serie');
    const askedId = (input as { id?: unknown }).id;
    const previous = isSeriesId(askedId) ? entries.get(askedId) : undefined;
    if (!previous && entries.size >= SERIES_MAX)
      throw new Error(`la colección ya tiene ${SERIES_MAX} series`);
    const item = mergeSave(previous?.series, read.series, today, new Date(now()).toISOString());
    // The cover is the server's: what the client sends for it is ignored, what was there stays. Except when the
    // title or first writer changed: a cover a source found for the old one no longer fits (an uploaded
    // one is the person's and stays), and an old «Ninguna» was about another series
    const same = !!previous && !seriesCoverChanged(previous.series, item);
    const art = previous?.series.coverArt;
    if (art && (same || art.source === 'subida')) item.coverArt = art;
    else delete item.coverArt;
    if (previous?.series.coverNone && same) item.coverNone = previous.series.coverNone;
    else delete item.coverNone;
    if (!previous) {
      // A free id; a bounded number of tries, so a broken random source fails instead of hanging
      let id = '';
      for (let i = 0; i < ID_TRIES && (!id || entries.has(id)); i++) id = newSeriesId(random);
      if (entries.has(id)) throw new Error('no encontré un id libre para la serie');
      item.id = id;
    }
    const next = { series: item, unknown: { ...previous?.unknown, ...read.unknown } };
    if (previous) writeEntry(item.id, next, previous);
    else {
      entries.set(item.id, next);
      try {
        write();
      } catch (err) {
        entries.delete(item.id);
        throw err;
      }
    }
    return item;
  }

  function remove(id: string): boolean {
    beforeChange();
    const entry = isSeriesId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    entries.delete(id);
    // The image is deleted with the series: its cover data does not go to the trash
    const { coverArt: _image, coverNone: _none, ...gone } = entry.series;
    const before = trash;
    trash = [
      { ...seriesFileContent(gone, entry.unknown), deletedAt: new Date(now()).toISOString() },
      ...trash,
    ].slice(0, TRASH_MAX);
    try {
      write();
    } catch (err) {
      entries.set(id, entry);
      trash = before;
      throw err;
    }
    return true;
  }

  function setCover(id: string, cover: ComicCoverArt | null): boolean {
    beforeChange();
    const entry = isSeriesId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    const item: Series = { ...entry.series };
    if (cover) {
      item.coverArt = { ...cover };
      delete item.coverNone;
    } else delete item.coverArt;
    writeEntry(id, { series: item, unknown: entry.unknown }, entry);
    return true;
  }

  function setCoverNone(id: string, at: string | null): boolean {
    beforeChange();
    const entry = isSeriesId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    if ((entry.series.coverNone ?? null) === at) return true;
    const item: Series = { ...entry.series };
    if (at) item.coverNone = at;
    else delete item.coverNone;
    writeEntry(id, { series: item, unknown: entry.unknown }, entry);
    return true;
  }

  return {
    file: () => file,
    list: () => [...entries.values()].map((e) => e.series),
    get: (id) => entries.get(id)?.series,
    problems: () => [...problems],
    check,
    save,
    remove,
    setCover,
    setCoverNone,
    readWhole: () => {
      check();
      return signature !== 'none' && !damaged && !tooBig && !partial;
    },
  };
}
