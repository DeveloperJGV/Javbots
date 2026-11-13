import type {
  PlaylistArtist,
  PlaylistDay,
  PlaylistRecipe,
  PlaylistSource,
} from '../../../../core/src/messages.js';
import { PLAYLIST_DECADES, PLAYLIST_MINUTES } from './constants.js';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The computer's own day as YYYY-MM-DD (lists are dated in local time). */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** A playlist's length: `58 min`, `1 h`, `1 h 02 min`. */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${pad2(m)} min`;
}

/** A created list's length in half hours, never "43 min": `30 min`, `1 h`, `1 h 30 min`, `2 h`. */
export function roundedDuration(ms: number): string {
  const halves = Math.max(1, Math.round(ms / 60_000 / 30));
  const h = Math.floor(halves / 2);
  if (h === 0) return '30 min';
  return halves % 2 === 0 ? `${h} h` : `${h} h 30 min`;
}

/** Every list the office made, newest day first (the server already sends them newest first). */
export function myLists(lists: PlaylistDay[]): PlaylistDay[] {
  return [...lists].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/** The songs the owner will keep after his edits: what remains plus what he added, by uri. */
export function draftSongs<T extends { uri: string }>(uris: string[], known: T[]): T[] {
  const byUri = new Map(known.map((s) => [s.uri, s]));
  return uris.map((u) => byUri.get(u)).filter((s): s is T => s !== undefined);
}

/** Total length of some songs. */
export const songsMs = (songs: Array<{ durationMs: number }>): number =>
  songs.reduce((t, s) => t + s.durationMs, 0);

/**
 * The preview's length, spoken in the length that was picked: `16 canciones · 1 h`. The exact length only as a
 * quiet extra when it reads differently (`dura 1 h 02 min`); null when it says the same.
 */
export function previewLength(
  songs: number,
  totalMs: number,
  targetMs: number,
): { main: string; exact: string | null } {
  const target = minutesLabel(Math.round(targetMs / 60_000));
  const exact = durationText(totalMs);
  return {
    main: `${songs} ${songs === 1 ? 'canción' : 'canciones'} · ${target}`,
    exact: exact === target ? null : `dura ${exact}`,
  };
}

/** A song's length: `3:07`. */
export function songDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** `2026-11-12` → `12 nov`. */
export function dayLabel(day: string): string {
  const [, mm, dd] = day.split('-').map(Number);
  if (!mm || !dd) return day;
  return `${dd} ${MONTHS[mm - 1] ?? ''}`.trim();
}

/** Lists from earlier days nobody decided on yet: the panel asks about these. Nothing is deleted on its own. */
export function pendingLists(lists: PlaylistDay[], today: string): PlaylistDay[] {
  return lists.filter((l) => !l.kept && l.day < today);
}

/** Today's lists, not kept yet. */
export function todayLists(lists: PlaylistDay[], today: string): PlaylistDay[] {
  return lists.filter((l) => !l.kept && l.day === today);
}

/** The kept ones, newest first. */
export function keptLists(lists: PlaylistDay[]): PlaylistDay[] {
  return lists.filter((l) => l.kept).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/** "a mi gusto" starting point: what I listen to most, 1 h, nothing new, no repeats from these days. */
export function emptyRecipe(): PlaylistRecipe {
  return {
    id: '',
    name: '',
    top: true,
    liked: false,
    surprise: false,
    playlists: [],
    artists: [],
    decades: [],
    minutes: 60,
    discover: false,
    avoidRecent: true,
  };
}

export function minutesLabel(minutes: number): string {
  return (
    PLAYLIST_MINUTES.find((m) => m.minutes === minutes)?.label ?? durationText(minutes * 60_000)
  );
}

/** One line: "Lo que más escucho + 2 listas · 80s, 90s · 1 h · con algo para descubrir". */
export function recipeSummary(recipe: PlaylistRecipe, playlists: PlaylistSource[]): string {
  const sources: string[] = [];
  if (recipe.top) sources.push('Lo que más escucho');
  if (recipe.liked) sources.push('Mis me gusta');
  if (recipe.surprise) sources.push('Sorpresa de mis listas');
  if (recipe.playlists.length === 1) {
    const name = playlists.find((p) => p.id === recipe.playlists[0])?.name;
    sources.push(name ?? '1 lista');
  } else if (recipe.playlists.length > 1) {
    sources.push(`${recipe.playlists.length} listas`);
  }
  if (recipe.artists.length === 1) sources.push(recipe.artists[0].name);
  else if (recipe.artists.length > 1) sources.push(`${recipe.artists.length} artistas`);

  const decades = [...recipe.decades]
    .sort((a, b) => a - b)
    .map((d) => PLAYLIST_DECADES.find((o) => o.decade === d)?.label ?? `${d}`);
  return [
    sources.length ? sources.join(' + ') : 'Sin fuente',
    decades.length ? decades.join(', ') : 'cualquier década',
    minutesLabel(recipe.minutes),
    recipe.discover ? 'con algo para descubrir' : 'solo lo mío',
  ].join(' · ');
}

/** Has at least one place to take songs from. */
export function canBuild(recipe: PlaylistRecipe): boolean {
  return (
    recipe.top ||
    recipe.liked ||
    recipe.surprise ||
    recipe.playlists.length > 0 ||
    recipe.artists.length > 0
  );
}

export function togglePlaylist(recipe: PlaylistRecipe, id: string): PlaylistRecipe {
  const on = recipe.playlists.includes(id);
  return {
    ...recipe,
    playlists: on ? recipe.playlists.filter((p) => p !== id) : [...recipe.playlists, id],
  };
}

export function toggleArtist(recipe: PlaylistRecipe, artist: PlaylistArtist): PlaylistRecipe {
  const on = recipe.artists.some((a) => a.id === artist.id);
  return {
    ...recipe,
    artists: on
      ? recipe.artists.filter((a) => a.id !== artist.id)
      : [...recipe.artists, { id: artist.id, name: artist.name }],
  };
}

export function toggleDecade(recipe: PlaylistRecipe, decade: number): PlaylistRecipe {
  const on = recipe.decades.includes(decade);
  return {
    ...recipe,
    decades: on
      ? recipe.decades.filter((d) => d !== decade)
      : [...recipe.decades, decade].sort((a, b) => a - b),
  };
}
