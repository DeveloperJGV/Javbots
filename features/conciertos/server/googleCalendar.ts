import * as crypto from 'crypto';

import {
  CONCERT_PREFIX,
  CONCERTS_TIME_ZONE,
  FETCH_TIMEOUT_MS,
  GOOGLE_AUTH_URL,
  GOOGLE_CALENDAR_API,
  GOOGLE_PENDING_LOGIN_MS,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_URL,
} from './constants.js';

export type Fetcher = (
  url: string,
  init: { method?: string; signal: AbortSignal; headers: Record<string, string>; body?: string },
) => Promise<Response>;

/** A concert as the panel shows it: an event of the "Conciertos" calendar whose title starts with "Concierto:". */
export interface CalendarConcert {
  id: string;
  /** The title without the "Concierto:" prefix. */
  title: string;
  /** Best guess at the artist: the title up to " – " / " - " / ":". */
  artist: string;
  /** ISO date-time, or YYYY-MM-DD for an all-day event. */
  start: string;
  allDay: boolean;
  location?: string;
  link?: string;
}

/** The session died (revoked, or the 7-day limit of a Testing app): only a new login fixes it. */
export class GoogleReconnectNeeded extends Error {}

/** No calendar by that name among the ones the owner can write to. */
export class CalendarNotFound extends Error {}

export interface GoogleCalendarOptions {
  clientId: string;
  /** Desktop clients have a secret Google calls "not confidential"; the token endpoint still wants it. */
  clientSecret: string;
  redirectUri: () => string;
  refreshToken?: string;
  /** Persist a new refresh token (login) or forget it (undefined: revoked or expired). */
  onRefreshToken: (token: string | undefined) => void;
  fetcher?: Fetcher;
  now?: () => number;
}

/** Strips the prefix (any case) and guesses the artist from the rest. Null when it isn't a concert. */
export function parseConcertTitle(summary: string): { title: string; artist: string } | null {
  const s = summary.trim();
  if (s.slice(0, CONCERT_PREFIX.length).toLowerCase() !== CONCERT_PREFIX.toLowerCase()) return null;
  const title = s.slice(CONCERT_PREFIX.length).trim();
  if (!title) return null;
  const artist = title.split(/\s+[–—-]\s+|:\s/)[0].trim() || title;
  return { title, artist };
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Google Calendar events → concerts (cancelled and non-"Concierto:" events left out), soonest first. */
export function parseConcertEvents(raw: unknown): CalendarConcert[] {
  const out: CalendarConcert[] = [];
  for (const item of Array.isArray(obj(raw).items) ? (obj(raw).items as unknown[]) : []) {
    const e = obj(item);
    if (e.status === 'cancelled') continue;
    const parsed = parseConcertTitle(str(e.summary));
    const start = obj(e.start);
    const when = str(start.dateTime) || str(start.date);
    if (!parsed || !when) continue;
    const concert: CalendarConcert = {
      id: str(e.id),
      ...parsed,
      start: when,
      allDay: !start.dateTime,
    };
    if (str(e.location)) concert.location = str(e.location);
    if (str(e.htmlLink)) concert.link = str(e.htmlLink);
    out.push(concert);
  }
  return out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/**
 * The owner's Google Calendar, through the JavBots app (OAuth for desktop apps: loopback redirect + PKCE). The
 * refresh token lives in conciertos.json. Only what the concerts need: the "Conciertos" calendar, sharing it, and
 * reading/adding its events.
 */
export function createGoogleCalendar(opts: GoogleCalendarOptions) {
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

  function setRefreshToken(token: string | undefined): void {
    if (token === refreshToken) return;
    refreshToken = token;
    opts.onRefreshToken(token);
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
      if (err instanceof GoogleReconnectNeeded) setRefreshToken(undefined);
      throw err;
    }
    return accessToken as string;
  }

  async function api(
    pathAndQuery: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Raw> {
    const res = await call(GOOGLE_CALENDAR_API + pathAndQuery, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    if (res.status === 401) {
      accessToken = undefined;
      throw new Error('google 401');
    }
    const json = obj(await res.json().catch(() => ({})));
    if (!res.ok) throw new Error(`google ${res.status}: ${str(obj(json.error).message)}`);
    return json;
  }

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
        scope: GOOGLE_SCOPES,
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
      setRefreshToken(json.refresh_token);
      return true;
    },

    forget(): void {
      accessToken = undefined;
      setRefreshToken(undefined);
    },

    /**
     * An existing calendar the owner can write to: the remembered id if it is still there, else the one with this
     * name (case-insensitive). Never creates one: the office works on the owner's own calendars.
     */
    async findCalendar(name: string, knownId?: string): Promise<string> {
      const list = await api('/users/me/calendarList?minAccessRole=writer&maxResults=250');
      const items = Array.isArray(list.items) ? list.items.map(obj) : [];
      const found =
        items.find((c) => knownId && c.id === knownId) ??
        items.find((c) => str(c.summary).toLowerCase() === name.toLowerCase());
      if (!found) throw new CalendarNotFound(name);
      return str(found.id);
    },

    async listConcerts(
      calendarId: string,
      fromMs: number,
      toMs: number,
    ): Promise<CalendarConcert[]> {
      const q = new URLSearchParams({
        timeMin: new Date(fromMs).toISOString(),
        timeMax: new Date(toMs).toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      });
      return parseConcertEvents(
        await api(`/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`),
      );
    },

    /** Adds a concert ("Concierto: <title>") found on Ticketmaster. */
    async addConcert(
      calendarId: string,
      c: { title: string; start: string; allDay: boolean; location?: string; url?: string },
    ): Promise<void> {
      const startDate = new Date(c.start);
      const event: Raw = {
        summary: `${CONCERT_PREFIX} ${c.title}`,
        location: c.location,
        description: c.url ? `Boletos: ${c.url}` : undefined,
      };
      if (c.allDay) {
        const day = c.start.slice(0, 10);
        const next = new Date(`${day}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        event.start = { date: day };
        event.end = { date: next.toISOString().slice(0, 10) };
      } else {
        event.start = { dateTime: startDate.toISOString(), timeZone: CONCERTS_TIME_ZONE };
        event.end = {
          dateTime: new Date(startDate.getTime() + 3 * 3600_000).toISOString(),
          timeZone: CONCERTS_TIME_ZONE,
        };
      }
      await api(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: event,
      });
    },
  };
}

export type GoogleCalendar = ReturnType<typeof createGoogleCalendar>;
