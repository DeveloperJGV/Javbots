// What the storage room holds: every piece of furniture that exists and is not in the office.
// Nothing is saved: deleting a piece in the editor stores it, placing it takes it out.

export interface StorableEntry {
  type: string;
  label: string;
  category?: string;
}

/** Every variant that counts as "the same piece" (its rotations, its on/off state). */
export type FamilyOf = (type: string) => readonly string[];

/** Placed types carry a suffix after ':' for colorized copies; the piece is the part before it. */
export const baseType = (type: string): string => type.split(':')[0];

/** The catalog entries with no member of their family placed, sorted by label. */
export function storedItems<T extends StorableEntry>(
  catalog: readonly T[],
  placedTypes: readonly string[],
  familyOf: FamilyOf,
  hidden: ReadonlySet<string> = new Set(),
): T[] {
  const placed = new Set<string>();
  for (const type of placedTypes) {
    const base = baseType(type);
    placed.add(base);
    for (const member of familyOf(base)) placed.add(member);
  }
  return catalog
    .filter((e) => !hidden.has(e.type) && !placed.has(e.type))
    .filter((e) => !familyOf(e.type).some((m) => placed.has(m)))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/** Groups entries by category, keeping the given category order (unknown categories go last). */
export function byCategory<T extends StorableEntry>(
  entries: readonly T[],
  order: readonly string[],
): Array<{ category: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const key = e.category ?? 'misc';
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }
  const rank = (c: string): number => {
    const i = order.indexOf(c);
    return i === -1 ? order.length : i;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, items]) => ({ category, items }));
}
