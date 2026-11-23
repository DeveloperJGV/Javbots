import { type CSSProperties, useMemo, useState } from 'react';

import { LONG_PAGES, SHORT_PAGES } from '../core/constants.js';
import { defaultNextAsk, type NextAsk, nextPicks } from '../core/next.js';
import { knownValues } from '../core/shelves.js';
import type { Book } from '../core/types.js';
import { LENGTH_LABEL, MOOD_LABEL } from './constants.js';
import { librosStore } from './librosStore.js';
import { byLine } from './librosText.js';
import { spineOf, spineVars } from './spine.js';

const MOODS: NextAsk['mood'][] = ['seguir', 'saga', 'pendiente', 'cualquiera'];
const LENGTHS: Exclude<NextAsk['length'], ''>[] = ['corto', 'medio', 'largo'];
const LENGTH_HINT: Record<string, string> = {
  corto: `menos de ${SHORT_PAGES} págs.`,
  medio: `${SHORT_PAGES} a ${LONG_PAGES}`,
  largo: `más de ${LONG_PAGES}`,
};

/** The reading lamp drawn in pixels (an SVG of squares), the sheet's little sign. */
function Lamp() {
  return (
    <svg className="lib-lamp" viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="3" y="2" width="8" height="4" fill="var(--color-accent)" />
      <rect x="2" y="5" width="10" height="1" fill="var(--color-accent-bright)" />
      <rect x="6" y="6" width="2" height="5" fill="var(--color-text-muted)" />
      <rect x="4" y="11" width="6" height="2" fill="var(--color-text-muted)" />
      <rect x="4" y="7" width="6" height="1" fill="var(--color-warning)" opacity=".6" />
    </svg>
  );
}

/**
 * «¿Qué leo ahora?»: go on with one started, the next of a saga, one waiting on the shelf or any; how long and
 * which genre. Three books with the reason; «Otros tres» goes on through the list. Lent books are not at home.
 */
export function NextRead({ books, today }: { books: readonly Book[]; today: string }) {
  const [ask, setAsk] = useState<NextAsk>(() => defaultNextAsk(books));
  const [round, setRound] = useState(0);
  const [seed] = useState(() => Math.floor(Math.random() * 1e9));
  const genres = useMemo(
    () =>
      knownValues(
        books.filter((b) => !b.wanted),
        (b) => [b.genre],
      ),
    [books],
  );
  const { picks, total } = nextPicks(books, ask, round, today, seed);
  const change = (patch: Partial<NextAsk>) => {
    setAsk({ ...ask, ...patch });
    setRound(0);
  };

  return (
    <div className="lib-sheet" role="dialog" aria-label="¿Qué leo ahora?">
      <h3>
        ¿Qué leo ahora?
        <Lamp />
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
      <div className="lib-q">
        <span className="k">Se antoja</span>
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            className="lib-chip"
            aria-pressed={ask.mood === m}
            onClick={() => change({ mood: m })}
          >
            {MOOD_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="lib-q">
        <span className="k">Qué tan largo</span>
        <button
          type="button"
          className="lib-chip"
          aria-pressed={ask.length === ''}
          onClick={() => change({ length: '' })}
        >
          Da igual
        </button>
        {LENGTHS.map((l) => (
          <button
            key={l}
            type="button"
            className="lib-chip"
            aria-pressed={ask.length === l}
            title={LENGTH_HINT[l]}
            onClick={() => change({ length: l })}
          >
            {LENGTH_LABEL[l]}
          </button>
        ))}
      </div>
      {genres.length > 1 && (
        <div className="lib-q">
          <span className="k">Género</span>
          <button
            type="button"
            className="lib-chip"
            aria-pressed={ask.genre === ''}
            onClick={() => change({ genre: '' })}
          >
            Cualquiera
          </button>
          {genres.slice(0, 10).map((g) => (
            <button
              key={g}
              type="button"
              className="lib-chip"
              aria-pressed={ask.genre === g}
              onClick={() => change({ genre: g })}
            >
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="lib-res">
        {picks.length === 0 ? (
          <div className="none">
            {ask.mood === 'saga'
              ? 'No hay una saga empezada con el siguiente en casa. Prueba con «Uno que espera».'
              : ask.mood === 'seguir'
                ? 'No hay ninguno empezado. Prueba con «Uno que espera en la repisa».'
                : 'Nada con eso en casa (los prestados no cuentan). Prueba con otro largo o género.'}
          </div>
        ) : (
          picks.map(({ book, why }) => (
            <button
              key={book.id}
              type="button"
              onClick={() => librosStore.openItem(book.id)}
              title={`Abrir ${book.title}`}
            >
              <span className="sp" style={spineVars(spineOf(book)) as CSSProperties} />
              <span className="tx">
                {book.title}
                <small>{byLine(book)}</small>
                <small>{why}</small>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="lib-foot">
        {total > 3 && (
          <button type="button" className="lib-btn" onClick={() => setRound(round + 1)}>
            Otros tres
          </button>
        )}
        {total > 0 && (
          <span className="hint">{total === 1 ? 'Solo hay uno así.' : `${total} encajan.`}</span>
        )}
      </div>
    </div>
  );
}
