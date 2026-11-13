import type {
  PlaylistArtist,
  PlaylistRecipe,
  PlaylistSong,
} from '../../../../core/src/messages.js';
import {
  PLAYLIST_DURATION_SLACK_MS,
  PLAYLIST_MINUTES,
  PLAYLIST_NEWEST_DECADE,
  PLAYLIST_OLDEST_DECADE,
  PLAYLIST_RECIPE_MAX_ARTISTS,
  PLAYLIST_RECIPE_MAX_LISTS,
  PLAYLIST_RECIPE_NAME_MAX,
} from '../constants.js';

/**
 * The rules that turn a pile of songs into "today's playlist". Pure: no network, no clock; randomness comes
 * from the `rng` the caller passes (Math.random in the office, a seeded one in tests).
 */

/** A song in the material: the page's shape plus a key to compare artists (first artist's id, or its name). */
export interface PoolSong extends PlaylistSong {
  artistKey: string;
}

export interface BuildInput {
  /** The owner's own songs (lists, top, liked, chosen artists). */
  own: PoolSong[];
  /** Songs to discover (artists near the material), used for `discoverShare` of the time. */
  discover: PoolSong[];
  targetMs: number;
  /** 0..1 of the time for songs to discover. */
  discoverShare: number;
  /** URIs never to use (the bin, recent lists). */
  excluded: Set<string>;
  /** Decades to keep (empty = any). */
  decades: number[];
  rng: () => number;
}

export interface BuildResult {
  songs: PoolSong[];
  totalMs: number;
  note?: string;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();
/** Same song in another list / album: same title and artist. */
export const songIdentity = (s: PlaylistSong) => `${norm(s.title)}|${norm(s.artist)}`;

/** Does the year fit the chosen decades? The oldest decade also takes everything before it. */
export function inDecades(year: number | undefined, decades: number[]): boolean {
  if (decades.length === 0) return true;
  if (year === undefined) return false;
  return decades.some(
    (d) => (year >= d && year <= d + 9) || (d === PLAYLIST_OLDEST_DECADE && year < d),
  );
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Drops excluded songs, songs outside the decades and repeats (by uri and by title + artist). */
function clean(songs: PoolSong[], input: BuildInput, seen: Set<string>): PoolSong[] {
  const out: PoolSong[] = [];
  for (const s of songs) {
    if (input.excluded.has(s.uri) || !inDecades(s.year, input.decades)) continue;
    const identity = songIdentity(s);
    if (seen.has(s.uri) || seen.has(identity)) continue;
    seen.add(s.uri);
    seen.add(identity);
    out.push(s);
  }
  return out;
}

/** Takes songs in random order until the total is within the slack of `targetMs` (never over it + slack). */
function fill(songs: PoolSong[], targetMs: number, rng: () => number): PoolSong[] {
  const picked: PoolSong[] = [];
  let total = 0;
  for (const s of shuffle(songs, rng)) {
    if (total >= targetMs - PLAYLIST_DURATION_SLACK_MS) break;
    if (s.durationMs <= 0 || total + s.durationMs > targetMs + PLAYLIST_DURATION_SLACK_MS) continue;
    picked.push(s);
    total += s.durationMs;
  }
  return picked;
}

/** Never the same artist twice in a row when it can be avoided: the artist with most songs left goes next. */
export function spreadArtists(songs: PoolSong[], rng: () => number): PoolSong[] {
  const groups = new Map<string, PoolSong[]>();
  for (const s of shuffle(songs, rng)) {
    const list = groups.get(s.artistKey) ?? [];
    list.push(s);
    groups.set(s.artistKey, list);
  }
  const out: PoolSong[] = [];
  let previous: string | undefined;
  while (out.length < songs.length) {
    let best: string | undefined;
    let bestCount = 0;
    let bestTie = 0;
    for (const [key, list] of groups) {
      if (list.length === 0 || key === previous) continue;
      const tie = rng();
      if (list.length > bestCount || (list.length === bestCount && tie > bestTie)) {
        best = key;
        bestCount = list.length;
        bestTie = tie;
      }
    }
    // Only the previous artist is left: it has to repeat.
    best ??= previous;
    if (best === undefined) break;
    out.push(groups.get(best)!.shift()!);
    previous = best;
  }
  return out;
}

const total = (songs: PoolSong[]) => songs.reduce((sum, s) => sum + s.durationMs, 0);

export function buildPlaylist(input: BuildInput): BuildResult {
  const seen = new Set<string>();
  const own = clean(input.own, input, seen);
  const discover = clean(input.discover, input, seen).map((s) => ({ ...s, discover: true }));
  const share = Math.max(0, Math.min(1, input.discoverShare));
  const fresh = share > 0 ? fill(discover, input.targetMs * share, input.rng) : [];
  const mine = fill(own, input.targetMs - total(fresh), input.rng);
  const songs = spreadArtists([...fresh, ...mine], input.rng);
  const totalMs = total(songs);
  const short = totalMs < input.targetMs - PLAYLIST_DURATION_SLACK_MS;
  return {
    songs,
    totalMs,
    ...(short
      ? { note: `Solo alcanzó para ${Math.round(totalMs / 60_000)} min: agrega más fuentes` }
      : {}),
  };
}

/** A song found for a description, with the points it earned (see PLAYLIST_SCORE). */
export interface ScoredSong {
  song: PoolSong;
  score: number;
}

/**
 * Fills `targetMs` from scored songs: best first, with a random spread (`jitter`) so a reroll changes the list
 * while the best still tend to lead. Same length rules as recipes; never the same artist twice in a row.
 */
export function buildRanked(
  scored: ScoredSong[],
  targetMs: number,
  excluded: Set<string>,
  rng: () => number,
  jitter: number,
): BuildResult {
  const seen = new Set<string>();
  const ordered = scored
    .map((s) => ({ s, key: s.score + rng() * jitter }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.s.song);
  const picked: PoolSong[] = [];
  let sum = 0;
  for (const s of ordered) {
    if (sum >= targetMs - PLAYLIST_DURATION_SLACK_MS) break;
    if (excluded.has(s.uri)) continue;
    const identity = songIdentity(s);
    if (seen.has(s.uri) || seen.has(identity)) continue;
    if (s.durationMs <= 0 || sum + s.durationMs > targetMs + PLAYLIST_DURATION_SLACK_MS) continue;
    seen.add(s.uri);
    seen.add(identity);
    picked.push(s);
    sum += s.durationMs;
  }
  const songs = spreadArtists(picked, rng);
  const short = picked.length > 0 && sum < targetMs - PLAYLIST_DURATION_SLACK_MS;
  return {
    songs,
    totalMs: sum,
    ...(short
      ? { note: `Solo alcanzó para ${Math.round(sum / 60_000)} min con lo que encontré` }
      : {}),
  };
}

/**
 * Takes one song out (the owner rejected it) and puts in its place another one not in the list, of a similar
 * length and, when possible, by an artist other than its neighbours. Without a candidate it is just removed.
 */
export function replaceSong(
  songs: PoolSong[],
  uri: string,
  candidates: PoolSong[],
  rng: () => number,
): PoolSong[] {
  const index = songs.findIndex((s) => s.uri === uri);
  if (index < 0) return songs;
  const removed = songs[index];
  const rest = songs.filter((_, i) => i !== index);
  const taken = new Set<string>([removed.uri, songIdentity(removed)]);
  for (const s of rest) {
    taken.add(s.uri);
    taken.add(songIdentity(s));
  }
  const neighbours = new Set(
    [rest[index - 1], rest[index]].filter(Boolean).map((s) => s.artistKey),
  );
  let best: PoolSong | undefined;
  let bestScore = Infinity;
  for (const c of shuffle(candidates, rng)) {
    if (taken.has(c.uri) || taken.has(songIdentity(c)) || c.durationMs <= 0) continue;
    const score =
      Math.abs(c.durationMs - removed.durationMs) + (neighbours.has(c.artistKey) ? 1e9 : 0);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  if (!best) return rest;
  return [...rest.slice(0, index), best, ...rest.slice(index)];
}

/** `Hoy suena · 12 nov · Para trabajar` (local day, short Spanish month, no year). */
export function playlistName(date: Date, recipeName: string): string {
  return `Hoy suena · ${date.getDate()} ${MONTHS[date.getMonth()]} · ${recipeName}`;
}

/** `YYYY-MM-DD` in local time. */
export function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const recipe = (
  r: Partial<PlaylistRecipe> & Pick<PlaylistRecipe, 'id' | 'name'>,
): PlaylistRecipe => ({
  top: false,
  liked: false,
  surprise: false,
  playlists: [],
  artists: [],
  decades: [],
  minutes: 60,
  discover: false,
  avoidRecent: false,
  ...r,
});

/** What the panel offers before the owner saves his own. */
export const DEFAULT_RECIPES: PlaylistRecipe[] = [
  recipe({ id: 'lo-de-siempre', name: 'Lo de siempre', top: true, minutes: 60 }),
  recipe({
    id: 'para-trabajar',
    name: 'Para trabajar',
    top: true,
    liked: true,
    minutes: 120,
    avoidRecent: true,
  }),
  recipe({
    id: 'para-regar',
    name: 'Para regar las plantas',
    top: true,
    minutes: 30,
    discover: true,
    avoidRecent: true,
  }),
  recipe({
    id: 'sorprendeme',
    name: 'Sorpréndeme',
    surprise: true,
    minutes: 60,
    discover: true,
    avoidRecent: true,
  }),
];

const VALID_DECADES = new Set<number>();
for (let d = PLAYLIST_OLDEST_DECADE; d <= PLAYLIST_NEWEST_DECADE; d += 10) VALID_DECADES.add(d);

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Validates a recipe from the panel or the file; null without a name or without any source. */
export function cleanRecipe(raw: unknown): PlaylistRecipe | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name, PLAYLIST_RECIPE_NAME_MAX);
  if (!name) return null;
  const playlists = Array.isArray(r.playlists)
    ? [
        ...new Set(
          r.playlists
            .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
            .map((p) => p.trim()),
        ),
      ].slice(0, PLAYLIST_RECIPE_MAX_LISTS)
    : [];
  const artists: PlaylistArtist[] = [];
  if (Array.isArray(r.artists)) {
    for (const a of r.artists as Record<string, unknown>[]) {
      const id = text(a?.id, 64);
      const artistName = text(a?.name, 100);
      if (!id || !artistName || artists.some((x) => x.id === id)) continue;
      artists.push({ id, name: artistName });
      if (artists.length >= PLAYLIST_RECIPE_MAX_ARTISTS) break;
    }
  }
  const decades = Array.isArray(r.decades)
    ? [
        ...new Set(
          r.decades.filter((d): d is number => typeof d === 'number' && VALID_DECADES.has(d)),
        ),
      ].sort((a, b) => a - b)
    : [];
  const out: PlaylistRecipe = {
    id: text(r.id, 64),
    name,
    top: r.top === true,
    liked: r.liked === true,
    surprise: r.surprise === true,
    playlists,
    artists,
    decades,
    minutes: PLAYLIST_MINUTES.includes(r.minutes as number) ? (r.minutes as number) : 60,
    discover: r.discover === true,
    avoidRecent: r.avoidRecent === true,
  };
  const hasSource =
    out.top || out.liked || out.surprise || playlists.length > 0 || artists.length > 0;
  return hasSource ? out : null;
}
