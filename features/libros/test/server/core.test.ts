import { describe, expect, it } from 'vitest';

import {
  bookFileContent,
  emptyBook,
  mergeSave,
  normalizeBook,
  parseAuthors,
  readLibrary,
} from '../../core/book.js';
import { coverIdentityChanged, runSearches } from '../../core/cover.js';
import { canonicalGenre, genreOrder, GENRES } from '../../core/genres.js';
import { cleanIsbn, isbn13, isbnValid } from '../../core/isbn.js';
import { docScore, parseBooksApi, parseSearch, pickCandidates } from '../../core/lookup.js';
import { defaultNextAsk, fitsLength, nextPicks, sagaNext } from '../../core/next.js';
import {
  buildShelves,
  matchesLit,
  moveFocus,
  shelfItems,
  suggest,
  totals,
} from '../../core/shelves.js';
import type { Book } from '../../core/types.js';

const TODAY = '2026-11-23';
let n = 0;
/** An invented book (titles, authors and publishers made up for the tests). */
const book = (title: string, extra: Partial<Book> = {}): Book => ({
  ...emptyBook('2026-01-01'),
  id: `b${String(++n).padStart(5, '0')}`,
  title,
  ...extra,
});

describe('libros core: isbn', () => {
  it('keeps digits and a final X, checks the check digit, and makes the ISBN-13', () => {
    expect(cleanIsbn('978-0-306-40615-7')).toBe('9780306406157');
    expect(cleanIsbn(' 0-306-40615-2 ')).toBe('0306406152');
    expect(cleanIsbn('0-8044-2957-x')).toBe('080442957X');
    expect(cleanIsbn('12X45')).toBe('1245');
    expect(isbnValid('9780306406157')).toBe(true);
    expect(isbnValid('9780306406158')).toBe(false);
    expect(isbnValid('0306406152')).toBe(true);
    expect(isbnValid('080442957X')).toBe(true);
    expect(isbnValid('12345')).toBe(false);
    expect(isbn13('0306406152')).toBe('9780306406157');
    expect(isbn13('9780306406157')).toBe('9780306406157');
    expect(isbn13('0306406153')).toBeNull();
  });
});

describe('libros core: the file', () => {
  it('splits authors by commas, semicolons and &, never by « y »', () => {
    expect(parseAuthors('Ana Pérez, Luis Gómez; Eva Ruiz & Juan Sol')).toEqual([
      'Ana Pérez',
      'Luis Gómez',
      'Eva Ruiz',
      'Juan Sol',
    ]);
    expect(parseAuthors('José Ortega y Gasset')).toEqual(['José Ortega y Gasset']);
    expect(parseAuthors(['Ana Pérez', 'ana perez', '', 3])).toEqual(['Ana Pérez']);
    expect(parseAuthors(undefined)).toEqual([]);
  });

  it('reads leniently: defaults, cuts, unknown fields kept apart, problems said', () => {
    const r = normalizeBook(
      {
        id: 'abcd1234',
        title: '  El   faro\nde niebla ',
        authors: 'Marta Olmo',
        genre: 'ciencia ficcion',
        year: 1200,
        pages: -4,
        format: 'tapa',
        reading: 'leido',
        isbn: '978-0-306-40615-7',
        seriesNumber: 3,
        lentAt: '2026-01-01',
        shelfColor: 'azul',
      },
      TODAY,
    );
    expect(r?.book).toMatchObject({
      id: 'abcd1234',
      title: 'El faro de niebla',
      authors: ['Marta Olmo'],
      genre: 'Ciencia ficción',
      year: 0,
      pages: 0,
      format: '',
      reading: 'leido',
      isbn: '9780306406157',
      seriesNumber: 0, // no saga, no number
      lentAt: '', // lent to nobody
      addedAt: TODAY,
    });
    expect(r?.unknown).toEqual({ shelfColor: 'azul' });
    expect(r?.problems.join(' ')).toContain('año no válido');
    expect(normalizeBook({}, TODAY)?.book.title).toBe('Libro sin título');
    expect(normalizeBook([], TODAY)).toBeNull();
  });

  it('a wanted gap has no reading, loan or finish date', () => {
    const b = normalizeBook(
      { title: 'X', wanted: true, reading: 'leyendo', lentTo: 'Ana', finishedAt: '2026-01-01' },
      TODAY,
    )!.book;
    expect([b.reading, b.lentTo, b.finishedAt]).toEqual(['', '', '']);
  });

  it('ignores a cover that is not right and keeps a good one', () => {
    const good = {
      source: 'openlibrary',
      key: 'isbn:9780306406157',
      at: '2026-11-23T01:00:00.000Z',
      type: 'jpg',
    };
    expect(normalizeBook({ title: 'A', coverArt: good }, TODAY)?.book.coverArt).toEqual(good);
    for (const key of ['../x', 'C:\\a', 'isbn:12', 'cualquier cosa'])
      expect(
        normalizeBook({ title: 'A', coverArt: { ...good, key } }, TODAY)?.book.coverArt,
      ).toBeUndefined();
    expect(
      normalizeBook({ title: 'A', coverArt: { ...good, source: 'web' } }, TODAY)?.problems,
    ).toHaveLength(1);
  });

  it('writes known fields in order, then the unknown ones, and gives repeated ids a fresh one', () => {
    const b = book('Uno');
    const out = bookFileContent(b, { extra: 1, title: 'no pisa' });
    expect(Object.keys(out).slice(0, 3)).toEqual(['id', 'title', 'authors']);
    expect(out.title).toBe('Uno');
    expect(out.extra).toBe(1);
    const read = readLibrary(
      { books: [{ id: 'aaaa1111', title: 'A' }, { id: 'aaaa1111', title: 'B' }, 5] },
      TODAY,
    );
    expect(read.books.map((r) => r.book.id)).toEqual(['aaaa1111', 'x0001']);
    expect(read.problems.some((p) => p.includes('renglón 3'))).toBe(true);
    expect(readLibrary('no', TODAY).problems).toHaveLength(1);
  });

  it('a save keeps id and arrival, dates the loan and the finish once', () => {
    const before = book('A', { addedAt: '2026-01-01' });
    const lent = mergeSave(before, { ...before, lentTo: 'Ana' }, TODAY, 'T');
    expect(lent.lentAt).toBe(TODAY);
    expect(lent.addedAt).toBe('2026-01-01');
    const again = mergeSave(lent, { ...lent, notes: 'x' }, '2026-12-01', 'T');
    expect(again.lentAt).toBe(TODAY);
    expect(mergeSave(lent, { ...lent, lentTo: 'Luis' }, '2026-12-01', 'T').lentAt).toBe(
      '2026-12-01',
    );
    expect(mergeSave(lent, { ...lent, lentTo: '' }, '2026-12-01', 'T').lentAt).toBe('');
    const read = mergeSave(before, { ...before, reading: 'leido' }, TODAY, 'T');
    expect(read.finishedAt).toBe(TODAY);
    expect(mergeSave(read, { ...read, notes: 'y' }, '2027-01-01', 'T').finishedAt).toBe(TODAY);
    expect(mergeSave(read, { ...read, reading: 'leyendo' }, TODAY, 'T').finishedAt).toBe('');
    const gap = book('G', { wanted: true, addedAt: '2026-01-01' });
    expect(mergeSave(gap, { ...gap, wanted: false }, TODAY, 'T').addedAt).toBe(TODAY);
    expect(mergeSave(undefined, book('N'), TODAY, 'T').addedAt).toBe(TODAY);
  });

  it('knows when what a cover is searched by changed', () => {
    const a = book('Río Lento', { authors: ['Ana Pérez'] });
    expect(coverIdentityChanged(a, { ...a, title: 'rio lento' })).toBe(false);
    expect(coverIdentityChanged(a, { ...a, notes: 'x' })).toBe(false);
    expect(coverIdentityChanged(a, { ...a, title: 'Río Rápido' })).toBe(true);
    expect(coverIdentityChanged(a, { ...a, authors: ['Otra'] })).toBe(true);
    expect(coverIdentityChanged(a, { ...a, isbn: '9780306406157' })).toBe(true);
  });
});

describe('libros core: shelves', () => {
  const lib = [
    book('Zeta', { genre: 'Novela', authors: ['Bruno Ríos'] }),
    book('Alfa', { genre: 'Novela', authors: ['Ana Pérez'] }),
    book('Faro 2', { genre: 'Fantasía', authors: ['Marta Olmo'], series: 'Faro', seriesNumber: 2 }),
    book('Faro 1', { genre: 'Fantasía', authors: ['Marta Olmo'], series: 'Faro', seriesNumber: 1 }),
    book('Suelto', { genre: 'Fantasía', authors: ['Marta Olmo'] }),
    book('Sin nada'),
    book('Cocina de río', { genre: 'Cocina', publisher: 'Brújula' }),
    book('Raro', { genre: 'Jardinería' }),
    book('Buscado', { genre: 'Novela', wanted: true, authors: ['Ana Pérez'] }),
  ];

  it('stands genres in their order, others after, none last; sagas together with their plaque', () => {
    const s = buildShelves(lib, 'genero');
    expect(s.map((x) => x.name)).toEqual([
      'Novela',
      'Fantasía',
      'Cocina',
      'Jardinería',
      'Sin género',
    ]);
    expect(shelfItems(s[0]).map((b) => b.title)).toEqual(['Alfa', 'Buscado', 'Zeta']);
    expect(s[0]).toMatchObject({ owned: 2, wanted: 1 });
    expect(s[1].runs[0]).toMatchObject({ series: 'Faro' });
    expect(s[1].runs[0].items.map((b) => b.title)).toEqual(['Faro 1', 'Faro 2']);
    expect(s[1].runs[1]).toMatchObject({ series: null });
    expect(genreOrder('poesia')).toBe(GENRES.indexOf('Poesía'));
    expect(canonicalGenre('CIENCIA FICCIÓN')).toBe('Ciencia ficción');
  });

  it('groups by author, publisher and saga too', () => {
    expect(buildShelves(lib, 'autor').map((x) => x.name)).toEqual([
      'Ana Pérez',
      'Bruno Ríos',
      'Marta Olmo',
      'Sin autor',
    ]);
    expect(buildShelves(lib, 'editorial').map((x) => x.name)).toEqual(['Brújula', 'Sin editorial']);
    const sagas = buildShelves(lib, 'saga');
    expect(sagas[0].name).toBe('Faro');
    expect(shelfItems(sagas[0]).map((b) => b.seriesNumber)).toEqual([1, 2]);
    expect(sagas.at(-1)?.name).toBe('Sin saga');
  });

  it('suggests authors, sagas and publishers, then books', () => {
    const s = suggest(lib, 'mar');
    expect(s[0]).toMatchObject({ kind: 'autor', value: 'Marta Olmo', total: 3 });
    expect(s.some((x) => x.kind === 'book' && x.book.title === 'Faro 1')).toBe(true);
    expect(suggest(lib, 'f')).toEqual([]);
    const faro = suggest(lib, 'faro');
    expect(faro[0]).toMatchObject({ kind: 'saga', value: 'Faro' });
    expect(matchesLit(lib[2], { kind: 'saga', value: 'faro' })).toBe(true);
    expect(matchesLit(lib[0], { kind: 'autor', value: 'ana perez' })).toBe(false);
  });

  it('counts the whole library and walks it with the keyboard', () => {
    expect(totals([...lib, book('L', { lentTo: 'Ana', reading: 'leyendo' })])).toMatchObject({
      owned: 9,
      wanted: 1,
      reading: 1,
      lent: 1,
    });
    const s = buildShelves(lib, 'genero');
    const first = shelfItems(s[0])[0].id;
    expect(moveFocus(s, null, 'ArrowRight')).toBe(first);
    expect(moveFocus(s, first, 'ArrowDown')).toBe(shelfItems(s[1])[0].id);
    expect(moveFocus(s, first, 'End')).toBe(shelfItems(s[0]).at(-1)?.id);
  });
});

describe('libros core: «¿Qué leo ahora?»', () => {
  const saga = [
    book('Ola 1', { series: 'Ola', seriesNumber: 1, reading: 'leido' }),
    book('Ola 2', { series: 'Ola', seriesNumber: 2, reading: 'leido' }),
    book('Ola 3', { series: 'Ola', seriesNumber: 3, reading: 'sin-leer', pages: 150 }),
    book('Ola 4', { series: 'Ola', seriesNumber: 4, reading: 'sin-leer' }),
  ];

  it('the next of a saga begun is the lowest unread after the last read', () => {
    const next = sagaNext(saga);
    expect(next.get('ola')?.book.title).toBe('Ola 3');
    expect(next.get('ola')?.after).toBe(2);
    expect(sagaNext([book('X 1', { series: 'X', seriesNumber: 1 })]).size).toBe(0);
  });

  it('asks first to go on with one started, then the saga, then one waiting', () => {
    expect(defaultNextAsk([...saga, book('A', { reading: 'leyendo' })]).mood).toBe('seguir');
    expect(defaultNextAsk(saga).mood).toBe('saga');
    expect(defaultNextAsk([book('B')]).mood).toBe('pendiente');
  });

  it('picks three with the reason, skips lent ones, and pages through', () => {
    const lib = [
      ...saga,
      book('Viejo', { reading: 'sin-leer', addedAt: '2020-01-01' }),
      book('Nuevo', { reading: 'sin-leer', addedAt: '2026-11-01' }),
      book('Prestado', { reading: 'sin-leer', lentTo: 'Ana', addedAt: '2019-01-01' }),
    ];
    const saga1 = nextPicks(lib, { mood: 'saga', length: '', genre: '' }, 0, TODAY);
    expect(saga1.picks.map((p) => p.book.title)).toEqual(['Ola 3']);
    expect(saga1.picks[0].why).toContain('hasta el 2');
    const waiting = nextPicks(lib, { mood: 'pendiente', length: '', genre: '' }, 0, TODAY);
    expect(waiting.picks[0].book.title).toBe('Viejo');
    expect(waiting.picks.some((p) => p.book.title === 'Prestado')).toBe(false);
    expect(waiting.picks[0].why).toMatch(/^Llegó hace .* y sigue sin leerse\.$/);
    const short = nextPicks(lib, { mood: 'pendiente', length: 'corto', genre: '' }, 0, TODAY);
    // Ola 3 has 150 pages; the ones that do not say fit any length
    expect(short.picks.map((p) => p.book.title)).toContain('Ola 3');
    expect(fitsLength(600, 'corto')).toBe(false);
    expect(fitsLength(600, 'largo')).toBe(true);
    expect(fitsLength(0, 'largo')).toBe(true);
    const page2 = nextPicks(lib, { mood: 'pendiente', length: '', genre: '' }, 1, TODAY);
    expect(page2.total).toBe(4);
    expect(page2.picks).toHaveLength(1);
  });
});

describe('libros core: Open Library answers', () => {
  it('reads the books API by ISBN, untidy as it comes', () => {
    const raw = {
      'ISBN:9780306406157': {
        title: 'El faro de niebla. - 2a edición',
        authors: [{ name: 'Marta Olmo', url: 'x' }],
        publishers: [{ name: '  Editorial Brújula ' }],
        publish_date: 'October 1, 2014',
        number_of_pages: 320,
        cover: { large: 'https://covers.openlibrary.org/b/id/123456-L.jpg' },
      },
    };
    expect(parseBooksApi(raw, '9780306406157')).toEqual({
      title: 'El faro de niebla. - 2a edición',
      authors: ['Marta Olmo'],
      publisher: 'Editorial Brújula',
      year: 2014,
      pages: 320,
      coverId: '123456',
    });
    expect(parseBooksApi({}, '9780306406157')).toBeNull();
    expect(parseBooksApi({ 'ISBN:9780306406157': { title: '' } }, '9780306406157')).toBeNull();
    expect(parseBooksApi(null, 'x')).toBeNull();
  });

  it('reads a search, keeping only results with a cover', () => {
    const docs = parseSearch({
      docs: [
        { title: 'Río Lento', author_name: ['Ana Pérez'], first_publish_year: 1990, cover_i: 77 },
        { title: 'Sin portada', author_name: ['Ana Pérez'] },
        'nada',
      ],
    });
    expect(docs).toEqual([
      { title: 'Río Lento', authors: ['Ana Pérez'], year: 1990, coverId: '77' },
    ]);
    expect(parseSearch({})).toEqual([]);
  });

  it('only offers what looks like the book, never another author', () => {
    const b = { title: 'Río lento', authors: ['Ana Pérez'] };
    const doc = (title: string, authors: string[], coverId: string) => ({
      title,
      authors,
      year: 0,
      coverId,
    });
    expect(docScore(b, doc('Rio Lento', ['Ana Pérez'], '1'))).toBe(1);
    expect(docScore(b, doc('Río lento: edición crítica', ['A. Pérez'], '2'))).toBe(0.9);
    expect(docScore(b, doc('Río lento', ['Otro Autor'], '3'))).toBe(0);
    expect(docScore(b, doc('Montaña', ['Ana Pérez'], '4'))).toBe(0);
    const picked = pickCandidates(b, [
      doc('Montaña', ['Ana Pérez'], '4'),
      doc('Río lento: edición crítica', ['Ana Pérez'], '2'),
      doc('Río lento', ['Ana Pérez'], '1'),
      doc('Río lento', ['Ana Pérez'], '1'),
    ]);
    expect(picked.map((p) => p.coverId)).toEqual(['1', '2']);
  });

  it('«Buscar las que faltan» skips what is settled and retries what did not answer', () => {
    const b = { wanted: false };
    expect(runSearches(b, undefined)).toBe(true);
    expect(runSearches({ wanted: true }, undefined)).toBe(false);
    expect(runSearches({ ...b, coverNone: 'x' }, undefined)).toBe(false);
    expect(runSearches(b, { state: 'elige' })).toBe(false);
    expect(runSearches(b, { state: 'nada', reason: 'sin-coincidencia' })).toBe(false);
    expect(runSearches(b, { state: 'nada', reason: 'sin-respuesta' })).toBe(true);
    expect(runSearches(b, { state: 'nada', reason: 'cambio' })).toBe(true);
  });
});
