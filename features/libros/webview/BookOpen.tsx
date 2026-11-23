import { type CSSProperties, type DragEvent, useRef, useState } from 'react';

import type { LibrosCoverState } from '../../../core/src/messages.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { ConfirmButton, type Send } from '../../coleccion/webview/ColeccionBits.js';
import { uploadProblem } from '../../coleccion/webview/coverText.js';
import { isbnText } from '../core/isbn.js';
import { seriesMembers } from '../core/shelves.js';
import { type Book, READING, type Reading } from '../core/types.js';
import {
  COVER_SOURCE_TEXT,
  COVER_UPLOAD_MAX_BYTES,
  COVER_UPLOAD_TYPES,
  READING_LABEL,
} from './constants.js';
import {
  candidateUrl,
  coverUrl,
  searchLine,
  uploadErrorText,
  uploadHeaders,
  uploadUrl,
} from './coverUrls.js';
import { type LibrosState, librosStore } from './librosStore.js';
import {
  addedText,
  byLine,
  editionLine,
  formatText,
  lentText,
  readingText,
  sagaText,
} from './librosText.js';
import { spineOf, spineVars } from './spine.js';

/** A cover drawn by code, for a book without an image: its cloth, title, author and an ornament. */
export function DrawnCover({ book }: { book: Book }) {
  const look = spineOf(book);
  return (
    <div className={`lib-drawn ${look.kind}`} style={spineVars(look)} aria-hidden="true">
      <span className="ti">{book.title}</span>
      <span className="orn" />
      {book.authors[0] && <span className="au">{book.authors[0]}</span>}
    </div>
  );
}

/** The book's cover: what it has, «elige una», and the buttons to look for, upload or take it away. */
function CoverPart({
  book,
  search,
  state,
  send,
}: {
  book: Book;
  search?: LibrosCoverState;
  state: LibrosState;
  send: Send;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const token = officeToken();
  const busy = !!state.op;
  const choice = search?.state === 'elige' && search.candidates?.length ? search : undefined;
  const line = searchLine(search);
  const cover = book.coverArt;

  const find = () => send({ type: 'librosCoverFind', id: book.id });
  const dismiss = () => {
    if (!choice) return;
    const requestId = librosStore.startOp('dismiss', book.id);
    send({ type: 'librosCoverDismiss', requestId, id: book.id, stamp: choice.stamp });
  };
  const pick = (n: number) => {
    if (!choice) return;
    const requestId = librosStore.startOp('pick', book.id);
    send({ type: 'librosCoverPick', requestId, id: book.id, n, stamp: choice.stamp });
  };
  const remove = () => {
    const requestId = librosStore.startOp('remove', book.id);
    send({ type: 'librosCoverRemove', requestId, id: book.id });
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = uploadProblem(file, COVER_UPLOAD_TYPES, COVER_UPLOAD_MAX_BYTES);
    if (problem) {
      librosStore.setOpError(problem);
      return;
    }
    const requestId = librosStore.startOp('upload', book.id);
    try {
      const res = await fetch(uploadUrl(book.id), {
        method: 'POST',
        headers: uploadHeaders(file.type, token),
        body: file,
      });
      librosStore.endUpload(requestId, res.ok ? undefined : uploadErrorText(res.status));
    } catch {
      librosStore.endUpload(requestId, 'No se pudo subir: sin conexión con la oficina.');
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) void upload(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={over ? 'lib-drop over' : 'lib-drop'}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <h4>Portada</h4>
      {choice ? (
        <>
          <div className="small">
            {cover ? 'Cambiar por una de estas:' : '¿Es alguna de estas? Elige una:'}
          </div>
          <div className="lib-choose">
            {(choice.candidates ?? []).map((c, n) => (
              <button
                key={`${choice.stamp}-${n}`}
                type="button"
                className={c.current ? 'cur' : ''}
                disabled={busy}
                title={c.label}
                onClick={() => pick(n)}
              >
                <img src={candidateUrl(book.id, n, choice.stamp, token)} alt="" loading="lazy" />
                <span className="nm">{c.label}</span>
                <small>
                  {c.byIsbn ? 'De su ISBN' : c.year ? `1ª ed. ${c.year}` : 'Año sin anotar'}
                  {c.current ? ' · la actual' : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="acts">
            <button type="button" className="lib-pa" disabled={busy} onClick={dismiss}>
              {cover ? 'Dejar la que tiene' : 'Ninguna'}
            </button>
          </div>
        </>
      ) : (
        <>
          {cover && (
            <div className="lib-cover-row">
              <img src={coverUrl(book.id, cover.at, token)} alt={`Portada de ${book.title}`} />
              <div className="small">
                {COVER_SOURCE_TEXT[cover.source]}
                <br />
                {cover.at.slice(0, 10)}
              </div>
            </div>
          )}
          {line && <div className={line.bad ? 'lib-err' : 'small'}>{line.text}</div>}
          {!cover && !line && (
            <div className="small">
              {book.isbn
                ? 'Se busca por su ISBN y, si no, por título y autor.'
                : 'Sin ISBN se busca por título y autor, y tú eliges.'}{' '}
              O arrastra aquí una imagen.
            </div>
          )}
          <div className="acts">
            <button
              type="button"
              className="lib-pa"
              disabled={busy || search?.state === 'buscando'}
              onClick={find}
            >
              {cover ? 'Cambiar' : search ? 'Buscar otra vez' : 'Buscar portada'}
            </button>
            <button
              type="button"
              className="lib-pa"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Subir imagen
            </button>
            {cover && (
              <button type="button" className="lib-pa danger" disabled={busy} onClick={remove}>
                Quitar
              </button>
            )}
          </div>
        </>
      )}
      {state.opError && <div className="lib-err">{state.opError}</div>}
      <input
        ref={fileRef}
        type="file"
        accept={COVER_UPLOAD_TYPES.join(',')}
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** The saga as little spines by number: the ones there are, and dashed gaps for the numbers missing. */
function SagaStrip({ book, books }: { book: Book; books: readonly Book[] }) {
  const members = seriesMembers(books, book.series);
  if (members.length < 2 && !book.seriesNumber) return null;
  const top = Math.max(0, ...members.map((m) => m.seriesNumber));
  const byNumber = new Map(members.filter((m) => m.seriesNumber).map((m) => [m.seriesNumber, m]));
  const unnumbered = members.filter((m) => !m.seriesNumber);
  return (
    <>
      <h4>{book.series}</h4>
      <div className="saga">
        {Array.from({ length: top }, (_, i) => {
          const m = byNumber.get(i + 1);
          if (!m)
            return (
              <button
                key={`gap${i}`}
                type="button"
                className="gap"
                disabled
                title={`Falta el ${i + 1}`}
              >
                {i + 1}
              </button>
            );
          return (
            <button
              key={m.id}
              type="button"
              className={`${m.wanted ? 'gap' : ''} ${m.id === book.id ? 'me' : ''}`}
              style={{ '--sc': spineOf(m).cloth } as CSSProperties}
              title={`${m.seriesNumber}. ${m.title}${m.wanted ? ' (se busca)' : ''}`}
              onClick={() => librosStore.openItem(m.id)}
            >
              {i + 1}
            </button>
          );
        })}
        {unnumbered.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`${m.wanted ? 'gap' : ''} ${m.id === book.id ? 'me' : ''}`}
            style={{ '--sc': spineOf(m).cloth } as CSSProperties}
            title={`${m.title} (sin número)`}
            onClick={() => librosStore.openItem(m.id)}
          >
            ·
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The book out of its shelf, open: the inside of the cover with whose it is, who has it, its cover and notes; the
 * first page with its card. Underneath: previous / next on the shelf, Edit, Delete (two steps).
 */
export function BookOpen({
  book,
  books,
  siblings,
  today,
  state,
  search,
  send,
  onSave,
  onDelete,
}: {
  book: Book;
  books: readonly Book[];
  /** The books of its shelf, in order (for previous / next). */
  siblings: string[];
  today: string;
  state: LibrosState;
  search?: LibrosCoverState;
  send: Send;
  onSave: (book: Book) => void;
  onDelete: (id: string) => void;
}) {
  const look = spineOf(book);
  const token = officeToken();
  const at = siblings.indexOf(book.id);
  const go = (d: number) => {
    const id = siblings[at + d];
    if (id) librosStore.openItem(id);
  };
  const lent = lentText(book, today);
  const setReading = (reading: Reading) =>
    onSave({ ...book, reading: book.reading === reading ? '' : reading });
  const saga = sagaText(book);
  const busy = !!state.pending;

  return (
    <>
      <div className="lib-veil" onClick={() => librosStore.show({ kind: 'shelves' })} />
      <div className="lib-table">
        <div className="lib-open" style={spineVars(look)} role="dialog" aria-label={book.title}>
          <div className="page right">
            {book.genre && <span className="tag">{book.genre}</span>}
            <h2>{book.title}</h2>
            <div className="by">{byLine(book)}</div>
            <div className="facts">
              <div className="wide">
                <span>Edición</span>
                {editionLine(book) || 'Sin anotar'}
              </div>
              <div>
                <span>Formato</span>
                {formatText(book)}
              </div>
              <div>
                <span>Cómo va</span>
                {readingText(book)}
                {book.reading === 'leido' && book.finishedAt ? ` (${book.finishedAt})` : ''}
              </div>
              {saga && (
                <div>
                  <span>Saga</span>
                  {saga}
                </div>
              )}
              {book.isbn && (
                <div>
                  <span>ISBN</span>
                  {isbnText(book.isbn)}
                </div>
              )}
            </div>
            <h4>¿Cómo va?</h4>
            <div className="acts">
              {READING.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={book.reading === r ? 'lib-pa on' : 'lib-pa'}
                  aria-pressed={book.reading === r}
                  disabled={busy}
                  onClick={() => setReading(r)}
                >
                  {READING_LABEL[r]}
                </button>
              ))}
            </div>
            {book.series && <SagaStrip book={book} books={books} />}
            <div className="small">{addedText(book, today)}</div>
          </div>
          <div className="cover">
            <div className="face front">
              {book.coverArt ? (
                <img src={coverUrl(book.id, book.coverArt.at, token)} alt="" />
              ) : (
                <DrawnCover book={book} />
              )}
            </div>
            <div className="face inside">
              <div className="exlibris">
                <div className="k">Ex libris</div>
                <div className="who">{book.owner || 'De la casa'}</div>
              </div>
              {lent && (
                <div className="lentbox">
                  {lent.text}
                  {lent.long ? ' Ya va siendo hora de pedirlo.' : ''}
                  <div className="acts">
                    <button
                      type="button"
                      className="lib-pa"
                      disabled={busy}
                      onClick={() => onSave({ ...book, lentTo: '', lentAt: '' })}
                    >
                      Ya lo devolvió
                    </button>
                  </div>
                </div>
              )}
              <CoverPart book={book} search={search} state={state} send={send} />
              {book.notes && (
                <>
                  <h4>Notas</h4>
                  <div className="notes">{book.notes}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="lib-controls">
        <button type="button" className="lib-btn" disabled={at <= 0} onClick={() => go(-1)}>
          ◀ Anterior
        </button>
        <button type="button" className="lib-btn acc" onClick={() => librosStore.edit(book)}>
          Editar
        </button>
        {!book.lentTo && (
          <button
            type="button"
            className="lib-btn"
            onClick={() => librosStore.edit(book)}
            title="Anota a quién se lo prestaste"
          >
            Prestar
          </button>
        )}
        <ConfirmButton
          className="lib-btn"
          label="Borrar"
          confirmLabel="¿Seguro? Borrar"
          onConfirm={() => onDelete(book.id)}
        />
        <button
          type="button"
          className="lib-btn"
          disabled={at < 0 || at >= siblings.length - 1}
          onClick={() => go(1)}
        >
          Siguiente ▶
        </button>
        <button
          type="button"
          className="lib-btn ghost"
          onClick={() => librosStore.show({ kind: 'shelves' })}
        >
          Cerrar (Esc)
        </button>
      </div>
      {state.formError && <div className="lib-problems">▲ {state.formError}</div>}
    </>
  );
}

/** A «se busca» gap opened: its poster with the price seen, and «¡Ya lo tengo!». */
export function WantedPoster({ book, onDelete }: { book: Book; onDelete: (id: string) => void }) {
  return (
    <>
      <div className="lib-veil" onClick={() => librosStore.show({ kind: 'shelves' })} />
      <div className="lib-poster" role="dialog" aria-label={`Se busca: ${book.title}`}>
        <h4>SE BUSCA</h4>
        <div className="name">{book.title}</div>
        <div className="by">{byLine(book)}</div>
        <div className="p">
          <span>Precio que viste</span>
          <span>{book.price || 'Sin anotar'}</span>
        </div>
        <div className="p">
          <span>Dónde</span>
          <span>{book.seenAt || 'Sin anotar'}</span>
        </div>
        {book.series && (
          <div className="p">
            <span>Saga</span>
            <span>{sagaText(book)}</span>
          </div>
        )}
        {book.publisher && (
          <div className="p">
            <span>Editorial</span>
            <span>{book.publisher}</span>
          </div>
        )}
        <div className="acts">
          <button type="button" className="yes" onClick={() => librosStore.edit(book, 'acquire')}>
            ¡Ya lo tengo!
          </button>
          <button type="button" onClick={() => librosStore.edit(book)}>
            Editar
          </button>
          <ConfirmButton
            className=""
            label="Borrar"
            confirmLabel="¿Seguro?"
            onConfirm={() => onDelete(book.id)}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => librosStore.show({ kind: 'shelves' })}
          >
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
