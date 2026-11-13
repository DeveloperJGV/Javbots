import type { PlaylistPreview as Preview } from '../../../../core/src/messages.js';
import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { CheckBox, SectionTitle } from './PlaylistBits.js';
import type { PlaylistSend } from './PlaylistBuilder.js';
import { previewLength, songDuration } from './playlistText.js';

/** The playlist as it would go to Spotify: drop songs, roll again, create or cancel. */
export function PlaylistPreview({
  preview,
  autoPlay,
  busy,
  send,
}: {
  preview: Preview;
  autoPlay: boolean;
  busy: boolean;
  send: PlaylistSend;
}) {
  const length = previewLength(preview.songs.length, preview.totalMs, preview.targetMs);
  return (
    <section className="flex flex-col gap-6">
      <SectionTitle>{preview.recipeName}</SectionTitle>
      {preview.request && <span className="text-text-muted">Pediste: «{preview.request}»</span>}
      {preview.origin && <span className="text-accent-bright">{preview.origin}.</span>}
      <span>
        {length.main}
        {length.exact && <span className="text-text-muted text-xs"> ({length.exact})</span>}
      </span>
      <ul className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto border-2 border-border bg-bg-dark p-6">
        {preview.songs.map((s) => (
          <li key={s.uri} className="flex items-center justify-between gap-8">
            <span>
              {s.title} <span className="text-text-muted">— {s.artist}</span>
              <span className="text-text-muted"> · {songDuration(s.durationMs)}</span>
              {s.discover && <span className="text-accent-bright text-xs"> · nueva</span>}
            </span>
            <Button
              size="sm"
              variant={busy ? 'disabled' : 'ghost'}
              disabled={busy}
              aria-label={`Esta no: ${s.title}`}
              title="Esta no"
              onClick={() => send({ action: 'reject', uri: s.uri })}
            >
              Esta no
            </Button>
          </li>
        ))}
      </ul>
      <CheckBox
        checked={autoPlay}
        disabled={busy}
        onChange={(v) => send({ action: 'setAutoPlay', play: v })}
      >
        Ponerla a sonar al crearla
      </CheckBox>
      <span className="flex flex-wrap gap-4">
        <Button
          size="md"
          variant={busy ? 'disabled' : 'default'}
          disabled={busy}
          onClick={() => send({ action: 'reroll' })}
        >
          Otra tirada
        </Button>
        <Button
          size="md"
          variant={busy || preview.songs.length === 0 ? 'disabled' : 'accent'}
          disabled={busy || preview.songs.length === 0}
          onClick={() => send({ action: 'create', play: autoPlay })}
        >
          Crear en Spotify
        </Button>
        <Button
          size="md"
          variant={busy ? 'disabled' : 'ghost'}
          disabled={busy}
          onClick={() => send({ action: 'cancel' })}
        >
          Cancelar
        </Button>
      </span>
    </section>
  );
}
