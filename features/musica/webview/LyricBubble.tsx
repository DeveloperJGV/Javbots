import { useEffect, useRef, useState } from 'react';

import type { OfficeState } from '../../../webview-ui/src/office/engine/officeState.js';
import { overlayProjection } from '../../../webview-ui/src/office/projection.js';
import { renderDpr } from '../../../webview-ui/src/viewScale.js';
import {
  LYRIC_BUBBLE_GAP_PX,
  LYRIC_BUBBLE_MARGIN_PX,
  LYRIC_BUBBLE_MAX_WIDTH_PX,
  LYRIC_NOTE,
  LYRIC_PIN_MAX_WIDTH_PX,
  LYRIC_PIN_TOP_PX,
} from './constants.js';
import { isMusicPlayer, lyricAnchorY, lyricBubblePlacement } from './musicFurniture.js';
import { isMusicPlaying, lyricBubbleText, type MusicState } from './musicStore.js';

interface LyricBubbleProps {
  music: MusicState;
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
}

/**
 * The line being sung, in a speech bubble over the music player of the floor on screen (synced lyrics only, while
 * playing; a note between lines and for instrumentals). With no player in view (another floor without one, or
 * panned away) it pins small at the top center, so it can always be read. Sits under the elevator and the panels.
 */
export function LyricBubble({ music, officeState, containerRef, zoom, panRef }: LyricBubbleProps) {
  const live = isMusicPlaying(music) && !music.lyricBubbleHidden;
  // Follow pans, zooms and the lyrics' clock frame by frame, like the agents' labels.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [live]);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const text = live ? lyricBubbleText(music) : null;
  const el = containerRef.current;
  if (!text || !el) return null;

  const rect = el.getBoundingClientRect();
  const player = officeState.furniture.find(isMusicPlayer);
  let anchor: { x: number; y: number } | null = null;
  if (player) {
    const project = overlayProjection(
      officeState.getLayout(),
      rect,
      zoom,
      panRef.current,
      renderDpr(),
    );
    anchor = {
      x: project.toScreenX(player.x + (player.sprite[0]?.length ?? 0) / 2),
      y: project.toScreenY(lyricAnchorY(player, officeState.furniture) - LYRIC_BUBBLE_GAP_PX),
    };
  }
  // Last frame's size: the bubble re-renders every frame, so this lags one frame at most.
  const measured = bubbleRef.current;
  const place = lyricBubblePlacement(
    anchor,
    { width: rect.width, height: rect.height },
    {
      width: measured?.offsetWidth ?? LYRIC_BUBBLE_MAX_WIDTH_PX,
      height: measured?.offsetHeight ?? 0,
    },
    LYRIC_BUBBLE_MARGIN_PX,
  );

  if (place.kind === 'pin') {
    return (
      <div
        ref={bubbleRef}
        data-lyric-bubble="pin"
        className="absolute pointer-events-none z-10 left-1/2 -translate-x-1/2 bg-bg text-text text-2xs border-2 border-border shadow-pixel py-2 px-8 text-center leading-snug"
        style={{ top: LYRIC_PIN_TOP_PX, maxWidth: LYRIC_PIN_MAX_WIDTH_PX, width: 'max-content' }}
      >
        {text === LYRIC_NOTE ? text : `${LYRIC_NOTE} ${text}`}
      </div>
    );
  }

  return (
    <div
      data-lyric-bubble="player"
      className="absolute pointer-events-none z-10 flex flex-col items-center"
      style={{
        left: place.left,
        top: place.top,
        transform: 'translate(-50%, -100%)',
        width: 'max-content',
      }}
    >
      <div
        ref={bubbleRef}
        className="bg-bg text-text text-xs border-2 border-border shadow-pixel py-4 px-8 text-center leading-snug"
        style={{ maxWidth: LYRIC_BUBBLE_MAX_WIDTH_PX }}
      >
        {text}
      </div>
      {/* Stepped pixel tail pointing down at the player (stays over it when the bubble slides sideways) */}
      <div
        className="flex flex-col items-center"
        style={{ transform: `translateX(${(anchor?.x ?? place.left) - place.left}px)` }}
      >
        <div className="bg-border w-12 h-3" />
        <div className="bg-border w-8 h-3" />
        <div className="bg-border w-4 h-3" />
      </div>
    </div>
  );
}
