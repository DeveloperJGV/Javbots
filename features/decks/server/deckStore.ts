import * as fs from 'fs';
import * as path from 'path';

import { DECK_FILE_VERSION } from '../core/constants.js';
import { deckFileContent, isDeckId, isoDay, newDeckId, normalizeDeck } from '../core/deck.js';
import type { Deck } from '../core/types.js';
import {
  DECKS_CONFIG_FILE,
  DEFAULT_DECKS_DIR,
  TRASH_DIR,
  WATCH_DEBOUNCE_MS,
  WATCH_POLL_MS,
} from './constants.js';

export interface DeckStoreOptions {
  /** The office folder (~/.pixel-agents). */
  pixelDir: string;
  now?: () => number;
  random?: () => number;
  /** Off in tests: no fs.watch and no polling (they call check() themselves). */
  timers?: boolean;
}

export interface DeckStore {
  folder(): string;
  decks(): Deck[];
  get(id: string): Deck | undefined;
  /** Files that could not be read, and why (in Spanish). */
  problems(): string[];
  /** Reads decks.json and the folder again (also starts watching a new folder). */
  reload(): void;
  /** Writes the deck (a new id when it has none) and returns it as saved. */
  save(deck: Deck): Deck;
  /** Moves the deck file to the folder's trash. False when there was no such deck. */
  remove(id: string): boolean;
  /** Re-reads the folder if something changed it from outside; true when it did. */
  check(): boolean;
  onChange(listener: () => void): () => void;
  dispose(): void;
}

interface Loaded {
  deck: Deck;
  unknown: Record<string, unknown>;
}

/** The deck folder of decks.json, or the default one. */
export function readDecksFolder(pixelDir: string): string {
  const fallback = path.join(pixelDir, DEFAULT_DECKS_DIR);
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(pixelDir, DECKS_CONFIG_FILE), 'utf8')) as {
      folder?: unknown;
    };
    if (typeof raw.folder === 'string' && raw.folder.trim()) {
      const folder = raw.folder.trim();
      return path.isAbsolute(folder) ? folder : path.join(pixelDir, folder);
    }
  } catch {
    // No decks.json (or a broken one): the default folder
  }
  return fallback;
}

/** One deck per `<id>.json` file in a folder; the folder can change from outside at any time. */
export function createDeckStore(opts: DeckStoreOptions): DeckStore {
  const now = opts.now ?? Date.now;
  const random = opts.random ?? Math.random;
  let dir = readDecksFolder(opts.pixelDir);
  let loaded = new Map<string, Loaded>();
  let problems: string[] = [];
  let signature = '';
  const listeners = new Set<() => void>();
  let watcher: fs.FSWatcher | null = null;
  let watchedDir = '';
  let poll: ReturnType<typeof setInterval> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    for (const l of listeners) l();
  };

  /** Names, sizes and times of the deck files: changes when anything in the folder changes. */
  function folderSignature(): string {
    try {
      return fs
        .readdirSync(dir)
        .filter((n) => n.toLowerCase().endsWith('.json'))
        .sort()
        .map((n) => {
          try {
            const st = fs.statSync(path.join(dir, n));
            return `${n}:${st.size}:${st.mtimeMs}`;
          } catch {
            return n;
          }
        })
        .join('|');
    } catch {
      return '';
    }
  }

  function readFolder(): void {
    const next = new Map<string, Loaded>();
    const found: string[] = [];
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json'));
    } catch {
      // No folder yet: no decks
    }
    const today = isoDay(now());
    for (const name of names.sort()) {
      const id = name.slice(0, -'.json'.length);
      if (!isDeckId(id)) {
        found.push(`${name}: el nombre no es un id de deck válido ([a-z0-9], de 4 a 32).`);
        continue;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch (err) {
        found.push(`${name}: no se pudo leer (${(err as Error).message}).`);
        continue;
      }
      const result = normalizeDeck(raw, today);
      if (!result) {
        found.push(`${name}: no es un deck.`);
        continue;
      }
      if (result.deck.id && result.deck.id !== id)
        found.push(`${name}: dice id "${result.deck.id}"; uso el del archivo.`);
      result.deck.id = id;
      for (const p of result.problems) found.push(`${name}: ${p}`);
      next.set(id, { deck: result.deck, unknown: result.unknown });
    }
    loaded = next;
    problems = found;
    signature = folderSignature();
  }

  function stopWatching(): void {
    watcher?.close();
    watcher = null;
    watchedDir = '';
  }

  function scheduleCheck(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      check();
    }, WATCH_DEBOUNCE_MS);
  }

  /** fs.watch is unreliable on Windows: polling backs it up, as everywhere else in the office. */
  function watch(): void {
    if (opts.timers === false) return;
    if (watchedDir !== dir) {
      stopWatching();
      try {
        watcher = fs.watch(dir, scheduleCheck);
        watcher.on('error', () => stopWatching());
        watchedDir = dir;
      } catch {
        // The folder does not exist yet: polling notices when it appears
      }
    }
    if (!poll) {
      poll = setInterval(() => {
        if (!watcher) watch();
        check();
      }, WATCH_POLL_MS);
      poll.unref?.();
    }
  }

  function check(): boolean {
    if (folderSignature() === signature) return false;
    readFolder();
    emit();
    return true;
  }

  function reload(): void {
    dir = readDecksFolder(opts.pixelDir);
    readFolder();
    watch();
  }

  function write(id: string, content: Record<string, unknown>): void {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.json`);
    const tmp = path.join(dir, `.${id}.${process.pid}.${now()}.tmp`);
    fs.writeFileSync(tmp, `${JSON.stringify(content, null, 2)}\n`);
    fs.renameSync(tmp, file);
  }

  function save(input: Deck): Deck {
    const today = isoDay(now());
    const result = normalizeDeck(input, today);
    if (!result) throw new Error('no es un deck');
    const deck = result.deck;
    let id = isDeckId(input.id) ? input.id : '';
    if (!id) {
      do id = newDeckId(random);
      while (loaded.has(id) || fs.existsSync(path.join(dir, `${id}.json`)));
    }
    const previous = loaded.get(id);
    deck.id = id;
    if (previous) deck.createdAt = previous.deck.createdAt;
    deck.updatedAt = new Date(now()).toISOString();
    // Fields a newer version (or a person) added to the file stay as they were
    write(id, deckFileContent(deck, previous?.unknown ?? {}, DECK_FILE_VERSION));
    readFolder();
    emit();
    return loaded.get(id)?.deck ?? deck;
  }

  function remove(id: string): boolean {
    if (!isDeckId(id)) return false;
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) return false;
    const trash = path.join(dir, TRASH_DIR);
    fs.mkdirSync(trash, { recursive: true });
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
    fs.renameSync(file, path.join(trash, `${id}-${stamp}.json`));
    readFolder();
    emit();
    return true;
  }

  return {
    folder: () => dir,
    decks: () => [...loaded.values()].map((l) => l.deck),
    get: (id) => loaded.get(id)?.deck,
    problems: () => [...problems],
    reload,
    save,
    remove,
    check,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      stopWatching();
      if (poll) clearInterval(poll);
      poll = null;
      if (debounce) clearTimeout(debounce);
      debounce = null;
      listeners.clear();
    },
  };
}
