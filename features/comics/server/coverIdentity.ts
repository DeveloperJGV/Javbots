import { fold } from '../../coleccion/core/shelves.js';
import type { Series } from '../core/types.js';

/** Whether a save changed what the cover is searched by: the title or the first writer (case and accents aside). */
export function seriesCoverChanged(before: Series, after: Series): boolean {
  return (
    fold(before.title) !== fold(after.title) ||
    fold(before.writers[0] ?? '') !== fold(after.writers[0] ?? '')
  );
}
