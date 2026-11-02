import { useMemo, useState, useSyncExternalStore } from 'react';

import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { ItemSelect } from '../../../webview-ui/src/components/ui/ItemSelect.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import {
  FURNITURE_CATEGORIES,
  getCatalogByCategory,
  getRotatedType,
  getToggledType,
} from '../../../webview-ui/src/office/layout/furnitureCatalog.js';
import { getCachedSprite } from '../../../webview-ui/src/office/sprites/spriteCache.js';
import type { FurnitureCatalogEntry } from '../../../webview-ui/src/office/types.js';
import { JUKEBOX_STYLES } from '../../musica/webview/constants.js';
import { bodegaStore } from './bodegaStore.js';
import { BODEGA_THUMB_PX, DLC_TAB, DLC_TAB_LABEL, DLC_THUMB_SCALE } from './constants.js';
import { DLC_CHARACTERS } from './dlc.js';
import { byCategory, storedItems } from './storedItems.js';

/** Pieces with interchangeable looks: one placed look takes all of them out of storage. */
const STYLE_FAMILIES: ReadonlyArray<readonly string[]> = [JUKEBOX_STYLES.map((s) => s.type)];

/** Rotations, on/off states and looks of a piece: placing any of them takes the whole piece out of storage. */
function familyOf(type: string): string[] {
  const seen = new Set<string>([type, ...(STYLE_FAMILIES.find((f) => f.includes(type)) ?? [])]);
  const queue = [type];
  while (queue.length > 0) {
    const t = queue.pop()!;
    for (const next of [getRotatedType(t, 'cw'), getRotatedType(t, 'ccw'), getToggledType(t)]) {
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen];
}

const CATEGORY_LABELS = new Map(FURNITURE_CATEGORIES.map((c) => [c.id as string, c.label]));

function drawEntry(entry: FurnitureCatalogEntry) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const cached = getCachedSprite(entry.sprite, 2);
    const scale = Math.min(w / cached.width, h / cached.height) * 0.85;
    const dw = cached.width * scale;
    const dh = cached.height * scale;
    ctx.drawImage(cached, (w - dw) / 2, (h - dh) / 2, dw, dh);
  };
}

/**
 * The storage room (features/bodega): a click on the shelf in the office opens every piece of furniture that exists
 * and is not placed, by category, plus the characters on hold (DLC). "Sacar" opens the editor with the piece ready.
 */
export function BodegaPanel({ getPlacedTypes }: { getPlacedTypes: () => string[] }) {
  const { open } = useSyncExternalStore(bodegaStore.subscribe, bodegaStore.get);
  const [tab, setTab] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!open) return [];
    const catalog = FURNITURE_CATEGORIES.flatMap((c) => getCatalogByCategory(c.id));
    const stored = storedItems(catalog, getPlacedTypes(), familyOf);
    return byCategory(
      stored,
      FURNITURE_CATEGORIES.map((c) => c.id),
    );
  }, [open, getPlacedTypes]);

  if (!open) return null;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const activeTab = tab ?? groups[0]?.category ?? DLC_TAB;
  const items = groups.find((g) => g.category === activeTab)?.items ?? [];
  const pickedEntry = items.find((e) => e.type === picked);

  const close = () => {
    setPicked(null);
    bodegaStore.close();
  };

  return (
    <Modal isOpen onClose={close} title="Bodega" className="w-[min(820px,94vw)]">
      <div className="px-10 pb-6">
        <p className="text-sm text-text-muted">
          {total} muebles guardados y {DLC_CHARACTERS.length} personajes en pausa. Escoge uno y
          sácalo para ponerlo en la oficina; lo que borres en el editor vuelve aquí.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          {groups.map((g) => (
            <Button
              key={g.category}
              size="sm"
              variant={activeTab === g.category ? 'active' : 'default'}
              onClick={() => {
                setTab(g.category);
                setPicked(null);
              }}
            >
              {CATEGORY_LABELS.get(g.category) ?? g.category} ({g.items.length})
            </Button>
          ))}
          <Button
            size="sm"
            variant={activeTab === DLC_TAB ? 'active' : 'default'}
            onClick={() => {
              setTab(DLC_TAB);
              setPicked(null);
            }}
          >
            {DLC_TAB_LABEL} ({DLC_CHARACTERS.length})
          </Button>
        </div>

        {activeTab === DLC_TAB ? (
          <div className="mt-6 flex flex-wrap gap-10">
            {DLC_CHARACTERS.map((c) => (
              <div key={c.id} className="flex flex-col items-center w-[140px] text-center">
                <img
                  src={c.url}
                  alt={c.name}
                  width={24 * DLC_THUMB_SCALE}
                  height={44 * DLC_THUMB_SCALE}
                  style={{ imageRendering: 'pixelated' }}
                />
                <div className="mt-2 text-text">{c.name}</div>
                <div className="text-xs text-text-muted">{c.note}</div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="mt-6 max-h-[50vh] overflow-y-auto flex flex-wrap gap-4">
              {items.map((entry) => (
                <ItemSelect
                  key={entry.type}
                  width={BODEGA_THUMB_PX}
                  height={BODEGA_THUMB_PX}
                  selected={picked === entry.type}
                  onClick={() => setPicked(picked === entry.type ? null : entry.type)}
                  title={entry.label}
                  deps={[entry.type, entry.sprite]}
                  draw={drawEntry(entry)}
                />
              ))}
            </div>
            <div className="mt-6 flex items-center gap-10 min-h-[40px]">
              {pickedEntry ? (
                <>
                  <span className="text-text">
                    {pickedEntry.label}
                    <span className="text-text-muted">
                      {' '}
                      · {pickedEntry.footprintW}×{pickedEntry.footprintH}
                    </span>
                  </span>
                  <Button variant="accent" onClick={() => bodegaStore.takeOut(pickedEntry.type)}>
                    Sacar
                  </Button>
                </>
              ) : (
                <span className="text-sm text-text-muted">Escoge un mueble.</span>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
