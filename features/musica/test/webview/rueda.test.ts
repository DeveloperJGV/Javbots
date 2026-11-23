import { describe, expect, it } from 'vitest';

import type { RuedaStatus } from '../../../../core/src/messages.js';
import {
  drawScene,
  easeAngle,
  KNOB_MAX_DEG,
  KNOB_MIN_DEG,
  knobAngle,
  ledsLit,
} from '../../webview/rueda/ruedaScene.js';
import { ruedaStore } from '../../webview/rueda/ruedaStore.js';
import {
  detail,
  headline,
  hhmm,
  lastKeyText,
  reasonText,
  sceneTarget,
} from '../../webview/rueda/ruedaText.js';

const status = (s: Partial<RuedaStatus>): RuedaStatus => ({
  type: 'ruedaStatus',
  installed: true,
  running: true,
  session: true,
  mode: 'spotify',
  reason: 'spotify',
  settings: {
    paused: false,
    step: 3,
    toast: true,
    startWithWindows: false,
    computerName: 'MI-COMPU',
  },
  device: {
    name: 'Bocina Sala',
    kind: 'Speaker',
    volume: 31,
    playing: true,
    thisComputer: false,
    volumeControl: true,
  },
  ...s,
});

describe('rueda de volumen (page)', () => {
  it('says where the wheel goes, and why when it goes to Windows', () => {
    expect(headline(status({}))).toBe('La rueda mueve Bocina Sala · 31');
    expect(detail(status({}))).toMatch(/otro aparato/);
    const windows = status({ mode: 'windows', reason: 'nothing_playing' });
    expect(headline(windows)).toBe('La rueda mueve Windows');
    expect(detail(windows)).toBe('Va a Windows porque no suena nada en Spotify.');
    expect(headline(status({ settings: { ...status({}).settings, paused: true } }))).toMatch(
      /pausa/,
    );
    expect(headline(status({ running: false }))).toMatch(/apagada/);
    expect(headline(status({ running: false, installed: false }))).toMatch(/no está/);
    expect(detail(status({ running: false, installed: false }))).toMatch(/una vez a mano/);
    expect(reasonText('algo_nuevo')).toBe('otra razón');
  });

  it('the last key, with a digital 24 h time', () => {
    expect(hhmm('2026-11-23T21:05:09-0600')).toBe('21:05');
    expect(
      lastKeyText(
        status({
          lastKey: { to: 'windows', reason: 'this_computer', at: '2026-11-23T10:02:00-0600' },
        }),
      ),
    ).toBe('Última vuelta: a Windows (Spotify suena en esta computadora), 10:02');
    expect(lastKeyText(status({ lastKey: { to: 'spotify', reason: 'spotify' } }))).toBe(
      'Última vuelta: al aparato de Spotify',
    );
    expect(
      lastKeyText(status({ running: false, lastKey: { to: 'spotify', reason: 'spotify' } })),
    ).toBeNull();
  });

  it('the scene follows the status', () => {
    expect(sceneTarget(undefined)).toEqual({ on: false, to: 'windows', playing: false });
    expect(sceneTarget(status({}))).toEqual({ on: true, to: 'spotify', volume: 31, playing: true });
    expect(sceneTarget(status({ settings: { ...status({}).settings, paused: true } })).to).toBe(
      'windows',
    );
    expect(sceneTarget(status({ running: false })).on).toBe(false);
  });

  it('the knob turns from -135° to 135° and its lights fill up', () => {
    expect(knobAngle(0)).toBe(KNOB_MIN_DEG);
    expect(knobAngle(100)).toBe(KNOB_MAX_DEG);
    expect(knobAngle(50)).toBe(0);
    expect(knobAngle(undefined)).toBe(KNOB_MIN_DEG);
    expect(knobAngle(250)).toBe(KNOB_MAX_DEG);
    expect(ledsLit(0)).toBe(0);
    expect(ledsLit(1)).toBe(1);
    expect(ledsLit(100)).toBe(11);
    // Easing gets there and stops
    let a = KNOB_MIN_DEG;
    for (let i = 0; i < 60; i++) a = easeAngle(a, 40, 16);
    expect(a).toBe(40);
    expect(easeAngle(0, 100, 16)).toBeGreaterThan(0);
    expect(easeAngle(0, 100, 16)).toBeLessThan(100);
  });

  it('draws inside its canvas, on and off', () => {
    const rects: number[][] = [];
    const ctx = {
      fillStyle: '',
      globalAlpha: 1,
      clearRect: () => {},
      fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;
    for (const target of [
      sceneTarget(status({})),
      sceneTarget(undefined),
      sceneTarget(status({ mode: 'windows' })),
    ])
      drawScene(ctx, { target, angle: 0, t: 1234, sinceChange: 50 });
    expect(rects.length).toBeGreaterThan(100);
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x! + w!).toBeLessThanOrEqual(120);
      expect(y! + h!).toBeLessThanOrEqual(48);
    }
  });

  it('the options panel opens and closes', () => {
    ruedaStore.openOptions();
    expect(ruedaStore.get().optionsOpen).toBe(true);
    ruedaStore.closeOptions();
    expect(ruedaStore.get().optionsOpen).toBe(false);
  });

  it('the panels send commands through the music connection', () => {
    const sent: unknown[] = [];
    ruedaStore.setTransport({ send: (m: unknown) => sent.push(m) } as never);
    ruedaStore.send({ action: 'set', settings: { step: 5 } });
    expect(sent).toEqual([{ type: 'ruedaCommand', action: 'set', settings: { step: 5 } }]);
  });
});
