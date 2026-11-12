import type {
  JardinCare,
  JardinCareKind,
  JardinPlant,
  JardinPlantInput,
  JardinStatus,
} from '../../../core/src/messages.js';
import { CARE_DEFAULT_DAYS, CARE_LABEL, CARE_ORDER } from './constants.js';

/**
 * When a care starts: the form never guesses it. For a new care the owner picks one of three answers (none is picked
 * at first); a care that already exists shows what it has and can be changed. The server applies the same rule
 * (`careStart` in features/jardin/server/jardinData.ts).
 */
export type CareWhen = '' | 'hoy' | 'hecho' | 'hasta';

export interface CareStart {
  when: CareWhen;
  /** "Ya se hizo el día…" (today or before). */
  last: string;
  /** "Toca hasta el día…" (today or later). */
  first: string;
}

/** What a care shows when the form opens: nothing picked (new), or what it has (existing). */
export function startOf(
  care: Pick<JardinCare, 'last' | 'due'> | undefined,
  today: string,
): CareStart {
  if (!care) return { when: '', last: '', first: '' };
  if (care.last) return { when: 'hecho', last: care.last, first: '' };
  if (care.due === today) return { when: 'hoy', last: '', first: '' };
  return { when: 'hasta', last: '', first: care.due };
}

const same = (a: CareStart, b: CareStart): boolean =>
  a.when === b.when &&
  (a.when !== 'hecho' || a.last === b.last) &&
  (a.when !== 'hasta' || a.first === b.first);

/** Why this answer can't be saved yet, or null when it can. An existing care left as it was is always fine. */
export function startProblem(
  start: CareStart,
  orig: CareStart | undefined,
  today: string,
): 'falta' | 'futuro' | 'pasado' | null {
  if (orig && same(start, orig)) return null;
  if (start.when === '') return 'falta';
  if (start.when === 'hecho') return !start.last ? 'falta' : start.last > today ? 'futuro' : null;
  if (start.when === 'hasta') return !start.first ? 'falta' : start.first < today ? 'pasado' : null;
  return null;
}

/** What the form sends for it: nothing for an existing care left as it was (the server keeps it). */
export function startFields(
  start: CareStart,
  orig: CareStart | undefined,
  today: string,
): { last?: string; first?: string } {
  if (orig && same(start, orig)) return {};
  if (start.when === 'hecho') return { last: start.last };
  if (start.when === 'hasta') return { first: start.first };
  return { first: today };
}

const verb = (k: JardinCareKind) => CARE_LABEL[k].toLowerCase();

/** What's missing or wrong in the cares' first days, said in one line (null: nothing). */
export function startsMessage(
  cares: ReadonlyArray<{ kind: JardinCareKind; start: CareStart; orig?: CareStart }>,
  today: string,
): string | null {
  const by = { falta: [] as string[], futuro: [] as string[], pasado: [] as string[] };
  for (const c of cares) {
    const p = startProblem(c.start, c.orig, today);
    if (p) by[p].push(verb(c.kind));
  }
  const parts: string[] = [];
  if (by.falta.length) parts.push(`Falta decir cuándo toca la primera vez: ${by.falta.join(', ')}`);
  if (by.futuro.length)
    parts.push(`"Ya se hizo" no puede ser después de hoy: ${by.futuro.join(', ')}`);
  if (by.pasado.length)
    parts.push(`"Toca hasta" no puede ser antes de hoy: ${by.pasado.join(', ')}`);
  return parts.length ? parts.join('. ') : null;
}

/** One care in the plant form. */
export interface CareDraft {
  on: boolean;
  everyDays: string;
  time: string;
  /** When it's due the first time (new: nothing picked) or next (existing: what it has). */
  start: CareStart;
  /** What an existing care had when the form opened (absent: the care is new). */
  orig?: CareStart;
}

/**
 * The cares the plant form opens with. Only a care the saved plant already has is "existing" (it shows what it has);
 * the rest, including every care of a new plant from the phone, start with nothing picked.
 */
export function formCares(
  start: JardinPlant | JardinPlantInput | undefined,
  status: Pick<JardinStatus, 'plants' | 'today' | 'defaultTime'>,
): Record<JardinCareKind, CareDraft> {
  const id = start && 'id' in start ? start.id : undefined;
  const saved = id ? status.plants.find((p) => p.id === id) : undefined;
  const out = {} as Record<JardinCareKind, CareDraft>;
  for (const k of CARE_ORDER) {
    const had = saved?.cares.find((c) => c.kind === k);
    const from = start?.cares.find((c) => c.kind === k);
    out[k] = {
      on: start ? !!from : k === 'regar',
      everyDays: String(from?.everyDays ?? CARE_DEFAULT_DAYS[k]),
      time: from?.time ?? status.defaultTime,
      start: startOf(had, status.today),
      ...(had ? { orig: startOf(had, status.today) } : {}),
    };
  }
  return out;
}
