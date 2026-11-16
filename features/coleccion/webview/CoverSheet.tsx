import { useEffect, useState } from 'react';

import type { ColeccionCoverProgress } from '../../../core/src/messages.js';
import { IGDB_APP_URL, IGDB_KEY_STEPS, IGDB_TERMS_TEXT, IGDB_TERMS_URL } from '../core/cover.js';
import { ConfirmButton, type Send } from './ColeccionBits.js';
import { type ColeccionState, coleccionStore } from './coleccionStore.js';
import { missingCovers, nextToChoose, reasonShort, runLine, skippedLine } from './coverText.js';

/** The run's progress as a pixel bar: done of total. */
function RunBar({ run }: { run: ColeccionCoverProgress }) {
  const pct = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;
  return (
    <div
      className="col-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={run.total}
      aria-valuenow={run.done}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * «Buscar las que faltan»: while it runs, its bar with done / total, found, to choose, not found and «Detener»;
 * when it ends, the summary (with the reasons grouped) and a button to the next one waiting for a choice. Over the
 * shelves it folds to one line at any time, running or not.
 */
export function CoverRun({
  state,
  send,
  order,
  floating,
}: {
  state: ColeccionState;
  send: Send;
  /** The games in shelf order (for «la siguiente por elegir»). */
  order: readonly string[];
  /** As a little box over the shelves (closable), rather than inside the «Portadas» sheet. */
  floating?: boolean;
}) {
  const status = state.status;
  const run = status?.coverRun;
  if (!status || !run) return null;
  const finished = !run.running && !!run.finishedAt;
  if (!run.running && !finished) return null;
  if (floating && finished && state.dismissedRun === run.finishedAt) return null;
  // After the open one, or the last one looked at (so a game left without choosing is not offered again); never
  // the case that is open now
  const openId = state.view.kind === 'case' ? state.view.id : undefined;
  const current = openId ?? state.selectedId;
  const next = nextToChoose(order, status.covers, current, state.dismissedChoice, openId);
  const needsKey =
    !status.igdbKey && run.reasons.some((r) => r.reason === 'sin-llave' || r.reason === 'pocas');
  const title = run.running
    ? 'Buscando portadas…'
    : run.stopped
      ? 'Búsqueda detenida'
      : 'Búsqueda terminada';
  const close = floating && finished && (
    <button
      type="button"
      className="col-mini x"
      aria-label="Cerrar el resumen"
      onClick={() => coleccionStore.dismissRun(run.finishedAt ?? '')}
    >
      ×
    </button>
  );
  if (floating && state.runMinimized)
    return (
      <div className="col-run-box floating min" role="status">
        <div className="hd">
          <span>
            {title} {run.done}/{run.total}
          </span>
          <button
            type="button"
            className="col-mini fold"
            aria-label="Abrir el avance"
            title="Abrir"
            onClick={() => coleccionStore.minimizeRun(false)}
          >
            ▴
          </button>
          {close}
        </div>
      </div>
    );
  const skipped = skippedLine(run);
  return (
    <div className={floating ? 'col-run-box floating' : 'col-run-box'} role="status">
      <div className="hd">
        {title}
        {floating && (
          <button
            type="button"
            className="col-mini fold"
            aria-label="Hacer chico el avance"
            title="Hacer chico"
            onClick={() => coleccionStore.minimizeRun(true)}
          >
            ▾
          </button>
        )}
        {floating && finished && (
          <button
            type="button"
            className="col-mini x"
            aria-label="Cerrar el resumen"
            onClick={() => coleccionStore.dismissRun(run.finishedAt ?? '')}
          >
            ×
          </button>
        )}
      </div>
      <RunBar run={run} />
      <div className="ln">{runLine(run)}</div>
      {skipped && <div className="ln">{skipped}</div>}
      {finished && run.reasons.length > 0 && (
        <ul className="why">
          {run.reasons.map((r) => (
            <li key={r.reason}>
              <b>{r.count}</b> · {reasonShort(r.reason)}
            </li>
          ))}
        </ul>
      )}
      <div className="acts">
        {run.running ? (
          <button
            type="button"
            className="col-mini"
            onClick={() => send({ type: 'coleccionCoverRun', action: 'stop' })}
          >
            Detener
          </button>
        ) : (
          <>
            {next && (
              <button
                type="button"
                className="col-mini acc"
                onClick={() => coleccionStore.openItem(next)}
              >
                Ir a la siguiente por elegir →
              </button>
            )}
            {needsKey && state.view.kind !== 'covers' && (
              <button
                type="button"
                className="col-mini"
                onClick={() => coleccionStore.show({ kind: 'covers' })}
              >
                Poner la llave de IGDB
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The IGDB key: how to get it and its terms, then two fields; once set, only «Llave puesta» and «Quitar llave». */
function IgdbKey({ state, send }: { state: ColeccionState; send: Send }) {
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const busy = !!state.op;
  const keySet = !!state.status?.igdbKey;
  // Never kept on the page once the office has it; kept while it said no, to fix and send again
  useEffect(() => {
    if (keySet) {
      setClientId('');
      setSecret('');
    }
  }, [keySet]);
  if (keySet)
    return (
      <div className="col-key on">
        <span className="ok">✓ Llave de IGDB puesta</span>
        <ConfirmButton
          className="col-mini"
          label="Quitar llave"
          confirmLabel="¿Seguro? Quitar llave"
          onConfirm={() => {
            const requestId = coleccionStore.startOp('keyRemove');
            send({ type: 'coleccionIgdbKeyRemove', requestId });
          }}
        />
      </div>
    );
  const save = () => {
    if (!clientId.trim() || !secret.trim() || busy) return;
    const requestId = coleccionStore.startOp('key');
    send({
      type: 'coleccionIgdbKey',
      requestId,
      clientId: clientId.trim(),
      clientSecret: secret.trim(),
    });
  };
  return (
    <div className="col-key">
      <p>
        Para las consolas que libretro no tiene (Switch, PS5, Xbox One y Series, PC…) se busca en
        IGDB, con una llave gratuita que sacas tú.
      </p>
      <p className="terms">
        {IGDB_TERMS_TEXT}{' '}
        <a href={IGDB_TERMS_URL} target="_blank" rel="noopener noreferrer">
          Leer los términos ↗
        </a>
      </p>
      <ol>
        {IGDB_KEY_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p>
        <a href={IGDB_APP_URL} target="_blank" rel="noopener noreferrer">
          Abrir dev.twitch.tv para registrar la app ↗
        </a>
      </p>
      <form
        className="fields"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          <span>Client ID</span>
          <input
            className="col-input"
            type="password"
            autoComplete="off"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label>
          <span>Client Secret</span>
          <input
            className="col-input"
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="col-btn acc"
          disabled={busy || !clientId.trim() || !secret.trim()}
        >
          Guardar
        </button>
      </form>
    </div>
  );
}

/** «Portadas»: look for the missing ones, the run's progress and summary, and the IGDB key. */
export function CoverSheet({
  state,
  send,
  order,
}: {
  state: ColeccionState;
  send: Send;
  order: readonly string[];
}) {
  const games = state.status?.games ?? [];
  const missing = missingCovers(games, state.status?.covers, state.status?.igdbKey);
  const running = !!state.status?.coverRun?.running;
  return (
    <div className="col-sheet col-covers" role="dialog" aria-label="Portadas">
      <h3>
        Portadas
        <button
          type="button"
          className="col-btn col-sq x"
          aria-label="Cerrar"
          onClick={() => coleccionStore.show({ kind: 'shelves' })}
        >
          ×
        </button>
      </h3>
      <p className="col-covers-intro">
        Primero se buscan en libretro-thumbnails (sin llave) y luego en IGDB, si pusiste tu llave.
        Una dudosa nunca se pone sola: si hay varias parecidas, eliges tú en la ficha del juego.
        También puedes subir una imagen desde la ficha.
      </p>
      <div className="col-foot">
        <button
          type="button"
          className="col-btn big"
          disabled={running || missing === 0}
          onClick={() => send({ type: 'coleccionCoverRun', action: 'start' })}
        >
          {missing > 0
            ? `Buscar las que faltan (${missing})`
            : games.some((g) => !g.wanted && !g.coverArt)
              ? 'Nada nuevo que buscar'
              : 'Ya tienen portada todos'}
        </button>
      </div>
      <CoverRun state={state} send={send} order={order} />
      <h4 className="col-covers-h">Llave de IGDB</h4>
      <IgdbKey state={state} send={send} />
      {state.opError && !state.op && <div className="col-err">▲ {state.opError}</div>}
    </div>
  );
}
