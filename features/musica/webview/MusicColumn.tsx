import { useEffect, useState } from 'react';

import { MUSIC_COLUMN_WIDTH_PX, MUSIC_PROGRESS_TICK_MS } from './constants.js';
import { formatTime, isColumnVisible, type MusicState, playbackPositionMs } from './musicStore.js';

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
          className="w-full aspect-square border-2 border-border shadow-pixel"
        />
      ) : (
        <div className="w-full aspect-square border-2 border-border bg-bg-dark" />
      )}
      <div className="flex flex-col gap-4 min-w-0">
        <span className="text-lg text-text leading-tight break-words">{t.title}</span>
        {t.artist && <span className="text-sm text-text-muted break-words">{t.artist}</span>}
        {t.album && <span className="text-sm text-text-muted break-words">{t.album}</span>}
        {t.device && <span className="text-xs text-accent-bright break-words">En {t.device}</span>}
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
    </aside>
  );
}
