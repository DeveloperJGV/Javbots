import type {
  LibrosCoverCandidate,
  LibrosCoverProgress,
  LibrosCoverReason,
  LibrosCoverState,
} from '../../../core/src/messages.js';
import type { CoverFiles, StagedCover } from '../../coleccion/server/covers/coverFiles.js';
import { runSearches } from '../../libros/core/cover.js';
import { isbn13 } from '../../libros/core/isbn.js';
import { pickCandidates } from '../../libros/core/lookup.js';
import type { OpenLibrary } from '../../libros/server/covers/openLibrary.js';
import { aniScore } from '../core/lookup.js';
import type { ComicCoverArt, Series } from '../core/types.js';
import type { AniList } from './aniList.js';
import type { ComicsStore } from './comicsStore.js';

/** A problem said to the person (no address, no library message). */
export class CoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverError';
  }
}

const CANDIDATES_MAX = 4;

/** One cover offered: what fetches it again ("isbn:…", "id:…" or "al:<id>" with its image address) and its name. */
interface Candidate {
  key: string;
  url: string;
  label: string;
  year: number;
  byIsbn: boolean;
}

interface Search {
  state: LibrosCoverState;
  candidates: Candidate[];
}

export interface ComicCoverService {
  find(id: string, manual: boolean): Promise<void>;
  startRun(): Promise<void>;
  stopRun(): void;
  progress(): LibrosCoverProgress | undefined;
  states(): LibrosCoverState[];
  pick(id: string, n: number, stamp: string): Promise<void>;
  dismiss(id: string, stamp: string): void;
  remove(id: string): void;
  upload(id: string, bytes: Uint8Array): ComicCoverArt;
  candidateImage(id: string, n: number): Promise<{ bytes: Uint8Array; type: string } | null>;
  seriesChanged(id: string, lostCover: boolean): void;
  forget(id: string): void;
}

let counter = 0;
const newStamp = (now: number) => `${now.toString(36)}-${++counter}`;

/** The ISBN a series' cover is looked up by: its lowest-numbered volume with a valid one. */
export function seriesIsbn(s: Pick<Series, 'volumes'>): string | null {
  for (const v of [...s.volumes].sort((a, b) => a.number - b.number)) {
    const isbn = v.isbn ? isbn13(v.isbn) : null;
    if (isbn) return isbn;
  }
  return null;
}

/**
 * A series' cover: by a volume's ISBN in Open Library (the only one set without asking); else AniList (manga) and
 * Open Library (comics) by title, which only offer. A copy of features/libros/server/covers/coverService.ts with
 * the sources a series has.
 */
export function createComicCoverService(opts: {
  store: ComicsStore;
  files: CoverFiles;
  ol: OpenLibrary;
  ani: AniList;
  now: () => number;
  onChange: () => void;
}): ComicCoverService {
  const { store, files, ol, ani, now } = opts;
  const searches = new Map<string, Search>();
  const busy = new Set<string>();
  let run: LibrosCoverProgress | undefined;
  let stopAsked = false;

  const iso = () => new Date(now()).toISOString();
  const setState = (
    id: string,
    state: Omit<LibrosCoverState, 'id' | 'at'>,
    candidates: Candidate[] = [],
  ) => {
    searches.set(id, { state: { id, at: iso(), ...state }, candidates });
    opts.onChange();
  };
  const nothing = (id: string, reason: LibrosCoverReason) =>
    setState(id, { state: 'nada', stamp: newStamp(now()), reason });

  function setCover(
    id: string,
    bytes: Uint8Array,
    source: ComicCoverArt['source'],
    key: string,
  ): ComicCoverArt {
    const staged: StagedCover = files.stage(id, bytes);
    const art: ComicCoverArt = { source, key, at: iso(), type: staged.type };
    try {
      if (!store.setCover(id, art)) throw new CoverError('No encontré esa serie.');
    } catch (err) {
      files.discard(staged);
      throw err;
    }
    files.commit(staged);
    files.clearCandidates(id);
    return art;
  }

  async function find(id: string, manual: boolean): Promise<void> {
    store.check();
    const s = store.get(id);
    if (!s || busy.has(id)) return;
    busy.add(id);
    try {
      if (manual && s.coverNone) store.setCoverNone(id, null);
      setState(id, { state: 'buscando', stamp: newStamp(now()) });
      files.clearCandidates(id);
      const candidates: Candidate[] = [];
      let failed = false;
      const add = (c: Candidate) => {
        if (candidates.length < CANDIDATES_MAX && !candidates.some((x) => x.key === c.key))
          candidates.push(c);
      };

      const isbn = seriesIsbn(s);
      if (isbn) {
        try {
          const bytes = await ol.isbnCover(isbn, 'L');
          if (bytes) {
            if (!s.coverArt) {
              setCover(id, bytes, 'openlibrary', `isbn:${isbn}`);
              setState(id, { state: 'encontrada', stamp: newStamp(now()), label: s.title });
              return;
            }
            add({
              key: `isbn:${isbn}`,
              url: '',
              label: 'La del ISBN de un tomo',
              year: 0,
              byIsbn: true,
            });
          }
        } catch {
          failed = true;
        }
      }
      if (s.kind !== 'comic' && s.kind !== 'novela-grafica') {
        try {
          const docs = (await ani.search(s.title))
            .filter((d) => d.coverUrl && aniScore(s.title, d) > 0)
            .sort((a, b) => aniScore(s.title, b) - aniScore(s.title, a));
          for (const d of docs)
            add({
              key: `al:${d.id}`,
              url: d.coverUrl,
              label: d.writers.length
                ? `${d.title} · ${d.writers.slice(0, 2).join(', ')}`
                : d.title,
              year: d.year,
              byIsbn: false,
            });
        } catch {
          failed = true;
        }
      }
      if (s.kind !== 'manga' && candidates.length < CANDIDATES_MAX) {
        try {
          const docs = await ol.search(s.title, s.writers[0] ?? '');
          for (const d of pickCandidates(
            { title: s.title, authors: s.writers },
            docs,
            CANDIDATES_MAX,
          ))
            add({
              key: `id:${d.coverId}`,
              url: '',
              label: d.authors.length
                ? `${d.title} · ${d.authors.slice(0, 2).join(', ')}`
                : d.title,
              year: d.year,
              byIsbn: false,
            });
        } catch {
          failed = true;
        }
      }
      if (!candidates.length) {
        nothing(id, failed ? 'sin-respuesta' : 'sin-coincidencia');
        return;
      }
      const current = store.get(id)?.coverArt?.key;
      const wire: LibrosCoverCandidate[] = candidates.map((c) => ({
        label: c.label,
        year: c.year,
        ...(c.byIsbn ? { byIsbn: true } : {}),
        ...(current && c.key === current ? { current: true } : {}),
      }));
      setState(id, { state: 'elige', stamp: newStamp(now()), candidates: wire }, candidates);
    } catch {
      nothing(id, 'sin-respuesta');
    } finally {
      busy.delete(id);
    }
  }

  async function startRun(): Promise<void> {
    if (run?.running) return;
    store.check();
    const ids = store
      .list()
      .filter((s) => runSearches({ ...s, wanted: false }, searches.get(s.id)?.state))
      .map((s) => s.id);
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
    opts.onChange();
    for (const id of ids) {
      if (stopAsked) break;
      await find(id, false);
      const st = searches.get(id)?.state;
      run.done++;
      if (st?.state === 'encontrada') run.found++;
      else if (st?.state === 'elige') run.choose++;
      else if (st?.reason === 'sin-respuesta') run.failed++;
      else run.notFound++;
      opts.onChange();
    }
    run = { ...run, running: false, stopped: stopAsked, finishedAt: iso() };
    opts.onChange();
  }

  function choice(id: string, stamp: string): Search {
    const s = searches.get(id);
    if (!s || s.state.state !== 'elige' || s.state.stamp !== stamp)
      throw new CoverError('Esa elección ya no está; busca otra vez.');
    return s;
  }

  async function fetchCandidate(c: Candidate, size: 'M' | 'L'): Promise<Uint8Array> {
    const [kind, value] = c.key.split(':');
    if (kind === 'al') return ani.image(c.url);
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
          : new CoverError('La fuente no contestó; intenta otra vez.');
      }
      choice(id, stamp);
      setCover(id, bytes, c.key.startsWith('al:') ? 'anilist' : 'openlibrary', c.key);
      searches.set(id, {
        state: { id, at: iso(), state: 'encontrada', stamp: newStamp(now()), label: c.label },
        candidates: [],
      });
    },

    dismiss(id, stamp) {
      choice(id, stamp);
      const s = store.get(id);
      if (!s) throw new CoverError('No encontré esa serie.');
      if (!s.coverArt) store.setCoverNone(id, iso());
      searches.delete(id);
      files.clearCandidates(id);
    },

    remove(id) {
      if (!store.get(id)) throw new CoverError('No encontré esa serie.');
      store.setCover(id, null);
      files.remove(id);
      searches.delete(id);
    },

    upload(id, bytes) {
      store.check();
      if (!store.get(id)) throw new CoverError('No encontré esa serie.');
      const art = setCover(id, bytes, 'subida', '');
      searches.delete(id);
      return art;
    },

    async candidateImage(id, n) {
      const s = searches.get(id);
      const c = s?.state.state === 'elige' ? s.candidates[n] : undefined;
      if (!c) return null;
      const cached = files.readCandidate(id, n);
      if (cached) return { bytes: cached.bytes, type: cached.type };
      const bytes = await fetchCandidate(c, 'M');
      const type = files.saveCandidate(id, n, bytes);
      return { bytes, type };
    },

    seriesChanged(id, lostCover) {
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
