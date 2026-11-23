import type {
  LibrosCoverCandidate,
  LibrosCoverProgress,
  LibrosCoverReason,
  LibrosCoverState,
} from '../../../../core/src/messages.js';
import type { CoverFiles, StagedCover } from '../../../coleccion/server/covers/coverFiles.js';
import { runSearches } from '../../core/cover.js';
import { isbn13 } from '../../core/isbn.js';
import { pickCandidates } from '../../core/lookup.js';
import { fold } from '../../core/shelves.js';
import type { Book, BookCoverArt } from '../../core/types.js';
import type { LibraryStore } from '../libraryStore.js';
import { CANDIDATES_MAX } from './constants.js';
import type { OpenLibrary } from './openLibrary.js';

/** A problem said to the person (no address, no library message). */
export class CoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverError';
  }
}

/** One cover offered in «elige una»: what fetches it again ("isbn:<isbn>" or "id:<cover id>") and its name. */
interface Candidate {
  key: string;
  label: string;
  year: number;
  byIsbn: boolean;
}

interface Search {
  state: LibrosCoverState;
  candidates: Candidate[];
  /** The cover the book had when the choice was offered («at», or ""): picking checks it did not change. */
  coverAt?: string;
}

export interface CoverService {
  /** Looks for one book's cover. `manual` = from its own button (a «Ninguna» is forgotten). Never throws. */
  find(id: string, manual: boolean): Promise<void>;
  startRun(): Promise<void>;
  stopRun(): void;
  progress(): LibrosCoverProgress | undefined;
  states(): LibrosCoverState[];
  /** Sets candidate n of the last «elige una» (its stamp must match). Throws CoverError. */
  pick(id: string, n: number, stamp: string): Promise<void>;
  /** «Ninguna» (no cover yet) or «Dejar la que tiene». Throws CoverError. */
  dismiss(id: string, stamp: string): void;
  /** Takes the cover away and deletes its image. Throws CoverError. */
  remove(id: string): void;
  /** An uploaded image becomes the cover. Throws ImageError or CoverError. */
  upload(id: string, bytes: Uint8Array): BookCoverArt;
  /** The thumbnail of candidate n (cached on disk while the choice lasts); null when there is no such one. */
  candidateImage(id: string, n: number): Promise<{ bytes: Uint8Array; type: string } | null>;
  /** The book was saved with another title, first author or ISBN: its search no longer fits. */
  bookChanged(id: string, lostCover: boolean): void;
  /** The book is gone: its image and search too. */
  forget(id: string): void;
}

let counter = 0;
const newStamp = (now: number) => `${now.toString(36)}-${++counter}`;

/** The ISBN a cover search uses: the ISBN-13 when it is valid (Open Library knows both), else none. */
const searchIsbn = (isbn: string) => (isbn ? isbn13(isbn) : null);

export function createCoverService(opts: {
  store: LibraryStore;
  files: CoverFiles;
  ol: OpenLibrary;
  now: () => number;
  onChange: () => void;
}): CoverService {
  const { store, files, ol, now } = opts;
  const searches = new Map<string, Search>();
  const busy = new Set<string>();
  let run: LibrosCoverProgress | undefined;
  let stopAsked = false;
  /** Thumbnails downloading, by book, number and search: two requests share one download. */
  const thumbs = new Map<string, Promise<{ bytes: Uint8Array; type: string } | null>>();

  const iso = () => new Date(now()).toISOString();
  /** Tells the pages; one that cannot be told never stops a search or a run halfway. */
  const notify = () => {
    try {
      opts.onChange();
    } catch {
      // The next change tells them again
    }
  };
  /** What a search is made from: when it changes, a search in course no longer fits. */
  const identity = (b: Book) => `${fold(b.title)}|${fold(b.authors[0] ?? '')}|${b.isbn}`;
  const setState = (
    id: string,
    state: Omit<LibrosCoverState, 'id' | 'at'>,
    candidates: Candidate[] = [],
  ) => {
    searches.set(id, { state: { id, at: iso(), ...state }, candidates });
    notify();
  };
  const nothing = (id: string, reason: LibrosCoverReason) =>
    setState(id, { state: 'nada', stamp: newStamp(now()), reason });

  /** Writes a cover: the image aside, then the library, and only then the image takes the old one's place. */
  function setCover(
    id: string,
    bytes: Uint8Array,
    source: BookCoverArt['source'],
    key: string,
  ): BookCoverArt {
    const before = store.get(id)?.coverArt;
    const staged: StagedCover = files.stage(id, bytes);
    const art: BookCoverArt = { source, key, at: iso(), type: staged.type };
    try {
      if (!store.setCover(id, art)) throw new CoverError('No encontré ese libro.');
    } catch (err) {
      files.discard(staged);
      throw err;
    }
    try {
      files.commit(staged);
    } catch {
      // The file says the new one but its image is not there: back to the one it had
      files.discard(staged);
      try {
        store.setCover(id, before ?? null);
      } catch {
        // Nothing more can be done; the next search or upload writes it again
      }
      throw new CoverError('No se pudo guardar la imagen; la portada de antes sigue igual.');
    }
    files.clearCandidates(id);
    return art;
  }

  async function find(id: string, manual: boolean): Promise<void> {
    store.check();
    const book = store.get(id);
    if (!book || book.wanted || busy.has(id)) return;
    busy.add(id);
    // Set once the search starts; until then nothing of it can be stale
    let alive = (): boolean => false;
    try {
      if (manual && book.coverNone) store.setCoverNone(id, null);
      const stamp = newStamp(now());
      setState(id, { state: 'buscando', stamp });
      files.clearCandidates(id);
      const who = identity(book);
      // After every wait: still this search, and still the same book (not deleted, renamed or given another ISBN)
      alive = () => {
        const nowBook = store.get(id);
        return searches.get(id)?.state.stamp === stamp && !!nowBook && identity(nowBook) === who;
      };
      // A search that no longer fits leaves nothing behind
      const drop = () => {
        if (searches.get(id)?.state.stamp === stamp) {
          searches.delete(id);
          notify();
        }
      };
      const candidates: Candidate[] = [];
      let failed = false;

      // 1. Its own ISBN: that edition's cover, the only one ever set without asking
      const isbn = searchIsbn(book.isbn);
      if (isbn) {
        try {
          const bytes = await ol.isbnCover(isbn, 'L');
          if (!alive()) return drop();
          if (bytes) {
            // The cover it has now (one uploaded while this waited is the person's: never replaced)
            if (!store.get(id)?.coverArt) {
              setCover(id, bytes, 'openlibrary', `isbn:${isbn}`);
              setState(id, { state: 'encontrada', stamp: newStamp(now()), label: book.title });
              return;
            }
            candidates.push({
              key: `isbn:${isbn}`,
              label: 'La de su ISBN',
              year: book.year,
              byIsbn: true,
            });
          }
        } catch {
          // An image that does not pass the checks, or no answer: the search by name may still offer some
          failed = true;
        }
      }

      // 2. By title and first author: only ever offered, never set by itself
      try {
        const docs = await ol.search(book.title, book.authors[0] ?? '');
        if (!alive()) return drop();
        for (const d of pickCandidates(book, docs, CANDIDATES_MAX)) {
          if (candidates.length >= CANDIDATES_MAX) break;
          candidates.push({
            key: `id:${d.coverId}`,
            label: d.authors.length ? `${d.title} · ${d.authors.slice(0, 2).join(', ')}` : d.title,
            year: d.year,
            byIsbn: false,
          });
        }
      } catch {
        if (!alive()) return drop();
        failed = true;
      }

      if (!candidates.length) {
        nothing(id, failed ? 'sin-respuesta' : 'sin-coincidencia');
        return;
      }
      const art = store.get(id)?.coverArt;
      const current = art?.key;
      const wire: LibrosCoverCandidate[] = candidates.map((c) => ({
        label: c.label,
        year: c.year,
        ...(c.byIsbn ? { byIsbn: true } : {}),
        ...(current && c.key === current ? { current: true } : {}),
      }));
      setState(id, { state: 'elige', stamp: newStamp(now()), candidates: wire }, candidates);
      const offered = searches.get(id);
      if (offered) offered.coverAt = art?.at ?? '';
    } catch {
      // The library could not be written: say it did not work, try again later
      if (alive()) nothing(id, 'sin-respuesta');
    } finally {
      busy.delete(id);
    }
  }

  async function startRun(): Promise<void> {
    if (run?.running) return;
    store.check();
    const ids = store
      .books()
      .filter((b) => runSearches(b, searches.get(b.id)?.state))
      .map((b) => b.id);
    stopAsked = false;
    run = {
      running: true,
      stopped: false,
      total: ids.length,
      done: 0,
      found: 0,
      choose: 0,
      notFound: 0,
      failed: 0,
      startedAt: iso(),
    };
    notify();
    for (const id of ids) {
      if (stopAsked) break;
      await find(id, false);
      const s = searches.get(id)?.state;
      run.done++;
      if (s?.state === 'encontrada') run.found++;
      else if (s?.state === 'elige') run.choose++;
      else if (s?.reason === 'sin-respuesta') run.failed++;
      else run.notFound++;
      notify();
    }
    run = { ...run, running: false, stopped: stopAsked, finishedAt: iso() };
    notify();
  }

  function choice(id: string, stamp: string): Search {
    const s = searches.get(id);
    if (!s || s.state.state !== 'elige' || s.state.stamp !== stamp)
      throw new CoverError('Esa elección ya no está; busca otra vez.');
    return s;
  }

  async function fetchCandidate(c: Candidate, size: 'M' | 'L'): Promise<Uint8Array> {
    const [kind, value] = c.key.split(':');
    const bytes =
      kind === 'isbn' ? await ol.isbnCover(value, size) : await ol.coverById(value, size);
    if (!bytes) throw new CoverError('Open Library ya no tiene esa portada.');
    return bytes;
  }

  return {
    find,
    startRun,
    stopRun: () => {
      stopAsked = true;
    },
    progress: () => (run ? { ...run } : undefined),
    states: () => [...searches.values()].map((s) => s.state),

    async pick(id, n, stamp) {
      const s = choice(id, stamp);
      const c = s.candidates[n];
      if (!Number.isInteger(n) || !c) throw new CoverError('Esa portada no está en la lista.');
      let bytes: Uint8Array;
      try {
        bytes = await fetchCandidate(c, 'L');
      } catch (err) {
        throw err instanceof CoverError
          ? err
          : new CoverError('Open Library no contestó; intenta otra vez.');
      }
      // Another click, a new search, a change or an upload may have come while it downloaded: theirs wins
      const still = choice(id, stamp);
      if ((store.get(id)?.coverArt?.at ?? '') !== (still.coverAt ?? ''))
        throw new CoverError('La portada cambió mientras bajaba; busca otra vez.');
      setCover(id, bytes, 'openlibrary', c.key);
      searches.set(id, {
        state: { id, at: iso(), state: 'encontrada', stamp: newStamp(now()), label: c.label },
        candidates: [],
      });
    },

    dismiss(id, stamp) {
      choice(id, stamp);
      const book = store.get(id);
      if (!book) throw new CoverError('No encontré ese libro.');
      if (!book.coverArt) store.setCoverNone(id, iso());
      searches.delete(id);
      files.clearCandidates(id);
    },

    remove(id) {
      if (!store.get(id)) throw new CoverError('No encontré ese libro.');
      store.setCover(id, null);
      files.remove(id);
      searches.delete(id);
    },

    upload(id, bytes) {
      store.check();
      if (!store.get(id)) throw new CoverError('No encontré ese libro.');
      const art = setCover(id, bytes, 'subida', '');
      searches.delete(id);
      return art;
    },

    candidateImage(id, n) {
      const s = searches.get(id);
      const c = s?.state.state === 'elige' ? s.candidates[n] : undefined;
      if (!s || !c) return Promise.resolve(null);
      const stamp = s.state.stamp;
      const key = `${id}|${n}|${stamp}`;
      const pending = thumbs.get(key);
      if (pending) return pending;
      const job = (async () => {
        const cached = files.readCandidate(id, n);
        if (cached) return { bytes: cached.bytes, type: cached.type };
        const bytes = await fetchCandidate(c, 'M');
        // Searched again while it downloaded: this thumbnail is not one of the new choice's
        if (searches.get(id)?.state.stamp !== stamp) return null;
        const type = files.saveCandidate(id, n, bytes);
        return { bytes, type };
      })();
      thumbs.set(key, job);
      const drop = () => {
        if (thumbs.get(key) === job) thumbs.delete(key);
      };
      job.then(drop, drop);
      return job;
    },

    bookChanged(id, lostCover) {
      files.clearCandidates(id);
      if (lostCover) {
        files.remove(id);
        nothing(id, 'cambio');
      } else searches.delete(id);
    },

    forget(id) {
      files.remove(id);
      searches.delete(id);
    },
  };
}
