import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Send } from '../../coleccion/webview/ColeccionBits.js';
import { authorsText, parseAuthors } from '../core/book.js';
import { PAGES_MAX, SERIES_NUMBER_MAX, TITLE_MAX, YEAR_MAX } from '../core/constants.js';
import { GENRES, LANGUAGES } from '../core/genres.js';
import { cleanIsbn } from '../core/isbn.js';
import { fold, knownValues } from '../core/shelves.js';
import { type Book, FORMATS, READING } from '../core/types.js';
import { FORMAT_LABEL, READING_LABEL, SAVED_NOTE_MS } from './constants.js';
import { type FormMode, type LibrosState, librosStore } from './librosStore.js';
import { draftProblem, isbnWarning } from './librosText.js';
import { accentOf } from './spine.js';

/** A row of choice chips; clicking the chosen one again clears it ("not said"). */
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

/** Hints under a text field: values already used that look like what is typed. */
function Hints({
  values,
  current,
  onPick,
}: {
  values: string[];
  current: string;
  onPick: (v: string) => void;
}) {
  const q = fold(current);
  const list = values.filter((s) => (!q || fold(s).includes(q)) && fold(s) !== q).slice(0, 6);
  if (!list.length) return null;
  return (
    <div className="lib-hints">
      {list.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}

/** A number field where empty means 0 ("not said"). */
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
  placeholder?: string;
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

/** What Open Library said of the ISBN, shown before anything goes into the form. */
function LookupCard({ state, onUse }: { state: LibrosState; onUse: (andSave: boolean) => void }) {
  const l = state.lookup;
  if (!l) return null;
  if (l.state === 'buscando')
    return (
      <div className="lib-found">
        <div className="hd">Preguntando a Open Library por {l.isbn}…</div>
      </div>
    );
  if (l.state === 'nada')
    return (
      <div className="lib-found bad">
        {l.reason === 'invalido'
          ? 'Ese ISBN no cuadra: revisa los dígitos.'
          : l.reason === 'sin-respuesta'
            ? 'Open Library no contestó. Intenta otra vez en un rato.'
            : 'Open Library no conoce ese ISBN. Llénalo a mano.'}
        <div className="acts">
          <button type="button" className="lib-btn ghost" onClick={() => librosStore.dropLookup()}>
            Cerrar
          </button>
        </div>
      </div>
    );
  const f = l.found;
  if (!f) return null;
  return (
    <div className="lib-found" role="status">
      <div className="hd">Open Library dice que el {l.isbn} es:</div>
      <div className="ln">{f.title}</div>
      {f.authors.length > 0 && (
        <div className="ln">
          <span>de</span> {authorsText(f.authors)}
        </div>
      )}
      <div className="ln">
        <span>
          {[f.publisher, f.year || '', f.pages ? `${f.pages} páginas` : '']
            .filter(Boolean)
            .join(' · ') || 'Sin editorial ni año'}
        </span>
      </div>
      <div className="acts">
        <button type="button" className="lib-btn acc" onClick={() => onUse(false)}>
          Pasar a la ficha
        </button>
        {state.view.kind === 'form' && state.view.mode === 'new' && (
          <button type="button" className="lib-btn" onClick={() => onUse(true)}>
            Pasar y guardar
          </button>
        )}
        <button type="button" className="lib-btn ghost" onClick={() => librosStore.dropLookup()}>
          No es este
        </button>
        {f.hasCover && <span className="hint">Trae portada: se pone al guardar.</span>}
      </div>
    </div>
  );
}

/**
 * Add or edit a book by hand: only the title is required. Made to put in many in a row: Enter saves, what repeats
 * stays (genre, format, language, whose; and author, publisher and the next number when it is a saga), and the
 * cursor goes back to the title, or to the ISBN when the last one came from it (a barcode reader types the ISBN and
 * Enter: Enter asks Open Library, Enter again in its card would need a click, so «Pasar y guardar» does both).
 */
export function BookForm({
  draft,
  mode,
  state,
  books,
  send,
  onSave,
}: {
  draft: Book;
  mode: FormMode;
  state: LibrosState;
  books: readonly Book[];
  send: Send;
  onSave: (draft: Book, mode: FormMode, findCover: boolean) => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const isbnRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Book>) => librosStore.updateDraft(patch);
  const pending = !!state.pending;
  // The authors are typed as one line and read as a list only when saved, so commas can be typed freely
  const [authorsLine, setAuthorsLine] = useState(() => authorsText(draft.authors));
  const draftAuthors = authorsText(draft.authors);
  useEffect(() => setAuthorsLine(draftAuthors), [draftAuthors]);

  const authors = useMemo(() => knownValues(books, (b) => b.authors), [books]);
  const publishers = useMemo(() => knownValues(books, (b) => [b.publisher]), [books]);
  const series = useMemo(() => knownValues(books, (b) => [b.series]), [books]);
  const owners = useMemo(() => knownValues(books, (b) => [b.owner, b.lentTo]), [books]);
  const genres = useMemo(() => {
    const used = knownValues(books, (b) => [b.genre]).filter(
      (g) => !GENRES.some((x) => fold(x) === fold(g)),
    );
    return [...GENRES, ...used];
  }, [books]);

  useEffect(() => {
    const el = mode === 'new' && state.focusField === 'isbn' ? isbnRef.current : titleRef.current;
    el?.focus();
    el?.select();
    // Only when the form asks for it (opened, or saved and next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.focusName]);

  // The "✓ Guardado" note fades by itself
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (!state.savedInRow) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), SAVED_NOTE_MS);
    return () => clearTimeout(t);
  }, [state.savedInRow]);
  const saved = showSaved ? state.lastSaved : undefined;

  const withAuthors = (d: Book): Book => ({ ...d, authors: parseAuthors(authorsLine) });
  const submit = (d: Book = withAuthors(draft)) => {
    const problem = draftProblem(d);
    if (problem) {
      librosStore.setFormError(problem);
      titleRef.current?.focus();
      return;
    }
    onSave(d, mode, !!state.draftFromIsbn && !d.coverArt);
  };
  const lookup = () => {
    const isbn = cleanIsbn(draft.isbn);
    if (!isbn) {
      isbnRef.current?.focus();
      return;
    }
    const requestId = librosStore.startLookup(isbn);
    send({ type: 'librosLookup', requestId, isbn });
  };
  const useLookup = (andSave: boolean) => {
    librosStore.useLookup();
    if (!andSave) {
      titleRef.current?.focus();
      return;
    }
    const v = librosStore.get().view;
    if (v.kind === 'form') {
      setAuthorsLine(authorsText(v.draft.authors));
      const problem = draftProblem(v.draft);
      if (problem) librosStore.setFormError(problem);
      else onSave(v.draft, mode, !!librosStore.get().draftFromIsbn);
    }
  };
  const enterSaves = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const title =
    mode === 'edit'
      ? draft.wanted
        ? 'Editar «se busca»'
        : 'Editar libro'
      : mode === 'acquire'
        ? '¡Ya lo tienes! Cómo llegó'
        : draft.wanted
          ? 'Anotar un «se busca»'
          : 'Agregar libros';
  const warn = isbnWarning(cleanIsbn(draft.isbn));

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
              ✓ {saved} · {state.savedInRow} {state.savedInRow === 1 ? 'agregado' : 'agregados'}{' '}
              seguidos
            </span>
          )
        )}
        <button
          type="button"
          className="lib-btn ghost lib-sq x"
          aria-label="Cerrar"
          title="Cerrar (Esc)"
          onClick={() => librosStore.leaveForm()}
        >
          ×
        </button>
      </h3>
      <div className="lib-q">
        <span className="k">Título</span>
        <input
          ref={titleRef}
          className="lib-input grow"
          value={draft.title}
          maxLength={TITLE_MAX}
          placeholder="Título del libro"
          aria-label="Título"
          onChange={(e) => set({ title: e.target.value })}
          onFocus={() => librosStore.setFocusField('title')}
          onKeyDown={enterSaves}
        />
      </div>
      <div className="lib-q">
        <span className="k">Autor(es)</span>
        <div className="grow">
          <input
            className="lib-input"
            value={authorsLine}
            placeholder="Separados por comas"
            aria-label="Autor o autores"
            onChange={(e) => setAuthorsLine(e.target.value)}
            onBlur={() => set({ authors: parseAuthors(authorsLine) })}
            onKeyDown={enterSaves}
          />
          <Hints
            values={authors}
            current={authorsLine.split(',').pop() ?? ''}
            onPick={(a) => {
              const parts = authorsLine
                .split(',')
                .slice(0, -1)
                .map((s) => s.trim())
                .filter(Boolean);
              const next = [...parts, a].join(', ');
              setAuthorsLine(next);
              set({ authors: parseAuthors(next) });
            }}
          />
        </div>
      </div>
      <div className="lib-q">
        <span className="k">ISBN</span>
        <input
          ref={isbnRef}
          className="lib-input grow"
          value={draft.isbn}
          placeholder="Atrás, junto al código de barras"
          aria-label="ISBN"
          inputMode="numeric"
          onChange={(e) => set({ isbn: e.target.value.slice(0, 24) })}
          onBlur={() => set({ isbn: cleanIsbn(draft.isbn) })}
          onFocus={() => librosStore.setFocusField('isbn')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              lookup();
            }
          }}
        />
        <button
          type="button"
          className="lib-btn"
          disabled={!cleanIsbn(draft.isbn) || state.lookup?.state === 'buscando'}
          onClick={lookup}
          title="Pregunta a Open Library el título, autor, editorial y año (Enter en el ISBN)"
        >
          Buscar datos
        </button>
      </div>
      {warn && !state.lookup && (
        <div className="lib-q">
          <span className="k" />
          <span className="lib-warn">{warn}</span>
        </div>
      )}
      <LookupCard state={state} onUse={useLookup} />
      <div className="lib-q">
        <span className="k">Editorial</span>
        <div className="grow">
          <input
            className="lib-input"
            value={draft.publisher}
            placeholder="Opcional"
            aria-label="Editorial"
            onChange={(e) => set({ publisher: e.target.value })}
            onKeyDown={enterSaves}
          />
          <Hints
            values={publishers}
            current={draft.publisher}
            onPick={(v) => set({ publisher: v })}
          />
        </div>
        <span className="lbl">Año</span>
        <NumberInput
          value={draft.year}
          max={YEAR_MAX}
          label="Año de la edición"
          placeholder="Año"
          onChange={(n) => set({ year: n })}
        />
      </div>
      <div className="lib-q">
        <span className="k">Género</span>
        <div className="lib-genres" role="group" aria-label="Género">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              className="lib-chip"
              aria-pressed={fold(draft.genre) === fold(g)}
              style={{ '--acc': accentOf(g) } as CSSProperties}
              onClick={() => set({ genre: fold(draft.genre) === fold(g) ? '' : g })}
            >
              <span className="sw" />
              {g}
            </button>
          ))}
        </div>
      </div>
      <div className="lib-q">
        <span className="k" />
        <input
          className="lib-input grow"
          value={GENRES.some((g) => fold(g) === fold(draft.genre)) ? '' : draft.genre}
          placeholder="¿Otro género? Escríbelo aquí"
          aria-label="Otro género"
          onChange={(e) => set({ genre: e.target.value })}
          onKeyDown={enterSaves}
        />
      </div>
      {mode !== 'acquire' && (
        <div className="lib-q">
          <span className="k">¿Lo tienes?</span>
          <button
            type="button"
            className="lib-chip"
            aria-pressed={!draft.wanted}
            onClick={() => set({ wanted: false })}
          >
            Sí, ya está en el librero
          </button>
          <button
            type="button"
            className="lib-chip"
            aria-pressed={draft.wanted}
            onClick={() => set({ wanted: true })}
          >
            No, se busca
          </button>
        </div>
      )}
      {draft.wanted ? (
        <div className="lib-q">
          <span className="k">Precio que viste</span>
          <input
            className="lib-input grow"
            value={draft.price}
            placeholder="$350 MXN"
            aria-label="Precio que viste"
            onChange={(e) => set({ price: e.target.value })}
            onKeyDown={enterSaves}
          />
          <input
            className="lib-input grow"
            value={draft.seenAt}
            placeholder="Dónde (opcional)"
            aria-label="Dónde lo viste"
            onChange={(e) => set({ seenAt: e.target.value })}
            onKeyDown={enterSaves}
          />
        </div>
      ) : (
        <>
          <div className="lib-q">
            <span className="k">Formato</span>
            <Chips
              options={FORMATS}
              value={draft.format}
              label={(v) => FORMAT_LABEL[v]}
              onPick={(v) => set({ format: v })}
            />
            <span className="lbl">Páginas</span>
            <NumberInput
              value={draft.pages}
              max={PAGES_MAX}
              label="Páginas"
              placeholder="Págs."
              onChange={(n) => set({ pages: n })}
            />
          </div>
          <div className="lib-q">
            <span className="k">Cómo va</span>
            <Chips
              options={READING}
              value={draft.reading}
              label={(v) => READING_LABEL[v]}
              onPick={(v) => set({ reading: v })}
            />
          </div>
        </>
      )}
      <div className="lib-q">
        <span className="k">Idioma</span>
        <Chips
          options={LANGUAGES}
          value={(LANGUAGES as readonly string[]).includes(draft.language) ? draft.language : ''}
          label={(v) => v}
          onPick={(v) => set({ language: v })}
        />
      </div>
      <div className="lib-q">
        <span className="k">Saga</span>
        <div className="grow">
          <input
            className="lib-input"
            value={draft.series}
            placeholder="Opcional: si es parte de una saga o colección"
            aria-label="Saga"
            onChange={(e) => set({ series: e.target.value })}
            onKeyDown={enterSaves}
          />
          <Hints values={series} current={draft.series} onPick={(v) => set({ series: v })} />
        </div>
        <span className="lbl">Nº</span>
        <NumberInput
          value={draft.seriesNumber}
          max={SERIES_NUMBER_MAX}
          label="Número en la saga"
          placeholder="Nº"
          onChange={(n) => set({ seriesNumber: n })}
        />
      </div>
      {!draft.wanted && (
        <div className="lib-q">
          <span className="k">De quién es</span>
          <div className="grow">
            <input
              className="lib-input"
              value={draft.owner}
              placeholder="Opcional"
              aria-label="De quién es"
              onChange={(e) => set({ owner: e.target.value })}
              onKeyDown={enterSaves}
            />
            <Hints values={owners} current={draft.owner} onPick={(v) => set({ owner: v })} />
          </div>
          <span className="lbl">Prestado a</span>
          <input
            className="lib-input grow"
            value={draft.lentTo}
            placeholder="Nadie"
            aria-label="Prestado a"
            onChange={(e) => set({ lentTo: e.target.value })}
            onKeyDown={enterSaves}
          />
        </div>
      )}
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
        <button type="button" className="lib-btn acc" disabled={pending} onClick={() => submit()}>
          {mode === 'new' ? 'Guardar y otro (Enter)' : 'Guardar'}
        </button>
        {mode === 'new' && (
          <button
            type="button"
            className="lib-btn"
            onClick={() => librosStore.show({ kind: 'shelves' })}
          >
            Listo
          </button>
        )}
        {mode === 'new' && !saved && !state.formError && !state.savedInRow && (
          <span className="hint">
            Solo el título es obligatorio. Con el ISBN, «Buscar datos» llena lo demás.
          </span>
        )}
      </div>
    </div>
  );
}
