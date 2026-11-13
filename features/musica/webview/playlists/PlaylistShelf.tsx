import { useEffect, useState } from 'react';

import type { PlaylistDay, PlaylistSong, PlaylistStatus } from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { ListInfo } from './PlaylistBits.js';
import type { PlaylistSend } from './PlaylistBuilder.js';
import { ListEditor, ListImprover } from './PlaylistListTools.js';
import { myLists } from './playlistText.js';

type Mode = { id: string; kind: 'edit' | 'improve' | 'delete' } | null;

function ListRow({
  list,
  status,
  mode,
  setMode,
  busy,
  send,
}: {
  list: PlaylistDay;
  status: PlaylistStatus;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  send: PlaylistSend;
}) {
  const mine = mode?.id === list.id ? mode.kind : null;
  const editing = status.editing?.id === list.id ? status.editing : undefined;
  const btn = (
    label: string,
    onClick: () => void,
    variant: 'default' | 'accent' | 'ghost' = 'default',
  ) => (
    <Button size="sm" variant={busy ? 'disabled' : variant} disabled={busy} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <li className="flex flex-col gap-4 border-b-2 border-border pb-6">
      <span className="flex flex-wrap items-start justify-between gap-8">
        <span className="flex flex-col gap-1">
          <ListInfo list={list} />
          {list.madeWith && (
            <span className="text-text-muted text-xs">Hecha con {list.madeWith}</span>
          )}
          {list.missing && (
            <span className="text-status-error text-xs">Ya no está en tu Spotify</span>
          )}
        </span>
        {list.missing ? (
          <span className="flex gap-4 shrink-0">
            {btn('Quitar de aquí', () => send({ action: 'forget', id: list.id }))}
          </span>
        ) : mine === 'delete' ? (
          <span className="flex flex-wrap items-center gap-4 shrink-0">
            <span className="text-status-error text-xs">¿Segura? Se quita de tu Spotify</span>
            {btn(
              'Sí, borrar',
              () => {
                send({ action: 'delete', id: list.id });
                setMode(null);
              },
              'accent',
            )}
            <Button size="sm" onClick={() => setMode(null)}>
              No
            </Button>
          </span>
        ) : (
          <span className="flex flex-wrap gap-4 shrink-0">
            {btn('Tocar', () => send({ action: 'play', id: list.id }))}
            {!list.kept && btn('Guardar', () => send({ action: 'keep', id: list.id }), 'accent')}
            {btn('Modificar', () => {
              setMode({ id: list.id, kind: 'edit' });
              send({ action: 'openList', id: list.id });
            })}
            {btn('Mejorar', () => {
              if (status.editing) send({ action: 'closeList' });
              setMode({ id: list.id, kind: 'improve' });
            })}
            {btn('Borrar', () => setMode({ id: list.id, kind: 'delete' }), 'ghost')}
          </span>
        )}
      </span>
      {mine === 'edit' && editing && !list.missing && (
        <ListEditor
          key={`${editing.id}:${editing.name}:${editing.songs.length}`}
          editing={editing}
          found={status.found ?? []}
          busy={busy}
          send={send}
        />
      )}
      {mine === 'improve' && !list.missing && (
        <ListImprover
          id={list.id}
          proposal={status.proposal}
          busy={busy}
          send={send}
          onClose={() => {
            if (status.proposal) send({ action: 'dropImprove' });
            setMode(null);
          }}
        />
      )}
    </li>
  );
}

/**
 * "Mis listas": every list the office made in his Spotify, with what it was made with. Play, keep, modify, improve
 * (with a preview of the changes) or delete (two steps). Lists he removed in Spotify are marked.
 */
export function PlaylistShelf({
  status,
  busy,
  send,
}: {
  status: PlaylistStatus;
  busy: boolean;
  send: PlaylistSend;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const lists = myLists(status.lists);

  // Opening the section checks which lists are still in his library (the server spaces these checks).
  useEffect(() => {
    send({ action: 'checkLists' });
  }, [send]);

  // The editor closed on the server (saved elsewhere, list gone): drop the local mode too.
  useEffect(() => {
    if (mode?.kind === 'edit' && !busy && status.editing === undefined && mode.id) {
      const list = status.lists.find((l) => l.id === mode.id);
      if (!list || list.missing) setMode(null);
    }
  }, [mode, busy, status.editing, status.lists]);

  if (lists.length === 0) {
    return (
      <p className="text-text-muted">
        Todavía no hay listas. Pide una en «Armar» y aquí aparece cuando la crees.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-6">
      {lists.map((l) => (
        <ListRow
          key={l.id}
          list={l}
          status={status}
          mode={mode}
          setMode={(m) => {
            if (mode?.kind === 'edit' && m?.id !== mode.id && status.editing)
              send({ action: 'closeList' });
            setMode(m);
          }}
          busy={busy}
          send={send}
        />
      ))}
    </ul>
  );
}

/** "Esta no": the bin of songs the owner doesn't want back. */
export function PlaylistBin({
  rejected,
  busy,
  send,
}: {
  rejected: PlaylistSong[];
  busy: boolean;
  send: PlaylistSend;
}) {
  if (rejected.length === 0) return <p className="text-text-muted">El bote está vacío.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {rejected.map((s) => (
        <li key={s.uri} className="flex items-center justify-between gap-8">
          <span>
            {s.title} <span className="text-text-muted">— {s.artist}</span>
          </span>
          <Button
            size="sm"
            variant={busy ? 'disabled' : 'default'}
            disabled={busy}
            onClick={() => send({ action: 'unreject', uri: s.uri })}
          >
            Sacar del bote
          </Button>
        </li>
      ))}
    </ul>
  );
}
