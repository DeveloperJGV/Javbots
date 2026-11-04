import { describe, expect, it } from 'vitest';

import type { JardinPlant, JardinStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance } from '../../../../webview-ui/src/office/types.js';
import { applyJardinFurniture, thirstySprite } from '../../webview/jardinFurniture.js';
import { isJardinFurniture, jardinStore, plantOfFurniture } from '../../webview/jardinStore.js';
import {
  dayLabel,
  isThirsty,
  lateText,
  plantReview,
  supplyReview,
  todayCares,
  upcomingCares,
} from '../../webview/jardinText.js';

const TODAY = '2026-11-03';

const plant = (
  id: string,
  name: string,
  cares: JardinPlant['cares'],
  furniture?: string,
): JardinPlant => ({
  id,
  name,
  photos: [],
  cares,
  ...(furniture ? { furniture } : {}),
});
const care = (kind: 'regar' | 'abonar' | 'podar', due: string, everyDays = 7) => ({
  kind,
  everyDays,
  time: '09:00',
  due,
  synced: true,
});

function status(plants: JardinPlant[], over: Partial<JardinStatus> = {}): JardinStatus {
  return {
    type: 'jardinStatus',
    connected: true,
    today: TODAY,
    plants,
    supplies: [],
    inbox: [],
    recent: [],
    checks: [
      { id: 'calendar', label: 'Calendario', state: 'ok', detail: '' },
      { id: 'tasks', label: 'Tareas', state: 'ok', detail: '' },
    ],
    saving: false,
    defaultTime: '09:00',
    calendarName: 'Plantas',
    taskListName: 'Jardín',
    folderName: 'Jardín',
    eventPrefix: 'Jardín:',
    ...over,
  };
}

const garden = status([
  plant(
    'monstera',
    'Monstera',
    [care('regar', '2026-11-01'), care('abonar', '2026-11-20', 30)],
    'JARDIN_MONSTERA',
  ),
  plant('lavanda', 'Lavanda', [care('regar', '2026-11-03', 3), care('podar', '2026-11-05', 60)]),
]);

describe('jardin text', () => {
  it('"Hoy en el jardín": late ones first, then the ones due today; then what comes next', () => {
    expect(todayCares(garden).map((l) => [l.plant.id, l.care.kind, l.late])).toEqual([
      ['monstera', 'regar', 2],
      ['lavanda', 'regar', 0],
    ]);
    expect(upcomingCares(garden).map((l) => [l.plant.id, l.care.kind])).toEqual([
      ['lavanda', 'podar'],
    ]);
    expect(lateText(0)).toBe('hoy');
    expect(lateText(1)).toBe('atrasado 1 día');
    expect(dayLabel('2026-11-04', TODAY)).toBe('Mañana');
  });

  it('a plant is thirsty only while watering is late', () => {
    expect(isThirsty(garden.plants[0], TODAY)).toBe(true);
    expect(isThirsty(garden.plants[1], TODAY)).toBe(false);
  });

  it('the review says what goes to Google before saving', () => {
    const d5 = dayLabel('2026-11-05', TODAY).toLowerCase();
    expect(
      plantReview(
        {
          name: 'Menta',
          cares: [{ kind: 'regar', everyDays: 2, time: '07:30', last: '2026-11-03' }],
        },
        garden,
      ),
    ).toEqual([
      `Calendario "Plantas": "Jardín: regar Menta" · ${d5}, 07:30, con aviso`,
      `Tareas "Jardín": "Regar Menta" · para ${d5}`,
    ]);
    // Without the plants calendar the review says no event will be made
    const noCal = {
      ...garden,
      checks: [{ id: 'calendar', label: '', state: 'off' as const, detail: '', help: 'Créalo' }],
    };
    expect(
      plantReview({ name: 'Menta', cares: [{ kind: 'regar', everyDays: 2 }] }, noCal)[0],
    ).toContain('sin evento');
    // Editing: a care taken out is said too
    expect(
      plantReview(
        { id: 'lavanda', name: 'Lavanda', cares: [{ kind: 'regar', everyDays: 3 }] },
        garden,
      ).at(-1),
    ).toBe('Se quitan el evento y la tarea de podar Lavanda');
    expect(
      supplyReview(
        { name: 'tierra', category: 'tierra', quantity: 0, unit: 'bolsa', min: 1 },
        garden,
      ),
    ).toEqual(['Tareas "Jardín": "Comprar tierra" (está debajo del mínimo)']);
    expect(
      supplyReview(
        { name: 'tierra', category: 'tierra', quantity: 3, unit: 'bolsa', min: 1 },
        garden,
      ),
    ).toEqual([]);
  });
});

describe('jardin furniture', () => {
  it("the control pieces open the panel, and so does a plant's own furniture", () => {
    for (const t of ['JARDIN_CONTROL', 'JARDIN_SHED', 'JARDIN_TOOL_RACK', 'JARDIN_PLAQUE:off'])
      expect(isJardinFurniture(t, garden)).toBe(true);
    expect(isJardinFurniture('JARDIN_FERN', garden)).toBe(false);
    expect(isJardinFurniture('JARDIN_MONSTERA', garden)).toBe(true);
    expect(plantOfFurniture('JARDIN_MONSTERA', garden)).toBe('monstera');
    jardinStore.setStatus(garden);
    jardinStore.openFor('JARDIN_SHED');
    expect(jardinStore.get()).toMatchObject({
      open: true,
      section: 'inventario',
      focus: undefined,
    });
    jardinStore.openFor('JARDIN_MONSTERA');
    expect(jardinStore.get()).toMatchObject({ open: true, focus: 'monstera' });
    jardinStore.close();
    expect(jardinStore.get().open).toBe(false);
  });

  it('a thirsty plant goes gray and droops; the others are left alone', () => {
    const green = '#22aa33';
    const sprite = [
      [green, ''],
      [green, green],
      ['#884422', '#884422'],
      ['#884422', '#884422'],
    ];
    const dry = thirstySprite(sprite);
    expect(dry).toHaveLength(4);
    expect(dry[0]).toEqual(['', '']); // the top slid down
    const [r, g] = [parseInt(dry[1][0].slice(1, 3), 16), parseInt(dry[1][0].slice(3, 5), 16)];
    expect(g - r).toBeLessThan(0x88 - 0x22); // less green than before
    expect(sprite[0][0]).toBe(green); // the original is untouched

    const f = (type: string): FurnitureInstance => ({ sprite, x: 0, y: 0, zY: 0, type });
    const out = applyJardinFurniture([f('JARDIN_MONSTERA'), f('JARDIN_FERN')], garden);
    expect(out[0].sprite).not.toBe(sprite);
    expect(out[1].sprite).toBe(sprite);
    // Same sprite twice: drawn once (cached)
    expect(applyJardinFurniture([f('JARDIN_MONSTERA')], garden)[0].sprite).toBe(out[0].sprite);
    expect(applyJardinFurniture([f('JARDIN_MONSTERA')], undefined)[0].sprite).toBe(sprite);
  });
});
