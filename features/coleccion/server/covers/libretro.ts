import * as fs from 'fs';
import * as path from 'path';

import { COVER_CANDIDATES_MAX, matchCover, parseCoverName } from '../../core/coverMatch.js';
import type { Region } from '../../core/types.js';
import {
  IMAGE_MAX_BYTES,
  LIBRETRO_FEW,
  LIBRETRO_FOLDERS,
  LIBRETRO_HOST,
  LISTING_MAX_AGE_MS,
  LISTING_MAX_BYTES,
  LISTING_RETRY_MS,
  LISTING_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from './constants.js';
import { NetError, type RateQueue, type SafeFetch } from './net.js';
import type { Candidate, CoverSource, SearchOutcome } from './types.js';

const BOXARTS = 'Named_Boxarts';

const folderUrl = (folder: string) =>
  `https://${LIBRETRO_HOST}/${encodeURIComponent(folder)}/${BOXARTS}/`;

/** A box file name as it can be used: a plain ".png" name, no folders, no control characters. */
export const isBoxName = (name: string): boolean =>
  name.length > 4 &&
  name.length <= 300 &&
  /\.png$/i.test(name) &&
  !/[\u0000-\u001f\u007f/\\]/.test(name) &&
  !name.includes('..');

/** The few HTML entities an index can put in an href. */
const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * The ".png" names of an Apache folder index (`<a href="Some%20Game%20(USA).png">`): decoded, folders, queries,
 * parent links and anything odd left out. Never throws.
 */
export function parseFolderIndex(html: string): string[] {
  const names = new Set<string>();
  const re = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const m of html.matchAll(re)) {
    let href = decodeEntities(m[1] ?? m[2] ?? '');
    if (href.startsWith('./')) href = href.slice(2);
    if (!href || /[/?#]/.test(href)) continue;
    let name: string;
    try {
      name = decodeURIComponent(href);
    } catch {
      continue;
    }
    if (isBoxName(name)) names.add(name);
  }
  return [...names];
}

interface Listing {
  folder: string;
  fetchedAt: number;
  names: string[];
}

export interface LibretroOptions {
  net: SafeFetch;
  queue: RateQueue;
  /** Where folder listings are kept (…/portadas/.listados). */
  cacheDir: string;
  now: () => number;
}

/** libretro-thumbnails: box art by console, no key. Folder listings are fetched once and kept for a week. */
export function createLibretroSource(opts: LibretroOptions): CoverSource & {
  /** For tests: the names known for a console (fetching the listing if needed). */
  listing(platformId: string): Promise<string[]>;
} {
  const memory = new Map<string, Listing>();
  const inFlight = new Map<string, Promise<string[]>>();
  const failedAt = new Map<string, number>();
  let okAt: number | undefined;
  let problem: string | undefined;

  const cacheFile = (platformId: string) => path.join(opts.cacheDir, `${platformId}.json`);

  function readCache(platformId: string, folder: string): Listing | null {
    try {
      const raw = JSON.parse(fs.readFileSync(cacheFile(platformId), 'utf8')) as Partial<Listing>;
      if (raw.folder !== folder || typeof raw.fetchedAt !== 'number' || !Array.isArray(raw.names))
        return null;
      const names = raw.names.filter((n): n is string => typeof n === 'string' && isBoxName(n));
      return { folder, fetchedAt: raw.fetchedAt, names };
    } catch {
      return null;
    }
  }

  function writeCache(platformId: string, listing: Listing): void {
    try {
      fs.mkdirSync(opts.cacheDir, { recursive: true });
      const file = cacheFile(platformId);
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(listing));
      fs.renameSync(tmp, file);
    } catch {
      // Only a cache: the listing is fetched again next time
    }
  }

  const fresh = (l: Listing | null | undefined): boolean =>
    !!l && opts.now() - l.fetchedAt < LISTING_MAX_AGE_MS;

  async function fetchListing(platformId: string, folder: string): Promise<string[]> {
    const res = await opts.queue.run(() =>
      opts.net(folderUrl(folder), {
        maxBytes: LISTING_MAX_BYTES,
        timeoutMs: LISTING_TIMEOUT_MS,
      }),
    );
    if (res.status !== 200) throw new NetError('http', res.status);
    const names = parseFolderIndex(new TextDecoder().decode(res.bytes));
    const listing = { folder, fetchedAt: opts.now(), names };
    memory.set(platformId, listing);
    writeCache(platformId, listing);
    return names;
  }

  async function listing(platformId: string): Promise<string[]> {
    const folder = LIBRETRO_FOLDERS[platformId];
    if (!folder) return [];
    const mem = memory.get(platformId);
    if (mem && fresh(mem)) return mem.names;
    const disk = readCache(platformId, folder);
    if (disk && fresh(disk)) {
      memory.set(platformId, disk);
      return disk.names;
    }
    const failed = failedAt.get(platformId);
    if (failed !== undefined && opts.now() - failed < LISTING_RETRY_MS) {
      // An old listing beats none while libretro does not answer
      if (disk) return disk.names;
      throw new NetError('sin-respuesta');
    }
    let pending = inFlight.get(platformId);
    if (!pending) {
      pending = fetchListing(platformId, folder).finally(() => inFlight.delete(platformId));
      inFlight.set(platformId, pending);
    }
    try {
      const names = await pending;
      failedAt.delete(platformId);
      okAt = opts.now();
      problem = undefined;
      return names;
    } catch (err) {
      failedAt.set(platformId, opts.now());
      problem = err instanceof NetError ? err.message : 'no contestó';
      if (disk) return disk.names;
      throw err instanceof NetError ? err : new NetError('sin-respuesta');
    }
  }

  function toCandidate(name: string, score: number): Candidate {
    const parsed = parseCoverName(name);
    return {
      source: 'libretro',
      key: name,
      label: parsed.name,
      region: parsed.regions.join(', '),
      score,
    };
  }

  return {
    id: 'libretro',
    name: 'libretro-thumbnails',
    listing,

    covers(platformId) {
      if (!LIBRETRO_FOLDERS[platformId]) return false;
      return LIBRETRO_FEW.has(platformId) ? 'pocas' : true;
    },

    async search(
      title: string,
      platformId: string,
      region: Region | '',
      wide = false,
    ): Promise<SearchOutcome> {
      if (!LIBRETRO_FOLDERS[platformId]) return { kind: 'none', reason: 'sin-cobertura' };
      let names: string[];
      try {
        names = await listing(platformId);
      } catch {
        return { kind: 'none', reason: 'sin-respuesta' };
      }
      const m = matchCover(title, region, names);
      if (m.kind === 'found') {
        const candidate = toCandidate(m.hits[0].name, 1);
        if (!wide) return { kind: 'found', candidate };
        // Other copies of the same game (other regions), then the ones that only look like it
        const exact = new Set(m.hits.map((h) => h.name));
        const rest = matchCover(
          title,
          region,
          names.filter((n) => !exact.has(n)),
        );
        const others = [
          ...m.hits.slice(1).map((h) => toCandidate(h.name, 1)),
          ...(rest.kind === 'none' ? [] : rest.hits.map((h) => toCandidate(h.name, h.score))),
        ].slice(0, COVER_CANDIDATES_MAX - 1);
        return { kind: 'found', candidate, others };
      }
      if (m.kind === 'choose')
        return { kind: 'choose', candidates: m.hits.map((h) => toCandidate(h.name, h.score)) };
      return { kind: 'none', reason: 'sin-coincidencia' };
    },

    async image(candidate, platformId) {
      const folder = LIBRETRO_FOLDERS[platformId];
      if (!folder || candidate.source !== 'libretro' || !isBoxName(candidate.key))
        throw new NetError('no-permitido');
      try {
        const res = await opts.queue.run(() =>
          opts.net(`${folderUrl(folder)}${encodeURIComponent(candidate.key)}`, {
            maxBytes: IMAGE_MAX_BYTES,
            timeoutMs: REQUEST_TIMEOUT_MS,
          }),
        );
        if (res.status !== 200) throw new NetError('http', res.status);
        okAt = opts.now();
        problem = undefined;
        return res.bytes;
      } catch (err) {
        problem = err instanceof NetError ? err.message : 'no contestó';
        throw err instanceof NetError ? err : new NetError('sin-respuesta');
      }
    },

    lastOkAt: () => (okAt === undefined ? undefined : new Date(okAt).toISOString()),
    lastProblem: () => problem,
  };
}
