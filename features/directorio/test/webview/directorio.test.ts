import { describe, expect, it } from 'vitest';

import type { SearchResult, SearchRoomStatus } from '../../../../core/src/messages.js';
import { SearchRoomStore } from '../../../busquedas/webview/searchRoomStore.js';
import { ratingText, resultsInOrder, telHref } from '../../../busquedas/webview/searchText.js';
import { isDirectorioFurniture } from '../../webview/directorioStore.js';
import { scheduleSummary, todayLocal } from '../../webview/directorioText.js';

const r = (over: Partial<SearchResult>): SearchResult => ({
  id: over.name ?? 'x',
  name: 'x',
  kind: 'otro',
  why: '',
  score: 50,
  verdict: 'recomendado',
  ...over,
});

describe('Directorio en la página', () => {
  it('ordena: recomendados por puntuación, luego los del agente descartados, al final los que él descartó', () => {
    const out = resultsInOrder([
      r({ name: 'descartado-agente', verdict: 'descartado', score: 99 }),
      r({ name: 'bajo', score: 40 }),
      r({ name: 'descartado-dueno', score: 95, mark: 'descartado' }),
      r({ name: 'alto', score: 90 }),
    ]);
    expect(out.map((x) => x.name)).toEqual([
      'alto',
      'bajo',
      'descartado-agente',
      'descartado-dueno',
    ]);
  });

  it('escribe calificación, reseñas y teléfono', () => {
    expect(ratingText({ rating: 4.6, reviews: 312 })).toBe('★ 4.6 (312 reseñas)');
    expect(ratingText({ reviews: 1 })).toBe('(1 reseña)');
    expect(ratingText({})).toBe('');
    expect(telHref('33 1234-5678')).toBe('tel:3312345678');
  });

  it('resume la cita antes de agregarla', () => {
    expect(
      scheduleSummary(
        { title: 'Servicio: Taller', date: '2026-11-05', time: '10:00' },
        '2026-11-03',
      ),
    ).toBe('Servicio: Taller · jueves 5 de noviembre, 10:00');
    expect(scheduleSummary({ title: 'Servicio: Taller', date: '2026-11-03' }, '2026-11-03')).toBe(
      'Servicio: Taller · hoy, martes 3 de noviembre, todo el día',
    );
    expect(todayLocal(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('el store solo acepta el estado de su cuarto, y reconoce sus muebles', () => {
    const store = new SearchRoomStore('directorio');
    const status = (room: string): SearchRoomStatus => ({
      type: 'searchRoomStatus',
      room,
      requests: [],
      criteria: [],
      launcher: { available: false },
      saving: false,
    });
    store.setStatus(status('freelance'));
    expect(store.get().status).toBeUndefined();
    store.setStatus(status('directorio'));
    expect(store.get().status?.room).toBe('directorio');
    expect(isDirectorioFurniture('DIRECTORIO_BOARD')).toBe(true);
    expect(isDirectorioFurniture('DIRECTORIO_PHONE:on')).toBe(true);
    expect(isDirectorioFurniture('AGENDA_CONSOLE')).toBe(false);
  });
});
