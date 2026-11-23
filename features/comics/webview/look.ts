import { fold } from '../../coleccion/core/shelves.js';
import { type Cloth, CLOTHS } from '../../libros/webview/constants.js';
import { accentOf, hashOf } from '../../libros/webview/spine.js';
import { missingNumbers, ownedNumbers } from '../core/series.js';
import { runSlots } from '../core/shelves.js';
import type { Series } from '../core/types.js';
import { KIND_ACCENTS, VOLUME_SPINE } from './constants.js';

/** How every volume of a series stands: same color (a run looks like a run), width by format, height by kind. */
export interface VolumeLook extends Cloth {
  w: number;
  h: number;
  grapa: boolean;
}

export function volumeLook(s: Pick<Series, 'id' | 'title' | 'format' | 'kind'>): VolumeLook {
  const cloth = CLOTHS[hashOf(`${s.title}|${s.id}`) % CLOTHS.length];
  const w =
    s.format === 'grapa'
      ? VOLUME_SPINE.grapaW
      : s.format === 'integral'
        ? VOLUME_SPINE.integralW
        : s.format === 'lujo'
          ? VOLUME_SPINE.lujoW
          : VOLUME_SPINE.tomoW;
  const h =
    s.format === 'lujo' || s.format === 'integral' || s.kind === 'novela-grafica'
      ? VOLUME_SPINE.bigH
      : s.kind === 'manga'
        ? VOLUME_SPINE.mangaH
        : VOLUME_SPINE.comicH;
  return { ...cloth, w, h, grapa: s.format === 'grapa' };
}

/** A shelf's color: the kinds have theirs, the rest one by name (as the library's genres). */
export const comicAccent = (name: string): string => KIND_ACCENTS[fold(name)] ?? accentOf(name);

/** «12 de 27 · faltan 4» / «3 tomos» / «completa». */
export function countText(s: Series): string {
  const owned = ownedNumbers(s).length;
  const missing = missingNumbers(s).length;
  const of = s.totalVolumes ? ` de ${s.totalVolumes}` : '';
  const end = s.totalVolumes && !missing && s.finished ? ' · completa' : '';
  return `${owned}${of} ${owned === 1 && !of ? 'tomo' : of ? '' : 'tomos'}${missing ? ` · faltan ${missing}` : ''}${end}`
    .replace(/\s+/g, ' ')
    .trim();
}

export const peopleText = (s: Series): string => {
  const w = s.writers.join(', ');
  const a = s.artists.join(', ');
  if (w && a) return `Guion: ${w} · Dibujo: ${a}`;
  return w || a || 'Autor sin anotar';
};

/** Missing volumes in a row of at least this many become one wide gap («13–200»). */
const FOLD_GAPS = 4;

export type Slot =
  | { kind: 'vol'; number: number }
  | { kind: 'gap'; number: number }
  | { kind: 'gaps'; from: number; to: number };

/** A series' slots in order, long runs of missing ones folded into one. */
export function slotsOf(s: Series): Slot[] {
  const out: Slot[] = [];
  const raw = runSlots(s);
  for (let i = 0; i < raw.length;) {
    if (raw[i].owned) {
      out.push({ kind: 'vol', number: raw[i].number });
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < raw.length && !raw[j + 1].owned && raw[j + 1].number === raw[j].number + 1) j++;
    if (j - i + 1 >= FOLD_GAPS) out.push({ kind: 'gaps', from: raw[i].number, to: raw[j].number });
    else for (let k = i; k <= j; k++) out.push({ kind: 'gap', number: raw[k].number });
    i = j + 1;
  }
  return out;
}
