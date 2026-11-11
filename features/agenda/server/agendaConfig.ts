import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  AGENDA_CONFIG_FILE,
  DEFAULT_AGENDA_CALENDAR,
  DEFAULT_HOME_CALENDAR,
  LOG_PREFIX,
} from './constants.js';

export function agendaConfigPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', AGENDA_CONFIG_FILE);
}

/** agenda.json as the office understands it. Read only: the office never writes it. */
export interface AgendaConfig {
  /** The shared calendar (`calendario`): only what's for both people (outings, concerts). */
  shared: string;
  /** The owner's own calendar for the rest (`casa`): house chores, services, the dog. */
  home: string;
  /** Names to show instead of a calendar's own (`nombres`: { "<calendar name or id>": "Trabajo" }). */
  names: Record<string, string>;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function readAgendaConfig(file = agendaConfigPath()): AgendaConfig {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  const names: Record<string, string> = {};
  if (raw.nombres && typeof raw.nombres === 'object' && !Array.isArray(raw.nombres)) {
    for (const [k, v] of Object.entries(raw.nombres as Record<string, unknown>)) {
      const name = text(v);
      if (name) names[k] = name;
    }
  }
  return {
    shared: text(raw.calendario) ?? DEFAULT_AGENDA_CALENDAR,
    home: text(raw.casa) ?? DEFAULT_HOME_CALENDAR,
    names,
  };
}

/** The owner's own calendar for house things (`casa`), or the default. */
export function readHomeCalendarName(file = agendaConfigPath()): string {
  return readAgendaConfig(file).home;
}
