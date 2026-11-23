import type { Send } from '../../coleccion/webview/ColeccionBits.js';
import type { Book } from '../core/types.js';
import { missingCovers } from './coverUrls.js';
import { type LibrosState, librosStore } from './librosStore.js';

/**
 * «Portadas»: look for every missing cover in Open Library (by ISBN, which sets it; by title and author, which only
 * offers), with its progress and «Detener». Choices wait in each book.
 */
export function CoverSheet({
  books,
  state,
  send,
}: {
  books: readonly Book[];
  state: LibrosState;
  send: Send;
}) {
  const covers = state.status?.covers ?? [];
  const run = state.status?.coverRun;
  const missing = missingCovers(books, covers);
  const waiting = covers.filter((c) => c.state === 'elige');
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;

  return (
    <div className="lib-sheet" role="dialog" aria-label="Portadas">
      <h3>
        Portadas
        <button
          type="button"
          className="lib-btn ghost lib-sq x"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => librosStore.show({ kind: 'shelves' })}
        >
          ×
        </button>
      </h3>
      <p className="lib-covers-intro">
        Las portadas salen de Open Library, sin llave. Con el ISBN se pone la de esa edición; sin
        ISBN (o si no la tiene) se buscan por título y autor y tú eliges en cada libro. Nunca se
        pone una dudosa sola. Va despacio a propósito: una petición cada 3 segundos.
      </p>
      {run?.running ? (
        <>
          <div className="lib-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="lib-q">
            {run.done} de {run.total} · {run.found} puestas · {run.choose} para elegir
            <button
              type="button"
              className="lib-btn"
              onClick={() => send({ type: 'librosCoverRun', action: 'stop' })}
            >
              Detener
            </button>
          </div>
        </>
      ) : (
        <div className="lib-q">
          <button
            type="button"
            className="lib-btn acc"
            disabled={missing === 0}
            onClick={() => send({ type: 'librosCoverRun', action: 'start' })}
          >
            Buscar las que faltan ({missing})
          </button>
          {run?.finishedAt && (
            <span className="lbl">
              {run.stopped ? 'Se detuvo' : 'Terminó'}: {run.found} puestas, {run.choose} para
              elegir, {run.notFound} sin nada{run.failed ? `, ${run.failed} sin respuesta` : ''}.
            </span>
          )}
        </div>
      )}
      {waiting.length > 0 && (
        <>
          <div className="lib-q">
            <span className="k">Para elegir</span>
          </div>
          <div className="lib-hints">
            {waiting.map((c) => {
              const b = books.find((x) => x.id === c.id);
              return b ? (
                <button key={c.id} type="button" onClick={() => librosStore.openItem(b.id)}>
                  {b.title}
                </button>
              ) : null;
            })}
          </div>
        </>
      )}
    </div>
  );
}
