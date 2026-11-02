import { describe, expect, it } from 'vitest';

import { byCategory, storedItems } from '../../webview/storedItems.js';

const catalog = [
  { type: 'DESK_FRONT', label: 'Escritorio', category: 'desks' },
  { type: 'PLANT', label: 'Planta', category: 'decor' },
  { type: 'CAKE', label: 'Pastel', category: 'misc' },
  { type: 'LAMP_OFF', label: 'Lámpara', category: 'decor' },
];

const families: Record<string, string[]> = {
  DESK_FRONT: ['DESK_FRONT', 'DESK_SIDE'],
  DESK_SIDE: ['DESK_FRONT', 'DESK_SIDE'],
  LAMP_OFF: ['LAMP_OFF', 'LAMP_ON'],
  LAMP_ON: ['LAMP_OFF', 'LAMP_ON'],
};
const familyOf = (type: string): string[] => families[type] ?? [type];

describe('bodega: storedItems', () => {
  it('keeps every piece that is not placed, sorted by name', () => {
    const stored = storedItems(catalog, ['PLANT'], familyOf);
    expect(stored.map((e) => e.type)).toEqual(['DESK_FRONT', 'LAMP_OFF', 'CAKE']);
  });

  it('a placed rotation or on-state takes the whole piece out of storage', () => {
    const stored = storedItems(catalog, ['DESK_SIDE', 'LAMP_ON'], familyOf);
    expect(stored.map((e) => e.type)).toEqual(['CAKE', 'PLANT']);
  });

  it('a colorized copy (type:suffix) counts as its piece', () => {
    const stored = storedItems(catalog, ['CAKE:h20s10'], familyOf);
    expect(stored.map((e) => e.type)).not.toContain('CAKE');
  });

  it('hidden types never show', () => {
    const stored = storedItems(catalog, [], familyOf, new Set(['CAKE']));
    expect(stored.map((e) => e.type)).not.toContain('CAKE');
  });

  it('groups by category in the given order, unknown ones last', () => {
    const groups = byCategory(
      [...catalog, { type: 'X', label: 'X', category: 'weird' }],
      ['decor', 'desks', 'misc'],
    );
    expect(groups.map((g) => g.category)).toEqual(['decor', 'desks', 'misc', 'weird']);
    expect(groups[0].items).toHaveLength(2);
  });
});
