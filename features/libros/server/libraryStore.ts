import * as fs from 'fs';
import * as path from 'path';

import {
  bookFileContent,
  isBookId,
  isoDay,
  mergeSave,
  newBookId,
  normalizeBook,
  readLibrary,
} from '../core/book.js';
import { BOOKS_MAX, LIBRARY_FILE_VERSION, TRASH_MAX } from '../core/constants.js';
import { coverIdentityChanged } from '../core/cover.js';
import type { Book, BookCoverArt } from '../core/types.js';
import { DAMAGED_PREFIX, FILE_MAX_BYTES, ID_TRIES, LIBRARY_FILE } from './constants.js';

export interface LibraryStoreOptions {
  /** The office folder (~/.pixel-agents). */
  pixelDir: string;
  now?: () => number;
  random?: () => number;
}

export interface LibraryStore {
  file(): string;
  books(): Book[];
  get(id: string): Book | undefined;
  /** What could not be read, in Spanish. */
  problems(): string[];
  /** Reads the file again if it changed since the last read (or was never read); true when it did. */
  check(): boolean;
  /** Writes the book (a new id when it has none or an unknown one) and returns it as saved. Throws on failure. */
  save(input: unknown): Book;
  /** Takes the book out (it stays in the file's trash). False when there was no such book. */
  remove(id: string): boolean;
  /** Sets or clears a book's cover (the server's own field); a cover set also clears its «Ninguna». */
  setCover(id: string, cover: BookCoverArt | null): boolean;
  /** Writes or clears the time the person answered «Ninguna» to its cover choice. */
  setCoverNone(id: string, at: string | null): boolean;
  /** The file exists and was read whole (not damaged, not too big): what it lacks is really not there. */
  readWhole(): boolean;
}

interface Entry {
  book: Book;
  unknown: Record<string, unknown>;
}

/** The whole library in one JSON file, written atomically (tmp + rename), with a size cap. */
export function createLibraryStore(opts: LibraryStoreOptions): LibraryStore {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const file = path.join(opts.pixelDir, LIBRARY_FILE);
  let entries = new Map<string, Entry>();
  let topUnknown: Record<string, unknown> = {};
  let trash: unknown[] = [];
  let problems: string[] = [];
  let signature: string | null = null;
  /** The file on disk could not be read: it is kept aside before the first write. */
  let damaged = false;
  /** The file is bigger than the cap: nothing is written over it. */
  let tooBig = false;

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
        `${LIBRARY_FILE} pesa ${(size / 1024 / 1024).toFixed(1)} MB (el tope es ${FILE_MAX_BYTES / 1024 / 1024} MB): no lo leo ni escribo encima.`,
      );
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      damaged = true;
      problems.push(
        `${LIBRARY_FILE} no se pudo leer (${(err as Error).message}). Al guardar, se aparta como copia y empieza uno nuevo.`,
      );
      return;
    }
    const result = readLibrary(raw, isoDay(now()));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) damaged = true;
    const version = (raw as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > LIBRARY_FILE_VERSION)
      problems.push(
        `${LIBRARY_FILE} es de una versión más nueva (${version}); se conservan los campos que no conozco.`,
      );
    for (const r of result.books) entries.set(r.book.id, { book: r.book, unknown: r.unknown });
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
      version: LIBRARY_FILE_VERSION,
      ...topUnknown,
      books: [...entries.values()].map((e) => bookFileContent(e.book, e.unknown)),
      trash,
    };
    const text = `${JSON.stringify(content, null, 2)}\n`;
    if (Buffer.byteLength(text) > FILE_MAX_BYTES)
      throw new Error('la biblioteca pasaría del tamaño máximo del archivo');
    fs.mkdirSync(opts.pixelDir, { recursive: true });
    if (damaged && fs.existsSync(file)) {
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(file, path.join(opts.pixelDir, `${DAMAGED_PREFIX}${stamp}.json`));
      damaged = false;
    }
    const tmp = path.join(opts.pixelDir, `.${LIBRARY_FILE}.${process.pid}.${now()}.tmp`);
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
    if (tooBig) throw new Error('el archivo de la biblioteca es demasiado grande');
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

  function save(input: unknown): Book {
    beforeChange();
    const today = isoDay(now());
    const read = normalizeBook(input, today);
    if (!read) throw new Error('no es un libro');
    const askedId = (input as { id?: unknown }).id;
    const previous = isBookId(askedId) ? entries.get(askedId) : undefined;
    if (!previous && entries.size >= BOOKS_MAX)
      throw new Error(`la biblioteca ya tiene ${BOOKS_MAX} libros`);
    const book = mergeSave(previous?.book, read.book, today, new Date(now()).toISOString());
    // The cover is the server's: what the client sends for it is ignored, what was there stays. Except when the
    // title, first author or ISBN changed: a cover Open Library found for the old one no longer fits (an uploaded
    // one is the person's and stays), and an old «Ninguna» was about another book
    const same = !!previous && !coverIdentityChanged(previous.book, book);
    const art = previous?.book.coverArt;
    if (art && (same || art.source === 'subida')) book.coverArt = art;
    else delete book.coverArt;
    if (previous?.book.coverNone && same) book.coverNone = previous.book.coverNone;
    else delete book.coverNone;
    if (!previous) {
      // A free id; a bounded number of tries, so a broken random source fails instead of hanging
      let id = '';
      for (let i = 0; i < ID_TRIES && (!id || entries.has(id)); i++) id = newBookId(random);
      if (entries.has(id)) throw new Error('no encontré un id libre para el libro');
      book.id = id;
    }
    const next = { book, unknown: { ...previous?.unknown, ...read.unknown } };
    if (previous) writeEntry(book.id, next, previous);
    else {
      entries.set(book.id, next);
      try {
        write();
      } catch (err) {
        entries.delete(book.id);
        throw err;
      }
    }
    return book;
  }

  function remove(id: string): boolean {
    beforeChange();
    const entry = isBookId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    entries.delete(id);
    // The image is deleted with the book: its cover data does not go to the trash
    const { coverArt: _image, coverNone: _none, ...gone } = entry.book;
    const before = trash;
    trash = [
      { ...bookFileContent(gone, entry.unknown), deletedAt: new Date(now()).toISOString() },
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

  function setCover(id: string, cover: BookCoverArt | null): boolean {
    beforeChange();
    const entry = isBookId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    const book: Book = { ...entry.book };
    if (cover) {
      book.coverArt = { ...cover };
      delete book.coverNone;
    } else delete book.coverArt;
    writeEntry(id, { book, unknown: entry.unknown }, entry);
    return true;
  }

  function setCoverNone(id: string, at: string | null): boolean {
    beforeChange();
    const entry = isBookId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    if ((entry.book.coverNone ?? null) === at) return true;
    const book: Book = { ...entry.book };
    if (at) book.coverNone = at;
    else delete book.coverNone;
    writeEntry(id, { book, unknown: entry.unknown }, entry);
    return true;
  }

  return {
    file: () => file,
    books: () => [...entries.values()].map((e) => e.book),
    get: (id) => entries.get(id)?.book,
    problems: () => [...problems],
    check,
    save,
    remove,
    setCover,
    setCoverNone,
    readWhole: () => {
      check();
      return signature !== 'none' && !damaged && !tooBig;
    },
  };
}
