// The day-plan engine: places pending tasks in the free time of today and the next days.
// Pure: no clock, no machine zone (every day and hour is read in `extra.timeZone`), no I/O.
import type {
  AgendaPlan,
  AgendaPlanBlock,
  AgendaPlanDay,
  AgendaPlanLeftover,
  AgendaPlanMinutesSource,
  AgendaPlanPrefs,
  AgendaPlanRange,
  AgendaPlanTask,
} from '../../../core/src/messages.js';
import {
  MINUTES_PER_DAY,
  MS_PER_MINUTE,
  PLAN_DEFAULT_DAYS,
  PLAN_LEAD_MINUTES,
  PLAN_MAX_DAYS,
  PLAN_MINUTES_STEP,
  PLAN_NEAR_EVENT_MINUTES,
  PLAN_QUICK_TITLE,
  PLAN_ROUND_SLACK_MINUTES,
  PLAN_ROUND_TITLE,
  PLAN_WAITING_DAYS,
} from './constants.js';
import { cleanTitle, isGardenCare, taskMinutes } from './planMinutes.js';
import { minutesText } from './planText.js';
import {
  addDays,
  dayDiff,
  hhmm,
  isDay,
  parseHhmm,
  wallDay,
  wallMinutes,
  wallToMs,
  weekday,
} from './planTime.js';

export interface PlanTaskInput {
  id: string;
  title: string;
  notes?: string;
  /** YYYY-MM-DD. */
  due?: string;
  /** Name of the Google Tasks list. */
  listName?: string;
  /** ISO time of the last change (Google Tasks keeps no creation time). */
  updated?: string;
}

export interface PlanBusyInput {
  /** Epoch ms. */
  start: number;
  end: number;
  /** Absent for a free/busy block with no details. */
  title?: string;
}

export interface PlanExtra {
  /** IANA zone the days and hours are thought in. */
  timeZone: string;
  /** Minutes set by hand, by task id. */
  minutes?: Record<string, number>;
  /** "Not today": task id → the day (YYYY-MM-DD) it was said on. */
  skipped?: Record<string, string>;
  /** How many days to plan, today included (default 7). */
  days?: number;
}

/** One pending task while the plan is being built. */
interface Pending {
  task: PlanTaskInput;
  index: number;
  title: string;
  minutes: number;
  source: AgendaPlanMinutesSource;
  garden: boolean;
  /** A small thing (minutes ≤ smallMinutes): goes in a shared "Pendientes rápidos" block. */
  quick: boolean;
  due?: string;
  earliest: string;
  skippedToday: boolean;
  remaining: number;
  pieces: Draft[];
  capMisses: number;
  slotMisses: number;
}

/** A placed block before its texts are written. */
interface Draft {
  day: string;
  start: number;
  minutes: number;
  members: Pending[];
  kind: DraftKind;
}

type DraftKind = 'task' | 'round' | 'quick';

interface Gap {
  from: number;
  to: number;
  work: boolean;
}

interface Span {
  from: number;
  to: number;
}

const weekdayName = new Intl.DateTimeFormat('es-MX', { weekday: 'long', timeZone: 'UTC' });

function maxDay(...days: string[]): string {
  return days.reduce((a, b) => (b > a ? b : a));
}

function rangeSpan(r: AgendaPlanRange): Span | null {
  const from = parseHhmm(r.from);
  const to = parseHhmm(r.to);
  return from === null || to === null || from >= to ? null : { from, to };
}

function subtract(gaps: Gap[], cut: Span): Gap[] {
  const out: Gap[] = [];
  for (const g of gaps) {
    if (cut.to <= g.from || cut.from >= g.to) {
      out.push(g);
      continue;
    }
    if (cut.from > g.from) out.push({ ...g, to: cut.from });
    if (cut.to < g.to) out.push({ ...g, from: cut.to });
  }
  return out;
}

/** Up to whole blocks. */
function toBlocks(minutes: number, block: number): number {
  return Math.ceil(minutes / block) * block;
}

/** Minutes of a garden block: cares plus setup in whole blocks, with a little slack (33 → 30, 36 → 60). */
function gardenBlockMinutes(sum: number, setup: number, block: number): number {
  const blocks = Math.max(1, Math.ceil((sum + setup - PLAN_ROUND_SLACK_MINUTES) / block));
  return blocks * block;
}

/** Minutes of `ms` on `day` (0 before the day, the full day after it); `up` rounds partial minutes up. */
function minutesOnDay(ms: number, start: number, end: number, tz: string, up: boolean): number {
  if (ms <= start) return 0;
  if (ms >= end) return MINUTES_PER_DAY;
  const next = up ? ms + MS_PER_MINUTE - 1 : ms;
  if (next >= end) return MINUTES_PER_DAY;
  return wallMinutes(next, tz);
}

/** Priority order: overdue (oldest first), today, future dates, then undated (oldest change first). */
function comparePending(today: string) {
  const rank = (p: Pending) => (!p.due ? 3 : p.due < today ? 0 : p.due === today ? 1 : 2);
  const updated = (p: Pending) => {
    const t = p.task.updated ? Date.parse(p.task.updated) : NaN;
    return Number.isFinite(t) ? t : Infinity;
  };
  return (a: Pending, b: Pending): number => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra < 3 && a.due !== b.due) return (a.due as string) < (b.due as string) ? -1 : 1;
    if (ra === 3) {
      const ua = updated(a);
      const ub = updated(b);
      if (ua !== ub) return ua < ub ? -1 : 1;
    }
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    if (a.task.id !== b.task.id) return a.task.id < b.task.id ? -1 : 1;
    return a.index - b.index;
  };
}

function planTask(p: Pending): AgendaPlanTask {
  const t: AgendaPlanTask = {
    id: p.task.id,
    title: p.title,
    minutes: p.minutes,
    source: p.source,
  };
  if (p.task.listName) t.listName = p.task.listName;
  return t;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "atrasada 2 días", "es para hoy", "vence mañana", "vence el viernes", "sin fecha…". */
function urgencyText(p: Pending, blockDay: string, today: string, tz: string): string {
  if (!p.due) {
    const t = p.task.updated ? Date.parse(p.task.updated) : NaN;
    if (Number.isFinite(t)) {
      const waited = dayDiff(wallDay(t, tz), today);
      if (waited >= PLAN_WAITING_DAYS) return `sin fecha, lleva ${waited} días esperando`;
    }
    return 'sin fecha';
  }
  if (p.due < today) return `atrasada ${plural(dayDiff(p.due, today), 'día', 'días')}`;
  if (p.due === blockDay) return blockDay === today ? 'es para hoy' : 'es para ese día';
  if (p.due === today) return 'es para hoy';
  const ahead = dayDiff(today, p.due);
  if (ahead === 1) return 'vence mañana';
  const [y, m, d] = p.due.split('-').map(Number);
  const name = weekdayName.format(Date.UTC(y, m - 1, d));
  return ahead < 7 ? `vence el ${name}` : `vence el ${name} ${d}`;
}

export function makePlan(
  tasks: readonly PlanTaskInput[],
  busy: readonly PlanBusyInput[],
  prefs: AgendaPlanPrefs,
  now: number,
  extra: PlanExtra,
): AgendaPlan {
  const tz = extra.timeZone;
  const today = wallDay(now, tz);
  const dayCount = Math.min(
    PLAN_MAX_DAYS,
    Math.max(
      1,
      Math.round(Number.isFinite(extra.days) ? (extra.days as number) : PLAN_DEFAULT_DAYS),
    ),
  );
  const days = Array.from({ length: dayCount }, (_, i) => addDays(today, i));
  const lastDay = days[days.length - 1];
  const block = Math.max(PLAN_MINUTES_STEP, prefs.blockMinutes);

  // 1. Each task: minutes, due date, garden care, "not today" and the first day it may be planned.
  const pending: Pending[] = tasks.map((task, index) => {
    const garden = isGardenCare(task, prefs);
    const real = taskMinutes(task, prefs, extra.minutes, garden);
    const quick = !garden && real.minutes <= prefs.smallMinutes;
    // Normal tasks are shown and planned in whole blocks; small things and cares keep real minutes.
    const minutes = garden || quick ? real.minutes : toBlocks(real.minutes, block);
    const source = real.source;
    const due = isDay(task.due) ? task.due : undefined;
    const skipped = extra.skipped?.[task.id];
    const skipFrom = isDay(skipped) && skipped >= today ? addDays(skipped, 1) : today;
    const earliest = garden
      ? maxDay(today, due ?? today, skipFrom)
      : due
        ? maxDay(today, addDays(due, -prefs.soonDays), skipFrom)
        : maxDay(today, skipFrom);
    return {
      task,
      index,
      title: cleanTitle(task.title),
      minutes,
      source,
      garden,
      quick,
      due,
      earliest,
      skippedToday: skipped === today,
      remaining: minutes,
      pieces: [],
      capMisses: 0,
      slotMisses: 0,
    };
  });
  // 2. Priority order.
  const ordered = [...pending].sort(comparePending(today));

  const events = busy
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.start - b.start);
  const margin = prefs.marginMinutes * MS_PER_MINUTE;
  const drafts: Draft[] = [];

  for (const day of days) {
    // 3. Free gaps of the day.
    const dayStart = wallToMs(day, 0, tz);
    const dayEnd = wallToMs(addDays(day, 1), 0, tz);
    const windows: { range: AgendaPlanRange; work: boolean }[] = prefs.workDays.includes(
      weekday(day),
    )
      ? [
          { range: prefs.morning, work: false },
          { range: prefs.work, work: true },
          { range: prefs.evening, work: false },
        ]
      : [{ range: prefs.weekend, work: false }];
    let gaps: Gap[] = [];
    for (const w of windows) {
      const span = rangeSpan(w.range);
      if (span) gaps.push({ ...span, work: w.work });
    }
    for (const r of prefs.rest) {
      const span = rangeSpan(r);
      if (span) gaps = subtract(gaps, span);
    }
    for (const e of events) {
      const from = e.start - margin;
      const to = e.end + margin;
      if (to <= dayStart || from >= dayEnd) continue;
      gaps = subtract(gaps, {
        from: minutesOnDay(from, dayStart, dayEnd, tz, false),
        to: minutesOnDay(to, dayStart, dayEnd, tz, true),
      });
    }
    if (day === today) {
      const lead = now + PLAN_LEAD_MINUTES * MS_PER_MINUTE;
      gaps = subtract(gaps, { from: 0, to: minutesOnDay(lead, dayStart, dayEnd, tz, true) });
    }
    gaps.sort((a, b) => a.from - b.from);

    // Only the block of small things may use work hours (and tries them first).
    const findSlot = (minutes: number, work: boolean): { gap: Gap; start: number } | null => {
      const order = work
        ? [...gaps.filter((g) => g.work), ...gaps.filter((g) => !g.work)]
        : gaps.filter((g) => !g.work);
      for (const gap of order) {
        const start = toBlocks(gap.from, block);
        if (start + minutes <= gap.to) return { gap, start };
      }
      return null;
    };
    const place = (minutes: number, members: Pending[], kind: DraftKind): boolean => {
      const slot = findSlot(minutes, kind === 'quick');
      if (!slot) return false;
      slot.gap.from = slot.start + minutes;
      const d: Draft = { day, start: slot.start, minutes, members, kind };
      drafts.push(d);
      return true;
    };

    // 4–5. Fill the day up to its cap.
    let capLeft = prefs.dailyBlocks * block;
    let roundDone = false;
    const tried = new Set<Pending>();
    const candidates = ordered.filter((p) => p.remaining > 0 && p.earliest <= day);
    for (const p of candidates) {
      if (p.garden && roundDone) continue;
      if (tried.has(p)) continue;
      if (p.quick) {
        // A block of small things: this one plus the next ready ones while their minutes fit.
        const group = [p];
        let sum = p.remaining;
        for (const c of candidates) {
          if (!c.quick || c === p || tried.has(c)) continue;
          if (sum + c.remaining > block) break;
          group.push(c);
          sum += c.remaining;
        }
        group.forEach((c) => tried.add(c));
        if (block > capLeft) group.forEach((c) => c.capMisses++);
        else if (place(block, group, 'quick')) {
          group.forEach((c) => {
            c.remaining = 0;
          });
          capLeft -= block;
        } else group.forEach((c) => c.slotMisses++);
        continue;
      }
      if (p.garden) {
        roundDone = true;
        const ready = candidates.filter((c) => c.garden);
        const members: Pending[] = [];
        let sum = 0;
        const setup = prefs.gardenSetupMinutes;
        for (const c of ready) {
          if (gardenBlockMinutes(sum + c.remaining, setup, block) > capLeft) break;
          members.push(c);
          sum += c.remaining;
        }
        ready.slice(members.length).forEach((c) => c.capMisses++);
        while (members.length) {
          const total = gardenBlockMinutes(sum, setup, block);
          if (place(total, [...members], 'round')) {
            members.forEach((c) => {
              c.remaining = 0;
            });
            capLeft -= total;
            break;
          }
          const dropped = members.pop() as Pending;
          dropped.slotMisses++;
          sum -= dropped.remaining;
        }
        continue;
      }
      const m = p.remaining;
      if (m <= capLeft && place(m, [p], 'task')) {
        p.pieces.push(drafts[drafts.length - 1]);
        p.remaining = 0;
        capLeft -= m;
        continue;
      }
      let placed = false;
      // Split only when waiting would not help: it never fits a whole day, it is due, or it was started.
      const mustSplit =
        p.minutes > prefs.dailyBlocks * block ||
        (p.due !== undefined && p.due <= day) ||
        p.pieces.length > 0;
      if (p.minutes > block && mustSplit) {
        // Too long for what is left today: the biggest whole number of blocks that fits.
        const biggest = Math.floor(Math.min(m - 1, capLeft) / block) * block;
        for (let size = biggest; size >= block && !placed; size -= block) {
          if (place(size, [p], 'task')) {
            p.pieces.push(drafts[drafts.length - 1]);
            p.remaining -= size;
            capLeft -= size;
            placed = true;
          }
        }
        if (placed) continue;
        if (capLeft < block) p.capMisses++;
        else p.slotMisses++;
        continue;
      }
      if (m > capLeft) p.capMisses++;
      else p.slotMisses++;
    }
  }

  // 6–7. Texts, ids and the output.
  const startOf = (d: Draft) => wallToMs(d.day, d.start, tz);
  const blocks: { day: string; block: AgendaPlanBlock }[] = drafts.map((d) => {
    const lead = d.members[0];
    const parts: string[] = [urgencyText(lead, d.day, today, tz)];
    let part: number | undefined;
    let partsCount: number | undefined;
    // A round or a quick block with one member reads as that task's own block.
    const group = d.kind !== 'task' && d.members.length > 1;
    if (group && d.kind === 'quick') {
      parts.push(plural(d.members.length, 'cosa chica', 'cosas chicas'));
    } else if (!group) {
      const count = lead.pieces.length + (lead.remaining > 0 ? 1 : 0);
      if (lead.skippedToday) parts.push('hoy dijiste que no');
      if (d.kind === 'task' && lead.minutes > block) {
        if (count > 1) {
          part = lead.pieces.indexOf(d) + 1;
          partsCount = count;
          parts.push(`necesita más de un rato (parte ${part} de ${count})`);
        } else {
          parts.push('necesita más de un rato');
        }
      }
    } else {
      const overdue = d.members.some((c) => c.due !== undefined && c.due < today);
      parts.push(
        plural(d.members.length, 'planta', 'plantas') + (overdue ? ' · con atrasadas' : ''),
      );
    }
    const endMs = wallToMs(d.day, d.start + d.minutes, tz);
    const dayEnd = wallToMs(addDays(d.day, 1), 0, tz);
    const next = events.find(
      (e) =>
        e.start >= endMs &&
        e.start < dayEnd &&
        e.start - endMs <= PLAN_NEAR_EVENT_MINUTES * MS_PER_MINUTE,
    );
    if (next) {
      const at = hhmm(wallMinutes(next.start, tz));
      parts.push(
        next.title?.trim()
          ? `cabe antes de "${next.title.trim()}" de las ${at}`
          : `cabe antes de lo de las ${at}`,
      );
    }
    const ids = d.members.map((c) => c.task.id).join('+');
    const out: AgendaPlanBlock = {
      id: part ? `${ids}#${part}` : ids,
      start: hhmm(d.start),
      end: hhmm(d.start + d.minutes),
      startsAt: new Date(startOf(d)).toISOString(),
      minutes: d.minutes,
      title: !group ? lead.title : d.kind === 'round' ? PLAN_ROUND_TITLE : PLAN_QUICK_TITLE,
      why: parts.join(' · '),
      tasks: d.members.map(planTask),
    };
    if (group && d.kind === 'round') out.round = true;
    if (group && d.kind === 'quick') out.quick = true;
    if (part && partsCount) {
      out.part = part;
      out.parts = partsCount;
    }
    return { day: d.day, block: out };
  });

  const planDays: AgendaPlanDay[] = days.map((day) => {
    const own = blocks
      .filter((b) => b.day === day)
      .map((b) => b.block)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return { day, blocks: own, minutes: own.reduce((s, b) => s + b.minutes, 0) };
  });

  const reason = (misses: Pending[]) => {
    const cap = misses.reduce((s, p) => s + p.capMisses, 0);
    const slot = misses.reduce((s, p) => s + p.slotMisses, 0);
    return slot > cap
      ? 'no hubo un hueco libre esta semana'
      : 'no cupo en el tope diario de esta semana';
  };
  const unplaced = ordered.filter((p) => p.remaining > 0 && p.earliest <= lastDay);
  const leftover: AgendaPlanLeftover[] = [];
  const gardenLeft = unplaced.filter((p) => p.garden);
  const quickLeft = unplaced.filter((p) => p.quick);
  const sumLeft = (list: Pending[]) => list.reduce((s, c) => s + c.remaining, 0);
  for (const p of unplaced) {
    if (p.garden || p.quick) {
      // Cares and small things that did not fit go out together, like they are planned.
      const list = p.garden ? gardenLeft : quickLeft;
      if (p !== list[0]) continue;
      leftover.push({
        title: list.length > 1 ? (p.garden ? PLAN_ROUND_TITLE : PLAN_QUICK_TITLE) : p.title,
        minutes: p.garden
          ? gardenBlockMinutes(sumLeft(list), prefs.gardenSetupMinutes, block)
          : toBlocks(sumLeft(list), block),
        why: reason(list),
        tasks: list.map(planTask),
      });
      continue;
    }
    const why = p.pieces.length
      ? `faltan ${minutesText(p.remaining)} · ${reason([p])}`
      : reason([p]);
    leftover.push({ title: p.title, minutes: p.remaining, why, tasks: [planTask(p)] });
  }

  return { days: planDays, leftover, prefs };
}
