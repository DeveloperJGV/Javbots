import type { OfertasStatus } from '../../../core/src/messages.js';
import { getCatalogEntry } from '../../../webview-ui/src/office/layout/furnitureCatalog.js';
import type { FurnitureInstance, SpriteData } from '../../../webview-ui/src/office/types.js';
import { OFERTAS_KIOSK_ON_TYPE, OFERTAS_KIOSK_TYPE } from './constants.js';

const baseType = (type: string | undefined) => (type ?? '').split(':')[0];

/** Whether there is an alert the person has not seen yet. */
export const hasUnseenAlerts = (status: OfertasStatus | undefined): boolean =>
  status?.alerts.some((a) => !a.seen) ?? false;

/**
 * The kiosk lights up while there are unseen alerts: the stored (off) piece is drawn with the lit sprite, the layout
 * keeps the off one. If the catalog has no lit sprite yet, the piece stays as drawn.
 */
export function applyOfertasFurniture(
  instances: FurnitureInstance[],
  status: OfertasStatus | undefined,
  litSprite: () => SpriteData | undefined = () => getCatalogEntry(OFERTAS_KIOSK_ON_TYPE)?.sprite,
): FurnitureInstance[] {
  if (!hasUnseenAlerts(status)) return instances;
  if (!instances.some((f) => baseType(f.type) === OFERTAS_KIOSK_TYPE)) return instances;
  const lit = litSprite();
  if (!lit) return instances;
  return instances.map((f) =>
    baseType(f.type) === OFERTAS_KIOSK_TYPE ? { ...f, sprite: lit } : f,
  );
}
