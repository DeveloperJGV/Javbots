import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { sameSeries, type Shelf } from '../core/shelves.js';
import type { Game } from '../core/types.js';
import { cover, paint } from './art.js';
import { coleccionStore } from './coleccionStore.js';
import { isDusty, isNew, shelfCount, shortPrice } from './coleccionText.js';
import {
  lookOf,
  lookVars,
  type PlatformLook,
  SHELF_ARROW_STEP_PX,
  SHELF_DRAG_SLOP_PX,
  SHELF_FOCUS_MARGIN_PX,
} from './constants.js';

/** How far each shelf has been moved, by platform (kept while the panel lives). */
export type Offsets = Map<string, number>;

interface ShelfProps {
  shelf: Shelf;
  lit: boolean;
  today: string;
  offsets: Offsets;
  selectedId?: string;
  litSeries?: string;
  onlyWanted: boolean;
  onOpen: (id: string) => void;
}

/** A cartridge's label: the cover drawn small. */
function CartLabel({ title }: { title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(ref.current, cover(title, 24, 32)), [title]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function GameBox({
  game,
  look,
  cartridge,
  today,
  state,
  selected,
  onOpen,
}: {
  game: Game;
  look: PlatformLook;
  cartridge: boolean;
  today: string;
  state: '' | 'dim' | 'glow';
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const size = { '--w': `${look.w}px`, '--hh': `${look.h}px` } as CSSProperties;
  if (game.wanted) {
    return (
      <button
        type="button"
        className={`col-gap ${state} ${selected ? 'sel' : ''}`}
        style={{ ...size, '--w': `${cartridge ? look.w : look.w + 4}px` } as CSSProperties}
        data-id={game.id}
        title={`Se busca: ${game.title}`}
        aria-label={`Se busca: ${game.title}${game.price ? `, ${game.price}` : ''}`}
        onClick={() => onOpen(game.id)}
        onFocus={() => coleccionStore.select(game.id)}
      >
        <span className="t">SE BUSCA</span>
        {game.price && <span className="price">{shortPrice(game.price)}</span>}
      </button>
    );
  }
  const bandH = Math.round(look.h * 0.16);
  return (
    <button
      type="button"
      className={`col-box ${cartridge ? 'cart' : ''} ${game.condition === 'sellado' ? 'sealed' : ''} ${state} ${selected ? 'sel' : ''}`}
      style={size}
      data-id={game.id}
      title={game.title}
      aria-label={game.title}
      onClick={() => onOpen(game.id)}
      onFocus={() => coleccionStore.select(game.id)}
    >
      {cartridge ? (
        <>
          <span className="label">
            <CartLabel title={game.title} />
          </span>
          <span className="ribs" />
        </>
      ) : (
        <>
          <span className="band" style={{ height: bandH }} />
          {game.platform === 'gc' && <span className="cube" style={{ top: bandH + 4 }} />}
          <span className="t" style={{ top: bandH + (game.platform === 'gc' ? 16 : 4), bottom: 4 }}>
            {game.title}
          </span>
        </>
      )}
      {isDusty(game, today) && <span className="dust" />}
      {game.progress === 'a-medias' && <span className="note" title="A medias" />}
      {isNew(game, today) && <span className="new" />}
    </button>
  );
}

/** One console's shelf: its boxes and gaps in a row that moves sideways (arrows, wheel, drag, keyboard). */
export function ShelfRow({
  shelf,
  lit,
  today,
  offsets,
  selectedId,
  litSeries,
  onlyWanted,
  onOpen,
}: ShelfProps) {
  const look = lookOf(shelf.platform);
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
      offsets.set(shelf.platform, next);
      t.style.transform = `translateX(${-next}px)`;
    },
    [offsets, shelf.platform],
  );
  const moveBy = useCallback(
    (dx: number) => moveTo((offsets.get(shelf.platform) ?? 0) + dx),
    [moveTo, offsets, shelf.platform],
  );

  // Where it was left (and clamped when the shelf got shorter)
  useLayoutEffect(() => moveBy(0));

  // The selected box: brought into view along the shelf, and the shelf into view in the list
  useEffect(() => {
    if (!selectedId) return;
    const t = track.current;
    const w = wood.current;
    const el = t?.querySelector<HTMLElement>(`[data-id="${selectedId}"]`);
    if (!t || !w || !el) return;
    const x = el.getBoundingClientRect().left - t.getBoundingClientRect().left;
    const off = offsets.get(shelf.platform) ?? 0;
    if (x - off > w.clientWidth - SHELF_FOCUS_MARGIN_PX || x - off < SHELF_FOCUS_MARGIN_PX / 3)
      moveTo(x - w.clientWidth / 3);
    el.closest('.col-shelf')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, moveTo, offsets, shelf.platform]);

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
    const start = offsets.get(shelf.platform) ?? 0;
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

  const stateOf = (g: Game): '' | 'dim' | 'glow' => {
    if (litSeries) return sameSeries(g.series, litSeries) ? 'glow' : 'dim';
    if (onlyWanted) return g.wanted ? 'glow' : 'dim';
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

  return (
    <section
      className={lit ? 'col-shelf lit' : 'col-shelf'}
      style={lookVars(look)}
      data-platform={shelf.platform}
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
          {counts.halfway && ` · ${counts.halfway}`}
        </span>
        {lit && <span className="star">★ lo que más tienes</span>}
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
      <div className="col-wood" ref={wood} onPointerDown={onPointerDown}>
        <div
          className="col-track"
          ref={track}
          style={{ '--h': `${look.h + 34}px` } as CSSProperties}
        >
          {shelf.runs.map((run) =>
            run.series !== null ? (
              <div className="col-run series" key={`s:${run.items[0].id}`}>
                <span className="plaque">{run.series}</span>
                {run.items.map((g) => (
                  <GameBox
                    key={g.id}
                    game={g}
                    look={look}
                    cartridge={shelf.cartridge}
                    today={today}
                    state={stateOf(g)}
                    selected={g.id === selectedId}
                    onOpen={open}
                  />
                ))}
              </div>
            ) : (
              <GameBox
                key={run.items[0].id}
                game={run.items[0]}
                look={look}
                cartridge={shelf.cartridge}
                today={today}
                state={stateOf(run.items[0])}
                selected={run.items[0].id === selectedId}
                onOpen={open}
              />
            ),
          )}
          <button
            type="button"
            className="col-slot add"
            style={
              { '--w': `${Math.max(look.w + 8, 30)}px`, '--hh': `${look.h}px` } as CSSProperties
            }
            title={`Agregar un juego de ${shelf.name}`}
            aria-label={`Agregar un juego de ${shelf.name}`}
            onClick={() => coleccionStore.newGame(shelf.platform)}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
