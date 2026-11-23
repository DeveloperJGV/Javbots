import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Send } from '../../coleccion/webview/ColeccionBits.js';
import { authorsText, parseAuthors } from '../../libros/core/book.js';
import { COMIC_GENRES, TITLE_MAX, VOLUME_MAX, YEAR_MAX } from '../core/constants.js';
import { parseVolumeList, volumeListText, withOwned } from '../core/series.js';
import { fold } from '../core/shelves.js';
import { COMIC_FORMATS, KINDS, type Series } from '../core/types.js';
import { type ComicFormMode, type ComicsState, comicsStore } from './comicsStore.js';
import { COMIC_FORMAT_LABEL, KIND_LABEL, SAVED_NOTE_MS } from './constants.js';

function Chips<T extends string>({
  options,
  value,
  label,
  onPick,
}: {
  options: readonly T[];
  value: T | '';
  label: (v: T) => string;
  onPick: (v: T | '') => void;
}) {
  return (
    <>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className="lib-chip"
          aria-pressed={value === o}
          onClick={() => onPick(value === o ? '' : o)}
        >
          {label(o)}
        </button>
      ))}
    </>
  );
}

function NumberInput({
  value,
  max,
  label,
  placeholder,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  placeholder: string;
  onChange: (n: number) => void;
}) {
  return (
    <input
      className="lib-input num"
      inputMode="numeric"
      value={value ? String(value) : ''}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 5);
        onChange(digits ? Math.min(max, Number(digits)) : 0);
      }}
    />
  );
}

/** What AniList or Open Library has with that title: up to four, shown before anything goes into the form. */
function LookupList({ state }: { state: ComicsState }) {
  const l = state.lookup;
  if (!l) return null;
  if (l.state === 'buscando')
    return (
      <div className="com-lookup">
        <span className="hd">Buscando…</span>
      </div>
    );
  if (l.state === 'nada')
    return (
      <div className="lib-found bad" style={{ marginLeft: 136 }}>
        {l.reason === 'sin-respuesta'
          ? 'La fuente no contestó. Intenta otra vez en un rato.'
          : 'No encontré nada con ese título. Llénalo a mano.'}
        <div className="acts">
          <button type="button" className="lib-btn ghost" onClick={() => comicsStore.dropLookup()}>
            Cerrar
          </button>
        </div>
      </div>
    );
  return (
    <div className="com-lookup" role="listbox">
      <span className="hd">
        {l.found?.[0]?.source === 'anilist' ? 'AniList' : 'Open Library'} tiene esto; ¿es alguna?
      </span>
      {(l.found ?? []).map((f, n) => (
        <button key={n} type="button" onClick={() => comicsStore.useLookup(n)}>
          {f.title}
          {f.altTitle && <small>{f.altTitle}</small>}
          <small>
            {[
              authorsText([...f.writers, ...f.artists]),
              f.year || '',
              f.volumes ? `${f.volumes} tomos` : '',
              f.finished ? 'terminada' : '',
              f.genres.slice(0, 3).join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
        </button>
      ))}
      <button type="button" className="lib-btn ghost" onClick={() => comicsStore.dropLookup()}>
        Ninguna
      </button>
    </div>
  );
}

/**
 * Add or edit a series. The volumes go as a list: «Tengo 1-12» of 27, never one by one. Enter saves and keeps kind,
 * format, language, publishers, genre and whose for the next series.
 */
export function SeriesForm({
  draft,
  owned,
  mode,
  state,
  send,
  onSave,
}: {
  draft: Series;
  owned: string;
  mode: ComicFormMode;
  state: ComicsState;
  send: Send;
  onSave: (s: Series, mode: ComicFormMode) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Series>, ownedText?: string) =>
    comicsStore.updateDraft(patch, ownedText);
  const [writers, setWriters] = useState(() => authorsText(draft.writers));
  const [artists, setArtists] = useState(() => authorsText(draft.artists));
  const w = authorsText(draft.writers);
  const a = authorsText(draft.artists);
  useEffect(() => setWriters(w), [w]);
  useEffect(() => setArtists(a), [a]);
  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [state.focusName]);
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!state.savedInRow) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), SAVED_NOTE_MS);
    return () => clearTimeout(t);
  }, [state.savedInRow]);
  const ownedList = useMemo(() => parseVolumeList(owned), [owned]);
  const genreKnown = COMIC_GENRES.some((g) => fold(g) === fold(draft.genre));

  const submit = () => {
    if (!draft.title.trim()) {
      comicsStore.setFormError('Falta el título de la serie.');
      titleRef.current?.focus();
      return;
    }
    if (ownedList === null) {
      comicsStore.setFormError('No entiendo los tomos que tienes: escríbelos como 1-12, 15.');
      return;
    }
    onSave(
      {
        ...draft,
        writers: parseAuthors(writers),
        artists: parseAuthors(artists),
        volumes: withOwned(draft.volumes, ownedList),
      },
      mode,
    );
  };
  const enter = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };
  const lookup = () => {
    if (!draft.title.trim()) return;
    const requestId = comicsStore.startLookup();
    send({ type: 'comicsLookup', requestId, title: draft.title, kind: draft.kind });
  };
  const title = mode === 'edit' ? 'Editar serie' : 'Agregar series';
  const saved = showSaved ? state.lastSaved : undefined;
  const count = ownedList?.length ?? 0;

  return (
    <div className="lib-sheet" role="dialog" aria-label={title}>
      <h3>
        {title}
        {state.formError ? (
          <span className="lib-warn">{state.formError}</span>
        ) : (
          saved &&
          mode === 'new' && (
            <span className="lib-saved">
              ✓ {saved} · {state.savedInRow} seguidas
            </span>
          )
        )}
        <button
          type="button"
          className="lib-btn ghost lib-sq x"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => comicsStore.leaveForm()}
        >
          ×
        </button>
      </h3>
      <div className="lib-q">
        <span className="k">Serie</span>
        <input
          ref={titleRef}
          className="lib-input grow"
          value={draft.title}
          maxLength={TITLE_MAX}
          placeholder="Título de la serie o del cómic"
          aria-label="Título de la serie"
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={enter}
        />
        <button
          type="button"
          className="lib-btn"
          disabled={!draft.title.trim() || state.lookup?.state === 'buscando'}
          title="Pregunta a AniList (manga) u Open Library (cómic) por autores, tomos y año"
          onClick={lookup}
        >
          Buscar datos
        </button>
      </div>
      <LookupList state={state} />
      <div className="lib-q">
        <span className="k">Tipo</span>
        <Chips
          options={KINDS}
          value={draft.kind}
          label={(v) => KIND_LABEL[v]}
          onPick={(v) => set({ kind: v })}
        />
      </div>
      <div className="lib-q">
        <span className="k">Tengo</span>
        <input
          className="lib-input grow"
          value={owned}
          placeholder="1-12, 15, 17"
          aria-label="Tomos que tienes"
          onChange={(e) => set({}, e.target.value)}
          onKeyDown={enter}
        />
        <span className="lbl">de</span>
        <NumberInput
          value={draft.totalVolumes}
          max={VOLUME_MAX}
          label="Cuántos tomos tiene la serie"
          placeholder="¿?"
          onChange={(n) => set({ totalVolumes: n })}
        />
        <button
          type="button"
          className="lib-chip"
          aria-pressed={draft.finished}
          onClick={() => set({ finished: !draft.finished })}
        >
          Ya terminó
        </button>
      </div>
      <div className="lib-q">
        <span className="k" />
        <span className="lbl">
          {ownedList === null
            ? 'Escríbelos como 1-12, 15 (con «a» también: 17 a 20).'
            : count
              ? `${count} ${count === 1 ? 'tomo' : 'tomos'}: ${volumeListText(ownedList)}`
              : 'Ninguno todavía: queda como «se busca».'}
        </span>
        <span className="lbl">Voy en</span>
        <NumberInput
          value={draft.readUpTo}
          max={VOLUME_MAX}
          label="Último tomo leído"
          placeholder="—"
          onChange={(n) => set({ readUpTo: n })}
        />
      </div>
      <div className="lib-q">
        <span className="k">Guion</span>
        <input
          className="lib-input grow"
          value={writers}
          placeholder="Separados por comas"
          aria-label="Guion"
          onChange={(e) => setWriters(e.target.value)}
          onBlur={() => set({ writers: parseAuthors(writers) })}
          onKeyDown={enter}
        />
        <span className="lbl">Dibujo</span>
        <input
          className="lib-input grow"
          value={artists}
          placeholder="Si es otra persona"
          aria-label="Dibujo"
          onChange={(e) => setArtists(e.target.value)}
          onBlur={() => set({ artists: parseAuthors(artists) })}
          onKeyDown={enter}
        />
      </div>
      <div className="lib-q">
        <span className="k">Editorial</span>
        <input
          className="lib-input grow"
          value={draft.publisher}
          placeholder="Original"
          aria-label="Editorial original"
          onChange={(e) => set({ publisher: e.target.value })}
          onKeyDown={enter}
        />
        <input
          className="lib-input grow"
          value={draft.localPublisher}
          placeholder="La de aquí (México, España…)"
          aria-label="Editorial de esta edición"
          onChange={(e) => set({ localPublisher: e.target.value })}
          onKeyDown={enter}
        />
      </div>
      <div className="lib-q">
        <span className="k">Género</span>
        <div className="lib-genres">
          {COMIC_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className="lib-chip"
              aria-pressed={fold(draft.genre) === fold(g)}
              onClick={() => set({ genre: fold(draft.genre) === fold(g) ? '' : g })}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="lib-q">
        <span className="k" />
        <input
          className="lib-input grow"
          value={genreKnown ? '' : draft.genre}
          placeholder="¿Otro? Escríbelo aquí"
          aria-label="Otro género"
          onChange={(e) => set({ genre: e.target.value })}
          onKeyDown={enter}
        />
      </div>
      <div className="lib-q">
        <span className="k">Formato</span>
        <Chips
          options={COMIC_FORMATS}
          value={draft.format}
          label={(v) => COMIC_FORMAT_LABEL[v]}
          onPick={(v) => set({ format: v })}
        />
        <span className="lbl">Año</span>
        <NumberInput
          value={draft.year}
          max={YEAR_MAX}
          label="Año"
          placeholder="Año"
          onChange={(n) => set({ year: n })}
        />
      </div>
      <div className="lib-q">
        <span className="k">Idioma</span>
        <input
          className="lib-input grow"
          value={draft.language}
          placeholder="Español"
          aria-label="Idioma"
          onChange={(e) => set({ language: e.target.value })}
          onKeyDown={enter}
        />
        <span className="lbl">De quién</span>
        <input
          className="lib-input grow"
          value={draft.owner}
          placeholder="Opcional"
          aria-label="De quién es"
          onChange={(e) => set({ owner: e.target.value })}
          onKeyDown={enter}
        />
      </div>
      <div className="lib-q">
        <span className="k">Notas</span>
        <textarea
          className="lib-input grow"
          value={draft.notes}
          aria-label="Notas"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
      <div className="lib-foot">
        <button type="button" className="lib-btn acc" disabled={!!state.pending} onClick={submit}>
          {mode === 'new' ? 'Guardar y otra (Enter)' : 'Guardar'}
        </button>
        {mode === 'new' && (
          <button
            type="button"
            className="lib-btn"
            onClick={() => comicsStore.show({ kind: 'shelves' })}
          >
            Listo
          </button>
        )}
        {mode === 'new' && !saved && !state.formError && (
          <span className="hint">
            Solo el título es obligatorio. Los tomos van juntos: «1-12» de 27, y los que faltan
            quedan como «se busca».
          </span>
        )}
      </div>
    </div>
  );
}
