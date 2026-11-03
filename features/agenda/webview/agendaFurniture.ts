import type { AgendaStatus } from '../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import { conflictKeys, groupByDay, itemKey } from './agendaText.js';
import {
  AGENDA_BLINK_SEC,
  AGENDA_COLORS,
  AGENDA_CONSOLE_TYPE,
  AGENDA_RADAR_TYPE,
  AGENDA_TASKS_TYPE,
  AGENDA_WEEK_MAP_TYPE,
  CONSOLE_LED,
  RADAR_CENTER,
  RADAR_FLOOR_COLOR,
  RADAR_RADIUS,
  RADAR_STEPS,
  RADAR_SWEEP_SEC,
  TASK_BOXES,
  WEEK_MAP_ALARM_Y,
  WEEK_MAP_BLOCK_H,
  WEEK_MAP_BOTTOM_Y,
  WEEK_MAP_COL_W,
  WEEK_MAP_HEADER_Y,
  WEEK_MAP_MAX_BLOCKS,
  WEEK_MAP_STEP,
  WEEK_MAP_X0,
} from './constants.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];

/** Per day of the map: how many events and tasks, and whether two events clash. */
export interface WeekCell {
  events: number;
  tasks: number;
  conflict: boolean;
}

/** The week as the map shows it (first column = today). */
export function weekCells(status: AgendaStatus): WeekCell[] {
  const clash = conflictKeys(status.items);
  const { days } = groupByDay(status.items, status.from, status.days);
  return days.map((d) => ({
    events: d.events.length,
    tasks: d.tasks.length,
    conflict: d.events.some((e) => clash.has(itemKey(e))),
  }));
}

/** A short key of what a sprite shows, so the same state isn't redrawn every frame. */
export function weekKey(cells: readonly WeekCell[]): string {
  return cells.map((c) => `${c.events}.${c.tasks}${c.conflict ? '!' : ''}`).join('|');
}

const fill = (out: SpriteData, x0: number, y0: number, w: number, h: number, color: string) => {
  for (let y = y0; y < y0 + h; y++) {
    const row = out[y];
    if (!row) continue;
    for (let x = x0; x < x0 + w && x < row.length; x++) row[x] = color;
  }
};

const copy = (s: SpriteData): SpriteData => s.map((r) => r.slice());

/** The week map with a block per event (cyan) and task (amber), today's header lit and clash days marked red. */
export function weekMapSprite(base: SpriteData, cells: readonly WeekCell[]): SpriteData {
  const out = copy(base);
  cells.slice(0, 7).forEach((c, i) => {
    const x = WEEK_MAP_X0 + WEEK_MAP_STEP * i;
    if (i === 0) fill(out, x, WEEK_MAP_HEADER_Y, WEEK_MAP_COL_W, 2, AGENDA_COLORS.today);
    if (c.conflict) fill(out, x, WEEK_MAP_ALARM_Y, WEEK_MAP_COL_W, 1, AGENDA_COLORS.conflict);
    const blocks = [
      ...Array<'event'>(c.events).fill('event'),
      ...Array<'task'>(c.tasks).fill('task'),
    ].slice(0, WEEK_MAP_MAX_BLOCKS);
    blocks.forEach((kind, n) => {
      const y = WEEK_MAP_BOTTOM_Y - (n + 1) * (WEEK_MAP_BLOCK_H + 1) + 2;
      fill(out, x + 1, y, WEEK_MAP_COL_W - 2, WEEK_MAP_BLOCK_H, AGENDA_COLORS[kind]);
      fill(
        out,
        x + WEEK_MAP_COL_W - 2,
        y,
        1,
        1,
        kind === 'event' ? AGENDA_COLORS.eventShine : AGENDA_COLORS.taskShine,
      );
    });
  });
  return out;
}

/** The task list with one lit box per pending task (overdue and undated ones count). */
export function taskListSprite(base: SpriteData, pending: number): SpriteData {
  const out = copy(base);
  TASK_BOXES.slice(0, pending).forEach((b) => {
    fill(out, b.x, b.y, 2, 2, AGENDA_COLORS.task);
    fill(out, b.x + 1, b.y, 1, 1, AGENDA_COLORS.taskShine);
  });
  return out;
}

/** The console with its light: red (blinking) while events clash, green otherwise. */
export function consoleSprite(base: SpriteData, light: 'ok' | 'conflict' | 'off'): SpriteData {
  const out = copy(base);
  if (light !== 'off')
    fill(
      out,
      CONSOLE_LED.x,
      CONSOLE_LED.y,
      2,
      2,
      light === 'ok' ? AGENDA_COLORS.ok : AGENDA_COLORS.conflict,
    );
  return out;
}

/** The radar's sweep line at step `step` of RADAR_STEPS, painted only over the dark floor of the screen. */
export function radarSprite(base: SpriteData, step: number): SpriteData {
  const out = copy(base);
  const floor = RADAR_FLOOR_COLOR.toUpperCase();
  const draw = (s: number, color: string) => {
    const a = (s / RADAR_STEPS) * 2 * Math.PI - Math.PI / 2;
    for (let r = 1; r < RADAR_RADIUS; r++) {
      const x = Math.round(RADAR_CENTER.x + Math.cos(a) * r);
      const y = Math.round(RADAR_CENTER.y + Math.sin(a) * r);
      if ((out[y]?.[x] ?? '').toUpperCase().startsWith(floor)) out[y][x] = color;
    }
  };
  draw(step - 1, AGENDA_COLORS.sweepTail);
  draw(step, AGENDA_COLORS.sweep);
  return out;
}

const cache = new WeakMap<SpriteData, Map<string, SpriteData>>();
function cached(base: SpriteData, key: string, make: () => SpriteData): SpriteData {
  let byKey = cache.get(base);
  if (!byKey) {
    byKey = new Map();
    cache.set(base, byKey);
  }
  let hit = byKey.get(key);
  if (!hit) {
    hit = make();
    byKey.set(key, hit);
  }
  return hit;
}

/** Lights the agenda room (features/agenda) from the last status; the radar turns even without one. */
export function applyAgendaFurniture(
  instances: FurnitureInstance[],
  status: AgendaStatus | undefined,
  timeSec: number,
): FurnitureInstance[] {
  const types = new Set([
    AGENDA_WEEK_MAP_TYPE,
    AGENDA_CONSOLE_TYPE,
    AGENDA_RADAR_TYPE,
    AGENDA_TASKS_TYPE,
  ]);
  if (!instances.some((f) => types.has(baseType(f.type)))) return instances;
  const live = status?.connected ? status : undefined;
  const cells = live ? weekCells(live) : [];
  const anyClash = cells.some((c) => c.conflict);
  const blinkOff = Math.floor(timeSec / AGENDA_BLINK_SEC) % 2 === 1;
  const pending = live ? live.items.filter((i) => i.kind === 'task').length : 0;
  const step = Math.floor((timeSec / RADAR_SWEEP_SEC) * RADAR_STEPS) % RADAR_STEPS;
  return instances.map((f) => {
    switch (baseType(f.type)) {
      case AGENDA_WEEK_MAP_TYPE: {
        if (!live) return f;
        const key = `w${weekKey(cells)}`;
        return { ...f, sprite: cached(f.sprite, key, () => weekMapSprite(f.sprite, cells)) };
      }
      case AGENDA_TASKS_TYPE:
        return pending
          ? {
              ...f,
              sprite: cached(f.sprite, `t${pending}`, () => taskListSprite(f.sprite, pending)),
            }
          : f;
      case AGENDA_CONSOLE_TYPE: {
        const light = !live ? 'off' : anyClash ? (blinkOff ? 'off' : 'conflict') : 'ok';
        return {
          ...f,
          sprite: cached(f.sprite, `c${light}`, () => consoleSprite(f.sprite, light)),
        };
      }
      case AGENDA_RADAR_TYPE:
        return { ...f, sprite: cached(f.sprite, `r${step}`, () => radarSprite(f.sprite, step)) };
      default:
        return f;
    }
  });
}
