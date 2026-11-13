import * as fs from 'fs';
import * as path from 'path';

import { type CardIndex, createCardIndex, trimYgoCard } from '../core/cards.js';
import type { CardRecord } from '../core/types.js';
import {
  CARDS_FILE,
  CARDS_FILE_VERSION,
  DB_ERROR_DETAIL,
  DB_LOADING_DETAIL,
  DB_MISSING_DETAIL,
  DB_REFRESH_MS,
  DB_RETRY_MS,
  IMAGE_LOCAL_SUFFIX,
  IMAGE_MAX_BYTES,
  IMAGE_REMOTE_DIRS,
  IMAGE_RETRY_MS,
  IMAGES_DIR,
  LOG_PREFIX,
  REMOTE_CONCURRENCY,
  REMOTE_PER_SECOND,
  USER_AGENT,
  YGO_CARDINFO_URL,
  YGO_DBVER_URL,
  YGO_IMAGES,
} from './constants.js';

export type ImageSize = keyof typeof IMAGE_REMOTE_DIRS;
export type DbStateName = 'missing' | 'loading' | 'ready' | 'error';

export interface DbState {
  state: DbStateName;
  count?: number;
  /** ISO time the base was downloaded. */
  updatedAt?: string;
  detail?: string;
}

export interface CardDbOptions {
  /** The cache folder (~/.pixel-agents/decks-cache). */
  dir: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Waits for the rate limit (tests make it instant). */
  sleep?: (ms: number) => Promise<void>;
}

export interface CardDb {
  state(): DbState;
  onChange(listener: () => void): () => void;
  /** Reads cards.json if it is there and not read yet (no network). True when there are cards. */
  loadLocal(): boolean;
  /** Loads the base, downloading it when missing or (after 7 days) when YGOPRODeck says it changed. */
  ensure(): Promise<void>;
  index(): CardIndex;
  /** The local file of a card image, downloading it once when needed; null when it does not exist. */
  image(id: number, size: ImageSize): Promise<string | null>;
  /** ISO time of the last request to YGOPRODeck that worked. */
  lastOkAt(): string | undefined;
}

interface CardsFile {
  version: number;
  dbVersion?: string;
  dbUpdated?: string;
  fetchedAt: string;
  cards: CardRecord[];
}

/** At most `max` tasks at once and `perSecond` starts per rolling second. */
export function createLimiter(opts: {
  max: number;
  perSecond: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const starts: number[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    while (active >= opts.max) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      for (;;) {
        const t = opts.now();
        while (starts.length && t - starts[0] >= 1000) starts.shift();
        if (starts.length < opts.perSecond) {
          starts.push(t);
          break;
        }
        await opts.sleep(Math.max(1, 1000 - (t - starts[0])));
      }
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

function writeAtomic(file: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** The local card database: YGOPRODeck downloaded once, trimmed, kept in cards.json; images kept in img/. */
export function createCardDb(opts: CardDbOptions): CardDb {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const cardsFile = path.join(opts.dir, CARDS_FILE);
  const imagesDir = path.join(opts.dir, IMAGES_DIR);
  const limit = createLimiter({
    max: REMOTE_CONCURRENCY,
    perSecond: REMOTE_PER_SECOND,
    now,
    sleep,
  });
  const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };

  let data: CardsFile | null = null;
  let idx: CardIndex = createCardIndex([]);
  let triedLocal = false;
  let checkedAt = 0;
  let loading: Promise<void> | null = null;
  let failedAt = 0;
  let failure: string | undefined;
  let okAt: string | undefined;
  const listeners = new Set<() => void>();
  const imageJobs = new Map<string, Promise<string | null>>();
  const imageFailed = new Map<string, number>();

  // Listeners hear only real changes: ensure() runs on every search, and each call must not resend every deck
  let lastState = '';
  const emit = () => {
    const key = JSON.stringify(state());
    if (key === lastState) return;
    lastState = key;
    for (const l of listeners) l();
  };

  function use(file: CardsFile): void {
    data = file;
    idx = createCardIndex(file.cards);
  }

  function loadLocal(): boolean {
    if (data) return true;
    if (triedLocal) return false;
    triedLocal = true;
    try {
      const raw = JSON.parse(fs.readFileSync(cardsFile, 'utf8')) as Partial<CardsFile>;
      if (raw.version !== CARDS_FILE_VERSION || !Array.isArray(raw.cards) || raw.cards.length === 0)
        return false;
      use(raw as CardsFile);
      checkedAt = fs.statSync(cardsFile).mtimeMs;
      return true;
    } catch {
      return false;
    }
  }

  async function getText(url: string): Promise<string> {
    const res = await limit(() => doFetch(url, { headers }));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }

  async function remoteVersion(): Promise<{ version?: string; updated?: string }> {
    const raw = JSON.parse(await getText(YGO_DBVER_URL)) as unknown;
    const first = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
    return {
      version: typeof first?.database_version === 'string' ? first.database_version : undefined,
      updated: typeof first?.last_update === 'string' ? first.last_update : undefined,
    };
  }

  async function download(ver: { version?: string; updated?: string }): Promise<void> {
    const raw = JSON.parse(await getText(YGO_CARDINFO_URL)) as { data?: unknown };
    if (!Array.isArray(raw.data)) throw new Error('respuesta sin data');
    const cards: CardRecord[] = [];
    for (const item of raw.data) {
      const card = trimYgoCard(item);
      if (card) cards.push(card);
    }
    if (cards.length === 0) throw new Error('respuesta sin cartas');
    const file: CardsFile = {
      version: CARDS_FILE_VERSION,
      dbVersion: ver.version,
      dbUpdated: ver.updated,
      fetchedAt: new Date(now()).toISOString(),
      cards,
    };
    writeAtomic(cardsFile, JSON.stringify(file));
    use(file);
    checkedAt = now();
    console.log(`${LOG_PREFIX} Base de cartas bajada: ${cards.length} cartas.`);
  }

  async function refresh(): Promise<void> {
    const had = loadLocal();
    if (had && now() - checkedAt < DB_REFRESH_MS) return;
    if (failedAt && now() - failedAt < DB_RETRY_MS) return;
    if (!had) emit(); // "loading" from here on
    try {
      const ver = await remoteVersion();
      if (had && ver.version && ver.version === data?.dbVersion) {
        checkedAt = now();
        try {
          fs.utimesSync(cardsFile, checkedAt / 1000, checkedAt / 1000);
        } catch {
          // Only the date of the next check depends on it
        }
      } else {
        await download(ver);
      }
      okAt = new Date(now()).toISOString();
      failedAt = 0;
      failure = undefined;
    } catch (err) {
      failedAt = now();
      failure = (err as Error).message;
      console.warn(`${LOG_PREFIX} ${DB_ERROR_DETAIL}:`, failure);
    }
  }

  function ensure(): Promise<void> {
    if (!loading) {
      // refresh() starts on the next tick, so `loading` is already set when it reports "loading"
      loading = Promise.resolve()
        .then(refresh)
        .finally(() => {
          loading = null;
          emit();
        });
    }
    return loading;
  }

  function state(): DbState {
    if (data) return { state: 'ready', count: idx.count, updatedAt: data.fetchedAt };
    if (loading) return { state: 'loading', detail: DB_LOADING_DETAIL };
    if (failure) return { state: 'error', detail: `${DB_ERROR_DETAIL} (${failure})` };
    return { state: 'missing', detail: DB_MISSING_DETAIL };
  }

  async function fetchImage(id: number, size: ImageSize, file: string): Promise<string | null> {
    const url = `${YGO_IMAGES}/${IMAGE_REMOTE_DIRS[size]}/${id}.jpg`;
    const res = await limit(() => doFetch(url, { headers }));
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`);
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length === 0 || body.length > IMAGE_MAX_BYTES)
      throw new Error(`tamaño ${body.length}`);
    writeAtomic(file, body);
    okAt = new Date(now()).toISOString();
    return file;
  }

  async function image(id: number, size: ImageSize): Promise<string | null> {
    const name = `${id}${IMAGE_LOCAL_SUFFIX[size]}.jpg`;
    const file = path.join(imagesDir, name);
    if (fs.existsSync(file)) return file;
    // Only cards of the base are asked for: no probing YGOPRODeck with made-up numbers
    loadLocal();
    if (!idx.get(id)) return null;
    const failed = imageFailed.get(name);
    if (failed !== undefined && now() - failed < IMAGE_RETRY_MS) return null;
    let job = imageJobs.get(name);
    if (!job) {
      job = fetchImage(id, size, file)
        .catch((err: unknown) => {
          imageFailed.set(name, now());
          console.warn(`${LOG_PREFIX} No pude bajar la imagen ${name}:`, (err as Error).message);
          return null;
        })
        .finally(() => imageJobs.delete(name));
      imageJobs.set(name, job);
    }
    return job;
  }

  lastState = JSON.stringify(state());
  return {
    state,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loadLocal,
    ensure,
    index: () => idx,
    image,
    lastOkAt: () => okAt,
  };
}
