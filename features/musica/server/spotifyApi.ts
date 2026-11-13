import * as crypto from 'crypto';

import {
  SPOTIFY_ACCOUNTS_URL,
  SPOTIFY_ACCOUNTS_URL_ENV,
  SPOTIFY_API_URL,
  SPOTIFY_API_URL_ENV,
  SPOTIFY_FETCH_TIMEOUT_MS,
  SPOTIFY_MAX_RETRIES,
  SPOTIFY_RETRY_MAX_WAIT_SEC,
  SPOTIFY_SCOPES,
  SPOTIFY_VOLUME_STEP,
  spotifyBaseUrl,
} from './constants.js';

type Fetcher = (
  url: string,
  init: { method?: string; signal: AbortSignal; headers: Record<string, string>; body?: string },
) => Promise<Response>;

export interface SpotifyApiOptions {
  clientId: string;
  /** Where Spotify sends the browser back after the login (must be registered in the app's dashboard). */
  redirectUri: () => string;
  refreshToken?: string;
  /** Called when the refresh token changes (login, rotation) or is lost (revoked): persist it. */
  onRefreshToken: (token: string | undefined) => void;
  fetcher?: Fetcher;
  now?: () => number;
  /** Permissions granted to the saved session (music.json), when known. */
  scopes?: string;
  /** Called when Spotify reports the granted permissions (login, refresh): persist them. */
  onScopes?: (scopes: string) => void;
  /** Waits before a retry (tests pass one that doesn't really wait). */
  sleep?: (ms: number) => Promise<void>;
}

export type SpotifyErrorKind =
  'no-session' | 'permission' | 'forbidden' | 'rate-limit' | 'not-found' | 'http' | 'network';

/** A failed `request`: what kind of failure, so callers can tell the owner something useful. */
export class SpotifyError extends Error {
  constructor(
    readonly kind: SpotifyErrorKind,
    message: string,
    readonly status?: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'SpotifyError';
  }
}

export interface SpotifyRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/** What `/me/player` says, in the shape of the extension's report body (so one path handles both). */
export interface SpotifyPlayback {
  track: {
    title: string;
    artist: string;
    album?: string;
    image?: string;
    isPaused: boolean;
    positionMs: number;
    durationMs: number;
    device?: string;
    volume?: number;
  } | null;
}

/**
 * Spotify's Web API as a second source of "what's playing": it works with Spotify closed on this computer
 * (a phone, an Echo…). Authorization Code + PKCE (no client secret), the refresh token lives in music.json.
 * Only the owner's account, only read playback and the playback buttons.
 */
export function createSpotifyApi(opts: SpotifyApiOptions) {
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const apiUrl = spotifyBaseUrl(SPOTIFY_API_URL_ENV, SPOTIFY_API_URL);
  const accountsUrl = spotifyBaseUrl(SPOTIFY_ACCOUNTS_URL_ENV, SPOTIFY_ACCOUNTS_URL);
  let refreshToken = opts.refreshToken;
  let grantedScopes = opts.scopes;
  let accessToken: string | undefined;
  let expiresAt = 0;
  /** PKCE verifier of the login in progress, by state (a login that never comes back just expires). */
  const pending = new Map<string, { verifier: string; at: number }>();

  const base64url = (buf: Buffer) => buf.toString('base64url');

  async function call(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPOTIFY_FETCH_TIMEOUT_MS);
    try {
      return await fetcher(url, {
        ...init,
        headers: init.headers ?? {},
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function setRefreshToken(token: string | undefined): void {
    if (token === refreshToken) return;
    refreshToken = token;
    opts.onRefreshToken(token);
  }

  function saveTokens(json: {
    access_token?: unknown;
    expires_in?: unknown;
    refresh_token?: unknown;
    scope?: unknown;
  }): void {
    if (typeof json.access_token !== 'string') throw new Error('spotify: sin access_token');
    accessToken = json.access_token;
    const seconds = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    expiresAt = now() + (seconds - 60) * 1000;
    if (typeof json.refresh_token === 'string' && json.refresh_token)
      setRefreshToken(json.refresh_token);
    if (typeof json.scope === 'string' && json.scope !== grantedScopes) {
      grantedScopes = json.scope;
      opts.onScopes?.(json.scope);
    }
  }

  /** The URL to send the browser to; the verifier waits for the callback with the same `state`. */
  function authorizeUrl(): string {
    const verifier = base64url(crypto.randomBytes(64));
    const state = base64url(crypto.randomBytes(16));
    for (const [key, value] of pending) if (now() - value.at > 10 * 60_000) pending.delete(key);
    pending.set(state, { verifier, at: now() });
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const params = new URLSearchParams({
      client_id: opts.clientId,
      response_type: 'code',
      redirect_uri: opts.redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SPOTIFY_SCOPES,
    });
    return `${accountsUrl}/authorize?${params}`;
  }

  /** The callback: swaps the code for tokens. Returns null when it worked, else what went wrong. */
  async function exchangeCode(code: string, state: string): Promise<string | null> {
    const login = pending.get(state);
    if (!login) return 'el inicio de sesión ya venció o no es de esta oficina';
    pending.delete(state);
    const body = new URLSearchParams({
      client_id: opts.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: opts.redirectUri(),
      code_verifier: login.verifier,
    });
    const res = await call(`${accountsUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) return `Spotify respondió ${res.status}`;
    saveTokens((await res.json()) as Record<string, unknown>);
    return null;
  }

  /** A valid access token, refreshing it when needed; undefined when there is no session (or it was revoked). */
  async function token(): Promise<string | undefined> {
    if (accessToken && now() < expiresAt) return accessToken;
    if (!refreshToken) return undefined;
    const body = new URLSearchParams({
      client_id: opts.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const res = await call(`${accountsUrl}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (res.status === 400 || res.status === 401) {
      // Revoked or expired for good: the user has to connect again.
      accessToken = undefined;
      setRefreshToken(undefined);
      return undefined;
    }
    if (!res.ok) throw new Error(`spotify refresh ${res.status}`);
    saveTokens((await res.json()) as Record<string, unknown>);
    return accessToken;
  }

  async function api(path: string, method = 'GET'): Promise<Response | undefined> {
    const t = await token();
    if (!t) return undefined;
    const res = await call(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.status === 401) accessToken = undefined;
    return res;
  }

  /** Spotify's message in an error body ({ error: { message } }), when there is one. */
  async function errorMessage(res: Response): Promise<string | undefined> {
    try {
      const json = (await res.json()) as { error?: { message?: unknown } | string };
      if (typeof json.error === 'string') return json.error;
      return typeof json.error?.message === 'string' ? json.error.message : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * A Web API call that returns the JSON (undefined on 204 / empty body) or throws a SpotifyError. A 401 refreshes
   * the session and retries once; a short 429 waits and retries, a long one fails at once; a 5xx retries.
   */
  async function request(path: string, options: SpotifyRequestOptions = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {}))
      if (value !== undefined) params.set(key, String(value));
    const qs = params.toString();
    const url = `${apiUrl}${path}${qs ? `?${qs}` : ''}`;
    let refreshed = false;
    let retries = 0;
    for (;;) {
      let t: string | undefined;
      try {
        t = await token();
      } catch (err) {
        throw new SpotifyError('network', `spotify: ${(err as Error).message}`);
      }
      if (!t) throw new SpotifyError('no-session', 'spotify: sin sesión');
      const headers: Record<string, string> = { Authorization: `Bearer ${t}` };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await call(url, {
          method,
          headers,
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
      } catch (err) {
        throw new SpotifyError('network', `spotify: ${(err as Error).message}`);
      }
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        accessToken = undefined;
        continue;
      }
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After') ?? '1');
        const seconds = Number.isFinite(wait) && wait >= 0 ? wait : 1;
        if (seconds > SPOTIFY_RETRY_MAX_WAIT_SEC || retries >= SPOTIFY_MAX_RETRIES)
          throw new SpotifyError('rate-limit', 'spotify: demasiadas peticiones', 429, seconds);
        retries++;
        await sleep(seconds * 1000);
        continue;
      }
      if (res.status >= 500 && retries < 1) {
        retries++;
        continue;
      }
      if (res.status === 204) return undefined;
      if (!res.ok) {
        const message = (await errorMessage(res)) ?? `Spotify respondió ${res.status}`;
        if (res.status === 401) {
          accessToken = undefined;
          throw new SpotifyError('no-session', message, 401);
        }
        if (res.status === 403)
          throw new SpotifyError(/scope/i.test(message) ? 'permission' : 'forbidden', message, 403);
        if (res.status === 404) throw new SpotifyError('not-found', message, 404);
        throw new SpotifyError('http', message, res.status);
      }
      const text = await res.text();
      if (!text) return undefined;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return undefined;
      }
    }
  }

  /**
   * What the account is playing, anywhere. `track: null` when nothing (or an ad/podcast); undefined when
   * there's no session or Spotify didn't answer (the caller keeps what it had).
   */
  async function playback(): Promise<SpotifyPlayback | undefined> {
    let res: Response | undefined;
    try {
      res = await api('/me/player?additional_types=track');
    } catch {
      return undefined;
    }
    if (!res) return undefined;
    if (res.status === 204) return { track: null };
    if (!res.ok) return undefined;
    return toPlayback((await res.json()) as Record<string, unknown>);
  }

  /** The office's playback buttons, when the extension isn't there to run them. */
  async function control(action: string, volume: number | undefined): Promise<boolean> {
    try {
      let res: Response | undefined;
      switch (action) {
        case 'next':
          res = await api('/me/player/next', 'POST');
          break;
        case 'previous':
          res = await api('/me/player/previous', 'POST');
          break;
        case 'togglePlay': {
          const current = await playback();
          if (!current?.track) return false;
          res = await api(current.track.isPaused ? '/me/player/play' : '/me/player/pause', 'PUT');
          break;
        }
        case 'volumeUp':
        case 'volumeDown': {
          if (volume === undefined) return false;
          const step = action === 'volumeUp' ? SPOTIFY_VOLUME_STEP : -SPOTIFY_VOLUME_STEP;
          const percent = Math.max(0, Math.min(100, Math.round(volume * 100 + step)));
          res = await api(`/me/player/volume?volume_percent=${percent}`, 'PUT');
          break;
        }
        default:
          return false;
      }
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }

  /**
   * The artists the account listens to most (last ~6 months), most listened first. Empty without a session, or
   * when the session predates the user-top-read permission (403: connect Spotify again).
   */
  async function topArtists(limit = 20): Promise<string[]> {
    try {
      const res = await api(`/me/top/artists?limit=${limit}&time_range=medium_term`);
      if (!res?.ok) return [];
      const json = (await res.json()) as { items?: { name?: unknown }[] };
      return (json.items ?? [])
        .map((a) => a.name)
        .filter((n): n is string => typeof n === 'string');
    } catch {
      return [];
    }
  }

  return {
    authorizeUrl,
    exchangeCode,
    request,
    /** Permissions granted to the session; undefined while unknown (no login or refresh seen yet). */
    scopes: (): string[] | undefined =>
      grantedScopes === undefined ? undefined : grantedScopes.split(/\s+/).filter(Boolean),
    playback,
    control,
    topArtists,
    /** There is a session (a refresh token) to poll with. */
    connected: () => Boolean(refreshToken),
    /** Forget the session (the user disconnects). */
    disconnect: () => {
      accessToken = undefined;
      grantedScopes = undefined;
      setRefreshToken(undefined);
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;

/** `/me/player` → the report body the extension would have sent. Exported for tests. */
export function toPlayback(json: Record<string, unknown>): SpotifyPlayback {
  if (json.currently_playing_type !== 'track') return { track: null };
  const item = json.item as Record<string, unknown> | null | undefined;
  if (!item || typeof item.name !== 'string') return { track: null };
  const artists = Array.isArray(item.artists)
    ? (item.artists as { name?: unknown }[])
        .map((a) => a.name)
        .filter((n): n is string => typeof n === 'string')
    : [];
  const album = item.album as
    { name?: unknown; images?: { url?: unknown; width?: unknown }[] } | undefined;
  // Spotify lists covers from largest to smallest.
  const image = album?.images?.[0]?.url;
  const device = json.device as
    { name?: unknown; type?: unknown; volume_percent?: unknown } | undefined;
  const isComputer = typeof device?.type === 'string' && device.type.toLowerCase() === 'computer';
  return {
    track: {
      title: item.name,
      artist: artists.join(', '),
      ...(typeof album?.name === 'string' ? { album: album.name } : {}),
      ...(typeof image === 'string' ? { image } : {}),
      isPaused: json.is_playing !== true,
      positionMs: typeof json.progress_ms === 'number' ? json.progress_ms : 0,
      durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : 0,
      ...(typeof device?.name === 'string' && !isComputer ? { device: device.name } : {}),
      ...(typeof device?.volume_percent === 'number'
        ? { volume: device.volume_percent / 100 }
        : {}),
    },
  };
}
