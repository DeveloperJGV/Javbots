import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CONCERTS_CONFIG_FILE, LOG_PREFIX } from './constants.js';

/**
 * ~/.pixel-agents/conciertos.json. The keys are filled by hand (field names in Spanish, as the user edits them);
 * the server remembers the calendar's id. The Google session is features/google's (google.json). Unknown fields are kept as they are.
 */
export interface ConcertsConfig {
  ticketmasterKey?: string;
  setlistfmKey?: string;
  /** Name of the Google calendar to read and add concerts to (default "Conciertos"; it must already exist). */
  calendario?: string;
  /** Id of that calendar once found (so a rename doesn't lose it). */
  calendarId?: string;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function concertsConfigPath(home = os.homedir()): string {
  return path.join(home, '.pixel-agents', CONCERTS_CONFIG_FILE);
}

export function readConcertsConfig(file = concertsConfigPath()): {
  config: ConcertsConfig;
  raw: Record<string, unknown>;
} {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      raw = parsed as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
  }
  const config: ConcertsConfig = {
    ticketmasterKey: text(raw.ticketmasterKey),
    setlistfmKey: text(raw.setlistfmKey),
    calendario: text(raw.calendario),
    calendarId: text(raw.calendarId),
  };
  return { config, raw };
}

/** Merges `changes` into the file (undefined deletes the field), atomically. Re-reads first: the user edits it too. */
export function updateConcertsConfig(
  changes: Partial<ConcertsConfig>,
  file = concertsConfigPath(),
): void {
  const { raw } = readConcertsConfig(file);
  const next: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
