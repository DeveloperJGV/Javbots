import type {
  AgendaCalendar,
  AgendaItem,
  AgendaPlan,
  AgendaStatus,
  ConnectionInfo,
} from '../../../core/src/messages.js';
import { notifyDesktop } from '../../../server/src/notifyDesktop.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { GOOGLE_TASKS_SCOPE } from '../../google/server/constants.js';
import { GoogleApiError, GoogleReconnectNeeded } from '../../google/server/googleAccount.js';
import type { GoogleSession } from '../../google/server/googleFeature.js';
import { makePlan, type PlanBusyInput, type PlanTaskInput } from '../plan/plan.js';
import { fold } from '../plan/planMinutes.js';
import { DEFAULT_PLAN_PREFS, readPlanPrefs } from '../plan/planPrefs.js';
import { morningText, reminderText } from '../plan/planText.js';
import { type AgendaConfig, readAgendaConfig } from './agendaConfig.js';
import {
  addDays,
  CalendarNotFound,
  createAgendaGoogle,
  localDay,
  type NewAgendaItem,
  readNewItem,
  type TaskExtra,
} from './agendaGoogle.js';
import {
  agendaPlanPath,
  machineTimeZone,
  type PlanState,
  readPlanState,
  writePlanState,
  zonedClock,
} from './agendaPlanStore.js';
import {
  AGENDA_DAYS,
  AGENDA_FLOOR_ID,
  AGENDA_FLOOR_LABEL,
  AGENDA_FLOOR_LEVEL,
  AGENDA_REFRESH_MS,
  AGENDA_TICK_MS,
  DEFAULT_EVENT_MINUTES,
  LOG_PREFIX,
  MAX_PLAN_IDS,
  PLAN_MINUTES_MAX,
  PLAN_MINUTES_MIN,
  PLAN_NOTICE_TITLE,
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
  /** agenda-plan.json (tests); ~/.pixel-agents/agenda-plan.json by default. */
  planFile?: string;
  /** IANA zone the plan's days and hours are thought in; the machine's by default. */
  timeZone?: () => string;
  /** A desktop notification (the morning summary, the reminder before a block). */
  notify?: (title: string, message: string) => void;
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
  /** The minute's work: re-read while a page is open, resend a changed plan, desktop notices (the timer calls it). */
  tick(): Promise<void>;
} {
  const now = opts.now ?? Date.now;
  const timeZone = opts.timeZone ?? machineTimeZone;
  const notify = opts.notify ?? notifyDesktop;
  const planFile = opts.planFile ?? agendaPlanPath();
  const plan: PlanState = readPlanState(planFile);
  let extras = new Map<string, TaskExtra>();
  let sentPlan = '';
  const reminded = new Set<string>();
  let ticking = false;
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

  /** Today (YYYY-MM-DD) and the time (HH:MM) in the plan's time zone. */
  const clock = () => zonedClock(now(), timeZone());

  /** The plan of today and the next days, worked out again from what was read (never stored). */
  function currentPlan(): AgendaPlan | undefined {
    if (!google.connected) return undefined;
    const tasks: PlanTaskInput[] = [];
    const busy: PlanBusyInput[] = [];
    // The garden's own reminders ("<garden list>: regar …" events) are the care tasks themselves, not busy time.
    const gardenPrefix = fold(plan.prefs.gardenList).trim();
    const isGardenReminder = (title: string): boolean => {
      const colon = title.indexOf(':');
      return !!gardenPrefix && colon > 0 && fold(title.slice(0, colon)).trim() === gardenPrefix;
    };
    for (const i of items) {
      if (i.kind === 'task') {
        const t: PlanTaskInput = { id: i.id, title: i.title };
        if (i.start) t.due = i.start;
        if (i.listName) t.listName = i.listName;
        const extra = extras.get(i.id);
        if (extra?.notes) t.notes = extra.notes;
        if (extra?.updated) t.updated = extra.updated;
        tasks.push(t);
      } else if (!i.allDay && i.start && !isGardenReminder(i.title)) {
        const start = Date.parse(i.start);
        if (Number.isNaN(start)) continue;
        const end = i.end ? Date.parse(i.end) : NaN;
        const b: PlanBusyInput = {
          start,
          end: Number.isNaN(end) ? start + DEFAULT_EVENT_MINUTES * 60_000 : end,
        };
        if (!i.busy) b.title = i.title;
        busy.push(b);
      }
    }
    try {
      return makePlan(tasks, busy, plan.prefs, now(), {
        timeZone: timeZone(),
        minutes: plan.minutes,
        skipped: plan.skipped,
        days: AGENDA_DAYS,
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Plan:`, (err as Error).message);
      return undefined;
    }
  }

  /** Saves the plan's state, dropping "not today" marks of days already gone. */
  function savePlan(): void {
    const day = clock().day;
    for (const [id, d] of Object.entries(plan.skipped)) if (d < day) delete plan.skipped[id];
    try {
      writePlanState(planFile, plan);
    } catch (err) {
      console.warn(`${LOG_PREFIX} No pude guardar ${planFile}:`, (err as Error).message);
    }
  }

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
    const p = currentPlan();
    if (p) msg.plan = p;
    return msg;
  }

  const broadcast = () => {
    const st = status();
    sentPlan = JSON.stringify(st.plan ?? null);
    const msg = st as unknown as Record<string, unknown>;
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
    let taskExtras = new Map<string, TaskExtra>();
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
        ({ items: tasks, extras: taskExtras } = await api.listTasks(localDay(until)));
        tasksOkAt = now();
        tasksError = undefined;
      } catch (err) {
        tasksError = describe(err, 'tasks');
        console.warn(`${LOG_PREFIX} Tareas:`, (err as Error).message);
      }
    }
    if (error === RECONNECT && tasksError === RECONNECT) tasksError = undefined;
    items = [...events, ...tasks];
    extras = taskExtras;
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

  const taskById = (id: string) => items.find((i) => i.kind === 'task' && i.id === id);

  function complete(id: string): Promise<void> {
    const task = taskById(id);
    if (!task) return Promise.resolve();
    return write('marcar la tarea como hecha', () => api.completeTask(id, task.list), 'tasks');
  }

  /** "Done", "not today" or "this long" for tasks of the plan (only ids of tasks read from Google count). */
  function planAction(msg: Record<string, unknown>): void {
    if (!Array.isArray(msg.ids)) return;
    const ids = [
      ...new Set(
        (msg.ids as unknown[]).filter(
          (id): id is string => typeof id === 'string' && !!taskById(id),
        ),
      ),
    ].slice(0, MAX_PLAN_IDS);
    if (!ids.length) return;
    switch (msg.action) {
      case 'done': {
        const tasks = ids.map((id) => taskById(id) as AgendaItem);
        void write(
          tasks.length === 1 ? 'marcar la tarea como hecha' : 'marcar las tareas como hechas',
          async () => {
            for (const t of tasks) {
              await api.completeTask(t.id, t.list);
              delete plan.minutes[t.id];
              delete plan.skipped[t.id];
            }
          },
          'tasks',
        ).finally(savePlan);
        return;
      }
      case 'skip': {
        const day = clock().day;
        for (const id of ids) plan.skipped[id] = day;
        break;
      }
      case 'minutes': {
        const n = msg.minutes;
        if (n === undefined || n === 0) {
          for (const id of ids) delete plan.minutes[id];
        } else if (
          typeof n === 'number' &&
          Number.isInteger(n) &&
          n >= PLAN_MINUTES_MIN &&
          n <= PLAN_MINUTES_MAX
        ) {
          for (const id of ids) plan.minutes[id] = n;
        } else return;
        break;
      }
      default:
        return;
    }
    savePlan();
    broadcast();
  }

  function setPlanPrefs(msg: Record<string, unknown>): void {
    plan.prefs =
      msg.reset === true
        ? (JSON.parse(JSON.stringify(DEFAULT_PLAN_PREFS)) as typeof DEFAULT_PLAN_PREFS)
        : readPlanPrefs(msg.prefs);
    savePlan();
    broadcast();
  }

  /** Today's part of the plan (in the plan's time zone). */
  const planToday = (day: string) => currentPlan()?.days.find((d) => d.day === day);

  /** Once a day after prefs.morningAt: "Hoy toca: ...", from a fresh read. Remembered across restarts. */
  async function morningNotice(): Promise<void> {
    const { day, time } = clock();
    if (!plan.prefs.morningNotice || !google.connected || plan.morningDay === day) return;
    if (time < plan.prefs.morningAt) return;
    if (reading) await reading;
    if (now() - readAt >= AGENDA_REFRESH_MS) await refresh();
    // Without the tasks there is no plan: tried again on the next tick. A calendar that can't be read (e.g. the
    // shared one isn't found) must not silence the summary for good.
    if (tasksError || error === RECONNECT || !google.connected) return;
    plan.morningDay = day;
    savePlan();
    const today = planToday(day);
    if (today?.blocks.length)
      notify(PLAN_NOTICE_TITLE, morningText(today, plan.prefs.blockMinutes));
  }

  /** A notice prefs.remindMinutes before each block of today (off when 0), once per block. */
  function blockReminders(): void {
    const ahead = plan.prefs.remindMinutes;
    if (!(ahead > 0)) return;
    const { day } = clock();
    const t = now();
    for (const b of planToday(day)?.blocks ?? []) {
      const at = Date.parse(b.startsAt);
      const key = `${day}|${b.id}`;
      if (Number.isNaN(at) || reminded.has(key)) continue;
      if (at - ahead * 60_000 <= t && t < at) {
        reminded.add(key);
        notify(PLAN_NOTICE_TITLE, reminderText(b.title, b.minutes, Math.ceil((at - t) / 60_000)));
      }
    }
  }

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      if (clients.size) {
        await refresh(false);
        if (JSON.stringify(status().plan ?? null) !== sentPlan) broadcast();
      }
      await morningNotice();
      blockReminders();
    } catch (err) {
      console.warn(`${LOG_PREFIX} Plan:`, (err as Error).message);
    } finally {
      ticking = false;
    }
  }

  const offGoogle = google.onChange(() => {
    calendars = [];
    sharedId = homeId = undefined;
    void refresh();
  });
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    void tick();
  }, AGENDA_TICK_MS);
  timer.unref?.();

  return {
    name: 'agenda',
    refresh: () => refresh(),
    tick,

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
        case 'agendaPlanAction':
          planAction(msg);
          return true;
        case 'setAgendaPlanPrefs':
          setPlanPrefs(msg);
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
          purpose:
            'Ver tus tareas de todas tus listas, agregar nuevas, marcarlas como hechas y armar el plan del día',
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
