import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { hintPosition } from './hintPosition.js';
import { hintStore } from './hintStore.js';

/** The hover sign: a pixel box next to the cursor naming what a click on the piece under it opens. */
export function FurnitureHint() {
  const hint = useSyncExternalStore(hintStore.subscribe, hintStore.get);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Measure the sign so it can stay inside the window (a new label changes its width)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
  }, [hint?.label]);

  if (!hint) return null;
  const { left, top } = hintPosition(
    hint.x,
    hint.y,
    size.w,
    size.h,
    window.innerWidth,
    window.innerHeight,
  );
  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none pixel-panel px-6 py-2 text-sm text-text whitespace-nowrap"
      style={{ left, top }}
      data-testid="furniture-hint"
    >
      {hint.label}
    </div>
  );
}
