import { createElement } from 'react';
import { renderToStaticMarkup as reactRender } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClientMessage } from '../../../../core/src/messages.js';
import type { MessageTransport } from '../../../../core/src/transport.js';
import { emptyBook } from '../../core/book.js';
import type { Book } from '../../core/types.js';
import { BookForm } from '../../webview/BookForm.js';
import { BookOpen, WantedPoster } from '../../webview/BookOpen.js';
import { CLOTHS, LIBROS_SHELF_TYPE, SPINE } from '../../webview/constants.js';
import { LibrosOpen } from '../../webview/LibrosPanel.js';
import {
  isLibrosFurniture,
  type LibrosState,
  librosStore,
  nextDraft,
} from '../../webview/librosStore.js';
import {
  editionLine,
  isbnWarning,
  lentText,
  problemsLine,
  shortPrice,
  summaryParts,
} from '../../webview/librosText.js';
import { NextRead } from '../../webview/NextRead.js';
import { accentOf, spineOf } from '../../webview/spine.js';

/** The markup without the empty comments React puts between text pieces. */
const renderToStaticMarkup = (el: Parameters<typeof reactRender>[0]) =>
  reactRender(el).replace(/<!-- -->/g, '');

const TODAY = '2026-11-23';
let n = 0;
/** An invented book (titles, authors and publishers made up for the tests). */
const book = (title: string, extra: Partial<Book> = {}): Book => ({
  ...emptyBook('2026-01-01'),
  id: `b${String(++n).padStart(5, '0')}`,
  title,
  ...extra,
});

/** About 30 invented books over several genres, with sagas, gaps, loans and every reading state. */
function manyBooks(): Book[] {
  const genres = ['Novela', 'Fantasía', 'Ciencia ficción', 'Historia', 'Cocina', ''];
  const authors = ['Marta Olmo', 'Bruno Ríos', 'Ana Pérez', 'Luis Gómez'];
  const out: Book[] = [];
  for (let i = 0; i < 26; i++)
    out.push(
      book(
        `${['Río', 'Faro', 'Nube', 'Puerto'][i % 4]} de ${['niebla', 'sal', 'cobre'][i % 3]} ${i + 1}`,
        {
          genre: genres[i % genres.length],
          authors: [authors[i % authors.length]],
          format: (['pasta-dura', 'pasta-blanda', 'digital', ''] as const)[i % 4],
          pages: i % 3 === 0 ? 0 : 120 + i * 20,
          reading: (['', 'sin-leer', 'leyendo', 'leido', 'a-medias'] as const)[i % 5],
          series: i % 6 === 0 ? 'Crónicas del Faro' : '',
          seriesNumber: i % 6 === 0 ? i / 6 + 1 : 0,
          lentTo: i === 7 ? 'Luis' : '',
          lentAt: i === 7 ? '2026-05-01' : '',
        },
      ),
    );
  out.push(
    book('El faro perdido', {
      genre: 'Fantasía',
      wanted: true,
      price: '$350 MXN',
      series: 'Crónicas del Faro',
      seriesNumber: 6,
    }),
  );
  out.push(book('Recetario de mar', { genre: 'Cocina', wanted: true }));
  return out;
}

const state = (books: Book[] | undefined, extra: Partial<LibrosState> = {}): LibrosState => ({
  open: true,
  view: { kind: 'shelves' },
  grouping: 'genero',
  onlyWanted: false,
  savedInRow: 0,
  focusName: 0,
  focusField: 'title',
  ...(books
    ? { status: { books, file: '/tmp/.pixel-agents/libros.json', problems: [], covers: [] } }
    : {}),
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

const panel = (s: LibrosState) =>
  renderToStaticMarkup(createElement(LibrosOpen, { transport: fakeTransport(), state: s }));
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('librosStore', () => {
  beforeEach(() => librosStore.reset());

  it('opens on the shelves, reads the status leniently and leaves an open book that is gone', () => {
    librosStore.open();
    librosStore.setStatus({ books: [book('Uno'), 'basura'], file: 'f', problems: [] });
    const id = librosStore.get().status!.books[0].id;
    expect(librosStore.get().status!.books).toHaveLength(1);
    librosStore.openItem(id);
    expect(librosStore.get().view).toEqual({ kind: 'book', id });
    librosStore.setStatus({ books: [], file: 'f', problems: [] });
    expect(librosStore.get().view).toEqual({ kind: 'shelves' });
    librosStore.close();
    expect(librosStore.get().open).toBe(false);
  });

  it('a gap opens its poster', () => {
    const gap = book('Faro', { wanted: true });
    librosStore.setStatus({ books: [gap], file: 'f', problems: [] });
    librosStore.openItem(gap.id);
    expect(librosStore.get().view).toEqual({ kind: 'wanted', id: gap.id });
  });

  it('many in a row: what repeats stays, and a saga goes on with the next number', () => {
    const d = book('Faro 2', {
      genre: 'Fantasía',
      format: 'pasta-blanda',
      authors: ['Marta Olmo'],
      publisher: 'Brújula',
      series: 'Faro',
      seriesNumber: 2,
      isbn: '9780306406157',
      year: 2019,
      reading: 'leido',
      notes: 'x',
    });
    const next = nextDraft(d, TODAY);
    expect(next).toMatchObject({
      title: '',
      genre: 'Fantasía',
      format: 'pasta-blanda',
      authors: ['Marta Olmo'],
      publisher: 'Brújula',
      series: 'Faro',
      seriesNumber: 3,
      isbn: '',
      year: 0,
      reading: '',
      notes: '',
    });
    const loose = nextDraft({ ...d, series: '', seriesNumber: 0 }, TODAY);
    expect(loose).toMatchObject({ authors: [], publisher: '', genre: 'Fantasía' });

    librosStore.newBook({ genre: 'Novela' });
    const focus = librosStore.get().focusName;
    librosStore.updateDraft({ title: 'Uno' });
    const rid = librosStore.startSave('new', true);
    librosStore.setResult({ requestId: rid, ok: true, id: 'abcd1234' });
    const s = librosStore.get();
    expect(s.view).toMatchObject({
      kind: 'form',
      mode: 'new',
      draft: { title: '', genre: 'Novela' },
    });
    expect(s).toMatchObject({ savedInRow: 1, lastSaved: 'Uno', findCoverId: 'abcd1234' });
    expect(s.focusName).toBe(focus + 1);
    librosStore.coverFindSent();
    expect(librosStore.get().findCoverId).toBeUndefined();
  });

  it('shows what Open Library said and fills the draft only when asked', () => {
    librosStore.newBook();
    const rid = librosStore.startLookup('9780306406157');
    expect(librosStore.get()).toMatchObject({ focusField: 'isbn', lookup: { state: 'buscando' } });
    librosStore.setLookup({ requestId: 'otro', ok: false, isbn: 'x', reason: 'invalido' });
    expect(librosStore.get().lookup?.state).toBe('buscando');
    librosStore.setLookup({
      requestId: rid,
      ok: true,
      isbn: '9780306406157',
      found: {
        title: 'El faro',
        authors: ['Marta Olmo'],
        publisher: '',
        year: 2019,
        pages: 0,
        hasCover: true,
      },
    });
    const v = librosStore.get().view;
    expect(v.kind === 'form' && v.draft.title).toBe('');
    librosStore.useLookup();
    const after = librosStore.get();
    expect(after.view).toMatchObject({
      draft: {
        title: 'El faro',
        authors: ['Marta Olmo'],
        year: 2019,
        isbn: '9780306406157',
        publisher: '',
      },
    });
    expect(after.draftFromIsbn).toBe(true);
    expect(after.lookup).toBeUndefined();
  });

  it('a dropped connection frees what was waiting', () => {
    librosStore.newBook();
    librosStore.startSave('new');
    librosStore.startLookup('9780306406157');
    librosStore.connectionLost();
    expect(librosStore.get().pending).toBeUndefined();
    expect(librosStore.get().formError).toContain('conexión');
    expect(librosStore.get().lookup).toMatchObject({ state: 'nada', reason: 'sin-respuesta' });
  });

  it('knows its furniture', () => {
    expect(isLibrosFurniture(LIBROS_SHELF_TYPE)).toBe(true);
    expect(isLibrosFurniture(`${LIBROS_SHELF_TYPE}:left`)).toBe(true);
    expect(isLibrosFurniture('COLECCION_SHELF')).toBe(false);
    expect(isLibrosFurniture(undefined)).toBe(false);
  });
});

describe('libros: spines and texts', () => {
  it('a hardcover is tall, a paperback shorter, an e-book thin; pages make it thick', () => {
    const hard = spineOf(book('A', { format: 'pasta-dura', pages: 600 }));
    const soft = spineOf(book('A', { format: 'pasta-blanda', pages: 100 }));
    const digital = spineOf(book('A', { format: 'digital', pages: 900 }));
    expect(hard.kind).toBe('hard');
    expect(hard.h).toBeGreaterThan(SPINE.softH + SPINE.heightJitter / 2);
    expect(hard.w).toBeGreaterThan(soft.w);
    expect(digital).toMatchObject({ kind: 'digital', w: SPINE.digitalW });
    expect(spineOf(book('B', { pages: 20000 })).w).toBe(SPINE.maxW);
    const same = book('Igual');
    expect(spineOf(same)).toEqual(spineOf({ ...same }));
    expect(CLOTHS.map((c) => c.cloth)).toContain(spineOf(same).cloth);
    expect(accentOf('Ciencia ficción')).toBe(accentOf('ciencia ficcion'));
    expect(accentOf('')).not.toBe(accentOf('Novela'));
  });

  it('says the library in words', () => {
    expect(summaryParts({ owned: 1, wanted: 2, reading: 1, lent: 1, authors: 1 })).toEqual({
      owned: '1 libro',
      rest: ['1 autor', '1 leyendo', '1 prestado'],
      wanted: '2 se buscan',
    });
    expect(
      editionLine(book('X', { publisher: 'Brújula', year: 2019, pages: 320, language: 'Español' })),
    ).toBe('Brújula · 2019 · 320 páginas · Español');
    expect(lentText(book('X', { lentTo: 'Ana', lentAt: '2026-05-01' }), TODAY)).toMatchObject({
      long: true,
    });
    expect(lentText(book('X', { lentTo: 'Ana', lentAt: '2026-11-20' }), TODAY)).toMatchObject({
      text: 'Lo tiene Ana desde hace 3 días.',
      long: false,
    });
    expect(lentText(book('X'), TODAY)).toBeNull();
    expect(shortPrice('$350 MXN')).toBe('$350');
    expect(isbnWarning('9780306406158')).toContain('no cuadra');
    expect(isbnWarning('9780306406157')).toBeNull();
    expect(problemsLine(['a', 'b', 'c'])).toBe('a (y 2 avisos más)');
  });
});

describe('libros panel', () => {
  beforeEach(() => librosStore.reset());

  it('without the office token it says so', () => {
    const html = panel(state(undefined));
    expect(html).toContain('no está disponible en esta página');
    expect(html).not.toContain('class="lib-rail"');
  });

  it('empty: a bare shelf that invites to put the first one', () => {
    const html = panel(state([]));
    expect(html).toContain('El librero está vacío');
    expect(html).toContain('Agrega el primero');
    expect(count(html, /class="lib-slot"/g)).toBeGreaterThan(5);
  });

  it('shelves by genre with their books drawn, gaps, sagas with their plaque and the header', () => {
    const books = manyBooks();
    const html = panel(state(books));
    expect(html).toContain('<h1>Librero</h1>');
    expect(html).toContain('26 libros');
    expect(html).toContain('2 se buscan');
    for (const g of ['Novela', 'Fantasía', 'Ciencia ficción', 'Historia', 'Cocina', 'Sin género'])
      expect(html).toContain(`<h3>${g}</h3>`);
    // Genres stand in their order and the ones without go last
    expect(html.indexOf('<h3>Novela</h3>')).toBeLessThan(html.indexOf('<h3>Cocina</h3>'));
    expect(html.indexOf('<h3>Cocina</h3>')).toBeLessThan(html.indexOf('<h3>Sin género</h3>'));
    expect(count(html, /class="lib-book /g)).toBe(26);
    expect(count(html, /class="lib-gap /g)).toBe(2);
    expect(html).toContain('lib-book hard');
    expect(html).toContain('lib-book digital');
    expect(html).toContain('title="Prestado a Luis"');
    expect(html).toContain('$350');
  });

  it('by author, publisher or saga, and an author lit on every shelf', () => {
    const books = manyBooks();
    const byAuthor = panel(state(books, { grouping: 'autor' }));
    expect(byAuthor).toContain('<h3>Marta Olmo</h3>');
    const bySaga = panel(state(books, { grouping: 'saga' }));
    expect(bySaga).toContain('<h3>Crónicas del Faro</h3>');
    expect(bySaga).toContain('<h3>Sin saga</h3>');
    const lit = panel(state(books, { lit: { kind: 'autor', value: 'Ana Pérez' } }));
    expect(count(lit, /lib-book [a-z]+ glow/g)).toBeGreaterThan(3);
    expect(lit).toContain('Autor: Ana Pérez ×');
  });

  it('the open book: its card, the saga with the missing numbers, loan and cover buttons', () => {
    const books = manyBooks();
    const b = books[0]; // saga 1, lent to nobody
    const html = renderToStaticMarkup(
      createElement(BookOpen, {
        book: {
          ...b,
          lentTo: 'Ana',
          lentAt: '2026-05-01',
          owner: 'La casa',
          notes: 'Edición de bolsillo',
        },
        books,
        siblings: [b.id, books[1].id],
        today: TODAY,
        state: state(books),
        send: () => {},
        onSave: () => {},
        onDelete: () => {},
      }),
    );
    expect(html).toContain(b.title);
    expect(html).toContain('Ex libris');
    expect(html).toContain('Lo tiene Ana desde hace 7 meses.');
    expect(html).toContain('Ya va siendo hora');
    expect(html).toContain('Buscar portada');
    expect(html).toContain('Crónicas del Faro');
    // 5 numbered books in the saga plus the wanted 6: no number missing, the gap is the wanted one
    expect(count(html, /class="gap /g)).toBe(1);
    expect(html).toContain('lib-drawn');
    expect(html).toContain('Siguiente ▶');
  });

  it('a cover choice shows its candidates with the current one marked', () => {
    const b = book('Río', {
      coverArt: { source: 'subida', key: '', at: '2026-11-23T00:00:00.000Z', type: 'png' },
    });
    const html = renderToStaticMarkup(
      createElement(BookOpen, {
        book: b,
        books: [b],
        siblings: [b.id],
        today: TODAY,
        state: state([b]),
        search: {
          id: b.id,
          state: 'elige',
          stamp: 's1',
          at: 'x',
          candidates: [
            { label: 'Río · Ana Pérez', year: 1990 },
            { label: 'La de su ISBN', year: 0, byIsbn: true, current: true },
          ],
        },
        send: () => {},
        onSave: () => {},
        onDelete: () => {},
      }),
    );
    expect(html).toContain('Cambiar por una de estas');
    expect(html).toContain('1ª ed. 1990');
    expect(html).toContain('De su ISBN · la actual');
    expect(html).toContain('Dejar la que tiene');
    expect(html).toContain('/api/libros/candidata/');
  });

  it('the poster of a gap, and the form with the ISBN card', () => {
    const gap = book('El faro perdido', {
      wanted: true,
      price: '$350 MXN',
      authors: ['Marta Olmo'],
    });
    const poster = renderToStaticMarkup(
      createElement(WantedPoster, { book: gap, onDelete: () => {} }),
    );
    expect(poster).toContain('SE BUSCA');
    expect(poster).toContain('¡Ya lo tengo!');
    const s = state([gap], {
      view: { kind: 'form', mode: 'new', draft: emptyBook(TODAY) },
      lookup: {
        requestId: 'r',
        isbn: '9780306406157',
        state: 'ok',
        found: {
          title: 'El faro',
          authors: ['Marta Olmo'],
          publisher: 'Brújula',
          year: 2019,
          pages: 288,
          hasCover: true,
        },
      },
    });
    const form = renderToStaticMarkup(
      createElement(BookForm, {
        draft: emptyBook(TODAY),
        mode: 'new',
        state: s,
        books: [gap],
        send: () => {},
        onSave: () => {},
      }),
    );
    expect(form).toContain('Agregar libros');
    expect(form).toContain('Open Library dice que el 9780306406157 es:');
    expect(form).toContain('Pasar y guardar');
    expect(form).toContain('Trae portada');
    expect(form).toContain('Solo el título es obligatorio');
  });

  it('«¿Qué leo ahora?» proposes, with the reason', () => {
    const books = manyBooks();
    const html = renderToStaticMarkup(createElement(NextRead, { books, today: TODAY }));
    expect(html).toContain('¿Qué leo ahora?');
    expect(html).toContain('Seguir uno empezado');
    expect(count(html, /class="sp"/g)).toBe(3);
    expect(html).toMatch(/Lo estás leyendo\.|Se quedó a medias\./);
  });
});
