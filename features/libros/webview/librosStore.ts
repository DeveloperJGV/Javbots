import type {
  LibrosCoverProgress,
  LibrosCoverState,
  LibrosLookupFound,
  LibrosLookupReason,
} from '../../../core/src/messages.js';
import { emptyBook, isoDay, normalizeBook } from '../core/book.js';
import { DEFAULT_GROUPING, type Grouping, type Lit } from '../core/shelves.js';
import type { Book } from '../core/types.js';
import { LIBROS_PANEL_TYPES } from './constants.js';

/** What librosStatus carries (core/asyncapi.yaml, block "Book library"). */
export interface LibrosStatusView {
  books: Book[];
  file: string;
  problems: string[];
  covers: LibrosCoverState[];
  coverRun?: LibrosCoverProgress;
}

/** How the form was opened: a new book (and then another), an edit, or a "se busca" gap that was bought. */
export type FormMode = 'new' | 'edit' | 'acquire';

export type LibrosView =
  | { kind: 'shelves' }
  | { kind: 'book'; id: string }
  | { kind: 'wanted'; id: string }
  | { kind: 'form'; mode: FormMode; draft: Book }
  | { kind: 'next' }
  | { kind: 'covers' };

/** An ISBN asked to Open Library from the form, and how it went. */
export interface LookupView {
  requestId: string;
  isbn: string;
  state: 'buscando' | 'ok' | 'nada';
  found?: LibrosLookupFound;
  reason?: LibrosLookupReason;
}

/** A cover action sent and not answered yet (only one at a time). */
export type CoverOpKind = 'pick' | 'dismiss' | 'remove' | 'upload';

export interface LibrosState {
  open: boolean;
  /** Undefined until the server sends it (tokened pages only). */
  status?: LibrosStatusView;
  view: LibrosView;
  /** The book with the keyboard / selection outline. */
  selectedId?: string;
  grouping: Grouping;
  /** Only the "se busca" gaps lit. */
  onlyWanted: boolean;
  /** An author, saga or publisher lit on every shelf (from the search). */
  lit?: Lit;
  /** The form: a save in course (and whether its cover is looked for once saved), its error, the last saved. */
  pending?: { requestId: string; kind: 'save' | 'delete'; mode?: FormMode; findCover?: boolean };
  formError?: string;
  lastSaved?: string;
  savedInRow: number;
  /** Changes when the form must put the cursor back in its first field (after "save and next"). */
  focusName: number;
  /** Where the cursor goes after "save and next": the title, or the ISBN when the last one came from it. */
  focusField: 'title' | 'isbn';
  lookup?: LookupView;
  /** The draft took Open Library's data and it has a cover: look for it once saved. */
  draftFromIsbn?: boolean;
  /** A book just saved whose cover is to be looked for (the panel sends it and clears it). */
  findCoverId?: string;
  /** A cover action waiting for its answer, and the last one's error. */
  op?: { requestId: string; kind: CoverOpKind; id?: string };
  opError?: string;
  /** The book coming out of the shelf (a moment before it opens). */
  pulling?: string;
}

/** Said when the connection to the office drops with something waiting for an answer. */
export const CONNECTION_LOST_TEXT = 'Se cayó la conexión con la oficina; vuelve a intentarlo.';

let counter = 0;
const newRequestId = () => `${Date.now().toString(36)}-${++counter}`;

const initial = (): LibrosState => ({
  open: false,
  view: { kind: 'shelves' },
  grouping: DEFAULT_GROUPING,
  onlyWanted: false,
  savedInRow: 0,
  focusName: 0,
  focusField: 'title',
});

/** A book from the wire, typed (the same lenient reading as the file). */
export function fromWire(raw: unknown, today = isoDay(Date.now())): Book | null {
  return normalizeBook(raw, today)?.book ?? null;
}

/**
 * What stays in the form after "save and next": genre, format, language, owner and whether it is a «se busca»;
 * and when the book was part of a saga, the author, publisher and saga too, with the next number (a whole saga
 * goes in one after another).
 */
export function nextDraft(d: Book, today: string): Book {
  const keep: Partial<Book> = {
    genre: d.genre,
    format: d.format,
    language: d.language,
    owner: d.owner,
    wanted: d.wanted,
  };
  if (d.series)
    Object.assign(keep, {
      authors: [...d.authors],
      publisher: d.publisher,
      series: d.series,
      seriesNumber: d.seriesNumber ? d.seriesNumber + 1 : 0,
    });
  return emptyBook(today, keep);
}

/** The book library (features/libros), outside React: the panel reads it, useLibros feeds it. */
export class LibrosStore {
  private state: LibrosState = initial();
  private listeners = new Set<() => void>();

  get = (): LibrosState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<LibrosState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** For tests. */
  reset(): void {
    this.state = initial();
    for (const l of this.listeners) l();
  }

  open(): void {
    this.set({ open: true, view: { kind: 'shelves' } });
  }

  close(): void {
    this.set({
      open: false,
      pending: undefined,
      formError: undefined,
      lit: undefined,
      op: undefined,
      opError: undefined,
      lookup: undefined,
      pulling: undefined,
    });
  }

  setStatus(raw: {
    books: unknown[];
    file: string;
    problems: string[];
    covers?: LibrosCoverState[];
    coverRun?: LibrosCoverProgress;
  }): void {
    const books = raw.books.map((b) => fromWire(b)).filter((b): b is Book => b !== null);
    let { view } = this.state;
    const openId = view.kind === 'book' || view.kind === 'wanted' ? view.id : null;
    if (openId !== null && !books.some((b) => b.id === openId)) view = { kind: 'shelves' };
    this.set({
      status: {
        books,
        file: raw.file,
        problems: raw.problems,
        covers: Array.isArray(raw.covers) ? raw.covers : [],
        coverRun: raw.coverRun,
      },
      view,
    });
  }

  /** A dropped connection never answers what was waiting: free the buttons and say so. */
  connectionLost(): void {
    const next: Partial<LibrosState> = {};
    if (this.state.op && this.state.op.kind !== 'upload') {
      next.op = undefined;
      next.opError = CONNECTION_LOST_TEXT;
    }
    if (this.state.pending) {
      next.pending = undefined;
      next.formError = CONNECTION_LOST_TEXT;
    }
    if (this.state.lookup?.state === 'buscando')
      next.lookup = { ...this.state.lookup, state: 'nada', reason: 'sin-respuesta' };
    if (Object.keys(next).length > 0) this.set(next);
  }

  /** The server's answer to a save or a delete (or to a cover action). */
  setResult(result: { requestId: string; ok: boolean; id?: string; error?: string }): void {
    const op = this.state.op;
    if (op && op.requestId === result.requestId) {
      this.set({ op: undefined, opError: result.ok ? undefined : (result.error ?? 'No se pudo.') });
      return;
    }
    const pending = this.state.pending;
    if (!pending || pending.requestId !== result.requestId) return;
    if (!result.ok) {
      this.set({ pending: undefined, formError: result.error ?? 'No se pudo.' });
      return;
    }
    if (pending.kind === 'delete') {
      this.set({ pending: undefined, view: { kind: 'shelves' }, selectedId: undefined });
      return;
    }
    const findCoverId = pending.findCover && result.id ? result.id : undefined;
    const view = this.state.view;
    if (pending.mode === 'new' && view.kind === 'form') {
      // Many in a row: what repeats stays, the rest clears, the cursor goes back to where it started
      this.set({
        pending: undefined,
        formError: undefined,
        lastSaved: view.draft.title,
        savedInRow: this.state.savedInRow + 1,
        view: { kind: 'form', mode: 'new', draft: nextDraft(view.draft, isoDay(Date.now())) },
        selectedId: result.id,
        focusName: this.state.focusName + 1,
        lookup: undefined,
        draftFromIsbn: false,
        findCoverId,
      });
      return;
    }
    this.set({
      pending: undefined,
      formError: undefined,
      selectedId: result.id,
      view: result.id ? { kind: 'book', id: result.id } : { kind: 'shelves' },
      lookup: undefined,
      draftFromIsbn: false,
      findCoverId,
    });
  }

  coverFindSent(): void {
    if (this.state.findCoverId) this.set({ findCoverId: undefined });
  }

  show(view: LibrosView): void {
    this.set({ view, formError: undefined, opError: undefined, pulling: undefined });
  }

  select(id: string | undefined): void {
    if (id !== this.state.selectedId) this.set({ selectedId: id });
  }

  /** The book comes out of the shelf (a moment), then opens. */
  pull(id: string): void {
    this.set({ pulling: id, selectedId: id });
  }

  /** Opens a book: the open book, or the poster of a gap. */
  openItem(id: string): void {
    const b = this.state.status?.books.find((x) => x.id === id);
    if (!b) return;
    this.set({
      selectedId: id,
      view: b.wanted ? { kind: 'wanted', id } : { kind: 'book', id },
      opError: undefined,
      pulling: undefined,
    });
  }

  /** The form for a new book (with a genre when it comes from a genre shelf), an edit, or a bought gap. */
  newBook(keep: Partial<Book> = {}): void {
    this.set({
      view: { kind: 'form', mode: 'new', draft: emptyBook(isoDay(Date.now()), keep) },
      formError: undefined,
      lastSaved: undefined,
      savedInRow: 0,
      focusName: this.state.focusName + 1,
      lookup: undefined,
      draftFromIsbn: false,
    });
  }

  edit(book: Book, mode: Exclude<FormMode, 'new'> = 'edit'): void {
    const draft =
      mode === 'acquire' ? { ...book, wanted: false, price: '', seenAt: '' } : { ...book };
    this.set({
      view: { kind: 'form', mode, draft },
      formError: undefined,
      lastSaved: undefined,
      lookup: undefined,
      draftFromIsbn: false,
      focusName: this.state.focusName + 1,
    });
  }

  /** Leaves the form: an edit (or a gap being bought) goes back to its book or poster, a new one to the shelves. */
  leaveForm(): void {
    const v = this.state.view;
    if (v.kind !== 'form') return;
    const saved = v.draft.id
      ? this.state.status?.books.find((b) => b.id === v.draft.id)
      : undefined;
    this.set({ lookup: undefined });
    if (v.mode === 'new' || !saved) this.show({ kind: 'shelves' });
    else
      this.show(saved.wanted ? { kind: 'wanted', id: saved.id } : { kind: 'book', id: saved.id });
  }

  updateDraft(patch: Partial<Book>): void {
    const v = this.state.view;
    if (v.kind === 'form') this.set({ view: { ...v, draft: { ...v.draft, ...patch } } });
  }

  /** A save is about to be sent: its request id. */
  startSave(mode: FormMode, findCover = false): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'save', mode, findCover }, formError: undefined });
    return requestId;
  }

  startDelete(): string {
    const requestId = newRequestId();
    this.set({ pending: { requestId, kind: 'delete' }, formError: undefined });
    return requestId;
  }

  setFormError(message: string): void {
    this.set({ formError: message });
  }

  /** An ISBN is about to be asked: its request id. */
  startLookup(isbn: string): string {
    const requestId = newRequestId();
    this.set({ lookup: { requestId, isbn, state: 'buscando' }, focusField: 'isbn' });
    return requestId;
  }

  setLookup(r: {
    requestId: string;
    ok: boolean;
    isbn: string;
    found?: LibrosLookupFound;
    reason?: LibrosLookupReason;
  }): void {
    const l = this.state.lookup;
    if (!l || l.requestId !== r.requestId) return;
    this.set({
      lookup:
        r.ok && r.found
          ? { ...l, state: 'ok', found: r.found }
          : { ...l, state: 'nada', reason: r.reason ?? 'desconocido' },
    });
  }

  /** «Pasar a la ficha»: what Open Library said goes into the draft (only what it said). */
  useLookup(): void {
    const l = this.state.lookup;
    const v = this.state.view;
    if (!l?.found || v.kind !== 'form') return;
    const f = l.found;
    const patch: Partial<Book> = { isbn: l.isbn };
    if (f.title) patch.title = f.title;
    if (f.authors.length) patch.authors = [...f.authors];
    if (f.publisher) patch.publisher = f.publisher;
    if (f.year) patch.year = f.year;
    if (f.pages) patch.pages = f.pages;
    this.set({
      view: { ...v, draft: { ...v.draft, ...patch } },
      lookup: undefined,
      draftFromIsbn: f.hasCover,
    });
  }

  dropLookup(): void {
    this.set({ lookup: undefined });
  }

  setFocusField(field: 'title' | 'isbn'): void {
    if (field !== this.state.focusField) this.set({ focusField: field });
  }

  /** A cover action is about to be sent: its request id (the answer comes as librosResult). */
  startOp(kind: CoverOpKind, id?: string): string {
    const requestId = newRequestId();
    this.set({ op: { requestId, kind, id }, opError: undefined });
    return requestId;
  }

  /** An upload ended (it answers over HTTP, not with librosResult). */
  endUpload(requestId: string, error?: string): void {
    if (this.state.op?.requestId !== requestId) return;
    this.set({ op: undefined, opError: error });
  }

  setOpError(message: string | undefined): void {
    this.set({ opError: message });
  }

  setGrouping(grouping: Grouping): void {
    this.set({ grouping });
  }

  toggleOnlyWanted(): void {
    this.set({ onlyWanted: !this.state.onlyWanted, lit: undefined });
  }

  light(lit: Lit | undefined): void {
    this.set({ lit, onlyWanted: false });
  }
}

export const librosStore = new LibrosStore();

/** A piece that opens the library panel. */
export const isLibrosFurniture = (type: string | undefined): boolean =>
  LIBROS_PANEL_TYPES.includes((type ?? '').split(':')[0]);
