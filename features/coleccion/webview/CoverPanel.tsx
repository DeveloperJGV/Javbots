import { type DragEvent, useLayoutEffect, useRef, useState } from 'react';

import type { ColeccionCoverState } from '../../../core/src/messages.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { shownCondition } from '../core/cover.js';
import type { Game } from '../core/types.js';
import { drawDisc, drawLooseCart } from './art.js';
import { ConfirmButton, type Send } from './ColeccionBits.js';
import { type ColeccionState, coleccionStore } from './coleccionStore.js';
import {
  COVER_UPLOAD_MAX_BYTES,
  COVER_UPLOAD_TYPES,
  type PlatformLook,
  REGION_LABEL,
} from './constants.js';
import {
  candidateUrl,
  coverStyle,
  coverUrl,
  uploadHeaders,
  uploadUrl,
  usePixelCover,
} from './coverPixels.js';
import {
  conditionNote,
  coverCaption,
  NONE_TEXT,
  searchLine,
  searchYourselfUrl,
  uploadErrorText,
  uploadProblem,
} from './coverText.js';
import { CART_ART, LABEL_ANCHOR_Y, labelStyle, looseMedia } from './pieces.js';

/** The game's own disc or cartridge (the shape of its console), drawn at `px` screen pixels of height at most. */
export function CaseMedia({ game, look, px }: { game: Game; look: PlatformLook; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const media = looseMedia(game.platform);
  const style = coverStyle();
  const label =
    media === 'disc'
      ? null
      : {
          w: CART_ART[media].label.w,
          h: CART_ART[media].label.h,
          style: labelStyle(style),
          anchorY: LABEL_ANCHOR_Y,
        };
  const art = usePixelCover(game.id, game.coverArt, label);
  useLayoutEffect(() => {
    if (media === 'disc') drawDisc(ref.current, game, game.platform === 'gc');
    else drawLooseCart(ref.current, game, look, media, art);
    // Redrawn only when what it shows changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.title, game.platform, media, look, art]);
  if (media === 'disc') {
    const size = game.platform === 'gc' ? Math.round(px * 0.7) : px;
    return (
      <canvas
        ref={ref}
        className="col-disc"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }
  const a = CART_ART[media];
  const k = Math.max(1, Math.floor(px / Math.max(a.w, a.h)));
  return (
    <canvas
      ref={ref}
      className="col-cartridge"
      style={{ width: a.w * k, height: a.h * k }}
      aria-hidden="true"
    />
  );
}

/** «Con caja / Suelto» in one click (and says when it is only the console's default). */
export function ConditionSwitch({
  game,
  state,
  send,
}: {
  game: Game;
  state?: ColeccionState;
  send?: Send;
}) {
  const shown = shownCondition(game);
  const busy = !!state?.op;
  const set = (target: 'completo' | 'suelto') => {
    if (!send) return;
    const same = target === 'suelto' ? shown === 'suelto' : shown !== 'suelto';
    // Already so, and said so: nothing to do (a sealed one stays sealed)
    if (same && game.condition) return;
    const requestId = coleccionStore.startOp('condition', game.id);
    send({ type: 'coleccionSetCondition', requestId, ids: [game.id], condition: target });
  };
  return (
    <div className="col-cond">
      <span>{conditionNote(game)}</span>
      <span className="seg" role="group" aria-label="Con caja o suelto">
        <button
          type="button"
          aria-pressed={shown !== 'suelto'}
          disabled={busy || !send}
          onClick={() => set('completo')}
        >
          Con caja
        </button>
        <button
          type="button"
          aria-pressed={shown === 'suelto'}
          disabled={busy || !send}
          onClick={() => set('suelto')}
        >
          Suelto
        </button>
      </span>
    </div>
  );
}

/**
 * The right half of the opened case: the cover big and sharp (with where it came from), or the choice of up to four,
 * or the game's disc or cartridge; and what can be done: search, change, remove, upload one, or search by hand.
 */
export function CoverPanel({
  game,
  look,
  search,
  state,
  send,
}: {
  game: Game;
  look: PlatformLook;
  search?: ColeccionCoverState;
  state?: ColeccionState;
  send?: Send;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const token = officeToken();
  const busy = !!state?.op;
  const uploading = state?.op?.kind === 'upload' && state.op.id === game.id;
  const searching = search?.state === 'buscando';
  const choice =
    search?.state === 'elige' &&
    search.candidates?.length &&
    state?.dismissedChoice?.[game.id] !== search.stamp
      ? search
      : undefined;
  // The choice speaks for itself (and once closed with «Ninguna», says nothing)
  const line = search?.state === 'elige' ? '' : searchLine(search, game);
  const cover = game.coverArt;

  const find = () => send?.({ type: 'coleccionCoverFind', id: game.id });
  // «Ninguna» (or, with a cover, «keep this one»): hidden at once, and the office keeps it
  const dismiss = () => {
    if (!choice) return;
    coleccionStore.dismissChoice(game.id, choice.stamp);
    if (!send) return;
    const requestId = coleccionStore.startOp('dismiss', game.id);
    send({ type: 'coleccionCoverDismiss', requestId, id: game.id, stamp: choice.stamp });
  };
  const pick = (n: number) => {
    if (!send || !choice) return;
    const requestId = coleccionStore.startOp('pick', game.id);
    send({ type: 'coleccionCoverPick', requestId, id: game.id, n, stamp: choice.stamp });
  };
  const remove = () => {
    if (!send) return;
    const requestId = coleccionStore.startOp('remove', game.id);
    send({ type: 'coleccionCoverRemove', requestId, id: game.id });
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = uploadProblem(file, COVER_UPLOAD_TYPES, COVER_UPLOAD_MAX_BYTES);
    if (problem) {
      coleccionStore.setOpError(problem);
      return;
    }
    const requestId = coleccionStore.startOp('upload', game.id);
    try {
      const res = await fetch(uploadUrl(game.id), {
        method: 'POST',
        headers: uploadHeaders(file.type, token),
        body: file,
      });
      coleccionStore.endUpload(requestId, res.ok ? undefined : uploadErrorText(res.status));
    } catch {
      coleccionStore.endUpload(requestId, 'No se pudo subir: sin conexión con la oficina.');
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) void upload(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={over ? 'col-cover over' : 'col-cover'}
      onDragOver={(e) => {
        if (!send) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={send ? onDrop : undefined}
    >
      {choice ? (
        <div className="col-choose">
          <div className="hd">{cover ? 'Cambiar por:' : 'Elige una:'}</div>
          <div className="grid">
            {cover && !(choice.candidates ?? []).some((c) => c.current) && (
              // The cover it has now (uploaded, or no longer listed by a source): always there to keep
              <button
                type="button"
                className="cur"
                disabled={busy}
                title="La que tiene ahora"
                onClick={dismiss}
              >
                <img src={coverUrl(game.id, cover.at, token)} alt="" loading="lazy" />
                <span className="nm">{coverCaption(cover)}</span>
                <small>La que tiene ahora</small>
              </button>
            )}
            {(choice.candidates ?? []).map((c, n) => (
              <button
                key={`${choice.stamp}:${n}`}
                type="button"
                className={c.current ? 'cur' : undefined}
                disabled={busy}
                title={c.label}
                onClick={() => (c.current ? dismiss() : pick(n))}
              >
                <img src={candidateUrl(game.id, n, choice.stamp, token)} alt="" loading="lazy" />
                <span className="nm">{c.label}</span>
                <small>
                  {c.current
                    ? 'La que tiene ahora'
                    : `${c.region ? (REGION_LABEL[c.region] ?? c.region) : 'Sin región'}${
                        c.source === 'igdb' ? ' · IGDB' : ''
                      }`}
                </small>
              </button>
            ))}
          </div>
          <button type="button" className="col-mini" disabled={busy} onClick={dismiss}>
            {cover ? 'Dejar la que tiene' : 'Ninguna'}
          </button>
        </div>
      ) : cover ? (
        <figure className="col-cover-full">
          <img
            src={coverUrl(game.id, cover.at, token)}
            alt={`Portada de ${game.title}`}
            draggable={false}
          />
          <figcaption>{coverCaption(cover)}</figcaption>
          <span className="media">
            <CaseMedia game={game} look={look} px={84} />
          </span>
        </figure>
      ) : (
        <div className="col-cover-media">
          <CaseMedia game={game} look={look} px={230} />
        </div>
      )}
      {line && (
        <div className={search?.state === 'nada' ? 'col-cover-line bad' : 'col-cover-line'}>
          {line}
        </div>
      )}
      {!choice && !cover && game.coverNone && !searching && (
        <div className="col-cover-line">{NONE_TEXT}</div>
      )}
      {state?.opError && state.op === undefined && (
        <div className="col-cover-line bad">▲ {state.opError}</div>
      )}
      {send && (
        <div className="col-cover-acts">
          <button type="button" className="col-mini" disabled={busy || searching} onClick={find}>
            {searching
              ? 'Buscando…'
              : cover
                ? 'Cambiar'
                : game.coverNone
                  ? 'Buscar otra vez'
                  : 'Buscar portada'}
          </button>
          <button
            type="button"
            className="col-mini"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Subiendo…' : 'Subir imagen'}
          </button>
          {cover && (
            <ConfirmButton
              className="col-mini"
              label="Quitar"
              confirmLabel="¿Seguro? Quitar"
              onConfirm={remove}
            />
          )}
          <a
            className="col-mini link"
            href={searchYourselfUrl(game)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Búscala tú ↗
          </a>
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
      )}
      {send && !choice && (
        <div className="col-cover-hint">o arrastra aquí una imagen (PNG, JPG o WEBP, 4 MB)</div>
      )}
    </div>
  );
}
