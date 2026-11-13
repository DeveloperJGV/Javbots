/**
 * An in-memory Spotify (Web API + accounts token endpoint) for tests and for the isolated test office. All data is
 * invented. `fetcher` plugs into createSpotifyApi; `handle` is what the HTTP server in servidor.ts calls.
 */

export const FAKE_OWNER_ID = 'duenio-de-prueba';
export const FAKE_SCOPES_FULL = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-library-modify',
].join(' ');
/** A session from before the playlist feature: no playlist or library permissions. */
export const FAKE_SCOPES_OLD =
  'user-read-currently-playing user-read-playback-state user-modify-playback-state user-top-read';

const ARTIST_NAMES = [
  'Los Faroles Azules',
  'Marea Norte',
  'La Banda del Patio',
  'Cometa Lenta',
  'Sofía Brisa',
  'Trueno Manso',
  'Las Hojas Secas',
  'Río Cobalto',
  'Hermanos Lumbre',
  'Neón Tranquilo',
  'Capitán Arena',
  'Orquesta del Faro',
  'Luz de Bengala',
  'Dúo Ventana',
];
const WORDS = [
  'Noche',
  'Camino',
  'Luna',
  'Fuego',
  'Ventana',
  'Lluvia',
  'Mar',
  'Ciudad',
  'Verano',
  'Sombra',
  'Estrella',
  'Puerto',
  'Viento',
  'Jardín',
  'Tren',
  'Espejo',
  'Río',
  'Domingo',
  'Faro',
  'Abril',
];
/** Album years per artist (3 albums each), spread from 1968 to 2025. */
const ALBUM_YEARS = [
  [1968, 1972, 1979],
  [1971, 1975, 1983],
  [1976, 1982, 1988],
  [1980, 1984, 1989],
  [1983, 1987, 1994],
  [1986, 1991, 1998],
  [1990, 1996, 2003],
  [1993, 1999, 2006],
  [1997, 2002, 2010],
  [2001, 2007, 2014],
  [2005, 2011, 2018],
  [2009, 2015, 2021],
  [2012, 2019, 2024],
  [2016, 2022, 2025],
];
const SONGS_PER_ALBUM = 5;
/** A Spotify genre per artist (same order as ARTIST_NAMES), for `genre:` searches. */
const ARTIST_GENRES = [
  ['rock en espanol', 'rock'],
  ['rock en espanol', 'rock'],
  ['rock'],
  ['pop'],
  ['rock en espanol', 'rock'],
  ['cumbia'],
  ['pop'],
  ['jazz'],
  ['rock'],
  ['pop', 'electronic'],
  ['cumbia'],
  ['jazz'],
  ['pop'],
  ['rock en espanol'],
];
/** Lower case, no accents (how the fake search compares). */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface FakeArtist {
  id: string;
  name: string;
  genres: string[];
}
export interface FakeAlbum {
  id: string;
  name: string;
  release_date: string;
  artistId: string;
}
export interface FakeTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artistId: string;
  albumId: string;
}
export interface FakePlaylist {
  id: string;
  name: string;
  ownerId: string;
  trackIds: string[];
  description?: string;
  public?: boolean;
  /** Answer items with the old `track` key instead of `item`. */
  oldShape?: boolean;
}
export interface FakeCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body?: unknown;
}
/** A forced answer for the next matching calls. */
export interface FakeFault {
  match: RegExp;
  method?: string;
  status: number;
  retryAfter?: number;
  message?: string;
  /** How many calls it answers (then it goes away). */
  times: number;
}

export interface FakeSpotifyOptions {
  /** Permissions the token endpoint grants: 'full' (default), 'old' or a custom space-separated string. */
  scopes?: 'full' | 'old' | string;
  /** Rotate the refresh token on every refresh (what Spotify does with PKCE). */
  rotateRefresh?: boolean;
  /** Spotify open on some device (play works). Default true. */
  activeDevice?: boolean;
  /**
   * Other people's lists can be read. Spotify's 2026 rule: only the user's own (or collaborative) lists answer
   * their items, others give 403. Default false (like the real one); true to test counting across lists.
   */
  publicReadable?: boolean;
}

export interface FakeAnswer {
  status: number;
  json?: unknown;
  headers?: Record<string, string>;
}

/** Deterministic pseudo-random numbers (same data on every run). */
function lcg(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function createFakeSpotify(opts: FakeSpotifyOptions = {}) {
  const random = lcg(7);
  const artists: FakeArtist[] = ARTIST_NAMES.map((name, i) => ({
    id: `artista${pad(i + 1, 6)}`,
    name,
    genres: ARTIST_GENRES[i],
  }));
  const albums: FakeAlbum[] = [];
  const tracks: FakeTrack[] = [];
  artists.forEach((artist, a) => {
    ALBUM_YEARS[a].forEach((year, b) => {
      const album: FakeAlbum = {
        id: `album${pad(a + 1, 3)}${pad(b + 1, 3)}`,
        name: `${WORDS[(a + b * 3) % WORDS.length]} ${year}`,
        release_date: `${year}-0${(b % 9) + 1}-15`,
        artistId: artist.id,
      };
      albums.push(album);
      for (let s = 0; s < SONGS_PER_ALBUM; s++) {
        const id = `pista${pad(tracks.length + 1, 5)}`;
        tracks.push({
          id,
          uri: `spotify:track:${id}`,
          name: `${WORDS[(a * 7 + b * 5 + s) % WORDS.length]} de ${WORDS[(a + s * 3 + b) % WORDS.length].toLowerCase()} ${s + 1}`,
          duration_ms: Math.round((150 + random() * 180) * 1000),
          artistId: artist.id,
          albumId: album.id,
        });
      }
    });
  });
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const albumById = new Map(albums.map((a) => [a.id, a]));
  const artistById = new Map(artists.map((a) => [a.id, a]));
  const yearOf = (t: FakeTrack) => Number(albumById.get(t.albumId)!.release_date.slice(0, 4));
  const pick = (filter: (t: FakeTrack) => boolean, max: number) =>
    tracks
      .filter(filter)
      .slice(0, max)
      .map((t) => t.id);

  const playlists: FakePlaylist[] = [
    {
      id: 'lista80s',
      name: 'Mis me gusta · 80s',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => yearOf(t) >= 1980 && yearOf(t) < 1990, 40),
    },
    {
      id: 'listaRock',
      name: 'Mis me gusta · Rock',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => artists.slice(0, 5).some((a) => a.id === t.artistId), 45),
      oldShape: true,
    },
    {
      id: 'lista70s',
      name: 'Mis me gusta · 70s y antes',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => yearOf(t) < 1980, 30),
    },
    {
      id: 'lista2000s',
      name: 'Mis me gusta · 2000s',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => yearOf(t) >= 2000 && yearOf(t) < 2010, 35),
    },
    {
      id: 'listaCalma',
      name: 'Mis me gusta · Tranquilas',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => t.duration_ms > 240_000, 40),
    },
    {
      id: 'listaManejar',
      name: 'Mis me gusta · Para manejar',
      ownerId: FAKE_OWNER_ID,
      trackIds: pick((t) => yearOf(t) >= 2010, 40),
    },
    {
      id: 'listaAjena1',
      name: 'Éxitos de alguien más',
      ownerId: 'otra-persona',
      trackIds: pick(() => true, 20),
    },
    {
      id: 'listaAjena2',
      name: 'Clásicos compartidos',
      ownerId: 'otra-persona',
      trackIds: pick((t) => yearOf(t) < 1990, 20),
    },
  ];
  const rockSpanish = (t: FakeTrack) =>
    artistById.get(t.artistId)!.genres.includes('rock en espanol');
  /** Public lists of other people, found only by /search (not in the owner's library). */
  const publicLists: FakePlaylist[] = [
    {
      id: 'publica01',
      name: 'Rock en español para manejar de noche',
      description: 'Lo mejor del rock en español de los 90 para el camino',
      ownerId: 'otra-persona',
      trackIds: pick((t) => rockSpanish(t) && yearOf(t) >= 1985, 25),
    },
    {
      id: 'publica02',
      name: 'Noventas de noche',
      description: 'Rock y pop de los noventa',
      ownerId: 'alguien-mas',
      trackIds: pick((t) => yearOf(t) >= 1990 && yearOf(t) < 2000, 25),
    },
    {
      id: 'publica03',
      name: 'Rock para manejar',
      description: '',
      ownerId: 'otra-persona',
      trackIds: pick((t) => rockSpanish(t) && yearOf(t) >= 1980, 30),
    },
    {
      id: 'publica04',
      name: 'Cumbias para la carne asada',
      description: 'Cumbia de siempre',
      ownerId: 'alguien-mas',
      trackIds: pick((t) => artistById.get(t.artistId)!.genres.includes('cumbia'), 25),
    },
  ];
  /** Lists in the owner's library (his and the ones he follows). */
  const library = new Set(playlists.map((p) => p.id));
  const liked = tracks
    .filter((_, i) => i % 2 === 0)
    .slice(0, 120)
    .map((t) => t.id);
  const top: Record<string, string[]> = {
    short_term: tracks
      .filter((_, i) => i % 3 === 0)
      .slice(0, 50)
      .map((t) => t.id),
    medium_term: tracks
      .filter((_, i) => i % 4 === 1)
      .slice(0, 50)
      .map((t) => t.id),
    long_term: tracks
      .filter((_, i) => i % 5 === 2)
      .slice(0, 50)
      .map((t) => t.id),
  };

  const state = {
    scopes:
      opts.scopes === 'old'
        ? FAKE_SCOPES_OLD
        : !opts.scopes || opts.scopes === 'full'
          ? FAKE_SCOPES_FULL
          : opts.scopes,
    activeDevice: opts.activeDevice ?? true,
    accessToken: 'acceso-1',
    tokensIssued: 0,
    calls: [] as FakeCall[],
    faults: [] as FakeFault[],
    created: [] as FakePlaylist[],
    removed: [] as string[],
    played: [] as string[],
    renamed: [] as string[],
    searches: [] as string[],
  };

  const fullTrack = (t: FakeTrack) => {
    const album = albumById.get(t.albumId)!;
    const artist = artistById.get(t.artistId)!;
    return {
      id: t.id,
      uri: t.uri,
      name: t.name,
      duration_ms: t.duration_ms,
      is_local: false,
      artists: [{ id: artist.id, name: artist.name }],
      album: { id: album.id, name: album.name, release_date: album.release_date },
    };
  };
  const simpleTrack = (t: FakeTrack) => {
    const { album: _album, ...rest } = fullTrack(t);
    return rest;
  };
  const page = <T>(all: T[], query: Record<string, string>, max: number, base: string) => {
    const limit = Math.min(Number(query.limit ?? 20), max);
    const offset = Number(query.offset ?? 0);
    const items = all.slice(offset, offset + limit);
    const more = offset + limit < all.length;
    return {
      items,
      total: all.length,
      limit,
      offset,
      next: more ? `${base}?offset=${offset + limit}&limit=${limit}` : null,
    };
  };
  const err = (status: number, message: string, headers?: Record<string, string>): FakeAnswer => ({
    status,
    json: { error: { status, message } },
    ...(headers ? { headers } : {}),
  });

  function token(body: string): FakeAnswer {
    const form = new URLSearchParams(body);
    const grant = form.get('grant_type');
    if (grant !== 'refresh_token' && grant !== 'authorization_code')
      return { status: 400, json: { error: 'unsupported_grant_type' } };
    state.tokensIssued++;
    state.accessToken = `acceso-${state.tokensIssued + 1}`;
    return {
      status: 200,
      json: {
        access_token: state.accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: state.scopes,
        // Like the real one with PKCE: every refresh hands out a new refresh token.
        ...(grant === 'authorization_code'
          ? { refresh_token: 'refresco-de-prueba' }
          : opts.rotateRefresh
            ? { refresh_token: `refresco-${state.tokensIssued}` }
            : {}),
      },
    };
  }

  function api(
    method: string,
    path: string,
    query: Record<string, string>,
    body: unknown,
  ): FakeAnswer {
    const json = body as Record<string, unknown> | undefined;
    if (method === 'GET' && path === '/me')
      return { status: 200, json: { id: FAKE_OWNER_ID, display_name: 'Dueño de prueba' } };
    if (method === 'GET' && path === '/me/playlists') {
      const mine = [...playlists, ...state.created].filter((p) => library.has(p.id));
      const items = mine.map((p) => ({
        id: p.id,
        name: p.name,
        owner: { id: p.ownerId },
        items: { total: p.trackIds.length },
      }));
      return { status: 200, json: page(items, query, 50, '/me/playlists') };
    }
    if (method === 'POST' && path === '/me/playlists') {
      if (!json || typeof json.name !== 'string') return err(400, 'Missing name');
      const id = `nueva${pad(state.created.length + 1, 4)}`;
      const list: FakePlaylist = {
        id,
        name: json.name,
        ownerId: FAKE_OWNER_ID,
        trackIds: [],
        description: typeof json.description === 'string' ? json.description : undefined,
        public: json.public === true,
      };
      state.created.push(list);
      library.add(id);
      return {
        status: 201,
        json: {
          id,
          name: list.name,
          external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
        },
      };
    }
    if (method === 'GET' && path === '/search') return search(query);
    if (method === 'GET' && path === '/me/library/contains') {
      const uris = (query.uris ?? '').split(',').filter(Boolean);
      if (uris.length === 0 || uris.length > 40) return err(400, 'Invalid uris');
      return {
        status: 200,
        json: uris.map((u) => library.has(u.replace('spotify:playlist:', ''))),
      };
    }
    let m = /^\/playlists\/([^/]+)$/.exec(path);
    if (m && method === 'PUT') {
      const list = allLists().find((p) => p.id === decodeURIComponent(m![1]));
      if (!list) return err(404, 'Resource not found');
      if (list.ownerId !== FAKE_OWNER_ID) return err(403, 'Forbidden');
      if (typeof json?.name === 'string') list.name = json.name;
      if (typeof json?.description === 'string') list.description = json.description;
      state.renamed.push(list.id);
      return { status: 200 };
    }
    m = /^\/playlists\/([^/]+)\/items$/.exec(path);
    if (m) {
      const list = allLists().find((p) => p.id === decodeURIComponent(m![1]));
      if (!list) return err(404, 'Resource not found');
      if (method === 'GET') {
        // Spotify 2026: items only for the user's own lists.
        if (list.ownerId !== FAKE_OWNER_ID && !opts.publicReadable) return err(403, 'Forbidden');
        const key = list.oldShape ? 'track' : 'item';
        const items = list.trackIds.map((id) => ({ [key]: fullTrack(trackById.get(id)!) }));
        if (Number(query.limit ?? 20) > 50) return err(400, 'Invalid limit');
        return { status: 200, json: page(items, query, 50, path) };
      }
      if (method === 'DELETE') {
        if (list.ownerId !== FAKE_OWNER_ID) return err(403, 'Forbidden');
        const items = Array.isArray(json?.items) ? (json.items as Array<{ uri?: string }>) : [];
        if (items.length === 0) return err(400, 'Missing items');
        if (items.length > 100) return err(400, 'Too many ids requested');
        const drop = new Set(items.map((i) => (i.uri ?? '').replace('spotify:track:', '')));
        list.trackIds = list.trackIds.filter((id) => !drop.has(id));
        return { status: 200, json: { snapshot_id: `instantanea-${list.trackIds.length}` } };
      }
      if (method === 'POST') {
        const uris = Array.isArray(json?.uris) ? (json.uris as string[]) : [];
        if (uris.length > 100) return err(400, 'Too many ids requested');
        for (const uri of uris) list.trackIds.push(uri.replace('spotify:track:', ''));
        return { status: 201, json: { snapshot_id: `instantanea-${list.trackIds.length}` } };
      }
    }
    if (method === 'DELETE' && path === '/me/library') {
      const uris = (query.uris ?? '').split(',').filter(Boolean);
      if (uris.length === 0) return err(400, 'Missing uris');
      for (const uri of uris) {
        const id = uri.replace('spotify:playlist:', '');
        library.delete(id);
        state.removed.push(id);
      }
      return { status: 200 };
    }
    m = /^\/me\/top\/(tracks|artists)$/.exec(path);
    if (m && method === 'GET') {
      const range = query.time_range ?? 'medium_term';
      if (m[1] === 'tracks') {
        const items = (top[range] ?? []).map((id) => fullTrack(trackById.get(id)!));
        return { status: 200, json: page(items, query, 50, path) };
      }
      return { status: 200, json: page(artists.slice(0, 10), query, 50, path) };
    }
    if (method === 'GET' && path === '/me/tracks') {
      const items = liked.map((id) => ({
        added_at: '2026-01-01T00:00:00Z',
        track: fullTrack(trackById.get(id)!),
      }));
      return { status: 200, json: page(items, query, 50, path) };
    }
    m = /^\/artists\/([^/]+)\/albums$/.exec(path);
    if (m && method === 'GET') {
      if (!artistById.has(m[1])) return err(404, 'Resource not found');
      const items = albums
        .filter((a) => a.artistId === m![1])
        .map((a) => ({
          id: a.id,
          name: a.name,
          release_date: a.release_date,
          album_type: 'album',
        }));
      return { status: 200, json: page(items, query, 10, path) };
    }
    m = /^\/albums\/([^/]+)\/tracks$/.exec(path);
    if (m && method === 'GET') {
      if (!albumById.has(m[1])) return err(404, 'Resource not found');
      const items = tracks.filter((t) => t.albumId === m![1]).map(simpleTrack);
      return { status: 200, json: page(items, query, 50, path) };
    }
    if (method === 'PUT' && path === '/me/player/play') {
      if (!state.activeDevice) return err(404, 'Player command failed: No active device found');
      const uri = typeof json?.context_uri === 'string' ? json.context_uri : '';
      state.played.push(uri);
      return { status: 204 };
    }
    return err(404, 'Service not found');
  }

  /** Every list Spotify has (his, followed, created, public ones of others). */
  function allLists(): FakePlaylist[] {
    return [...playlists, ...state.created, ...publicLists];
  }

  /** GET /search: words must all appear (track) or any appear (artist, playlist); `genre:` and `year:` filter. */
  function search(query: Record<string, string>): FakeAnswer {
    const limit = Number(query.limit ?? 5);
    if (!Number.isInteger(limit) || limit < 0 || limit > 10) return err(400, 'Invalid limit');
    const types = (query.type ?? '').split(',').filter(Boolean);
    if (types.length === 0 || !query.q) return err(400, 'Missing parameter');
    state.searches.push(query.q);
    let q = fold(query.q);
    let genre: string | undefined;
    let years: [number, number] | undefined;
    q = q.replace(/genre:"([^"]+)"|genre:(\S+)/g, (_, a: string, b: string) => {
      genre = a ?? b;
      return ' ';
    });
    q = q.replace(/year:(\d{4})(?:-(\d{4}))?/g, (_, a: string, b: string) => {
      years = [Number(a), Number(b ?? a)];
      return ' ';
    });
    const words = q.split(/\s+/).filter(Boolean);
    const out: Record<string, unknown> = {};
    const base = '/search';
    if (types.includes('track')) {
      const hits = tracks.filter((t) => {
        const artist = artistById.get(t.artistId)!;
        const album = albumById.get(t.albumId)!;
        if (genre && !artist.genres.includes(genre)) return false;
        const y = yearOf(t);
        if (years && (y < years[0] || y > years[1])) return false;
        const hay = fold(`${t.name} ${artist.name} ${album.name}`);
        return words.every((w) => hay.includes(w));
      });
      out.tracks = page(hits.map(fullTrack), { ...query, limit: String(limit) }, 10, base);
    }
    if (types.includes('artist')) {
      const hits = artists.filter((a) =>
        words.some((w) => w.length > 2 && fold(a.name).includes(w)),
      );
      out.artists = page(
        hits.map((a) => ({ id: a.id, name: a.name, type: 'artist' })),
        { ...query, limit: String(limit) },
        10,
        base,
      );
    }
    if (types.includes('playlist')) {
      const hits = allLists().filter((p) =>
        words.some((w) => w.length > 2 && fold(`${p.name} ${p.description ?? ''}`).includes(w)),
      );
      // Like the real one: a removed list shows up as null.
      const items: unknown[] = [
        null,
        ...hits.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? '',
          owner: { id: p.ownerId },
          items: { total: p.trackIds.length },
        })),
      ];
      out.playlists = page(items, { ...query, limit: String(limit) }, 10, base);
    }
    return { status: 200, json: out };
  }

  /** One request: `path` is relative to the API root (`/me`…) or `/api/token`. */
  function handle(
    method: string,
    path: string,
    query: Record<string, string>,
    headers: Record<string, string>,
    rawBody: string | undefined,
  ): FakeAnswer {
    if (path === '/api/token') return token(rawBody ?? '');
    let body: unknown;
    try {
      body = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      return err(400, 'Malformed json');
    }
    state.calls.push({ method, path, query, ...(body !== undefined ? { body } : {}) });
    const fault = state.faults.find(
      (f) => f.match.test(path) && (!f.method || f.method === method),
    );
    if (fault) {
      fault.times--;
      if (fault.times <= 0) state.faults.splice(state.faults.indexOf(fault), 1);
      return err(
        fault.status,
        fault.message ?? `Forced ${fault.status}`,
        fault.retryAfter !== undefined ? { 'Retry-After': String(fault.retryAfter) } : undefined,
      );
    }
    const auth = headers.authorization ?? headers.Authorization ?? '';
    if (auth !== `Bearer ${state.accessToken}`) return err(401, 'The access token expired');
    const needs = requiredScope(method, path);
    if (needs && !state.scopes.split(' ').includes(needs))
      return err(403, 'Insufficient client scope');
    return api(method, path, query, body);
  }

  /** `fetch`-compatible: createSpotifyApi({ fetcher }). Accepts any host; the path decides. */
  async function fetcher(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    const u = new URL(url);
    const path = u.pathname.replace(/^.*?\/v1(?=\/)/, '');
    const query = Object.fromEntries(u.searchParams.entries());
    const a = handle(init.method ?? 'GET', path, query, init.headers ?? {}, init.body);
    return new Response(a.json === undefined ? null : JSON.stringify(a.json), {
      status: a.status,
      headers: { 'Content-Type': 'application/json', ...(a.headers ?? {}) },
    });
  }

  return {
    state,
    artists,
    albums,
    tracks,
    playlists,
    library,
    handle,
    fetcher,
    /** The current access token stops working (the client has to refresh). */
    expireToken: () => {
      state.accessToken = `vencido-${state.tokensIssued}`;
    },
    fault: (f: Omit<FakeFault, 'times'> & { times?: number }) => {
      state.faults.push({ times: 1, ...f });
    },
    callsTo: (pattern: RegExp, method?: string) =>
      state.calls.filter((c) => pattern.test(c.path) && (!method || c.method === method)),
    playlistById: (id: string) => allLists().find((p) => p.id === id),
    publicLists,
    /** The list stops existing in Spotify (any call about it answers 404). */
    destroy: (id: string) => {
      const i = state.created.findIndex((p) => p.id === id);
      if (i >= 0) state.created.splice(i, 1);
      library.delete(id);
    },
  };
}

/** Which permission a route needs (only the ones that matter to playlists). */
function requiredScope(method: string, path: string): string | undefined {
  if (path === '/me/playlists' && method === 'GET') return 'playlist-read-private';
  if (path === '/me/playlists' && method === 'POST') return 'playlist-modify-private';
  if (/^\/playlists\/[^/]+\/items$/.test(path))
    return method === 'GET' ? 'playlist-read-private' : 'playlist-modify-private';
  if (path === '/me/library') return 'user-library-modify';
  if (path === '/me/library/contains') return 'playlist-read-private';
  if (/^\/playlists\/[^/]+$/.test(path)) return 'playlist-modify-private';
  if (path === '/me/tracks') return 'user-library-read';
  if (path.startsWith('/me/top/')) return 'user-top-read';
  return undefined;
}

export type FakeSpotify = ReturnType<typeof createFakeSpotify>;
