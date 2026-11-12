import type { GoogleApi, GoogleDownload } from '../../google/server/googleAccount.js';
import { GoogleApiError } from '../../google/server/googleAccount.js';
import {
  CALENDAR_API,
  DRIVE_API,
  JARDIN_TIME_ZONE,
  MAX_DRIVE_LIST_PAGES,
  OWNER_MARK_KEY,
  REMINDER_EVENT_MINUTES,
  REMINDER_POPUP_MINUTES,
  taskMark,
  TASKS_API,
} from './constants.js';
import { addDays } from './jardinData.js';

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Raw) : {};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const items = (raw: unknown, key = 'items'): Raw[] =>
  Array.isArray(obj(raw)[key]) ? (obj(raw)[key] as unknown[]).map(obj) : [];
const enc = encodeURIComponent;

/** No calendar by that name among the owner's: the owner creates it (the office never creates calendars). */
export class CalendarNotFound extends Error {}

/** Gone from Google (deleted by hand): the office makes a new one instead of failing. */
export const isGone = (err: unknown): boolean =>
  err instanceof GoogleApiError && (err.status === 404 || err.status === 410);

/** A reminder, as the office writes it. */
export interface Reminder {
  /** OWNER_MARK_KEY's value: "<plant id>:<care>". */
  key: string;
  title: string;
  day: string;
  time: string;
}

export interface GardenTask {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  /** YYYY-MM-DD (local) it was checked. */
  completedDay?: string;
  due?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  size?: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
function localDateTime(day: string, time: string, plusMinutes = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm + plusMinutes);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
}

/** The event body of a reminder: at its time, short, with a popup and the office's mark. */
export function reminderEventBody(r: Reminder): Raw {
  return {
    summary: r.title,
    description:
      'Recordatorio del jardín de la oficina. Palomea la tarea en Google Tasks (lista del jardín) o marca Hecho en el panel: la oficina quita este evento y agenda el siguiente.',
    start: { dateTime: localDateTime(r.day, r.time), timeZone: JARDIN_TIME_ZONE },
    end: {
      dateTime: localDateTime(r.day, r.time, REMINDER_EVENT_MINUTES),
      timeZone: JARDIN_TIME_ZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: REMINDER_POPUP_MINUTES }],
    },
    extendedProperties: { private: { [OWNER_MARK_KEY]: r.key } },
  };
}

/** Tasks keep only the day; midnight UTC is how Google writes it. */
export const taskDue = (day: string): string => `${day}T00:00:00.000Z`;

export function taskBody(key: string, title: string, day?: string): Raw {
  return {
    title,
    notes: `Lo puso la oficina (jardín). ${taskMark(key)}`,
    ...(day ? { due: taskDue(day) } : {}),
  };
}

const localDayOf = (iso: string): string | undefined => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return undefined;
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Calendar, Tasks and Drive (read only) through the shared Google session (features/google). */
export function createJardinGoogle(api: GoogleApi, download: GoogleDownload) {
  return {
    /** An existing calendar the owner can write to, by name (any case). Never creates one. */
    async findCalendar(name: string): Promise<string> {
      const list = await api(
        `${CALENDAR_API}/users/me/calendarList?minAccessRole=writer&maxResults=250`,
      );
      const found = items(list).find((c) => str(c.summary).toLowerCase() === name.toLowerCase());
      if (!found) throw new CalendarNotFound(name);
      return str(found.id);
    },

    /** The office's own event for this key (from a sync whose ids were lost), or null. */
    async findReminder(calendarId: string, key: string, fromDay: string): Promise<string | null> {
      const q = new URLSearchParams({
        privateExtendedProperty: `${OWNER_MARK_KEY}=${key}`,
        timeMin: new Date(`${addDays(fromDay, -400)}T00:00:00`).toISOString(),
        singleEvents: 'true',
        maxResults: '10',
      });
      const found = items(
        await api(`${CALENDAR_API}/calendars/${enc(calendarId)}/events?${q.toString()}`),
      ).find(
        (e) =>
          e.status !== 'cancelled' &&
          obj(obj(e.extendedProperties).private)[OWNER_MARK_KEY] === key,
      );
      return found ? str(found.id) : null;
    },

    async createReminder(calendarId: string, r: Reminder): Promise<string> {
      const out = await api(`${CALENDAR_API}/calendars/${enc(calendarId)}/events`, {
        method: 'POST',
        body: reminderEventBody(r),
      });
      return str(out.id);
    },

    async moveReminder(calendarId: string, eventId: string, r: Reminder): Promise<void> {
      await api(`${CALENDAR_API}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
        method: 'PATCH',
        body: reminderEventBody(r),
      });
    },

    /** Only ever called with an id the office made (or found by its mark). */
    async deleteReminder(calendarId: string, eventId: string): Promise<void> {
      try {
        await api(`${CALENDAR_API}/calendars/${enc(calendarId)}/events/${enc(eventId)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        if (!isGone(err)) throw err;
      }
    },

    /** The garden list's id: the one by that name, or a new one (a task list is not a calendar). */
    async ensureTaskList(
      name: string,
      knownId?: string,
    ): Promise<{ id: string; created: boolean }> {
      const lists = items(await api(`${TASKS_API}/users/@me/lists?maxResults=100`));
      const byId = knownId ? lists.find((l) => str(l.id) === knownId) : undefined;
      const found = byId ?? lists.find((l) => str(l.title).toLowerCase() === name.toLowerCase());
      if (found) return { id: str(found.id), created: false };
      const made = await api(`${TASKS_API}/users/@me/lists`, {
        method: 'POST',
        body: { title: name },
      });
      return { id: str(made.id), created: true };
    },

    /** Every task of the garden list, checked ones included (a checked task means "done"). */
    async listTasks(listId: string): Promise<Map<string, GardenTask>> {
      const out = new Map<string, GardenTask>();
      let page = '';
      for (let i = 0; i < 10; i++) {
        const q = new URLSearchParams({
          showCompleted: 'true',
          showHidden: 'true',
          maxResults: '100',
          ...(page ? { pageToken: page } : {}),
        });
        const raw = await api(`${TASKS_API}/lists/${enc(listId)}/tasks?${q.toString()}`);
        for (const t of items(raw)) {
          if (!str(t.id) || t.deleted === true) continue;
          const task: GardenTask = {
            id: str(t.id),
            title: str(t.title),
            notes: str(t.notes),
            completed: t.status === 'completed',
          };
          if (str(t.completed)) task.completedDay = localDayOf(str(t.completed));
          if (str(t.due)) task.due = str(t.due).slice(0, 10);
          out.set(task.id, task);
        }
        page = str(obj(raw).nextPageToken);
        if (!page) break;
      }
      return out;
    },

    async createTask(listId: string, key: string, title: string, day?: string): Promise<string> {
      const out = await api(`${TASKS_API}/lists/${enc(listId)}/tasks`, {
        method: 'POST',
        body: taskBody(key, title, day),
      });
      return str(out.id);
    },

    async updateTask(listId: string, taskId: string, key: string, title: string, day?: string) {
      await api(`${TASKS_API}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
        method: 'PATCH',
        body: taskBody(key, title, day),
      });
    },

    async completeTask(listId: string, taskId: string): Promise<void> {
      try {
        await api(`${TASKS_API}/lists/${enc(listId)}/tasks/${enc(taskId)}`, {
          method: 'PATCH',
          body: { status: 'completed' },
        });
      } catch (err) {
        if (!isGone(err)) throw err;
      }
    },

    /** Only ever called with an id the office made. */
    async deleteTask(listId: string, taskId: string): Promise<void> {
      try {
        await api(`${TASKS_API}/lists/${enc(listId)}/tasks/${enc(taskId)}`, { method: 'DELETE' });
      } catch (err) {
        if (!isGone(err)) throw err;
      }
    },

    /** The Drive folder by that name (not in the trash), or null. Read only. */
    async findFolder(name: string, knownId?: string): Promise<string | null> {
      const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/['\\]/g, '\\$&')}' and trashed=false`;
      const files = items(
        await api(
          `${DRIVE_API}/files?${new URLSearchParams({ q, fields: 'files(id,name)', pageSize: '10' }).toString()}`,
        ),
        'files',
      );
      const found = files.find((f) => str(f.id) === knownId) ?? files[0];
      return found ? str(found.id) : null;
    },

    /** The files in the folder, oldest first, every page (the newest ones live on the last page). */
    async listFolder(folderId: string): Promise<DriveFile[]> {
      const q = `'${folderId.replace(/['\\]/g, '\\$&')}' in parents and trashed=false`;
      const out: DriveFile[] = [];
      let page = '';
      for (let i = 0; i < MAX_DRIVE_LIST_PAGES; i++) {
        const params = new URLSearchParams({
          q,
          fields: 'nextPageToken,files(id,name,mimeType,createdTime,size)',
          orderBy: 'createdTime',
          pageSize: '200',
          ...(page ? { pageToken: page } : {}),
        });
        const raw = await api(`${DRIVE_API}/files?${params.toString()}`);
        for (const f of items(raw, 'files')) {
          if (!str(f.id) || !str(f.name)) continue;
          out.push({
            id: str(f.id),
            name: str(f.name),
            mimeType: str(f.mimeType),
            ...(str(f.createdTime) ? { createdTime: str(f.createdTime) } : {}),
            ...(f.size !== undefined && Number.isFinite(Number(f.size))
              ? { size: Number(f.size) }
              : {}),
          });
        }
        page = str(obj(raw).nextPageToken);
        if (!page) break;
      }
      return out;
    },

    /** A file's content (a Google Doc as plain text). */
    async fileContent(file: DriveFile): Promise<Buffer> {
      if (file.mimeType === 'application/vnd.google-apps.document')
        return download(`${DRIVE_API}/files/${enc(file.id)}/export?mimeType=text/plain`);
      return download(`${DRIVE_API}/files/${enc(file.id)}?alt=media`);
    },
  };
}

export type JardinGoogle = ReturnType<typeof createJardinGoogle>;
export { localDayOf };
