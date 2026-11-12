import type {
  JardinCare,
  JardinCareKind,
  JardinPlant,
  JardinPlantInput,
  JardinStatus,
  JardinSupplyInput,
} from '../../../core/src/messages.js';
import { CARE_LABEL, CARE_ORDER } from './constants.js';

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function dayDate(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDay(day: string, n: number): string {
  const d = dayDate(day);
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
/** Whole days from `a` to `b`. */
export const daysBetween = (a: string, b: string): number =>
  Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86_400_000);

/** "Hoy", "Mañana", "Ayer" or "vie 6 nov". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Hoy';
  if (day === addDay(today, 1)) return 'Mañana';
  if (day === addDay(today, -1)) return 'Ayer';
  return dayDate(day).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** The day a care's reminder is on: its due day, or today while it's late. */
export const reminderDay = (care: Pick<JardinCare, 'due'>, today: string): string =>
  care.due > today ? care.due : today;

export interface CareLine {
  plant: JardinPlant;
  care: JardinCare;
  /** Days late (0 = due today). */
  late: number;
}

/** "Hoy en el jardín": what's due today or late, the latest first, then by plant. */
export function todayCares(status: Pick<JardinStatus, 'plants' | 'today'>): CareLine[] {
  const out: CareLine[] = [];
  for (const plant of status.plants)
    for (const care of plant.cares)
      if (care.due <= status.today)
        out.push({ plant, care, late: daysBetween(care.due, status.today) });
  return out.sort(
    (a, b) =>
      b.late - a.late ||
      a.plant.name.localeCompare(b.plant.name) ||
      CARE_ORDER.indexOf(a.care.kind) - CARE_ORDER.indexOf(b.care.kind),
  );
}

/** What comes in the next `days` days (after today), soonest first. */
export function upcomingCares(
  status: Pick<JardinStatus, 'plants' | 'today'>,
  days = 7,
): CareLine[] {
  const until = addDay(status.today, days);
  const out: CareLine[] = [];
  for (const plant of status.plants)
    for (const care of plant.cares)
      if (care.due > status.today && care.due <= until) out.push({ plant, care, late: 0 });
  return out.sort(
    (a, b) => a.care.due.localeCompare(b.care.due) || a.plant.name.localeCompare(b.plant.name),
  );
}

/** "Regar cada 7 días · 08:00". */
export const careRhythm = (care: Pick<JardinCare, 'kind' | 'everyDays' | 'time'>): string =>
  `${CARE_LABEL[care.kind]} cada ${care.everyDays} día${care.everyDays === 1 ? '' : 's'} · ${care.time}`;

/** "atrasado 2 días", "hoy". */
export const lateText = (late: number): string =>
  late <= 0 ? 'hoy' : `atrasado ${late} día${late === 1 ? '' : 's'}`;

/** Whether watering is late for this plant (it looks thirsty on the roof). */
export const isThirsty = (plant: JardinPlant, today: string): boolean =>
  plant.cares.some((c) => c.kind === 'regar' && c.due < today);

/**
 * The day a care from the form is due, exactly as the server works it out (`careStart` + `dueDay` in
 * features/jardin/server/jardinData.ts): from `last` (never after today), else its `first` (never before today,
 * unless it's the day the care already had), else what the existing care had, else today.
 */
export function draftDue(
  care: { everyDays: number; last?: string; first?: string },
  before: Pick<JardinCare, 'last' | 'due'> | undefined,
  today: string,
): string {
  if (care.last) return addDay(care.last < today ? care.last : today, care.everyDays);
  if (care.first) return care.first > today || care.first === before?.due ? care.first : today;
  if (before) return before.last ? addDay(before.last, care.everyDays) : before.due;
  return today;
}

/** "hoy", "mañana" or "15 feb 2027": the day a reminder goes on (a late one: today). */
export function avisoDay(day: string, today: string): string {
  if (day <= today) return 'hoy';
  if (day === addDay(today, 1)) return 'mañana';
  return dayDate(day)
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    .replace(/\./g, '');
}

const verb = (k: JardinCareKind) => CARE_LABEL[k].toLowerCase();

/**
 * "¿Lo agrego así?": what saving this plant puts in Google, one line per care (the event on the plants calendar
 * and the task on the garden list), so the owner sees it before anything is written.
 */
export function plantReview(
  draft: JardinPlantInput,
  status: Pick<
    JardinStatus,
    | 'today'
    | 'eventPrefix'
    | 'calendarName'
    | 'taskListName'
    | 'defaultTime'
    | 'checks'
    | 'plants'
    | 'connected'
  >,
): string[] {
  // Only a calendar known to be missing (the check says how to make it) means no event; without Google, or before
  // the first sync, the review says what will be made.
  const calendar = status.checks.find((c) => c.id === 'calendar');
  const calendarMissing = status.connected && calendar?.state === 'off' && !!calendar.help;
  const old = draft.id ? status.plants.find((p) => p.id === draft.id) : undefined;
  const lines: string[] = [];
  for (const care of draft.cares) {
    const before = old?.cares.find((c) => c.kind === care.kind);
    const due = draftDue(care, before, status.today);
    const day = dayLabel(due > status.today ? due : status.today, status.today).toLowerCase();
    const time = care.time ?? status.defaultTime;
    lines.push(
      `${before ? 'Próximo' : 'Primer'} aviso de ${verb(care.kind)}: ${avisoDay(due, status.today)}`,
    );
    lines.push(
      !calendarMissing
        ? `Calendario "${status.calendarName}": "${status.eventPrefix} ${verb(care.kind)} ${draft.name}" · ${day}, ${time}, con aviso`
        : `Calendario "${status.calendarName}": no existe todavía, así que sin evento`,
    );
    lines.push(
      `Tareas "${status.taskListName}": "${CARE_LABEL[care.kind]} ${draft.name}" · para ${day}`,
    );
  }
  if (!status.connected) lines.push('Sin conectar Google: se agrega cuando lo conectes');
  if (old)
    for (const c of old.cares)
      if (!draft.cares.some((d) => d.kind === c.kind))
        lines.push(`Se quitan el evento y la tarea de ${verb(c.kind)} ${old.name}`);
  return lines;
}

/** What saving this supply puts in Google: a "Comprar …" task when it's under its minimum (once). */
export function supplyReview(
  draft: JardinSupplyInput,
  status: Pick<JardinStatus, 'supplies' | 'taskListName'>,
): string[] {
  const old = draft.id ? status.supplies.find((s) => s.id === draft.id) : undefined;
  if (draft.quantity < draft.min && !old?.buying)
    return [`Tareas "${status.taskListName}": "Comprar ${draft.name}" (está debajo del mínimo)`];
  if (draft.quantity >= draft.min && old?.buying)
    return [`Se palomea "Comprar ${old.name}" en tus tareas (ya alcanza)`];
  return [];
}

/** The panel's photo URL (the office token comes from webview-ui/src/officeToken.ts). */
export const photoUrl = (name: string, token: string | null): string =>
  `/api/jardin/fotos/${encodeURIComponent(name)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
