import type { JardinPlant } from '../../../core/src/messages.js';

/** The label for plants with no place written down. */
export const NO_PLACE = 'Sin lugar';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * The short place of a plant: what comes before the first comma, without anything in parentheses.
 * "Patio (el de atrás), junto a la pared" → "Patio". Empty → "Sin lugar".
 */
export function shortPlace(place: string | undefined): string {
  const plain = (place ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\(.*$/, ' ')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  return plain || NO_PLACE;
}

/** The day a photo was taken, from its file name (AAAA-MM-DD-...), as "10 nov 2026"; null when the name has none. */
export function photoDate(name: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[-_.]|$)/.exec(name);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d)
    return null;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}

/** Lower case and without accents, so "jardín" and "JARDIN" match. */
export const foldText = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Whether a plant matches the search: every word must appear in its name, species, place or notes. */
export function matchesSearch(plant: JardinPlant, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldText(
    [plant.name, plant.species, plant.place, plant.notes].filter(Boolean).join(' '),
  );
  return words.every((w) => hay.includes(w));
}

/** The short places with how many plants each has: most plants first, "Sin lugar" last. */
export function placeCounts(plants: readonly JardinPlant[]): { place: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of plants) {
    const k = shortPlace(p.place);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .map(([place, count]) => ({ place, count }))
    .sort(
      (a, b) =>
        Number(a.place === NO_PLACE) - Number(b.place === NO_PLACE) ||
        b.count - a.count ||
        a.place.localeCompare(b.place, 'es'),
    );
}

/** The plants that pass the search and the place button (null = every place). */
export function filterPlants(
  plants: readonly JardinPlant[],
  query: string,
  place: string | null,
): JardinPlant[] {
  return plants.filter(
    (p) => (place === null || shortPlace(p.place) === place) && matchesSearch(p, query),
  );
}
