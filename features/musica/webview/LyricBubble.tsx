import { useEffect, useState } from 'react';

import type { OfficeState } from '../../../webview-ui/src/office/engine/officeState.js';
import { overlayProjection } from '../../../webview-ui/src/office/projection.js';
import { renderDpr } from '../../../webview-ui/src/viewScale.js';
import { LYRIC_BUBBLE_GAP_PX, LYRIC_BUBBLE_MAX_WIDTH_PX } from './constants.js';
import { isTurntable, lyricAnchorY } from './musicFurniture.js';
import { currentLyricIndex, currentLyrics, isMusicPlaying, type MusicState } from './musicStore.js';

interface LyricBubbleProps {
  music: MusicState;
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

/** The line being sung, in a speech bubble over the turntable (synced lyrics only, while playing). */
export function LyricBubble({ music, officeState, containerRef, zoom, panRef }: LyricBubbleProps) {
  const playing = isMusicPlaying(music) && Boolean(currentLyrics(music)?.synced);
  // Follow pans, zooms and the lyrics' clock frame by frame, like the agents' labels.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  if (!playing) return null;
  const lyrics = currentLyrics(music);
  const idx = currentLyricIndex(music);
  const text = idx >= 0 ? lyrics?.lines?.[idx]?.text : undefined;
  const turntable = officeState.furniture.find(isTurntable);
  const el = containerRef.current;
  if (!text || !turntable || !el) return null;

  const project = overlayProjection(
    officeState.getLayout(),
    el.getBoundingClientRect(),
    zoom,
    panRef.current,
    renderDpr(),
  );
  const x = project.toScreenX(turntable.x + (turntable.sprite[0]?.length ?? 0) / 2);
  const y = project.toScreenY(lyricAnchorY(turntable, officeState.furniture) - LYRIC_BUBBLE_GAP_PX);

  return (
    <div
      className="absolute pointer-events-none z-10 bg-bg text-text text-xs border-2 border-border shadow-pixel py-4 px-8 text-center leading-snug"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        maxWidth: LYRIC_BUBBLE_MAX_WIDTH_PX,
        width: 'max-content',
      }}
    >
      {text}
    </div>
  );
}
