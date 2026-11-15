import {
  BARCODE_MAX,
  COVER_MAX,
  DEFAULT_TITLE,
  EXTERNAL_ID_MAX,
  GAME_ID_LENGTH,
  GAME_ID_PATTERN,
  GAMES_MAX,
  NOTES_MAX,
  OWNER_MAX,
  PLAYERS_MAX,
  PRICE_MAX,
  SEEN_AT_MAX,
  SERIES_MAX,
  TITLE_MAX,
} from './constants.js';
import {
  CONDITIONS,
  type Game,
  LENGTHS,
  PROGRESS,
  type ReadGame,
  REGIONS,
  type SessionLength,
} from './types.js';

const KNOWN_FIELDS = new Set([
  'id',
  'title',
  'platform',
  'wanted',
  'region',
  'condition',
  'progress',
  'players',
  'coop',
  'length',
  'series',
  'owner',
  'notes',
  'price',
  'seenAt',
  'addedAt',
  'lastPlayed',
  'updatedAt',
  'externalId',
  'barcode',
  'cover',
]);

/** A platform id as written in the file: lowercase letters, digits and dashes. */
const PLATFORM_PATTERN = /^[a-z0-9-]{1,32}$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isGameId(value: unknown): value is string {
  return typeof value === 'string' && GAME_ID_PATTERN.test(value);
}

/** YYYY-MM-DD of this moment on the machine's own calendar (not UTC: an evening is still today). */
export function isoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A new game id: `length` random lowercase letters and digits. */
export function newGameId(random: () => number = Math.random, length = GAME_ID_LENGTH): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) id += chars[Math.floor(random() * chars.length) % chars.length];
  return id;
}

/** Spaces collapsed, trimmed, cut to `max` (control characters out). */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';

  return value
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

/** One line: newlines become spaces too. */
const line = (value: unknown, max: number) =>
  cleanText(typeof value === 'string' ? value.replace(/\s+/g, ' ') : value, max);

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : '';
}

const day = (value: unknown): string =>
  typeof value === 'string' && DAY_PATTERN.test(value) ? value : '';

/** An empty game for the form (platform kept when adding many in a row). */
export function emptyGame(today: string, platform = '', wanted = false): Game {
  return {
    id: '',
    title: '',
    platform,
    wanted,
    region: '',
    condition: '',
    progress: '',
    players: 0,
    coop: false,
    length: '',
    series: '',
    owner: '',
    notes: '',
    price: '',
    seenAt: '',
    addedAt: today,
    lastPlayed: '',
    updatedAt: '',
  };
}

/**
 * A game from anything (the file, a message): unknown values fall back to "not said" and are reported, too-long
 * texts are cut, fields this version doesn't know are kept apart. Null when it is not even an object.
 */
export function normalizeGame(raw: unknown, today: string): ReadGame | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const problems: string[] = [];
  const unknown: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (!KNOWN_FIELDS.has(k)) unknown[k] = v;

  let title = line(r.title, TITLE_MAX);
  if (!title) {
    title = DEFAULT_TITLE;
    problems.push('no tenía nombre.');
  }
  let platform = typeof r.platform === 'string' ? r.platform.trim().toLowerCase() : '';
  if (!PLATFORM_PATTERN.test(platform)) {
    if (r.platform !== undefined) problems.push(`consola no válida (${String(r.platform)}).`);
    platform = '';
  }
  const players =
    typeof r.players === 'number' && Number.isFinite(r.players)
      ? Math.max(0, Math.min(PLAYERS_MAX, Math.round(r.players)))
      : 0;
  const game: Game = {
    id: isGameId(r.id) ? r.id : '',
    title,
    platform,
    wanted: r.wanted === true,
    region: oneOf(r.region, REGIONS),
    condition: oneOf(r.condition, CONDITIONS),
    progress: oneOf(r.progress, PROGRESS),
    players,
    coop: r.coop === true && players !== 1,
    length: oneOf(r.length, LENGTHS) as SessionLength,
    series: line(r.series, SERIES_MAX),
    owner: line(r.owner, OWNER_MAX),
    notes: cleanText(r.notes, NOTES_MAX),
    price: line(r.price, PRICE_MAX),
    seenAt: line(r.seenAt, SEEN_AT_MAX),
    addedAt: day(r.addedAt) || today,
    lastPlayed: day(r.lastPlayed),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt.slice(0, 40) : '',
  };
  const externalId = line(r.externalId, EXTERNAL_ID_MAX);
  if (externalId) game.externalId = externalId;
  // A barcode is its digits (and letters, for odd ones): spaces and dashes are just how it was printed
  const barcode = line(r.barcode, BARCODE_MAX).replace(/[^0-9A-Za-z]/g, '');
  if (barcode) game.barcode = barcode;
  const cover = line(r.cover, COVER_MAX);
  if (cover) game.cover = cover;
  // A wanted gap has no copy yet: what describes a copy does not apply
  if (game.wanted) {
    game.condition = '';
    game.progress = '';
    game.lastPlayed = '';
  }
  return { game, unknown, problems };
}

/** The game as written to the file: its known fields in a fixed order, then the unknown ones. */
export function gameFileContent(
  game: Game,
  unknown: Record<string, unknown> = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: game.id,
    title: game.title,
    platform: game.platform,
    wanted: game.wanted,
    region: game.region,
    condition: game.condition,
    progress: game.progress,
    players: game.players,
    coop: game.coop,
    length: game.length,
    series: game.series,
    owner: game.owner,
    notes: game.notes,
    price: game.price,
    seenAt: game.seenAt,
    addedAt: game.addedAt,
    lastPlayed: game.lastPlayed,
    updatedAt: game.updatedAt,
  };
  if (game.externalId) out.externalId = game.externalId;
  if (game.barcode) out.barcode = game.barcode;
  if (game.cover) out.cover = game.cover;
  for (const [k, v] of Object.entries(unknown)) if (!(k in out)) out[k] = v;
  return out;
}

/** What a collection file holds, read leniently. */
export interface ReadCollection {
  games: ReadGame[];
  /** Top-level fields this version does not know (kept). */
  unknown: Record<string, unknown>;
  /** Deleted games kept in the file, as they were. */
  trash: unknown[];
  problems: string[];
}

/** The collection file's content (already parsed JSON). Never throws. */
export function readCollection(raw: unknown, today: string): ReadCollection {
  const out: ReadCollection = { games: [], unknown: {}, trash: [], problems: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    out.problems.push('El archivo no es una colección.');
    return out;
  }
  const r = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(r))
    if (k !== 'version' && k !== 'games' && k !== 'trash') out.unknown[k] = v;
  if (Array.isArray(r.trash)) out.trash = r.trash;
  if (r.games !== undefined && !Array.isArray(r.games))
    out.problems.push('"games" no es una lista.');
  const list = Array.isArray(r.games) ? r.games : [];
  if (list.length > GAMES_MAX)
    out.problems.push(`Tiene ${list.length} juegos; solo se leen los primeros ${GAMES_MAX}.`);
  const seen = new Set<string>();
  list.slice(0, GAMES_MAX).forEach((item, i) => {
    const read = normalizeGame(item, today);
    if (!read) {
      out.problems.push(`El renglón ${i + 1} no es un juego.`);
      return;
    }
    if (!read.game.id || seen.has(read.game.id)) {
      // Missing or repeated id: a fresh one, made from the position so it is the same on every read
      let id = `x${String(i).padStart(4, '0')}`;
      while (seen.has(id)) id += 'x';
      read.problems.push(`no tenía un id propio; uso ${id}.`);
      read.game.id = id;
    }
    seen.add(read.game.id);
    for (const p of read.problems) out.problems.push(`${read.game.title}: ${p}`);
    out.games.push(read);
  });
  return out;
}

/**
 * Applies a save on top of what was there: the id and the date it came in stay; a wanted gap that becomes a game
 * ("¡Ya lo tengo!") comes into the collection today.
 */
export function mergeSave(
  previous: Game | undefined,
  next: Game,
  today: string,
  nowIso: string,
): Game {
  const game: Game = { ...next, updatedAt: nowIso };
  if (previous) {
    game.id = previous.id;
    game.addedAt = previous.addedAt;
    if (previous.wanted && !next.wanted) game.addedAt = today;
  } else game.addedAt = today;
  return game;
}

/** Title order for the shelves (Spanish, case and accents ignored), then id so it is stable. */
export const byTitle = (a: Game, b: Game): number =>
  a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true }) ||
  a.id.localeCompare(b.id);
