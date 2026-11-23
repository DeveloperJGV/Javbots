import { createElement } from 'react';
import { renderToStaticMarkup as reactRender } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClientMessage } from '../../../../core/src/messages.js';
import type { MessageTransport } from '../../../../core/src/transport.js';
import { emptySeries, withOwned } from '../../core/series.js';
import type { Series } from '../../core/types.js';
import { ComicsOpen } from '../../webview/ComicsPanel.js';
import {
  type ComicsState,
  comicsStore,
  isComicsFurniture,
  nextSeriesDraft,
} from '../../webview/comicsStore.js';
import { COMICS_SHELF_TYPE } from '../../webview/constants.js';
import { countText, peopleText, slotsOf, volumeLook } from '../../webview/look.js';
import { SeriesCard } from '../../webview/SeriesCard.js';
import { SeriesForm } from '../../webview/SeriesForm.js';

/** The markup without the empty comments React puts between text pieces. */
const render = (el: Parameters<typeof reactRender>[0]) => reactRender(el).replace(/<!-- -->/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

let n = 0;
/** An invented series (titles and people made up for the tests). */
const series = (title: string, owned: number[], extra: Partial<Series> = {}): Series => ({
  ...emptySeries('2026-01-01'),
  id: `c${String(++n).padStart(5, '0')}`,
  title,
  volumes: withOwned([], owned),
  ...extra,
});

const state = (list: Series[] | undefined, extra: Partial<ComicsState> = {}): ComicsState => ({
  open: true,
  view: { kind: 'shelves' },
  grouping: 'tipo',
  onlyMissing: false,
  savedInRow: 0,
  focusName: 0,
  ...(list ? { status: { series: list, file: 'f', problems: [], covers: [] } } : {}),
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

const lib = () => [
  series('Puerto Niebla', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], {
    kind: 'manga',
    totalVolumes: 27,
    writers: ['Rin Kaze'],
    readUpTo: 5,
  }),
  series('Capa Roja', [1, 2, 4], {
    kind: 'comic',
    format: 'grapa',
    writers: ['Ana Ruiz'],
    artists: ['Leo Vela'],
  }),
  series('La torre', [1], { kind: 'novela-grafica', totalVolumes: 1, finished: true }),
];

describe('comics webview', () => {
  beforeEach(() => comicsStore.reset());

  it('folds long runs of missing volumes into one gap', () => {
    const s = lib()[0];
    expect(slotsOf(s).slice(-2)).toEqual([
      { kind: 'vol', number: 12 },
      { kind: 'gaps', from: 13, to: 27 },
    ]);
    expect(slotsOf(lib()[1]).map((x) => x.kind)).toEqual(['vol', 'vol', 'gap', 'vol']);
    expect(countText(lib()[0])).toBe('12 de 27 · faltan 15');
    expect(countText(lib()[2])).toBe('1 de 1 · completa');
    expect(peopleText(lib()[1])).toBe('Guion: Ana Ruiz · Dibujo: Leo Vela');
    expect(volumeLook(lib()[1]).grapa).toBe(true);
    expect(volumeLook(lib()[0]).h).toBeLessThan(volumeLook(lib()[2]).h);
  });

  it('keeps what repeats after saving one, and knows its furniture', () => {
    const next = nextSeriesDraft(
      { ...lib()[0], localPublisher: 'Panel', genre: 'Seinen', format: 'tomo' },
      '2026-11-23',
    );
    expect(next).toMatchObject({
      title: '',
      kind: 'manga',
      localPublisher: 'Panel',
      genre: 'Seinen',
      volumes: [],
    });
    expect(isComicsFurniture(COMICS_SHELF_TYPE)).toBe(true);
    expect(isComicsFurniture('LIBROS_SHELF')).toBe(false);
  });

  it('fills the form with what the source said, only when asked', () => {
    comicsStore.newSeries();
    const rid = comicsStore.startLookup();
    comicsStore.setLookup({
      requestId: rid,
      ok: true,
      found: [
        {
          source: 'anilist',
          title: 'Puerto Niebla',
          altTitle: 'Kiri no Minato',
          writers: ['Rin Kaze'],
          artists: [],
          volumes: 27,
          finished: true,
          year: 2004,
          genres: ['Drama'],
        },
      ],
    });
    const v0 = comicsStore.get().view;
    expect(v0.kind === 'form' && v0.draft.title).toBe('');
    comicsStore.useLookup(0);
    expect(comicsStore.get().view).toMatchObject({
      draft: {
        title: 'Puerto Niebla',
        totalVolumes: 27,
        finished: true,
        kind: 'manga',
        year: 2004,
      },
    });
  });

  it('the panel: shelves by kind, volumes and gaps, the header', () => {
    const html = render(
      createElement(ComicsOpen, { transport: fakeTransport(), state: state(lib()) }),
    );
    expect(html).toContain('<h1>Cómics y manga</h1>');
    expect(html).toContain('3 series');
    expect(html).toContain('faltan 16');
    expect(html.indexOf('<h3>Manga</h3>')).toBeLessThan(html.indexOf('<h3>Cómic</h3>'));
    expect(html).toContain('<h3>Novela gráfica</h3>');
    expect(count(html, /class="com-vol /g)).toBe(16);
    expect(html).toContain('Faltan del 13 al 27 de Puerto Niebla');
    expect(html).toContain('Falta el 3 de Capa Roja');
    const none = render(
      createElement(ComicsOpen, { transport: fakeTransport(), state: state(undefined) }),
    );
    expect(none).toContain('no están disponibles');
    const empty = render(
      createElement(ComicsOpen, { transport: fakeTransport(), state: state([]) }),
    );
    expect(empty).toContain('Agrega la primera serie');
  });

  it('the card: every number to tick, read up to, and the missing ones', () => {
    const s = lib()[0];
    const html = render(
      createElement(SeriesCard, {
        s,
        volume: 13,
        state: state([s]),
        send: () => {},
        onSave: () => {},
        onDelete: () => {},
      }),
    );
    expect(html).toContain('12 de 27 · faltan 15');
    expect(html).toContain('27 tomos · sigue saliendo');
    expect(html).toContain('el 5');
    expect(count(html, /class="own /g)).toBe(12);
    expect(count(html, /read/g)).toBeGreaterThanOrEqual(5);
    expect(html).toContain('Buscar portada');
  });

  it('the form understands «1-12» and says what it read', () => {
    const d = emptySeries('2026-11-23', { title: 'X' });
    const ok = render(
      createElement(SeriesForm, {
        draft: d,
        owned: '1-12, 15',
        mode: 'new',
        state: state([]),
        send: () => {},
        onSave: () => {},
      }),
    );
    expect(ok).toContain('13 tomos: 1-12, 15');
    const bad = render(
      createElement(SeriesForm, {
        draft: d,
        owned: '1-x',
        mode: 'new',
        state: state([]),
        send: () => {},
        onSave: () => {},
      }),
    );
    expect(bad).toContain('Escríbelos como 1-12, 15');
  });
});
