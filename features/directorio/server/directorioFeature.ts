import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { SearchRoomStatus } from '../../../core/src/messages.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import { readHomeCalendarName } from '../../agenda/server/agendaConfig.js';
import {
  CalendarNotFound,
  createAgendaGoogle,
  eventBody,
  readNewItem,
} from '../../agenda/server/agendaGoogle.js';
import { CALENDAR_API } from '../../agenda/server/constants.js';
import { createCriteriaStore } from '../../busquedas/server/criteria.js';
import type { AgentLauncher } from '../../busquedas/server/herdrLauncher.js';
import { createSearchRoom } from '../../busquedas/server/searchRoom.js';
import { GoogleReconnectNeeded } from '../../google/server/googleAccount.js';
import type { GoogleSession } from '../../google/server/googleFeature.js';
import { directorioBrief } from './brief.js';
import {
  DEFAULT_CRITERIA,
  DIRECTORIO_CONFIG_FILE,
  DIRECTORIO_DIR,
  DIRECTORIO_KINDS,
  DIRECTORIO_ROOM,
  DIRECTORIO_TAB_LABEL,
  LOG_PREFIX,
  MAX_EVENT_TITLE,
  SERVICE_EVENT_PREFIX,
} from './constants.js';

export interface DirectorioFeatureOptions {
  /** The shared Google session (features/google), for "Agendar". */
  google: GoogleSession;
  /** Opens the search agent (herdr in the browser office). Without it the panel only copies the brief. */
  launcher?: AgentLauncher;
  /** The room's skill (features/directorio/skill/SKILL.md, copied to dist/directorio/skill/). */
  skillFile: string;
  /** ~/.pixel-agents by default. */
  home?: string;
  /** Name of the calendar for services (default: the owner's own one, agenda.json `casa`). */
  calendarName?: () => string;
  now?: () => number;
  pollMs?: number;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Title for the calendar, always with the service prefix. */
export function serviceTitle(title: string): string {
  const t = title.trim();
  const full = t.toLowerCase().startsWith(SERVICE_EVENT_PREFIX.toLowerCase())
    ? t
    : `${SERVICE_EVENT_PREFIX} ${t}`;
  return full.slice(0, MAX_EVENT_TITLE);
}

/**
 * The Directorio (features/directorio), a room of the personal floor: the owner writes what he needs ("reparar el
 * refrigerador, Puebla, esta semana"), a Claude Code agent searches the web with the room's criteria (official
 * service first, established businesses, no faceless ones) and leaves its results in a file, the panel shows them
 * sorted, and "Agendar" puts a confirmed visit on the shared calendar (as the agenda does). Privileged pages only.
 */
export function createDirectorioFeature(opts: DirectorioFeatureOptions): ServerFeature & {
  room: ReturnType<typeof createSearchRoom>;
} {
  const home = opts.home ?? path.join(os.homedir(), '.pixel-agents');
  const google = opts.google;
  const calendarName = opts.calendarName ?? (() => readHomeCalendarName());
  const clients = new Set<FeatureClient>();
  let saving = false;
  let error: string | undefined;

  const readSkill = (): string => {
    try {
      return fs.readFileSync(opts.skillFile, 'utf8');
    } catch {
      return '(No encontré la skill del Directorio: usa los criterios de arriba.)';
    }
  };

  const room = createSearchRoom({
    room: DIRECTORIO_ROOM,
    label: DIRECTORIO_TAB_LABEL,
    dir: path.join(home, DIRECTORIO_DIR),
    criteria: createCriteriaStore(path.join(home, DIRECTORIO_CONFIG_FILE), DEFAULT_CRITERIA),
    kinds: DIRECTORIO_KINDS,
    brief: (req, set, paths) => directorioBrief(req, set, paths, readSkill()),
    launcher: opts.launcher,
    now: opts.now,
    pollMs: opts.pollMs,
  });

  function status(): SearchRoomStatus {
    const msg: SearchRoomStatus = { type: 'searchRoomStatus', ...room.statusParts(), saving };
    if (google.connected) msg.calendar = calendarName();
    if (error) msg.error = error;
    return msg;
  }
  const broadcast = () => {
    const msg = status() as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  };
  const offRoom = room.onChange(broadcast);
  const offGoogle = google.onChange(broadcast);

  /** "Agendar": the event the owner confirmed in the panel, on the shared calendar; never anything else. */
  async function schedule(msg: Record<string, unknown>): Promise<void> {
    const req = room.find(msg.requestId);
    const result = req?.results.find((r) => r.id === msg.resultId);
    const title = typeof msg.title === 'string' ? serviceTitle(msg.title) : '';
    const date = typeof msg.date === 'string' && DAY_RE.test(msg.date) ? msg.date : '';
    const time = typeof msg.time === 'string' && TIME_RE.test(msg.time) ? msg.time : undefined;
    const item = readNewItem({ kind: 'event', title, date, time });
    if (!req || !result || !item || saving || !google.connected) return;
    saving = true;
    error = undefined;
    broadcast();
    try {
      const api = createAgendaGoogle((url, init) => google.api(url, init));
      const calendarId = await api.findCalendar(calendarName());
      const details = [
        result.phone && `Teléfono: ${result.phone}`,
        result.link && `Liga: ${result.link}`,
        result.why && `Por qué: ${result.why}`,
        `Pedido: ${req.text}`,
      ].filter(Boolean);
      await google.api(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: {
          ...eventBody(item),
          ...(result.address ? { location: result.address } : {}),
          description: details.join('\n'),
        },
      });
      room.markScheduled(req.id, result.id);
    } catch (err) {
      error =
        err instanceof GoogleReconnectNeeded
          ? 'La conexión con Google caducó: vuelve a conectar.'
          : err instanceof CalendarNotFound
            ? `No encontré el calendario "${calendarName()}" en tu cuenta.`
            : 'No pude agregar la cita al calendario.';
      console.warn(`${LOG_PREFIX} Agendar:`, (err as Error).message);
    } finally {
      saving = false;
      broadcast();
    }
  }

  return {
    name: DIRECTORIO_ROOM,
    room,

    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },

    handleClientMessage(msg, client) {
      if (!client.privileged) return false;
      if (msg.type === 'webviewReady') {
        client.send(status() as unknown as Record<string, unknown>);
        void room.refreshLauncher();
        return false; // the core handler still runs
      }
      if (msg.room !== DIRECTORIO_ROOM) return false;
      if (msg.type === 'scheduleSearchResult') {
        void schedule(msg);
        return true;
      }
      if (msg.type === 'launchSearchAgent') void room.refreshLauncher();
      return room.handleMessage(msg);
    },

    dispose() {
      offRoom();
      offGoogle();
      room.dispose();
    },
  };
}
