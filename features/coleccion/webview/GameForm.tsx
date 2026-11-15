import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { PLAYERS_MAX, TITLE_MAX } from '../core/constants.js';
import { PLATFORMS } from '../core/platforms.js';
import { fold, knownSeries } from '../core/shelves.js';
import { CONDITIONS, type Game, LENGTHS, PROGRESS, REGIONS } from '../core/types.js';
import type { ColeccionState, FormMode } from './coleccionStore.js';
import { coleccionStore } from './coleccionStore.js';
import { draftProblem } from './coleccionText.js';
import {
  CONDITION_LABEL,
  LENGTH_LABEL,
  lookOf,
  PROGRESS_LABEL,
  REGION_LABEL,
  SAVED_NOTE_MS,
} from './constants.js';

/** A row of choice chips; clicking the chosen one again clears it ("not said"). */
function Chips<T extends string | number>({
  options,
  value,
  label,
  onPick,
}: {
  options: readonly T[];
  value: T | '';
  label: (v: T) => string;
  onPick: (v: T | '') => void;
}) {
  return (
    <>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          className="col-chip"
          aria-pressed={value === o}
          onClick={() => onPick(value === o ? '' : o)}
        >
          {label(o)}
        </button>
      ))}
    </>
  );
}

const PLAYER_CHOICES = [1, 2, 3, 4] as const;

/**
 * Add or edit a game by hand: name, console and the rest optional. Made to put in many in a row: after saving a new
 * one the console stays and the cursor goes back to the name.
 */
export function GameForm({
  draft,
  mode,
  state,
  games,
  onSave,
}: {
  draft: Game;
  mode: FormMode;
  state: ColeccionState;
  games: readonly Game[];
  onSave: (draft: Game, mode: FormMode) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Game>) => coleccionStore.updateDraft(patch);
  const series = useMemo(() => knownSeries(games), [games]);
  const seriesHints = useMemo(() => {
    const q = fold(draft.series);
    return series.filter((s) => (!q || fold(s).includes(q)) && fold(s) !== q).slice(0, 6);
  }, [series, draft.series]);
  const pending = !!state.pending;

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [state.focusName]);

  // The "✓ Guardado" note fades by itself
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!state.savedInRow) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), SAVED_NOTE_MS);
    return () => clearTimeout(t);
  }, [state.savedInRow]);
  const saved = showSaved ? state.lastSaved : undefined;

  const submit = () => {
    const problem = draftProblem(draft);
    if (problem) {
      coleccionStore.setFormError(problem);
      if (!draft.title.trim()) nameRef.current?.focus();
      return;
    }
    onSave(draft, mode);
  };

  const title =
    mode === 'edit'
      ? draft.wanted
        ? 'Editar «se busca»'
        : 'Editar juego'
      : mode === 'acquire'
        ? '¡Ya lo tienes! Cómo llegó'
        : draft.wanted
          ? 'Anotar un «se busca»'
          : 'Agregar juegos';

  return (
    <div className="col-sheet" role="dialog" aria-label={title}>
      <h3>
        {title}
        {/* Up here so it is seen without scrolling: the error, or the last one saved in a row */}
        {state.formError ? (
          <span className="col-err">{state.formError}</span>
        ) : (
          saved &&
          mode === 'new' && (
            <span className="col-saved">
              ✓ {saved} · {state.savedInRow} {state.savedInRow === 1 ? 'agregado' : 'agregados'}{' '}
              seguidos
            </span>
          )
        )}
        <button
          type="button"
          className="col-btn ghost col-sq x"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => coleccionStore.leaveForm()}
        >
          ×
        </button>
      </h3>
      <div className="col-q">
        <span className="k">Nombre</span>
        <input
          ref={nameRef}
          className="col-input grow"
          value={draft.title}
          maxLength={TITLE_MAX}
          placeholder="Nombre del juego"
          aria-label="Nombre del juego"
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </div>
      <div className="col-q">
        <span className="k">Consola</span>
        <div className="col-plats" role="group" aria-label="Consola">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="col-chip"
              aria-pressed={draft.platform === p.id}
              style={{ '--cc': lookOf(p.id).accent } as CSSProperties}
              onClick={() => set({ platform: p.id })}
            >
              <span className="sw" />
              {p.name}
            </button>
          ))}
        </div>
      </div>
      {mode !== 'acquire' && (
        <div className="col-q">
          <span className="k">¿Lo tienes?</span>
          <button
            type="button"
            className="col-chip"
            aria-pressed={!draft.wanted}
            onClick={() => set({ wanted: false })}
          >
            Sí, ya está en la repisa
          </button>
          <button
            type="button"
            className="col-chip"
            aria-pressed={draft.wanted}
            onClick={() => set({ wanted: true })}
          >
            No, se busca
          </button>
        </div>
      )}
      {draft.wanted ? (
        <>
          <div className="col-q">
            <span className="k">Precio que viste</span>
            <input
              className="col-input grow"
              value={draft.price}
              placeholder="$450 MXN"
              aria-label="Precio que viste"
              onChange={(e) => set({ price: e.target.value })}
            />
          </div>
          <div className="col-q">
            <span className="k">Dónde lo viste</span>
            <input
              className="col-input grow"
              value={draft.seenAt}
              placeholder="Opcional: la tienda o el lugar"
              aria-label="Dónde lo viste"
              onChange={(e) => set({ seenAt: e.target.value })}
            />
          </div>
        </>
      ) : (
        <>
          <div className="col-q">
            <span className="k">Región</span>
            <Chips
              options={REGIONS}
              value={draft.region}
              label={(v) => REGION_LABEL[v]}
              onPick={(v) => set({ region: v })}
            />
          </div>
          <div className="col-q">
            <span className="k">Cómo está</span>
            <Chips
              options={CONDITIONS}
              value={draft.condition}
              label={(v) => CONDITION_LABEL[v]}
              onPick={(v) => set({ condition: v })}
            />
          </div>
          <div className="col-q">
            <span className="k">Cómo va</span>
            <Chips
              options={PROGRESS}
              value={draft.progress}
              label={(v) => PROGRESS_LABEL[v]}
              onPick={(v) => set({ progress: v })}
            />
          </div>
          <div className="col-q">
            <span className="k">Jugadores</span>
            <Chips
              options={PLAYER_CHOICES}
              value={
                (PLAYER_CHOICES as readonly number[]).includes(draft.players)
                  ? (draft.players as 1 | 2 | 3 | 4)
                  : ''
              }
              label={(v) => (v === 4 ? `4 o más` : String(v))}
              onPick={(v) =>
                set({
                  players: v === '' ? 0 : Math.min(PLAYERS_MAX, v),
                  coop: v === 1 ? false : draft.coop,
                })
              }
            />
            <button
              type="button"
              className="col-chip"
              aria-pressed={draft.coop}
              disabled={draft.players === 1}
              onClick={() => set({ coop: !draft.coop })}
            >
              En equipo (coop)
            </button>
          </div>
          <div className="col-q">
            <span className="k">Una partida</span>
            <Chips
              options={LENGTHS}
              value={draft.length}
              label={(v) => LENGTH_LABEL[v]}
              onPick={(v) => set({ length: v })}
            />
          </div>
          <div className="col-q">
            <span className="k">De quién es</span>
            <input
              className="col-input grow"
              value={draft.owner}
              placeholder="Opcional"
              aria-label="De quién es"
              onChange={(e) => set({ owner: e.target.value })}
            />
          </div>
        </>
      )}
      <div className="col-q">
        <span className="k">Serie</span>
        <div className="grow">
          <input
            className="col-input"
            value={draft.series}
            placeholder="Opcional: une juegos de varias consolas"
            aria-label="Serie"
            onChange={(e) => set({ series: e.target.value })}
          />
          {seriesHints.length > 0 && (
            <div className="col-hints">
              {seriesHints.map((s) => (
                <button key={s} type="button" onClick={() => set({ series: s })}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="col-q">
        <span className="k">Notas</span>
        <textarea
          className="col-input grow"
          value={draft.notes}
          aria-label="Notas"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      <div className="col-foot">
        <button type="button" className="col-btn acc" disabled={pending} onClick={submit}>
          {mode === 'new' ? 'Guardar y otro (Enter)' : 'Guardar'}
        </button>
        {mode === 'new' && (
          <button
            type="button"
            className="col-btn"
            onClick={() => coleccionStore.show({ kind: 'shelves' })}
          >
            Listo
          </button>
        )}
        {mode === 'new' && !saved && !state.formError && !state.savedInRow && (
          <span className="hint">Solo el nombre y la consola son obligatorios.</span>
        )}
      </div>
    </div>
  );
}
