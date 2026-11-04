import type { JardinCareKind } from '../../../core/src/messages.js';
import { MAX_RECENT, taskMark } from './constants.js';
import {
  dueDay,
  type JardinData,
  type JardinSettings,
  maxDay,
  reminderDay,
  type StoredCare,
  type StoredPlant,
} from './jardinData.js';
import { type GardenTask, isGone, type JardinGoogle } from './jardinGoogle.js';

/**
 * Keeps Google in step with the garden: one event (plants calendar) and one task (garden list) per care, on the day
 * it's due, or today while it's late (so a care not done rolls to the next day until it's done). A checked task marks
 * the care done; the next one is worked out from that real day. Ids are kept so nothing is made twice, and the office
 * only ever moves or deletes what it made (its ids, or its mark).
 */

export const careKey = (plant: StoredPlant, kind: JardinCareKind): string => `${plant.id}:${kind}`;
export const buyKey = (supplyId: string): string => `compra:${supplyId}`;

const VERB: Record<JardinCareKind, string> = {
  regar: 'regar',
  abonar: 'abonar',
  limpiar: 'limpiar',
  podar: 'podar',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Jardín: regar monstera" (the calendar's rule: the type word first, with its colon). */
export const eventTitle = (s: JardinSettings, plant: StoredPlant, kind: JardinCareKind): string =>
  `${s.prefix} ${VERB[kind]} ${plant.name}`;
/** "Regar monstera" (it's already in the garden list). */
export const taskTitle = (plant: StoredPlant, kind: JardinCareKind): string =>
  `${cap(VERB[kind])} ${plant.name}`;
export const buyTitle = (name: string): string => `Comprar ${name}`;

/** What one sync can reach: each part is null when it's not available right now. */
export interface SyncContext {
  google: JardinGoogle;
  today: string;
  calendarId: string | null;
  listId: string | null;
  /** Every task of the garden list, read once per sync. */
  tasks: Map<string, GardenTask> | null;
  note(text: string): void;
}

export function pushRecent(data: JardinData, at: string, text: string): void {
  data.recent.unshift({ at, text });
  if (data.recent.length > MAX_RECENT) data.recent.length = MAX_RECENT;
}

/** The care was really done that day: the next one counts from it (a later day than what's stored wins). */
export function setDone(care: StoredCare, day: string): void {
  care.last = care.last ? maxDay(care.last, day) : day;
}

/**
 * Marks a care done (the panel's "Hecho", a note from the phone): checks the office's task, removes its event, and
 * forgets both, so the next sync makes the next event and task.
 */
export async function markDone(
  ctx: Pick<SyncContext, 'google' | 'calendarId' | 'listId'>,
  care: StoredCare,
  day: string,
): Promise<void> {
  setDone(care, day);
  const s = care.sync;
  if (!s) return;
  if (s.taskId && ctx.listId) {
    await ctx.google.completeTask(ctx.listId, s.taskId);
    delete s.taskId;
    delete s.taskSig;
  }
  if (s.eventId && ctx.calendarId) {
    await ctx.google.deleteReminder(ctx.calendarId, s.eventId);
    delete s.eventId;
    delete s.eventSig;
  }
}

/** Removes what the office made for a care (the plant was deleted, or the care taken out of it). */
export async function forgetCare(
  ctx: Pick<SyncContext, 'google' | 'calendarId' | 'listId'>,
  care: StoredCare,
): Promise<void> {
  const s = care.sync;
  if (!s) return;
  if (s.eventId && ctx.calendarId) await ctx.google.deleteReminder(ctx.calendarId, s.eventId);
  if (s.taskId && ctx.listId) await ctx.google.deleteTask(ctx.listId, s.taskId);
}

async function syncCare(
  ctx: SyncContext,
  data: JardinData,
  plant: StoredPlant,
  care: StoredCare,
): Promise<void> {
  const key = careKey(plant, care.kind);
  const s = (care.sync ??= {});
  const g = ctx.google;

  // Checked on the phone: done that day.
  if (ctx.tasks && s.taskId) {
    const t = ctx.tasks.get(s.taskId);
    if (!t) {
      // Deleted by hand: a new one is made below.
      delete s.taskId;
      delete s.taskSig;
    } else if (t.completed) {
      const day = t.completedDay && t.completedDay < ctx.today ? t.completedDay : ctx.today;
      setDone(care, day);
      ctx.note(`Palomeaste en Tasks: ${taskTitle(plant, care.kind)}`);
      delete s.taskId;
      delete s.taskSig;
      if (s.eventId && ctx.calendarId) {
        await g.deleteReminder(ctx.calendarId, s.eventId);
        delete s.eventId;
        delete s.eventSig;
      }
    }
  }
  // Ids lost (a failed write): find the office's own pending task by its mark.
  if (ctx.tasks && !s.taskId) {
    const mark = taskMark(key);
    const found = [...ctx.tasks.values()].find((t) => !t.completed && t.notes.includes(mark));
    if (found) s.taskId = found.id;
  }

  const day = reminderDay(dueDay(care, plant.since), ctx.today);

  if (ctx.calendarId) {
    const reminder = {
      key,
      title: eventTitle(data.settings, plant, care.kind),
      day,
      time: care.time,
    };
    const sig = `${day}|${care.time}|${reminder.title}`;
    if (s.eventId && s.eventSig !== sig) {
      try {
        await g.moveReminder(ctx.calendarId, s.eventId, reminder);
      } catch (err) {
        if (!isGone(err)) throw err;
        delete s.eventId;
      }
    }
    if (!s.eventId) {
      const found = await g.findReminder(ctx.calendarId, key, ctx.today);
      if (found) {
        await g.moveReminder(ctx.calendarId, found, reminder);
        s.eventId = found;
      } else {
        s.eventId = await g.createReminder(ctx.calendarId, reminder);
      }
    }
    s.eventSig = sig;
  }

  if (ctx.listId && ctx.tasks) {
    const title = taskTitle(plant, care.kind);
    const sig = `${day}|${title}`;
    if (s.taskId && s.taskSig !== sig) {
      try {
        await g.updateTask(ctx.listId, s.taskId, key, title, day);
      } catch (err) {
        if (!isGone(err)) throw err;
        delete s.taskId;
      }
    }
    if (!s.taskId) s.taskId = await g.createTask(ctx.listId, key, title, day);
    s.taskSig = sig;
  }
}

/** "Comprar tierra" once when a supply drops under its minimum; checked off by the office when it's back over. */
async function syncSupplies(ctx: SyncContext, data: JardinData): Promise<void> {
  if (!ctx.listId || !ctx.tasks) return;
  for (const supply of data.supplies) {
    const low = supply.quantity < supply.min;
    const key = buyKey(supply.id);
    if (low && !supply.buyTaskId) {
      const mark = taskMark(key);
      const found = [...ctx.tasks.values()].find((t) => !t.completed && t.notes.includes(mark));
      supply.buyTaskId =
        found?.id ?? (await ctx.google.createTask(ctx.listId, key, buyTitle(supply.name)));
      if (!found) ctx.note(`Falta ${supply.name}: agregué "${buyTitle(supply.name)}" a tus tareas`);
    } else if (!low && supply.buyTaskId) {
      const t = ctx.tasks.get(supply.buyTaskId);
      if (t && !t.completed) await ctx.google.completeTask(ctx.listId, supply.buyTaskId);
      delete supply.buyTaskId;
    }
  }
}

/** One pass over every plant and supply. Throws on the first Google error (the next sync picks up from there). */
export async function syncGarden(ctx: SyncContext, data: JardinData): Promise<void> {
  for (const plant of data.plants)
    for (const care of plant.cares) await syncCare(ctx, data, plant, care);
  await syncSupplies(ctx, data);
}
