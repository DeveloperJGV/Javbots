import type { PlaylistArtist, PlaylistSource } from '../../../../core/src/messages.js';
import {
  PLAYLIST_LIKED_MAX_PAGES,
  PLAYLIST_MY_LISTS_MAX_PAGES,
  PLAYLIST_SOURCE_MAX_PAGES,
  SPOTIFY_ADD_BATCH,
  SPOTIFY_ARTIST_ALBUMS_LIMIT,
  SPOTIFY_CONTAINS_MAX,
  SPOTIFY_DESCRIPTION_MAX,
  SPOTIFY_PAGE_ITEMS,
  SPOTIFY_PAGE_SMALL,
  SPOTIFY_SEARCH_LIMIT,
} from '../constants.js';
import type { SpotifyApi } from '../spotifyApi.js';
import type { PoolSong } from './generator.js';

/** An album of an artist (enough to fetch its songs and pick the newest). */
export interface ArtistAlbum {
  id: string;
  name: string;
  year?: number;
  releaseDate: string;
}

/** A playlist found by /search (public, usually someone else's). */
export interface FoundPlaylist {
  id: string;
  name: string;
  description: string;
  ownerId: string;
}

type Json = Record<string, unknown>;
type Request = SpotifyApi['request'];

const TOP_RANGES = ['short_term', 'medium_term', 'long_term'];

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function yearOf(releaseDate: unknown): number | undefined {
  const year = Number(str(releaseDate)?.slice(0, 4));
  return Number.isInteger(year) && year > 1800 ? year : undefined;
}

/**
 * A Spotify track (full or simplified) → a song of the material; undefined for local files, episodes and anything
 * without a `spotify:track:` uri. Simplified tracks (an album's) take the album from `parent`.
 */
export function toPoolSong(
  raw: unknown,
  parent?: { name?: string; year?: number },
): PoolSong | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = raw as Json;
  const uri = str(t.uri);
  if (!uri?.startsWith('spotify:track:') || t.is_local === true) return undefined;
  const title = str(t.name);
  if (!title) return undefined;
  const artists = Array.isArray(t.artists) ? (t.artists as Json[]) : [];
  const names = artists.map((a) => str(a?.name)).filter((n): n is string => Boolean(n));
  const first = artists[0];
  const album = t.album as Json | undefined;
  const albumName = str(album?.name) ?? parent?.name;
  const year = album ? yearOf(album.release_date) : parent?.year;
  return {
    uri,
    title,
    artist: names.join(', '),
    ...(albumName ? { album: albumName } : {}),
    ...(year !== undefined ? { year } : {}),
    durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : 0,
    artistKey: str(first?.id) ?? (names[0] ?? '').toLowerCase(),
  };
}

/** One line, no angle brackets, within Spotify's limit. */
export function clipDescription(text: string): string {
  return text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, SPOTIFY_DESCRIPTION_MAX);
}

/** The "Playlist del día" calls, over `spotify.request` (errors are SpotifyError). */
export function createSpotifyPlaylists(request: Request) {
  let me: string | undefined;

  /** Follows `next` up to `maxPages`, collecting `items`. */
  async function pages(path: string, query: Record<string, string | number>, maxPages: number) {
    const items: unknown[] = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const json = (await request(path, { query: { ...query, offset } })) as Json | undefined;
      const batch = Array.isArray(json?.items) ? (json.items as unknown[]) : [];
      items.push(...batch);
      if (!json?.next || batch.length === 0) break;
      offset += batch.length;
    }
    return items;
  }

  async function myId(): Promise<string> {
    if (me) return me;
    const json = (await request('/me')) as Json | undefined;
    me = str(json?.id) ?? '';
    return me;
  }

  /** Only the owner's lists (not the ones he follows): those are his taste. */
  async function myPlaylists(): Promise<PlaylistSource[]> {
    const id = await myId();
    const items = await pages(
      '/me/playlists',
      { limit: SPOTIFY_PAGE_SMALL },
      PLAYLIST_MY_LISTS_MAX_PAGES,
    );
    const out: PlaylistSource[] = [];
    for (const raw of items as Json[]) {
      if (!raw || str((raw.owner as Json | undefined)?.id) !== id) continue;
      const listId = str(raw.id);
      const name = str(raw.name);
      if (!listId || !name) continue;
      const counter = (raw.items ?? raw.tracks) as Json | undefined;
      const count = typeof counter?.total === 'number' ? counter.total : undefined;
      out.push({ id: listId, name, ...(count !== undefined ? { count } : {}) });
    }
    return out;
  }

  /** Each element brings the song in `item` (formerly `track`): both are accepted. */
  const fromEntries = (items: unknown[]) =>
    (items as Json[])
      .map((e) => toPoolSong(e?.item ?? e?.track))
      .filter((s): s is PoolSong => Boolean(s));

  async function playlistSongs(
    id: string,
    maxPages: number = PLAYLIST_SOURCE_MAX_PAGES,
  ): Promise<PoolSong[]> {
    const items = await pages(
      `/playlists/${encodeURIComponent(id)}/items`,
      { limit: SPOTIFY_PAGE_ITEMS },
      maxPages,
    );
    return fromEntries(items);
  }

  async function topTracks(): Promise<PoolSong[]> {
    const seen = new Set<string>();
    const out: PoolSong[] = [];
    for (const range of TOP_RANGES) {
      const json = (await request('/me/top/tracks', {
        query: { limit: SPOTIFY_PAGE_SMALL, time_range: range },
      })) as Json | undefined;
      for (const raw of Array.isArray(json?.items) ? json.items : []) {
        const song = toPoolSong(raw);
        if (song && !seen.has(song.uri)) {
          seen.add(song.uri);
          out.push(song);
        }
      }
    }
    return out;
  }

  async function topArtists(): Promise<PlaylistArtist[]> {
    const json = (await request('/me/top/artists', {
      query: { limit: SPOTIFY_PAGE_SMALL, time_range: 'medium_term' },
    })) as Json | undefined;
    const out: PlaylistArtist[] = [];
    for (const a of (Array.isArray(json?.items) ? json.items : []) as Json[]) {
      const id = str(a?.id);
      const name = str(a?.name);
      if (id && name) out.push({ id, name });
    }
    return out;
  }

  async function likedSongs(): Promise<PoolSong[]> {
    const items = await pages(
      '/me/tracks',
      { limit: SPOTIFY_PAGE_SMALL },
      PLAYLIST_LIKED_MAX_PAGES,
    );
    return fromEntries(items);
  }

  async function artistAlbums(artistId: string): Promise<ArtistAlbum[]> {
    const json = (await request(`/artists/${encodeURIComponent(artistId)}/albums`, {
      query: { include_groups: 'album,single', limit: SPOTIFY_ARTIST_ALBUMS_LIMIT },
    })) as Json | undefined;
    const out: ArtistAlbum[] = [];
    for (const a of (Array.isArray(json?.items) ? json.items : []) as Json[]) {
      const id = str(a?.id);
      const name = str(a?.name);
      if (!id || !name) continue;
      const releaseDate = str(a.release_date) ?? '';
      const year = yearOf(releaseDate);
      out.push({ id, name, releaseDate, ...(year !== undefined ? { year } : {}) });
    }
    return out;
  }

  async function albumSongs(album: ArtistAlbum): Promise<PoolSong[]> {
    const json = (await request(`/albums/${encodeURIComponent(album.id)}/tracks`, {
      query: { limit: SPOTIFY_PAGE_SMALL },
    })) as Json | undefined;
    return (Array.isArray(json?.items) ? json.items : [])
      .map((raw) => toPoolSong(raw, { name: album.name, year: album.year }))
      .filter((s): s is PoolSong => Boolean(s));
  }

  /** A new list in the owner's account (`public: false` only keeps it off his profile). */
  async function createPlaylist(
    name: string,
    description: string,
  ): Promise<{ id: string; url?: string }> {
    const json = (await request('/me/playlists', {
      method: 'POST',
      body: { name, public: false, description: clipDescription(description) },
    })) as Json | undefined;
    const id = str(json?.id);
    if (!id) throw new Error('spotify: la lista nueva no trae id');
    const url = str((json?.external_urls as Json | undefined)?.spotify);
    return { id, ...(url ? { url } : {}) };
  }

  async function addSongs(id: string, uris: string[]): Promise<void> {
    for (let i = 0; i < uris.length; i += SPOTIFY_ADD_BATCH) {
      await request(`/playlists/${encodeURIComponent(id)}/items`, {
        method: 'POST',
        body: { uris: uris.slice(i, i + SPOTIFY_ADD_BATCH) },
      });
    }
  }

  /** Takes the list out of the owner's library (what "deleting" a list is in Spotify). */
  async function removePlaylist(id: string): Promise<void> {
    await request('/me/library', { method: 'DELETE', query: { uris: `spotify:playlist:${id}` } });
  }

  /** One page of /search (at most 10 per page since 2026). Null items (removed content) are dropped. */
  async function search(type: 'track' | 'artist' | 'playlist', q: string, offset = 0) {
    const json = (await request('/search', {
      query: { q, type, limit: SPOTIFY_SEARCH_LIMIT, offset },
    })) as Json | undefined;
    const block = json?.[`${type}s`] as Json | undefined;
    const items = Array.isArray(block?.items) ? (block.items as unknown[]) : [];
    return {
      items: items.filter((i) => i && typeof i === 'object') as Json[],
      more: !!block?.next,
    };
  }

  async function searchTracks(
    q: string,
    offset = 0,
  ): Promise<{ songs: PoolSong[]; more: boolean }> {
    const page = await search('track', q, offset);
    return {
      songs: page.items.map((t) => toPoolSong(t)).filter((x): x is PoolSong => Boolean(x)),
      more: page.more,
    };
  }

  async function searchArtists(q: string): Promise<PlaylistArtist[]> {
    const page = await search('artist', q);
    const out: PlaylistArtist[] = [];
    for (const a of page.items) {
      const id = str(a.id);
      const name = str(a.name);
      if (id && name) out.push({ id, name });
    }
    return out;
  }

  async function searchPlaylists(q: string): Promise<FoundPlaylist[]> {
    const page = await search('playlist', q);
    const out: FoundPlaylist[] = [];
    for (const p of page.items) {
      const id = str(p.id);
      const name = str(p.name);
      if (!id || !name) continue;
      out.push({
        id,
        name,
        description: str(p.description) ?? '',
        ownerId: str((p.owner as Json | undefined)?.id) ?? '',
      });
    }
    return out;
  }

  /** Renames a list the owner owns. */
  async function renamePlaylist(id: string, name: string): Promise<void> {
    await request(`/playlists/${encodeURIComponent(id)}`, { method: 'PUT', body: { name } });
  }

  /** Changes a list's description (clipped to Spotify's limit). */
  async function describePlaylist(id: string, description: string): Promise<void> {
    await request(`/playlists/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: { description: clipDescription(description) },
    });
  }

  /** Takes songs out of a list (every copy of each uri). */
  async function removeSongs(id: string, uris: string[]): Promise<void> {
    for (let i = 0; i < uris.length; i += SPOTIFY_ADD_BATCH) {
      await request(`/playlists/${encodeURIComponent(id)}/items`, {
        method: 'DELETE',
        body: { items: uris.slice(i, i + SPOTIFY_ADD_BATCH).map((uri) => ({ uri })) },
      });
    }
  }

  /** Which of these lists are still in the owner's library (true/false per id, in order). */
  async function inLibrary(ids: string[]): Promise<boolean[]> {
    const out: boolean[] = [];
    for (let i = 0; i < ids.length; i += SPOTIFY_CONTAINS_MAX) {
      const batch = ids.slice(i, i + SPOTIFY_CONTAINS_MAX);
      const json = await request('/me/library/contains', {
        query: { uris: batch.map((id) => `spotify:playlist:${id}`).join(',') },
      });
      const answers = Array.isArray(json) ? json : [];
      // Anything unclear counts as "still there": a list is never marked gone by mistake.
      batch.forEach((_, j) => out.push(answers[j] !== false));
    }
    return out;
  }

  async function play(id: string): Promise<void> {
    await request('/me/player/play', {
      method: 'PUT',
      body: { context_uri: `spotify:playlist:${id}` },
    });
  }

  return {
    myId,
    myPlaylists,
    playlistSongs,
    topTracks,
    topArtists,
    likedSongs,
    artistAlbums,
    albumSongs,
    createPlaylist,
    addSongs,
    removePlaylist,
    play,
    searchTracks,
    searchArtists,
    searchPlaylists,
    renamePlaylist,
    describePlaylist,
    removeSongs,
    inLibrary,
  };
}

export type SpotifyPlaylists = ReturnType<typeof createSpotifyPlaylists>;
