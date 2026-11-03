import { useEffect, useState } from 'react';

/**
 * Re-renders the component on every animation frame while `enabled`: DOM overlays that float over the canvas
 * (signs, room overlays) follow pans, zooms and walking characters this way, like the agents' labels.
 */
export function useFrameTick(enabled = true): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);
}
