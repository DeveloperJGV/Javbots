import { useEffect, useState } from 'react';

import perrosUrl from './assets/perros-corriendo.png';
import {
  MUSIC_COLUMN_WIDTH_PX,
  MUSIC_COVER_DISPLAY_PX,
  MUSIC_PROGRESS_TICK_MS,
} from './constants.js';
import {
  currentLyricIndex,
  currentLyrics,
  formatTime,
  isColumnVisible,
  lyricsStatus,
  type MusicState,
  playbackPositionMs,
} from './musicStore.js';

/** Equalizer bars: pixel steps, no easing (pixel art). */
const EQUALIZER_CSS = `
@keyframes musica-eq { 0% { height: 4px } 25% { height: 14px } 50% { height: 8px } 75% { height: 16px } 100% { height: 6px } }
.musica-eq > span { width: 4px; background: var(--color-accent-bright); animation: musica-eq 0.9s steps(4) infinite; }
.musica-eq > span:nth-child(2) { animation-delay: -0.3s } .musica-eq > span:nth-child(3) { animation-delay: -0.6s }
.musica-eq > span:nth-child(4) { animation-delay: -0.15s }
.musica-eq.paused > span { animation-play-state: paused }
`;

function NoteIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 5 7" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M2 0h3v1H3v4H2zM0 4h2v2H0zM4 1h1v1H4z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 5 7" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M0 0h2v7H0zM3 0h2v7H3z" fill="currentColor" />
    </svg>
  );
}

/** Pixel icons (7x7 grid, crisp edges) for the track details. */
function PixelIcon({ path, label }: { path: string; label: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className="shrink-0 mt-2"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path d={path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
/** A person: head and shoulders. */
const ARTIST_ICON = 'M2 0h3v1H2zM1 1h1v2H1zM5 1h1v2H5zM2 3h3v1H2zM1 5h5v1H1zM0 6h7v1H0z';
/** A record: ring with a hole in the middle. */
const ALBUM_ICON =
  'M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM3 3h1v1H3zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2z';
/** A speaker (the Spotify Connect device it plays on). */
const DEVICE_ICON = 'M1 0h5v7H1zM3 1h1v1H3zM2 3h3v3H2zM3 4h1v1H3z';

function Detail({
  icon,
  label,
  text,
  accent,
}: {
  icon: string;
  label: string;
  text: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`flex items-start gap-6 break-words ${accent ? 'text-xs text-accent-bright' : 'text-sm text-text-muted'}`}
    >
      <PixelIcon path={icon} label={label} />
      <span className="min-w-0">{text}</span>
    </span>
  );
}

/**
 * Hunter and Tango (the owner's dogs) run across while the lyrics load.
 * Sheet: one row per dog, walk cycle 0,1,0,2 of 32 px frames, drawn at x2.
 */
const LOADER_CSS = `
@keyframes musica-perros-paso { from { background-position-x: 0 } to { background-position-x: -256px } }
@keyframes musica-perros-corren { from { transform: translateX(-80px) } to { transform: translateX(232px) } }
.musica-perros { position: relative; height: 64px; overflow: hidden; }
.musica-perros > div {
  position: absolute; left: 0; bottom: 0; width: 64px; height: 64px;
  background-size: 256px 128px; image-rendering: pixelated;
  animation: musica-perros-paso 0.6s steps(4) infinite, musica-perros-corren 3.4s linear infinite both;
}
.musica-perros > div + div { background-position-y: -64px; animation-delay: 0s, 0.7s; }
`;

function LyricsLoader() {
  return (
    <div className="flex flex-col gap-8" role="status">
      <style>{LOADER_CSS}</style>
      <div className="musica-perros border-b-2 border-border">
        <div style={{ backgroundImage: `url(${perrosUrl})` }} title="Hunter" />
        <div style={{ backgroundImage: `url(${perrosUrl})` }} title="Tango" />
      </div>
      <span className="text-xs text-text-muted text-center">Hunter y Tango buscan la letra…</span>
    </div>
  );
}

const LYRICS_SOURCE_LABEL = { spotify: 'Letra: Spotify', lrclib: 'Letra: LRCLIB' } as const;

/** Karaoke: the line being sung, bright, between the previous and the next. Unsynced lyrics just scroll. */
function Lyrics({ music, now }: { music: MusicState; now: number }) {
  const status = lyricsStatus(music);
  if (status === 'loading' || status === 'none') {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-8 border-t-2 border-border pt-10">
        {status === 'loading' ? (
          <LyricsLoader />
        ) : (
          <span className="text-xs text-text-muted">No encontré la letra de esta canción.</span>
        )}
      </div>
    );
  }
  const lyrics = currentLyrics(music);
  if (!lyrics?.lines) return null;
  const source = lyrics.source ? LYRICS_SOURCE_LABEL[lyrics.source] : null;
  if (!lyrics.synced) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-6 border-t-2 border-border pt-10">
        <div className="flex-1 min-h-0 overflow-y-auto text-sm text-text-muted leading-snug">
          {lyrics.lines.map((l, i) => (
            <p key={i} className="m-0 min-h-[1em] break-words">
              {l.text}
            </p>
          ))}
        </div>
        {source && <span className="text-2xs text-text-muted">{source} · sin sincronizar</span>}
      </div>
    );
  }
  const idx = currentLyricIndex(music, now);
  const line = (i: number) => lyrics.lines?.[i]?.text || (i === idx ? '♪' : '');
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-8 border-t-2 border-border pt-10">
      <span className="text-sm text-text-muted break-words min-h-[1.2em]">
        {idx > 0 ? line(idx - 1) : ''}
      </span>
      <span className="text-base text-text break-words min-h-[1.2em]">
        {idx >= 0 ? line(idx) : '♪'}
      </span>
      <span className="text-sm text-text-muted break-words min-h-[1.2em]">{line(idx + 1)}</span>
      <span className="text-sm text-text-muted/60 break-words min-h-[1.2em]">{line(idx + 2)}</span>
      {source && <span className="text-2xs text-text-muted mt-auto">{source}</span>}
    </div>
  );
}

/**
 * The music column at the right of the office. It takes its own space (the
 * office is laid out in what is left), so it never covers any of the office.
 */
export function MusicColumn({ music }: { music: MusicState }) {
  const [now, setNow] = useState(() => Date.now());
  const visible = isColumnVisible(music, now);
  useEffect(() => {
    if (!music.track) return;
    const timer = setInterval(() => setNow(Date.now()), MUSIC_PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }, [music.track]);

  if (!visible || !music.track) return null;
  const t = music.track;
  const pos = playbackPositionMs(music, now);
  const pct = t.durationMs > 0 ? Math.min(100, (pos / t.durationMs) * 100) : 0;

  return (
    <aside
      className="h-full shrink-0 bg-bg border-l-2 border-border flex flex-col gap-12 p-20 overflow-hidden"
      style={{ width: MUSIC_COLUMN_WIDTH_PX }}
      aria-label="Música"
    >
      <style>{EQUALIZER_CSS}</style>
      <div className="flex items-center gap-6 text-sm text-accent-bright">
        {t.isPaused ? <PauseIcon /> : <NoteIcon />}
        <span className={t.isPaused ? 'text-text-muted' : ''}>
          {t.isPaused ? 'En pausa' : 'Sonando'}
        </span>
        <div
          className={`musica-eq ml-auto flex items-end gap-2 h-16 ${t.isPaused ? 'paused' : ''}`}
        >
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      {t.cover ? (
        <img
          src={t.cover}
          alt=""
          className="self-center aspect-square border-2 border-border shadow-pixel"
          style={{ width: MUSIC_COVER_DISPLAY_PX }}
        />
      ) : (
        <div
          className="self-center aspect-square border-2 border-border bg-bg-dark"
          style={{ width: MUSIC_COVER_DISPLAY_PX }}
        />
      )}
      <div className="flex flex-col gap-4 min-w-0">
        <span className="text-lg text-text leading-tight break-words">{t.title}</span>
        {t.artist && <Detail icon={ARTIST_ICON} label="Artista" text={t.artist} />}
        {t.album && <Detail icon={ALBUM_ICON} label="Disco" text={t.album} />}
        {t.device && (
          <Detail icon={DEVICE_ICON} label="Dispositivo" text={`En ${t.device}`} accent />
        )}
      </div>
      {t.durationMs > 0 && (
        <div className="flex flex-col gap-4">
          <div className="h-4 bg-btn-bg">
            <div className="h-full bg-accent-bright" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-text-muted">
            <span>{formatTime(pos)}</span>
            <span>{formatTime(t.durationMs)}</span>
          </div>
        </div>
      )}
      <Lyrics music={music} now={now} />
    </aside>
  );
}
