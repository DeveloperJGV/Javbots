import * as fs from 'fs';
import * as path from 'path';

import type { PerfilProfile, PerfilTrait } from '../../../core/src/messages.js';
import { SERVER_JSON_DIR } from '../../../server/src/constants.js';
import { PERFIL_FILE, PERFIL_MAX_FACTS, PERFIL_MAX_TEXT, PERFIL_MAX_TRAITS } from './constants.js';

export const perfilPath = (home: string): string => path.join(home, SERVER_JSON_DIR, PERFIL_FILE);

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, PERFIL_MAX_TEXT) : undefined;

function trait(v: unknown): PerfilTrait | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const letter = text(o.letter);
  const name = text(o.name);
  const percent =
    typeof o.percent === 'number' && Number.isFinite(o.percent) ? Math.round(o.percent) : NaN;
  if (!letter || !name || !(percent >= 0 && percent <= 100)) return null;
  return { letter, name, percent };
}

/** The profile from a parsed file, or null when it lacks a code, a name or any valid trait. Extra fields are dropped. */
export function parsePerfil(raw: unknown): PerfilProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const code = text(o.code);
  const name = text(o.name);
  const traits = (Array.isArray(o.traits) ? o.traits : [])
    .map(trait)
    .filter((t): t is PerfilTrait => t !== null)
    .slice(0, PERFIL_MAX_TRAITS);
  if (!code || !name || traits.length === 0) return null;
  const profile: PerfilProfile = { code, name, traits };
  const role = text(o.role);
  const strategy = text(o.strategy);
  const source = text(o.source);
  const date = text(o.date);
  const facts = (Array.isArray(o.facts) ? o.facts : [])
    .map(text)
    .filter((f): f is string => f !== undefined)
    .slice(0, PERFIL_MAX_FACTS);
  if (role) profile.role = role;
  if (strategy) profile.strategy = strategy;
  if (facts.length) profile.facts = facts;
  if (source) profile.source = source;
  if (date) profile.date = date;
  return profile;
}

/** Read ~/.pixel-agents/perfil.json; null when it is missing or not a valid profile. Never throws. */
export function readPerfil(home: string): PerfilProfile | null {
  try {
    return parsePerfil(JSON.parse(fs.readFileSync(perfilPath(home), 'utf-8')));
  } catch {
    return null;
  }
}
