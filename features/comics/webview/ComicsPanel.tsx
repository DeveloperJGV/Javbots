import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { panelClosed, panelOpened } from '../../../webview-ui/src/office/owner/panelPresence.js';
import type { Send } from '../../coleccion/webview/ColeccionBits.js';
import { runSearches } from '../../libros/core/cover.js';
import { LIB_TINT_BASE, LIBROS_CSS } from '../../libros/webview/constants.js';
import { problemsLine } from '../../libros/webview/librosText.js';
import { spineVars } from '../../libros/webview/spine.js';
import {
  buildComicShelves,
  COMIC_GROUPINGS,
  type ComicShelf,
  type ComicSuggestion,
  comicTotals,
  moveSeriesFocus,
  suggestComics,
} from '../core/shelves.js';
import type { Series } from '../core/types.js';
import { ComicShelfRow } from './ComicShelf.js';
import { type ComicFormMode, type ComicsState, comicsStore } from './comicsStore.js';
import { COMIC_GROUPING_LABEL, COMICS_CSS, SUGGEST_LIMIT } from './constants.js';
import { comicAccent, countText, volumeLook } from './look.js';
import { SeriesCard } from './SeriesCard.js';
import { SeriesForm } from './SeriesForm.js';

const SERVER_SNAPSHOT = comicsStore.get();
const GROUP_TEXT: Record<string, string> = { autor: 'Autor', editorial: 'Editorial' };

function Search({ list }: { list: readonly Series[] }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const found = useMemo(() => suggestComics(list, query, SUGGEST_LIMIT), [list, query]);
  const choose = (s: ComicSuggestion | undefined) => {
    if (!s) return;
    setQuery('');
    (document.activeElement as HTMLElement | null)?.blur();
    if (s.kind === 'series') {
      comicsStore.light(undefined);
      comicsStore.openSeries(s.series.id);
    } else comicsStore.light({ kind: s.kind, value: s.value });
  };
  return (
    <div className="lib-search">
      <input
        id="com-search"
        value={query}
        placeholder="Serie, autor, editorial…  ( / )"
        aria-label="Buscar por serie, autor o editorial"
        autoComplete="off"
        style={{ paddingLeft: 10 }}
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (found.length)
              setSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(found[sel]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setQuery('');
            e.currentTarget.blur();
          }
        }}
      />
      {focused && query.trim().length >= 2 && (
        <div className="lib-sugg" role="listbox">
          {found.length === 0 ? (
            <div className="none">Nada con eso. ¿La agregas con «+ Agregar»?</div>
          ) : (
            found.map((s, i) => (
              <button
                key={s.kind === 'series' ? s.series.id : `${s.kind}:${s.value}`}
                type="button"
                role="option"
                aria-selected={i === sel}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
              >
                {s.kind === 'series' ? (
                  <>
                    <span className="mini" style={spineVars(volumeLook(s.series))} />
                    <span className="nm">{s.series.title}</span>
                    <small>{countText(s.series)}</small>
                  </>
                ) : (
                  <>
                    <span className="mini grp" />
                    <span className="nm">
                      {GROUP_TEXT[s.kind]}: {s.value}
                    </span>
                    <small>{s.total}</small>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Rail({
  shelves,
  state,
  missing,
}: {
  shelves: ComicShelf[];
  state: ComicsState;
  missing: number;
}) {
  return (
    <nav className="lib-rail" aria-label="Repisas">
      <div className="hd">Repisas por</div>
      <div
        className="by"
        role="group"
        aria-label="Repisas por"
        style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
      >
        {COMIC_GROUPINGS.map((g) => (
          <button
            key={g}
            type="button"
            className="lib-chip"
            aria-pressed={state.grouping === g}
            onClick={() => comicsStore.setGrouping(g)}
          >
            {COMIC_GROUPING_LABEL[g]}
          </button>
        ))}
      </div>
      {shelves.map((s) => (
        <button
          key={s.key || '-'}
          type="button"
          className="s"
          style={{ '--acc': comicAccent(s.key ? s.name : '') } as CSSProperties}
          onClick={() =>
            document
              .querySelector(`.lib-shelf[data-shelf="${CSS.escape(s.key)}"]`)
              ?.scrollIntoView({ block: 'start' })
          }
        >
          <i />
          <span className="nm">{s.name}</span>
          <span>{s.series.length}</span>
        </button>
      ))}
      <div className="opts">
        <button
          type="button"
          className="lib-chip"
          aria-pressed={state.onlyMissing}
          disabled={!missing}
          onClick={() => comicsStore.toggleOnlyMissing()}
        >
          Solo lo que falta ({missing})
        </button>
        {state.lit && (
          <button
            type="button"
            className="lib-chip"
            aria-pressed
            onClick={() => comicsStore.light(undefined)}
          >
            {GROUP_TEXT[state.lit.kind]}: {state.lit.value} ×
          </button>
        )}
      </div>
    </nav>
  );
}

/** «Portadas»: look for every missing series cover (AniList and Open Library), with its progress and «Detener». */
function CoversSheet({
  list,
  state,
  send,
}: {
  list: readonly Series[];
  state: ComicsState;
  send: Send;
}) {
  const covers = state.status?.covers ?? [];
  const last = new Map(covers.map((c) => [c.id, c]));
  const missing = list.filter((s) => runSearches({ ...s, wanted: false }, last.get(s.id))).length;
  const run = state.status?.coverRun;
  const waiting = covers.filter((c) => c.state === 'elige');
  return (
    <div className="lib-sheet" role="dialog" aria-label="Portadas">
      <h3>
        Portadas
        <button
          type="button"
          className="lib-btn ghost lib-sq x"
          aria-label="Cerrar"
          onClick={() => comicsStore.show({ kind: 'shelves' })}
        >
          ×
        </button>
      </h3>
      <p className="lib-covers-intro">
        Con el ISBN de un tomo se pone la portada de Open Library. Si no, se ofrecen las de AniList
        (manga) y Open Library (cómic) por título, y tú eliges en cada serie. Nunca se pone una
        dudosa sola.
      </p>
      {run?.running ? (
        <div className="lib-q">
          {run.done} de {run.total} · {run.found} puestas · {run.choose} para elegir
          <button
            type="button"
            className="lib-btn"
            onClick={() => send({ type: 'comicsCoverRun', action: 'stop' })}
          >
            Detener
          </button>
        </div>
      ) : (
        <div className="lib-q">
          <button
            type="button"
            className="lib-btn acc"
            disabled={missing === 0}
            onClick={() => send({ type: 'comicsCoverRun', action: 'start' })}
          >
            Buscar las que faltan ({missing})
          </button>
          {run?.finishedAt && (
            <span className="lbl">
              {run.found} puestas, {run.choose} para elegir, {run.notFound} sin nada
              {run.failed ? `, ${run.failed} sin respuesta` : ''}.
            </span>
          )}
        </div>
      )}
      {waiting.length > 0 && (
        <div className="lib-hints">
          {waiting.map((c) => {
            const s = list.find((x) => x.id === c.id);
            return s ? (
              <button key={c.id} type="button" onClick={() => comicsStore.openSeries(s.id)}>
                {s.title}
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

export function ComicsPanel({ transport }: { transport: MessageTransport }) {
  const state = useSyncExternalStore(comicsStore.subscribe, comicsStore.get, () => SERVER_SNAPSHOT);
  return state.open ? <ComicsOpen transport={transport} state={state} /> : null;
}

/**
 * Comics and manga (features/comics): shelves by kind (or publisher, genre) with every series standing as its
 * volumes in order and dashed gaps for the missing ones; a series opens as a card to tick volumes. Opens from its
 * furniture (or the page's #comics hash).
 */
export function ComicsOpen({
  transport,
  state,
}: {
  transport: MessageTransport;
  state: ComicsState;
}) {
  const { status, view } = state;
  const send: Send = useCallback((msg) => transport.send(msg), [transport]);
  const list = useMemo(() => status?.series ?? [], [status]);
  const shelves = useMemo(() => buildComicShelves(list, state.grouping), [list, state.grouping]);
  const t = comicTotals(list);

  useEffect(() => {
    send({ type: 'comicsOpen' });
    panelOpened();
    return panelClosed;
  }, [send]);

  const save = useCallback(
    (s: Series, mode: ComicFormMode) => {
      const requestId = comicsStore.startSave(mode);
      send({ type: 'comicsSave', requestId, series: s });
    },
    [send],
  );
  const quickSave = useCallback((s: Series) => save(s, 'edit'), [save]);
  const remove = useCallback(
    (id: string) => {
      const requestId = comicsStore.startDelete();
      send({ type: 'comicsDelete', requestId, id });
    },
    [send],
  );
  const addTo = (s: ComicShelf) => {
    if (!s.key) return comicsStore.newSeries();
    const first = s.series[0];
    comicsStore.newSeries(
      state.grouping === 'tipo'
        ? { kind: first?.kind ?? '' }
        : state.grouping === 'editorial'
          ? { localPublisher: first?.localPublisher, publisher: first?.publisher }
          : { genre: s.name },
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const s = comicsStore.get();
      if (e.key === 'Escape') {
        if (typing && s.view.kind !== 'form') return;
        if (s.view.kind === 'form') comicsStore.leaveForm();
        else if (s.view.kind !== 'shelves') comicsStore.show({ kind: 'shelves' });
        else if (s.lit || s.onlyMissing) comicsStore.light(undefined);
        else comicsStore.close();
        return;
      }
      if (typing || s.view.kind !== 'shelves' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('com-search')?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        comicsStore.newSeries();
      } else if (e.key === 'Enter' && s.selectedId) {
        e.preventDefault();
        comicsStore.openSeries(s.selectedId);
      } else if (/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
        e.preventDefault();
        const next = moveSeriesFocus(
          shelves,
          s.selectedId ?? null,
          e.key as Parameters<typeof moveSeriesFocus>[2],
        );
        if (!next) return;
        comicsStore.select(next);
        document.querySelector<HTMLElement>(`.lib-run[data-id="${next}"] button`)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shelves]);

  const open = view.kind === 'series' ? list.find((s) => s.id === view.id) : undefined;
  const tint = comicAccent(
    open ? (open.kind ? open.kind.replace('-', ' ') : '') : (shelves[0]?.name ?? ''),
  );
  const problems = problemsLine(status?.problems ?? []);
  const run = status?.coverRun;

  return (
    <>
      <style>{LIBROS_CSS + COMICS_CSS}</style>
      <div className="lib-backdrop" style={{ zIndex: 50 }} onClick={() => comicsStore.close()} />
      <div
        className="lib-panel"
        style={
          {
            zIndex: 51,
            '--lib-tint': `color-mix(in srgb, ${tint} 40%, ${LIB_TINT_BASE})`,
          } as CSSProperties
        }
        role="dialog"
        aria-label="Cómics y manga"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <div className="lib-head">
          <div>
            <h1>Cómics y manga</h1>
            <div className="sub">
              {status ? (
                <>
                  <b>
                    {t.series} {t.series === 1 ? 'serie' : 'series'}
                  </b>{' '}
                  · {t.owned} {t.owned === 1 ? 'tomo' : 'tomos'}
                  {t.missing > 0 && (
                    <>
                      {' · '}
                      <i>faltan {t.missing}</i>
                    </>
                  )}
                </>
              ) : (
                'Sin conexión con la oficina'
              )}
            </div>
          </div>
          {status && <Search list={list} />}
          {status && (
            <>
              <button
                type="button"
                className="lib-btn"
                onClick={() => comicsStore.newSeries()}
                title="Agregar (N)"
              >
                + Agregar
              </button>
              <button
                type="button"
                className="lib-btn"
                aria-pressed={view.kind === 'covers'}
                onClick={() =>
                  comicsStore.show(
                    view.kind === 'covers' ? { kind: 'shelves' } : { kind: 'covers' },
                  )
                }
              >
                {run?.running ? `Portadas ${run.done}/${run.total}` : 'Portadas'}
              </button>
            </>
          )}
          <button
            type="button"
            className="lib-btn lib-sq"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            style={status ? undefined : { marginLeft: 'auto' }}
            onClick={() => comicsStore.close()}
          >
            ×
          </button>
        </div>
        <div className="lib-body">
          {!status ? (
            <div className="lib-locked">
              Los cómics no están disponibles en esta página. Ábrelos con el enlace con token de la
              oficina.
            </div>
          ) : (
            <>
              <Rail shelves={shelves} state={state} missing={t.missing} />
              {list.length === 0 ? (
                <div className="lib-empty">
                  <h2>Todavía no hay cómics</h2>
                  <p>
                    Cada serie se anota una vez, con los tomos que tienes («1-12» de 27). Los que
                    faltan salen como huecos en la repisa: son tu «se busca». Con «Buscar datos»,
                    AniList llena autores y tomos de un manga.
                  </p>
                  <div className="row">
                    <button
                      type="button"
                      className="lib-btn big"
                      onClick={() => comicsStore.newSeries()}
                    >
                      + Agrega la primera serie
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lib-shelves">
                  {shelves.map((s) => (
                    <ComicShelfRow
                      key={`${state.grouping}:${s.key}`}
                      shelf={s}
                      accent={comicAccent(s.key ? s.name : '')}
                      selectedId={state.selectedId}
                      lit={state.lit}
                      onlyMissing={state.onlyMissing}
                      onAdd={() => addTo(s)}
                    />
                  ))}
                </div>
              )}
              {problems && <div className="lib-problems">▲ {problems}</div>}
            </>
          )}
        </div>
        {open && view.kind === 'series' && (
          <SeriesCard
            key={open.id}
            s={open}
            volume={view.volume}
            state={state}
            search={status?.covers.find((c) => c.id === open.id)}
            send={send}
            onSave={quickSave}
            onDelete={remove}
          />
        )}
        {view.kind === 'form' && (
          <>
            <div className="lib-veil" onClick={() => comicsStore.leaveForm()} />
            <SeriesForm
              draft={view.draft}
              owned={view.owned}
              mode={view.mode}
              state={state}
              send={send}
              onSave={save}
            />
          </>
        )}
        {view.kind === 'covers' && (
          <>
            <div className="lib-veil" onClick={() => comicsStore.show({ kind: 'shelves' })} />
            <CoversSheet list={list} state={state} send={send} />
          </>
        )}
      </div>
    </>
  );
}
