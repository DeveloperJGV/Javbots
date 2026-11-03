import type { ConcertsStatus, ConnectionInfo } from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { GoogleReconnectNeeded } from '../../google/server/googleAccount.js';
import type { GoogleSession } from '../../google/server/googleFeature.js';
import {
  type ConcertsConfig,
  concertsConfigPath,
  readConcertsConfig,
  updateConcertsConfig,
} from './concertsConfig.js';
import {
  CONCERTS_HORIZON_DAYS,
  CONCERTS_REFRESH_MS,
  CONCERTS_TICK_MS,
  DEFAULT_CALENDAR_NAME,
  LOG_PREFIX,
} from './constants.js';
import { type CalendarConcert, CalendarNotFound, createGoogleCalendar } from './googleCalendar.js';
import { type FoundConcert, normalizeName, searchConcerts } from './ticketmaster.js';

const DAY_MS = 86_400_000;

export interface ConcertsFeatureOptions {
  /** The shared Google session (features/google); null without it. */
  google: GoogleSession | null;
  /** The owner's most listened artists (Spotify), for the search. Empty when unknown. */
  topArtists?: () => Promise<string[]>;
  configFile?: string;
  now?: () => number;
  /** Tests: replace the Ticketmaster search. */
  search?: (apiKey: string, artists: string[]) => Promise<FoundConcert[]>;
}

/**
 * "Mis próximos conciertos" (features/conciertos): the concerts of one of the owner's Google calendars (`calendario`; events
 * titled "Concierto: …", through the shared Google session), a search of Ticketmaster México for the artists they listen to most, and adding a found
 * concert to the calendar. Privileged pages only. Its keys live in conciertos.json.
 */
export function createConcertsFeature(opts: ConcertsFeatureOptions): ServerFeature & {
  refresh(): Promise<void>;
} {
  const file = opts.configFile ?? concertsConfigPath();
  const now = opts.now ?? Date.now;
  const clients = new Set<FeatureClient>();
  let config = readConcertsConfig(file).config;
  let concerts: CalendarConcert[] = [];
  let found: FoundConcert[] = [];
  let searching = false;
  let lastError: string | undefined;
  let readAt = -Infinity;
  /** When Ticketmaster last answered fine (for the connections board). */
  let searchOkAt: number | undefined;
  let reading: Promise<void> | null = null;

  const save = (changes: Partial<ConcertsConfig>) => {
    try {
      updateConcertsConfig(changes, file);
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude guardar conciertos.json:`, (err as Error).message);
    }
    config = { ...config, ...changes };
  };

  const session = opts.google;
  const calendar = session ? createGoogleCalendar(session.api) : null;
  const unsubscribe = session?.onChange(() => {
    if (!session.connected) concerts = [];
    void refresh();
  });

  /** The keys are pasted by hand while the office runs: pick up new ones without a restart. */
  function reloadKeys(): void {
    config = { ...readConcertsConfig(file).config };
  }

  function status(): ConcertsStatus {
    const msg: ConcertsStatus = {
      type: 'concertsStatus',
      googleConfigured: !!session?.configured,
      googleConnected: !!session?.connected,
      ticketmasterConfigured: !!config.ticketmasterKey,
      concerts: concerts.map((c) => {
        const out: ConcertsStatus['concerts'][number] = {
          id: c.id,
          title: c.title,
          artist: c.artist,
          start: c.start,
          allDay: c.allDay,
        };
        if (c.location) out.location = c.location;
        if (c.link) out.link = c.link;
        return out;
      }),
      found: found.map((c) => {
        const out: ConcertsStatus['found'][number] = {
          id: c.id,
          artist: c.artist,
          name: c.name,
          start: c.start,
          allDay: c.allDay,
        };
        if (c.venue) out.venue = c.venue;
        if (c.city) out.city = c.city;
        if (c.url) out.url = c.url;
        return out;
      }),
      searching,
    };
    const reconnect = session?.reconnectInDays();
    if (reconnect !== undefined) msg.reconnectInDays = reconnect;
    if (lastError) msg.error = lastError;
    return msg;
  }

  const broadcast = () => {
    const msg = status() as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  };

  const calendarName = () => config.calendario ?? DEFAULT_CALENDAR_NAME;

  /** The owner's calendar (by name; its id is remembered). Never created or shared here. */
  async function prepareCalendar(): Promise<string> {
    const id = await (calendar as NonNullable<typeof calendar>).findCalendar(
      calendarName(),
      config.calendarId,
    );
    if (id !== config.calendarId) save({ calendarId: id });
    return id;
  }

  async function readCalendar(): Promise<void> {
    reloadKeys();
    if (!calendar || !session?.connected) {
      concerts = [];
      return;
    }
    try {
      const id = await prepareCalendar();
      concerts = await calendar.listConcerts(
        id,
        now() - DAY_MS,
        now() + CONCERTS_HORIZON_DAYS * DAY_MS,
      );
      lastError = undefined;
    } catch (err) {
      if (err instanceof GoogleReconnectNeeded) {
        concerts = [];
        lastError = 'La conexión con Google caducó: vuelve a conectar.';
      } else {
        lastError =
          err instanceof CalendarNotFound
            ? `No encontré el calendario "${calendarName()}" en tu cuenta.`
            : 'No pude leer el calendario.';
        console.warn(`${LOG_PREFIX} Calendario:`, (err as Error).message);
      }
    }
  }

  function refresh(force = true): Promise<void> {
    if (!force && now() - readAt < CONCERTS_REFRESH_MS) return Promise.resolve();
    readAt = now();
    reading ??= readCalendar()
      .then(broadcast)
      .finally(() => (reading = null));
    return reading;
  }

  async function search(): Promise<void> {
    reloadKeys();
    const key = config.ticketmasterKey;
    if (!key || searching) return;
    searching = true;
    broadcast();
    try {
      const top = (await opts.topArtists?.().catch(() => [])) ?? [];
      // The artists already in the calendar too (they may tour again), without repeats.
      const names = new Map<string, string>();
      for (const a of [...top, ...concerts.map((c) => c.artist)]) {
        const k = normalizeName(a);
        if (k && !names.has(k)) names.set(k, a);
      }
      const doSearch = opts.search ?? ((k, a) => searchConcerts(k, a));
      const result = await doSearch(key, [...names.values()]);
      // What is already in the calendar (same artist, same day) isn't news.
      const have = new Set(
        concerts.map((c) => `${normalizeName(c.artist)}|${c.start.slice(0, 10)}`),
      );
      searchOkAt = now();
      found = result.filter((c) => !have.has(`${normalizeName(c.artist)}|${c.start.slice(0, 10)}`));
      lastError = names.size ? undefined : 'Conecta Spotify para saber qué artistas buscar.';
    } catch (err) {
      lastError = 'No pude buscar en Ticketmaster.';
      console.warn(`${LOG_PREFIX} Ticketmaster:`, (err as Error).message);
    } finally {
      searching = false;
      broadcast();
    }
  }

  async function add(id: string): Promise<void> {
    const c = found.find((f) => f.id === id);
    if (!c || !calendar || !session?.connected) return;
    try {
      const calendarId = await prepareCalendar();
      const where = [c.venue, c.city].filter(Boolean).join(', ');
      await calendar.addConcert(calendarId, {
        title: c.name,
        start: c.start,
        allDay: c.allDay,
        location: where || undefined,
        url: c.url,
      });
      found = found.filter((f) => f.id !== id);
    } catch (err) {
      lastError = 'No pude agregarlo al calendario.';
      console.warn(`${LOG_PREFIX} Agregar:`, (err as Error).message);
    }
    await refresh();
  }

  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (clients.size) void refresh(false);
  }, CONCERTS_TICK_MS);
  timer.unref?.();

  return {
    name: 'conciertos',
    refresh: () => refresh(),

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      if (!client.privileged) return false;
      switch (msg.type) {
        case 'webviewReady':
          client.send(status() as unknown as Record<string, unknown>);
          void refresh(false);
          return false; // the core handler still runs
        case 'refreshConcerts':
          void refresh();
          return true;
        case 'searchConcerts':
          void search();
          return true;
        case 'addConcert':
          if (typeof msg.id === 'string') void add(msg.id);
          return true;
        default:
          return false;
      }
    },

    /** For the connections board (features/conexiones). No keys or emails in here. */
    connections(): ConnectionInfo[] {
      reloadKeys();
      const iso = (t?: number) => (t ? { lastUsedAt: new Date(t).toISOString() } : {});
      return [
        {
          id: 'ticketmaster',
          name: 'Ticketmaster Discovery',
          feature: 'Conciertos',
          purpose: 'Buscar conciertos en México de los artistas más escuchados',
          auth: 'Llave de API (Consumer Key)',
          state: config.ticketmasterKey ? 'ok' : 'off',
          detail: config.ticketmasterKey ? 'Llave puesta' : 'Sin llave',
          ...iso(searchOkAt),
        },
        {
          id: 'setlistfm',
          name: 'setlist.fm',
          feature: 'Conciertos',
          purpose: 'Setlist probable de la gira, para armar su playlist',
          auth: 'Llave de API (uso no comercial)',
          state: 'idea',
          detail: config.setlistfmKey
            ? 'Llave puesta; falta programarlo'
            : 'Sin llave; falta programarlo',
        },
        {
          id: 'spotify-playlists',
          name: 'Spotify (playlists de concierto)',
          feature: 'Conciertos',
          purpose: 'Crear en la cuenta la playlist de cada concierto',
          auth: 'La sesión de Spotify de Música (OAuth PKCE), permiso playlist-modify-private',
          state: 'idea',
          detail: 'Planeado',
        },
      ];
    },

    dispose() {
      unsubscribe?.();
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
