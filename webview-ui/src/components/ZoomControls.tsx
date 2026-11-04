import { useEffect, useRef, useState } from 'react';

import {
  ZOOM_LEVEL_FADE_DELAY_MS,
  ZOOM_LEVEL_FADE_DURATION_SEC,
  ZOOM_LEVEL_HIDE_DELAY_MS,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../constants.js';
import { Button } from './ui/Button.js';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

/**
 * Zoom in / out, small, bottom-right. "Fit the whole office" is a key on the elevator plate (BottomToolbar);
 * Ctrl+wheel zooms too (OfficeCanvas).
 */
export function ZoomControls({ zoom, onZoomChange }: ZoomControlsProps) {
  const [showLevel, setShowLevel] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef(zoom);

  const minDisabled = zoom <= ZOOM_MIN;
  const maxDisabled = zoom >= ZOOM_MAX;

  // Show zoom level briefly when zoom changes
  useEffect(() => {
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;

    // Clear existing timers
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    setShowLevel(true);
    setFadeOut(false);

    // Start fade after delay
    fadeTimerRef.current = setTimeout(() => {
      setFadeOut(true);
    }, ZOOM_LEVEL_FADE_DELAY_MS);

    // Hide completely after delay
    timerRef.current = setTimeout(() => {
      setShowLevel(false);
      setFadeOut(false);
    }, ZOOM_LEVEL_HIDE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [zoom]);

  return (
    <>
      {/* Zoom level indicator at top-center */}
      {showLevel && (
        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 z-10 pixel-panel pb-4 px-16 text-lg select-none pointer-events-none"
          style={{
            opacity: fadeOut ? 0 : 1,
            transition: `opacity ${ZOOM_LEVEL_FADE_DURATION_SEC}s ease-out`,
          }}
        >
          {zoom}x
        </div>
      )}

      {/* [+][-] side by side, bottom-right, out of the elevator's way */}
      <div className="absolute bottom-8 right-8 z-44 flex gap-4">
        <Button
          size="icon"
          onClick={() => onZoomChange(zoom + 1)}
          disabled={maxDisabled}
          className="w-28! h-28! border-border! shadow-pixel disabled:hover:bg-btn-bg disabled:cursor-default disabled:opacity-(--btn-disabled-opacity)"
          title="Acercar (Ctrl+rueda)"
          aria-label="Acercar"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <rect x="6" y="2" width="2" height="10" fill="currentColor" />
            <rect x="2" y="6" width="10" height="2" fill="currentColor" />
          </svg>
        </Button>
        <Button
          size="icon"
          onClick={() => onZoomChange(zoom - 1)}
          disabled={minDisabled}
          className="w-28! h-28! border-border! shadow-pixel disabled:hover:bg-btn-bg disabled:cursor-default disabled:opacity-(--btn-disabled-opacity)"
          title="Alejar (Ctrl+rueda)"
          aria-label="Alejar"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <rect x="2" y="6" width="10" height="2" fill="currentColor" />
          </svg>
        </Button>
      </div>
    </>
  );
}
