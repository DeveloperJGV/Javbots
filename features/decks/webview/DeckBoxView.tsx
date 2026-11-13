import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { countDeck, deckCover } from '../core/deck.js';
import { toYdk, toYdke } from '../core/formats.js';
import { groupDeck } from '../core/group.js';
import { deckWarnings } from '../core/rules.js';
import type { Deck, DeckCard } from '../core/types.js';
import { COPIED_MS } from './constants.js';
import { CardThumb, ConfirmButton, type Send } from './DecksBits.js';
import { useLookup, useNeedCards } from './decksHooks.js';
import { decksStore } from './decksStore.js';
import {
  banText,
  cardImageUrl,
  cardSubline,
  countsLine,
  ownerText,
  printedCode,
  statsLine,
  typeLine,
  warningsTitle,
  ydkFileName,
} from './decksText.js';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard blocked (no focus, plain http): a hidden textarea still works in most browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The card big, with its text. Click or Escape closes it. */
function BigCard({ id, card, onClose }: { id: number; card?: DeckCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const ban = card ? banText(card) : '';
  return (
    <div
      className="decks-big"
      onClick={onClose}
      role="dialog"
      aria-label={card?.name ?? `Carta ${id}`}
    >
      <img src={cardImageUrl(id, 'full', officeToken())} alt="" />
      <div className="txt">
        <b>{card?.name ?? `Código ${printedCode(id)}`}</b>
        {card ? (
          <>
            <span className="sub">
              {typeLine(card)}
              {statsLine(card) ? `\n${statsLine(card)}` : ''}
              {`\nCódigo ${printedCode(id)}`}
              {ban && <span className="decks-ban">{`\n${ban}`}</span>}
            </span>
            {card.desc}
          </>
        ) : (
          'Esta carta no está en la base de cartas (o todavía no se baja).'
        )}
      </div>
    </div>
  );
}

/** Export: the deck as ydke:// or .ydk, to copy or download. */
function ExportBox({ deck }: { deck: Deck }) {
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(''), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);
  const ydke = toYdke(deck);
  const ydk = toYdk(deck);
  const copy = (what: string, text: string) =>
    void copyText(text).then((ok) => setCopied(ok ? what : 'error'));
  return (
    <div className="decks-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
      <button type="button" className="decks-btn" onClick={() => copy('ydke', ydke)}>
        {copied === 'ydke' ? 'Copiado' : 'Copiar ydke://'}
      </button>
      <button type="button" className="decks-btn" onClick={() => copy('ydk', ydk)}>
        {copied === 'ydk' ? 'Copiado' : 'Copiar .ydk'}
      </button>
      <button
        type="button"
        className="decks-btn"
        onClick={() => download(ydkFileName(deck.name), ydk)}
      >
        Descargar .ydk
      </button>
      {copied === 'error' && <span className="decks-note">No se pudo copiar.</span>}
    </div>
  );
}

/**
 * The open box: the deck's cards by group with their small image, name and copies; the rule warnings on top
 * (folded); a card opens big with its text. Edit, export and delete (two steps) at the bottom.
 */
export function DeckBoxView({
  deck,
  cards,
  dbReady,
  send,
}: {
  deck: Deck;
  cards: ReadonlyMap<number, DeckCard>;
  dbReady: boolean;
  send: Send;
}) {
  const [big, setBig] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const lookup = useLookup(cards, dbReady);
  const allIds = useMemo(() => [...new Set([...deck.main, ...deck.extra, ...deck.side])], [deck]);
  useNeedCards(allIds, send, dbReady);
  const grouped = useMemo(() => groupDeck(deck, lookup), [deck, lookup]);
  const warnings = useMemo(() => deckWarnings(deck, lookup), [deck, lookup]);
  const counts = countDeck(deck);
  const cover = deckCover(deck);
  const bad = (code: string) => warnings.some((w) => w.code === code);

  return (
    <div className="decks-sheet" style={{ '--box': deck.box.color } as CSSProperties}>
      <div className="decks-head">
        <button
          type="button"
          className="decks-sq"
          title="Volver a la fila"
          aria-label="Volver a la fila"
          onClick={() => decksStore.show({ kind: 'row' })}
        >
          ←
        </button>
        {cover > 0 ? (
          <img className="cov" src={cardImageUrl(cover, 'crop', officeToken())} alt="" />
        ) : (
          <span className="cov" />
        )}
        <div style={{ minWidth: 0 }}>
          <h3>{deck.name}</h3>
          <div className="meta">
            {[ownerText(deck.owner), countsLine(counts)].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div className="decks-counts">
        <span className={bad('main-size') ? 'bad' : ''}>
          <b>{counts.main}</b>Main
        </span>
        <span className={bad('extra-size') ? 'bad' : ''}>
          <b>{counts.extra}</b>Extra
        </span>
        <span className={bad('side-size') ? 'bad' : ''}>
          <b>{counts.side}</b>Side
        </span>
      </div>
      {warnings.length > 0 && (
        <details className="decks-warns">
          <summary>▲ {warningsTitle(warnings.length)}</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={`${w.code}-${w.cardId ?? i}`}>{w.text}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="decks-scroll">
        {grouped.groups.length === 0 && (
          <p className="decks-note" style={{ marginTop: 16 }}>
            Esta caja está vacía. Usa «Editar» para meterle cartas.
          </p>
        )}
        {grouped.groups.map((g) => (
          <div className="decks-grp" key={g.key}>
            <h4>
              <span>{g.label}</span>
              <span>{g.count}</span>
            </h4>
            {g.entries.map((e) => (
              <button type="button" className="decks-row" key={e.id} onClick={() => setBig(e.id)}>
                <CardThumb id={e.id} />
                <span className="n">
                  {e.card?.name ?? printedCode(e.id)}
                  <small>
                    {cardSubline(e.card, e.id)}
                    {e.card?.banTcg && <span className="decks-ban"> · {banText(e.card)}</span>}
                  </small>
                </span>
                <span className="x">×{e.count}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {exporting && <ExportBox deck={deck} />}
      <div className="decks-actions">
        <button type="button" className="decks-btn" onClick={() => decksStore.edit(deck)}>
          Editar
        </button>
        <button
          type="button"
          className={exporting ? 'decks-btn on' : 'decks-btn'}
          onClick={() => setExporting((v) => !v)}
        >
          Exportar
        </button>
        <span style={{ flex: 1 }} />
        <ConfirmButton
          label="Borrar"
          confirmLabel="¿Seguro? Borrar"
          onConfirm={() => {
            send({ type: 'decksDelete', id: deck.id });
            decksStore.show({ kind: 'row' });
          }}
        />
      </div>
      {big !== null && <BigCard id={big} card={cards.get(big)} onClose={() => setBig(null)} />}
    </div>
  );
}
