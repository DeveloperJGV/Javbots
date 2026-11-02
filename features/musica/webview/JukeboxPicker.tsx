import { useSyncExternalStore } from 'react';

import { ItemSelect } from '../../../webview-ui/src/components/ui/ItemSelect.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { getCatalogEntry } from '../../../webview-ui/src/office/layout/furnitureCatalog.js';
import { getCachedSprite } from '../../../webview-ui/src/office/sprites/spriteCache.js';
import { JUKEBOX_STYLES, JUKEBOX_THUMB_PX } from './constants.js';
import { musicStore } from './musicStore.js';

/**
 * The jukebox style menu (features/musica): a click on a jukebox shows its looks; picking one swaps the piece in the
 * layout (same footprint, same place). `getType` reads the current type of that uid; `onPick` saves the change.
 */
export function JukeboxPicker({
  getType,
  onPick,
}: {
  getType: (uid: string) => string | undefined;
  onPick: (uid: string, type: string) => void;
}) {
  const { jukeboxPickerUid: uid } = useSyncExternalStore(musicStore.subscribe, musicStore.get);
  if (!uid) return null;
  const current = getType(uid)?.split(':')[0];
  const styles = JUKEBOX_STYLES.filter((s) => getCatalogEntry(s.type));
  return (
    <Modal isOpen onClose={() => musicStore.closeJukeboxPicker()} title="Rockola">
      <div className="px-10 pb-6">
        <p className="text-sm text-text-muted">Escoge cómo se ve.</p>
        <div className="mt-4 flex gap-10">
          {styles.map((s) => {
            const entry = getCatalogEntry(s.type)!;
            return (
              <div key={s.type} className="flex flex-col items-center">
                <ItemSelect
                  width={JUKEBOX_THUMB_PX}
                  height={JUKEBOX_THUMB_PX}
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
      </div>
    </Modal>
  );
}
