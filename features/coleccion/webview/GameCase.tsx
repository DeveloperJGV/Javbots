import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { platformById } from '../core/platforms.js';
import { seriesMembers } from '../core/shelves.js';
import { agoText } from '../core/tonight.js';
import type { Game } from '../core/types.js';
import { cover, drawCartridge, drawDisc, paint } from './art.js';
import { ConfirmButton } from './ColeccionBits.js';
import { coleccionStore } from './coleccionStore.js';
import {
  addedText,
  copyLine,
  lengthText,
  platformName,
  playersText,
  progressText,
} from './coleccionText.js';
import { lookOf, lookVars } from './constants.js';

const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The case's size and half (CSS: .col-case). */
const CASE_W = 340;
const CASE_H = 470;

/**
 * An opened game: it comes off its shelf, flies to the middle and opens like a case. Left, the back with its sheet
 * (region, condition, how it's going, players, series, whose, notes); right, the disc spinning or the cartridge.
 */
export function GameCase({
  game,
  games,
  siblings,
  today,
  onDelete,
  onPlayed,
}: {
  game: Game;
  games: readonly Game[];
  /** The owned games of its shelf, in order (for previous / next). */
  siblings: readonly string[];
  today: string;
  onDelete: (id: string) => void;
  onPlayed: (game: Game) => void;
}) {
  const look = lookOf(game.platform);
  const cartridge = platformById(game.platform)?.cartridge ?? false;
  const caseRef = useRef<HTMLDivElement>(null);
  const lidRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLCanvasElement>(null);
  const [closing, setClosing] = useState(false);
  const series = game.series ? seriesMembers(games, game.series) : [];
  const at = siblings.indexOf(game.id);

  useEffect(() => paint(frontRef.current, cover(game.title, 48, 64)), [game.title]);
  useEffect(() => {
    if (cartridge) drawCartridge(mediaRef.current, game, look);
    else drawDisc(mediaRef.current, game, game.platform === 'gc');
  }, [game, look, cartridge]);

  // Fly out of the shelf and open
  useLayoutEffect(() => {
    const el = caseRef.current;
    const lid = lidRef.current;
    if (!el || !lid || typeof el.animate !== 'function') return;
    const fast = reduced();
    const origin = document.querySelector<HTMLElement>(`.col-track [data-id="${game.id}"]`);
    const table = el.parentElement?.getBoundingClientRect();
    let from = `translate(${-CASE_W / 2}px, 40px) scale(.6)`;
    if (origin && table) {
      const r = origin.getBoundingClientRect();
      const s = Math.max(0.05, r.height / CASE_H);
      from = `translate(${r.left + r.width / 2 - table.left - CASE_W / 2 + (CASE_W / 2) * s}px, ${r.top + r.height / 2 - table.top}px) scale(${s}) rotateY(80deg)`;
      origin.classList.add('gone');
    }
    const fly = el.animate(
      [
        { transform: from },
        {
          transform: `translate(${-CASE_W / 2}px,-24px) scale(.92) rotateY(-12deg) rotateX(5deg)`,
          offset: 0.7,
        },
        { transform: `translate(${-CASE_W / 2}px,0) scale(1)` },
      ],
      {
        duration: fast ? 0 : 560,
        delay: fast ? 0 : 80,
        easing: 'cubic-bezier(.3,.7,.2,1)',
        fill: 'both',
      },
    );
    let live = true;
    void fly.finished
      .then(() => {
        if (!live) return;
        const opts: KeyframeAnimationOptions = {
          duration: fast ? 0 : 620,
          easing: 'cubic-bezier(.45,0,.2,1)',
          fill: 'forwards',
        };
        lid.animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(-180deg)' }], opts);
        el.animate(
          [{ transform: `translate(${-CASE_W / 2}px,0)` }, { transform: 'translate(0,0)' }],
          opts,
        );
      })
      .catch(() => {});
    return () => {
      live = false;
      origin?.classList.remove('gone');
    };
  }, [game.id]);

  const close = () => {
    const el = caseRef.current;
    const lid = lidRef.current;
    if (closing) return;
    if (!el || !lid || typeof el.animate !== 'function' || reduced()) {
      coleccionStore.show({ kind: 'shelves' });
      return;
    }
    setClosing(true);
    const opts: KeyframeAnimationOptions = { duration: 360, fill: 'forwards' };
    lid.animate([{ transform: 'rotateY(-180deg)' }, { transform: 'rotateY(0)' }], opts);
    void el
      .animate(
        [
          { transform: 'translate(0,0)' },
          { transform: `translate(${-CASE_W / 2}px,30px) scale(.8)`, opacity: 0 },
        ],
        opts,
      )
      .finished.then(() => coleccionStore.show({ kind: 'shelves' }))
      .catch(() => coleccionStore.show({ kind: 'shelves' }));
  };

  // Esc closes, arrows go to the next box of the shelf (the panel leaves these keys to the case while it is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowRight' && siblings[at + 1])
        coleccionStore.openItem(siblings[at + 1]);
      else if (e.key === 'ArrowLeft' && at > 0) coleccionStore.openItem(siblings[at - 1]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const owned = series.filter((x) => !x.wanted).length;
  return (
    <>
      <div className="col-veil" onClick={close} />
      <div className="col-table">
        <div
          className="col-case"
          ref={caseRef}
          style={lookVars(look)}
          role="dialog"
          aria-label={game.title}
        >
          <div className="base">
            <canvas
              ref={mediaRef}
              className={
                cartridge ? 'col-cartridge' : game.platform === 'gc' ? 'col-disc mini' : 'col-disc'
              }
              aria-hidden="true"
            />
          </div>
          <div className="lid" ref={lidRef}>
            <div className="face front">
              <div className="band">{platformName(game.platform).toUpperCase()}</div>
              <canvas ref={frontRef} aria-hidden="true" />
              <div className="label">{game.title}</div>
            </div>
            <div className="face back">
              <span className="cons">{platformName(game.platform)}</span>
              <h2>{game.title}</h2>
              <div className="line">{copyLine(game)}</div>
              <div className="facts">
                <div>
                  <span>Cómo va</span>
                  {progressText(game)}
                </div>
                <div>
                  <span>Última vez</span>
                  {agoText(game.lastPlayed, today)}
                </div>
                <div>
                  <span>Jugadores</span>
                  {playersText(game)}
                </div>
                <div>
                  <span>Una partida</span>
                  {lengthText(game)}
                </div>
                {game.owner && (
                  <div>
                    <span>De quién es</span>
                    {game.owner}
                  </div>
                )}
                <div>
                  <span>Llegó</span>
                  {addedText(game, today)}
                </div>
              </div>
              {series.length > 1 && (
                <>
                  <h4>Serie {game.series}</h4>
                  <div className="series">
                    {series.map((x) => (
                      <i
                        key={x.id}
                        className={`${x.wanted ? 'gap' : ''} ${x.id === game.id ? 'me' : ''}`}
                        title={`${x.title} · ${platformName(x.platform)}`}
                        style={lookVars(lookOf(x.platform)) as CSSProperties}
                      />
                    ))}
                  </div>
                  <div className="small">
                    Tienes {owned} de {series.length}
                    {series.some((x) => x.wanted) ? ' · los punteados están en «se busca»' : ''}
                  </div>
                </>
              )}
              {game.notes && (
                <>
                  <h4>Notas</h4>
                  <div className="notes">{game.notes}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="col-controls">
        <button
          type="button"
          className="col-btn"
          disabled={at <= 0}
          onClick={() => coleccionStore.openItem(siblings[at - 1])}
        >
          ← Anterior
        </button>
        <button type="button" className="col-btn" onClick={() => coleccionStore.edit(game)}>
          Editar
        </button>
        <button
          type="button"
          className="col-btn"
          disabled={game.lastPlayed === today}
          onClick={() => onPlayed(game)}
        >
          {game.lastPlayed === today ? 'Jugado hoy ✓' : 'Lo jugamos hoy'}
        </button>
        <ConfirmButton
          label="Borrar"
          confirmLabel="¿Seguro? Borrar"
          onConfirm={() => onDelete(game.id)}
        />
        <button type="button" className="col-btn" onClick={close} autoFocus>
          Regresar (Esc)
        </button>
        <button
          type="button"
          className="col-btn"
          disabled={at < 0 || at >= siblings.length - 1}
          onClick={() => coleccionStore.openItem(siblings[at + 1])}
        >
          Siguiente →
        </button>
      </div>
    </>
  );
}
