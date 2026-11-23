import { type DragEvent, useRef, useState } from 'react';

import type { LibrosCoverState } from '../../../core/src/messages.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { ConfirmButton, type Send } from '../../coleccion/webview/ColeccionBits.js';
import { uploadProblem } from '../../coleccion/webview/coverText.js';
import { COVER_UPLOAD_MAX_BYTES, COVER_UPLOAD_TYPES } from '../../libros/webview/constants.js';
import { searchLine, uploadErrorText, uploadHeaders } from '../../libros/webview/coverUrls.js';
import { spineVars } from '../../libros/webview/spine.js';
import { missingNumbers, ownedNumbers, seriesSpan, toggleVolume } from '../core/series.js';
import type { Series } from '../core/types.js';
import { type ComicsState, comicsStore } from './comicsStore.js';
import {
  COMIC_CANDIDATE_PATH,
  COMIC_COVER_PATH,
  COMIC_COVER_SOURCE_TEXT,
  COMIC_FORMAT_LABEL,
  KIND_LABEL,
} from './constants.js';
import { countText, peopleText, volumeLook } from './look.js';

const withToken = (path: string, v: string, token: string | null) => {
  const q = new URLSearchParams();
  if (token) q.set('token', token);
  q.set('v', v);
  return `${path}?${q}`;
};
const comicCoverUrl = (id: string, at: string, token: string | null) =>
  withToken(`${COMIC_COVER_PATH}${encodeURIComponent(id)}`, at, token);
const candidateUrl = (id: string, n: number, stamp: string, token: string | null) =>
  withToken(`${COMIC_CANDIDATE_PATH}${encodeURIComponent(id)}/${n}`, stamp, token);

/** A cover drawn by code: the series' color, its title and an ink burst. */
function DrawnCover({ s }: { s: Series }) {
  const look = volumeLook(s);
  return (
    <div className="lib-drawn" style={spineVars(look)} aria-hidden="true">
      <span className="ti">{s.title}</span>
      <span className="orn" />
      {s.writers[0] && <span className="au">{s.writers[0]}</span>}
    </div>
  );
}

/** The series' cover: what it has, «elige una», and look for / upload / take away. */
function CoverPart({
  s,
  search,
  state,
  send,
}: {
  s: Series;
  search?: LibrosCoverState;
  state: ComicsState;
  send: Send;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const token = officeToken();
  const busy = !!state.op;
  const choice = search?.state === 'elige' && search.candidates?.length ? search : undefined;
  const line = searchLine(search, s.coverArt?.key);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = uploadProblem(file, COVER_UPLOAD_TYPES, COVER_UPLOAD_MAX_BYTES);
    if (problem) {
      comicsStore.setOpError(problem);
      return;
    }
    const requestId = comicsStore.startOp('upload', s.id);
    try {
      const res = await fetch(`${COMIC_COVER_PATH}${encodeURIComponent(s.id)}`, {
        method: 'POST',
        headers: uploadHeaders(file.type, token),
        body: file,
      });
      comicsStore.endUpload(requestId, res.ok ? undefined : uploadErrorText(res.status));
    } catch {
      comicsStore.endUpload(requestId, 'No se pudo subir: sin conexión con la oficina.');
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
      {choice ? (
        <>
          <div className="lib-choose">
            {(choice.candidates ?? []).map((c, n) => (
              <button
                key={`${choice.stamp}-${n}`}
                type="button"
                className={c.current ? 'cur' : ''}
                disabled={busy}
                title={c.label}
                onClick={() => {
                  const requestId = comicsStore.startOp('pick', s.id);
                  send({ type: 'comicsCoverPick', requestId, id: s.id, n, stamp: choice.stamp });
                }}
              >
                <img src={candidateUrl(s.id, n, choice.stamp, token)} alt="" loading="lazy" />
                <span className="nm">{c.label}</span>
                <small>
                  {c.byIsbn ? 'Del ISBN de un tomo' : c.year ? `Desde ${c.year}` : 'Año sin anotar'}
                  {c.current ? ' · la actual' : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="acts">
            <button
              type="button"
              className="lib-pa"
              disabled={busy}
              onClick={() => {
                const requestId = comicsStore.startOp('dismiss', s.id);
                send({ type: 'comicsCoverDismiss', requestId, id: s.id, stamp: choice.stamp });
              }}
            >
              {s.coverArt ? 'Dejar la que tiene' : 'Ninguna'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="cov">
            {s.coverArt ? (
              <img src={comicCoverUrl(s.id, s.coverArt.at, token)} alt={`Portada de ${s.title}`} />
            ) : (
              <DrawnCover s={s} />
            )}
          </div>
          <div>
            {s.coverArt && (
              <div className="small">{COMIC_COVER_SOURCE_TEXT[s.coverArt.source]}</div>
            )}
            {line && <div className={line.bad ? 'lib-err' : 'small'}>{line.text}</div>}
          </div>
          <div className="acts">
            <button
              type="button"
              className="lib-pa"
              disabled={busy || search?.state === 'buscando'}
              onClick={() => send({ type: 'comicsCoverFind', id: s.id })}
            >
              {s.coverArt ? 'Cambiar' : search ? 'Buscar otra vez' : 'Buscar portada'}
            </button>
            <button
              type="button"
              className="lib-pa"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Subir
            </button>
            {s.coverArt && (
              <button
                type="button"
                className="lib-pa danger"
                disabled={busy}
                onClick={() => {
                  const requestId = comicsStore.startOp('remove', s.id);
                  send({ type: 'comicsCoverRemove', requestId, id: s.id });
                }}
              >
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

/**
 * A series opened: its cover, its card, and every volume number to tick (on the shelf or missing) or to mark how
 * far the reading goes. A change saves at once.
 */
export function SeriesCard({
  s,
  volume,
  state,
  search,
  send,
  onSave,
  onDelete,
}: {
  s: Series;
  volume?: number;
  state: ComicsState;
  search?: LibrosCoverState;
  send: Send;
  onSave: (s: Series) => void;
  onDelete: (id: string) => void;
}) {
  const [mode, setMode] = useState<'tengo' | 'lei'>('tengo');
  const look = volumeLook(s);
  const owned = new Set(ownedNumbers(s));
  const span = Math.max(seriesSpan(s), ...owned, 1);
  const numbers = Array.from({ length: span }, (_, i) => i + 1);
  const missing = missingNumbers(s);
  const busy = !!state.pending;
  const publisher = [s.publisher, s.localPublisher && `aquí: ${s.localPublisher}`]
    .filter(Boolean)
    .join(' · ');
  const tap = (n: number) =>
    onSave(
      mode === 'tengo'
        ? { ...s, volumes: toggleVolume(s.volumes, n) }
        : { ...s, readUpTo: s.readUpTo === n ? 0 : n },
    );
  return (
    <>
      <div className="lib-veil" onClick={() => comicsStore.show({ kind: 'shelves' })} />
      <div className="com-card" style={spineVars(look)} role="dialog" aria-label={s.title}>
        <CoverPart s={s} search={search} state={state} send={send} />
        <div>
          {s.kind && <span className="tag">{KIND_LABEL[s.kind]}</span>}
          {s.genre && <span className="tag">{s.genre}</span>}
          <h2>{s.title}</h2>
          <div className="by">{peopleText(s)}</div>
          <div className="facts">
            <div>
              <span>Tiene</span>
              {countText(s)}
            </div>
            <div>
              <span>La serie</span>
              {s.totalVolumes ? `${s.totalVolumes} tomos` : 'Sin anotar'}
              {s.finished ? ' · terminada' : s.totalVolumes ? ' · sigue saliendo' : ''}
            </div>
            <div>
              <span>Editorial</span>
              {publisher || 'Sin anotar'}
            </div>
            <div>
              <span>Formato · año</span>
              {[COMIC_FORMAT_LABEL[s.format], s.year || '', s.language]
                .filter(Boolean)
                .join(' · ') || 'Sin anotar'}
            </div>
            <div>
              <span>Voy en</span>
              {s.readUpTo ? `el ${s.readUpTo}` : 'Sin empezar'}
            </div>
            {missing.length > 0 && (
              <div>
                <span>Se busca</span>
                {missing.length <= 12
                  ? missing.join(', ')
                  : `${missing.slice(0, 10).join(', ')}… (${missing.length})`}
              </div>
            )}
          </div>
          <h4>
            Tomos
            <button
              type="button"
              className={mode === 'tengo' ? 'lib-pa on' : 'lib-pa'}
              onClick={() => setMode('tengo')}
            >
              Lo tengo
            </button>
            <button
              type="button"
              className={mode === 'lei' ? 'lib-pa on' : 'lib-pa'}
              onClick={() => setMode('lei')}
            >
              Leí hasta
            </button>
          </h4>
          <div className="com-grid" role="group" aria-label="Tomos">
            {numbers.map((n) => (
              <button
                key={n}
                type="button"
                className={`${owned.has(n) ? 'own' : ''} ${s.readUpTo >= n ? 'read' : ''} ${
                  volume === n ? 'me' : ''
                }`}
                disabled={busy}
                aria-pressed={owned.has(n)}
                title={
                  mode === 'tengo'
                    ? `${n}: ${owned.has(n) ? 'lo tienes (clic: quitar)' : 'falta (clic: ya lo tengo)'}`
                    : `Leí hasta el ${n}`
                }
                onClick={() => tap(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              title="Uno más (salió otro tomo)"
              onClick={() => onSave({ ...s, totalVolumes: span + 1 })}
            >
              +
            </button>
          </div>
          {s.notes && (
            <>
              <h4>Notas</h4>
              <div>
                <div className="notes">{s.notes}</div>
              </div>
            </>
          )}
          <div className="acts">
            <button type="button" className="lib-btn acc" onClick={() => comicsStore.edit(s)}>
              Editar
            </button>
            <ConfirmButton
              className="lib-btn"
              label="Borrar"
              confirmLabel="¿Seguro? Borrar la serie"
              onConfirm={() => onDelete(s.id)}
            />
            <button
              type="button"
              className="lib-btn ghost"
              onClick={() => comicsStore.show({ kind: 'shelves' })}
            >
              Cerrar (Esc)
            </button>
          </div>
          {state.formError && <div className="lib-err">{state.formError}</div>}
        </div>
      </div>
    </>
  );
}
