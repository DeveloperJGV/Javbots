import { describe, expect, it } from 'vitest';

import type { AgendaItem, AgendaStatus } from '../../../../core/src/messages.js';
import {
  applyAgendaFurniture,
  consoleSprite,
  radarSprite,
  taskListSprite,
  weekCells,
  weekMapSprite,
} from '../../webview/agendaFurniture.js';
import { isAgendaFurniture } from '../../webview/agendaStore.js';
import {
  conflictKeys,
  defaultCalendar,
  draftConflicts,
  draftSummary,
  findConflicts,
  groupByDay,
  itemKey,
  rangeText,
  splitPrefix,
} from '../../webview/agendaText.js';
import {
  AGENDA_COLORS,
  CONSOLE_LED,
  RADAR_CENTER,
  RADAR_FLOOR_COLOR,
  TASK_BOXES,
  WEEK_MAP_ALARM_Y,
  WEEK_MAP_HEADER_Y,
  WEEK_MAP_X0,
} from '../../webview/constants.js';

/** Local wall-clock time as ISO (the agenda thinks in the computer's own days). */
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const ev = (
  id: string,
  title: string,
  start: string,
  end?: string,
  allDay = false,
): AgendaItem => ({
  id,
  kind: 'event',
  title,
  start,
  end,
  allDay,
});
const task = (id: string, title: string, start?: string): AgendaItem => ({
  id,
  kind: 'task',
  title,
  allDay: true,
  ...(start ? { start } : {}),
});

const ITEMS: AgendaItem[] = [
  ev('a', 'Salida: Cena', at(7, 20), at(7, 22)),
  ev('b', 'Concierto: Banda', at(7, 21), at(7, 23)),
  ev('c', 'Dentista', at(4, 10), at(4, 11)),
  ev('d', 'Junta', at(4, 11), at(4, 12)), // touches c: no clash
  ev('e', 'Viaje', '2026-11-05', '2026-11-07', true),
  task('t1', 'Limpiar el garage', '2026-11-04'),
  task('t2', 'Atrasada', '2026-11-01'),
  task('t3', 'Arreglar plantas'),
];
const STATUS: AgendaStatus = {
  type: 'agendaStatus',
  connected: true,
  from: '2026-11-03',
  days: 7,
  items: ITEMS,
  saving: false,
};
const blank = (w: number, h: number, c = ''): string[][] =>
  Array.from({ length: h }, () => Array<string>(w).fill(c));

const CALS = [{ id: 'fam', name: 'Familia', writable: true, busyOnly: false }];

describe('agenda text', () => {
  it('reads the type word of a title', () => {
    expect(splitPrefix('Salida: Cena')).toEqual({ prefix: 'Salida', rest: 'Cena' });
    expect(splitPrefix('concierto:Banda')).toEqual({ prefix: 'Concierto', rest: 'Banda' });
    expect(splitPrefix('Dentista 10:00')).toEqual({ rest: 'Dentista 10:00' });
  });

  it('finds overlapping events, not touching ones nor all-day ones', () => {
    expect(findConflicts(ITEMS).map(([x, y]) => `${x.id}${y.id}`)).toEqual(['ab']);
    expect([...conflictKeys(ITEMS)].sort()).toEqual(['event:a', 'event:b']);
  });

  it('groups by day: all-day spans, overdue tasks on today, undated apart', () => {
    const { days, undated } = groupByDay(ITEMS, '2026-11-03', 7);
    const by = Object.fromEntries(
      days.map((d) => [d.day.slice(8), [...d.events, ...d.tasks].map((i) => i.id).join('')]),
    );
    expect(by).toEqual({
      '03': 't2',
      '04': 'cdt1',
      '05': 'e',
      '06': 'e',
      '07': 'ab',
      '08': '',
      '09': '',
    });
    expect(undated.map((t) => t.id)).toEqual(['t3']);
  });

  it('checks a draft against the agenda before saving', () => {
    const d = { kind: 'event' as const, title: 'Salida: Cine', date: '2026-11-07', time: '22:30' };
    expect(draftConflicts(d, ITEMS).map((i) => i.id)).toEqual(['b']);
    expect(draftConflicts({ ...d, time: '23:00' }, ITEMS)).toEqual([]);
    expect(draftConflicts({ kind: 'task', title: 'x', date: '2026-11-07' }, ITEMS)).toEqual([]);
    expect(draftSummary({ ...d, calendar: 'fam' }, '2026-11-03', CALS)).toContain(
      'el calendario "Familia"',
    );
    expect(draftSummary(d, '2026-11-03')).toContain('→ el calendario');
    expect(draftSummary({ kind: 'task', title: 'Podar' }, '2026-11-03')).toBe(
      '"Podar" · sin fecha → tus tareas (solo tú las ves)',
    );
  });
});

describe('agenda furniture', () => {
  it('only the console opens the panel', () => {
    expect(isAgendaFurniture('AGENDA_CONSOLE')).toBe(true);
    for (const t of ['AGENDA_WEEK_MAP:left', 'AGENDA_RADAR', 'AGENDA_TASKS'])
      expect(isAgendaFurniture(t)).toBe(false);
    expect(isAgendaFurniture('CONNECTIONS_RACK')).toBe(false);
    expect(isAgendaFurniture(undefined)).toBe(false);
  });

  it('week map: blocks per day, today lit, clash day marked', () => {
    const cells = weekCells(STATUS);
    expect(cells.map((c) => [c.events, c.tasks, c.conflict])).toEqual([
      [0, 1, false],
      [2, 1, false],
      [1, 0, false],
      [1, 0, false],
      [2, 0, true],
      [0, 0, false],
      [0, 0, false],
    ]);
    const out = weekMapSprite(blank(64, 32), cells);
    expect(out[WEEK_MAP_HEADER_Y][WEEK_MAP_X0]).toBe(AGENDA_COLORS.today);
    expect(out[WEEK_MAP_HEADER_Y][WEEK_MAP_X0 + 8]).toBe('');
    expect(out[WEEK_MAP_ALARM_Y][WEEK_MAP_X0 + 4 * 8]).toBe(AGENDA_COLORS.conflict);
    expect(out[25][WEEK_MAP_X0 + 8 + 1]).toBe(AGENDA_COLORS.event);
    expect(out[25][WEEK_MAP_X0 + 1]).toBe(AGENDA_COLORS.task);
    expect(out[25][WEEK_MAP_X0 + 5 * 8 + 1]).toBe('');
  });

  it('task list, console light and radar', () => {
    const t = taskListSprite(blank(32, 32), 2);
    expect(t[TASK_BOXES[1].y + 1][TASK_BOXES[1].x]).toBe(AGENDA_COLORS.task);
    expect(t[TASK_BOXES[2].y + 1][TASK_BOXES[2].x]).toBe('');
    expect(consoleSprite(blank(48, 32), 'conflict')[CONSOLE_LED.y][CONSOLE_LED.x]).toBe(
      AGENDA_COLORS.conflict,
    );
    expect(consoleSprite(blank(48, 32), 'off')[CONSOLE_LED.y][CONSOLE_LED.x]).toBe('');
    const r = radarSprite(blank(32, 32, RADAR_FLOOR_COLOR.toUpperCase()), 0);
    expect(r[RADAR_CENTER.y - 5][RADAR_CENTER.x]).toBe(AGENDA_COLORS.sweep); // step 0 points up
  });

  it('only the agenda pieces change; without a session the screens stay dark', () => {
    const inst = (type: string) => ({ type, sprite: blank(48, 32), x: 0, y: 0, zY: 0 });
    const list = [inst('AGENDA_CONSOLE'), inst('AGENDA_TASKS'), inst('DESK')];
    const lit = applyAgendaFurniture(list, STATUS, 0);
    expect(lit[0].sprite[CONSOLE_LED.y][CONSOLE_LED.x]).toBe(AGENDA_COLORS.conflict);
    expect(lit[1].sprite).not.toBe(list[1].sprite);
    expect(lit[2]).toBe(list[2]);
    const dark = applyAgendaFurniture(list, { ...STATUS, connected: false }, 0);
    expect(dark[0].sprite[CONSOLE_LED.y][CONSOLE_LED.x]).toBe('');
    expect(dark[1]).toBe(list[1]);
    const none = [inst('DESK')];
    expect(applyAgendaFurniture(none, STATUS, 0)).toBe(none);
  });

  it('several calendars: default calendar by type, keys by calendar, busy ranges', () => {
    expect(defaultCalendar('salida', 'fam', 'casa')).toBe('fam');
    expect(defaultCalendar('concierto', 'fam', 'casa')).toBe('fam');
    expect(defaultCalendar('evento', 'fam', 'casa')).toBe('casa');
    expect(defaultCalendar('evento', 'fam', undefined)).toBe('fam');
    const a: AgendaItem = { id: 'e1', kind: 'event', title: 'A', allDay: true, calendar: 'fam' };
    expect(itemKey(a)).not.toBe(itemKey({ ...a, calendar: 'casa' }));
    const busy: AgendaItem = {
      id: 'w#0',
      kind: 'event',
      title: 'Ocupado',
      allDay: false,
      start: new Date(2026, 10, 4, 9, 0).toISOString(),
      end: new Date(2026, 10, 4, 18, 0).toISOString(),
      busy: true,
    };
    expect(rangeText(busy)).toBe('09:00–18:00');
  });
});
