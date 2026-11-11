import type {
  AgendaCalendar,
  AgendaItem,
  AgendaStatus,
  ConnectionInfo,
} from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { GOOGLE_TASKS_SCOPE } from '../../google/server/constants.js';
import { GoogleApiError, GoogleReconnectNeeded } from '../../google/server/googleAccount.js';
import type { GoogleSession } from '../../google/server/googleFeature.js';
import { type AgendaConfig, readAgendaConfig } from './agendaConfig.js';
import {
  addDays,
  CalendarNotFound,
  createAgendaGoogle,
  localDay,
  type NewAgendaItem,
  readNewItem,
} from './agendaGoogle.js';
import {
  AGENDA_DAYS,
  AGENDA_FLOOR_ID,
  AGENDA_FLOOR_LABEL,
  AGENDA_FLOOR_LEVEL,
  AGENDA_REFRESH_MS,
  AGENDA_TICK_MS,
  LOG_PREFIX,
} from './constants.js';

export interface AgendaFeatureOptions {
  /** The shared Google session (features/google). */
  google: GoogleSession;
  /** agenda.json (shared and own calendars, display names); read again on every refresh. */
  config?: () => AgendaConfig;
  /** Name of the shared calendar, overriding the config's (tests). */
  calendarName?: () => string;
  now?: () => number;
  /** The agenda room's layout, shown as its own floor of the main office (null: an empty room). */
  floorLayout?: () => Record<string, unknown> | null;
}

const RECONNECT = 'La conexión con Google caducó: vuelve a conectar.';
const TASKS_SCOPE_MISSING =
  'Para ver tus tareas, vuelve a conectar Google y acepta el permiso de Tasks.';
const TASKS_FORBIDDEN =
  'Google no dejó usar tus tareas: activa la Google Tasks API en tu proyecto de Google Cloud y vuelve a conectar.';

/** Titles that belong on the shared calendar when the panel names none: things for both people. */
const SHARED_PREFIXES = /^\s*(concierto|salida)\s*:/i;

/**
 * The agenda room (features/agenda): today and the next days from every Google calendar the owner sees (each with
 * its color; free/busy-only ones such as work as busy blocks) and from the owner's Google Tasks. The shared calendar
 * is only for things for both people ("Salida: …", "Concierto: …"); the rest goes to the owner's own calendar
 * (agenda.json `casa`). Adds what the owner wrote and confirmed in the panel, and marks tasks done. Never creates,
 * shares or deletes calendars or events. Privileged pages only.
 */
export function createAgendaFeature(opts: AgendaFeatureOptions): ServerFeature & {
  refresh(): Promise<void>;
} {
  const now = opts.now ?? Date.now;
  const config = (): AgendaConfig => {
    const c = (opts.config ?? (() => readAgendaConfig()))();
    return opts.calendarName ? { ...c, shared: opts.calendarName() } : c;
  };
  const calendarName = () => config().shared;
  const google = opts.google;
  const api = createAgendaGoogle((url, init) => google.api(url, init));
  const clients = new Set<FeatureClient>();
  let items: AgendaItem[] = [];
  let calendars: AgendaCalendar[] = [];
  let sharedId: string | undefined;
  let homeId: string | undefined;
  let saving = false;
  let error: string | undefined;
  let tasksError: string | undefined;
  let readAt = -Infinity;
  let tasksOkAt: number | undefined;
  let reading: Promise<void> | null = null;

  const today = () => {
    const d = new Date(now());
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  function status(): AgendaStatus {
    const msg: AgendaStatus = {
      type: 'agendaStatus',
      connected: google.connected,
      from: localDay(today()),
      days: AGENDA_DAYS,
      items,
      saving,
      calendars,
    };
    if (sharedId) msg.sharedCalendar = sharedId;
    if (homeId) msg.homeCalendar = homeId;
    const shown = [error, tasksError].filter(Boolean).join(' ');
    if (shown) msg.error = shown;
    return msg;
  }

  const broadcast = () => {
    const msg = status() as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  };

  const byName = (name: string) =>
    calendars.find((c) => c.writable && c.name.toLowerCase() === name.toLowerCase())?.id;

  /** Where a new event goes: the calendar the panel picked if it's writable, else by its title. */
  function targetCalendar(item: NewAgendaItem): string {
    const picked = calendars.find((c) => c.id === item.calendar && c.writable);
    if (picked) return picked.id;
    const shared = SHARED_PREFIXES.test(item.title);
    const id = shared ? sharedId : homeId;
    if (!id) throw new CalendarNotFound(shared ? calendarName() : config().home);
    return id;
  }

  const describe = (err: unknown, what: 'calendar' | 'tasks'): string => {
    if (err instanceof GoogleReconnectNeeded) return RECONNECT;
    if (err instanceof CalendarNotFound)
      return `No encontré el calendario "${err.message || calendarName()}" en tu cuenta.`;
    if (what === 'tasks' && err instanceof GoogleApiError && err.status === 403)
      return TASKS_FORBIDDEN;
    return what === 'tasks' ? 'No pude leer tus tareas.' : 'No pude leer el calendario.';
  };

  async function read(): Promise<void> {
    if (!google.connected) {
      items = [];
      error = undefined;
      tasksError = undefined;
      return;
    }
    const from = today();
    const until = addDays(from, AGENDA_DAYS);
    const cfg = config();
    let events: AgendaItem[] = [];
    let tasks: AgendaItem[] = [];
    try {
      calendars = await api.listCalendars(cfg.names);
      sharedId = byName(cfg.shared);
      homeId = byName(cfg.home);
      const readable = calendars.filter((c) => !c.busyOnly);
      const busyOnly = calendars.filter((c) => c.busyOnly).map((c) => c.id);
      const failed: string[] = [];
      const lists = await Promise.all([
        ...readable.map((c) =>
          api.listEvents(c.id, from, until).catch((err: unknown) => {
            if (err instanceof GoogleReconnectNeeded) throw err;
            failed.push(c.name);
            console.warn(`${LOG_PREFIX} Calendario ${c.name}:`, (err as Error).message);
            return [] as AgendaItem[];
          }),
        ),
        api.freeBusy(busyOnly, from, until).catch((err: unknown) => {
          if (err instanceof GoogleReconnectNeeded) throw err;
          console.warn(`${LOG_PREFIX} Libre/ocupado:`, (err as Error).message);
          return [] as AgendaItem[];
        }),
      ]);
      events = lists.flat();
      error = !sharedId
        ? describe(new CalendarNotFound(cfg.shared), 'calendar')
        : failed.length
          ? `No pude leer: ${failed.join(', ')}.`
          : undefined;
    } catch (err) {
      error = describe(err, 'calendar');
      console.warn(`${LOG_PREFIX} Calendario:`, (err as Error).message);
    }
    if (!google.hasScope(GOOGLE_TASKS_SCOPE)) {
      tasksError = TASKS_SCOPE_MISSING;
    } else {
      try {
        tasks = await api.listTasks(localDay(until));
        tasksOkAt = now();
        tasksError = undefined;
      } catch (err) {
        tasksError = describe(err, 'tasks');
        console.warn(`${LOG_PREFIX} Tareas:`, (err as Error).message);
      }
    }
    if (error === RECONNECT && tasksError === RECONNECT) tasksError = undefined;
    items = [...events, ...tasks];
  }

  function refresh(force = true): Promise<void> {
    if (!force && now() - readAt < AGENDA_REFRESH_MS) return Promise.resolve();
    readAt = now();
    reading ??= read()
      .then(broadcast)
      .finally(() => (reading = null));
    return reading;
  }

  /** Writes to Google one at a time; the panel shows "saving" meanwhile and gets the new list after. */
  async function write(what: string, action: () => Promise<void>, kind: 'calendar' | 'tasks') {
    if (!google.connected || saving) return;
    saving = true;
    broadcast();
    try {
      await action();
    } catch (err) {
      const why = describe(err, kind);
      error =
        why === RECONNECT || why === TASKS_FORBIDDEN || err instanceof CalendarNotFound
          ? why
          : `No pude ${what}.`;
      console.warn(`${LOG_PREFIX} ${what}:`, (err as Error).message);
    } finally {
      saving = false;
    }
    readAt = -Infinity;
    const keep = error;
    await refresh();
    // A failed write must stay visible even if the re-read went fine.
    if (keep && !error) {
      error = keep;
      broadcast();
    }
  }

  function add(item: NewAgendaItem): Promise<void> {
    if (item.kind === 'task') return write('agregar la tarea', () => api.addTask(item), 'tasks');
    return write(
      'agregar el evento al calendario',
      async () => api.addEvent(targetCalendar(item), item),
      'calendar',
    );
  }

  function complete(id: string): Promise<void> {
    if (!items.some((i) => i.kind === 'task' && i.id === id)) return Promise.resolve();
    return write('marcar la tarea como hecha', () => api.completeTask(id), 'tasks');
  }

  const offGoogle = google.onChange(() => {
    calendars = [];
    sharedId = homeId = undefined;
    void refresh();
  });
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (clients.size) void refresh(false);
  }, AGENDA_TICK_MS);
  timer.unref?.();

  return {
    name: 'agenda',
    refresh: () => refresh(),

    floors() {
      return [
        {
          id: AGENDA_FLOOR_ID,
          level: AGENDA_FLOOR_LEVEL,
          label: AGENDA_FLOOR_LABEL,
          defaultLayout: opts.floorLayout?.() ?? null,
        },
      ];
    },

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
        case 'refreshAgenda':
          void refresh();
          return true;
        case 'addAgendaItem': {
          const item = readNewItem(msg);
          if (item) void add(item);
          return true;
        }
        case 'completeAgendaTask':
          if (typeof msg.id === 'string') void complete(msg.id);
          return true;
        default:
          return false;
      }
    },

    /** For the connections board (features/conexiones). The Google light itself is features/google's. */
    connections(): ConnectionInfo[] {
      const scoped = google.connected && google.hasScope(GOOGLE_TASKS_SCOPE);
      let detail = 'Funcionando';
      if (!google.configured) detail = 'Faltan las llaves de Google';
      else if (!google.connected) detail = 'Sin conectar Google';
      else if (!scoped) detail = 'Falta aceptar el permiso de Tasks';
      else if (tasksError) detail = tasksError;
      return [
        {
          id: 'google-tasks',
          name: 'Google Tasks',
          feature: 'Agenda',
          purpose: 'Ver tus tareas, agregar nuevas y marcarlas como hechas',
          auth: 'La sesión de Google (features/google), permiso tasks',
          state: !google.connected ? 'off' : !scoped || tasksError ? 'warn' : 'ok',
          detail,
          ...(tasksOkAt ? { lastUsedAt: new Date(tasksOkAt).toISOString() } : {}),
        },
      ];
    },

    dispose() {
      offGoogle();
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
