import { describe, expect, it } from 'vitest';

import type { ConnectionInfo } from '../../../../core/src/messages.js';
import { RACK_LEDS, STATE_COLORS } from '../../webview/constants.js';
import { byFeature, sinceText, summaryText } from '../../webview/connectionsText.js';
import { applyConnectionsFurniture, ledKey, rackSprite } from '../../webview/rackFurniture.js';

const conn = (id: string, feature: string, state: ConnectionInfo['state']): ConnectionInfo => ({
  id,
  name: id,
  feature,
  purpose: 'p',
  auth: 'a',
  state,
});
const LIST = [
  conn('spotify', 'Música', 'ok'),
  conn('lrclib', 'Música', 'off'),
  conn('google', 'Conciertos', 'warn'),
  conn('setlist', 'Conciertos', 'idea'),
];
const blank = (): string[][] => Array.from({ length: 32 }, () => Array<string>(16).fill(''));

describe('rack lights', () => {
  it('one light per connection; the warning ones blink', () => {
    expect(ledKey(LIST, false)).toBe('gryb--------');
    expect(ledKey(LIST, true)).toBe('gr-b--------');
  });

  it('paints each light in its state color and leaves the rest off', () => {
    const out = rackSprite(blank(), LIST, false);
    const at = (i: number) => out[RACK_LEDS[i].y + 1][RACK_LEDS[i].x];
    expect(at(0)).toBe(STATE_COLORS.ok);
    expect(at(1)).toBe(STATE_COLORS.off);
    expect(at(2)).toBe(STATE_COLORS.warn);
    expect(at(3)).toBe(STATE_COLORS.idea);
    expect(at(4)).toBe('');
  });

  it('only the rack changes, and nothing without a list', () => {
    const rack = { type: 'CONNECTIONS_RACK', sprite: blank(), x: 0, y: 0, zY: 0 };
    const other = { type: 'PLANT', sprite: blank(), x: 0, y: 0, zY: 0 };
    expect(applyConnectionsFurniture([rack, other], undefined, 0)[0]).toBe(rack);
    const [r, o] = applyConnectionsFurniture([rack, other], LIST, 0);
    expect(r.sprite).not.toBe(rack.sprite);
    expect(o).toBe(other);
  });
});

describe('panel text', () => {
  it('groups by feature with what needs attention first', () => {
    expect(byFeature(LIST).map((g) => [g.feature, g.items.map((c) => c.id)])).toEqual([
      ['Música', ['lrclib', 'spotify']],
      ['Conciertos', ['google', 'setlist']],
    ]);
  });

  it('summary and time since', () => {
    expect(summaryText(LIST)).toBe(
      '4 conexiones · 1 funcionando · 1 por atender · 1 sin conectar · 1 idea',
    );
    const now = new Date('2026-11-03T12:00:00Z');
    expect(sinceText('2026-11-03T11:55:00Z', now)).toBe('hace 5 min');
    expect(sinceText('2026-11-01T12:00:00Z', now)).toBe('hace 2 días');
    expect(sinceText(undefined, now)).toBe('');
  });
});
