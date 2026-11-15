import { describe, expect, it } from 'vitest';

import type { SearchResult, SearchRoomStatus } from '../../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../../webview-ui/src/office/types.js';
import { DEFAULT_MARK_LABELS } from '../../../busquedas/webview/searchText.js';
import {
  FREELANCE_MARK_LABELS,
  MAP_PIN_COLOR,
  MAP_PIN_PING_COLOR,
  MAP_PINS,
} from '../../webview/constants.js';
import { applyFreelanceFurniture, worldMapSprite } from '../../webview/freelanceFurniture.js';
import { freelanceStore, isFreelanceFurniture, openLeads } from '../../webview/freelanceStore.js';
import { linesOf, offerReady, textOf } from '../../webview/freelanceText.js';

const r = (over: Partial<SearchResult>): SearchResult => ({
  id: over.name ?? 'x',
  name: 'x',
  kind: 'otro',
  why: '',
  score: 50,
  verdict: 'recomendado',
  ...over,
});

const status = (results: SearchResult[]): SearchRoomStatus => ({
  type: 'searchRoomStatus',
  room: 'freelance',
  requests: [
    {
      id: 'abc123',
      text: 'Apps',
      criteriaId: 'proyectos',
      createdAt: '2026-11-15T00:00:00Z',
      state: 'listo',
      brief: 'Lee…',
      results,
    },
  ],
  criteria: [],
  launcher: { available: false },
  saving: false,
});

const GROUND = '#06140C';
const PIN = '#FBBF24';
/** A 64×32 map: ground everywhere, the drawn pins in yellow. */
function mapSprite(): SpriteData {
  const s: SpriteData = Array.from({ length: 32 }, () => Array<string>(64).fill(GROUND));
  for (const p of MAP_PINS.slice(0, 5))
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      s[p.y + dy][p.x + dx] = PIN;
  return s;
}
const pinColor = (s: SpriteData, i: number) => s[MAP_PINS[i].y][MAP_PINS[i].x];

describe('Freelance en la página', () => {
  it('abre desde el escritorio y no desde lo demás del cuarto', () => {
    expect(isFreelanceFurniture('FREELANCE_DESK')).toBe(true);
    expect(isFreelanceFurniture('FREELANCE_DESK:on')).toBe(true);
    for (const t of ['FREELANCE_WORLD_MAP', 'FREELANCE_MISSIONS', 'PERFIL_SCREEN', undefined])
      expect(isFreelanceFurniture(t)).toBe(false);
  });

  it('el store solo acepta su cuarto', () => {
    freelanceStore.setStatus({ ...status([]), room: 'directorio' });
    expect(freelanceStore.get().status).toBeUndefined();
    freelanceStore.setStatus(status([]));
    expect(freelanceStore.get().status?.room).toBe('freelance');
  });

  it('cuenta los recomendados sin marcar', () => {
    expect(openLeads(undefined)).toBe(0);
    expect(
      openLeads(
        status([
          r({ name: 'a' }),
          r({ name: 'b', mark: 'contactado' }),
          r({ name: 'c', verdict: 'descartado' }),
          r({ name: 'd', mark: 'descartado' }),
          r({ name: 'e' }),
        ]),
      ),
    ).toBe(2);
  });

  it('el mapa prende un punto por pendiente y apaga los dibujados de más', () => {
    const base = mapSprite();
    const none = worldMapSprite(base, 0, -1);
    for (let i = 0; i < MAP_PINS.length; i++) expect(pinColor(none, i)).toBe(GROUND);
    const two = worldMapSprite(base, 2, 1);
    expect(pinColor(two, 0)).toBe(MAP_PIN_COLOR);
    expect(pinColor(two, 1)).toBe(MAP_PIN_PING_COLOR);
    expect(pinColor(two, 2)).toBe(GROUND);
    const all = worldMapSprite(base, 99, -1);
    expect(MAP_PINS.every((_, i) => pinColor(all, i) === MAP_PIN_COLOR)).toBe(true);
    expect(base[MAP_PINS[0].y][MAP_PINS[0].x]).toBe(PIN); // the art itself is untouched
  });

  it('sin estado (página sin llave) el mapa queda como está dibujado', () => {
    const sprite = mapSprite();
    const map = { type: 'FREELANCE_WORLD_MAP', sprite } as unknown as FurnitureInstance;
    expect(applyFreelanceFurniture([map], undefined, 0)[0].sprite).toBe(sprite);
    const lit = applyFreelanceFurniture([map], status([r({ name: 'a' })]), 0)[0].sprite;
    expect(pinColor(lit, 0)).not.toBe(GROUND);
    expect(pinColor(lit, 1)).toBe(GROUND);
  });

  it('Postulé en vez de Contacté, y el Directorio se queda igual', () => {
    expect(FREELANCE_MARK_LABELS.contact).toBe('Postulé');
    expect(DEFAULT_MARK_LABELS).toEqual({ contact: 'Contacté', contacted: 'contactado' });
  });

  it('el editor de la oferta: una cosa por línea', () => {
    expect(linesOf(' Kotlin \n\n React\r\nNode ')).toEqual(['Kotlin', 'React', 'Node']);
    expect(textOf(['a', 'b'])).toBe('a\nb');
    expect(offerReady({ title: ' ', services: [] })).toBe(false);
    expect(offerReady({ title: '', services: ['Apps'] })).toBe(true);
  });
});
