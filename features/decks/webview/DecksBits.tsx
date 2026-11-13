import { useEffect, useRef, useState } from 'react';

import type { MessageTransport } from '../../../core/src/transport.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { CONFIRM_RESET_MS } from './constants.js';
import { loadCover } from './coverCache.js';
import { cardImageUrl } from './decksText.js';

export type Send = (msg: Parameters<MessageTransport['send']>[0]) => void;

/** The low-res cover of a card on a canvas (pixel art); empty when there is none. */
export function CoverCanvas({ id, className }: { id: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const canvas = ref.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    void loadCover(id).then((cover) => {
      if (!live || !cover || !canvas) return;
      canvas.width = cover.pixels.width;
      canvas.height = cover.pixels.height;
      canvas.getContext('2d')?.drawImage(cover.pixels, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return <canvas ref={ref} className={className} width={1} height={1} aria-hidden="true" />;
}

/** A card's small image (it hides itself if the office can't serve it). */
export function CardThumb({ id }: { id: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="thumb" aria-hidden="true" />;
  return (
    <img
      className="thumb"
      src={cardImageUrl(id, 'small', officeToken())}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** A button that asks "¿Seguro?" before doing it; goes back by itself after a while. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
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
      className={armed ? 'decks-btn danger' : 'decks-btn ghost'}
      disabled={disabled}
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
