import { useEffect, useSyncExternalStore } from 'react';

import type { AccesoState, AccesoView } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { type AccesosState, accesosStore } from './accesosStore.js';
import { actionOf, isLocalLink, panelTitle } from './accesosText.js';
import {
  ACCESOS_CSS,
  CANDLE_FLAME_ROWS,
  CANDLE_ICON_COLORS,
  CANDLE_ICON_PX,
  CANDLE_ICON_ROWS,
  ERROR_COLOR,
  STATE_COLOR,
  STATE_LABEL,
} from './constants.js';

const LINK_CLASS =
  'inline-block border-2 rounded-none py-2 px-12 no-underline shadow-pixel text-text';
const LINK_ACCENT = `${LINK_CLASS} bg-accent border-accent hover:bg-accent-bright hover:border-accent-bright`;
const LINK_PLAIN = `${LINK_CLASS} bg-btn-bg border-transparent hover:bg-btn-hover`;

/** The little pixel candle by each page's name: lit (flickering) when it answers, blinking while it starts. */
export function CandleIcon({ state }: { state: AccesoState }) {
  const flame = state === 'on' || state === 'starting';
  const cell = (ch: string, x: number) => (
    <span
      key={x}
      style={{
        width: CANDLE_ICON_PX,
        height: CANDLE_ICON_PX,
        background: ch === '.' ? 'transparent' : CANDLE_ICON_COLORS[ch],
      }}
    />
  );
  const row = (line: string, y: number) => (
    <div key={y} className="flex">
      {Array.from(line).map(cell)}
    </div>
  );
  return (
    <div aria-hidden className="flex flex-col shrink-0">
      <div
        className={
          state === 'on' ? 'accesos-flame-on' : state === 'starting' ? 'accesos-flame-starting' : ''
        }
        style={{ visibility: flame ? 'visible' : 'hidden' }}
      >
        {CANDLE_ICON_ROWS.slice(0, CANDLE_FLAME_ROWS).map(row)}
      </div>
      {CANDLE_ICON_ROWS.slice(CANDLE_FLAME_ROWS).map((line, y) => row(line, y + CANDLE_FLAME_ROWS))}
    </div>
  );
}

/** One page: name, state, what it is, its address and its buttons. */
export function AccesoCard({
  acceso,
  pendingStart,
  onStart,
}: {
  acceso: AccesoView;
  pendingStart?: string;
  onStart: (id: string) => void;
}) {
  const action = actionOf(acceso, pendingStart);
  const link = isLocalLink(acceso.url);
  const state: AccesoState = action === 'starting' ? 'starting' : acceso.state;
  return (
    <div className="border-2 border-border bg-bg-dark shadow-pixel p-8 flex gap-8">
      <CandleIcon state={state} />
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-8">
          <span className="text-lg text-accent-bright truncate">{acceso.name}</span>
          <span className="text-sm shrink-0" style={{ color: STATE_COLOR[state] }}>
            ■ {STATE_LABEL[state]}
          </span>
        </div>
        {acceso.description && <p className="text-sm text-text m-0">{acceso.description}</p>}
        <p className="text-xs text-text-muted m-0 break-all">{acceso.url}</p>
        {acceso.error && (
          <p className="text-sm m-0" style={{ color: ERROR_COLOR }}>
            {acceso.error}
          </p>
        )}
        <div className="flex gap-8 items-center mt-4">
          {action === 'open' && link && (
            <a className={LINK_ACCENT} href={acceso.url} target="_blank" rel="noopener noreferrer">
              Abrir
            </a>
          )}
          {action === 'start' && (
            <Button
              size="md"
              variant="accent"
              className="shadow-pixel"
              onClick={() => onStart(acceso.id)}
            >
              Prender
            </Button>
          )}
          {action === 'starting' && (
            <Button size="md" variant="disabled" className="shadow-pixel" disabled>
              Prendiendo…
            </Button>
          )}
          {action === 'checking' && (
            <span className="text-sm text-text-muted">Viendo si está prendida…</span>
          )}
          {action === 'openAnyway' && (
            <>
              {link && (
                <a
                  className={LINK_PLAIN}
                  href={acceso.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir de todos modos
                </a>
              )}
              <span className="text-sm text-text-muted">
                Está apagada y la lista no dice cómo prenderla.
              </span>
            </>
          )}
          {action === 'start' && (
            <span className="text-sm text-text-muted">Préndela y luego ábrela desde aquí.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** The panel's content, from the store's state (pure: the tests render it). */
export function AccesosBody({
  state,
  onStart,
}: {
  state: AccesosState;
  onStart: (id: string) => void;
}) {
  const { status, pendingStart } = state;
  if (!status)
    return (
      <p className="text-sm text-text-muted">
        Solo la página con la llave de la oficina ve los accesos.
      </p>
    );
  return (
    <div className="flex flex-col gap-8">
      {status.accesos.length === 0 ? (
        <div className="text-sm text-text flex flex-col gap-4">
          <p className="m-0">Todavía no hay páginas en la lista.</p>
          <p className="m-0 text-text-muted break-all">
            Se escriben a mano en {status.file} (el README de features/accesos tiene un ejemplo).
          </p>
        </div>
      ) : (
        status.accesos.map((a) => (
          <AccesoCard key={a.id} acceso={a} pendingStart={pendingStart} onStart={onStart} />
        ))
      )}
      {status.problems.length > 0 && (
        <ul className="text-sm m-0 pl-16" style={{ color: ERROR_COLOR }}>
          {status.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pages on this computer (features/accesos): opens from the map table. Each page says whether it answers; "Abrir"
 * opens it in a new tab and "Prender" starts it with the command of the owner's list.
 */
export function AccesosPanel({ transport }: { transport: MessageTransport }) {
  const state = useSyncExternalStore(accesosStore.subscribe, accesosStore.get);
  const { open } = state;
  useEffect(() => {
    if (open) transport.send({ type: 'accesosOpen' });
  }, [open, transport]);
  if (!open) return null;
  const start = (id: string) => {
    accesosStore.startPending(id);
    transport.send({ type: 'accesosStart', id });
  };
  return (
    <Modal
      isOpen
      onClose={() => accesosStore.close()}
      title={panelTitle(state.status)}
      className="w-[min(560px,94vw)]"
    >
      <style>{ACCESOS_CSS}</style>
      <div className="max-h-[70vh] overflow-y-auto px-10 pb-8">
        <AccesosBody state={state} onStart={start} />
      </div>
    </Modal>
  );
}
