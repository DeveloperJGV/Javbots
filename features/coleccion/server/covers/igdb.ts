import * as fs from 'fs';
import * as path from 'path';

import { COVER_CANDIDATES_MAX, matchCover } from '../../core/coverMatch.js';
import type { Region } from '../../core/types.js';
import {
  API_MAX_BYTES,
  IGDB_ALT_NAMES_MAX,
  IGDB_API_HOST,
  IGDB_IMAGE_ID_PATTERN,
  IGDB_IMAGES_HOST,
  IGDB_KEY_FILE,
  IGDB_KEY_PATTERN,
  IGDB_LIMIT,
  IGDB_PLATFORM_NAMES,
  IMAGE_MAX_BYTES,
  REQUEST_TIMEOUT_MS,
  TOKEN_MARGIN_MS,
  TWITCH_AUTH_HOST,
} from './constants.js';
import { NetError, type RateQueue, type SafeFetch } from './net.js';
import type { Candidate, CoverSource, SearchOutcome } from './types.js';

export interface IgdbKey {
  clientId: string;
  clientSecret: string;
}

export interface IgdbKeyStore {
  get(): IgdbKey | null;
  /** Throws when the key is not well formed or cannot be written. */
  set(key: IgdbKey): void;
  remove(): void;
}

/** The IGDB key in its own file (<pixelDir>/coleccion-igdb.json, 0600 when created), never in the collection. */
export function createIgdbKeyStore(pixelDir: string): IgdbKeyStore {
  const file = path.join(pixelDir, IGDB_KEY_FILE);
  return {
    get() {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<IgdbKey>;
        if (
          typeof raw.clientId === 'string' &&
          typeof raw.clientSecret === 'string' &&
          IGDB_KEY_PATTERN.test(raw.clientId) &&
          IGDB_KEY_PATTERN.test(raw.clientSecret)
        )
          return { clientId: raw.clientId, clientSecret: raw.clientSecret };
      } catch {
        // No key (or a broken file): same thing
      }
      return null;
    },
    set(key) {
      const clientId = key.clientId.trim();
      const clientSecret = key.clientSecret.trim();
      if (!IGDB_KEY_PATTERN.test(clientId) || !IGDB_KEY_PATTERN.test(clientSecret))
        throw new Error('el Client ID y el Client Secret son letras y números');
      fs.mkdirSync(pixelDir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(tmp, `${JSON.stringify({ clientId, clientSecret }, null, 2)}\n`, {
          mode: 0o600,
        });
        fs.renameSync(tmp, file);
      } catch {
        fs.rmSync(tmp, { force: true });
        throw new Error('no se pudo escribir el archivo de la llave');
      }
    },
    remove() {
      fs.rmSync(file, { force: true });
    },
  };
}

const foldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The Apicalypse query for a title (quotes and backslashes out: the title is only words). */
export function igdbQuery(title: string): string {
  const clean = title.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `search "${clean}"; fields name,alternative_names.name,cover.image_id,platforms.name,first_release_date; where version_parent = null; limit ${IGDB_LIMIT};`;
}

interface IgdbGame {
  name: string;
  /** Other names IGDB knows it by (other languages, short names): its search finds games by them too. */
  altNames: string[];
  imageId: string;
  platforms: string[];
  year: number;
}

function readGames(bytes: Uint8Array): IgdbGame[] {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: IgdbGame[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    const cover = g.cover as Record<string, unknown> | undefined;
    const imageId = typeof cover?.image_id === 'string' ? cover.image_id : '';
    if (typeof g.name !== 'string' || !IGDB_IMAGE_ID_PATTERN.test(imageId)) continue;
    const platforms = Array.isArray(g.platforms)
      ? g.platforms
          .map((p) => (p && typeof p === 'object' ? (p as Record<string, unknown>).name : null))
          .filter((n): n is string => typeof n === 'string')
      : [];
    const year =
      typeof g.first_release_date === 'number'
        ? new Date(g.first_release_date * 1000).getUTCFullYear()
        : 0;
    const altNames = Array.isArray(g.alternative_names)
      ? g.alternative_names
          .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>).name : null))
          .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
          .slice(0, IGDB_ALT_NAMES_MAX)
          .map((n) => n.slice(0, 200))
      : [];
    out.push({ name: g.name.slice(0, 200), altNames, imageId, platforms, year });
  }
  return out;
}

export interface IgdbOptions {
  net: SafeFetch;
  queue: RateQueue;
  key: () => IgdbKey | null;
  now: () => number;
}

/** IGDB (Twitch's game database): any console, with the person's own key. */
export function createIgdbSource(opts: IgdbOptions): CoverSource & { forgetToken(): void } {
  let token: { value: string; expiresAt: number; clientId: string } | null = null;
  let okAt: number | undefined;
  let problem: string | undefined;

  async function getToken(key: IgdbKey, renew = false): Promise<string> {
    if (
      !renew &&
      token &&
      token.clientId === key.clientId &&
      opts.now() < token.expiresAt - TOKEN_MARGIN_MS
    )
      return token.value;
    token = null;
    // The secret goes in the body, never in the address (addresses end up in logs and errors)
    const form = new URLSearchParams({
      client_id: key.clientId,
      client_secret: key.clientSecret,
      grant_type: 'client_credentials',
    });
    const res = await opts.queue.run(() =>
      opts.net(`https://${TWITCH_AUTH_HOST}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        maxBytes: API_MAX_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
      }),
    );
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new NetError('llave');
    if (res.status !== 200) throw new NetError('http', res.status);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(new TextDecoder().decode(res.bytes)) as Record<string, unknown>;
    } catch {
      throw new NetError('http', res.status);
    }
    if (typeof body.access_token !== 'string' || typeof body.expires_in !== 'number')
      throw new NetError('http', res.status);
    token = {
      value: body.access_token,
      expiresAt: opts.now() + body.expires_in * 1000,
      clientId: key.clientId,
    };
    return token.value;
  }

  async function query(key: IgdbKey, title: string, renewed = false): Promise<IgdbGame[]> {
    const access = await getToken(key, renewed);
    const res = await opts.queue.run(() =>
      opts.net(`https://${IGDB_API_HOST}/v4/games`, {
        method: 'POST',
        headers: {
          'Client-ID': key.clientId,
          Authorization: `Bearer ${access}`,
          'Content-Type': 'text/plain',
        },
        body: igdbQuery(title),
        maxBytes: API_MAX_BYTES,
        timeoutMs: REQUEST_TIMEOUT_MS,
      }),
    );
    // An expired or revoked token: one new token and one more try
    if (res.status === 401 && !renewed) return query(key, title, true);
    if (res.status === 401 || res.status === 403) throw new NetError('llave');
    if (res.status !== 200) throw new NetError('http', res.status);
    return readGames(res.bytes);
  }

  const failed = (err: unknown) => {
    problem = err instanceof NetError ? err.message : 'no contestó';
  };

  return {
    id: 'igdb',
    name: 'IGDB',
    forgetToken: () => {
      token = null;
    },

    covers(platformId) {
      return !!IGDB_PLATFORM_NAMES[platformId];
    },

    async search(
      title: string,
      platformId: string,
      region: Region | '',
      wide = false,
    ): Promise<SearchOutcome> {
      const wanted = IGDB_PLATFORM_NAMES[platformId];
      if (!wanted) return { kind: 'none', reason: 'sin-cobertura' };
      const key = opts.key();
      if (!key) return { kind: 'none', reason: 'sin-llave' };
      let games: IgdbGame[];
      try {
        games = await query(key, title);
        okAt = opts.now();
        problem = undefined;
      } catch (err) {
        failed(err);
        return {
          kind: 'none',
          reason:
            err instanceof NetError && err.problem === 'llave' ? 'sin-llave' : 'sin-respuesta',
        };
      }
      const names = new Set(wanted.map(foldName));
      // Only games IGDB lists on this console: a platform name we do not recognize never matches
      const onConsole = games.filter((g) => g.platforms.some((p) => names.has(foldName(p))));
      const toCandidate = (g: IgdbGame, score: number): Candidate => ({
        source: 'igdb',
        key: g.imageId,
        label: g.year ? `${g.name} (${g.year})` : g.name,
        region: '',
        score,
      });
      // Each game by its name, then by its other names (a title written in Spanish finds the game by those)
      const named = onConsole.flatMap((g, i) =>
        [g.name, ...g.altNames].map((name) => ({ i, name })),
      );
      const m = matchCover(
        title,
        region,
        named.map((n) => n.name),
      );
      const gameOf = (index: number) => onConsole[named[index].i];
      const distinctGames = (indexes: number[]) => [...new Set(indexes.map((x) => named[x].i))];
      if (m.kind === 'found') {
        const games = distinctGames(m.hits.map((h) => h.index)).map((i) => onConsole[i]);
        const byImage = [...new Map(games.map((g) => [g.imageId, g])).values()];
        if (byImage.length === 1) {
          const candidate = toCandidate(byImage[0], 1);
          if (!wide) return { kind: 'found', candidate };
          const others = onConsole
            .filter((g) => g.imageId !== byImage[0].imageId)
            .slice(0, COVER_CANDIDATES_MAX - 1)
            .map((g) => toCandidate(g, 0.5));
          return { kind: 'found', candidate, others };
        }
        // Same name, different games (a remake, a reboot): the person chooses
        return {
          kind: 'choose',
          candidates: byImage.slice(0, COVER_CANDIDATES_MAX).map((g) => toCandidate(g, 0.95)),
        };
      }
      if (m.kind === 'choose') {
        const seen = new Set<string>();
        const candidates: Candidate[] = [];
        for (const h of m.hits) {
          const g = gameOf(h.index);
          if (seen.has(g.imageId)) continue;
          seen.add(g.imageId);
          candidates.push(toCandidate(g, h.score));
        }
        return { kind: 'choose', candidates };
      }
      // IGDB found these by a name we do not compare against (or loosely): what it lists on this console is at
      // least offered, never put on its own
      if (onConsole.length > 0)
        return {
          kind: 'choose',
          candidates: [...new Map(onConsole.map((g) => [g.imageId, g])).values()]
            .slice(0, COVER_CANDIDATES_MAX)
            .map((g) => toCandidate(g, 0.4)),
        };
      // Our console names for IGDB are unchecked: when none of the answers is on a console we recognize, the
      // games that match by name are only offered (with the consoles IGDB lists), never put in silence
      if (games.length > 0) {
        const loose = matchCover(
          title,
          region,
          games.map((g) => g.name),
        );
        if (loose.kind !== 'none')
          return {
            kind: 'choose',
            candidates: loose.hits.map((h) => {
              const g = games[h.index];
              const c = toCandidate(g, Math.min(h.score, 0.5));
              const where = g.platforms.slice(0, 3).join(', ');
              return where ? { ...c, label: `${c.label} · ${where}` } : c;
            }),
          };
      }
      return { kind: 'none', reason: 'sin-coincidencia' };
    },

    async image(candidate, _platformId, size) {
      if (candidate.source !== 'igdb' || !IGDB_IMAGE_ID_PATTERN.test(candidate.key))
        throw new NetError('no-permitido');
      const variant = size === 'full' ? 't_cover_big_2x' : 't_cover_big';
      try {
        const res = await opts.queue.run(() =>
          opts.net(
            `https://${IGDB_IMAGES_HOST}/igdb/image/upload/${variant}/${candidate.key}.jpg`,
            {
              maxBytes: IMAGE_MAX_BYTES,
              timeoutMs: REQUEST_TIMEOUT_MS,
            },
          ),
        );
        if (res.status !== 200) throw new NetError('http', res.status);
        okAt = opts.now();
        problem = undefined;
        return res.bytes;
      } catch (err) {
        failed(err);
        throw err instanceof NetError ? err : new NetError('sin-respuesta');
      }
    },

    lastOkAt: () => (okAt === undefined ? undefined : new Date(okAt).toISOString()),
    lastProblem: () => problem,
  };
}
