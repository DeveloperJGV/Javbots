import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { officeToken } from '../../../webview-ui/src/officeToken.js';
import { photoDate } from './jardinFichas.js';
import { photoUrl } from './jardinText.js';

/**
 * A plant's photos: a strip of thumbnails; one opens big inside the panel, with previous / next and "Quitar foto"
 * (asked first; the server moves the file to "Ya no están", it never deletes it).
 */
export function JardinFotos({
  photos,
  name,
  saving,
  onRemove,
}: {
  photos: readonly string[];
  name: string;
  saving?: boolean;
  onRemove?: (photo: string) => void;
}) {
  const [shown, setShown] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  const viewer = useRef<HTMLDivElement | null>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const token = officeToken();

  useEffect(() => {
    if (shown !== null) viewer.current?.focus();
  }, [shown]);

  if (photos.length === 0) return null;
  // After a photo is taken off, the one that took its place shows (the previous one, if it was the last).
  const at = shown !== null ? Math.min(shown, photos.length - 1) : null;
  const close = () => {
    const back = at;
    setShown(null);
    setAsking(false);
    if (back !== null) requestAnimationFrame(() => thumbs.current[back]?.focus());
  };
  const step = (d: number) => {
    setAsking(false);
    setShown((i) =>
      i === null ? i : (Math.min(i, photos.length - 1) + d + photos.length) % photos.length,
    );
  };

  if (at !== null) {
    const file = photos[at];
    const date = photoDate(file);
    return (
      <div
        ref={viewer}
        tabIndex={-1}
        className="flex flex-col gap-4 border-2 border-border p-6 bg-bg-dark outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === 'ArrowLeft') step(-1);
          else if (e.key === 'ArrowRight') step(1);
        }}
      >
        <img
          src={photoUrl(file, token)}
          alt={`${name}, foto ${at + 1} de ${photos.length}`}
          className="w-full max-h-[50vh] object-contain"
          style={{ imageRendering: 'auto' }}
        />
        <span className="flex flex-wrap items-center gap-8">
          {photos.length > 1 && (
            <Button size="sm" onClick={() => step(-1)}>
              ‹ Anterior
            </Button>
          )}
          <span className="text-text-muted">
            {at + 1} de {photos.length}
            {date && ` · ${date}`}
          </span>
          {photos.length > 1 && (
            <Button size="sm" onClick={() => step(1)}>
              Siguiente ›
            </Button>
          )}
          {onRemove && !asking && (
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAsking(true)}>
              Quitar foto
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className={onRemove && !asking ? undefined : 'ml-auto'}
            onClick={close}
          >
            Cerrar (Esc)
          </Button>
        </span>
        {onRemove && asking && (
          <span className="flex flex-wrap items-center gap-8">
            <span className="text-text-muted">
              ¿Quito esta foto de {name}? No se borra: se guarda en la carpeta "Ya no están".
            </span>
            <Button
              size="sm"
              variant="accent"
              disabled={saving}
              onClick={() => {
                setAsking(false);
                onRemove(file);
              }}
            >
              Sí, quitar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              No
            </Button>
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="flex flex-wrap gap-4">
      {photos.map((f, i) => (
        <button
          key={f}
          ref={(el) => {
            thumbs.current[i] = el;
          }}
          className="p-0 border-2 border-border hover:border-accent cursor-pointer"
          title={photoDate(f) ?? undefined}
          aria-label={`Ver foto ${i + 1} de ${photos.length}`}
          onClick={() => setShown(i)}
        >
          <img
            src={photoUrl(f, token)}
            alt=""
            loading="lazy"
            className="w-[64px] h-[64px] object-cover block"
            style={{ imageRendering: 'auto' }}
          />
        </button>
      ))}
    </span>
  );
}
