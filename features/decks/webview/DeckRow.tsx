import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';

import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { deckCover } from '../core/deck.js';
import type { Deck } from '../core/types.js';
import { ROW_CLICK_SLOP_PX, ROW_DRAG_STEP_PX, ROW_WHEEL_STEP } from './constants.js';
import { CoverCanvas } from './DecksBits.js';
import { cardImageUrl } from './decksText.js';
import {
  boxPlacement,
  clampIndex,
  rulerFraction,
  rulerIndexAt,
  rulerTicks,
  visibleRange,
  wheelSteps,
} from './rowMath.js';

function applyPlacement(el: HTMLElement, k: number): void {
  const p = boxPlacement(k);
  el.style.transform = p.transform;
  el.style.filter = p.brightness < 1 ? `brightness(${p.brightness})` : '';
  el.style.opacity = p.hidden ? '0' : '';
}

/** One deck box: front with its cover, spine with its name, lid and back, placed by its distance to the chosen one. */
function DeckBox({ deck, k, onClick }: { deck: Deck; k: number; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useRef(false);
  const cover = deckCover(deck);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!entered.current) {
      // A box coming into the window starts where it would have been, so it slides in instead of popping
      entered.current = true;
      el.style.transition = 'none';
      applyPlacement(el, k > 0 ? k + 1 : k - 1);
      void el.offsetWidth;
      el.style.transition = '';
    }
    applyPlacement(el, k);
  }, [k]);

  return (
    <div
      ref={ref}
      className={`decks-box${k === 0 ? ' sel' : ''}`}
      style={{ '--box': deck.box.color } as CSSProperties}
      onClick={onClick}
      aria-hidden={k !== 0}
    >
      <div className="face back" />
      <div className="face rside" />
      <div className="face lid" />
      <div className="face spine">
        <CoverCanvas id={cover} />
        <span className="t">{deck.name}</span>
      </div>
      <div className="face front">
        <CoverCanvas id={cover} className="art" />
        {Math.abs(k) <= 1 && cover > 0 && (
          <img
            className="sharp"
            src={cardImageUrl(cover, 'crop', officeToken())}
            alt=""
            draggable={false}
          />
        )}
        <div className="band">
          <span>{deck.name}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The row of deck boxes in perspective (the chosen one out in front, turned to show its cover) and the ruler under
 * it. Only the boxes near the chosen one are in the page, so a row of hundreds stays light.
 */
export function DeckRow({
  decks,
  index,
  onSelect,
  onOpen,
}: {
  decks: Deck[];
  index: number;
  onSelect: (i: number) => void;
  onOpen: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const wheelAcc = useRef(0);
  const live = useRef({ index, onSelect, count: decks.length });
  live.current = { index, onSelect, count: decks.length };
  const { from, to } = visibleRange(index, decks.length);

  // Wheel: needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { steps, rest } = wheelSteps(wheelAcc.current, e.deltaY + e.deltaX, ROW_WHEEL_STEP);
      wheelAcc.current = rest;
      if (steps) {
        const { index: i, onSelect: select, count } = live.current;
        select(clampIndex(i + steps, count));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onStageDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = index;
    moved.current = false;
    const move = (ev: PointerEvent) => {
      // Along the row's diagonal: right or up moves forward
      const d = ev.clientX - x0 - (ev.clientY - y0);
      if (Math.abs(d) > ROW_CLICK_SLOP_PX) moved.current = true;
      if (moved.current)
        live.current.onSelect(
          clampIndex(start - Math.round(d / ROW_DRAG_STEP_PX), live.current.count),
        );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rulerAt = (clientX: number) => {
    const r = ruler.current?.getBoundingClientRect();
    if (r && r.width > 0) onSelect(rulerIndexAt((clientX - r.left) / r.width, decks.length));
  };
  const onRulerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    rulerAt(e.clientX);
  };

  return (
    <>
      <div className="decks-stage" ref={stage} onPointerDown={onStageDown}>
        <div className="decks-world">
          <div className="decks-floor" />
          {decks.slice(from, to + 1).map((d, j) => {
            const i = from + j;
            return (
              <DeckBox
                key={d.id}
                deck={d}
                k={i - index}
                onClick={() => {
                  if (moved.current) return;
                  if (i === index) onOpen();
                  else onSelect(i);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="decks-hint">Toca la caja del frente para abrirla</div>
      <div
        className="decks-ruler"
        ref={ruler}
        role="slider"
        aria-label="Recorrer los decks"
        aria-valuemin={1}
        aria-valuemax={decks.length}
        aria-valuenow={index + 1}
        aria-valuetext={decks[index]?.name}
        tabIndex={0}
        onPointerDown={onRulerDown}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) rulerAt(e.clientX);
        }}
      >
        <div className="ticks">
          {rulerTicks(index, decks.length).map((t, i) => (
            <div key={i} className={t.on ? 'tk on' : 'tk'} style={{ height: t.height }} />
          ))}
        </div>
        <div
          className="mark"
          style={{ left: `calc(${rulerFraction(index, decks.length) * 100}% - 1px)` }}
        />
      </div>
    </>
  );
}
