import { describe, expect, it } from 'vitest';

import type { JardinCare, JardinPlant, JardinSupply } from '../../../../core/src/messages.js';
import {
  groupSupplies,
  HOY_NADA,
  HOY_SIN_CUIDADOS,
  HOY_SIN_PLANTAS,
  hoySummary,
  supplyMark,
  supplyMinText,
} from '../../webview/jardinResumen.js';

const TODAY = '2026-11-03';

const supply = (
  id: string,
  name: string,
  category: JardinSupply['category'],
  quantity: number,
  min = 0,
): JardinSupply => ({ id, name, category, quantity, unit: 'pza', min, buying: false });

const care = (due: string): JardinCare => ({
  kind: 'regar',
  everyDays: 7,
  time: '09:00',
  due,
  synced: true,
});

const plant = (id: string, name: string, cares: JardinCare[] = []): JardinPlant => ({
  id,
  name,
  photos: [],
  cares,
});

describe('supplyMark', () => {
  it('says "se acabó" at zero, even with no minimum', () => {
    expect(supplyMark({ quantity: 0, min: 0 })).toBe('acabado');
    expect(supplyMark({ quantity: 0, min: 2 })).toBe('acabado');
  });

  it('says "falta" only under the minimum', () => {
    expect(supplyMark({ quantity: 1, min: 2 })).toBe('falta');
    expect(supplyMark({ quantity: 2, min: 2 })).toBeNull();
    expect(supplyMark({ quantity: 3, min: 0 })).toBeNull();
  });
});

describe('supplyMinText', () => {
  it('hides a minimum of 0', () => {
    expect(supplyMinText({ min: 0 })).toBeNull();
    expect(supplyMinText({ min: 2 })).toBe('mínimo 2');
  });
});

describe('groupSupplies', () => {
  it('groups in the usual order, sorted by name, without empty categories', () => {
    const groups = groupSupplies([
      supply('tijeras', 'Tijeras', 'herramienta', 1),
      supply('lavanda', 'Lavanda', 'planta', 2),
      supply('composta', 'Composta', 'abono', 1),
      supply('guantes', 'guantes', 'herramienta', 2),
    ]);
    expect(groups.map((g) => [g.label, g.supplies.map((s) => s.name)])).toEqual([
      ['Planta', ['Lavanda']],
      ['Herramienta', ['guantes', 'Tijeras']],
      ['Abono', ['Composta']],
    ]);
  });

  it('gives nothing for no supplies', () => {
    expect(groupSupplies([])).toEqual([]);
  });

  it('does not reorder the list it gets', () => {
    const list = [
      supply('b', 'Tijeras', 'herramienta', 1),
      supply('a', 'Azadón', 'herramienta', 1),
    ];
    groupSupplies(list);
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('hoySummary', () => {
  it('tells the truth when no plant has cares', () => {
    const s = hoySummary({ today: TODAY, plants: [plant('m', 'Monstera'), plant('l', 'Lavanda')] });
    expect(s).toEqual({ empty: HOY_SIN_CUIDADOS, noCaresAtAll: true, withoutCares: null });
  });

  it('says there are no plants yet', () => {
    expect(hoySummary({ today: TODAY, plants: [] })).toEqual({
      empty: HOY_SIN_PLANTAS,
      noCaresAtAll: false,
      withoutCares: null,
    });
  });

  it('keeps "Nada pendiente hoy." when cares exist but none is due', () => {
    const s = hoySummary({ today: TODAY, plants: [plant('m', 'Monstera', [care('2026-11-05')])] });
    expect(s).toEqual({ empty: HOY_NADA, noCaresAtAll: false, withoutCares: null });
  });

  it('counts the plants without cares when others have some', () => {
    const s = hoySummary({
      today: TODAY,
      plants: [plant('m', 'Monstera', [care(TODAY)]), plant('l', 'Lavanda'), plant('r', 'Romero')],
    });
    expect(s).toEqual({
      empty: null,
      noCaresAtAll: false,
      withoutCares: '2 plantas sin cuidados programados',
    });
  });

  it('says "planta" for one', () => {
    const s = hoySummary({
      today: TODAY,
      plants: [plant('m', 'Monstera', [care('2026-11-05')]), plant('l', 'Lavanda')],
    });
    expect(s.withoutCares).toBe('1 planta sin cuidados programados');
    expect(s.empty).toBe(HOY_NADA);
  });
});
