import type { FastifyInstance } from 'fastify';

import type { MusicStatus, MusicTrack } from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import {
  LOG_PREFIX,
  LYRICS_FALLBACK_MS,
  LYRICS_PENDING_SIZE,
  MUSIC_API_PATH,
  MUSIC_LYRICS_API_PATH,
  MUSIC_STALE_MS,
} from './constants.js';
import { CoverCache } from './cover.js';
import { cleanLines, fetchLrclib, type Lyrics, songKey } from './lyrics.js';
import { type MusicConfig, readMusicConfig, writeMusicConfig } from './musicConfig.js';
import {
  installExtension,
  isExtensionInstalled,
  runSpicetify,
  type SpicetifyRunner,
  spicetifyUserdata,
} from './spicetify.js';
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
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Music from Spotify (via a Spicetify extension) shown in the office.
 * The extension POSTs the current track to /api/music with a music-only token;
 * clients get `musicNowPlaying` (to everyone) and `musicStatus` (token and
 * install outcome to privileged clients only). Nothing is written to disk but
 * the feature's own settings file.
 */
export function createMusicFeature(opts: MusicFeatureOptions): ServerFeature & {
  /** For tests: what clients currently see. */
  current(): MusicTrack | undefined;
  currentLyrics(): Lyrics | undefined;
} {
  const run = opts.run ?? runSpicetify;
  const covers = opts.covers ?? new CoverCache();
  const now = opts.now ?? Date.now;
  let config: MusicConfig = readMusicConfig();
  let track: MusicTrack | undefined;
  /** CDN URL of the current track's cover (to tell a new cover from the same one). */
  let trackCoverUrl: string | undefined;
  let lastReportAt = 0;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  let spicetify = { found: false, installed: false };
  let lastMessage: string | undefined;
  const clients = new Set<FeatureClient>();
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
    ...(config.enabled && track ? { track } : {}),
  });
  const status = (client: FeatureClient): MusicStatus => ({
    type: 'musicStatus',
    enabled: config.enabled,
    spicetifyFound: spicetify.found,
    extensionInstalled: spicetify.installed,
    ...(client.privileged ? { token: config.token } : {}),
    ...(client.privileged && lastMessage ? { message: lastMessage } : {}),
  });
  const lyricsMessage = (): Record<string, unknown> => {
    if (!config.enabled || !track) return { type: 'musicLyrics' };
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

  async function report(body: unknown): Promise<boolean> {
    const parsed = parseTrackReport(body);
    if (parsed === undefined) return false;
    lastReportAt = now();
    armStaleTimer();
    if (parsed === null) {
      track = undefined;
      trackCoverUrl = undefined;
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
      trackCoverUrl = parsed.coverUrl;
      const key = songKey(parsed.title, parsed.artist);
      if (key !== songNow) songChanged(key);
      if (parsed.coverUrl && !sameCover) {
        void covers.get(parsed.coverUrl).then((cover) => {
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

  return {
    name: 'musica',

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
          return false;
        case 'setMusicEnabled':
          if (typeof msg.enabled !== 'boolean') return true;
          config = { ...config, enabled: msg.enabled };
          writeMusicConfig(config);
          broadcastStatus();
          broadcastNowPlaying();
          broadcastLyrics();
          return true;
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
      clients.clear();
    },

    current: () => track,
    currentLyrics: () => lyrics,
  };
}
