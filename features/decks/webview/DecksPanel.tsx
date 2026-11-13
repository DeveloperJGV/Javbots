import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { panelClosed, panelOpened } from '../../../webview-ui/src/office/owner/panelPresence.js';
import { countDeck, deckCover } from '../core/deck.js';
import type { Deck } from '../core/types.js';
import { DECKS_CSS, PICK_LABEL_LINGER_MS } from './constants.js';
import { loadCover } from './coverCache.js';
import { DeckBoxView } from './DeckBoxView.js';
import { DeckEditor } from './DeckEditor.js';
import { DeckImport } from './DeckImport.js';
import { DeckRow } from './DeckRow.js';
import type { Send } from './DecksBits.js';
import { decksStore } from './decksStore.js';
import { countsLine, dbStateText, ownerText } from './decksText.js';
import { clampIndex, pickHopDelay, pickHops, pickPath } from './rowMath.js';

/** Title of the chosen deck, fading out and in when the choice changes. */
function DeckTitle({ deck }: { deck: Deck | undefined }) {
  const [shown, setShown] = useState(deck);
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (deck?.id === shown?.id) {
      setShown(deck);
      return;
    }
    setSwap(true);
    const t = setTimeout(() => {
      setShown(deck);
      setSwap(false);
    }, 140);
    return () => clearTimeout(t);
  }, [deck, shown?.id]);
  if (!shown) return <div className="decks-title" />;
  const owner = ownerText(shown.owner);
  return (
    <div className={swap ? 'decks-title swap' : 'decks-title'} aria-live="polite">
      <h2>{shown.name}</h2>
      <div className="meta">
        {owner && (
          <>
            de <b>{shown.owner.trim()}</b> ·{' '}
          </>
        )}
        {countsLine(countDeck(shown))}
      </div>
    </div>
  );
}

/** Nothing saved yet: an empty box that invites to make the first deck. */
function EmptyShelf({ dbLine }: { dbLine: string }) {
  return (
    <div className="decks-empty">
      <div className="ghostbox" aria-hidden="true">
        +
      </div>
      <div>
        <div style={{ fontSize: 30 }}>Tu repisa está vacía</div>
        <p className="decks-note" style={{ fontSize: 18 }}>
          Arma tu primer deck carta por carta o pega uno que ya tengas (.ydk, ydke:// o una lista).
        </p>
      </div>
      <button type="button" className="decks-pick" onClick={() => decksStore.edit()}>
        + Crear el primero
      </button>
      <button
        type="button"
        className="decks-btn"
        onClick={() => decksStore.show({ kind: 'import' })}
      >
        Importar uno
      </button>
      {dbLine && <p className="decks-note">{dbLine}</p>}
    </div>
  );
}

/**
 * The Yu-Gi-Oh! decks (features/decks): a phone-shaped panel with the decks as a row of boxes in perspective. The
 * chosen one comes out to show its cover and the background takes its color; open it to see the list, edit it,
 * export it or delete it. Opens from the shelf (or the page's #decks hash).
 */
export function DecksPanel({ transport }: { transport: MessageTransport }) {
  const state = useSyncExternalStore(decksStore.subscribe, decksStore.get);
  const { open, status, view, selectedId, cards } = state;
  const send: Send = useCallback((msg) => transport.send(msg), [transport]);
  const [picking, setPicking] = useState(false);
  const [tint, setTint] = useState<string | undefined>();
  const pickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const decks = useMemo(() => status?.decks ?? [], [status]);
  const index = Math.max(
    0,
    decks.findIndex((d) => d.id === selectedId),
  );
  const chosen = decks[index];
  const selectIndex = useCallback(
    (i: number) => decksStore.select(decks[clampIndex(i, decks.length)]?.id),
    [decks],
  );

  // Opening tells the server (it reads the folder again and fetches the card database if missing)
  useEffect(() => {
    if (!open) return;
    send({ type: 'decksOpen' });
    panelOpened();
    return panelClosed;
  }, [open, send]);

  // The background takes the color of the chosen cover (the box color until it loads)
  const chosenCover = chosen ? deckCover(chosen) : 0;
  const chosenColor = chosen?.box.color;
  useEffect(() => {
    let live = true;
    setTint(chosenColor);
    void loadCover(chosenCover).then((c) => {
      if (live && c) setTint(c.tint);
    });
    return () => {
      live = false;
    };
  }, [chosenCover, chosenColor]);

  const stopPick = () => {
    clearTimeout(pickTimer.current);
    setPicking(false);
  };
  useEffect(() => () => clearTimeout(pickTimer.current), []);

  const pick = () => {
    if (decks.length < 2) return;
    stopPick();
    const target = Math.floor(Math.random() * decks.length);
    const path = pickPath(index, target, decks.length, pickHops(Math.random()));
    setPicking(true);
    let i = 0;
    const hop = () => {
      selectIndex(path[i]);
      i++;
      if (i < path.length) pickTimer.current = setTimeout(hop, pickHopDelay(i));
      else pickTimer.current = setTimeout(() => setPicking(false), PICK_LABEL_LINGER_MS);
    };
    hop();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const v = decksStore.get().view;
      if (e.key === 'Escape') {
        if (v.kind === 'row') decksStore.close();
        else if (v.kind === 'edit' && v.draft.id) decksStore.show({ kind: 'box', id: v.draft.id });
        else decksStore.show({ kind: 'row' });
        return;
      }
      if (v.kind !== 'row' || typing) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectIndex(index + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectIndex(index - 1);
      } else if (e.key === 'Enter' && chosen && !(e.target instanceof HTMLButtonElement)) {
        decksStore.show({ kind: 'box', id: chosen.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, chosen, selectIndex]);

  if (!open) return null;
  const dbReady = status?.db.state === 'ready';
  const boxDeck = view.kind === 'box' ? decks.find((d) => d.id === view.id) : undefined;

  return (
    <>
      <style>{DECKS_CSS}</style>
      <div className="decks-backdrop" style={{ zIndex: 50 }} onClick={() => decksStore.close()} />
      <div
        className="decks-phone"
        style={{ zIndex: 51, ...(tint ? { '--decks-tint': tint } : {}) } as CSSProperties}
        role="dialog"
        aria-label="Decks"
      >
        <div className="decks-top">
          <button
            type="button"
            className="decks-sq"
            title="Cerrar"
            aria-label="Cerrar"
            onClick={() => decksStore.close()}
          >
            ×
          </button>
          <DeckTitle deck={status && decks.length ? chosen : undefined} />
          <button
            type="button"
            className="decks-sq"
            title="Deck nuevo"
            aria-label="Deck nuevo"
            disabled={!status}
            onClick={() => decksStore.edit()}
          >
            +
          </button>
        </div>
        <div className={picking ? 'decks-pill on' : 'decks-pill'} aria-hidden={!picking}>
          ✦ Escogiendo…
        </div>

        {!status ? (
          <div className="decks-empty">
            <p className="decks-note" style={{ fontSize: 20 }}>
              Los decks no están disponibles en esta página. Ábrela con el enlace con token de la
              oficina.
            </p>
          </div>
        ) : decks.length === 0 ? (
          <EmptyShelf dbLine={dbStateText(status.db)} />
        ) : (
          <>
            <DeckRow
              decks={decks}
              index={index}
              onSelect={(i) => {
                if (picking) stopPick();
                selectIndex(i);
              }}
              onOpen={() => chosen && decksStore.show({ kind: 'box', id: chosen.id })}
            />
            <div className="decks-bar">
              <button
                type="button"
                className="decks-sq"
                title="Importar"
                aria-label="Importar"
                onClick={() => decksStore.show({ kind: 'import' })}
              >
                ⇩
              </button>
              <button
                type="button"
                className="decks-pick"
                onClick={pick}
                disabled={decks.length < 2 || picking}
              >
                ⚄ Escoge uno
              </button>
              <button
                type="button"
                className="decks-sq"
                title="Abrir la caja"
                aria-label="Abrir la caja"
                onClick={() => chosen && decksStore.show({ kind: 'box', id: chosen.id })}
              >
                ≡
              </button>
            </div>
          </>
        )}
        {status && status.problems.length > 0 && view.kind === 'row' && (
          <p className="decks-status" title={status.problems.join('\n')}>
            ▲{' '}
            {status.problems.length === 1
              ? status.problems[0]
              : `${status.problems.length} archivos con problemas`}
          </p>
        )}

        {boxDeck && <DeckBoxView deck={boxDeck} cards={cards} dbReady={dbReady} send={send} />}
        {view.kind === 'edit' && <DeckEditor draft={view.draft} state={state} send={send} />}
        {view.kind === 'import' && <DeckImport state={state} send={send} />}
      </div>
    </>
  );
}
