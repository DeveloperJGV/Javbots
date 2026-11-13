/**
 * "asistente" in <home>/.pixel-agents/ofertas.json. Read before every run; the panel's settings change only "apagado"
 * and "modelo" (writeAsistenteSettings), everything else is kept as it is on disk:
 *
 *   { "asistente": { "apagado": true, "comando": "C:/ruta/claude.exe", "modelo": "haiku", "minutosLimite": 4 } }
 *
 * Every field is optional; a missing or broken one falls back to the factory value. Never throws.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ofertasPath } from '../vigia/storage.js';
import {
  DEFAULT_COMMAND,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  MODEL_CHOICES,
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
} from './constants.js';

export interface AsistenteConfig {
  /** false when the owner turned the assistant off by hand. */
  enabled: boolean;
  command: string;
  model: string;
  timeoutMs: number;
}

const COMMAND_MAX = 260;
const MODEL_PATTERN = /^[A-Za-z0-9._[\]-]{1,64}$/;

export function defaultAsistenteConfig(): AsistenteConfig {
  return {
    enabled: true,
    command: DEFAULT_COMMAND,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/** The "asistente" object of the file → config, field by field. */
export function parseAsistenteConfig(raw: unknown): AsistenteConfig {
  const d = defaultAsistenteConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return d;
  }
  const r = raw as Record<string, unknown>;
  const out: AsistenteConfig = { ...d, enabled: r.apagado !== true };
  if (typeof r.comando === 'string') {
    const c = r.comando.trim();
    if (c && c.length <= COMMAND_MAX && !/[\u0000-\u001f"]/.test(c)) {
      out.command = c;
    }
  }
  if (typeof r.modelo === 'string' && MODEL_PATTERN.test(r.modelo.trim())) {
    out.model = r.modelo.trim();
  }
  if (typeof r.minutosLimite === 'number' && Number.isFinite(r.minutosLimite)) {
    out.timeoutMs = Math.round(
      Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, r.minutosLimite * 60_000)),
    );
  }
  return out;
}

/** Reads the file each time (it is edited by hand while the office runs). Unreadable → factory values. */
export function readAsistenteConfig(home: string = os.homedir()): AsistenteConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(ofertasPath(home), 'utf8')) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return parseAsistenteConfig((raw as Record<string, unknown>).asistente);
    }
  } catch {
    // Missing or broken file: the factory values.
  }
  return defaultAsistenteConfig();
}

export type ModelChoice = (typeof MODEL_CHOICES)[number];

/**
 * The panel's two settings: on/off ("apagado") and the model, one of MODEL_CHOICES. Writes only those two keys of
 * "asistente" and keeps the rest of the file as it is (atomic, private to the user). false when it could not write.
 */
export function writeAsistenteSettings(
  changes: { enabled?: boolean; model?: string },
  home: string = os.homedir(),
): boolean {
  const file = ofertasPath(home);
  try {
    let raw: Record<string, unknown> = {};
    try {
      const v = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) raw = v as Record<string, unknown>;
    } catch (err) {
      // A missing file starts empty; a broken one is not overwritten (the watch keeps it aside on its next read)
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
    const prev = raw.asistente;
    const a: Record<string, unknown> =
      prev && typeof prev === 'object' && !Array.isArray(prev)
        ? { ...(prev as Record<string, unknown>) }
        : {};
    if (changes.enabled !== undefined) {
      if (changes.enabled) delete a.apagado;
      else a.apagado = true;
    }
    if (changes.model !== undefined) {
      if (!(MODEL_CHOICES as readonly string[]).includes(changes.model)) return false;
      if (changes.model === DEFAULT_MODEL) delete a.modelo;
      else a.modelo = changes.model;
    }
    raw.asistente = a;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.asistente.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}
