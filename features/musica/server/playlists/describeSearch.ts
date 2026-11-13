import type { PlaylistArtist, PlaylistSource } from '../../../../core/src/messages.js';
import {
  PLAYLIST_ARTIST_NEWEST_ALBUMS,
  PLAYLIST_ARTIST_RANDOM_ALBUMS,
  PLAYLIST_SCORE,
  PLAYLIST_SEARCH_ARTISTS,
  PLAYLIST_SEARCH_MAX_CALLS,
  PLAYLIST_SEARCH_OWN_LISTS,
  PLAYLIST_SEARCH_PUBLIC_LISTS,
  PLAYLIST_SEARCH_TRACK_PAGES,
  SPOTIFY_SEARCH_LIMIT,
} from '../constants.js';
import { SpotifyError } from '../spotifyApi.js';
import {
  containsWords,
  type Description,
  fold,
  inYears,
  nameScore,
  nameWords,
  originText,
  searchQuery,
} from './describe.js';
import { type PoolSong, type ScoredSong, shuffle } from './generator.js';
import type { ArtistAlbum, SpotifyPlaylists } from './spotifyPlaylists.js';

/** Where a song was found: `pub:<id>`, `own:<id>`, `artist:<name>`, `search`, `mine`. */
export type Tags = Map<string, Set<string>>;

/** The songs a description found, with their points and where each came from. */
export interface Material {
  scored: ScoredSong[];
  tags: Tags;
  /** URIs of the owner's own songs (top, liked, his lists) among what was read. */
  mine: Set<string>;
  /** Something the owner should know (Spotify asked to wait, public lists can't be read). */
  note?: string;
}

/** What the search needs from the playlist feature (its caches and the Spotify calls). */
export interface SearchContext {
  api: SpotifyPlaylists;
  rng: () => number;
  /** Cached song pools ('top', 'liked', 'list:<id>'). */
  cached: (key: string, load: () => Promise<PoolSong[]>) => Promise<PoolSong[]>;
  /** A pool only if it is already cached (no call). */
  peek: (key: string) => PoolSong[] | undefined;
  sources: () => Promise<{ playlists: PlaylistSource[]; artists: PlaylistArtist[] }>;
  albumsOf: (artistId: string) => Promise<ArtistAlbum[]>;
  albumSongs: (album: ArtistAlbum) => Promise<PoolSong[]>;
  /** Public lists turned out unreadable this session (Spotify: only one's own lists). */
  publicLocked: () => boolean;
  lockPublic: () => void;
}

/** Spotify said "not now": stop searching, keep what was found. Permission problems go up. */
function stops(err: unknown): boolean {
  if (err instanceof SpotifyError) {
    if (err.kind === 'permission' || err.kind === 'no-session') throw err;
    return err.kind === 'rate-limit' || err.kind === 'network';
  }
  throw err;
}

/**
 * Looks for a description in Spotify by rules: the owner's lists whose name matches, public lists with a similar
 * name (their songs, counted across lists), songs that match the words, and albums of artists named in the text.
 * The owner's own songs climb. Calls are capped (PLAYLIST_SEARCH_MAX_CALLS); unreadable things are skipped.
 */
export async function gatherDescribed(ctx: SearchContext, d: Description): Promise<Material> {
  const { api } = ctx;
  let calls = PLAYLIST_SEARCH_MAX_CALLS;
  let stopped = false;
  let publicBlocked = false;
  const entries = new Map<string, ScoredSong>();
  const tags: Tags = new Map();
  const tag = (uri: string, t: string) => {
    const set = tags.get(uri) ?? new Set<string>();
    set.add(t);
    tags.set(uri, set);
  };
  const add = (song: PoolSong, points: number, t: string) => {
    if (!inYears(song.year, d.years)) return;
    const hit = entries.get(song.uri);
    if (hit) hit.score += points;
    else entries.set(song.uri, { song, score: points });
    tag(song.uri, t);
  };
  /** Runs an optional step; a "wait" from Spotify ends the search. */
  const step = async (cost: number, fn: () => Promise<void>) => {
    if (stopped || calls < cost) return;
    calls -= cost;
    try {
      await fn();
    } catch (err) {
      if (stops(err)) stopped = true;
    }
  };

  // ── The owner's own songs ──
  const top = await ctx.cached('top', () => api.topTracks());
  const liked =
    d.liked || d.onlyMine
      ? await ctx.cached('liked', () => api.likedSongs())
      : (ctx.peek('liked') ?? []);
  const mine = new Set<string>([...top, ...liked].map((s) => s.uri));
  const own = [...top, ...liked];

  // His lists whose name matches.
  const words = nameWords(d);
  const src = await ctx.sources();
  if (words.length > 0) {
    const matching = src.playlists
      .map((p) => ({ p, score: nameScore(p.name, words) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, PLAYLIST_SEARCH_OWN_LISTS);
    for (const { p } of matching) {
      await step(0, async () => {
        const songs = await ctx.cached(`list:${p.id}`, () => api.playlistSongs(p.id));
        for (const s of songs) {
          mine.add(s.uri);
          own.push(s);
          add(s, PLAYLIST_SCORE.ownList, `own:${p.id}`);
        }
      });
    }
  }

  // ── Artists named in the text ──
  const named: PlaylistArtist[] = [];
  const consider = (a: PlaylistArtist) => {
    if (named.length >= PLAYLIST_SEARCH_ARTISTS || named.some((x) => x.id === a.id)) return;
    if (containsWords(d.text, a.name)) named.push(a);
  };
  for (const a of src.artists) consider(a);
  for (const s of own) {
    const first = s.artist.split(', ')[0];
    if (first && /^[0-9A-Za-z]{10,}$/.test(s.artistKey)) consider({ id: s.artistKey, name: first });
  }
  if (!d.onlyMine && named.length < PLAYLIST_SEARCH_ARTISTS && d.keywords.length > 0) {
    await step(1, async () => {
      for (const a of await api.searchArtists(d.keywords.join(' '))) consider(a);
    });
  }
  for (const artist of named) {
    for (const s of own)
      if (s.artistKey === artist.id) add(s, PLAYLIST_SCORE.namedArtist, `artist:${artist.name}`);
    if (d.onlyMine) continue;
    await step(1, async () => {
      const all = [...(await ctx.albumsOf(artist.id))].sort((x, y) =>
        y.releaseDate.localeCompare(x.releaseDate),
      );
      const picked = [
        ...all.slice(0, PLAYLIST_ARTIST_NEWEST_ALBUMS),
        ...shuffle(all.slice(PLAYLIST_ARTIST_NEWEST_ALBUMS), ctx.rng).slice(
          0,
          PLAYLIST_ARTIST_RANDOM_ALBUMS,
        ),
      ];
      for (const album of picked) {
        if (calls <= 0) break;
        calls--;
        for (const s of await ctx.albumSongs(album))
          add(s, PLAYLIST_SCORE.namedArtist, `artist:${artist.name}`);
      }
    });
  }

  if (!d.onlyMine) {
    // ── Public lists with a similar name: their songs, counted across lists ──
    const listQuery = searchQuery(d, { year: false });
    if (listQuery && !ctx.publicLocked()) {
      await step(1, async () => {
        const me = await api.myId();
        const found = (await api.searchPlaylists(listQuery))
          .filter((p) => p.ownerId !== me)
          .map((p) => ({ p, score: nameScore(`${p.name} ${p.description}`, words) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, PLAYLIST_SEARCH_PUBLIC_LISTS);
        for (const { p } of found) {
          if (stopped || calls < 1) break;
          calls--;
          try {
            for (const s of await api.playlistSongs(p.id, 2))
              add(s, PLAYLIST_SCORE.publicList, `pub:${p.id}`);
          } catch (err) {
            if (err instanceof SpotifyError && err.kind === 'forbidden') {
              // Spotify only lets an app read the user's own lists: don't try again this session.
              ctx.lockPublic();
              publicBlocked = true;
              break;
            }
            if (err instanceof SpotifyError && err.kind === 'not-found') continue;
            if (stops(err)) stopped = true;
            break;
          }
        }
      });
    }

    // ── Songs that match the words (with genre / year filters) ──
    const queries: string[] = [];
    const full = searchQuery(d);
    if (full) queries.push(full);
    const filtersOnly = searchQuery(d, { keywords: false });
    if (filtersOnly && filtersOnly !== full) queries.push(filtersOnly);
    let searched = 0;
    for (const q of queries) {
      if (q !== full && searched >= SPOTIFY_SEARCH_LIMIT) break;
      for (let page = 0; page < PLAYLIST_SEARCH_TRACK_PAGES; page++) {
        let more = false;
        await step(1, async () => {
          const res = await api.searchTracks(q, page * SPOTIFY_SEARCH_LIMIT);
          for (const s of res.songs) {
            searched++;
            add(s, PLAYLIST_SCORE.trackSearch, 'search');
          }
          more = res.more;
        });
        if (!more) break;
      }
    }
  }

  // ── Only his: his songs that fit (all of them when nothing narrower was found) ──
  if (d.onlyMine) {
    const narrowed = entries.size > 0;
    for (const s of own) {
      const hay = fold(`${s.title} ${s.album ?? ''} ${s.artist}`);
      const hits = d.keywords.filter((w) => ` ${hay} `.includes(` ${w} `)).length;
      if (hits > 0) add(s, hits, 'mine');
      else if (!narrowed) add(s, 0, 'mine');
    }
  }

  // ── His songs climb; "only his" drops the rest; "to discover" drops his ──
  const scored: ScoredSong[] = [];
  for (const e of entries.values()) {
    const isMine = mine.has(e.song.uri);
    if (d.onlyMine && !isMine) continue;
    if (d.discover && isMine) continue;
    if (isMine) {
      e.score += PLAYLIST_SCORE.mine;
      tag(e.song.uri, 'mine');
    }
    scored.push({ song: isMine ? e.song : { ...e.song, discover: true }, score: e.score });
  }
  const notes: string[] = [];
  if (stopped) notes.push('Spotify pidió esperar: armé con lo que alcancé a encontrar');
  if (publicBlocked)
    notes.push('Spotify no deja leer listas de otras personas; busqué canciones y artistas');
  return { scored, tags, mine, ...(notes.length ? { note: notes.join('. ') } : {}) };
}

/** "De 6 listas públicas parecidas y 9 canciones tuyas", from the songs that made it into the list. */
export function describeOrigin(songs: PoolSong[], material: Material): string {
  const pub = new Set<string>();
  const ownLists = new Set<string>();
  const artists = new Set<string>();
  let searched = 0;
  let mine = 0;
  for (const s of songs) {
    const t = material.tags.get(s.uri);
    if (!t) continue;
    for (const x of t) {
      if (x.startsWith('pub:')) pub.add(x);
      else if (x.startsWith('own:')) ownLists.add(x);
      else if (x.startsWith('artist:')) artists.add(x.slice('artist:'.length));
    }
    if (t.has('search')) searched++;
    if (material.mine.has(s.uri)) mine++;
  }
  return originText({
    publicLists: pub.size,
    ownLists: ownLists.size,
    searched,
    artists: [...artists],
    mine,
  });
}
