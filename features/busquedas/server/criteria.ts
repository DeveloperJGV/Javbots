import * as fs from 'fs';
import * as path from 'path';

import type { SearchCriteriaSet } from '../../../core/src/messages.js';
import { LOG_PREFIX, MAX_CRITERIA_SETS, MAX_RULE_CHARS, MAX_RULES } from './constants.js';

/**
 * A room's criteria sets, in a file the owner can also edit by hand (Spanish keys):
 *   { "criterios": [ { "id": "tecnicos", "nombre": "Técnicos y servicios", "reglas": ["…", "…"] } ] }
 * Until something is saved, the room's defaults are used and nothing is written.
 */
export interface CriteriaStore {
  read(): SearchCriteriaSet[];
  /** Checks and writes; returns what was saved (null when nothing valid came). */
  save(sets: unknown): SearchCriteriaSet[] | null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Sets from the panel (English keys) or from the file (Spanish keys) → checked sets; unique ids. */
export function cleanCriteria(raw: unknown): SearchCriteriaSet[] {
  if (!Array.isArray(raw)) return [];
  const out: SearchCriteriaSet[] = [];
  const ids = new Set<string>();
  for (const item of raw.slice(0, MAX_CRITERIA_SETS)) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const label = String(r.label ?? r.nombre ?? '')
      .trim()
      .slice(0, 60);
    const rulesRaw = Array.isArray(r.rules) ? r.rules : Array.isArray(r.reglas) ? r.reglas : [];
    const rules = rulesRaw
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim().slice(0, MAX_RULE_CHARS))
      .filter(Boolean)
      .slice(0, MAX_RULES);
    if (!label || !rules.length) continue;
    let id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : slug(label) || 'criterios';
    for (let n = 2; ids.has(id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    ids.add(id);
    out.push({ id, label, rules });
  }
  return out;
}

export function createCriteriaStore(file: string, defaults: SearchCriteriaSet[]): CriteriaStore {
  return {
    read() {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null;
        const sets = cleanCriteria(raw?.criterios);
        if (sets.length) return sets;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
          console.warn(`${LOG_PREFIX} No pude leer ${file}:`, (err as Error).message);
      }
      return defaults;
    },
    save(sets) {
      const clean = cleanCriteria(sets);
      if (!clean.length) return null;
      let other: Record<string, unknown> = {};
      try {
        const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw))
          other = raw as Record<string, unknown>;
      } catch {
        // new file
      }
      const body = {
        ...other,
        criterios: clean.map((s) => ({ id: s.id, nombre: s.label, reglas: s.rules })),
      };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n');
      fs.renameSync(tmp, file);
      return clean;
    },
  };
}
