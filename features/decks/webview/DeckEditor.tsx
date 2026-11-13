import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { DECK_NAME_MAX, DECK_OWNER_MAX, DEFAULT_DECK_NAME } from '../core/constants.js';
import { countDeck, deckCover, tally, toCardId } from '../core/deck.js';
import type { Deck, DeckCard, DeckZone } from '../core/types.js';
import { BOX_COLOR_CHOICES, SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH } from './constants.js';
import { CardThumb, type Send } from './DecksBits.js';
import { useNeedCards } from './decksHooks.js';
import type { DecksState } from './decksStore.js';
import { decksStore } from './decksStore.js';
import {
  addCard,
  cardSubline,
  dbStateText,
  isCodeQuery,
  moveCard,
  printedCode,
  removeCard,
  zoneFor,
} from './decksText.js';

const ZONES: { id: DeckZone; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'extra', label: 'Extra' },
  { id: 'side', label: 'Side' },
];

/** Search a card by name (the database is in English) or by its 8-digit code, and add it. */
function CardSearch({
  search,
  dbReady,
  dbLine,
  onAdd,
  send,
}: {
  search: DecksState['search'];
  dbReady: boolean;
  dbLine: string;
  onAdd: (id: number, card?: DeckCard) => void;
  send: Send;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();

  useEffect(() => {
    if (q.length < SEARCH_MIN_LENGTH && !isCodeQuery(q)) {
      decksStore.clearSearch();
      return;
    }
    const t = setTimeout(() => {
      const requestId = decksStore.startSearch(q);
      send({ type: 'decksSearch', requestId, query: q });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, send]);

  const answered = search.query === q && !search.pending;
  const code = isCodeQuery(q) && q.length >= 5 ? toCardId(q) : null;
  const add = (id: number, card?: DeckCard) => {
    onAdd(id, card);
  };
  return (
    <div>
      <label className="decks-label" htmlFor="decks-search">
        Agregar carta: nombre en inglés o código de 8 dígitos
      </label>
      <input
        id="decks-search"
        className="decks-input"
        value={query}
        placeholder="Ej. Dark Magician o 46986414"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && search.cards[0]) add(search.cards[0].id, search.cards[0]);
        }}
      />
      {q && (search.cards.length > 0 || answered || code !== null) && (
        <div className="decks-sugg pixel-scrollbar" role="listbox">
          {search.query === q &&
            search.cards.map((c) => (
              <button type="button" key={c.id} className="decks-row" onClick={() => add(c.id, c)}>
                <CardThumb id={c.id} />
                <span className="n">
                  {c.name}
                  <small>
                    {c.type} · {printedCode(c.id)}
                  </small>
                </span>
                <span className="x">+</span>
              </button>
            ))}
          {answered && search.cards.length === 0 && (
            <p className="decks-note" style={{ padding: '4px 8px' }}>
              {dbReady ? 'No encontré esa carta.' : 'La base de cartas no está lista.'}
            </p>
          )}
          {code !== null && answered && !search.cards.some((c) => c.id === code) && (
            <button type="button" className="decks-row" onClick={() => add(code)}>
              <span className="n">
                Agregar el código {printedCode(code)}
                <small>Sin datos todavía: se guarda el número tal cual</small>
              </span>
              <span className="x">+</span>
            </button>
          )}
        </div>
      )}
      <p className="decks-note">
        La base de cartas está en inglés. Para una carta en español, escribe el código de 8 dígitos
        que trae impreso abajo a la izquierda.
      </p>
      {dbLine && <p className="decks-note">{dbLine}</p>}
    </div>
  );
}

/** New deck or edit: name, owner, box color, cover, and the cards of each zone with + and −. */
export function DeckEditor({ draft, state, send }: { draft: Deck; state: DecksState; send: Send }) {
  const [zone, setZone] = useState<DeckZone>('main');
  const db = state.status?.db;
  const dbReady = db?.state === 'ready';
  const set = (d: Deck) => decksStore.updateDraft(d);
  const allIds = useMemo(
    () => [...new Set([...draft.main, ...draft.extra, ...draft.side])],
    [draft.main, draft.extra, draft.side],
  );
  useNeedCards(allIds, send, dbReady);
  const counts = countDeck(draft);
  const cover = deckCover(draft);
  const isNew = !draft.id;
  const rows = tally(draft[zone]);
  const others = ZONES.filter((z) => z.id !== zone);

  const save = () => {
    decksStore.markSaving(draft);
    send({ type: 'decksSave', deck: { ...draft, name: draft.name.trim() || DEFAULT_DECK_NAME } });
  };
  const cancel = () => decksStore.show(isNew ? { kind: 'row' } : { kind: 'box', id: draft.id });

  return (
    <div className="decks-sheet" style={{ '--box': draft.box.color } as CSSProperties}>
      <div className="decks-head">
        <button
          type="button"
          className="decks-sq"
          title="Cancelar"
          aria-label="Cancelar"
          onClick={cancel}
        >
          ←
        </button>
        <div style={{ minWidth: 0 }}>
          <h3>{isNew ? 'Deck nuevo' : 'Editar deck'}</h3>
          <div className="meta">
            {counts.main} main · {counts.extra} extra · {counts.side} side
          </div>
        </div>
      </div>
      <div className="decks-scroll">
        <label className="decks-label" htmlFor="decks-name">
          Nombre
        </label>
        <input
          id="decks-name"
          className="decks-input"
          value={draft.name}
          maxLength={DECK_NAME_MAX}
          onChange={(e) => set({ ...draft, name: e.target.value })}
        />
        <label className="decks-label" htmlFor="decks-owner">
          De quién es
        </label>
        <input
          id="decks-owner"
          className="decks-input"
          value={draft.owner}
          maxLength={DECK_OWNER_MAX}
          placeholder="Ej. Ana"
          onChange={(e) => set({ ...draft, owner: e.target.value })}
        />
        <span className="decks-label">Color de la caja</span>
        <div className="decks-swatches" role="radiogroup" aria-label="Color de la caja">
          {BOX_COLOR_CHOICES.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={draft.box.color.toLowerCase() === c}
              aria-label={c}
              className={draft.box.color.toLowerCase() === c ? 'decks-swatch on' : 'decks-swatch'}
              style={{ background: c }}
              onClick={() => set({ ...draft, box: { ...draft.box, color: c } })}
            />
          ))}
        </div>
        <span className="decks-label">
          Portada:{' '}
          {cover
            ? (state.cards.get(cover)?.name ?? printedCode(cover))
            : 'ninguna (usa ★ en una carta)'}
          {!draft.cover && cover > 0 && ' (la primera carta)'}
        </span>

        <CardSearch
          search={state.search}
          dbReady={dbReady}
          dbLine={dbStateText(db)}
          send={send}
          onAdd={(id, card) => {
            const to = zone === 'side' ? 'side' : zoneFor(card ?? state.cards.get(id));
            if (card) decksStore.addCards([card]);
            set(addCard(draft, to, id));
            if (to !== zone) setZone(to);
          }}
        />

        <div className="decks-tabs" role="tablist">
          {ZONES.map((z) => (
            <button
              type="button"
              key={z.id}
              role="tab"
              aria-selected={z.id === zone}
              className={z.id === zone ? 'on' : ''}
              onClick={() => setZone(z.id)}
            >
              {z.label} ({counts[z.id]})
            </button>
          ))}
        </div>
        {rows.length === 0 && <p className="decks-note">Sin cartas aquí todavía.</p>}
        {rows.map(({ id, count }) => {
          const card = state.cards.get(id);
          const name = card?.name ?? printedCode(id);
          return (
            <div className="decks-row" key={id} style={{ cursor: 'default' }}>
              <CardThumb id={id} />
              <span className="n">
                {name}
                <small>{cardSubline(card, id)}</small>
                <span style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  {others.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      className="decks-move"
                      title={`Pasar a ${o.label}`}
                      onClick={() => set(moveCard(draft, zone, o.id, id))}
                    >
                      → {o.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="decks-move"
                    title="Usar de portada"
                    aria-pressed={draft.cover === id}
                    style={draft.cover === id ? { color: 'var(--color-text)' } : undefined}
                    onClick={() => set({ ...draft, cover: draft.cover === id ? 0 : id })}
                  >
                    ★
                  </button>
                </span>
              </span>
              <span className="decks-qty">
                <button
                  type="button"
                  aria-label={`Quitar una copia de ${name}`}
                  onClick={() => set(removeCard(draft, zone, id))}
                >
                  −
                </button>
                <span className="x">×{count}</span>
                <button
                  type="button"
                  aria-label={`Agregar una copia de ${name}`}
                  onClick={() => set(addCard(draft, zone, id))}
                >
                  +
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="decks-actions">
        <button type="button" className="decks-btn acc" onClick={save} disabled={state.savePending}>
          {state.savePending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="decks-btn ghost" onClick={cancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
