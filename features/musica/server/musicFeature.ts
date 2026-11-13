import type { FastifyInstance } from 'fastify';

import type { ConnectionInfo, MusicStatus, MusicTrack } from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import {
  LOG_PREFIX,
  LYRICS_FALLBACK_MS,
  LYRICS_PENDING_SIZE,
  MUSIC_API_PATH,
  MUSIC_CONTROL_PATH,
  MUSIC_LYRICS_API_PATH,
  MUSIC_STALE_MS,
  SPOTIFY_CALLBACK_PATH,
  SPOTIFY_EXTENSION_FRESH_MS,
  SPOTIFY_LOGIN_PATH,
  SPOTIFY_POLL_MS,
  SPOTIFY_SCOPES,
  WS_CLOSE_POLICY,
} from './constants.js';
import { CoverCache } from './cover.js';
import { cleanLines, fetchLrclib, type Lyrics, songKey } from './lyrics.js';
import { type MusicConfig, readMusicConfig, writeMusicConfig } from './musicConfig.js';
import { createPlaylists, type Playlists } from './playlists/playlistFeature.js';
import { startScreenServer } from './screenServer.js';
import {
  installExtension,
  isExtensionInstalled,
  runSpicetify,
  type SpicetifyRunner,
  spicetifyUserdata,
} from './spicetify.js';
import { createSpotifyApi, type SpotifyApi } from './spotifyApi.js';
import { timingSafeEqual } from './token.js';
import { parseTrackReport } from './track.js';

export interface MusicFeatureOptions {
  /** Extension template (features/musica/spicetify/javbots-musica.js, copied to dist by esbuild.js). */
  templatePath: string;
  /** This server's local URL once it listens (baked into the extension). */
  serverUrl: () => string | null;
  /** Injectable for tests. */
  run?: SpicetifyRunner;
  covers?: CoverCache;
  now?: () => number;
  /** Fallback lyrics source (LRCLIB). */
  fetchLyrics?: typeof fetchLrclib;
  /** Starts the screen port when music.json has `screenPort` (off in tests). */
  startScreen?: typeof startScreenServer;
  /** Spotify's Web API over this (tests); default `fetch`. */
  spotifyFetch?: Parameters<typeof createSpotifyApi>[0]['fetcher'];
  /** Ask the account every few seconds while connected (off in tests, which call `pollSpotify()`). */
  pollSpotify?: boolean;
  /** Waits before a Spotify retry (tests); and the playlists' randomness. */
  spotifySleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}

/** Who reported the current track. */
export type TrackSource = 'extension' | 'spotify';

/** Body of GET /api/music/now on the screen port. `positionMs` is already moved forward to "now". */
export interface ScreenState {
  track: {
    /** Changes when the song changes (title|artist). */
    key: string;
    title: string;
    artist: string;
    album?: string;
    isPaused: boolean;
    positionMs: number;
    durationMs: number;
    hasCover: boolean;
    device?: string;
    /** 0..1, when the extension reports it. */
    volume?: number;
    /** BPM, when Spotify knows it. */
    tempo?: number;
  } | null;
  lyrics: Lyrics | null;
  lyricsLoading: boolean;
}

/** The bit of a WebSocket the control channel uses (a fake in tests). */
export interface ControlSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'close', listener: () => void): void;
}

const CONTROL_ACTIONS = new Set(['previous', 'togglePlay', 'next', 'volumeUp', 'volumeDown']);

/**
 * Music from Spotify (via a Spicetify extension) shown in the office.
 * The extension POSTs the current track to /api/music with a music-only token;
 * clients get `musicNowPlaying` (to everyone) and `musicStatus` (token and
 * install outcome to privileged clients only). Nothing is written to disk but
 * the feature's own settings file.
 */
export function createMusicFeature(opts: MusicFeatureOptions): ServerFeature & {
  /** The account's most listened artists (empty without a Spotify session). */
  topArtists(): Promise<string[]>;
  /** For tests: what clients currently see. */
  current(): MusicTrack | undefined;
  /** The extension's control channel opened (exposed for tests; the WebSocket route calls it). */
  attachControl(socket: ControlSocket): void;
  currentLyrics(): Lyrics | undefined;
  /** What other screens get from GET /api/music/now. */
  screenState(): ScreenState;
  /** A playback command from a screen or the office (exposed for tests). */
  sendControl(action: string): boolean;
  /** One round of asking Spotify's Web API what's playing (exposed for tests; the timer calls it). */
  pollSpotify(): Promise<void>;
  /** "Playlist del día" (exposed for tests). */
  playlists: Playlists;
} {
  const run = opts.run ?? runSpicetify;
  const covers = opts.covers ?? new CoverCache();
  const now = opts.now ?? Date.now;
  let config: MusicConfig = readMusicConfig();
  let track: MusicTrack | undefined;
  /** CDN URL of the current track's cover (to tell a new cover from the same one). */
  let trackCoverUrl: string | undefined;
  let lastReportAt = 0;
  /** Last report from the extension (Spotify open on this computer): while fresh, it is the main source. */
  let lastExtensionAt = 0;
  /** Last LRCLIB lookup and last cover download (the connections board shows them). */
  let lastLrclibAt = 0;
  let lastCoverAt = 0;
  let source: TrackSource | undefined;
  /** When the current track's position was reported (to move it forward while it plays). */
  let trackReportedAt = 0;
  /** Only the screens use these (the office shows neither), so they stay out of MusicTrack. */
  let volume: number | undefined;
  let tempo: number | undefined;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  let spicetify = { found: false, installed: false };
  let lastMessage: string | undefined;
  const clients = new Set<FeatureClient>();
  /** Spotify extensions connected for playback control (normally one). */
  const controlSockets = new Set<ControlSocket>();
  // The account's playback through Spotify's Web API, when music.json has a client id: it also works with
  // Spotify closed here (a phone, an Echo…). The session (refresh token) lives in music.json.
  const spotify: SpotifyApi | undefined = config.spotifyClientId
    ? createSpotifyApi({
        clientId: config.spotifyClientId,
        redirectUri: () => `${opts.serverUrl() ?? 'http://127.0.0.1'}${SPOTIFY_CALLBACK_PATH}`,
        refreshToken: config.spotifyRefreshToken,
        scopes: config.spotifyScopes,
        fetcher: opts.spotifyFetch,
        sleep: opts.spotifySleep,
        now,
        onRefreshToken: (refresh) => {
          const { spotifyRefreshToken: _old, spotifyScopes: scopes, ...rest } = config;
          // Spotify rotates the refresh token on every refresh: the session is the same one and keeps its
          // permissions. Without a session they go with it.
          config = refresh
            ? {
                ...rest,
                spotifyRefreshToken: refresh,
                ...(scopes ? { spotifyScopes: scopes } : {}),
              }
            : rest;
          writeMusicConfig(config);
          // Only a lost session drops what was read with it (a rotation must not wipe a preview under review).
          if (!refresh) playlists.sessionChanged();
          broadcastStatus();
          broadcastPlaylists();
          if (refresh) scheduleSpotify();
        },
        onScopes: (scopes) => {
          config = { ...config, spotifyScopes: scopes };
          writeMusicConfig(config);
          broadcastPlaylists();
        },
      })
    : undefined;
  /** "Playlist del día": only the owner (privileged clients) sees it or drives it. */
  const playlists: Playlists = createPlaylists({
    spotify,
    now,
    rng: opts.rng,
    onChange: () => broadcastPlaylists(),
  });
  function broadcastPlaylists(): void {
    const msg = playlists.status() as unknown as Record<string, unknown>;
    for (const c of clients) if (c.privileged) c.send(msg);
  }
  const spotifyConnected = () => spotify?.connected() ?? false;
  let spotifyTimer: ReturnType<typeof setTimeout> | undefined;
  /** Off by default where Spicetify isn't installed (and no Spotify session): nobody sees an empty music corner. */
  const isEnabled = () => config.enabled ?? (spicetify.found || spotifyConnected());
  const fetchLyrics = opts.fetchLyrics ?? fetchLrclib;
  /** Song the current lyrics belong to (title|artist), and the lyrics themselves. */
  let songNow: string | undefined;
  let lyrics: Lyrics | undefined;
  /** Still looking for the current song's lyrics (the page shows a loader meanwhile). */
  let lyricsSearching = false;
  /** Lyrics the extension sent before (or without) the matching track report; null = Spotify has none. */
  const pendingLyrics = new Map<string, Lyrics | null>();
  const askedLrclib = new Set<string>();
  let lyricsTimer: ReturnType<typeof setTimeout> | undefined;

  const nowPlaying = (): Record<string, unknown> => ({
    type: 'musicNowPlaying',
    ...(isEnabled() && track ? { track } : {}),
  });
  const status = (client: FeatureClient): MusicStatus => ({
    type: 'musicStatus',
    enabled: isEnabled(),
    controls: controlSockets.size > 0 || spotifyConnected(),
    spicetifyFound: spicetify.found,
    extensionInstalled: spicetify.installed,
    spotifyConfigured: spotify !== undefined,
    spotifyConnected: spotifyConnected(),
    ...(track && source ? { source } : {}),
    ...(client.privileged ? { token: config.token } : {}),
    ...(client.privileged && lastMessage ? { message: lastMessage } : {}),
  });
  const lyricsMessage = (): Record<string, unknown> => {
    if (!isEnabled() || !track) return { type: 'musicLyrics' };
    const song = { type: 'musicLyrics', title: track.title, artist: track.artist };
    if (lyrics) return { ...song, ...lyrics };
    // No lines: still looking (loader), or looked everywhere and there are none.
    return lyricsSearching ? { ...song, loading: true } : song;
  };
  const broadcastLyrics = () => {
    const msg = lyricsMessage();
    for (const c of clients) c.send(msg);
  };
  const broadcastNowPlaying = () => {
    const msg = nowPlaying();
    for (const c of clients) c.send(msg);
  };
  const broadcastStatus = () => {
    for (const c of clients) c.send(status(c) as unknown as Record<string, unknown>);
  };

  async function refreshSpicetify(): Promise<void> {
    const userdata = await spicetifyUserdata(run);
    spicetify = {
      found: userdata !== null,
      installed: userdata !== null && isExtensionInstalled(userdata),
    };
  }
  void refreshSpicetify().then(broadcastStatus);

  function armStaleTimer(): void {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      if (now() - lastReportAt >= MUSIC_STALE_MS && track) {
        track = undefined;
        songChanged(undefined);
        broadcastNowPlaying();
      }
    }, MUSIC_STALE_MS);
    staleTimer.unref?.();
  }

  /** LRCLIB, once per song, when Spotify had no lyrics (or didn't answer in time). */
  function askLrclib(key: string): void {
    if (!track || askedLrclib.has(key)) return;
    askedLrclib.add(key);
    const song = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
    };
    lastLrclibAt = now();
    void fetchLyrics(song).then((found) => {
      if (songNow !== key || lyrics) return;
      // Found or not, the search is over: lyrics, or the "no lyrics" message instead of the loader.
      lyrics = found;
      lyricsSearching = false;
      broadcastLyrics();
    });
  }

  /** A new song started: its lyrics may already be waiting, else give Spotify a moment, then LRCLIB. */
  function songChanged(key: string | undefined): void {
    songNow = key;
    lyrics = undefined;
    // "Once per song" means once per play: a song that comes back gets looked up again.
    askedLrclib.clear();
    if (lyricsTimer) clearTimeout(lyricsTimer);
    const waiting = key ? pendingLyrics.get(key) : undefined;
    if (waiting) {
      lyrics = waiting;
      lyricsSearching = false;
      broadcastLyrics();
      return;
    }
    lyricsSearching = Boolean(key);
    broadcastLyrics();
    if (!key) return;
    if (waiting === null) {
      askLrclib(key);
    } else {
      lyricsTimer = setTimeout(() => {
        if (songNow === key && !lyrics) askLrclib(key);
      }, LYRICS_FALLBACK_MS);
      lyricsTimer.unref?.();
    }
  }

  /** Spotify's lyrics, from the extension. */
  function receiveLyrics(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const b = body as { title?: unknown; artist?: unknown; synced?: unknown; lines?: unknown };
    if (typeof b.title !== 'string') return false;
    const key = songKey(b.title, typeof b.artist === 'string' ? b.artist : '');
    const synced = b.synced === true;
    const lines = cleanLines(b.lines, synced);
    const value: Lyrics | null = lines ? { synced, source: 'spotify', lines } : null;
    pendingLyrics.set(key, value);
    while (pendingLyrics.size > LYRICS_PENDING_SIZE) {
      pendingLyrics.delete(pendingLyrics.keys().next().value as string);
    }
    if (key === songNow) {
      if (value) {
        if (lyricsTimer) clearTimeout(lyricsTimer);
        lyrics = value;
        lyricsSearching = false;
        broadcastLyrics();
      } else if (!lyrics) {
        askLrclib(key);
      }
    }
    return true;
  }

  async function report(body: unknown, from: TrackSource = 'extension'): Promise<boolean> {
    const parsed = parseTrackReport(body);
    if (parsed === undefined) return false;
    if (from === 'extension') {
      lastExtensionAt = now();
      // Spotify here is paused while the account plays somewhere else (the Web API said so): that one wins.
      if (parsed?.isPaused && source === 'spotify' && track && !track.isPaused) return true;
    }
    lastReportAt = now();
    source = parsed ? from : undefined;
    armStaleTimer();
    if (parsed === null) {
      track = undefined;
      trackCoverUrl = undefined;
      volume = undefined;
      tempo = undefined;
      if (songNow) songChanged(undefined);
    } else {
      // The same cover as before: keep it (no re-download, no flicker between reports).
      const sameCover = Boolean(track?.cover) && parsed.coverUrl === trackCoverUrl;
      const next: MusicTrack = {
        title: parsed.title,
        artist: parsed.artist,
        ...(parsed.album ? { album: parsed.album } : {}),
        ...(sameCover && track?.cover ? { cover: track.cover } : {}),
        isPaused: parsed.isPaused,
        positionMs: parsed.positionMs,
        durationMs: parsed.durationMs,
        ...(parsed.device ? { device: parsed.device } : {}),
      };
      track = next;
      trackReportedAt = now();
      volume = parsed.volume;
      tempo = parsed.tempo;
      trackCoverUrl = parsed.coverUrl;
      const key = songKey(parsed.title, parsed.artist);
      if (key !== songNow) songChanged(key);
      if (parsed.coverUrl && !sameCover) {
        void covers.get(parsed.coverUrl).then((cover) => {
          if (cover) lastCoverAt = now();
          if (cover && track === next) {
            track = { ...next, cover };
            broadcastNowPlaying();
          }
        });
      }
    }
    broadcastNowPlaying();
    return true;
  }

  function screenState(): ScreenState {
    if (!isEnabled() || !track) return { track: null, lyrics: null, lyricsLoading: false };
    const elapsed = track.isPaused ? 0 : now() - trackReportedAt;
    return {
      track: {
        key: songNow ?? '',
        title: track.title,
        artist: track.artist,
        ...(track.album ? { album: track.album } : {}),
        isPaused: track.isPaused,
        positionMs: Math.min(track.positionMs + elapsed, track.durationMs || Infinity),
        durationMs: track.durationMs,
        hasCover: Boolean(track.cover),
        ...(track.device ? { device: track.device } : {}),
        ...(volume !== undefined ? { volume } : {}),
        ...(tempo !== undefined ? { tempo } : {}),
      },
      // Other screens keep their contract: an instrumental song still reads as "no lyrics" there.
      lyrics: lyrics && !lyrics.instrumental ? lyrics : null,
      lyricsLoading: lyricsSearching,
    };
  }

  const screen = config.screenPort
    ? (opts.startScreen ?? startScreenServer)({
        port: config.screenPort,
        token: () => config.token,
        state: screenState,
        cover: () => track?.cover,
        control: sendControl,
      })
    : undefined;

  /**
   * Relays a playback command to the extension, or to Spotify's Web API when the extension isn't connected;
   * false when it isn't one or nobody can run it.
   */
  function sendControl(action: string): boolean {
    if (!CONTROL_ACTIONS.has(action)) return false;
    if (controlSockets.size > 0) {
      const command = JSON.stringify({ action });
      for (const s of controlSockets) s.send(command);
      return true;
    }
    if (!spotify?.connected()) return false;
    void spotify.control(action, volume).then((ok) => {
      // See it reflected soon (Spotify takes a moment to report the change).
      if (ok) setTimeout(() => void pollSpotify(), 500).unref?.();
    });
    return true;
  }

  /**
   * Asks the account what's playing. The extension stays the source while Spotify runs on this computer and
   * plays (it knows the song's lyrics, tempo and skips at once); the API fills in when it is closed or paused.
   */
  async function pollSpotify(): Promise<void> {
    if (!spotify?.connected() || !isEnabled()) return;
    const extensionFresh = now() - lastExtensionAt < SPOTIFY_EXTENSION_FRESH_MS;
    if (extensionFresh && source === 'extension' && track && !track.isPaused) return;
    const playback = await spotify.playback();
    if (!playback) return;
    if (!playback.track) {
      if (!extensionFresh && track) await report({ track: null }, 'spotify');
      return;
    }
    // Both paused: the extension already said so (with more detail).
    if (extensionFresh && playback.track.isPaused && track) return;
    await report(playback, 'spotify');
  }

  function scheduleSpotify(): void {
    if (opts.pollSpotify === false || !spotify?.connected()) return;
    if (spotifyTimer) clearTimeout(spotifyTimer);
    spotifyTimer = setTimeout(() => {
      void pollSpotify().finally(scheduleSpotify);
    }, SPOTIFY_POLL_MS);
    spotifyTimer.unref?.();
  }
  if (spotify?.connected() && opts.pollSpotify !== false) {
    void pollSpotify().finally(scheduleSpotify);
  }

  function attachControl(socket: ControlSocket): void {
    controlSockets.add(socket);
    broadcastStatus();
    socket.on('close', () => {
      controlSockets.delete(socket);
      broadcastStatus();
    });
  }

  return {
    name: 'musica',
    /** The account's most listened artists (features/conciertos searches their concerts). */
    topArtists: (): Promise<string[]> => spotify?.topArtists() ?? Promise.resolve([]),

    connections: (): ConnectionInfo[] => {
      const at = (ms: number) => (ms ? { lastUsedAt: new Date(ms).toISOString() } : {});
      const extensionFresh = now() - lastExtensionAt < SPOTIFY_EXTENSION_FRESH_MS;
      return [
        {
          id: 'spotify-extension',
          name: 'Spotify de escritorio (Spicetify)',
          feature: 'Música',
          purpose: 'Canción actual, letra de Spotify y botones de reproducción',
          auth: 'Token propio de la oficina (music.json)',
          state: !spicetify.found
            ? 'off'
            : extensionFresh || controlSockets.size > 0
              ? 'ok'
              : 'warn',
          detail: !spicetify.found
            ? 'Spicetify no está instalado'
            : !spicetify.installed
              ? 'Falta instalar la extensión'
              : extensionFresh
                ? 'Spotify abierto y reportando'
                : 'Spotify cerrado o sin reportar',
          ...at(lastExtensionAt),
        },
        {
          id: 'spotify-web-api',
          name: 'Spotify Web API',
          feature: 'Música',
          purpose:
            'Lo que suena aunque Spotify esté cerrado aquí, botones, artistas más escuchados y playlist del día',
          auth: `OAuth PKCE, sin secreto. Permisos: ${SPOTIFY_SCOPES}`,
          state: !spotify
            ? 'off'
            : !spotifyConnected()
              ? 'off'
              : playlists.needsReconnect()
                ? 'warn'
                : 'ok',
          detail: !spotify
            ? 'Falta spotifyClientId en music.json'
            : !spotifyConnected()
              ? 'Sin conectar la cuenta'
              : playlists.needsReconnect()
                ? 'Falta el permiso de playlists: vuelve a conectar Spotify'
                : 'Cuenta conectada',
        },
        {
          id: 'lrclib',
          name: 'LRCLIB',
          feature: 'Música',
          purpose: 'Letra de respaldo cuando Spotify no la tiene',
          auth: 'Sin llave',
          state: 'ok',
          ...at(lastLrclibAt),
        },
        {
          id: 'spotify-covers',
          name: 'Portadas de Spotify (i.scdn.co)',
          feature: 'Música',
          purpose: 'Carátula del disco que suena',
          auth: 'Sin llave (solo ese servidor)',
          state: 'ok',
          ...at(lastCoverAt),
        },
      ];
    },

    registerRoutes(app: FastifyInstance) {
      // The extension runs inside Spotify (a public https origin) and posts to this local server:
      // Chromium's Private Network Access asks the preflight for explicit permission.
      app.addHook('onSend', async (request, reply) => {
        const route = request.url.split('?')[0];
        if (route === MUSIC_API_PATH || route === MUSIC_LYRICS_API_PATH) {
          reply.header('Access-Control-Allow-Private-Network', 'true');
        }
      });
      app.post(MUSIC_API_PATH, async (request, reply) => {
        const auth = request.headers.authorization ?? '';
        if (!timingSafeEqual(auth, `Bearer ${config.token}`)) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        const ok = await report(request.body);
        if (!ok) return reply.code(400).send({ error: 'bad report' });
        // No lyrics for this song yet (e.g. the office restarted mid-song): ask the extension to resend them.
        const needLyrics = Boolean(songNow && !lyrics && !pendingLyrics.has(songNow));
        return reply.send({ ok: true, needLyrics });
      });
      // Playback control: the extension keeps this socket open and runs what arrives on it.
      app.get(MUSIC_CONTROL_PATH, { websocket: true }, (socket, request) => {
        const token = new URL(request.url, 'http://localhost').searchParams.get('token') ?? '';
        if (!timingSafeEqual(token, config.token)) {
          socket.close(WS_CLOSE_POLICY, 'unauthorized');
          return;
        }
        attachControl(socket);
      });
      if (spotify) {
        // The owner clicks "Conectar con Spotify" in Settings: a link with the music token that lands here.
        app.get(SPOTIFY_LOGIN_PATH, async (request, reply) => {
          const token = new URL(request.url, 'http://localhost').searchParams.get('token') ?? '';
          if (!timingSafeEqual(token, config.token))
            return reply.code(401).send({ error: 'unauthorized' });
          return reply.redirect(spotify.authorizeUrl());
        });
        app.get(SPOTIFY_CALLBACK_PATH, async (request, reply) => {
          const params = new URL(request.url, 'http://localhost').searchParams;
          const error = params.get('error');
          const code = params.get('code');
          const state = params.get('state');
          const problem = error
            ? `Spotify dijo: ${error}`
            : !code || !state
              ? 'faltan datos en la respuesta de Spotify'
              : await spotify.exchangeCode(code, state);
          if (problem) console.warn(`${LOG_PREFIX} Spotify: no se pudo conectar (${problem})`);
          else {
            console.log(`${LOG_PREFIX} Conectado a la cuenta de Spotify`);
            // A new login: forget a "missing permission" answer and what the old session read.
            playlists.sessionChanged();
            broadcastPlaylists();
            void pollSpotify();
          }
          const text = problem
            ? `No se pudo conectar con Spotify: ${problem}.`
            : 'Listo: la oficina ya está conectada a Spotify. Puedes cerrar esta pestaña.';
          return reply
            .type('text/html; charset=utf-8')
            .send(
              `<!doctype html><html lang="es"><meta charset="utf-8"><title>Javbots</title><body style="font-family:sans-serif;padding:2em">${text}</body></html>`,
            );
        });
      }
      app.post(MUSIC_LYRICS_API_PATH, async (request, reply) => {
        const auth = request.headers.authorization ?? '';
        if (!timingSafeEqual(auth, `Bearer ${config.token}`)) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        return receiveLyrics(request.body)
          ? reply.send({ ok: true })
          : reply.code(400).send({ error: 'bad lyrics' });
      });
    },

    connect(client) {
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      switch (msg.type) {
        case 'webviewReady':
          // Initial state for this client; the core handler still runs.
          client.send(status(client) as unknown as Record<string, unknown>);
          client.send(nowPlaying());
          client.send(lyricsMessage());
          if (client.privileged)
            client.send(playlists.status() as unknown as Record<string, unknown>);
          return false;
        case 'setMusicEnabled':
          if (typeof msg.enabled !== 'boolean') return true;
          config = { ...config, enabled: msg.enabled };
          writeMusicConfig(config);
          broadcastStatus();
          broadcastNowPlaying();
          broadcastLyrics();
          return true;
        case 'musicControl': {
          // Skipping songs is the owner's call: privileged clients only.
          if (client.privileged) sendControl(String(msg.action));
          return true;
        }
        case 'disconnectSpotify': {
          if (!client.privileged || !spotify) return true;
          spotify.disconnect();
          if (source === 'spotify' && track) {
            track = undefined;
            source = undefined;
            songChanged(undefined);
            broadcastNowPlaying();
          }
          broadcastStatus();
          return true;
        }
        case 'playlistCommand':
          return playlists.handle(msg as Record<string, unknown>, client);
        case 'installMusicExtension': {
          if (!client.privileged) return true;
          const serverUrl = opts.serverUrl();
          if (!serverUrl) return true;
          void installExtension({
            run,
            templatePath: opts.templatePath,
            serverUrl,
            token: config.token,
          }).then(async (result) => {
            lastMessage = result.message;
            console.log(`${LOG_PREFIX} ${result.message}`);
            await refreshSpicetify();
            broadcastStatus();
          });
          return true;
        }
        default:
          return false;
      }
    },

    dispose() {
      if (staleTimer) clearTimeout(staleTimer);
      if (lyricsTimer) clearTimeout(lyricsTimer);
      if (spotifyTimer) clearTimeout(spotifyTimer);
      screen?.close();
      clients.clear();
    },

    current: () => track,
    attachControl,
    currentLyrics: () => lyrics,
    screenState,
    sendControl,
    pollSpotify,
    playlists,
  };
}
