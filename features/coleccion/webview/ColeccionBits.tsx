import { useEffect, useRef, useState } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { cover, paint } from './art.js';
import { CONFIRM_RESET_MS } from './constants.js';

export type Send = (msg: Parameters<MessageTransport['send']>[0]) => void;

/** A game's cover drawn by code, on a canvas. */
export function CoverCanvas({ title, w = 48, h = 64 }: { title: string; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => paint(ref.current, cover(title, w, h)), [title, w, h]);
  return <canvas ref={ref} width={w} height={h} aria-hidden="true" />;
}

/** A button that asks "¿Seguro?" before doing it; goes back by itself after a while. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'col-btn',
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), CONFIRM_RESET_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={armed ? `${className} danger` : className}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
