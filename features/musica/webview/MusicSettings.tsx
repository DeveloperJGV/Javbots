import { useState } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { Checkbox } from '../../../webview-ui/src/components/ui/Checkbox.js';
import type { MusicState } from './musicStore.js';

/** Settings → Música: show/hide, and install the Spicetify extension into Spotify. */
export function MusicSettings({
  music,
  transport,
}: {
  music: MusicState;
  transport: MessageTransport;
}) {
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = music.status;
  if (!status) return null;

  return (
    <div className="border-t-2 border-border mt-4 pt-4">
      <Checkbox
        label="Mostrar música de Spotify"
        checked={status.enabled}
        onChange={() => transport.send({ type: 'setMusicEnabled', enabled: !status.enabled })}
      />
      <div className="px-10 pb-6 text-xs text-text-muted flex flex-col gap-6">
        <span>
          {!status.spicetifyFound
            ? 'No encontré Spicetify en esta computadora (lo necesita para leer Spotify).'
            : status.extensionInstalled
              ? 'La extensión de Javbots ya está en Spotify.'
              : 'Spicetify está instalado; falta la extensión de Javbots.'}
        </span>
        {status.token && status.spicetifyFound && (
          <div className="flex flex-col gap-6">
            <Button
              variant="default"
              size="sm"
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                transport.send({ type: 'installMusicExtension' });
                setTimeout(() => setInstalling(false), 15_000);
              }}
            >
              {status.extensionInstalled
                ? 'Reinstalar la extensión'
                : 'Instalar la extensión en Spotify'}
            </Button>
            <span>Spotify se cierra y se vuelve a abrir solo al instalarla.</span>
          </div>
        )}
        {status.message && <span className="text-text">{status.message}</span>}
        {status.token && (
          <button
            className="self-start bg-transparent border-none p-0 text-accent-bright underline cursor-pointer text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(status.token ?? '').then(() => setCopied(true));
            }}
          >
            {copied ? 'Token copiado' : 'Copiar el token (para instalarla a mano)'}
          </button>
        )}
        <div className="flex flex-col gap-6 pt-6 border-t-2 border-border">
          {!status.spotifyConfigured ? (
            <span>
              Sin Spotify abierto en esta computadora, la oficina puede preguntarle a tu cuenta qué suena (en el
              celular, una bocina…): pon <code>spotifyClientId</code> en <code>music.json</code> (ver el README de
              la música).
            </span>
          ) : status.spotifyConnected ? (
            <>
              <span>
                Conectada a tu cuenta de Spotify: la oficina ve lo que suena aunque Spotify no esté abierto aquí
                {status.source === 'spotify' ? ' (ahora mismo la canción viene de ahí).' : '.'}
              </span>
              {status.token && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => transport.send({ type: 'disconnectSpotify' })}
                >
                  Desconectar de Spotify
                </Button>
              )}
            </>
          ) : (
            <>
              <span>
                Sin Spotify abierto en esta computadora, la oficina puede preguntarle a tu cuenta qué suena (en
                el celular, una bocina…).
              </span>
              {status.token && (
                <a
                  className="self-start text-accent-bright underline text-xs"
                  href={`/api/music/spotify/login?token=${encodeURIComponent(status.token)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Conectar con Spotify
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
