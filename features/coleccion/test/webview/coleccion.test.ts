import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClientMessage } from '../../../../core/src/messages.js';
import type { MessageTransport } from '../../../../core/src/transport.js';
import { emptyGame } from '../../core/game.js';
import { PLATFORMS } from '../../core/platforms.js';
import { buildShelves, moveFocus, shelfItems } from '../../core/shelves.js';
import type { Game } from '../../core/types.js';
import { ColeccionOpen } from '../../webview/ColeccionPanel.js';
import {
  type ColeccionState,
  coleccionStore,
  isColeccionFurniture,
} from '../../webview/coleccionStore.js';
import {
  copyLine,
  draftProblem,
  playersText,
  problemsLine,
  shelfCount,
  shortPrice,
  summaryParts,
} from '../../webview/coleccionText.js';
import { COLECCION_SHELF_TYPE, PLATFORM_LOOKS } from '../../webview/constants.js';
import { GameCase } from '../../webview/GameCase.js';
import { GameForm } from '../../webview/GameForm.js';
import { Tonight } from '../../webview/Tonight.js';
import { WantedPoster } from '../../webview/WantedPoster.js';

const TODAY = '2026-11-13';
let n = 0;
const game = (title: string, platform: string, extra: Partial<Game> = {}): Game => ({
  ...emptyGame('2026-01-01', platform),
  id: `g${String(++n).padStart(5, '0')}`,
  title,
  ...extra,
});

/** About 40 invented games over several consoles, with series, gaps and every kind of state. */
function manyGames(): Game[] {
  const out: Game[] = [];
  const consoles = ['nes', 'snes', 'n64', 'ps2', 'gc', 'x360', 'x360', 'wii', 'switch', 'ps5'];
  const words = ['Neón', 'Cohete', 'Bosque', 'Pirata', 'Robot', 'Nube', 'Trueno', 'Faro'];
  for (let i = 0; i < 36; i++) {
    out.push(
      game(
        `${words[i % words.length]} ${['Rally', 'Quest', 'Kart', 'Ninja'][i % 4]} ${i + 1}`,
        consoles[i % consoles.length],
        {
          series: i % 5 === 0 ? 'Capitán Cohete' : '',
          progress: (['', 'sin-jugar', 'a-medias', 'terminado', 'de-siempre'] as const)[i % 5],
          players: (i % 4) + 1,
          coop: i % 3 === 0,
          condition: i % 7 === 0 ? 'sellado' : 'completo',
        },
      ),
    );
  }
  out.push(
    game('Capitán Cohete 64', 'n64', { series: 'Capitán Cohete', wanted: true, price: '$620 MXN' }),
  );
  out.push(game('Faro Perdido', 'ps2', { wanted: true, price: '$300 MXN', seenAt: 'un tianguis' }));
  out.push(game('Nube Ninja', 'switch', { wanted: true }));
  out.push(game('Trueno Kart DX', 'x360', { wanted: true, price: '$150 USD' }));
  return out;
}

const state = (games: Game[] | undefined, extra: Partial<ColeccionState> = {}): ColeccionState => ({
  open: true,
  view: { kind: 'shelves' },
  bySeries: true,
  onlyWanted: false,
  savedInRow: 0,
  focusName: 0,
  ...(games ? { status: { games, file: '/tmp/.pixel-agents/coleccion.json', problems: [] } } : {}),
  ...extra,
});

function fakeTransport(): MessageTransport & { sent: ClientMessage[] } {
  const sent: ClientMessage[] = [];
  return {
    sent,
    send: (m) => sent.push(m),
    onMessage: () => () => {},
    ready: Promise.resolve(),
    state: 'connected',
    onStateChange: () => () => {},
    dispose: () => {},
  };
}

const panel = (s: ColeccionState) =>
  renderToStaticMarkup(createElement(ColeccionOpen, { transport: fakeTransport(), state: s }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('coleccionStore', () => {
  beforeEach(() => coleccionStore.reset());

  it('opens on the shelves and closes', () => {
    coleccionStore.open();
    expect(coleccionStore.get()).toMatchObject({ open: true, view: { kind: 'shelves' } });
    coleccionStore.lightSeries('Capitán Cohete');
    coleccionStore.close();
    expect(coleccionStore.get()).toMatchObject({ open: false, litSeries: undefined });
  });

  it('reads the status leniently and leaves an open box whose game is gone', () => {
    coleccionStore.setStatus({ games: [game('Uno', 'nes'), 'basura'], file: 'f', problems: [] });
    const id = coleccionStore.get().status!.games[0].id;
    expect(coleccionStore.get().status!.games).toHaveLength(1);
    coleccionStore.openItem(id);
    expect(coleccionStore.get().view).toEqual({ kind: 'case', id });
    coleccionStore.setStatus({ games: [], file: 'f', problems: [] });
    expect(coleccionStore.get().view).toEqual({ kind: 'shelves' });
  });

  it('a gap opens its poster, a game its case', () => {
    const gap = game('Faro', 'ps2', { wanted: true });
    coleccionStore.setStatus({ games: [gap], file: 'f', problems: [] });
    coleccionStore.openItem(gap.id);
    expect(coleccionStore.get().view).toEqual({ kind: 'wanted', id: gap.id });
    coleccionStore.openItem('no-existe');
    expect(coleccionStore.get().view).toEqual({ kind: 'wanted', id: gap.id });
  });

  it('many in a row: after saving a new one the console stays, the rest clears, the name gets the cursor', () => {
    coleccionStore.newGame('gc');
    const focus = coleccionStore.get().focusName;
    coleccionStore.updateDraft({ title: 'Neón Rally', owner: 'Ana', region: 'pal', notes: 'x' });
    const requestId = coleccionStore.startSave('new');
    coleccionStore.setResult({ requestId: 'otra', ok: true, id: 'zzzz1' });
    expect(coleccionStore.get().pending).toBeDefined();
    coleccionStore.setResult({ requestId, ok: true, id: 'abcd1234' });
    const s = coleccionStore.get();
    expect(s.view.kind).toBe('form');
    if (s.view.kind !== 'form') return;
    expect(s.view.draft).toMatchObject({
      title: '',
      platform: 'gc',
      owner: 'Ana',
      region: 'pal',
      notes: '',
    });
    expect(s).toMatchObject({ savedInRow: 1, lastSaved: 'Neón Rally', selectedId: 'abcd1234' });
    expect(s.focusName).toBe(focus + 1);
  });

  it('an edit goes back to its case; an error stays in the form', () => {
    const g = game('Uno', 'nes');
    coleccionStore.setStatus({ games: [g], file: 'f', problems: [] });
    coleccionStore.edit(g);
    let requestId = coleccionStore.startSave('edit');
    coleccionStore.setResult({ requestId, ok: false, error: 'No se guardó: disco lleno.' });
    expect(coleccionStore.get()).toMatchObject({
      formError: 'No se guardó: disco lleno.',
      view: { kind: 'form' },
    });
    requestId = coleccionStore.startSave('edit');
    coleccionStore.setResult({ requestId, ok: true, id: g.id });
    expect(coleccionStore.get().view).toEqual({ kind: 'case', id: g.id });
  });

  it('"¡Ya lo tengo!" turns a gap into a game draft; a delete goes back to the shelves', () => {
    const gap = game('Faro', 'ps2', { wanted: true, price: '$300', seenAt: 'tianguis' });
    coleccionStore.edit(gap, 'acquire');
    const v = coleccionStore.get().view;
    expect(v.kind === 'form' && v.draft).toMatchObject({
      id: gap.id,
      wanted: false,
      price: '',
      seenAt: '',
    });
    const requestId = coleccionStore.startDelete();
    coleccionStore.setResult({ requestId, ok: true, id: gap.id });
    expect(coleccionStore.get()).toMatchObject({
      view: { kind: 'shelves' },
      selectedId: undefined,
    });
  });

  it('leaving the form goes back where it came from', () => {
    const g = game('Uno', 'nes');
    const gap = game('Dos', 'nes', { wanted: true });
    coleccionStore.setStatus({ games: [g, gap], file: 'f', problems: [] });
    coleccionStore.edit(g);
    coleccionStore.leaveForm();
    expect(coleccionStore.get().view).toEqual({ kind: 'case', id: g.id });
    coleccionStore.edit(gap, 'acquire');
    coleccionStore.leaveForm();
    expect(coleccionStore.get().view).toEqual({ kind: 'wanted', id: gap.id });
    coleccionStore.newGame('nes');
    coleccionStore.leaveForm();
    expect(coleccionStore.get().view).toEqual({ kind: 'shelves' });
  });

  it('a lit series and "only wanted" exclude each other', () => {
    coleccionStore.lightSeries('X');
    coleccionStore.toggleOnlyWanted();
    expect(coleccionStore.get()).toMatchObject({ onlyWanted: true, litSeries: undefined });
    coleccionStore.lightSeries('Y');
    expect(coleccionStore.get()).toMatchObject({ onlyWanted: false, litSeries: 'Y' });
  });

  it('knows its furniture', () => {
    expect(isColeccionFurniture(COLECCION_SHELF_TYPE)).toBe(true);
    expect(isColeccionFurniture(`${COLECCION_SHELF_TYPE}:1`)).toBe(true);
    expect(isColeccionFurniture('DECKS_SHELF')).toBe(false);
    expect(isColeccionFurniture(undefined)).toBe(false);
  });
});

describe('coleccionText', () => {
  it('header and shelf counts', () => {
    expect(summaryParts({ owned: 1, wanted: 0, platforms: 1 })).toEqual({
      owned: '1 juego',
      platforms: '1 consola',
      wanted: '',
    });
    expect(summaryParts({ owned: 12, wanted: 3, platforms: 4 }).wanted).toBe('3 se buscan');
    expect(shelfCount({ owned: 3, wanted: 1, halfway: 2 })).toEqual({
      owned: '3 juegos',
      wanted: 'busca 1',
      halfway: '2 a medias',
    });
  });

  it('a copy line says cartridge or disc', () => {
    expect(copyLine(game('A', 'nes', { region: 'ntsc-u', condition: 'completo' }))).toBe(
      'NTSC-U · Completo (caja, cartucho y manual)',
    );
    expect(copyLine(game('A', 'ps2', { condition: 'suelto' }))).toBe('Suelto (sin manual)');
    expect(copyLine(game('A', 'ps2'))).toBe('Sin región ni estado anotados');
    expect(playersText(game('A', 'ps2', { players: 4, coop: true }))).toBe('1 a 4, en equipo');
  });

  it('form problems, prices and warnings', () => {
    expect(draftProblem({ title: '  ', platform: 'nes' })).toBe('Falta el nombre.');
    expect(draftProblem({ title: 'X', platform: '' })).toBe('Falta la consola.');
    expect(draftProblem({ title: 'X', platform: 'nes' })).toBeNull();
    expect(shortPrice('$450 MXN')).toBe('$450');
    expect(shortPrice('$30 USD')).toBe('$30 us');
    expect(problemsLine([])).toBe('');
    expect(problemsLine(['a', 'b'])).toBe('2 avisos al leer la colección');
  });
});

describe('the panel', () => {
  it('without the token it says so and shows no shelves', () => {
    const html = panel(state(undefined));
    expect(html).toContain('no está disponible en esta página');
    expect(html).not.toContain('<nav class="col-rail"');
  });

  it('empty: invites to add the first one, with empty slots and every console on the rail', () => {
    const html = panel(state([]));
    expect(html).toContain('Tu colección está vacía');
    expect(html).toContain('+ Agrega el primero');
    expect(html).toContain('Anotar un «se busca»');
    expect(count(html, /class="col-slot"/g)).toBe(9);
    expect(count(html, /class="p"/g)).toBe(PLATFORMS.length);
    expect(html).toContain('0 juegos');
    expect(html).not.toContain('class="col-box');
  });

  it('with ~40 games: one shelf per console, every box and gap drawn, counts in the header', () => {
    const games = manyGames();
    const html = panel(state(games));
    expect(games).toHaveLength(40);
    expect(count(html, /<section class="col-shelf/g)).toBe(9);
    expect(count(html, /class="col-box /g)).toBe(36);
    expect(count(html, /class="col-gap /g)).toBe(4);
    expect(html).toContain('36 juegos');
    expect(html).toContain('4 se buscan');
    expect(html).toContain('Solo «se busca» (4)');
    // The series plaque, the gap price (short) and the console with the most games lit
    expect(html).toContain('class="plaque">Capitán Cohete<');
    expect(html).toContain('class="price">$620<');
    expect(html).toContain('lo que más tienes');
    expect(html).not.toContain('Tu colección está vacía');
  });

  it('search: a lit series glows on every shelf and dims the rest', () => {
    const games = manyGames();
    const html = panel(state(games, { litSeries: 'capitan cohete' }));
    const series = games.filter((g) => g.series === 'Capitán Cohete');
    expect(count(html, / glow /g)).toBe(series.length);
    expect(count(html, / dim /g)).toBe(games.length - series.length);
    expect(html).toContain('Serie: capitan cohete ×');
    // Only wanted: the gaps glow
    const only = panel(state(games, { onlyWanted: true }));
    expect(count(only, /col-gap glow/g)).toBe(4);
  });

  it('the rail lists the consoles with games; the rest open with «+ Otra consola»', () => {
    const html = panel(state([game('Uno', '3ds'), game('Dos', 'pc'), game('Tres', 'gb')]));
    expect(count(html, /class="p"/g)).toBe(3);
    expect(html).toContain(`+ Otra consola (${PLATFORMS.length - 3})`);
    expect(html.indexOf('Game Boy<')).toBeLessThan(html.indexOf('Nintendo 3DS<'));
    expect(html.indexOf('Nintendo 3DS<')).toBeLessThan(html.indexOf('>PC<'));
    expect(html).not.toContain('Otras');
  });

  it('every console has its own look (colors and size), none falls back to the generic one', () => {
    for (const p of PLATFORMS) {
      const look = PLATFORM_LOOKS[p.id];
      expect(look, p.id).toBeDefined();
      // A cartridge's label needs room: at least ~40 px tall
      if (p.cartridge) expect(look.h, p.id).toBeGreaterThanOrEqual(40);
    }
    const accents = PLATFORMS.map((p) => PLATFORM_LOOKS[p.id].accent);
    expect(new Set(accents).size).toBeGreaterThan(PLATFORMS.length * 0.8);
  });

  it('a problem reading the file shows under the shelves', () => {
    const s = state([game('Uno', 'nes')]);
    s.status!.problems = ['coleccion.json no se pudo leer (x).'];
    expect(panel(s)).toContain('▲ coleccion.json no se pudo leer');
  });

  it('opens a case with its sheet, and a gap as a poster', () => {
    const games = manyGames();
    const g = games.find((x) => !x.wanted && x.series)!;
    const html = panel(state(games, { view: { kind: 'case', id: g.id }, selectedId: g.id }));
    expect(html).toContain('col-case');
    expect(html).toContain(`<h2>${g.title}</h2>`);
    expect(html).toContain('Serie Capitán Cohete');
    expect(html).toContain('Borrar');
    const gap = games.find((x) => x.wanted && x.seenAt)!;
    const poster = renderToStaticMarkup(
      createElement(WantedPoster, { game: gap, games, onDelete: () => {} }),
    );
    expect(poster).toContain('SE BUSCA');
    expect(poster).toContain('$300 MXN');
    expect(poster).toContain('un tianguis');
    expect(poster).toContain('¡Ya lo tengo!');
  });

  it('the case knows its neighbours on the shelf', () => {
    const games = manyGames();
    const shelf = buildShelves(games, true).find((s) => s.platform === 'x360')!;
    const siblings = shelfItems(shelf)
      .filter((g) => !g.wanted)
      .map((g) => g.id);
    const first = games.find((g) => g.id === siblings[0])!;
    const html = renderToStaticMarkup(
      createElement(GameCase, {
        game: first,
        games,
        siblings,
        today: TODAY,
        onDelete: () => {},
        onPlayed: () => {},
      }),
    );
    expect(html).toMatch(/<button type="button" class="col-btn" disabled="">← Anterior/);
    expect(html).not.toMatch(/disabled="">Siguiente/);
  });

  it('the form: name and console first; a gap asks for the price instead of the copy', () => {
    const s = state([]);
    const html = renderToStaticMarkup(
      createElement(GameForm, {
        draft: emptyGame(TODAY, 'gc'),
        mode: 'new',
        state: s,
        games: [],
        onSave: () => {},
      }),
    );
    expect(html).toContain('Agregar juegos');
    expect(html).toContain('Guardar y otro (Enter)');
    expect(html).toMatch(/aria-pressed="true"[^>]*><span class="sw"><\/span>GameCube/);
    // The picker groups the consoles by era
    expect(count(html, /<span class="era">/g)).toBe(7);
    expect(html.indexOf('>Clásicas<')).toBeLessThan(html.indexOf('Atari 2600'));
    expect(html.indexOf('>Computadora<')).toBeLessThan(html.indexOf('</span>PC<'));
    expect(html).toContain('Cómo está');
    const wanted = renderToStaticMarkup(
      createElement(GameForm, {
        draft: emptyGame(TODAY, 'gc', true),
        mode: 'new',
        state: s,
        games: [],
        onSave: () => {},
      }),
    );
    expect(wanted).toContain('Anotar un «se busca»');
    expect(wanted).toContain('Precio que viste');
    expect(wanted).not.toContain('Cómo está');
  });

  it('"¿Qué jugamos hoy?" proposes three, or says how to get some', () => {
    const games = manyGames();
    const html = renderToStaticMarkup(createElement(Tonight, { games, today: TODAY }));
    expect(count(html, /title="Abrir /g)).toBe(3);
    expect(html).toMatch(/\d+ de 36 juegos encajan/);
    const none = renderToStaticMarkup(createElement(Tonight, { games: [], today: TODAY }));
    expect(none).toContain('Todavía no hay juegos en la repisa');
  });
});

describe('keyboard over many shelves', () => {
  it('right and down visit every box and gap, and never leave the shelves', () => {
    const shelves = buildShelves(manyGames(), true);
    const all = shelves.flatMap(shelfItems).map((g) => g.id);
    const seen = new Set<string>();
    let id = moveFocus(shelves, null, 'ArrowRight');
    for (const shelf of shelves) {
      id = moveFocus(shelves, id, 'Home');
      for (let i = 0; i < shelfItems(shelf).length; i++) {
        seen.add(id!);
        id = moveFocus(shelves, id, 'ArrowRight');
      }
      id = moveFocus(shelves, id, 'ArrowDown');
    }
    expect(seen.size).toBe(all.length);
    // From the last shelf, down stays; from the first, up stays
    expect(moveFocus(shelves, id, 'ArrowDown')).toBe(id);
    const first = shelfItems(shelves[0])[0].id;
    expect(moveFocus(shelves, first, 'ArrowUp')).toBe(first);
  });
});
