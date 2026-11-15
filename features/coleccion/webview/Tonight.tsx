import { type CSSProperties, useMemo, useState } from 'react';

import { platformById } from '../core/platforms.js';
import { defaultAsk, type TonightAsk, tonightPicks } from '../core/tonight.js';
import type { Game } from '../core/types.js';
import { PAD_SVG } from './art.js';
import { CoverCanvas } from './ColeccionBits.js';
import { coleccionStore } from './coleccionStore.js';
import { platformName } from './coleccionText.js';
import { lookOf } from './constants.js';

const WHO: { v: TonightAsk['players']; label: string }[] = [
  { v: 1, label: 'Solo yo' },
  { v: 2, label: 'Dos, en el sillón' },
  { v: 4, label: 'Con amigos (3-4)' },
];
const TIME: { v: TonightAsk['time']; label: string }[] = [
  { v: 'rato', label: 'Un rato de 30 min' },
  { v: '1h', label: '1 h' },
  { v: 'tarde', label: 'Toda la tarde' },
];
const MOOD: { v: TonightAsk['mood']; label: string }[] = [
  { v: 'medias', label: 'Terminar uno a medias' },
  { v: 'nuevo', label: 'Uno sin jugar' },
  { v: 'siempre', label: 'Uno de siempre' },
  { v: 'cualquiera', label: 'Sorpréndeme' },
];

/** "¿Qué jugamos hoy?": who, how long, what you feel like and which console; it proposes three. */
export function Tonight({ games, today }: { games: readonly Game[]; today: string }) {
  const [ask, setAsk] = useState<TonightAsk>(() => defaultAsk(games));
  const [round, setRound] = useState(0);
  const [buzz, setBuzz] = useState(0);
  const seed = useMemo(() => Date.parse(today) / 86_400_000, [today]);
  const { picks, total } = tonightPicks(games, ask, round, today, seed);
  const owned = games.filter((g) => !g.wanted);
  const platforms = [...new Set(owned.map((g) => g.platform))].sort(
    (a, b) => (platformById(a) ? 0 : 1) - (platformById(b) ? 0 : 1),
  );
  const change = (patch: Partial<TonightAsk>) => {
    setAsk({ ...ask, ...patch });
    setRound(0);
    setBuzz((b) => b + 1);
  };
  const row = <T,>(k: string, items: { v: T; label: string }[], value: T, pick: (v: T) => void) => (
    <div className="col-q">
      <span className="k">{k}</span>
      {items.map((it) => (
        <button
          key={String(it.v)}
          type="button"
          className="col-chip"
          aria-pressed={value === it.v}
          onClick={() => pick(it.v)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
  const pads = ask.players === 1 ? 1 : ask.players;
  return (
    <div className="col-sheet" role="dialog" aria-label="¿Qué jugamos hoy?">
      <h3>
        ¿Qué jugamos hoy?
        <button
          type="button"
          className="col-btn ghost col-sq x"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => coleccionStore.show({ kind: 'shelves' })}
        >
          ×
        </button>
      </h3>
      {row('¿Quiénes?', WHO, ask.players, (v) => change({ players: v }))}
      {row('¿Cuánto tiempo?', TIME, ask.time, (v) => change({ time: v }))}
      {row('¿Qué se antoja?', MOOD, ask.mood, (v) => change({ mood: v }))}
      <div className="col-q">
        <span className="k">¿Qué consola?</span>
        <button
          type="button"
          className="col-chip"
          aria-pressed={ask.platform === ''}
          onClick={() => change({ platform: '' })}
        >
          La que sea
        </button>
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            className="col-chip"
            aria-pressed={ask.platform === p}
            style={{ '--cc': lookOf(p).accent } as CSSProperties}
            onClick={() => change({ platform: p })}
          >
            <span className="sw" />
            {platformName(p)}
          </button>
        ))}
      </div>
      <div className="col-res">
        {picks.length === 0 ? (
          <div className="none">
            {owned.length === 0
              ? 'Todavía no hay juegos en la repisa. Agrega unos y aquí aparecen.'
              : 'Nada encaja con eso. Prueba con más tiempo, otra consola o «Sorpréndeme». (Ayuda anotar jugadores y cómo va.)'}
          </div>
        ) : (
          picks.map(({ game, why }) => (
            <button
              key={game.id}
              type="button"
              onClick={() => coleccionStore.openItem(game.id)}
              title={`Abrir ${game.title}`}
            >
              <CoverCanvas title={game.title} />
              <span>
                {game.title}
                <small>
                  {platformName(game.platform)} ·{' '}
                  {game.players > 1
                    ? `hasta ${game.players}${game.coop ? ' en equipo' : ''}`
                    : '1 jugador'}
                  <br />
                  {why}
                </small>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="col-foot">
        <button
          type="button"
          className="col-btn"
          disabled={total <= 3}
          onClick={() => {
            setRound(round + 1);
            setBuzz((b) => b + 1);
          }}
        >
          Otras tres
        </button>
        <span className="hint">
          {total} de {owned.length} {owned.length === 1 ? 'juego encaja' : 'juegos encajan'}
        </span>
        <span
          className="col-pads"
          key={buzz}
          aria-hidden="true"
          // Static markup drawn by this file (no user text): one pad per player, they buzz on every new proposal
          dangerouslySetInnerHTML={{
            __html: PAD_SVG.replace('class="col-pad"', 'class="col-pad buzz"').repeat(pads),
          }}
        />
      </div>
    </div>
  );
}
