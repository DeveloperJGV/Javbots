import type {
  PlaylistArtist,
  PlaylistBusy,
  PlaylistDay,
  PlaylistImproveMode,
  PlaylistRecipe,
  PlaylistSong,
  PlaylistSource,
  PlaylistStatus,
} from '../../../../core/src/messages.js';
import type { FeatureClient } from '../../../../server/src/serverFeature.js';
import {
  LOG_PREFIX,
  PLAYLIST_ALBUMS_TTL_MS,
  PLAYLIST_ARTIST_NEWEST_ALBUMS,
  PLAYLIST_ARTIST_RANDOM_ALBUMS,
  PLAYLIST_CHECK_TTL_MS,
  PLAYLIST_DESCRIPTION,
  PLAYLIST_DISCOVER_ALBUMS,
  PLAYLIST_DISCOVER_ARTISTS,
  PLAYLIST_DISCOVER_SHARE,
  PLAYLIST_DURATION_SLACK_MS,
  PLAYLIST_FOUND_MAX,
  PLAYLIST_IMPROVE_DISCOVER_SHARE,
  PLAYLIST_IMPROVE_MORE_MS,
  PLAYLIST_LIST_NAME_MAX,
  PLAYLIST_MINUTES,
  PLAYLIST_POOL_TTL_MS,
  PLAYLIST_RECENT_DAYS,
  PLAYLIST_RECIPES_MAX,
  PLAYLIST_REJECTED_MAX,
  PLAYLIST_REQUEST_MAX,
  PLAYLIST_SCORE_JITTER,
  PLAYLIST_SOURCES_TTL_MS,
  PLAYLIST_SURPRISE_LISTS,
  SPOTIFY_PLAYLIST_SCOPES,
} from '../constants.js';
import { type SpotifyApi, SpotifyError } from '../spotifyApi.js';
import { parseDescription, requestTitle, snapMinutes } from './describe.js';
import { describeOrigin, gatherDescribed, type Material } from './describeSearch.js';
import {
  buildPlaylist,
  buildRanked,
  cleanRecipe,
  DEFAULT_RECIPES,
  inDecades,
  localDay,
  playlistName,
  type PoolSong,
  replaceSong,
  type ScoredSong,
  shuffle,
} from './generator.js';
import {
  type CreatedList,
  type PlaylistData,
  pruneData,
  readPlaylistData,
  type StoredRequest,
  writePlaylistData,
} from './playlistData.js';
import {
  type ArtistAlbum,
  createSpotifyPlaylists,
  type SpotifyPlaylists,
} from './spotifyPlaylists.js';

export interface PlaylistsOptions {
  /** The account's Web API client (undefined when music.json has no Spotify app). */
  spotify: SpotifyApi | undefined;
  /** Called whenever the status changes (the music feature sends it to privileged clients). */
  onChange: () => void;
  now?: () => number;
  rng?: () => number;
  /** The Spotify calls (tests may pass their own); default: over `spotify.request`. */
  api?: SpotifyPlaylists;
}

/** The preview the owner is looking at, with the material it came from (rerolls reuse it). */
interface Preview {
  recipe: PlaylistRecipe;
  targetMs: number;
  songs: PoolSong[];
  own: PoolSong[];
  discover: PoolSong[];
  gatheredAt: number;
  /** Discovering failed: the preview goes with the owner's songs only. */
  discoverNote?: string;
  /** Built from a typed description: what it found (rerolls and "esta no" reuse it). */
  material?: Material;
  origin?: string;
  /** What gets stored with the list (to improve it later). */
  request: StoredRequest;
}

/** What "improve" would do to a list, waiting for the owner's OK. */
interface Proposal {
  id: string;
  label: string;
  remove: PoolSong[];
  add: PoolSong[];
  totalMs: number;
  note?: string;
  /** The list's request after applying (e.g. a typed wish joins the description). */
  request: StoredRequest;
}

const IMPROVE_LABELS: Record<Exclude<PlaylistImproveMode, 'text'>, string> = {
  more: 'Más canciones (+30 min)',
  bin: 'Cambia las que mandé al bote',
  reroll: 'Otra tirada con la misma idea',
  discover: 'Más para descubrir',
};

const DAY_MS = 24 * 60 * 60_000;
const MINUTE_MS = 60_000;
const IMPROVE_MODES: readonly string[] = ['more', 'bin', 'reroll', 'discover', 'text'];

/** What the owner reads when a Spotify call fails. */
export function describeError(err: unknown): string {
  if (err instanceof SpotifyError) {
    switch (err.kind) {
      case 'no-session':
        return 'Conecta Spotify en Ajustes → Música';
      case 'permission':
        return 'Falta el permiso de playlists: vuelve a conectar Spotify';
      case 'rate-limit': {
        const minutes = Math.max(1, Math.ceil((err.retryAfterSec ?? 60) / 60));
        return `Spotify pide esperar ${minutes} min antes de seguir`;
      }
      case 'forbidden':
        return 'Spotify no dejó hacer eso con esta cuenta';
      case 'not-found':
        return 'Spotify no encontró lo que se pidió';
      case 'network':
        return 'No se pudo hablar con Spotify: revisa la conexión';
      case 'http':
        return `Spotify respondió con un error (${err.status ?? '?'}); intenta de nuevo`;
    }
  }
  return 'Algo salió mal al hablar con Spotify';
}

const toSong = (s: PoolSong): PlaylistSong => {
  const { artistKey: _key, ...song } = s;
  return song;
};

/**
 * "Playlist del día": the owner picks with buttons, the office builds a list by rules (no AI), creates it in his
 * Spotify, and he keeps it or deletes it. State lives in ~/.pixel-agents/playlists.json; every command is the
 * owner's (privileged clients only).
 */
export function createPlaylists(opts: PlaylistsOptions) {
  const now = opts.now ?? Date.now;
  const rng = opts.rng ?? Math.random;
  const spotify = opts.spotify;
  const api: SpotifyPlaylists | undefined =
    opts.api ?? (spotify ? createSpotifyPlaylists(spotify.request) : undefined);
  let data: PlaylistData = readPlaylistData(now());
  let busy: PlaylistBusy | undefined;
  let error: string | undefined;
  let note: string | undefined;
  /** A call answered "missing scope": the session predates the playlist permissions. */
  let permissionDenied = false;
  let sources: { playlists: PlaylistSource[]; artists: PlaylistArtist[]; at: number } | undefined;
  let preview: Preview | undefined;
  /** A created list open to modify, the last song search, and an improvement waiting for an OK. */
  let editing: { id: string; name: string; songs: PoolSong[] } | undefined;
  let found: PoolSong[] = [];
  let proposal: Proposal | undefined;
  /** Spotify refused reading someone else's list: public lists are not tried again this session. */
  let publicLocked = false;
  let checkedAt = -Infinity;
  /** Songs per source ('top', 'liked', 'list:<id>', 'album:<id>'). */
  const pools = new Map<string, { at: number; songs: PoolSong[] }>();
  const albums = new Map<string, { at: number; albums: ArtistAlbum[] }>();
  /** The command running now (tests await it). */
  let running: Promise<void> = Promise.resolve();

  const connected = () => spotify?.connected() ?? false;

  function needsReconnect(): boolean {
    if (!connected()) return false;
    if (permissionDenied) return true;
    const granted = spotify?.scopes();
    return granted !== undefined && SPOTIFY_PLAYLIST_SCOPES.some((s) => !granted.includes(s));
  }

  function save(): void {
    data = pruneData(data, now());
    writePlaylistData(data);
  }

  function status(): PlaylistStatus {
    const lists: PlaylistDay[] = data.lists
      .filter((l) => !l.removedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => ({
        id: l.id,
        name: l.name,
        day: l.day,
        kept: l.kept,
        count: l.count,
        totalMs: l.totalMs,
        ...(l.url ? { url: l.url } : {}),
        ...(madeWith(l) ? { madeWith: madeWith(l) } : {}),
        ...(l.missing ? { missing: true } : {}),
      }));
    const rejected: PlaylistSong[] = [...data.rejected]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((r) => ({ uri: r.uri, title: r.title, artist: r.artist, durationMs: r.durationMs }));
    return {
      type: 'playlistStatus',
      configured: spotify !== undefined,
      connected: connected(),
      needsReconnect: needsReconnect(),
      ...(busy ? { busy } : {}),
      ...(error ? { error } : {}),
      ...(note ? { note } : {}),
      playlists: sources?.playlists ?? [],
      artists: sources?.artists ?? [],
      recipes: data.recipes,
      ...(preview
        ? {
            preview: {
              recipeName: preview.recipe.name,
              targetMs: preview.targetMs,
              totalMs: preview.songs.reduce((sum, s) => sum + s.durationMs, 0),
              songs: preview.songs.map(toSong),
              ...(preview.request.text ? { request: preview.request.text } : {}),
              ...(preview.origin ? { origin: preview.origin } : {}),
            },
          }
        : {}),
      lists,
      rejected,
      autoPlay: data.autoPlay,
      ...(editing
        ? { editing: { id: editing.id, name: editing.name, songs: editing.songs.map(toSong) } }
        : {}),
      ...(found.length ? { found: found.map(toSong) } : {}),
      ...(proposal
        ? {
            proposal: {
              id: proposal.id,
              label: proposal.label,
              remove: proposal.remove.map(toSong),
              add: proposal.add.map(toSong),
              totalMs: proposal.totalMs,
              ...(proposal.note ? { note: proposal.note } : {}),
            },
          }
        : {}),
    };
  }

  /** Runs one Spotify job with the panel showing `kind`; failures become the owner-facing `error`. */
  function run(kind: PlaylistBusy, job: () => Promise<void>): void {
    busy = kind;
    error = undefined;
    note = undefined;
    opts.onChange();
    running = (async () => {
      try {
        await job();
      } catch (err) {
        if (err instanceof SpotifyError && err.kind === 'permission') {
          // The panel shows its own "connect again" notice.
          permissionDenied = true;
        } else {
          error = describeError(err);
          console.warn(`${LOG_PREFIX} Playlist: ${(err as Error).message}`);
        }
      } finally {
        busy = undefined;
        opts.onChange();
      }
    })();
  }

  async function loadSources(force = false): Promise<NonNullable<typeof sources>> {
    if (!api) throw new SpotifyError('no-session', 'spotify: sin sesión');
    if (sources && !force && now() - sources.at < PLAYLIST_SOURCES_TTL_MS) return sources;
    const playlists = await api.myPlaylists();
    const artists = await api.topArtists();
    sources = { playlists, artists, at: now() };
    return sources;
  }

  async function cached(
    key: string,
    ttl: number,
    load: () => Promise<PoolSong[]>,
  ): Promise<PoolSong[]> {
    const hit = pools.get(key);
    if (hit && now() - hit.at < ttl) return hit.songs;
    const songs = await load();
    pools.set(key, { at: now(), songs });
    return songs;
  }

  async function albumsOf(artistId: string): Promise<ArtistAlbum[]> {
    const hit = albums.get(artistId);
    if (hit && now() - hit.at < PLAYLIST_ALBUMS_TTL_MS) return hit.albums;
    const list = await api!.artistAlbums(artistId);
    albums.set(artistId, { at: now(), albums: list });
    return list;
  }

  const albumSongs = (album: ArtistAlbum) =>
    cached(`album:${album.id}`, PLAYLIST_ALBUMS_TTL_MS, () => api!.albumSongs(album));

  /** The owner's material for a recipe. */
  async function gatherOwn(recipe: PlaylistRecipe): Promise<PoolSong[]> {
    const a = api!;
    const own: PoolSong[] = [];
    if (recipe.top) own.push(...(await cached('top', PLAYLIST_POOL_TTL_MS, () => a.topTracks())));
    if (recipe.liked)
      own.push(...(await cached('liked', PLAYLIST_POOL_TTL_MS, () => a.likedSongs())));
    let listIds: string[] = [];
    if (recipe.playlists.length > 0 || recipe.surprise) {
      const mine = (await loadSources()).playlists;
      // Only the owner's own lists: an id from elsewhere is ignored.
      listIds = recipe.playlists.filter((id) => mine.some((p) => p.id === id));
      if (recipe.surprise) {
        const extra = shuffle(
          mine.filter((p) => !listIds.includes(p.id)),
          rng,
        ).slice(0, PLAYLIST_SURPRISE_LISTS);
        listIds.push(...extra.map((p) => p.id));
      }
    }
    for (const id of listIds)
      own.push(...(await cached(`list:${id}`, PLAYLIST_POOL_TTL_MS, () => a.playlistSongs(id))));
    for (const artist of recipe.artists) {
      const all = [...(await albumsOf(artist.id))].sort((x, y) =>
        y.releaseDate.localeCompare(x.releaseDate),
      );
      const newest = all.slice(0, PLAYLIST_ARTIST_NEWEST_ALBUMS);
      const random = shuffle(all.slice(PLAYLIST_ARTIST_NEWEST_ALBUMS), rng).slice(
        0,
        PLAYLIST_ARTIST_RANDOM_ALBUMS,
      );
      for (const album of [...newest, ...random]) own.push(...(await albumSongs(album)));
    }
    return own;
  }

  /** Songs to discover: other songs of a few artists frequent in the material. */
  async function gatherDiscover(recipe: PlaylistRecipe, own: PoolSong[]): Promise<PoolSong[]> {
    const counts = new Map<string, number>();
    const chosen = new Set(recipe.artists.map((a) => a.id));
    for (const s of own)
      if (!chosen.has(s.artistKey)) counts.set(s.artistKey, (counts.get(s.artistKey) ?? 0) + 1);
    const frequent = [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, PLAYLIST_DISCOVER_ARTISTS * 3)
      .map(([key]) => key)
      // Keys made from a name (no artist id) can't be looked up.
      .filter((key) => /^[0-9A-Za-z]{10,}$/.test(key));
    const known = new Set(own.map((s) => s.uri));
    const out: PoolSong[] = [];
    for (const artistId of shuffle(frequent, rng).slice(0, PLAYLIST_DISCOVER_ARTISTS)) {
      const picked = shuffle(await albumsOf(artistId), rng).slice(0, PLAYLIST_DISCOVER_ALBUMS);
      for (const album of picked)
        for (const s of await albumSongs(album)) if (!known.has(s.uri)) out.push(s);
    }
    return out;
  }

  /** URIs never to use: the bin, and (when the recipe asks) what went into this week's lists. */
  function excluded(recipe: PlaylistRecipe): Set<string> {
    const out = new Set(data.rejected.map((r) => r.uri));
    if (recipe.avoidRecent) {
      const since = now() - PLAYLIST_RECENT_DAYS * DAY_MS;
      for (const l of data.lists)
        if (Date.parse(l.createdAt) >= since) for (const u of l.uris) out.add(u);
    }
    return out;
  }

  function build(p: Preview): void {
    if (p.material) {
      const result = buildRanked(
        p.material.scored,
        p.targetMs,
        excluded(p.recipe),
        rng,
        PLAYLIST_SCORE_JITTER,
      );
      p.songs = result.songs;
      p.origin = describeOrigin(result.songs, p.material);
      const notes = [p.material.note, result.note].filter(Boolean);
      note = notes.length ? notes.join('. ') : undefined;
      return;
    }
    const result = buildPlaylist({
      own: p.own,
      discover: p.discover,
      targetMs: p.targetMs,
      discoverShare: p.recipe.discover ? PLAYLIST_DISCOVER_SHARE : 0,
      excluded: excluded(p.recipe),
      decades: p.recipe.decades,
      rng,
    });
    p.songs = result.songs;
    const notes = [p.discoverNote, result.note].filter(Boolean);
    note = notes.length ? notes.join('. ') : undefined;
  }

  async function makePreview(recipe: PlaylistRecipe): Promise<void> {
    const own = await gatherOwn(recipe);
    let discover: PoolSong[] = [];
    let discoverNote: string | undefined;
    if (recipe.discover) {
      try {
        discover = await gatherDiscover(recipe, own);
      } catch (err) {
        if (err instanceof SpotifyError && err.kind === 'permission') throw err;
        // Discovering is a bonus: the list goes on with the owner's songs.
        discoverNote = 'Spotify no dejó buscar cosas nuevas ahora; va solo con lo tuyo';
      }
    }
    const p: Preview = {
      recipe,
      targetMs: recipe.minutes * MINUTE_MS,
      songs: [],
      own,
      discover,
      gatheredAt: now(),
      ...(discoverNote ? { discoverNote } : {}),
      request: { recipe, minutes: recipe.minutes, avoidRecent: recipe.avoidRecent },
    };
    build(p);
    preview = p;
  }

  /** The search context over this feature's caches. */
  function searchContext() {
    return {
      api: api!,
      rng,
      cached: (key: string, load: () => Promise<PoolSong[]>) =>
        cached(key, PLAYLIST_POOL_TTL_MS, load),
      peek: (key: string) => {
        const hit = pools.get(key);
        return hit && now() - hit.at < PLAYLIST_POOL_TTL_MS ? hit.songs : undefined;
      },
      sources: () => loadSources(),
      albumsOf,
      albumSongs,
      publicLocked: () => publicLocked,
      lockPublic: () => {
        publicLocked = true;
      },
    };
  }

  /** "Dime qué quieres": a preview from a typed description. Nothing found → a note and no preview. */
  async function makeDescribed(request: StoredRequest): Promise<void> {
    const d = parseDescription(request.text ?? '');
    const material = await gatherDescribed(searchContext(), d);
    const recipe: PlaylistRecipe = {
      id: '',
      name: requestTitle(d.text),
      top: false,
      liked: false,
      surprise: false,
      playlists: [],
      artists: [],
      decades: [],
      minutes: request.minutes,
      discover: d.discover,
      avoidRecent: request.avoidRecent,
    };
    const p: Preview = {
      recipe,
      targetMs: request.minutes * MINUTE_MS,
      songs: [],
      own: [],
      discover: [],
      gatheredAt: now(),
      material,
      request,
    };
    build(p);
    if (p.songs.length === 0) {
      preview = undefined;
      const words = d.keywords.slice(0, 3).map((w) => `«${w}»`);
      note =
        `No encontré nada con «${d.text}». ` +
        (words.length
          ? `Prueba quitando palabras (por ejemplo ${words.join(', ')}).`
          : 'Prueba con otras palabras: un género, una década o un artista.');
      return;
    }
    preview = p;
  }

  /** What a list was made with, for "Mis listas". */
  function madeWith(l: CreatedList): string | undefined {
    if (l.request?.text) return `«${l.request.text}»`;
    if (l.request?.recipe) return `receta ${l.request.recipe.name}`;
    return undefined;
  }

  /** A live list the office made, or undefined (the office never touches anything else). */
  const ownList = (id: string | undefined) =>
    id ? data.lists.find((l) => l.id === id && !l.removedAt) : undefined;

  function updateList(id: string, change: Partial<CreatedList>): void {
    data = { ...data, lists: data.lists.map((l) => (l.id === id ? { ...l, ...change } : l)) };
    save();
  }

  /** Reads a list's songs; a list Spotify no longer has gets marked. */
  async function readList(list: CreatedList): Promise<PoolSong[]> {
    try {
      return await api!.playlistSongs(list.id);
    } catch (err) {
      if (err instanceof SpotifyError && err.kind === 'not-found')
        updateList(list.id, { missing: true });
      throw err;
    }
  }

  const sum = (songs: PoolSong[]) => songs.reduce((t, s) => t + s.durationMs, 0);
  const oneLine = (text: unknown, max: number) =>
    typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '';

  async function openList(list: CreatedList): Promise<void> {
    const songs = await readList(list);
    editing = { id: list.id, name: list.name, songs };
    found = [];
    proposal = undefined;
  }

  async function searchSongs(text: string): Promise<void> {
    const q = oneLine(text, PLAYLIST_REQUEST_MAX);
    if (!q) {
      found = [];
      return;
    }
    const res = await api!.searchTracks(q);
    const skip = new Set(data.rejected.map((r) => r.uri));
    found = res.songs.filter((s) => !skip.has(s.uri)).slice(0, PLAYLIST_FOUND_MAX);
    if (found.length === 0) note = `No encontré canciones con «${q}»`;
  }

  /** Renames the list and leaves exactly `uris` (only songs it had or that were found). */
  async function saveList(list: CreatedList, rawName: unknown, uris: string[]): Promise<void> {
    const e = editing;
    if (!e || e.id !== list.id) return;
    const known = new Map<string, PoolSong>();
    for (const s of [...e.songs, ...found]) known.set(s.uri, s);
    const wanted = [...new Set(uris.filter((u) => known.has(u)))];
    const current = e.songs.map((s) => s.uri);
    const removed = [...new Set(current.filter((u) => !wanted.includes(u)))];
    const added = wanted.filter((u) => !current.includes(u));
    const name = oneLine(rawName, PLAYLIST_LIST_NAME_MAX) || list.name;
    const a = api!;
    try {
      if (name !== list.name) await a.renamePlaylist(list.id, name);
      if (removed.length) await a.removeSongs(list.id, removed);
      if (added.length) await a.addSongs(list.id, added);
    } catch (err) {
      if (err instanceof SpotifyError && err.kind === 'not-found')
        updateList(list.id, { missing: true });
      throw err;
    }
    const songs = [
      ...e.songs.filter((s) => !removed.includes(s.uri)),
      ...added.map((u) => known.get(u)!),
    ];
    updateList(list.id, {
      name,
      uris: songs.map((s) => s.uri),
      count: songs.length,
      totalMs: sum(songs),
    });
    editing = { id: list.id, name, songs };
    found = [];
    note = 'Listo: se guardó en tu Spotify';
  }

  /** The material for improving a list, following its request (a description or a recipe). */
  async function improveMaterial(req: StoredRequest, discoverOnly: boolean): Promise<ScoredSong[]> {
    if (req.text) {
      const d = parseDescription(req.text);
      if (discoverOnly || req.discover) {
        d.discover = discoverOnly || d.discover;
        d.onlyMine = false;
      }
      return (await gatherDescribed(searchContext(), d)).scored;
    }
    const recipe = req.recipe ?? DEFAULT_RECIPES[0];
    const own = await gatherOwn(recipe);
    const mineOnly = own.map((song) => ({ song, score: 0 }));
    if (!discoverOnly && !(req.discover ?? recipe.discover)) return mineOnly;
    const fresh = (await gatherDiscover(recipe, own)).map((song) => ({
      song: { ...song, discover: true },
      score: 1,
    }));
    return discoverOnly ? fresh : [...mineOnly, ...fresh];
  }

  async function improve(
    list: CreatedList,
    mode: PlaylistImproveMode,
    wish: string,
  ): Promise<void> {
    const current = await readList(list);
    const base: StoredRequest = list.request ?? {
      recipe: DEFAULT_RECIPES[0],
      minutes: snapMinutes(Math.max(30, Math.round(list.totalMs / MINUTE_MS))),
      avoidRecent: false,
    };
    let req = base;
    let label = mode === 'text' ? `«${wish}»` : IMPROVE_LABELS[mode];
    if (mode === 'text') {
      const text = oneLine(`${base.text ?? ''} ${wish}`, PLAYLIST_REQUEST_MAX);
      const asked = parseDescription(wish).minutes;
      req = { ...base, text, minutes: asked ?? base.minutes };
      label = `«${wish}»`;
    }
    if (mode === 'discover') req = { ...base, discover: true };
    const rejected = new Set(data.rejected.map((r) => r.uri));
    const currentUris = new Set(current.map((s) => s.uri));
    const recent = new Set<string>();
    if (req.avoidRecent) {
      const since = now() - PLAYLIST_RECENT_DAYS * DAY_MS;
      for (const l of data.lists)
        if (l.id !== list.id && Date.parse(l.createdAt) >= since)
          for (const u of l.uris) recent.add(u);
    }
    const scored = await improveMaterial(req, mode === 'discover');
    const blocked = new Set([...rejected, ...recent, ...currentUris]);
    const fill = (ms: number, pool = scored) =>
      ms > 0 ? buildRanked(pool, ms, blocked, rng, PLAYLIST_SCORE_JITTER).songs : [];
    let remove: PoolSong[] = [];
    let add: PoolSong[] = [];
    let why: string | undefined;
    switch (mode) {
      case 'more':
        add = fill(PLAYLIST_IMPROVE_MORE_MS);
        if (add.length > 0 && sum(add) < PLAYLIST_IMPROVE_MORE_MS - PLAYLIST_DURATION_SLACK_MS)
          why = `Con esta idea solo encontré ${add.length === 1 ? '1 canción más' : `${add.length} canciones más`}`;
        break;
      case 'bin':
        remove = current.filter((s) => rejected.has(s.uri));
        if (remove.length === 0) why = 'Ninguna de sus canciones está en el bote';
        add = fill(sum(remove));
        break;
      case 'discover': {
        const count = Math.max(1, Math.ceil(current.length * PLAYLIST_IMPROVE_DISCOVER_SHARE));
        remove = shuffle(current, rng).slice(0, count);
        add = fill(
          sum(remove),
          scored.filter((s) => s.song.discover),
        );
        if (add.length === 0) {
          remove = [];
          why = 'No encontré canciones nuevas que vayan con esta lista';
        }
        break;
      }
      case 'reroll':
      case 'text': {
        const next = buildRanked(
          scored,
          req.minutes * MINUTE_MS,
          new Set([...rejected, ...recent]),
          rng,
          PLAYLIST_SCORE_JITTER,
        ).songs;
        if (next.length === 0) {
          why = 'No encontré canciones para esa idea: prueba con otras palabras';
          break;
        }
        const nextUris = new Set(next.map((s) => s.uri));
        remove = current.filter((s) => !nextUris.has(s.uri));
        add = next.filter((s) => !currentUris.has(s.uri));
        break;
      }
    }
    if (!why && remove.length === 0 && add.length === 0) why = 'No encontré qué cambiar';
    const removedUris = new Set(remove.map((s) => s.uri));
    proposal = {
      id: list.id,
      label,
      remove,
      add,
      totalMs: sum(current.filter((s) => !removedUris.has(s.uri))) + sum(add),
      ...(why ? { note: why } : {}),
      request: req,
    };
    editing = undefined;
    found = [];
  }

  async function applyImprove(list: CreatedList): Promise<void> {
    const p = proposal;
    if (!p || p.id !== list.id) return;
    const a = api!;
    const current = await readList(list);
    const removeUris = new Set(p.remove.map((s) => s.uri));
    const have = new Set(current.map((s) => s.uri));
    const toAdd = p.add.filter((s) => !have.has(s.uri));
    if (removeUris.size) await a.removeSongs(list.id, [...removeUris]);
    if (toAdd.length)
      await a.addSongs(
        list.id,
        toAdd.map((s) => s.uri),
      );
    const songs = [...current.filter((s) => !removeUris.has(s.uri)), ...toAdd];
    if (p.request.text && p.request.text !== list.request?.text) {
      try {
        await a.describePlaylist(list.id, `${p.request.text} · ${PLAYLIST_DESCRIPTION}`);
      } catch {
        // the songs changed; the description is a nicety
      }
    }
    updateList(list.id, {
      uris: songs.map((s) => s.uri),
      count: songs.length,
      totalMs: sum(songs),
      request: p.request,
    });
    proposal = undefined;
    note = 'Listo: se cambió en tu Spotify';
  }

  /** Marks the lists that are no longer in the owner's library (he removed them in Spotify). */
  async function checkLists(): Promise<void> {
    const live = data.lists.filter((l) => !l.removedAt);
    checkedAt = now();
    if (live.length === 0) return;
    const answers = await api!.inLibrary(live.map((l) => l.id));
    const gone = new Set(live.filter((_, i) => !answers[i]).map((l) => l.id));
    data = {
      ...data,
      lists: data.lists.map((l) => {
        if (l.removedAt) return l;
        const { missing: _old, ...rest } = l;
        return gone.has(l.id) ? { ...rest, missing: true } : rest;
      }),
    };
    save();
  }

  async function create(play: boolean | undefined): Promise<void> {
    const p = preview;
    if (!p || p.songs.length === 0) {
      error = 'No hay canciones en la vista previa';
      return;
    }
    const a = api!;
    const today = new Date(now());
    const name = playlistName(today, p.recipe.name);
    const created = await a.createPlaylist(
      name,
      p.request.text ? `${p.request.text} · ${PLAYLIST_DESCRIPTION}` : PLAYLIST_DESCRIPTION,
    );
    const uris = p.songs.map((s) => s.uri);
    try {
      await a.addSongs(created.id, uris);
    } catch (err) {
      // Created but empty: take it away so no half list stays in his library.
      try {
        await a.removePlaylist(created.id);
      } catch {
        // nothing else to do: the error below tells the owner
      }
      throw err;
    }
    const list: CreatedList = {
      id: created.id,
      name,
      day: localDay(today),
      kept: false,
      count: uris.length,
      totalMs: p.songs.reduce((sum, s) => sum + s.durationMs, 0),
      ...(created.url ? { url: created.url } : {}),
      uris,
      createdAt: today.toISOString(),
      request: p.request,
    };
    data = { ...data, lists: [...data.lists, list] };
    save();
    preview = undefined;
    if (play ?? data.autoPlay) {
      try {
        await a.play(created.id);
      } catch {
        note = 'Lista creada. No se pudo poner a sonar: abre Spotify en algún aparato';
      }
    }
  }

  function reject(uri: string): void {
    const song =
      preview?.songs.find((s) => s.uri === uri) ??
      preview?.material?.scored.find((x) => x.song.uri === uri)?.song ??
      preview?.own.find((s) => s.uri === uri) ??
      preview?.discover.find((s) => s.uri === uri);
    if (!song) return;
    if (!data.rejected.some((r) => r.uri === uri)) {
      const entry = {
        uri,
        title: song.title,
        artist: song.artist,
        durationMs: song.durationMs,
        at: new Date(now()).toISOString(),
      };
      data = { ...data, rejected: [entry, ...data.rejected].slice(0, PLAYLIST_REJECTED_MAX) };
      save();
    }
    if (preview?.material && preview.songs.some((s) => s.uri === uri)) {
      const p = preview;
      const material = preview.material;
      const skip = excluded(p.recipe);
      const candidates = material.scored.map((x) => x.song).filter((s) => !skip.has(s.uri));
      p.songs = replaceSong(p.songs, uri, candidates, rng);
      p.origin = describeOrigin(p.songs, material);
    } else if (preview?.songs.some((s) => s.uri === uri)) {
      const p = preview;
      const skip = excluded(p.recipe);
      const ok = (s: PoolSong) => !skip.has(s.uri) && inDecades(s.year, p.recipe.decades);
      const candidates = [
        ...p.own.filter(ok),
        ...(p.recipe.discover ? p.discover.filter(ok).map((s) => ({ ...s, discover: true })) : []),
      ];
      p.songs = replaceSong(p.songs, uri, candidates, rng);
    }
  }

  function saveRecipe(raw: unknown): void {
    const recipe = cleanRecipe(raw);
    if (!recipe) {
      error = 'La receta necesita nombre y al menos una fuente';
      return;
    }
    const index = recipe.id ? data.recipes.findIndex((r) => r.id === recipe.id) : -1;
    if (index >= 0) {
      const recipes = [...data.recipes];
      recipes[index] = recipe;
      data = { ...data, recipes };
    } else {
      if (data.recipes.length >= PLAYLIST_RECIPES_MAX) {
        error = `Caben ${PLAYLIST_RECIPES_MAX} recetas: borra alguna primero`;
        return;
      }
      const id = recipe.id || `r-${now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
      data = { ...data, recipes: [...data.recipes, { ...recipe, id }] };
    }
    save();
  }

  /** A `playlistCommand` from a client; true when it was one (handled or ignored). */
  function handle(msg: Record<string, unknown>, client: FeatureClient): boolean {
    if (msg.type !== 'playlistCommand') return false;
    if (!client.privileged || busy) return true;
    const action = msg.action;
    const id = typeof msg.id === 'string' ? msg.id : undefined;
    const uri = typeof msg.uri === 'string' ? msg.uri : undefined;
    const play = typeof msg.play === 'boolean' ? msg.play : undefined;
    // Local actions: no Spotify call.
    const local = (fn: () => void) => {
      error = undefined;
      fn();
      opts.onChange();
    };
    const canCall = () => Boolean(api) && connected() && !needsReconnect();
    const remote = (kind: PlaylistBusy, job: () => Promise<void>) => {
      if (!canCall()) {
        local(() => {
          if (!connected()) error = describeError(new SpotifyError('no-session', ''));
        });
        return;
      }
      run(kind, job);
    };
    switch (action) {
      case 'open':
        if (canCall()) run('sources', async () => void (await loadSources()));
        else local(() => undefined);
        break;
      case 'preview': {
        const recipe = cleanRecipe(msg.recipe);
        if (!recipe) {
          local(() => (error = 'La receta necesita nombre y al menos una fuente'));
          break;
        }
        remote('preview', () => makePreview(recipe));
        break;
      }
      case 'reroll': {
        const p = preview;
        if (!p) break;
        if (now() - p.gatheredAt >= PLAYLIST_POOL_TTL_MS)
          remote('preview', () => (p.material ? makeDescribed(p.request) : makePreview(p.recipe)));
        else local(() => build(p));
        break;
      }
      case 'cancel':
        local(() => {
          preview = undefined;
          note = undefined;
        });
        break;
      case 'reject':
        if (uri) local(() => reject(uri));
        break;
      case 'unreject':
        if (uri)
          local(() => {
            data = { ...data, rejected: data.rejected.filter((r) => r.uri !== uri) };
            save();
          });
        break;
      case 'create':
        if (preview) remote('creating', () => create(play));
        break;
      case 'keep':
        local(() => {
          const list = data.lists.find((l) => l.id === id && !l.removedAt);
          if (!list) return;
          data = { ...data, lists: data.lists.map((l) => (l === list ? { ...l, kept: true } : l)) };
          save();
        });
        break;
      case 'delete': {
        const list = data.lists.find((l) => l.id === id && !l.removedAt);
        if (!list) {
          // The office only ever touches lists it created.
          local(() => (error = 'Esa lista no la hizo la oficina: no se toca'));
          break;
        }
        remote('deleting', async () => {
          try {
            await api!.removePlaylist(list.id);
          } catch (err) {
            if (!(err instanceof SpotifyError && err.kind === 'not-found')) throw err;
          }
          data = {
            ...data,
            lists: data.lists.map((l) =>
              l.id === list.id ? { ...l, removedAt: new Date(now()).toISOString() } : l,
            ),
          };
          save();
        });
        break;
      }
      case 'saveRecipe':
        local(() => saveRecipe(msg.recipe));
        break;
      case 'describe': {
        const text = oneLine(msg.text, PLAYLIST_REQUEST_MAX);
        if (!text) {
          local(() => (error = 'Escribe qué quieres escuchar'));
          break;
        }
        const asked = typeof msg.minutes === 'number' && PLAYLIST_MINUTES.includes(msg.minutes);
        const request: StoredRequest = {
          text,
          // A length written in the text wins over the buttons.
          minutes: parseDescription(text).minutes ?? (asked ? (msg.minutes as number) : 60),
          avoidRecent: msg.avoidRecent !== false,
        };
        remote('preview', () => makeDescribed(request));
        break;
      }
      case 'play': {
        const list = ownList(id);
        if (list) remote('loading', () => api!.play(list.id));
        break;
      }
      case 'openList': {
        const list = ownList(id);
        if (list) remote('loading', () => openList(list));
        break;
      }
      case 'closeList':
        local(() => {
          editing = undefined;
          found = [];
        });
        break;
      case 'searchSongs':
        if (editing)
          remote('searching', () => searchSongs(oneLine(msg.text, PLAYLIST_REQUEST_MAX)));
        break;
      case 'saveList': {
        const list = ownList(id);
        const uris = Array.isArray(msg.uris)
          ? msg.uris.filter((u): u is string => typeof u === 'string')
          : undefined;
        if (list && uris && editing?.id === list.id)
          remote('saving', () => saveList(list, msg.name, uris));
        break;
      }
      case 'improve': {
        const list = ownList(id);
        const mode = msg.mode as PlaylistImproveMode;
        const wish = oneLine(msg.text, PLAYLIST_REQUEST_MAX);
        if (!list || !IMPROVE_MODES.includes(mode)) break;
        if (mode === 'text' && !wish) {
          local(() => (error = 'Escribe qué le cambio'));
          break;
        }
        remote('improving', () => improve(list, mode, wish));
        break;
      }
      case 'applyImprove': {
        const list = ownList(id);
        if (list && proposal?.id === list.id) remote('saving', () => applyImprove(list));
        break;
      }
      case 'dropImprove':
        local(() => (proposal = undefined));
        break;
      case 'checkLists':
        if (now() - checkedAt >= PLAYLIST_CHECK_TTL_MS) remote('loading', () => checkLists());
        else local(() => undefined);
        break;
      case 'forget': {
        // Only a list Spotify no longer has; the rest are deleted with "Borrar".
        const list = ownList(id);
        if (!list?.missing) break;
        local(() => {
          updateList(list.id, { removedAt: new Date(now()).toISOString() });
          if (editing?.id === list.id) editing = undefined;
          if (proposal?.id === list.id) proposal = undefined;
        });
        break;
      }
      case 'deleteRecipe':
        if (id)
          local(() => {
            data = { ...data, recipes: data.recipes.filter((r) => r.id !== id) };
            save();
          });
        break;
      case 'setAutoPlay':
        if (play !== undefined)
          local(() => {
            data = { ...data, autoPlay: play };
            save();
          });
        break;
      default:
        break;
    }
    return true;
  }

  return {
    status,
    handle,
    needsReconnect,
    /** The session changed (new login, disconnect): forget what was read with the old one. */
    sessionChanged(): void {
      permissionDenied = false;
      sources = undefined;
      preview = undefined;
      editing = undefined;
      found = [];
      proposal = undefined;
      publicLocked = false;
      checkedAt = -Infinity;
      pools.clear();
      albums.clear();
    },
    /** Resolves when the command in progress is done (tests). */
    settle: (): Promise<void> => running,
  };
}

export type Playlists = ReturnType<typeof createPlaylists>;
