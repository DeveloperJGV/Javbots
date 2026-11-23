import type { CSSProperties } from 'react';

import { spineVars } from '../../libros/webview/spine.js';
import { type ComicLit, type ComicShelf, matchesComicLit } from '../core/shelves.js';
import type { Series } from '../core/types.js';
import { comicsStore } from './comicsStore.js';
import { slotsOf, volumeLook } from './look.js';

/** One series standing on the shelf: its volumes by number, the missing ones as dashed gaps, with its plaque. */
function SeriesRun({
  s,
  state,
  selected,
}: {
  s: Series;
  state: '' | 'dim' | 'glow' | 'gaps';
  selected: boolean;
}) {
  const look = volumeLook(s);
  const slots = slotsOf(s);
  const size = (w: number) => ({ '--w': `${w}px`, '--hh': `${look.h}px` }) as CSSProperties;
  const volState = state === 'gaps' ? 'dim' : state;
  const gapState = state === 'gaps' ? 'glow' : state;
  const open = (volume?: number) => comicsStore.openSeries(s.id, volume);
  return (
    <div className="lib-run series" data-id={s.id}>
      <span className="plaque">{s.title}</span>
      {slots.length === 0 && (
        <button
          type="button"
          className={`com-gap ${gapState}`}
          style={size(look.w + 6)}
          title={`${s.title}: sin tomos anotados`}
          onClick={() => open()}
        >
          ?
        </button>
      )}
      {slots.map((slot) =>
        slot.kind === 'vol' ? (
          <button
            key={`v${slot.number}`}
            type="button"
            className={`com-vol ${look.grapa ? 'grapa' : ''} ${volState} ${selected ? 'sel' : ''} ${
              s.readUpTo >= slot.number ? 'read' : ''
            }`}
            style={{ ...size(look.w), ...spineVars(look) }}
            title={`${s.title} ${slot.number}`}
            aria-label={`${s.title}, tomo ${slot.number}`}
            onClick={() => open(slot.number)}
            onFocus={() => comicsStore.select(s.id)}
          >
            <span className="top" />
            {!look.grapa && <span className="t">{s.title}</span>}
            <span className="n">{slot.number}</span>
          </button>
        ) : slot.kind === 'gap' ? (
          <button
            key={`g${slot.number}`}
            type="button"
            className={`com-gap ${gapState}`}
            style={size(look.w)}
            title={`Falta el ${slot.number} de ${s.title}`}
            aria-label={`Falta el ${slot.number} de ${s.title}`}
            onClick={() => open(slot.number)}
          >
            {slot.number}
          </button>
        ) : (
          <button
            key={`f${slot.from}`}
            type="button"
            className={`com-gap more ${gapState}`}
            style={size(look.w + 8)}
            title={`Faltan del ${slot.from} al ${slot.to} de ${s.title}`}
            aria-label={`Faltan del ${slot.from} al ${slot.to} de ${s.title}`}
            onClick={() => open(slot.from)}
          >
            {slot.from}–{slot.to}
          </button>
        ),
      )}
    </div>
  );
}

/** One shelf: its series side by side, scrolling sideways. */
export function ComicShelfRow({
  shelf,
  accent,
  selectedId,
  lit,
  onlyMissing,
  onAdd,
}: {
  shelf: ComicShelf;
  accent: string;
  selectedId?: string;
  lit?: ComicLit;
  onlyMissing: boolean;
  onAdd: () => void;
}) {
  const h = Math.max(96, ...shelf.series.map((s) => volumeLook(s).h));
  const stateOf = (s: Series): '' | 'dim' | 'glow' | 'gaps' =>
    lit ? (matchesComicLit(s, lit) ? 'glow' : 'dim') : onlyMissing ? 'gaps' : '';
  return (
    <section
      className="lib-shelf"
      style={{ '--acc': accent } as CSSProperties}
      data-shelf={shelf.key}
      aria-label={shelf.name}
    >
      <div className="top">
        <h3>{shelf.name}</h3>
        <span className="count">
          <b>
            {shelf.series.length} {shelf.series.length === 1 ? 'serie' : 'series'} · {shelf.owned}{' '}
            {shelf.owned === 1 ? 'tomo' : 'tomos'}
          </b>
          {shelf.missing > 0 && (
            <>
              {' · '}
              <em>faltan {shelf.missing}</em>
            </>
          )}
        </span>
      </div>
      <div className="lib-wood" style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        <div className="lib-track" style={{ '--h': `${h + 30}px`, gap: '10px' } as CSSProperties}>
          {shelf.series.map((s) => (
            <SeriesRun key={s.id} s={s} state={stateOf(s)} selected={s.id === selectedId} />
          ))}
          <span className="lib-end" aria-hidden="true" />
          <button
            type="button"
            className="lib-slot add"
            style={{ '--w': '30px', '--hh': '92px' } as CSSProperties}
            title={`Agregar una serie a ${shelf.name}`}
            aria-label={`Agregar una serie a ${shelf.name}`}
            onClick={onAdd}
          >
            +
          </button>
        </div>
      </div>
    </section>
  );
}
