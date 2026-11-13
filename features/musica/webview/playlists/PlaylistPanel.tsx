import { useCallback, useEffect, useSyncExternalStore } from 'react';

import type { MessageTransport } from '../../../../core/src/transport.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { Modal } from '../../../../webview-ui/src/components/ui/Modal.js';
import { musicStore } from '../musicStore.js';
import { PLAYLIST_BUSY_TEXT, PLAYLIST_TABS } from './constants.js';
import { KeepOrDelete, linkClass } from './PlaylistBits.js';
import { PlaylistBuilder, type PlaylistSend } from './PlaylistBuilder.js';
import { PlaylistDescribe } from './PlaylistDescribe.js';
import { PlaylistPreview } from './PlaylistPreview.js';
import { PlaylistBin, PlaylistShelf } from './PlaylistShelf.js';
import { playlistStore } from './playlistStore.js';
import { dayLabel, localDay, pendingLists } from './playlistText.js';

function yesterday(): string {
  const now = new Date();
  return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/**
 * "Playlist del día" (features/musica): opens from the record press, its neon sign or the reject bin. The owner
 * picks with buttons, the server builds the list by rules, creates it in Spotify and the owner keeps or deletes it.
 */
export function PlaylistPanel({ transport }: { transport: MessageTransport }) {
  const { status, open, tab } = useSyncExternalStore(playlistStore.subscribe, playlistStore.get);
  const musicToken = useSyncExternalStore(musicStore.subscribe, musicStore.get).status?.token;
  const send: PlaylistSend = useCallback(
    (cmd) => transport.send({ type: 'playlistCommand', ...cmd }),
    [transport],
  );

  // Opening the panel asks the server to read the sources again.
  useEffect(() => {
    if (open) send({ action: 'open' });
  }, [open, send]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') playlistStore.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !status) return null;
  const today = localDay(new Date());
  const busy = !!status.busy;
  const loginHref = musicToken
    ? `/api/music/spotify/login?token=${encodeURIComponent(musicToken)}`
    : null;
  const pending = pendingLists(status.lists, today);
  const ready = status.configured && status.connected && !status.needsReconnect;
  const pendingTitle =
    pending.length > 1
      ? '¿Qué hacemos con estas?'
      : pending[0]?.day === yesterday()
        ? '¿Qué hacemos con la de ayer?'
        : `¿Qué hacemos con la del ${dayLabel(pending[0]?.day ?? today)}?`;
  const loginLink = (label: string) =>
    loginHref ? (
      <a className={linkClass} href={loginHref} target="_blank" rel="noreferrer">
        {label}
      </a>
    ) : (
      <span className="text-text-muted">Abre la oficina con su enlace con token.</span>
    );

  return (
    <Modal
      isOpen
      onClose={() => playlistStore.close()}
      title="Playlist del día"
      className="w-[min(760px,94vw)]"
    >
      <div className="max-h-[75vh] overflow-y-auto px-10 pb-6 flex flex-col gap-8 text-sm text-text">
        {!status.configured && <p>Falta configurar Spotify (Ajustes → Música).</p>}
        {status.configured && !status.connected && (
          <p>Conecta tu cuenta de Spotify. {loginLink('Conectar con Spotify')}</p>
        )}
        {status.configured && status.connected && status.needsReconnect && (
          <p>
            A la conexión con Spotify le falta el permiso para crear y leer playlists.{' '}
            {loginLink('Reconectar Spotify')}
          </p>
        )}
        {status.error && <p className="text-status-error">{status.error}</p>}
        {status.note && <p className="text-text-muted">{status.note}</p>}
        {status.busy && (
          <p className="text-accent-bright" role="status">
            {PLAYLIST_BUSY_TEXT[status.busy] ?? 'Un momento…'}
          </p>
        )}

        {ready && (
          <>
            {pending.length > 0 && (
              <section className="flex flex-col gap-4 border-2 border-border p-8">
                <div className="text-lg text-accent-bright">{pendingTitle}</div>
                <ul className="flex flex-col gap-4">
                  {pending.map((l) => (
                    <KeepOrDelete
                      key={l.id}
                      list={l}
                      busy={busy}
                      send={(action, id) => send({ action, id })}
                    />
                  ))}
                </ul>
              </section>
            )}

            <span className="flex gap-4" role="tablist" aria-label="Secciones">
              {PLAYLIST_TABS.map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  role="tab"
                  variant={t.id === tab ? 'active' : 'default'}
                  aria-selected={t.id === tab}
                  onClick={() => playlistStore.setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </span>

            {tab === 'armar' &&
              (status.preview ? (
                <PlaylistPreview
                  preview={status.preview}
                  autoPlay={status.autoPlay}
                  busy={busy}
                  send={send}
                />
              ) : (
                <>
                  <PlaylistDescribe busy={busy} send={send} />
                  <PlaylistBuilder status={status} busy={busy} send={send} />
                </>
              ))}
            {tab === 'repisa' && <PlaylistShelf status={status} busy={busy} send={send} />}
            {tab === 'bote' && <PlaylistBin rejected={status.rejected} busy={busy} send={send} />}
          </>
        )}
      </div>
    </Modal>
  );
}
