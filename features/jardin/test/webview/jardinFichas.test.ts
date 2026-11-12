import { describe, expect, it } from 'vitest';

import type { JardinPlant } from '../../../../core/src/messages.js';
import {
  filterPlants,
  foldText,
  matchesSearch,
  NO_PLACE,
  photoDate,
  placeCounts,
  shortPlace,
} from '../../webview/jardinFichas.js';

const plant = (id: string, name: string, extra: Partial<JardinPlant> = {}): JardinPlant => ({
  id,
  name,
  photos: [],
  cares: [],
  ...extra,
});

const PLANTS: JardinPlant[] = [
  plant('monstera', 'Monstera', {
    species: 'Monstera deliciosa',
    place: 'Invernadero, nivel de arriba (temporal)',
    notes: 'Hojas grandes; le gusta la luz indirecta.',
  }),
  plant('lavanda', 'Lavanda', {
    species: 'Lavandula angustifolia',
    place: 'Patio techado, junto a la pared (maceta terracota)',
  }),
  plant('romero', 'Romero', { place: 'Invernadero, nivel con triplay' }),
  plant('helecho', 'Helecho', { notes: 'Pide riego frecuente en el jardín.' }),
  plant('menta', 'Menta', { place: 'Patio lateral (el del fondo), en la jardinera' }),
];

describe('shortPlace', () => {
  it('keeps what comes before the first comma', () => {
    expect(shortPlace('Invernadero, nivel con triplay')).toBe('Invernadero');
  });
  it('drops anything in parentheses, even before the comma', () => {
    expect(shortPlace('Patio lateral (el del fondo), junto a la pared')).toBe('Patio lateral');
  });
  it('ignores commas inside parentheses', () => {
    expect(shortPlace('Balcón (sol, viento), maceta roja')).toBe('Balcón');
  });
  it('drops an unclosed parenthesis to the end', () => {
    expect(shortPlace('Cocina (junto a la ventana')).toBe('Cocina');
  });
  it('takes the whole text when there is no comma', () => {
    expect(shortPlace('Balcón')).toBe('Balcón');
  });
  it('gives "Sin lugar" for an empty or missing place', () => {
    expect(shortPlace(undefined)).toBe(NO_PLACE);
    expect(shortPlace('   ')).toBe(NO_PLACE);
    expect(shortPlace('(sin decidir)')).toBe(NO_PLACE);
  });
});

describe('photoDate', () => {
  it('reads the date at the start of the file name', () => {
    expect(photoDate('2026-11-10-monstera.jpg')).toBe('10 nov 2026');
    expect(photoDate('2026-01-03-lavanda-2.jpg')).toBe('3 ene 2026');
  });
  it('gives nothing when the name has no date', () => {
    expect(photoDate('monstera.jpg')).toBeNull();
    expect(photoDate('foto-2026-11-10.jpg')).toBeNull();
    expect(photoDate('20261110-monstera.jpg')).toBeNull();
  });
  it('gives nothing for a date that does not exist', () => {
    expect(photoDate('2026-02-30-monstera.jpg')).toBeNull();
    expect(photoDate('2026-13-01-monstera.jpg')).toBeNull();
  });
});

describe('search', () => {
  it('folds accents and case', () => {
    expect(foldText('Jardín BALCÓN Piñón')).toBe('jardin balcon pinon');
  });
  it('finds by name, species, place and notes, without accents or case', () => {
    expect(matchesSearch(PLANTS[0], 'MONSTERA')).toBe(true);
    expect(matchesSearch(PLANTS[1], 'angustifolia')).toBe(true);
    expect(matchesSearch(PLANTS[1], 'terracota')).toBe(true);
    expect(matchesSearch(PLANTS[3], 'jardin')).toBe(true);
    expect(matchesSearch(PLANTS[0], 'indirécta')).toBe(true);
  });
  it('needs every word, in any field', () => {
    expect(matchesSearch(PLANTS[0], 'invernadero hojas')).toBe(true);
    expect(matchesSearch(PLANTS[0], 'invernadero cactus')).toBe(false);
  });
  it('lets everything through an empty search', () => {
    expect(matchesSearch(PLANTS[2], '   ')).toBe(true);
  });
});

describe('places', () => {
  it('counts the short places, most plants first and "Sin lugar" last', () => {
    expect(placeCounts(PLANTS)).toEqual([
      { place: 'Invernadero', count: 2 },
      { place: 'Patio lateral', count: 1 },
      { place: 'Patio techado', count: 1 },
      { place: NO_PLACE, count: 1 },
    ]);
  });
  it('filters by place and search together', () => {
    expect(filterPlants(PLANTS, '', 'Invernadero').map((p) => p.id)).toEqual([
      'monstera',
      'romero',
    ]);
    expect(filterPlants(PLANTS, 'romero', 'Invernadero').map((p) => p.id)).toEqual(['romero']);
    expect(filterPlants(PLANTS, '', NO_PLACE).map((p) => p.id)).toEqual(['helecho']);
    expect(filterPlants(PLANTS, 'cactus', null)).toEqual([]);
    expect(filterPlants(PLANTS, '', null)).toHaveLength(PLANTS.length);
  });
});
