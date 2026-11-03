import { useSyncExternalStore } from 'react';

import { Button } from '../../../webview-ui/src/components/ui/Button.js';
import { ItemSelect } from '../../../webview-ui/src/components/ui/ItemSelect.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { getCatalogEntry } from '../../../webview-ui/src/office/layout/furnitureCatalog.js';
import { getCachedSprite } from '../../../webview-ui/src/office/sprites/spriteCache.js';
import { PLAYER_STYLES, PLAYER_THUMB_PX } from './constants.js';
import { musicStore } from './musicStore.js';

/**
 * The music player menu (features/musica): a click on the player shows its looks (turntable or one of the jukeboxes);
 * picking one swaps the piece in the layout (same footprint, same place), and a button shows / hides the music
 * column. `getType` reads the current type of that uid; `onPick` saves the change.
 */
export function JukeboxPicker({
  getType,
  onPick,
}: {
  getType: (uid: string) => string | undefined;
  onPick: (uid: string, type: string) => void;
}) {
  const { jukeboxPickerUid: uid, columnHidden } = useSyncExternalStore(
    musicStore.subscribe,
    musicStore.get,
  );
  if (!uid) return null;
  const current = getType(uid)?.split(':')[0];
  const styles = PLAYER_STYLES.filter((s) => getCatalogEntry(s.type));
  return (
    <Modal isOpen onClose={() => musicStore.closeJukeboxPicker()} title="Reproductor">
      <div className="px-10 pb-6">
        <p className="text-sm text-text-muted">Escoge cómo se ve. La música sale de aquí.</p>
        <div className="mt-4 flex gap-10">
          {styles.map((s) => {
            const entry = getCatalogEntry(s.type)!;
            return (
              <div key={s.type} className="flex flex-col items-center">
                <ItemSelect
                  width={PLAYER_THUMB_PX}
                  height={PLAYER_THUMB_PX}
                  selected={current === s.type}
                  title={s.label}
                  onClick={() => {
                    if (current !== s.type) onPick(uid, s.type);
                    musicStore.closeJukeboxPicker();
                  }}
                  deps={[s.type, entry.sprite]}
                  draw={(ctx, w, h) => {
                    const cached = getCachedSprite(entry.sprite, 2);
                    const scale = Math.min(w / cached.width, h / cached.height) * 0.9;
                    const dw = cached.width * scale;
                    const dh = cached.height * scale;
                    ctx.drawImage(cached, (w - dw) / 2, (h - dh) / 2, dw, dh);
                  }}
                />
                <div className="mt-2 text-sm text-text">{s.label}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <Button size="sm" onClick={() => musicStore.toggleColumn()}>
            {columnHidden ? 'Mostrar la columna de música' : 'Ocultar la columna de música'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
