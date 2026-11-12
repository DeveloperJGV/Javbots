import type { JardinCareKind, JardinPlantInput } from '../../../core/src/messages.js';
import { MAX_EVERY_DAYS } from './constants.js';
import { addDays, fold, type StoredPlant } from './jardinData.js';

/**
 * Notes from the phone (or the computer), read with simple rules, no AI: a plant's name plus a care verb. Only what
 * is clear is applied; the rest goes to the inbox for the owner to sort with a click.
 */

/** Verb forms (folded: lowercase, no accents) that say a care was done. */
const DONE_VERBS: Record<JardinCareKind, readonly string[]> = {
  regar: ['regue', 'regamos', 'rego', 'regaron', 'regada', 'regado', 'regadas', 'regados'],
  abonar: ['abone', 'abonamos', 'abonaron', 'abonada', 'abonado', 'abonadas', 'abonados'],
  limpiar: ['limpie', 'limpiamos', 'limpiaron', 'limpiada', 'limpiado', 'limpiadas'],
  podar: ['pode', 'podamos', 'podo', 'podaron', 'podada', 'podado', 'podadas', 'podados'],
};
/** Verbs in the infinitive ("regar cada 7 días" in a new plant's note). */
const INFINITIVES: Record<string, JardinCareKind> = {
  regar: 'regar',
  abonar: 'abonar',
  limpiar: 'limpiar',
  podar: 'podar',
};
/** Words that make a line unclear on purpose ("no regué", "¿regué?", "mañana riego"). */
const DOUBT = [
  'no',
  'nunca',
  'falta',
  'faltan',
  'manana',
  'luego',
  'despues',
  'tengo',
  'hay',
  'debo',
  'toca',
];

export type NoteLine =
  | { kind: 'care'; plantIds: string[]; care: JardinCareKind; day: string; text: string }
  | { kind: 'newPlant'; plant: JardinPlantInput; text: string }
  | { kind: 'unclear'; text: string; why: string };

const words = (s: string): string[] => fold(s).split(' ').filter(Boolean);

/**
 * The plants a text names (whole words, by name or species). A mention inside a longer one of another plant doesn't
 * count: with "Lavanda" and "Lavanda joven", "la lavanda joven" names only the second, and "la lavanda y la lavanda
 * joven" names both.
 */
export function plantsNamed(text: string, plants: readonly StoredPlant[]): StoredPlant[] {
  const t = ` ${fold(text)} `;
  const found: Array<{ plant: StoredPlant; start: number; end: number }> = [];
  for (const plant of plants) {
    for (const n of [plant.name, plant.species]) {
      const f = n ? fold(n) : '';
      if (!f) continue;
      for (let i = t.indexOf(` ${f} `); i !== -1; i = t.indexOf(` ${f} `, i + 1))
        found.push({ plant, start: i + 1, end: i + 1 + f.length });
    }
  }
  const inLonger = (m: (typeof found)[number]) =>
    found.some(
      (o) =>
        o.plant !== m.plant &&
        o.start <= m.start &&
        m.end <= o.end &&
        o.end - o.start > m.end - m.start,
    );
  const named = new Set(found.filter((m) => !inLonger(m)).map((m) => m.plant));
  return plants.filter((p) => named.has(p));
}

/** "nueva planta: lavanda (Lavandula), en la maceta azul; regar cada 3 días" → a plant to review. */
export function readNewPlantLine(line: string, defaultTime: string): JardinPlantInput | null {
  const m = /^\s*nueva\s+planta\s*:\s*(.+)$/i.exec(line);
  if (!m) return null;
  const [head, ...rest] = m[1].split(';');
  const species = /\(([^)]+)\)/.exec(head)?.[1]?.trim();
  const noParens = head.replace(/\([^)]*\)/g, '');
  const [name, ...where] = noParens.split(',');
  const placeText = where.join(',').trim();
  const plant: JardinPlantInput = { name: name.trim(), cares: [] };
  if (!plant.name) return null;
  if (species) plant.species = species;
  if (placeText) plant.place = placeText.replace(/^en\s+/i, '').trim();
  for (const part of rest) {
    const w = words(part);
    const care = INFINITIVES[w[0] ?? ''];
    const cada = w.indexOf('cada');
    if (!care || cada === -1) continue;
    const n = w[cada + 1] === 'dia' ? 1 : Number(w[cada + 1]);
    if (!Number.isInteger(n) || n < 1 || n > MAX_EVERY_DAYS) continue;
    const time = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(part);
    plant.cares.push({
      kind: care,
      everyDays: n,
      time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : defaultTime,
    });
  }
  return plant;
}

/**
 * One line of a note. `day` is the day the note was written (its file's date): "ayer" moves it a day back.
 * Clear = exactly one care verb, at least one known plant that has that care, and no word of doubt.
 */
export function readNoteLine(
  line: string,
  plants: readonly StoredPlant[],
  day: string,
  defaultTime: string,
): NoteLine | null {
  const text = line.trim();
  if (!text) return null;
  const plant = readNewPlantLine(text, defaultTime);
  if (plant) return { kind: 'newPlant', plant, text };
  if (text.includes('?')) return { kind: 'unclear', text, why: 'Es una pregunta.' };
  const w = words(text);
  const cares = (Object.keys(DONE_VERBS) as JardinCareKind[]).filter((k) =>
    DONE_VERBS[k].some((v) => w.includes(v)),
  );
  if (cares.length === 0) return { kind: 'unclear', text, why: 'No dice qué cuidado se hizo.' };
  if (cares.length > 1) return { kind: 'unclear', text, why: 'Dice más de un cuidado.' };
  if (w.some((x) => DOUBT.includes(x)))
    return { kind: 'unclear', text, why: 'No queda claro que ya se hizo.' };
  const named = plantsNamed(text, plants);
  if (named.length === 0) return { kind: 'unclear', text, why: 'No sé de qué planta es.' };
  const care = cares[0];
  const without = named.filter((p) => !p.cares.some((c) => c.kind === care));
  if (without.length)
    return {
      kind: 'unclear',
      text,
      why: `${without.map((p) => p.name).join(', ')} no tiene "${care}" entre sus cuidados.`,
    };
  return {
    kind: 'care',
    plantIds: named.map((p) => p.id),
    care,
    day: w.includes('ayer') ? addDays(day, -1) : day,
    text,
  };
}

/** A whole note, line by line. */
export function readNote(
  body: string,
  plants: readonly StoredPlant[],
  day: string,
  defaultTime: string,
): NoteLine[] {
  return body
    .split(/\r?\n/)
    .map((l) => readNoteLine(l, plants, day, defaultTime))
    .filter((l): l is NoteLine => l !== null);
}

/** The one plant a photo's file name names ("monstera 2026-11-03.jpg"), or null when it's none or several. */
export function plantOfPhoto(fileName: string, plants: readonly StoredPlant[]): StoredPlant | null {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
  const named = plantsNamed(base, plants);
  return named.length === 1 ? named[0] : null;
}
