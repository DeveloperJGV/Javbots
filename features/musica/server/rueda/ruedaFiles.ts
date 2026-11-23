import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type {
  RuedaDevice,
  RuedaLastKey,
  RuedaSettings,
  RuedaSettingsPatch,
  RuedaStatus,
} from '../../../../core/src/messages.js';
import {
  COMPUTER_NAME_MAX,
  LAUNCHER_FILE,
  LAUNCHER_PYTHONS,
  LAUNCHER_SCRIPT,
  REASONS,
  RUEDA_DIR_ENV,
  RUEDA_DIR_NAME,
  SETTINGS_FILE,
  STATE_FILE,
  STEP_MAX,
  STEP_MIN,
} from './constants.js';

type Obj = Record<string, unknown>;

/** The program's data folder: the variable, else %APPDATA%\rueda-volumen. */
export function ruedaDir(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): string {
  const fromEnv = env[RUEDA_DIR_ENV];
  if (fromEnv) return fromEnv;
  const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return path.join(appData, RUEDA_DIR_NAME);
}

/** A JSON object from a file; null when it is missing or not an object. */
export function readObject(file: string): Obj | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
  } catch {
    return null;
  }
}

/** Atomic write: temp file in the same folder, then rename (the program never reads half a file). */
export function writeObjectAtomic(file: string, value: Obj): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1), 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw e;
  }
}

export interface Launcher {
  python: string;
  script: string;
}

/**
 * The launcher the program wrote about itself. Only an absolute, existing interpreter with one of the known names
 * and an absolute, existing `rueda.pyw` count; anything else is ignored (null).
 */
export function readLauncher(dir: string): Launcher | null {
  const raw = readObject(path.join(dir, LAUNCHER_FILE));
  if (!raw) return null;
  const { python, script } = raw;
  if (typeof python !== 'string' || typeof script !== 'string') return null;
  if (!path.win32.isAbsolute(python) && !path.isAbsolute(python)) return null;
  if (!path.win32.isAbsolute(script) && !path.isAbsolute(script)) return null;
  if (!LAUNCHER_PYTHONS.includes(path.win32.basename(python).toLowerCase())) return null;
  if (path.win32.basename(script).toLowerCase() !== LAUNCHER_SCRIPT) return null;
  try {
    if (!fs.statSync(python).isFile() || !fs.statSync(script).isFile()) return null;
  } catch {
    return null;
  }
  return { python, script };
}

const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** The settings as the page sees them, from the program's settings file (its defaults when missing). */
export function toSettings(raw: Obj | null): RuedaSettings {
  const r = raw ?? {};
  const step = typeof r.paso === 'number' && Number.isInteger(r.paso) ? r.paso : 3;
  return {
    paused: bool(r.pausado, false),
    step: step >= STEP_MIN && step <= STEP_MAX ? step : 3,
    toast: bool(r.aviso, true),
    startWithWindows: bool(r.arrancar_con_windows, false),
    computerName: typeof r.nombre_lap === 'string' ? r.nombre_lap : '',
  };
}

/** Checks a settings change from the page. Returns the program's keys to write, or an error in words. */
export function validatePatch(patch: unknown): { ok: Obj } | { error: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'Sin cambios.' };
  const p = patch as RuedaSettingsPatch & Obj;
  const out: Obj = {};
  for (const key of Object.keys(p)) {
    if (!['paused', 'step', 'toast', 'computerName'].includes(key))
      return { error: `Ajuste desconocido: ${key}` };
  }
  if (p.paused !== undefined) {
    if (typeof p.paused !== 'boolean') return { error: 'Pausa: sí o no.' };
    out.pausado = p.paused;
  }
  if (p.toast !== undefined) {
    if (typeof p.toast !== 'boolean') return { error: 'Aviso: sí o no.' };
    out.aviso = p.toast;
  }
  if (p.step !== undefined) {
    if (
      typeof p.step !== 'number' ||
      !Number.isInteger(p.step) ||
      p.step < STEP_MIN ||
      p.step > STEP_MAX
    )
      return { error: `El paso va de ${STEP_MIN} a ${STEP_MAX}.` };
    out.paso = p.step;
  }
  if (p.computerName !== undefined) {
    if (typeof p.computerName !== 'string') return { error: 'Nombre inválido.' };
    const name = p.computerName.trim();

    if (!name || name.length > COMPUTER_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name))
      return { error: `El nombre va de 1 a ${COMPUTER_NAME_MAX} letras.` };
    out.nombre_lap = name;
  }
  if (Object.keys(out).length === 0) return { error: 'Sin cambios.' };
  return { ok: out };
}

/** Merges a validated change into the settings file, keeping every other key the program has there. */
export function writeSettings(dir: string, change: Obj): string | null {
  const file = path.join(dir, SETTINGS_FILE);
  let current: Obj = {};
  if (fs.existsSync(file)) {
    const raw = readObject(file);
    if (!raw) return 'El archivo de ajustes de la rueda está dañado; no lo toqué.';
    current = raw;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    writeObjectAtomic(file, { ...current, ...change });
    return null;
  } catch (e) {
    return `No pude guardar los ajustes (${(e as Error).message}).`;
  }
}

function toDevice(raw: unknown): RuedaDevice | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Obj;
  if (typeof d.nombre !== 'string') return undefined;
  const out: RuedaDevice = {
    name: d.nombre,
    playing: d.suena === true,
    thisComputer: d.es_esta_lap === true,
    volumeControl: d.soporta_volumen === true,
  };
  if (typeof d.tipo === 'string' && d.tipo) out.kind = d.tipo;
  if (typeof d.volumen === 'number' && Number.isFinite(d.volumen))
    out.volume = Math.max(0, Math.min(100, Math.round(d.volumen)));
  return out;
}

const reason = (code: unknown): string =>
  typeof code === 'string' ? (REASONS[code] ?? 'other') : 'other';

function toLastKey(raw: unknown): RuedaLastKey | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const k = raw as Obj;
  if (k.a !== 'spotify' && k.a !== 'windows') return undefined;
  const out: RuedaLastKey = { to: k.a, reason: reason(k.motivo) };
  if (typeof k.cuando === 'string') out.at = k.cuando;
  return out;
}

/** Is that process alive? (EPERM means it exists but belongs to someone else.) */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The whole status from the three files. `alive` checks the program's pid. */
export function readStatus(dir: string, alive: (pid: number) => boolean = pidAlive): RuedaStatus {
  const state = readObject(path.join(dir, STATE_FILE));
  const settingsRaw = readObject(path.join(dir, SETTINGS_FILE));
  const launcher = readLauncher(dir);
  const pid = state?.pid;
  const running =
    state?.prendido === true &&
    typeof pid === 'number' &&
    Number.isInteger(pid) &&
    pid > 0 &&
    alive(pid);
  const status: RuedaStatus = {
    type: 'ruedaStatus',
    installed: Boolean(launcher),
    running,
    settings: toSettings(settingsRaw),
  };
  if (!state) return status;
  if (typeof state.actualizado === 'string') status.updatedAt = state.actualizado;
  if (!running) return status;
  status.session = state.sesion === true;
  status.signingIn = state.iniciando_sesion === true;
  status.mode = state.modo === 'spotify' ? 'spotify' : 'windows';
  status.reason = reason(state.motivo);
  const device = toDevice(state.aparato);
  if (device) status.device = device;
  const lastKey = toLastKey(state.ultima_tecla);
  if (lastKey) status.lastKey = lastKey;
  return status;
}
