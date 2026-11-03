import type { ConnectionState } from '../../../core/src/messages.js';

/** The rack in the office: a click opens the connections panel. */
export const CONNECTIONS_RACK_TYPE = 'CONNECTIONS_RACK';

/** Top-left pixel of each 2×2 light, in connection order (must match features/conexiones/arte/armar.py). */
export const RACK_LEDS: ReadonlyArray<{ x: number; y: number }> = [3, 11].flatMap((x) =>
  [8, 11, 14, 17, 20, 23].map((y) => ({ x, y })),
);
export const RACK_LED_SIZE = 2;

/** Light color per state: green working, amber expiring / failing, red no key or not connected, blue planned. */
export const STATE_COLORS: Record<ConnectionState, string> = {
  ok: '#4ade80',
  warn: '#fbbf24',
  off: '#ef4444',
  idea: '#60a5fa',
};
/** The top-right pixel of each light, a shade lighter (so it reads as a lit bulb). */
export const STATE_SHINE: Record<ConnectionState, string> = {
  ok: '#bbf7d0',
  warn: '#fde68a',
  off: '#fca5a5',
  idea: '#bfdbfe',
};

export const STATE_LABELS: Record<ConnectionState, string> = {
  ok: 'Funcionando',
  warn: 'Atención',
  off: 'Sin conectar',
  idea: 'Idea',
};
/** Panel order: what needs attention first. */
export const STATE_ORDER: readonly ConnectionState[] = ['warn', 'off', 'ok', 'idea'];

/** A light that needs attention blinks: on this long, then off as long. */
export const RACK_BLINK_SEC = 0.6;
