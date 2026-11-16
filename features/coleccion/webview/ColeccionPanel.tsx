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
import { isoDay } from '../core/game.js';
import { PLATFORMS } from '../core/platforms.js';
import {
  buildShelves,
  moveFocus,
  type Shelf,
  shelfItems,
  suggest,
  type Suggestion,
  topPlatform,
  totals,
} from '../core/shelves.js';
import type { Game } from '../core/types.js';
import type { Send } from './ColeccionBits.js';
import { type ColeccionState, coleccionStore, type FormMode } from './coleccionStore.js';
import { platformName, problemsLine, summaryParts } from './coleccionText.js';
import {
  COL_TINT_BASE,
  COLECCION_CSS,
  EMPTY_SLOTS,
  lookOf,
  lookVars,
  SUGGEST_LIMIT,
} from './constants.js';
import { GameCase } from './GameCase.js';
import { GameForm } from './GameForm.js';
import { type Offsets, ShelfRow } from './Shelves.js';
import { Tonight } from './Tonight.js';
import { WantedPoster } from './WantedPoster.js';

const SERVER_SNAPSHOT = coleccionStore.get();

/** The magnifier of the search box, in pixels. */
function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 7 7"
      shape-rendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="0" width="3" height="1" />
      <rect x="0" y="1" width="1" height="3" />
      <rect x="4" y="1" width="1" height="3" />
      <rect x="1" y="4" width="3" height="1" />
      <rect x="4" y="4" width="1" height="1" />
      <rect x="5" y="5" width="1" height="1" />
      <rect x="6" y="6" width="1" height="1" />
    </svg>
  );
}

/** The search: a game or a series; a series lights up on every shelf, a game opens on its shelf. */
function Search({ games }: { games: readonly Game[] }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [focused, setFocused] = useState(false);
  const list = useMemo(() => suggest(games, query, SUGGEST_LIMIT), [games, query]);
  const show = focused && query.trim().length >= 2;

  const choose = (s: Suggestion | undefined) => {
    if (!s) return;
    setQuery('');
    (document.activeElement as HTMLElement | null)?.blur();
    if (s.kind === 'series') {
      coleccionStore.lightSeries(s.series);
      const first = games.find(
        (g) => g.series && s.series && g.series.toLowerCase() === s.series.toLowerCase(),
      );
      coleccionStore.select(first?.id);
    } else {
      coleccionStore.lightSeries(undefined);
      coleccionStore.openItem(s.game.id);
    }
  };

  return (
    <div className="col-search">
      <SearchIcon />
      <input
        id="col-search"
        value={query}
        placeholder="Buscar juego o serie  ( / )"
        aria-label="Buscar juego o serie"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (list.length)
              setSel((sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(list[sel]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setQuery('');
            e.currentTarget.blur();
          }
        }}
      />
      {show && (
        <div className="col-sugg" role="listbox">
          {list.length === 0 ? (
            <div className="none">Nada con ese nombre. ¿Lo agregas con «+ Agregar»?</div>
          ) : (
            list.map((s, i) =>
              s.kind === 'series' ? (
                <button
                  key={`s:${s.series}`}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  <span className="mini" style={{ background: 'var(--series)' }} />
                  Serie: {s.series}
                  <small>
                    tienes {s.owned} de {s.total}
                  </small>
                </button>
              ) : (
                <button
                  key={s.game.id}
                  type="button"
                  role="option"
                  aria-selected={i === sel}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  <span
                    className={s.game.wanted ? 'mini gap' : 'mini'}
                    style={
                      s.game.wanted
                        ? undefined
                        : ({
                            background: lookOf(s.game.platform).box,
                            boxShadow: `inset 0 5px 0 ${lookOf(s.game.platform).band}`,
                          } as CSSProperties)
                    }
                  />
                  {s.game.title}
                  <small>
                    {platformName(s.game.platform)}
                    {s.game.wanted ? ' · se busca' : ''}
                  </small>
                </button>
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}

/** The rail: every console by era, with how many it has; a click goes to its shelf (or adds its first game). */
function Rail({
  shelves,
  current,
  state,
  wantedCount,
}: {
  shelves: Shelf[];
  current: string | null;
  state: ColeccionState;
  wantedCount: number;
}) {
  // Many consoles: the rail lists the ones with a shelf; the rest open on demand (all of them while it's empty)
  const [more, setMore] = useState(false);
  const showAll = more || shelves.length === 0;
  let era = '';
  const known = new Set(PLATFORMS.map((p) => p.id));
  const extra = shelves.filter((s) => !known.has(s.platform));
  const has = new Set(shelves.map((s) => s.platform));
  const hidden = PLATFORMS.filter((p) => !has.has(p.id)).length;
  const items = [
    ...PLATFORMS.filter((p) => showAll || has.has(p.id)).map((p) => ({
      id: p.id,
      name: p.name,
      era: p.era,
    })),
    ...extra.map((s) => ({ id: s.platform, name: s.name, era: s.era })),
  ];
  return (
    <nav className="col-rail" aria-label="Consolas">
      {items.map((p) => {
        const shelf = shelves.find((s) => s.platform === p.id);
        const head =
          p.era !== era
            ? ((era = p.era),
              (
                <div className="era" key={`e:${p.era}`}>
                  {p.era}
                </div>
              ))
            : null;
        return [
          head,
          <button
            key={p.id}
            type="button"
            className={current === p.id ? 'p on' : 'p'}
            style={{ ...lookVars(lookOf(p.id)), opacity: shelf ? 1 : 0.55 } as CSSProperties}
            title={shelf ? `Ir a ${p.name}` : `Agregar el primero de ${p.name}`}
            onClick={() => {
              if (!shelf) {
                coleccionStore.newGame(p.id);
                return;
              }
              document
                .querySelector(`.col-shelf[data-platform="${p.id}"]`)
                ?.scrollIntoView({ block: 'start' });
            }}
          >
            <i />
            {p.name}
            <span>{shelf ? shelf.owned : '+'}</span>
          </button>,
        ];
      })}
      {shelves.length > 0 && hidden > 0 && (
        <button
          type="button"
          className="col-chip more"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          {more ? 'Solo las que tienen juegos' : `+ Otra consola (${hidden})`}
        </button>
      )}
      <div className="opts">
        <button
          type="button"
          className="col-chip"
          aria-pressed={state.bySeries}
          onClick={() => coleccionStore.toggleSeries()}
        >
          Agrupar por serie
        </button>
        <button
          type="button"
          className="col-chip"
          aria-pressed={state.onlyWanted}
          disabled={!wantedCount}
          onClick={() => coleccionStore.toggleOnlyWanted()}
        >
          Solo «se busca» ({wantedCount})
        </button>
        {state.litSeries && (
          <button
            type="button"
            className="col-chip"
            aria-pressed
            onClick={() => coleccionStore.lightSeries(undefined)}
          >
            Serie: {state.litSeries} ×
          </button>
        )}
      </div>
    </nav>
  );
}

/** Nothing yet: a bare shelf with empty slots that invites to put the first one. */
function EmptyCollection() {
  const look = lookOf('x360');
  return (
    <div className="col-empty">
      <h2>Tu colección está vacía</h2>
      <p>
        Cada consola tiene su repisa. Agrega tus juegos a mano, uno tras otro: nombre y consola, y
        lo demás cuando quieras. Lo que te falta se anota como «se busca», con el precio que viste.
      </p>
      <div className="col-shelf" style={lookVars(look)}>
        <div className="col-wood">
          <div className="col-track" style={{ '--h': `${look.h + 34}px` } as CSSProperties}>
            <button
              type="button"
              className="col-slot add"
              style={{ '--w': '44px', '--hh': `${look.h}px` } as CSSProperties}
              aria-label="Agregar el primero"
              onClick={() => coleccionStore.newGame()}
            >
              +
            </button>
            {Array.from({ length: EMPTY_SLOTS }, (_, i) => (
              <span
                key={i}
                className="col-slot"
                style={
                  {
                    '--w': `${look.w + (i % 3) * 2}px`,
                    '--hh': `${look.h - (i % 4) * 6}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      </div>
      <div className="row">
        <button type="button" className="col-btn big" onClick={() => coleccionStore.newGame()}>
          + Agrega el primero
        </button>
        <button type="button" className="col-btn" onClick={() => coleccionStore.newGame('', true)}>
          Anotar un «se busca»
        </button>
      </div>
    </div>
  );
}

/**
 * The game collection (features/coleccion): a shelf per console with the games drawn by code, the "se busca" gaps
 * with their price, a search that lights a series on every shelf, and "¿Qué jugamos hoy?". Opens from its furniture
 * next to the free-time TV (or the page's #coleccion hash).
 */
export function ColeccionPanel({ transport }: { transport: MessageTransport }) {
  const state = useSyncExternalStore(
    coleccionStore.subscribe,
    coleccionStore.get,
    () => SERVER_SNAPSHOT,
  );
  return state.open ? <ColeccionOpen transport={transport} state={state} /> : null;
}

/** The panel's contents (exported for tests: it renders without the office). */
export function ColeccionOpen({
  transport,
  state,
}: {
  transport: MessageTransport;
  state: ColeccionState;
}) {
  const { status, view, selectedId } = state;
  const send: Send = useCallback((msg) => transport.send(msg), [transport]);
  const offsets = useRef<Offsets>(new Map()).current;
  const listRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  // The day the panel opened (a panel left open past midnight keeps it; reopening refreshes it)
  const [today] = useState(() => isoDay(Date.now()));

  const games = useMemo(() => status?.games ?? [], [status]);
  const shelves = useMemo(() => buildShelves(games, state.bySeries), [games, state.bySeries]);
  const lit = useMemo(() => topPlatform(shelves), [shelves]);
  const t = totals(games);
  const parts = summaryParts(t);

  useEffect(() => {
    send({ type: 'coleccionOpen' });
    panelOpened();
    return panelClosed;
  }, [send]);

  const save = useCallback(
    (draft: Game, mode: FormMode) => {
      const requestId = coleccionStore.startSave(mode);
      send({ type: 'coleccionSave', requestId, game: draft });
    },
    [send],
  );
  const remove = useCallback(
    (id: string) => {
      const requestId = coleccionStore.startDelete();
      send({ type: 'coleccionDelete', requestId, id });
    },
    [send],
  );
  const played = useCallback(
    (g: Game) => {
      const requestId = coleccionStore.startSave('edit');
      send({ type: 'coleccionSave', requestId, game: { ...g, lastPlayed: today } });
    },
    [send, today],
  );

  // The rail follows the shelf at the top of the list
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const mark = () => {
      let act: string | null = null;
      for (const s of el.querySelectorAll<HTMLElement>('.col-shelf[data-platform]'))
        if (s.offsetTop <= el.scrollTop + 40 || act === null) act = s.dataset.platform ?? null;
      setCurrent(act);
    };
    mark();
    el.addEventListener('scroll', mark);
    return () => el.removeEventListener('scroll', mark);
  }, [shelves]);

  // Keyboard: / searches, N adds, arrows walk the boxes, Esc goes back one step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      const s = coleccionStore.get();
      if (e.key === 'Escape') {
        // In a field, Esc only leaves the form (the search box handles its own Esc)
        if (typing && s.view.kind !== 'form') return;
        if (s.view.kind === 'form') coleccionStore.leaveForm();
        else if (s.view.kind !== 'shelves') coleccionStore.show({ kind: 'shelves' });
        else if (s.litSeries || s.onlyWanted) coleccionStore.lightSeries(undefined);
        else coleccionStore.close();
        return;
      }
      if (typing || s.view.kind !== 'shelves' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('col-search')?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        coleccionStore.newGame(current ?? '');
      } else if (/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) {
        e.preventDefault();
        const next = moveFocus(
          shelves,
          s.selectedId ?? null,
          e.key as Parameters<typeof moveFocus>[2],
        );
        if (!next) return;
        coleccionStore.select(next);
        document
          .querySelector<HTMLElement>(`.col-track [data-id="${next}"]`)
          ?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shelves, current]);

  // The background takes the color of the console you are on
  const tintPlatform =
    (view.kind === 'case' || view.kind === 'wanted'
      ? games.find((g) => g.id === view.id)?.platform
      : undefined) ??
    games.find((g) => g.id === selectedId)?.platform ??
    current ??
    lit;
  const tint = tintPlatform ? lookOf(tintPlatform).accent : undefined;

  const caseGame = view.kind === 'case' ? games.find((g) => g.id === view.id) : undefined;
  const wantedGame = view.kind === 'wanted' ? games.find((g) => g.id === view.id) : undefined;
  const siblings = caseGame
    ? shelfItems(shelves.find((s) => s.platform === (caseGame.platform || 'otra')) ?? shelves[0])
        .filter((g) => !g.wanted)
        .map((g) => g.id)
    : [];
  const problems = problemsLine(status?.problems ?? []);

  return (
    <>
      <style>{COLECCION_CSS}</style>
      <div className="col-backdrop" style={{ zIndex: 50 }} onClick={() => coleccionStore.close()} />
      <div
        className="col-panel"
        style={
          {
            zIndex: 51,
            ...(tint ? { '--col-tint': `color-mix(in srgb, ${tint} 45%, ${COL_TINT_BASE})` } : {}),
          } as CSSProperties
        }
        role="dialog"
        aria-label="Colección de juegos"
      >
        <div className="col-head">
          <div>
            <h1>Colección de juegos</h1>
            <div className="sub">
              {status ? (
                <>
                  <b>{parts.owned}</b> · <b>{parts.platforms}</b>
                  {parts.wanted && (
                    <>
                      {' · '}
                      <i>{parts.wanted}</i>
                    </>
                  )}
                </>
              ) : (
                'Sin conexión con la oficina'
              )}
            </div>
          </div>
          {status && <Search games={games} />}
          {status && (
            <>
              <button
                type="button"
                className="col-btn"
                onClick={() => coleccionStore.newGame(current ?? '')}
                title="Agregar (N)"
              >
                + Agregar
              </button>
              <button
                type="button"
                className="col-btn big"
                onClick={() =>
                  coleccionStore.show(
                    view.kind === 'tonight' ? { kind: 'shelves' } : { kind: 'tonight' },
                  )
                }
              >
                ¿Qué jugamos hoy?
              </button>
            </>
          )}
          <button
            type="button"
            className="col-btn col-sq"
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            style={status ? undefined : { marginLeft: 'auto' }}
            onClick={() => coleccionStore.close()}
          >
            ×
          </button>
        </div>
        <div className="col-body">
          {!status ? (
            <div className="col-locked">
              La colección no está disponible en esta página. Ábrela con el enlace con token de la
              oficina.
            </div>
          ) : (
            <>
              <Rail shelves={shelves} current={current} state={state} wantedCount={t.wanted} />
              {games.length === 0 ? (
                <EmptyCollection />
              ) : (
                <div className="col-shelves" ref={listRef}>
                  {shelves.map((s) => (
                    <ShelfRow
                      key={s.platform}
                      shelf={s}
                      lit={s.platform === lit}
                      today={today}
                      offsets={offsets}
                      selectedId={selectedId}
                      litSeries={state.litSeries}
                      onlyWanted={state.onlyWanted}
                      onOpen={(id) => coleccionStore.openItem(id)}
                    />
                  ))}
                </div>
              )}
              {problems && (
                <div className="col-problems" title={status.problems.join('\n')}>
                  ▲ {problems}
                </div>
              )}
            </>
          )}
        </div>
        {wantedGame && <WantedPoster game={wantedGame} games={games} onDelete={remove} />}
        {caseGame && (
          <GameCase
            key={caseGame.id}
            game={caseGame}
            games={games}
            siblings={siblings}
            today={today}
            onDelete={remove}
            onPlayed={played}
          />
        )}
        {view.kind === 'form' && (
          <>
            <div className="col-veil" onClick={() => coleccionStore.leaveForm()} />
            <GameForm
              draft={view.draft}
              mode={view.mode}
              state={state}
              games={games}
              onSave={save}
            />
          </>
        )}
        {view.kind === 'tonight' && (
          <>
            <div className="col-veil" onClick={() => coleccionStore.show({ kind: 'shelves' })} />
            <Tonight games={games} today={today} />
          </>
        )}
        {state.formError && view.kind !== 'form' && (
          <div className="col-problems">▲ {state.formError}</div>
        )}
      </div>
    </>
  );
}
