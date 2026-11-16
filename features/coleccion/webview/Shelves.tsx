import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { sameSeries, type Shelf, shelfItems } from '../core/shelves.js';
import type { Game } from '../core/types.js';
import { drawBoxFront, drawDisc, drawLooseCart } from './art.js';
import { ConfirmButton } from './ColeccionBits.js';
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
import { coverStyle, type PixelSpec, useNearView, usePixelCover } from './coverPixels.js';
import {
  batchIds,
  boxArt,
  CART_ART,
  type CoverStyle,
  LABEL_ANCHOR_Y,
  labelStyle,
  type Piece,
  pieceOf,
  pieceSize,
  sealedOf,
} from './pieces.js';

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
  /** «Todos con caja / Todos sueltos» for this shelf's games (left out: no buttons). */
  onCondition?: (ids: string[], condition: 'completo' | 'suelto') => void;
}

/** The pixel art a piece needs from the cover (a box: the whole cover; a cartridge: its label), or null. */
function pixelSpecOf(piece: Piece, platform: string, style: CoverStyle): PixelSpec | null {
  if (piece.kind === 'box' && piece.art === 'cover') {
    const { cover } = boxArt(platform, style);
    return { w: cover.w, h: cover.h, style, anchorY: 0.5 };
  }
  if (piece.kind === 'loose' && piece.media !== 'disc') {
    const { label } = CART_ART[piece.media];
    return { w: label.w, h: label.h, style: labelStyle(style), anchorY: LABEL_ANCHOR_Y };
  }
  return null;
}

/** A box from the front, a loose cartridge or card, or a loose disc, drawn on a canvas in art pixels. */
export function PieceArt({
  game,
  piece,
  look,
  style,
}: {
  game: Game;
  piece: Piece;
  look: PlatformLook;
  style: CoverStyle;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Only pieces near the visible part of the list fetch and pixelate their cover
  const near = useNearView(ref);
  const px = usePixelCover(game.id, game.coverArt, pixelSpecOf(piece, game.platform, style), near);
  const media = piece.kind === 'loose' ? piece.media : '';
  useLayoutEffect(() => {
    const target = ref.current;
    if (piece.kind === 'box') drawBoxFront(target, game, look, boxArt(game.platform, style), px);
    else if (piece.kind === 'loose') {
      if (piece.media === 'disc') drawDisc(target, game, game.platform === 'gc');
      else drawLooseCart(target, game, look, piece.media, px);
    }
    // Redrawn only when what it shows changes (not on every status from the office)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.title, game.platform, piece.kind, media, look, style, px]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function GameBox({
  game,
  look,
  cartridge,
  today,
  state,
  selected,
  style,
  onOpen,
}: {
  game: Game;
  look: PlatformLook;
  cartridge: boolean;
  today: string;
  state: '' | 'dim' | 'glow';
  selected: boolean;
  style: CoverStyle;
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
  const piece = pieceOf(game, !!game.coverArt);
  const dims = pieceSize(piece, game.platform, style, look);
  const kind =
    piece.kind === 'spine'
      ? ''
      : piece.kind === 'box'
        ? 'pc front'
        : piece.media === 'disc'
          ? 'pc disc'
          : 'pc loose';
  const extra = piece.kind === 'loose' ? ' (suelto)' : '';
  return (
    <button
      type="button"
      className={`col-box ${kind} ${game.condition === 'sellado' ? 'sealed' : ''} ${state} ${selected ? 'sel' : ''}`}
      style={{ '--w': `${dims.w}px`, '--hh': `${dims.h}px` } as CSSProperties}
      data-id={game.id}
      title={`${game.title}${extra}`}
      aria-label={`${game.title}${extra}`}
      onClick={() => onOpen(game.id)}
      onFocus={() => coleccionStore.select(game.id)}
    >
      {piece.kind !== 'spine' ? (
        <PieceArt game={game} piece={piece} look={look} style={style} />
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
  onCondition,
}: ShelfProps) {
  const look = lookOf(shelf.platform);
  const style = coverStyle();
  const owned = shelfItems(shelf).filter((g) => !g.wanted);
  // Boxes from the front and loose pieces have their own heights: the shelf is as tall as its tallest
  const rowH = Math.max(
    look.h,
    ...owned.map((g) => pieceSize(pieceOf(g, !!g.coverArt), g.platform, style, look).h),
  );
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
  // Only the ones that would change (a sealed game keeps its «sellado»)
  const toBox = batchIds(owned, 'completo');
  const toLoose = batchIds(owned, 'suelto');
  const sealed = sealedOf(owned);

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
        {onCondition && owned.length >= 2 && (
          <span className="all">
            {toBox.length > 0 && (
              <ConfirmButton
                className="col-mini"
                label="Todos con caja"
                confirmLabel={`¿${toBox.length === 1 ? 'Ese' : `Los ${toBox.length}`} con caja?`}
                onConfirm={() => onCondition(toBox, 'completo')}
              />
            )}
            {toLoose.length > 0 && (
              <ConfirmButton
                className="col-mini"
                label="Todos sueltos"
                confirmLabel={`¿${toLoose.length === 1 ? 'Ese' : `Los ${toLoose.length}`} sueltos?${
                  sealed > 0
                    ? ` (${sealed === 1 ? 'el sellado se queda' : `los ${sealed} sellados se quedan`} igual)`
                    : ''
                }`}
                onConfirm={() => onCondition(toLoose, 'suelto')}
              />
            )}
          </span>
        )}
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
        <div className="col-track" ref={track} style={{ '--h': `${rowH + 34}px` } as CSSProperties}>
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
                    style={style}
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
                style={style}
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
