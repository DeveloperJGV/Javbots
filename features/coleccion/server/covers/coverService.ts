import type {
  ColeccionCoverProgress,
  ColeccionCoverReason,
  ColeccionCoverState,
  ColeccionCoverStateKind,
} from '../../../../core/src/messages.js';
import { type CoverArt, type CoverType, runSearches } from '../../core/cover.js';
import { COVER_CANDIDATES_MAX, sameCoverTitle } from '../../core/coverMatch.js';
import type { Game } from '../../core/types.js';
import type { CollectionStore } from '../collectionStore.js';
import { type CoverFiles, ImageError } from './coverFiles.js';
import type { Candidate, CoverSource, SearchOutcome } from './types.js';

export interface CoverServiceOptions {
  store: CollectionStore;
  files: CoverFiles;
  libretro: CoverSource;
  igdb: CoverSource;
  /** An IGDB key is saved. */
  hasKey: () => boolean;
  now: () => number;
  /** Something the page shows changed (a search started or ended, the run moved, a cover was set). */
  onChange: () => void;
}

interface SearchRecord {
  state: ColeccionCoverState;
  candidates: Candidate[];
  /** The game the search was for: a result for another title or console is never used. */
  title: string;
  platform: string;
}

/** A user-facing problem (Spanish), safe to send to the page. */
export class CoverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverError';
  }
}

const idleRun = (): ColeccionCoverProgress => ({
  running: false,
  stopped: false,
  total: 0,
  done: 0,
  found: 0,
  choose: 0,
  notFound: 0,
  failed: 0,
  skipped: 0,
  reasons: [],
});

export interface CoverService {
  /**
   * Looks for one game's cover; resolves with how it ended (null when it was not searched). `byHand`: the person
   * asked for it (its «Ninguna» is forgotten). A game that already has a cover always ends in a choice.
   */
  find(id: string, byHand?: boolean): Promise<ColeccionCoverStateKind | null>;
  /** "Buscar las que faltan": every game without a cover that is not settled, one after the other. */
  startRun(): Promise<void>;
  stopRun(): void;
  progress(): ColeccionCoverProgress;
  /** The last search of each game that still exists. */
  states(): ColeccionCoverState[];
  /** Candidate n of the game's last "elige" search becomes its cover. Throws CoverError. */
  pick(id: string, n: number, stamp: string): Promise<void>;
  /** Closes the game's "elige" search: «Ninguna» (kept) without a cover, «keep this one» with one. Throws CoverError. */
  dismiss(id: string, stamp: string): void;
  /** An uploaded image becomes the game's cover. Throws ImageError / CoverError. */
  upload(id: string, bytes: Uint8Array): CoverArt;
  /** The game's cover and its search are gone. */
  remove(id: string): void;
  /** The game was deleted: its image, candidates and search go too. */
  forget(id: string): void;
  /**
   * The game was saved with another title or console: its search no longer applies, and `coverDropped` (the store
   * took away a cover a source found for the old one) deletes the image and says it must be searched again.
   */
  gameChanged(id: string, coverDropped: boolean): void;
  /** Thumbnail n of the game's "elige" search, fetched from its source the first time. Null when there is none. */
  candidateImage(id: string, n: number): Promise<{ bytes: Uint8Array; type: CoverType } | null>;
}

/** The same game a search was made for: it still exists, with the same title and console. */
function sameGame(game: Game | undefined, rec: { title: string; platform: string }): boolean {
  return !!game && game.platform === rec.platform && sameCoverTitle(game.title, rec.title);
}

/** A source that did not answer leaves no doubt behind: «no contestó», never «no hubo coincidencia». */
const noAnswer = (r: SearchOutcome) => r.kind === 'none' && r.reason === 'sin-respuesta';

type Lookup = { outcome: SearchOutcome; needsKey: boolean };

export function createCoverService(o: CoverServiceOptions): CoverService {
  const searches = new Map<string, SearchRecord>();
  const busy = new Set<string>();
  const thumbs = new Map<string, Promise<{ bytes: Uint8Array; type: CoverType } | null>>();
  let counter = 0;
  let run = idleRun();
  let stopAsked = false;
  const iso = () => new Date(o.now()).toISOString();
  const newStamp = () => `${o.now().toString(36)}${(++counter).toString(36)}`;
  const sourceOf = (c: Candidate) => (c.source === 'igdb' ? o.igdb : o.libretro);
  const current = (id: string, stamp: string) => searches.get(id)?.state.stamp === stamp;
  /** Tells the page; a failing broadcast never breaks a search or the run. */
  const notify = () => {
    try {
      o.onChange();
    } catch {
      // The next change sends everything again
    }
  };

  /**
   * The image becomes the game's cover: written aside, then the collection, and only then the old image goes. When
   * the collection cannot be written, the game keeps the cover (and the image) it had. Throws ImageError (the
   * bytes), CoverError (no such game) or Error (a write failed).
   */
  function setImage(
    id: string,
    bytes: Uint8Array,
    from: Pick<CoverArt, 'source' | 'key'>,
  ): CoverArt {
    const staged = o.files.stage(id, bytes);
    const cover: CoverArt = { ...from, at: iso(), type: staged.type };
    let ok: boolean;
    try {
      ok = o.store.setCover(id, cover);
    } catch {
      o.files.discard(staged);
      throw new Error('no se pudo guardar la colección; la portada de antes sigue igual');
    }
    if (!ok) {
      o.files.discard(staged);
      throw new CoverError('No encontré ese juego.');
    }
    try {
      o.files.commit(staged);
    } catch {
      o.files.discard(staged);
      throw new Error('no se pudo guardar la imagen');
    }
    return cover;
  }

  /** libretro first; IGDB for consoles libretro lacks or barely has, and for what libretro did not find. */
  async function lookup(game: Game): Promise<Lookup> {
    const lib = o.libretro.covers(game.platform);
    let first: SearchOutcome | null = null;
    if (lib !== false) {
      first = await o.libretro.search(game.title, game.platform, game.region);
      if (first.kind === 'found') return { outcome: first, needsKey: false };
      if (first.kind === 'choose' && lib === true) return { outcome: first, needsKey: false };
    }
    const failed = !!first && noAnswer(first);
    const fromFirst = first?.kind === 'choose' ? first.candidates : [];
    if (!o.igdb.covers(game.platform)) {
      if (first) return { outcome: first, needsKey: false };
      return { outcome: { kind: 'none', reason: 'sin-cobertura' }, needsKey: false };
    }
    if (!o.hasKey()) {
      if (first?.kind === 'choose') return { outcome: first, needsKey: true };
      let reason: ColeccionCoverReason = 'sin-llave';
      if (first?.kind === 'none')
        reason = failed ? 'sin-respuesta' : lib === 'pocas' ? 'pocas' : first.reason;
      return { outcome: { kind: 'none', reason }, needsKey: true };
    }
    const second = await o.igdb.search(game.title, game.platform, game.region);
    if (second.kind === 'found') return { outcome: second, needsKey: false };
    if (second.kind === 'choose')
      return {
        outcome: {
          kind: 'choose',
          candidates: [...fromFirst, ...second.candidates].slice(0, COVER_CANDIDATES_MAX),
        },
        needsKey: false,
      };
    if (first?.kind === 'choose') return { outcome: first, needsKey: false };
    // libretro did not answer: IGDB's «nothing» does not mean it is not there
    if (failed || noAnswer(second))
      return { outcome: { kind: 'none', reason: 'sin-respuesta' }, needsKey: false };
    return { outcome: second, needsKey: second.reason === 'sin-llave' };
  }

  /**
   * «Cambiar» on a game that has a cover: every source that applies, everything that could be it, for the person to
   * choose (the current one marked and first). Never set on its own.
   */
  async function lookupAll(game: Game): Promise<Lookup> {
    const all: Candidate[] = [];
    let failed = false;
    let needsKey = false;
    const take = (r: SearchOutcome) => {
      if (r.kind === 'found') all.push(r.candidate, ...(r.others ?? []));
      else if (r.kind === 'choose') all.push(...r.candidates);
      else if (r.reason === 'sin-respuesta') failed = true;
    };
    const lib = o.libretro.covers(game.platform);
    if (lib !== false) take(await o.libretro.search(game.title, game.platform, game.region, true));
    const igdb = o.igdb.covers(game.platform);
    if (igdb) {
      if (o.hasKey()) take(await o.igdb.search(game.title, game.platform, game.region, true));
      else needsKey = true;
    }
    const art = game.coverArt;
    const isCurrent = (c: Candidate) => !!art && art.source === c.source && art.key === c.key;
    const unique = [...new Map(all.map((c) => [`${c.source}|${c.key}`, c])).values()];
    const list = [...unique.filter(isCurrent), ...unique.filter((c) => !isCurrent(c))].slice(
      0,
      COVER_CANDIDATES_MAX,
    );
    if (list.length > 0) return { outcome: { kind: 'choose', candidates: list }, needsKey };
    const reason: ColeccionCoverReason = failed
      ? 'sin-respuesta'
      : lib === false && !igdb
        ? 'sin-cobertura'
        : needsKey && lib !== true
          ? lib === 'pocas'
            ? 'pocas'
            : 'sin-llave'
          : 'sin-coincidencia';
    return { outcome: { kind: 'none', reason }, needsKey };
  }

  /** Downloads a candidate's full image and makes it the game's cover. False when it could not. */
  async function apply(game: Game, c: Candidate, stamp: string): Promise<boolean> {
    let bytes: Uint8Array;
    try {
      bytes = await sourceOf(c).image(c, game.platform, 'full');
    } catch {
      return false;
    }
    // While it downloaded, the game may have gone or changed, or the person uploaded, removed or searched again:
    // theirs wins
    const now = o.store.get(game.id);
    if (!sameGame(now, game) || !current(game.id, stamp) || now?.coverArt) return false;
    try {
      setImage(game.id, bytes, { source: c.source, key: c.key });
      return true;
    } catch {
      return false;
    }
  }

  const record = (
    game: Pick<Game, 'title' | 'platform'>,
    state: ColeccionCoverState,
    candidates: Candidate[] = [],
  ): SearchRecord => ({ state, candidates, title: game.title, platform: game.platform });

  /** Forgets the thumbnails being fetched for a game (a new search, a pick, a removal). */
  function thumbsOf(id: string): void {
    for (const k of [...thumbs.keys()]) if (k.startsWith(`${id}|`)) thumbs.delete(k);
  }

  async function find(id: string, byHand = false): Promise<ColeccionCoverStateKind | null> {
    let game = o.store.get(id);
    if (!game || busy.has(id)) return null;
    busy.add(id);
    const stamp = newStamp();
    let rec: SearchRecord = record(game, { id, state: 'buscando', stamp, at: iso() });
    try {
      // Asked by hand: an old «Ninguna» no longer holds
      if (byHand && game.coverNone) {
        o.store.setCoverNone(id, null);
        game = o.store.get(id) ?? game;
      }
      searches.set(id, rec);
      thumbsOf(id);
      notify();
      o.files.clearCandidates(id);
      const searched = game;
      const { outcome, needsKey } = searched.coverArt
        ? await lookupAll(searched)
        : await lookup(searched);
      const base = { id, stamp, at: iso(), ...(needsKey ? { needsKey } : {}) };
      const art = searched.coverArt;
      if (outcome.kind === 'found') {
        const ok = await apply(searched, outcome.candidate, stamp);
        rec = record(
          searched,
          ok
            ? {
                ...base,
                state: 'encontrada',
                source: outcome.candidate.source,
                label: outcome.candidate.label,
              }
            : { ...base, state: 'nada', reason: 'sin-respuesta' },
        );
      } else if (outcome.kind === 'choose') {
        rec = record(
          searched,
          {
            ...base,
            state: 'elige',
            candidates: outcome.candidates.map((c) => ({
              source: c.source,
              label: c.label,
              region: c.region,
              ...(art && art.source === c.source && art.key === c.key ? { current: true } : {}),
            })),
          },
          outcome.candidates,
        );
      } else {
        rec = record(searched, { ...base, state: 'nada', reason: outcome.reason });
      }
    } catch {
      rec = record(game, { id, stamp, at: iso(), state: 'nada', reason: 'sin-respuesta' });
    } finally {
      busy.delete(id);
    }
    // Kept only while it is still the game's last search, for the same game
    if (current(id, stamp)) {
      if (sameGame(o.store.get(id), rec)) searches.set(id, rec);
      else searches.delete(id);
    }
    notify();
    return rec.state.state;
  }

  async function startRun(): Promise<void> {
    if (run.running) return;
    const owned = o.store.games().filter((g) => !g.wanted && !g.coverArt);
    const ids = owned
      .filter((g) => runSearches(g, searches.get(g.id)?.state, o.hasKey()))
      .map((g) => g.id);
    stopAsked = false;
    run = {
      ...idleRun(),
      running: true,
      total: ids.length,
      skipped: owned.length - ids.length,
      startedAt: iso(),
    };
    const reasons = new Map<string, number>();
    notify();
    try {
      for (const id of ids) {
        if (stopAsked) break;
        const game = o.store.get(id);
        const kind = game && !game.coverArt ? await find(id) : null;
        if (kind === null) {
          // Gone, covered meanwhile, or already being searched by its own button
          run.total = Math.max(run.done, run.total - 1);
        } else {
          run.done++;
          if (kind === 'encontrada') run.found++;
          else if (kind === 'elige') run.choose++;
          else {
            const reason = searches.get(id)?.state.reason ?? 'sin-respuesta';
            // «No contestó» is not a search: counted apart, and the next run tries it again
            if (reason === 'sin-respuesta') run.failed++;
            else run.notFound++;
            reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
            run.reasons = [...reasons].map(([r, count]) => ({ reason: r, count }));
          }
        }
        notify();
      }
    } finally {
      run = { ...run, running: false, stopped: stopAsked, finishedAt: iso() };
      notify();
    }
  }

  function candidateOf(id: string, n: number, stamp?: string): SearchRecord & { c: Candidate } {
    const rec = searches.get(id);
    if (!rec || rec.state.state !== 'elige')
      throw new CoverError('Ese juego no tiene portadas para elegir; búscala otra vez.');
    if (stamp !== undefined && rec.state.stamp !== stamp)
      throw new CoverError('La búsqueda cambió; elige otra vez.');
    if (!sameGame(o.store.get(id), rec))
      throw new CoverError('El juego cambió de nombre o de consola; búscala otra vez.');
    const c = Number.isInteger(n) ? rec.candidates[n] : undefined;
    if (!c) throw new CoverError('Esa portada no está en la lista.');
    return { ...rec, c };
  }

  /** The search is over: its record, its thumbnails and their downloads go. */
  function closeSearch(id: string): void {
    searches.delete(id);
    thumbsOf(id);
    o.files.clearCandidates(id);
  }

  return {
    find,
    startRun,
    stopRun() {
      if (run.running) stopAsked = true;
    },
    progress: () => ({ ...run, reasons: run.reasons.map((r) => ({ ...r })) }),

    states() {
      const out: ColeccionCoverState[] = [];
      for (const [id, rec] of searches) if (o.store.get(id)) out.push({ ...rec.state });
      return out;
    },

    async pick(id, n, stamp) {
      const { c, platform, title } = candidateOf(id, n, stamp);
      // libretro's thumbnail is the full image: reuse it when it was already fetched
      const cached = c.source === 'libretro' ? o.files.readCandidate(id, n) : null;
      let bytes: Uint8Array;
      if (cached) bytes = cached.bytes;
      else {
        try {
          bytes = await sourceOf(c).image(c, platform, 'full');
        } catch {
          throw new CoverError('La fuente no contestó; prueba otra vez en un rato.');
        }
      }
      if (!current(id, stamp) || !sameGame(o.store.get(id), { title, platform }))
        throw new CoverError('La búsqueda cambió; elige otra vez.');
      try {
        setImage(id, bytes, { source: c.source, key: c.key });
      } catch (err) {
        if (err instanceof ImageError)
          throw new CoverError('Lo que mandó la fuente no es una imagen que pueda usar.');
        throw err instanceof CoverError
          ? err
          : new CoverError('no se pudo guardar; la portada de antes sigue igual');
      }
      closeSearch(id);
      notify();
    },

    dismiss(id, stamp) {
      const rec = searches.get(id);
      if (!rec || rec.state.state !== 'elige' || rec.state.stamp !== stamp)
        throw new CoverError('La búsqueda cambió; ábrela otra vez.');
      const game = o.store.get(id);
      if (!game) throw new CoverError('No encontré ese juego.');
      // With a cover it only means «keep this one»; without, «Ninguna» is kept so the run leaves it alone
      if (!game.coverArt) {
        try {
          o.store.setCoverNone(id, iso());
        } catch {
          throw new CoverError('no se pudo guardar la colección');
        }
      }
      closeSearch(id);
      notify();
    },

    upload(id, bytes) {
      if (!o.store.get(id)) throw new CoverError('No encontré ese juego.');
      const cover = setImage(id, bytes, { source: 'subida', key: '' });
      closeSearch(id);
      notify();
      return cover;
    },

    remove(id) {
      if (!o.store.get(id)) throw new CoverError('No encontré ese juego.');
      // The collection first: if it cannot be written, the image it points to is still there
      if (!o.store.setCover(id, null)) throw new CoverError('No encontré ese juego.');
      o.files.remove(id);
      closeSearch(id);
      notify();
    },

    forget(id) {
      o.files.remove(id);
      searches.delete(id);
      thumbsOf(id);
    },

    gameChanged(id, coverDropped) {
      const game = o.store.get(id);
      closeSearch(id);
      if (coverDropped) o.files.remove(id);
      if (game && coverDropped)
        searches.set(
          id,
          record(game, { id, state: 'nada', reason: 'cambio', stamp: newStamp(), at: iso() }),
        );
      notify();
    },

    candidateImage(id, n) {
      let found: SearchRecord & { c: Candidate };
      try {
        found = candidateOf(id, n);
      } catch {
        return Promise.resolve(null);
      }
      const stamp = found.state.stamp;
      // Two requests for the same thumbnail share one download
      const key = `${id}|${n}|${stamp}`;
      const pending = thumbs.get(key);
      if (pending) return pending;
      const job = (async () => {
        const cached = o.files.readCandidate(id, n);
        if (cached) return cached;
        const bytes = await sourceOf(found.c).image(found.c, found.platform, 'thumb');
        if (!current(id, stamp) || !sameGame(o.store.get(id), found)) return null;
        const type = o.files.saveCandidate(id, n, bytes);
        return { bytes, type };
      })();
      thumbs.set(key, job);
      // Shared while it downloads; once done, the file on disk answers the next ones
      const drop = () => {
        if (thumbs.get(key) === job) thumbs.delete(key);
      };
      job.then(drop, drop);
      return job;
    },
  };
}
