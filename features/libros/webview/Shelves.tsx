import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { authorsText } from '../core/book.js';
import { type Lit, matchesLit, type Shelf, shelfItems } from '../core/shelves.js';
import type { Book } from '../core/types.js';
import {
  SHELF_ARROW_STEP_PX,
  SHELF_DRAG_SLOP_PX,
  SHELF_FOCUS_MARGIN_PX,
  SPINE,
} from './constants.js';
import { librosStore } from './librosStore.js';
import { isNew, shelfCount, shortPrice } from './librosText.js';
import { spineOf, spineVars } from './spine.js';

/** How far each shelf has been moved, by shelf key (kept while the panel lives). */
export type Offsets = Map<string, number>;

/** One book standing on the shelf, drawn by code: cloth or paperback, its title down the spine. */
export function BookSpine({
  book,
  state,
  selected,
  pulling,
  today,
  onOpen,
}: {
  book: Book;
  state: '' | 'dim' | 'glow';
  selected: boolean;
  pulling: boolean;
  today: string;
  onOpen: (id: string) => void;
}) {
  const look = spineOf(book);
  const size = { '--w': `${look.w}px`, '--hh': `${look.h}px` } as CSSProperties;
  const by = book.authors.length ? ` · ${authorsText(book.authors)}` : '';
  if (book.wanted) {
    return (
      <button
        type="button"
        className={`lib-gap ${state} ${selected ? 'sel' : ''}`}
        style={{ ...size, '--w': `${Math.max(look.w, SPINE.guessW + 4)}px` } as CSSProperties}
        data-id={book.id}
        title={`Se busca: ${book.title}${by}`}
        aria-label={`Se busca: ${book.title}${book.price ? `, ${book.price}` : ''}`}
        onClick={() => onOpen(book.id)}
        onFocus={() => librosStore.select(book.id)}
      >
        <span className="t">SE BUSCA</span>
        {book.price && <span className="price">{shortPrice(book.price)}</span>}
      </button>
    );
  }
  // Wide spines also carry the author's surname at the foot
  const surname = look.w >= 30 ? (book.authors[0] ?? '').split(' ').pop() : '';
  return (
    <button
      type="button"
      className={`lib-book ${look.kind} ${state} ${selected ? 'sel' : ''} ${pulling ? 'out' : ''}`}
      style={{ ...size, ...spineVars(look) }}
      data-id={book.id}
      title={`${book.title}${by}`}
      aria-label={`${book.title}${by}`}
      onClick={() => onOpen(book.id)}
      onFocus={() => librosStore.select(book.id)}
    >
      {look.kind === 'soft' && (
        <>
          <span className="crown" />
          <span className="logo" />
        </>
      )}
      {look.kind === 'digital' && (
        <>
          <span className="screen" />
          <span className="dot" />
        </>
      )}
      <span className="t">
        {book.title}
        {surname && <small>{surname}</small>}
      </span>
      {book.reading === 'leyendo' && <span className="mark" title="Leyendo" />}
      {book.lentTo && <span className="lent" title={`Prestado a ${book.lentTo}`} />}
      {isNew(book, today) && <span className="new" />}
    </button>
  );
}

interface ShelfProps {
  shelf: Shelf;
  accent: string;
  today: string;
  offsets: Offsets;
  selectedId?: string;
  pulling?: string;
  lit?: Lit;
  onlyWanted: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}

/** One shelf: its books in a row that moves sideways (arrows, wheel, drag, keyboard), sagas held together. */
export function ShelfRow({
  shelf,
  accent,
  today,
  offsets,
  selectedId,
  pulling,
  lit,
  onlyWanted,
  onOpen,
  onAdd,
}: ShelfProps) {
  const items = shelfItems(shelf);
  const rowH = Math.max(SPINE.softH, ...items.map((b) => spineOf(b).h));
  const wood = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);

  const moveTo = useCallback(
    (x: number) => {
      const w = wood.current;
      const t = track.current;
      if (!w || !t) return;
      const max = Math.max(0, t.scrollWidth - w.clientWidth + 24);
      const next = Math.max(0, Math.min(max, x));
      offsets.set(shelf.key, next);
      t.style.transform = `translateX(${-next}px)`;
    },
    [offsets, shelf.key],
  );
  const moveBy = useCallback(
    (dx: number) => moveTo((offsets.get(shelf.key) ?? 0) + dx),
    [moveTo, offsets, shelf.key],
  );

  // Where it was left (and clamped when the shelf got shorter)
  useLayoutEffect(() => moveBy(0));

  // The selected book: brought into view along the shelf, and the shelf into view in the list
  useEffect(() => {
    if (!selectedId) return;
    const t = track.current;
    const w = wood.current;
    const el = t?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    if (!t || !w || !el) return;
    const x = el.getBoundingClientRect().left - t.getBoundingClientRect().left;
    const off = offsets.get(shelf.key) ?? 0;
    if (x - off > w.clientWidth - SHELF_FOCUS_MARGIN_PX || x - off < SHELF_FOCUS_MARGIN_PX / 3)
      moveTo(x - w.clientWidth / 3);
    el.closest('.lib-shelf')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, moveTo, offsets, shelf.key]);

  // Wheel: sideways (or with Shift) moves the shelf; up/down scrolls the list as usual
  useEffect(() => {
    const w = wood.current;
    if (!w) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        e.preventDefault();
        moveBy(e.deltaX || e.deltaY);
      }
    };
    w.addEventListener('wheel', onWheel, { passive: false });
    return () => w.removeEventListener('wheel', onWheel);
  }, [moveBy]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const start = offsets.get(shelf.key) ?? 0;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = startX - ev.clientX;
      if (!moved && Math.abs(dx) > SHELF_DRAG_SLOP_PX) {
        moved = true;
        track.current?.classList.add('dragging');
      }
      if (moved) moveTo(start + dx);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      track.current?.classList.remove('dragging');
      suppressClick.current = moved;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const stateOf = (b: Book): '' | 'dim' | 'glow' => {
    if (lit) return matchesLit(b, lit) ? 'glow' : 'dim';
    if (onlyWanted) return b.wanted ? 'glow' : 'dim';
    return '';
  };
  const open = (id: string) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen(id);
  };
  const counts = shelfCount(shelf);
  const spine = (b: Book) => (
    <BookSpine
      key={b.id}
      book={b}
      state={stateOf(b)}
      selected={b.id === selectedId}
      pulling={b.id === pulling}
      today={today}
      onOpen={open}
    />
  );

  return (
    <section
      className="lib-shelf"
      style={{ '--acc': accent } as CSSProperties}
      data-shelf={shelf.key}
      aria-label={shelf.name}
    >
      <div className="top">
        <h3>{shelf.name}</h3>
        <span className="count">
          <b>{counts.owned}</b>
          {counts.wanted && (
            <>
              {' · '}
              <em>{counts.wanted}</em>
            </>
          )}
          {counts.reading && ` · ${counts.reading}`}
        </span>
        <span className="arrows">
          <button
            type="button"
            aria-label="Recorrer a la izquierda"
            onClick={() => moveBy(-SHELF_ARROW_STEP_PX)}
          >
            ◀
          </button>
          <button
            type="button"
            aria-label="Recorrer a la derecha"
            onClick={() => moveBy(SHELF_ARROW_STEP_PX)}
          >
            ▶
          </button>
        </span>
      </div>
      <div className="lib-wood" ref={wood} onPointerDown={onPointerDown}>
        <div className="lib-track" ref={track} style={{ '--h': `${rowH + 30}px` } as CSSProperties}>
          {shelf.runs.map((run) =>
            run.series !== null ? (
              <div className="lib-run series" key={`s:${run.items[0].id}`}>
                <span className="plaque">{run.series}</span>
                {run.items.map(spine)}
              </div>
            ) : (
              spine(run.items[0])
            ),
          )}
          <span className="lib-end" aria-hidden="true" />
          <button
            type="button"
            className="lib-slot add"
            style={{ '--w': '30px', '--hh': `${SPINE.softH}px` } as CSSProperties}
            title={`Agregar un libro a ${shelf.name}`}
            aria-label={`Agregar un libro a ${shelf.name}`}
            onClick={onAdd}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
