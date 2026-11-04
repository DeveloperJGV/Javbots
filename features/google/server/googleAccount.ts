import * as crypto from 'crypto';

import {
  FETCH_TIMEOUT_MS,
  GOOGLE_AUTH_URL,
  GOOGLE_PENDING_LOGIN_MS,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_URL,
} from './constants.js';

export type Fetcher = (
  url: string,
  init: { method?: string; signal: AbortSignal; headers: Record<string, string>; body?: string },
) => Promise<Response>;

/** The session died (revoked, or the 7-day limit of a Testing app): only a new login fixes it. */
export class GoogleReconnectNeeded extends Error {}

/** A Google API answered with an error. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A JSON call to any Google API with the session's token (absolute URL). */
export type GoogleApi = (
  url: string,
  init?: { method?: string; body?: unknown },
) => Promise<Record<string, unknown>>;

/** A GET that returns the raw bytes (a file's content from Drive), with the session's token. */
export type GoogleDownload = (url: string) => Promise<Buffer>;

export interface GoogleAccountOptions {
  clientId: string;
  /** Desktop clients have a secret Google calls "not confidential"; the token endpoint still wants it. */
  clientSecret: string;
  redirectUri: () => string;
  refreshToken?: string;
  /** Persist a new session (login) or forget it (undefined: revoked or expired). */
  onSession: (session: { refreshToken: string; scopes: string[] } | undefined) => void;
  fetcher?: Fetcher;
  now?: () => number;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The owner's Google account, through their own Desktop app client (loopback redirect + PKCE). One login asks for
 * every permission the office uses (GOOGLE_SCOPES); features call the APIs through `api`.
 */
export function createGoogleAccount(opts: GoogleAccountOptions) {
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const now = opts.now ?? Date.now;
  let refreshToken = opts.refreshToken;
  let accessToken: string | undefined;
  let expiresAt = 0;
  const pending = new Map<string, { verifier: string; at: number }>();

  async function call(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

  function drop(): void {
    accessToken = undefined;
    if (refreshToken === undefined) return;
    refreshToken = undefined;
    opts.onSession(undefined);
  }

  async function tokenRequest(params: Record<string, string>): Promise<Raw> {
    const res = await call(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        ...params,
      }).toString(),
    });
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok) {
      if (json.error === 'invalid_grant')
        throw new GoogleReconnectNeeded(str(json.error_description));
      throw new Error(`google token ${res.status}: ${str(json.error)}`);
    }
    if (typeof json.access_token !== 'string') throw new Error('google: sin access_token');
    accessToken = json.access_token;
    expiresAt =
      now() + ((typeof json.expires_in === 'number' ? json.expires_in : 3600) - 60) * 1000;
    return json;
  }

  async function token(): Promise<string> {
    if (accessToken && now() < expiresAt) return accessToken;
    if (!refreshToken) throw new GoogleReconnectNeeded('sin sesión');
    try {
      await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
    } catch (err) {
      if (err instanceof GoogleReconnectNeeded) drop();
      throw err;
    }
    return accessToken as string;
  }

  const api: GoogleApi = async (url, init = {}) => {
    const res = await call(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401) accessToken = undefined;
    if (res.status === 204) return {};
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok)
      throw new GoogleApiError(res.status, `google ${res.status}: ${str(obj(json.error).message)}`);
    return json;
  };

  const download: GoogleDownload = async (url) => {
    const res = await call(url, { headers: { Authorization: `Bearer ${await token()}` } });
    if (res.status === 401) accessToken = undefined;
    if (!res.ok) {
      const json = obj(await res.json().catch(() => ({})));
      throw new GoogleApiError(res.status, `google ${res.status}: ${str(obj(json.error).message)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  };

  return {
    get connected(): boolean {
      return !!refreshToken;
    },

    /** Where the browser goes to log in; `state` ties the callback to this login. */
    authorizeUrl(): string {
      const cutoff = now() - GOOGLE_PENDING_LOGIN_MS;
      for (const [k, v] of pending) if (v.at < cutoff) pending.delete(k);
      const verifier = crypto.randomBytes(48).toString('base64url');
      const state = crypto.randomBytes(16).toString('base64url');
      pending.set(state, { verifier, at: now() });
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      return `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri(),
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString()}`;
    },

    /** The callback: trade the code for tokens. False when the state is unknown (old or forged). */
    async finishLogin(code: string, state: string): Promise<boolean> {
      const login = pending.get(state);
      if (!login) return false;
      pending.delete(state);
      const json = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        code_verifier: login.verifier,
        redirect_uri: opts.redirectUri(),
      });
      if (typeof json.refresh_token !== 'string') throw new Error('google: sin refresh_token');
      refreshToken = json.refresh_token;
      // Google reports what was granted (the owner may untick a permission on the consent screen).
      const scopes = str(json.scope) ? str(json.scope).split(/\s+/) : [...GOOGLE_SCOPES];
      opts.onSession({ refreshToken, scopes });
      return true;
    },

    forget(): void {
      drop();
    },

    api,
    download,
  };
}

export type GoogleAccount = ReturnType<typeof createGoogleAccount>;
