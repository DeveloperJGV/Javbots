import { describe, expect, it } from 'vitest';

import type { JardinCare, JardinPlant, JardinStatus } from '../../../../core/src/messages.js';
import { careStart, dueDay } from '../../server/jardinData.js';
import {
  type CareStart,
  formCares,
  startFields,
  startOf,
  startProblem,
  startsMessage,
} from '../../webview/jardinCuidados.js';
import { avisoDay, draftDue, plantReview } from '../../webview/jardinText.js';

const TODAY = '2026-11-03';
const NONE: CareStart = { when: '', last: '', first: '' };

const care = (kind: JardinCare['kind'], due: string, last?: string): JardinCare => ({
  kind,
  everyDays: 365,
  time: '09:00',
  due,
  synced: true,
  ...(last ? { last } : {}),
});

function status(plants: JardinPlant[]): JardinStatus {
  return {
    type: 'jardinStatus',
    connected: true,
    today: TODAY,
    plants,
    supplies: [],
    inbox: [],
    recent: [],
    checks: [{ id: 'calendar', label: 'Calendario', state: 'ok', detail: '' }],
    saving: false,
    defaultTime: '09:00',
    calendarName: 'Plantas',
    taskListName: 'Jardín',
    folderName: 'Jardín',
    eventPrefix: 'Jardín:',
  };
}

describe('when a care starts (the form)', () => {
  it('a new care has nothing picked, and the form says which ones are missing', () => {
    expect(startOf(undefined, TODAY)).toEqual(NONE);
    expect(
      startsMessage(
        [
          { kind: 'regar', start: NONE },
          { kind: 'abonar', start: { when: 'hoy', last: '', first: '' } },
          { kind: 'podar', start: NONE },
        ],
        TODAY,
      ),
    ).toBe('Falta decir cuándo toca la primera vez: regar, podar');
    // Picking "ya se hizo" without its day is still missing
    expect(startProblem({ when: 'hecho', last: '', first: '' }, undefined, TODAY)).toBe('falta');
  });

  it('impossible days are refused: "ya se hizo" in the future, "toca hasta" in the past', () => {
    const futuro = { when: 'hecho', last: '2026-11-04', first: '' } as const;
    const pasado = { when: 'hasta', last: '', first: '2026-11-02' } as const;
    expect(startProblem(futuro, undefined, TODAY)).toBe('futuro');
    expect(startProblem(pasado, undefined, TODAY)).toBe('pasado');
    expect(
      startsMessage(
        [
          { kind: 'regar', start: futuro },
          { kind: 'podar', start: pasado },
        ],
        TODAY,
      ),
    ).toBe(
      '"Ya se hizo" no puede ser después de hoy: regar. "Toca hasta" no puede ser antes de hoy: podar',
    );
    // Today is fine for both
    expect(startProblem({ when: 'hecho', last: TODAY, first: '' }, undefined, TODAY)).toBeNull();
    expect(startProblem({ when: 'hasta', last: '', first: TODAY }, undefined, TODAY)).toBeNull();
  });

  it('the three answers become what the server reads', () => {
    expect(startFields({ when: 'hoy', last: '', first: '' }, undefined, TODAY)).toEqual({
      first: TODAY,
    });
    expect(startFields({ when: 'hecho', last: '2026-10-01', first: '' }, undefined, TODAY)).toEqual(
      { last: '2026-10-01' },
    );
    expect(startFields({ when: 'hasta', last: '', first: '2027-02-15' }, undefined, TODAY)).toEqual(
      { first: '2027-02-15' },
    );
  });

  it('an existing care shows what it has; left as it was (even late) it sends nothing and is not blocked', () => {
    expect(startOf(care('regar', '2026-11-10', '2026-11-03'), TODAY)).toEqual({
      when: 'hecho',
      last: '2026-11-03',
      first: '',
    });
    expect(startOf(care('podar', TODAY), TODAY)).toEqual({ when: 'hoy', last: '', first: '' });
    const late = startOf(care('podar', '2026-10-01'), TODAY);
    expect(late).toEqual({ when: 'hasta', last: '', first: '2026-10-01' });
    expect(startProblem(late, late, TODAY)).toBeNull();
    expect(startFields(late, late, TODAY)).toEqual({});
    // Changed to another past day, it's a new choice and is refused
    expect(startProblem({ ...late, first: '2026-10-02' }, late, TODAY)).toBe('pasado');
  });
});

describe('the page counts the due day like the server', () => {
  it('same day as careStart + dueDay, for every answer, new or existing', () => {
    const before = { everyDays: 365, last: undefined as string | undefined, first: '2026-10-01' };
    const cases: Array<{
      input: { everyDays: number; last?: string; first?: string };
      old?: { everyDays: number; last?: string; first?: string };
    }> = [
      { input: { everyDays: 365 } },
      { input: { everyDays: 365, first: TODAY } },
      { input: { everyDays: 365, first: '2027-02-15' } },
      { input: { everyDays: 365, first: '2026-02-01' } },
      { input: { everyDays: 365, last: '2026-10-01' } },
      { input: { everyDays: 365, last: '2026-12-01' } },
      { input: { everyDays: 30 }, old: { everyDays: 365, last: '2026-10-20' } },
      { input: { everyDays: 30 }, old: before },
      { input: { everyDays: 30, first: '2026-10-01' }, old: before },
      { input: { everyDays: 30, first: '2026-12-24' }, old: before },
    ];
    for (const { input, old } of cases) {
      const server = dueDay(
        { everyDays: input.everyDays, ...careStart(input, old, TODAY) },
        '2026-01-10',
      );
      const page = draftDue(
        input,
        old ? { last: old.last, due: dueDay(old, '2026-01-10') } : undefined,
        TODAY,
      );
      expect(page, JSON.stringify({ input, old })).toBe(server);
    }
  });

  it('the review says each first reminder with its day', () => {
    expect(avisoDay(TODAY, TODAY)).toBe('hoy');
    expect(avisoDay('2026-11-04', TODAY)).toBe('mañana');
    expect(avisoDay('2027-02-15', TODAY)).toBe('15 feb 2027');
    const lines = plantReview(
      {
        name: 'Lavanda',
        cares: [
          { kind: 'regar', everyDays: 3, first: TODAY },
          { kind: 'podar', everyDays: 365, first: '2027-02-15' },
        ],
      },
      status([]),
    );
    expect(lines.filter((l) => l.includes('aviso de'))).toEqual([
      'Primer aviso de regar: hoy',
      'Primer aviso de podar: 15 feb 2027',
    ]);
    // An existing care says its next one
    const edit = plantReview(
      { id: 'lavanda', name: 'Lavanda', cares: [{ kind: 'podar', everyDays: 365 }] },
      status([
        { id: 'lavanda', name: 'Lavanda', photos: [], cares: [care('podar', '2027-02-15')] },
      ]),
    );
    expect(edit[0]).toBe('Próximo aviso de podar: 15 feb 2027');
  });
});

describe('the form opens asking, also for a plant from the phone', () => {
  it('a new plant from the phone ("nueva planta: …; podar cada 365 días") has its cares on, nothing picked', () => {
    const fromPhone = {
      name: 'Lavanda',
      cares: [
        { kind: 'regar' as const, everyDays: 3, time: '08:00' },
        { kind: 'podar' as const, everyDays: 365, time: '09:00' },
      ],
    };
    // Even with a saved plant of the same name: a plant from the inbox has no id, so it is new
    const cares = formCares(
      fromPhone,
      status([{ id: 'lavanda', name: 'Lavanda', photos: [], cares: [care('podar', TODAY)] }]),
    );
    expect(cares.regar).toMatchObject({ on: true, everyDays: '3', time: '08:00', start: NONE });
    expect(cares.podar).toMatchObject({ on: true, everyDays: '365', start: NONE });
    expect(cares.podar.orig).toBeUndefined();
    expect(cares.abonar.on).toBe(false);
    const on = (['regar', 'abonar', 'limpiar', 'podar'] as const)
      .filter((k) => cares[k].on)
      .map((k) => ({ kind: k, ...cares[k] }));
    expect(startsMessage(on, TODAY)).toBe('Falta decir cuándo toca la primera vez: regar, podar');
  });

  it('editing a saved plant: its cares show what they have, a care turned on is new', () => {
    const lavanda: JardinPlant = {
      id: 'lavanda',
      name: 'Lavanda',
      photos: [],
      cares: [care('podar', '2027-02-15')],
    };
    const cares = formCares(lavanda, status([lavanda]));
    expect(cares.podar).toMatchObject({
      on: true,
      start: { when: 'hasta', first: '2027-02-15' },
      orig: { when: 'hasta', first: '2027-02-15' },
    });
    expect(cares.regar).toMatchObject({ on: false, start: NONE });
    expect(cares.regar.orig).toBeUndefined();
    // A brand-new plant: watering on by default, nothing picked
    expect(formCares(undefined, status([])).regar).toMatchObject({ on: true, start: NONE });
  });
});
