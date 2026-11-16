import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AccesoView } from '../../../../core/src/messages.js';
import type { FurnitureInstance, SpriteData } from '../../../../webview-ui/src/office/types.js';
import { applyAccesosFurniture, candleLitSprite } from '../../webview/accesosFurniture.js';
import { AccesosBody } from '../../webview/AccesosPanel.js';
import {
  type AccesosState,
  type AccesosStatusView,
  accesosStore,
  isAccesosFurniture,
} from '../../webview/accesosStore.js';
import {
  accesosHint,
  actionOf,
  candleState,
  isLocalLink,
  panelTitle,
} from '../../webview/accesosText.js';
import {
  ACCESOS_FLAME_A,
  ACCESOS_FLAME_B,
  ACCESOS_TABLE_TYPE,
  FLICKER_PATTERN,
  FLICKER_STEP_SEC,
  SPUTTER_STEP_SEC,
} from '../../webview/constants.js';

const page = (extra: Partial<AccesoView> = {}): AccesoView => ({
  id: 'mapa',
  name: 'Mapa',
  description: 'Un mapa de prueba',
  url: 'http://localhost:3440/',
  canStart: true,
  state: 'off',
  ...extra,
});

const status = (...accesos: AccesoView[]): AccesosStatusView => ({
  accesos,
  file: '/home/x/.pixel-agents/accesos.json',
  problems: [],
});

const render = (state: AccesosState) =>
  renderToStaticMarkup(createElement(AccesosBody, { state, onStart: () => {} }));

beforeEach(() => accesosStore.reset());

describe('accesos panel', () => {
  it('without the office key it shows nothing of the list', () => {
    const html = render({ open: true });
    expect(html).toMatch(/llave de la oficina/);
    expect(html).not.toMatch(/<a /);
  });

  it('an empty list says where to write it', () => {
    const html = render({ open: true, status: status() });
    expect(html).toMatch(/Todavía no hay páginas/);
    expect(html).toMatch(/accesos\.json/);
  });

  it('a page that is off and can start shows "Prender", not the link', () => {
    const html = render({ open: true, status: status(page()) });
    expect(html).toMatch(/Prender/);
    expect(html).toMatch(/Apagada/);
    expect(html).not.toMatch(/<a /);
  });

  it('a page being started waits, and one that is on opens in a new tab with a real link', () => {
    expect(render({ open: true, status: status(page({ state: 'starting' })) })).toMatch(
      /Prendiendo…/,
    );
    expect(render({ open: true, status: status(page()), pendingStart: 'mapa' })).toMatch(
      /disabled/,
    );
    const html = render({ open: true, status: status(page({ state: 'on' })) });
    expect(html).toMatch(
      /<a [^>]*href="http:\/\/localhost:3440\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
    );
    expect(html).toMatch(/Prendida/);
  });

  it('never links an address that is not on this computer, and shows errors and problems', () => {
    const html = render({
      open: true,
      status: {
        ...status(
          page({ state: 'on', url: 'https://example.com/' }),
          page({ id: 'b', error: 'Falló' }),
        ),
        problems: ['Algo no se leyó'],
      },
    });
    expect(html).not.toMatch(/href=/);
    expect(html).toMatch(/Falló/);
    expect(html).toMatch(/Algo no se leyó/);
  });

  it('texts are shown as text, never as markup', () => {
    const html = render({
      open: true,
      status: status(page({ name: '<img src=x onerror=alert(1)>', description: '<b>hola</b>' })),
    });
    expect(html).not.toMatch(/<img|<b>/);
    expect(html).toMatch(/&lt;img/);
  });
});

describe('accesos texts and store', () => {
  it('the sign and the title use the page name when there is one', () => {
    expect(accesosHint(undefined)).toBe('Accesos');
    expect(accesosHint(status(page()))).toBe('Mapa: abrir');
    expect(accesosHint(status(page(), page({ id: 'b' })))).toBe('Accesos');
    expect(panelTitle(status(page({ name: 'Mi mapa' })))).toBe('Mi mapa');
  });

  it('what each page can do', () => {
    expect(actionOf(page({ state: 'on' }), undefined)).toBe('open');
    expect(actionOf(page(), undefined)).toBe('start');
    expect(actionOf(page(), 'mapa')).toBe('starting');
    expect(actionOf(page({ canStart: false }), undefined)).toBe('openAnyway');
    expect(actionOf(page({ state: 'unknown' }), undefined)).toBe('checking');
    expect(isLocalLink('http://127.0.0.1:3440/x')).toBe(true);
    expect(isLocalLink('http://localhost.evil.com:3440/')).toBe(false);
    expect(isLocalLink('javascript:alert(1)')).toBe(false);
  });

  it('a status clears the start being waited for', () => {
    accesosStore.open();
    accesosStore.startPending('mapa');
    expect(accesosStore.get().pendingStart).toBe('mapa');
    accesosStore.setStatus(status(page({ state: 'starting' })));
    expect(accesosStore.get().pendingStart).toBeUndefined();
    accesosStore.close();
    expect(accesosStore.get().open).toBe(false);
    expect(isAccesosFurniture(ACCESOS_TABLE_TYPE)).toBe(true);
    expect(isAccesosFurniture(`${ACCESOS_TABLE_TYPE}:2`)).toBe(true);
    expect(isAccesosFurniture('COLECCION_SHELF')).toBe(false);
  });
});

describe('accesos candle', () => {
  const sprite: SpriteData = Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ''));
  const table = (): FurnitureInstance =>
    ({ type: ACCESOS_TABLE_TYPE, sprite, x: 0, y: 0, zY: 0 }) as unknown as FurnitureInstance;
  const other = { type: 'DESK', sprite, x: 0, y: 0, zY: 0 } as unknown as FurnitureInstance;

  it('is out while no page answers', () => {
    expect(candleState(status(page()))).toBe('out');
    const list = [table(), other];
    expect(applyAccesosFurniture(list, status(page()), 0)).toBe(list);
    expect(applyAccesosFurniture(list, undefined, 0)).toBe(list);
  });

  it('burns, flickering between two flames, while a page answers', () => {
    const on = status(page({ state: 'on' }), page({ id: 'b' }));
    expect(candleState(on)).toBe('lit');
    const frames = new Set<string>();
    for (let i = 0; i < FLICKER_PATTERN.length; i++) {
      const [t, o] = applyAccesosFurniture([table(), other], on, i * FLICKER_STEP_SEC + 0.01);
      expect(o.sprite).toBe(sprite);
      const [x, y, color] = ACCESOS_FLAME_A[0];
      frames.add(t.sprite[y][x] === color ? 'A' : 'B');
    }
    expect(frames).toEqual(new Set(['A', 'B']));
    const lit = candleLitSprite(sprite, 1);
    for (const [x, y, color] of ACCESOS_FLAME_B) expect(lit[y][x]).toBe(color);
    expect(sprite[ACCESOS_FLAME_B[0][1]][ACCESOS_FLAME_B[0][0]]).toBe('');
  });

  it('sputters while a page is being started', () => {
    const starting = status(page({ state: 'starting' }));
    expect(candleState(starting)).toBe('sputter');
    const [a] = applyAccesosFurniture([table()], starting, 0.01);
    const [b] = applyAccesosFurniture([table()], starting, SPUTTER_STEP_SEC + 0.01);
    expect(a.sprite).not.toBe(sprite);
    expect(b.sprite).toBe(sprite);
  });
});
