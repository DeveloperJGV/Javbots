import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { panelClosed, panelOpened } from '../../../webview-ui/src/office/owner/panelPresence.js';
import type { Send } from '../../coleccion/webview/ColeccionBits.js';
import { isoDay } from '../core/book.js';
import {
  buildShelves,
  type Grouping,
  GROUPINGS,
  moveFocus,
  type Shelf,
  shelfItems,
  suggest,
  type Suggestion,
  totals,
} from '../core/shelves.js';
import type { Book } from '../core/types.js';
import { BookForm } from './BookForm.js';
import { BookOpen, WantedPoster } from './BookOpen.js';
import {
  EMPTY_SLOTS,
  GROUPING_LABEL,
  LIB_TINT_BASE,
  LIBROS_CSS,
  PULL_OUT_MS,
  SPINE,
  SUGGEST_LIMIT,
} from './constants.js';
import { CoverSheet } from './CoverSheet.js';
import { type FormMode, type LibrosState, librosStore } from './librosStore.js';
import { problemsLine, summaryParts } from './librosText.js';
import { NextRead } from './NextRead.js';
import { type Offsets, ShelfRow } from './Shelves.js';
import { accentOf, spineOf, spineVars } from './spine.js';

const SERVER_SNAPSHOT = librosStore.get();

/** The magnifier of the search box, in pixels. */
function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 7 7"
      shape-rendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="0" width="3" height="1" />
      <rect x="0" y="1" width="1" height="3" />
      <rect x="4" y="1" width="1" height="3" />
      <rect x="1" y="4" width="3" height="1" />
      <rect x="4" y="4" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
      <rect x="6" y="6" width="1" height="1" />
    </svg>
  );
}

const GROUP_TEXT: Record<string, string> = { autor: 'Autor', saga: 'Saga', editorial: 'Editorial' };

/** The search: a book, an author, a saga or a publisher; a group lights up on every shelf, a book opens. */
function Search({ books }: { books: readonly Book[] }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const list = useMemo(() => suggest(books, query, SUGGEST_LIMIT), [books, query]);
  const show = focused && query.trim().length >= 2;

  const choose = (s: Suggestion | undefined) => {
    if (!s) return;
    setQuery('');
    (document.activeElement as HTMLElement | null)?.blur();
    if (s.kind === 'book') {
      librosStore.light(undefined);
      librosStore.openItem(s.book.id);
    } else librosStore.light({ kind: s.kind, value: s.value });
  };

  return (
    <div className="lib-search">
      <SearchIcon />
      <input
        id="lib-search"
        value={query}
        placeholder="Título, autor, saga…  ( / )"
        aria-label="Buscar por título, autor, saga o editorial"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (list.length)
              setSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(list[sel]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setQuery('');
            e.currentTarget.blur();
          }
        }}
      />
      {show && (
        <div className="lib-sugg" role="listbox">
          {list.length === 0 ? (
            <div className="none">Nada con eso. ¿Lo agregas con «+ Agregar»?</div>
          ) : (
            list.map((s, i) => (
              <button
                key={s.kind === 'book' ? s.book.id : `${s.kind}:${s.value}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
              >
                {s.kind === 'book' ? (
                  <>
                    <span
                      className={s.book.wanted ? 'mini gap' : 'mini'}
                      style={s.book.wanted ? undefined : spineVars(spineOf(s.book))}
                    />
                    <span className="nm">{s.book.title}</span>
                    <small>
                      {s.book.authors[0] ?? ''}
                      {s.book.wanted ? ' · se busca' : ''}
                    </small>
                  </>
                ) : (
                  <>
                    <span className="mini grp" />
                    <span className="nm">
                      {GROUP_TEXT[s.kind]}: {s.value}
                    </span>
                    <small>{s.owned === s.total ? `${s.total}` : `${s.owned} de ${s.total}`}</small>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** The rail: how the shelves go (genre, author, publisher, saga) and every shelf, with how many it has. */
function Rail({
  shelves,
  current,
  state,
  wantedCount,
}: {
  shelves: Shelf[];
  current: string | null;
  state: LibrosState;
  wantedCount: number;
}) {
  return (
    <nav className="lib-rail" aria-label="Repisas">
      <div className="hd">Repisas por</div>
      <div className="by" role="group" aria-label="Repisas por">
        {GROUPINGS.map((g) => (
          <button
            key={g}
            type="button"
            className="lib-chip"
            aria-pressed={state.grouping === g}
            onClick={() => librosStore.setGrouping(g as Grouping)}
          >
            {GROUPING_LABEL[g]}
          </button>
        ))}
      </div>
      {shelves.map((s) => (
        <button
          key={s.key || '-'}
          type="button"
          className={current === s.key ? 's on' : 's'}
          style={{ '--acc': accentOf(s.key ? s.name : '') } as CSSProperties}
          title={`Ir a ${s.name}`}
          onClick={() =>
            document
              .querySelector(`.lib-shelf[data-shelf="${CSS.escape(s.key)}"]`)
              ?.scrollIntoView({ block: 'start' })
          }
        >
          <i />
          <span className="nm">{s.name}</span>
          <span>{s.owned}</span>
        </button>
      ))}
      <div className="opts">
        <button
          type="button"
          className="lib-chip"
          aria-pressed={state.onlyWanted}
          disabled={!wantedCount}
          onClick={() => librosStore.toggleOnlyWanted()}
        >
          Solo «se busca» ({wantedCount})
        </button>
        {state.lit && (
          <button
            type="button"
            className="lib-chip"
            aria-pressed
            onClick={() => librosStore.light(undefined)}
          >
            {GROUP_TEXT[state.lit.kind]}: {state.lit.value} ×
          </button>
        )}
      </div>
    </nav>
  );
}

/** Nothing yet: a bare shelf with empty slots that invites to put the first one. */
function EmptyLibrary() {
  return (
    <div className="lib-empty">
      <h2>El librero está vacío</h2>
      <p>
        Cada género tiene su repisa (y se puede ordenar por autor, editorial o saga). Agrega tus
        libros uno tras otro: el título basta, y con el ISBN Open Library llena el resto. Lo que te
        falta se anota como «se busca», con el precio que viste.
      </p>
      <div className="lib-shelf" style={{ '--acc': accentOf('Novela') } as CSSProperties}>
        <div className="lib-wood">
          <div className="lib-track" style={{ '--h': `${SPINE.hardH + 30}px` } as CSSProperties}>
            <button
              type="button"
              className="lib-slot add"
              style={{ '--w': '36px', '--hh': `${SPINE.softH}px` } as CSSProperties}
              aria-label="Agregar el primero"
              onClick={() => librosStore.newBook()}
            >
              +
            </button>
            {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
              <span
                key={i}
                className="lib-slot"
                style={
                  {
                    '--w': `${SPINE.guessW + (i % 3) * 4}px`,
                    '--hh': `${SPINE.softH + ((i * 7) % 5) * 4}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className="row">
        <button type="button" className="lib-btn big" onClick={() => librosStore.newBook()}>
          + Agrega el primero
        </button>
        <button
          type="button"
          className="lib-btn"
          onClick={() => librosStore.newBook({ wanted: true })}
        >
          Anotar un «se busca»
        </button>
      </div>
    </div>
  );
}

/**
 * The book library (features/libros): shelves by genre (or author, publisher, saga) with the books drawn by code,
 * the "se busca" gaps with their price, a search that lights an author, a saga or a publisher, and «¿Qué leo
 * ahora?». Opens from its furniture (or the page's #libros hash).
 */
export function LibrosPanel({ transport }: { transport: MessageTransport }) {
  const state = useSyncExternalStore(librosStore.subscribe, librosStore.get, () => SERVER_SNAPSHOT);
  return state.open ? <LibrosOpen transport={transport} state={state} /> : null;
}

/** The panel's contents (exported for tests: it renders without the office). */
export function LibrosOpen({
  transport,
  state,
}: {
  transport: MessageTransport;
  state: LibrosState;
}) {
  const { status, view, selectedId } = state;
  const send: Send = useCallback((msg) => transport.send(msg), [transport]);
  const offsets = useRef<Offsets>(new Map()).current;
  const listRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [today] = useState(() => isoDay(Date.now()));

  const books = useMemo(() => status?.books ?? [], [status]);
  const shelves = useMemo(() => buildShelves(books, state.grouping), [books, state.grouping]);
  const t = totals(books);
  const parts = summaryParts(t);

  useEffect(() => {
    send({ type: 'librosOpen' });
    panelOpened();
    return panelClosed;
  }, [send]);

  // A book saved from Open Library's data with a cover: look for it now (by its ISBN, so it is exact)
  useEffect(() => {
    if (!state.findCoverId) return;
    send({ type: 'librosCoverFind', id: state.findCoverId });
    librosStore.coverFindSent();
  }, [state.findCoverId, send]);

  const save = useCallback(
    (draft: Book, mode: FormMode, findCover: boolean) => {
      const requestId = librosStore.startSave(mode, findCover);
      send({ type: 'librosSave', requestId, book: draft });
    },
    [send],
  );
  const quickSave = useCallback(
    (book: Book) => {
      const requestId = librosStore.startSave('edit');
      send({ type: 'librosSave', requestId, book });
    },
    [send],
  );
  const remove = useCallback(
    (id: string) => {
      const requestId = librosStore.startDelete();
      send({ type: 'librosDelete', requestId, id });
    },
    [send],
  );
  // The book comes out of the shelf, then opens
  const pullOut = useCallback((id: string) => {
    const b = librosStore.get().status?.books.find((x) => x.id === id);
    if (!b || b.wanted || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      librosStore.openItem(id);
      return;
    }
    librosStore.pull(id);
    setTimeout(() => {
      if (librosStore.get().pulling === id) librosStore.openItem(id);
    }, PULL_OUT_MS);
  }, []);

  // The rail follows the shelf at the top of the list
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const mark = () => {
      let act: string | null = null;
      for (const s of el.querySelectorAll<HTMLElement>('.lib-shelf[data-shelf]'))
        if (s.offsetTop <= el.scrollTop + 40 || act === null) act = s.dataset.shelf ?? null;
      setCurrent(act);
    };
    mark();
    el.addEventListener('scroll', mark);
    return () => el.removeEventListener('scroll', mark);
  }, [shelves]);

  // What a new book from a shelf's «+» starts with: that shelf's genre, author, publisher or saga
  const addTo = (s: Shelf) => {
    if (!s.key) return librosStore.newBook();
    const g = state.grouping;
    librosStore.newBook(
      g === 'genero'
        ? { genre: s.name }
        : g === 'autor'
          ? { authors: [s.name] }
          : g === 'editorial'
            ? { publisher: s.name }
            : { series: s.name },
    );
  };

  // Keyboard: / searches, N adds, arrows walk the books, Enter opens, Esc goes back one step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const s = librosStore.get();
      if (e.key === 'Escape') {
        if (typing && s.view.kind !== 'form') return;
        if (s.view.kind === 'form') librosStore.leaveForm();
        else if (s.view.kind !== 'shelves') librosStore.show({ kind: 'shelves' });
        else if (s.lit || s.onlyWanted) librosStore.light(undefined);
        else librosStore.close();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      // With a book open, the arrows go to the one before or after it on the shelf
      if (s.view.kind === 'book' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const open = s.view.id;
        const shelf = shelves.find((x) => shelfItems(x).some((b) => b.id === open));
        const ids = shelf
          ? shelfItems(shelf)
              .filter((b) => !b.wanted)
              .map((b) => b.id)
          : [];
        const next = ids[ids.indexOf(open) + (e.key === 'ArrowRight' ? 1 : -1)];
        if (next) librosStore.openItem(next);
        return;
      }
      if (s.view.kind !== 'shelves') return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('lib-search')?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        librosStore.newBook();
      } else if (e.key === 'Enter' && s.selectedId) {
        const el = document.activeElement;
        if (el instanceof HTMLElement && el.dataset.id) return; // the focused book's own click opens it
        e.preventDefault();
        pullOut(s.selectedId);
      } else if (/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
        e.preventDefault();
        const next = moveFocus(
          shelves,
          s.selectedId ?? null,
          e.key as Parameters<typeof moveFocus>[2],
        );
        if (!next) return;
        librosStore.select(next);
        document
          .querySelector<HTMLElement>(`.lib-track [data-id="${next}"]`)
          ?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shelves, pullOut]);

  // The light takes the color of the shelf you are on (or of the open book's genre)
  const openBook =
    view.kind === 'book' || view.kind === 'wanted'
      ? books.find((b) => b.id === view.id)
      : undefined;
  const currentShelf = shelves.find((s) => s.key === current);
  const tintName = openBook?.genre ?? (currentShelf && currentShelf.key ? currentShelf.name : '');
  const tint = tintName ? accentOf(tintName) : undefined;

  const shelfOf = (b: Book) =>
    shelves.find((s) => shelfItems(s).some((x) => x.id === b.id)) ?? shelves[0];
  const siblings =
    openBook && view.kind === 'book'
      ? shelfItems(shelfOf(openBook))
          .filter((b) => !b.wanted)
          .map((b) => b.id)
      : [];
  const problems = problemsLine(status?.problems ?? []);
  const run = status?.coverRun;

  return (
    <>
      <style>{LIBROS_CSS}</style>
      <div className="lib-backdrop" style={{ zIndex: 50 }} onClick={() => librosStore.close()} />
      <div
        className="lib-panel"
        style={
          {
            zIndex: 51,
            ...(tint ? { '--lib-tint': `color-mix(in srgb, ${tint} 40%, ${LIB_TINT_BASE})` } : {}),
          } as CSSProperties
        }
        role="dialog"
        aria-label="Librero"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <div className="lib-head">
          <div>
            <h1>Librero</h1>
            <div className="sub">
              {status ? (
                <>
                  <b>{parts.owned}</b>
                  {parts.rest.map((p) => (
                    <span key={p}> · {p}</span>
                  ))}
                  {parts.wanted && (
                    <>
                      {' · '}
                      <i>{parts.wanted}</i>
                    </>
                  )}
                </>
              ) : (
                'Sin conexión con la oficina'
              )}
            </div>
          </div>
          {status && <Search books={books} />}
          {status && (
            <>
              <button
                type="button"
                className="lib-btn"
                onClick={() => librosStore.newBook()}
                title="Agregar (N)"
              >
                + Agregar
              </button>
              <button
                type="button"
                className="lib-btn big"
                onClick={() =>
                  librosStore.show(view.kind === 'next' ? { kind: 'shelves' } : { kind: 'next' })
                }
              >
                ¿Qué leo ahora?
              </button>
              <button
                type="button"
                className="lib-btn"
                aria-pressed={view.kind === 'covers'}
                title="Buscar en Open Library las portadas que faltan"
                onClick={() =>
                  librosStore.show(
                    view.kind === 'covers' ? { kind: 'shelves' } : { kind: 'covers' },
                  )
                }
              >
                {run?.running ? `Portadas ${run.done}/${run.total}` : 'Portadas'}
              </button>
            </>
          )}
          <button
            type="button"
            className="lib-btn lib-sq"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            style={status ? undefined : { marginLeft: 'auto' }}
            onClick={() => librosStore.close()}
          >
            ×
          </button>
        </div>
        <div className="lib-body">
          {!status ? (
            <div className="lib-locked">
              El librero no está disponible en esta página. Ábrelo con el enlace con token de la
              oficina.
            </div>
          ) : (
            <>
              <Rail shelves={shelves} current={current} state={state} wantedCount={t.wanted} />
              {books.length === 0 ? (
                <EmptyLibrary />
              ) : (
                <div className="lib-shelves" ref={listRef}>
                  {shelves.map((s) => (
                    <ShelfRow
                      key={`${state.grouping}:${s.key}`}
                      shelf={s}
                      accent={accentOf(s.key ? s.name : '')}
                      today={today}
                      offsets={offsets}
                      selectedId={selectedId}
                      pulling={state.pulling}
                      lit={state.lit}
                      onlyWanted={state.onlyWanted}
                      onOpen={pullOut}
                      onAdd={() => addTo(s)}
                    />
                  ))}
                </div>
              )}
              {problems && (
                <div className="lib-problems" title={status.problems.join('\n')}>
                  ▲ {problems}
                </div>
              )}
            </>
          )}
        </div>
        {openBook && view.kind === 'wanted' && <WantedPoster book={openBook} onDelete={remove} />}
        {openBook && view.kind === 'book' && (
          <BookOpen
            key={openBook.id}
            book={openBook}
            books={books}
            siblings={siblings}
            today={today}
            state={state}
            search={status?.covers.find((c) => c.id === openBook.id)}
            send={send}
            onSave={quickSave}
            onDelete={remove}
          />
        )}
        {view.kind === 'covers' && (
          <>
            <div className="lib-veil" onClick={() => librosStore.show({ kind: 'shelves' })} />
            <CoverSheet books={books} state={state} send={send} />
          </>
        )}
        {view.kind === 'form' && (
          <>
            <div className="lib-veil" onClick={() => librosStore.leaveForm()} />
            <BookForm
              draft={view.draft}
              mode={view.mode}
              state={state}
              books={books}
              send={send}
              onSave={save}
            />
          </>
        )}
        {view.kind === 'next' && (
          <>
            <div className="lib-veil" onClick={() => librosStore.show({ kind: 'shelves' })} />
            <NextRead books={books} today={today} />
          </>
        )}
        {state.formError && view.kind !== 'form' && view.kind !== 'book' && (
          <div className="lib-problems">▲ {state.formError}</div>
        )}
      </div>
    </>
  );
}
