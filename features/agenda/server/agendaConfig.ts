import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AGENDA_CONFIG_FILE, DEFAULT_AGENDA_CALENDAR, LOG_PREFIX } from './constants.js';

export function agendaConfigPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', AGENDA_CONFIG_FILE);
}

/** The calendar's name from agenda.json (`calendario`), or the default. Read only: the office never writes it. */
export function readAgendaCalendarName(file = agendaConfigPath()): string {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    const name = (raw as Record<string, unknown> | null)?.calendario;
    if (typeof name === 'string' && name.trim()) return name.trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  return DEFAULT_AGENDA_CALENDAR;
}
