import { useSyncExternalStore } from 'react';

import { Button } from '../../../../webview-ui/src/components/ui/Button.js';
import { PLAYLIST_DESCRIBE_EXAMPLE, PLAYLIST_DESCRIBE_MAX, PLAYLIST_MINUTES } from './constants.js';
import { CheckBox, inputClass, SectionTitle, ToggleButton } from './PlaylistBits.js';
import type { PlaylistSend } from './PlaylistBuilder.js';
import { playlistStore } from './playlistStore.js';

/**
 * "Dime qué quieres": the owner writes what he wants, the server reads it by rules (genre, decade, artist, length,
 * "solo lo mío" / "para descubrir"), searches Spotify and builds the preview.
 */
export function PlaylistDescribe({ busy, send }: { busy: boolean; send: PlaylistSend }) {
  const draft = useSyncExternalStore(playlistStore.subscribe, playlistStore.get).draft;
  const ready = draft.text.trim() !== '' && !busy;
  const go = () => {
    if (!ready) return;
    send({
      action: 'describe',
      text: draft.text.trim(),
      minutes: draft.minutes,
      avoidRecent: draft.avoidRecent,
    });
  };
  return (
    <section className="flex flex-col gap-6 border-2 border-accent bg-bg-dark p-8">
      <SectionTitle>Dime qué quieres</SectionTitle>
      <textarea
        value={draft.text}
        rows={2}
        maxLength={PLAYLIST_DESCRIBE_MAX}
        aria-label="Qué quieres escuchar"
        placeholder={PLAYLIST_DESCRIBE_EXAMPLE}
        disabled={busy}
        onChange={(e) => playlistStore.setDraft({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
        className={`w-full resize-none ${inputClass}`}
      />
      <span className="text-xs text-text-muted">
        Entiendo géneros, décadas o años, artistas, duración, «solo lo mío» y «para descubrir».
      </span>
      <span className="flex flex-wrap items-center gap-4">
        {PLAYLIST_MINUTES.map((m) => (
          <ToggleButton
            key={m.minutes}
            on={draft.minutes === m.minutes}
            disabled={busy}
            onClick={() => playlistStore.setDraft({ minutes: m.minutes })}
          >
            {m.label}
          </ToggleButton>
        ))}
        <Button size="md" variant={ready ? 'accent' : 'disabled'} disabled={!ready} onClick={go}>
          Buscar y armar
        </Button>
      </span>
      <CheckBox
        checked={draft.avoidRecent}
        disabled={busy}
        onChange={(v) => playlistStore.setDraft({ avoidRecent: v })}
      >
        Sin repetir lo de estos días
      </CheckBox>
    </section>
  );
}
