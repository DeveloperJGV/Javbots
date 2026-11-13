import { type ReactNode, useState } from 'react';

import type {
  PlaylistEditing,
  PlaylistProposal,
  PlaylistSong,
} from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { PLAYLIST_DESCRIBE_MAX, PLAYLIST_IMPROVE_BUTTONS } from './constants.js';
import { inputClass } from './PlaylistBits.js';
import type { PlaylistSend } from './PlaylistBuilder.js';
import { draftSongs, roundedDuration, songDuration, songsMs } from './playlistText.js';

const listBox =
  'flex flex-col gap-2 max-h-[30vh] overflow-y-auto border-2 border-border bg-bg-dark p-6';

function SongLine({ song, children }: { song: PlaylistSong; children?: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-8">
      <span>
        {song.title} <span className="text-text-muted">— {song.artist}</span>
        <span className="text-text-muted"> · {songDuration(song.durationMs)}</span>
        {song.discover && <span className="text-accent-bright text-xs"> · nueva</span>}
      </span>
      {children}
    </li>
  );
}

/** "Modificar": rename, take songs out, add songs found by search; "Guardar" sends it all to Spotify. */
export function ListEditor({
  editing,
  found,
  busy,
  send,
}: {
  editing: PlaylistEditing;
  found: PlaylistSong[];
  busy: boolean;
  send: PlaylistSend;
}) {
  const [name, setName] = useState(editing.name);
  const [uris, setUris] = useState(() => editing.songs.map((s) => s.uri));
  const [added, setAdded] = useState<PlaylistSong[]>([]);
  const [query, setQuery] = useState('');
  const songs = draftSongs(uris, [...editing.songs, ...added]);
  const changed =
    name.trim() !== editing.name ||
    uris.length !== editing.songs.length ||
    uris.some((u, i) => u !== editing.songs[i]?.uri);
  const search = () => {
    if (!query.trim() || busy) return;
    send({ action: 'searchSongs', text: query.trim() });
  };

  return (
    <div className="flex flex-col gap-6 border-2 border-border p-8">
      <label className="flex flex-col gap-2">
        <span className="text-text-muted text-xs">Nombre</span>
        <input
          type="text"
          value={name}
          maxLength={100}
          aria-label="Nombre de la lista"
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </label>
      <span className="text-text-muted text-xs">
        {songs.length} canciones · {roundedDuration(songsMs(songs))}
      </span>
      <ul className={listBox}>
        {songs.map((s) => (
          <SongLine key={s.uri} song={s}>
            <Button
              size="sm"
              variant={busy ? 'disabled' : 'ghost'}
              disabled={busy}
              aria-label={`Quitar ${s.title}`}
              onClick={() => setUris((list) => list.filter((u) => u !== s.uri))}
            >
              Quitar
            </Button>
          </SongLine>
        ))}
      </ul>
      <span className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={query}
          maxLength={PLAYLIST_DESCRIBE_MAX}
          aria-label="Buscar una canción"
          placeholder="Busca una canción o artista"
          disabled={busy}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
          }}
          className={`flex-1 min-w-[160px] ${inputClass}`}
        />
        <Button
          size="sm"
          variant={query.trim() && !busy ? 'default' : 'disabled'}
          disabled={!query.trim() || busy}
          onClick={search}
        >
          Buscar
        </Button>
      </span>
      {found.length > 0 && (
        <ul className={listBox} aria-label="Resultados">
          {found.map((s) => {
            const inList = uris.includes(s.uri);
            return (
              <SongLine key={s.uri} song={s}>
                <Button
                  size="sm"
                  variant={busy || inList ? 'disabled' : 'default'}
                  disabled={busy || inList}
                  aria-label={`Agregar ${s.title}`}
                  onClick={() => {
                    setAdded((list) => (list.some((x) => x.uri === s.uri) ? list : [...list, s]));
                    setUris((list) => [...list, s.uri]);
                  }}
                >
                  {inList ? 'Ya está' : 'Agregar'}
                </Button>
              </SongLine>
            );
          })}
        </ul>
      )}
      <span className="flex flex-wrap gap-4">
        <Button
          size="md"
          variant={changed && !busy && name.trim() ? 'accent' : 'disabled'}
          disabled={!changed || busy || !name.trim()}
          onClick={() => send({ action: 'saveList', id: editing.id, name: name.trim(), uris })}
        >
          Guardar cambios
        </Button>
        <Button
          size="md"
          variant={busy ? 'disabled' : 'ghost'}
          disabled={busy}
          onClick={() => send({ action: 'closeList' })}
        >
          Cerrar
        </Button>
      </span>
    </div>
  );
}

/** "Mejorar": a typed wish (same rules as "Dime qué quieres") or buttons that can always be done. */
export function ListImprover({
  id,
  proposal,
  busy,
  send,
  onClose,
}: {
  id: string;
  proposal: PlaylistProposal | undefined;
  busy: boolean;
  send: PlaylistSend;
  onClose: () => void;
}) {
  const [wish, setWish] = useState('');
  const mine = proposal?.id === id ? proposal : undefined;
  const ask = () => {
    if (!wish.trim() || busy) return;
    send({ action: 'improve', id, mode: 'text', text: wish.trim() });
  };

  if (mine) {
    const nothing = mine.remove.length === 0 && mine.add.length === 0;
    return (
      <div className="flex flex-col gap-6 border-2 border-border p-8">
        <span className="text-accent-bright">{mine.label}</span>
        {mine.note && <span className="text-text-muted">{mine.note}</span>}
        {mine.remove.length > 0 && (
          <>
            <span className="text-status-error">Quita {mine.remove.length}</span>
            <ul className={listBox}>
              {mine.remove.map((s) => (
                <SongLine key={s.uri} song={s} />
              ))}
            </ul>
          </>
        )}
        {mine.add.length > 0 && (
          <>
            <span className="text-accent-bright">Agrega {mine.add.length}</span>
            <ul className={listBox}>
              {mine.add.map((s) => (
                <SongLine key={s.uri} song={s} />
              ))}
            </ul>
          </>
        )}
        {!nothing && (
          <span className="text-text-muted text-xs">
            Queda en {roundedDuration(mine.totalMs)}. No cambia nada hasta que digas que sí.
          </span>
        )}
        <span className="flex flex-wrap gap-4">
          {!nothing && (
            <Button
              size="md"
              variant={busy ? 'disabled' : 'accent'}
              disabled={busy}
              onClick={() => send({ action: 'applyImprove', id })}
            >
              Sí, aplicar
            </Button>
          )}
          <Button
            size="md"
            variant={busy ? 'disabled' : 'ghost'}
            disabled={busy}
            onClick={() => send({ action: 'dropImprove' })}
          >
            {nothing ? 'Volver' : 'No'}
          </Button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 border-2 border-border p-8">
      <span className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          value={wish}
          maxLength={PLAYLIST_DESCRIBE_MAX}
          aria-label="Qué le cambio"
          placeholder="¿Qué le cambio? Ej. más de los 80, algo de jazz"
          disabled={busy}
          onChange={(e) => setWish(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
          className={`flex-1 min-w-[160px] ${inputClass}`}
        />
        <Button
          size="sm"
          variant={wish.trim() && !busy ? 'accent' : 'disabled'}
          disabled={!wish.trim() || busy}
          onClick={ask}
        >
          Ver cambios
        </Button>
      </span>
      <span className="text-xs text-text-muted">
        Palabras como «más movida» no las entiendo; estos sí los puedo cumplir:
      </span>
      <span className="flex flex-wrap gap-4">
        {PLAYLIST_IMPROVE_BUTTONS.map((b) => (
          <Button
            key={b.mode}
            size="sm"
            variant={busy ? 'disabled' : 'default'}
            disabled={busy}
            onClick={() => send({ action: 'improve', id, mode: b.mode })}
          >
            {b.label}
          </Button>
        ))}
      </span>
      <span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          Cerrar
        </Button>
      </span>
    </div>
  );
}
