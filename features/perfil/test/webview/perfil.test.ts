import { describe, expect, it } from 'vitest';

import type { PerfilProfile } from '../../../../core/src/messages.js';
import {
  PERFIL_BAR_COLOR,
  PERFIL_BARS,
  PERFIL_CURSOR,
  PERFIL_CURSOR_IDLE,
  PERFIL_TEXT_COLOR,
  PERFIL_TRACK_COLOR,
} from '../../webview/constants.js';
import {
  applyPerfilFurniture,
  barLength,
  perfilScreenSprite,
} from '../../webview/perfilFurniture.js';
import { dateText } from '../../webview/perfilText.js';

const blank = (): string[][] =>
  Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => '#000000'));
const PROFILE: PerfilProfile = {
  code: 'IT-T',
  name: 'Ejemplo',
  traits: [
    { letter: 'I', name: 'Uno', percent: 50 },
    { letter: 'T', name: 'Dos', percent: 100 },
  ],
};

describe('perfil screen', () => {
  it('sizes the bars', () => {
    expect(barLength(0, 22)).toBe(0);
    expect(barLength(1, 22)).toBe(1);
    expect(barLength(50, 22)).toBe(11);
    expect(barLength(100, 22)).toBe(22);
    expect(barLength(150, 22)).toBe(22);
  });

  it('paints the code, one bar per trait and the cursor', () => {
    const s = perfilScreenSprite(blank(), PROFILE, true);
    // "I" glyph: its top row is lit across
    expect(s[5].slice(4, 7)).toEqual([PERFIL_TEXT_COLOR, PERFIL_TEXT_COLOR, PERFIL_TEXT_COLOR]);
    const y0 = PERFIL_BARS.y;
    expect(s[y0][PERFIL_BARS.x + 10]).toBe(PERFIL_BAR_COLOR);
    expect(s[y0][PERFIL_BARS.x + 11]).toBe(PERFIL_TRACK_COLOR);
    expect(s[y0 + PERFIL_BARS.step][PERFIL_BARS.x + PERFIL_BARS.width - 1]).toBe(PERFIL_BAR_COLOR);
    // no third bar
    expect(s[y0 + 2 * PERFIL_BARS.step][PERFIL_BARS.x]).toBe('#000000');
    expect(s[PERFIL_CURSOR.y][PERFIL_CURSOR.x]).toBe(PERFIL_TEXT_COLOR);
    expect(perfilScreenSprite(blank(), PROFILE, false)[PERFIL_CURSOR.y][PERFIL_CURSOR.x]).toBe(
      '#000000',
    );
  });

  it('shows only a cursor without a profile, and never touches the base sprite', () => {
    const base = blank();
    const s = perfilScreenSprite(base, undefined, true);
    expect(s[PERFIL_CURSOR_IDLE.y][PERFIL_CURSOR_IDLE.x]).toBe(PERFIL_TEXT_COLOR);
    expect(s[5][4]).toBe('#000000');
    expect(base.flat().every((c) => c === '#000000')).toBe(true);
  });

  it('only paints the personality screen', () => {
    const sprite = blank();
    const [screen, other] = applyPerfilFurniture(
      [
        { type: 'PERFIL_SCREEN', sprite, x: 0, y: 0, zY: 0 },
        { type: 'FREELANCE_DESK', sprite, x: 0, y: 0, zY: 0 },
      ] as never,
      PROFILE,
      0,
    );
    expect(screen.sprite).not.toBe(sprite);
    expect(other.sprite).toBe(sprite);
  });

  it('writes the date in Spanish', () => {
    expect(dateText('2026-11-05')).toBe('5 de noviembre de 2026');
    expect(dateText('ayer')).toBe('ayer');
  });
});
