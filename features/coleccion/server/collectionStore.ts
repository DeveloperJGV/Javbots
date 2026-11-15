import * as fs from 'fs';
import * as path from 'path';

import { COLLECTION_FILE_VERSION, GAMES_MAX, TRASH_MAX } from '../core/constants.js';
import {
  gameFileContent,
  isGameId,
  isoDay,
  mergeSave,
  newGameId,
  normalizeGame,
  readCollection,
} from '../core/game.js';
import type { Game } from '../core/types.js';
import { COLLECTION_FILE, DAMAGED_PREFIX, FILE_MAX_BYTES, ID_TRIES } from './constants.js';

export interface CollectionStoreOptions {
  /** The office folder (~/.pixel-agents). */
  pixelDir: string;
  now?: () => number;
  random?: () => number;
}

export interface CollectionStore {
  file(): string;
  games(): Game[];
  get(id: string): Game | undefined;
  /** What could not be read, in Spanish. */
  problems(): string[];
  /** Reads the file again if it changed since the last read (or was never read); true when it did. */
  check(): boolean;
  /** Writes the game (a new id when it has none or an unknown one) and returns it as saved. Throws on failure. */
  save(input: unknown): Game;
  /** Takes the game out (it stays in the file's trash). False when there was no such game. */
  remove(id: string): boolean;
}

interface Entry {
  game: Game;
  unknown: Record<string, unknown>;
}

/** The whole collection in one JSON file, written atomically (tmp + rename), with a size cap. */
export function createCollectionStore(opts: CollectionStoreOptions): CollectionStore {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  const file = path.join(opts.pixelDir, COLLECTION_FILE);
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
        `${COLLECTION_FILE} pesa ${(size / 1024 / 1024).toFixed(1)} MB (el tope es ${FILE_MAX_BYTES / 1024 / 1024} MB): no lo leo ni escribo encima.`,
      );
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      damaged = true;
      problems.push(
        `${COLLECTION_FILE} no se pudo leer (${(err as Error).message}). Al guardar, se aparta como copia y empieza uno nuevo.`,
      );
      return;
    }
    const result = readCollection(raw, isoDay(now()));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) damaged = true;
    const version = (raw as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > COLLECTION_FILE_VERSION)
      problems.push(
        `${COLLECTION_FILE} es de una versión más nueva (${version}); se conservan los campos que no conozco.`,
      );
    for (const r of result.games) entries.set(r.game.id, { game: r.game, unknown: r.unknown });
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
      version: COLLECTION_FILE_VERSION,
      ...topUnknown,
      games: [...entries.values()].map((e) => gameFileContent(e.game, e.unknown)),
      trash,
    };
    const text = `${JSON.stringify(content, null, 2)}\n`;
    if (Buffer.byteLength(text) > FILE_MAX_BYTES)
      throw new Error('la colección pasaría del tamaño máximo del archivo');
    fs.mkdirSync(opts.pixelDir, { recursive: true });
    if (damaged && fs.existsSync(file)) {
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(file, path.join(opts.pixelDir, `${DAMAGED_PREFIX}${stamp}.json`));
      damaged = false;
    }
    const tmp = path.join(opts.pixelDir, `.${COLLECTION_FILE}.${process.pid}.${now()}.tmp`);
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
    if (tooBig) throw new Error('el archivo de la colección es demasiado grande');
  }

  function save(input: unknown): Game {
    beforeChange();
    const today = isoDay(now());
    const read = normalizeGame(input, today);
    if (!read) throw new Error('no es un juego');
    const askedId = (input as { id?: unknown }).id;
    const previous = isGameId(askedId) ? entries.get(askedId) : undefined;
    if (!previous && entries.size >= GAMES_MAX)
      throw new Error(`la colección ya tiene ${GAMES_MAX} juegos`);
    const game = mergeSave(previous?.game, read.game, today, new Date(now()).toISOString());
    if (!previous) {
      // A free id; a bounded number of tries, so a broken random source fails instead of hanging
      let id = '';
      for (let i = 0; i < ID_TRIES && (!id || entries.has(id)); i++) id = newGameId(random);
      if (entries.has(id)) throw new Error('no encontré un id libre para el juego');
      game.id = id;
    }
    // Fields a newer version (or a person) added stay as they were
    entries.set(game.id, { game, unknown: { ...previous?.unknown, ...read.unknown } });
    write();
    return game;
  }

  function remove(id: string): boolean {
    beforeChange();
    const entry = isGameId(id) ? entries.get(id) : undefined;
    if (!entry) return false;
    entries.delete(id);
    trash = [
      { ...gameFileContent(entry.game, entry.unknown), deletedAt: new Date(now()).toISOString() },
      ...trash,
    ].slice(0, TRASH_MAX);
    write();
    return true;
  }

  return {
    file: () => file,
    games: () => [...entries.values()].map((e) => e.game),
    get: (id) => entries.get(id)?.game,
    problems: () => [...problems],
    check,
    save,
    remove,
  };
}
