import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PlaylistRecipe } from '../../../../core/src/messages.js';
import {
  LOG_PREFIX,
  PLAYLIST_FILE,
  PLAYLIST_RECENT_DAYS,
  PLAYLIST_RECIPES_MAX,
  PLAYLIST_REJECTED_MAX,
} from '../constants.js';
import { cleanRecipe, DEFAULT_RECIPES } from './generator.js';

/** A song in the "don't play again" bin (title and artist so the panel can show it). */
export interface RejectedSong {
  uri: string;
  title: string;
  artist: string;
  durationMs: number;
  /** ISO time it was rejected. */
  at: string;
}

/** What was asked for a list: a typed description or a recipe (so "improve" can follow the same idea). */
export interface StoredRequest {
  text?: string;
  recipe?: PlaylistRecipe;
  minutes: number;
  avoidRecent: boolean;
  /** Last improvement asked for it ("más para descubrir"), carried into the next ones. */
  discover?: boolean;
}

/** A list the office created in the owner's account. */
export interface CreatedList {
  id: string;
  name: string;
  /** Local day it was made (YYYY-MM-DD). */
  day: string;
  kept: boolean;
  count: number;
  totalMs: number;
  url?: string;
  /** Its songs: "don't repeat what's recent". */
  uris: string[];
  createdAt: string;
  /** Taken out of the library: kept a few days only for "recent". */
  removedAt?: string;
  request?: StoredRequest;
  /** No longer in the owner's library (he removed it in Spotify). */
  missing?: boolean;
}

/** ~/.pixel-agents/playlists.json */
export interface PlaylistData {
  recipes: PlaylistRecipe[];
  rejected: RejectedSong[];
  lists: CreatedList[];
  autoPlay: boolean;
}

const DAY_MS = 24 * 60 * 60_000;

function dataPath(): string {
  return path.join(os.homedir(), '.pixel-agents', PLAYLIST_FILE);
}

const str = (v: unknown): v is string => typeof v === 'string' && v !== '';
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function cleanRejected(raw: unknown): RejectedSong | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !str(r.uri)) return null;
  return {
    uri: r.uri,
    title: typeof r.title === 'string' ? r.title : '',
    artist: typeof r.artist === 'string' ? r.artist : '',
    durationMs: num(r.durationMs),
    at: str(r.at) ? r.at : new Date(0).toISOString(),
  };
}

function cleanRequest(raw: unknown): StoredRequest | undefined {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return undefined;
  const text = typeof r.text === 'string' ? r.text.trim() : '';
  const recipe = r.recipe ? cleanRecipe(r.recipe) : null;
  if (!text && !recipe) return undefined;
  return {
    ...(text ? { text } : {}),
    ...(recipe ? { recipe } : {}),
    minutes: num(r.minutes) || 60,
    avoidRecent: r.avoidRecent === true,
    ...(r.discover === true ? { discover: true } : {}),
  };
}

function cleanList(raw: unknown): CreatedList | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || !str(r.id) || !str(r.name)) return null;
  return {
    id: r.id,
    name: r.name,
    day: typeof r.day === 'string' ? r.day : '',
    kept: r.kept === true,
    count: num(r.count),
    totalMs: num(r.totalMs),
    ...(str(r.url) ? { url: r.url } : {}),
    uris: Array.isArray(r.uris) ? r.uris.filter(str) : [],
    createdAt: str(r.createdAt) ? r.createdAt : new Date(0).toISOString(),
    ...(str(r.removedAt) ? { removedAt: r.removedAt } : {}),
    ...(cleanRequest(r.request) ? { request: cleanRequest(r.request) } : {}),
    ...(r.missing === true ? { missing: true } : {}),
  };
}

/** Removed lists older than the "recent" window are dropped; live ones never are. The bin keeps its newest. */
export function pruneData(data: PlaylistData, nowMs: number): PlaylistData {
  const cutoff = nowMs - PLAYLIST_RECENT_DAYS * DAY_MS;
  return {
    ...data,
    rejected: [...data.rejected]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, PLAYLIST_REJECTED_MAX),
    lists: data.lists.filter((l) => !l.removedAt || Date.parse(l.removedAt) >= cutoff),
  };
}

/** Reads the file; without one (or unreadable), the default recipes and autoplay on. */
export function readPlaylistData(nowMs: number = Date.now()): PlaylistData {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(dataPath(), 'utf-8')) as Record<string, unknown>;
  } catch {
    // missing or unreadable: defaults below
  }
  const recipes = Array.isArray(raw.recipes)
    ? raw.recipes
        .map(cleanRecipe)
        .filter((r): r is PlaylistRecipe => r !== null && r.id !== '')
        .slice(0, PLAYLIST_RECIPES_MAX)
    : DEFAULT_RECIPES.map((r) => ({ ...r }));
  return pruneData(
    {
      recipes,
      rejected: Array.isArray(raw.rejected)
        ? raw.rejected.map(cleanRejected).filter((r): r is RejectedSong => r !== null)
        : [],
      lists: Array.isArray(raw.lists)
        ? raw.lists.map(cleanList).filter((l): l is CreatedList => l !== null)
        : [],
      autoPlay: typeof raw.autoPlay === 'boolean' ? raw.autoPlay : true,
    },
    nowMs,
  );
}

/** Atomic write (tmp + rename), private to the user. Failures are logged, never thrown. */
export function writePlaylistData(data: PlaylistData): void {
  const file = dataPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn(`${LOG_PREFIX} No se pudo guardar ${PLAYLIST_FILE}:`, err);
  }
}
