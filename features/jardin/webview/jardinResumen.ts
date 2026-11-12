import type {
  JardinStatus,
  JardinSupply,
  JardinSupplyCategory,
} from '../../../core/src/messages.js';
import { SUPPLY_LABEL, SUPPLY_ORDER } from './constants.js';
import { todayCares } from './jardinText.js';

// ── Supplies ──

/** How a supply looks in the list: gone (none left), short (under its minimum) or nothing to say. */
export type SupplyMark = 'acabado' | 'falta' | null;

export function supplyMark(s: Pick<JardinSupply, 'quantity' | 'min'>): SupplyMark {
  if (s.quantity <= 0) return 'acabado';
  if (s.quantity < s.min) return 'falta';
  return null;
}

/** The mark's words in the list. */
export const SUPPLY_MARK_TEXT: Record<'acabado' | 'falta', string> = {
  acabado: 'se acabó',
  falta: 'falta',
};

/** The minimum is only worth showing when there is one. */
export const supplyMinText = (s: Pick<JardinSupply, 'min'>): string | null =>
  s.min > 0 ? `mínimo ${s.min}` : null;

export interface SupplyGroup {
  category: JardinSupplyCategory;
  label: string;
  supplies: JardinSupply[];
}

/** The supplies by category (in the usual order), each one sorted by name; empty categories are left out. */
export function groupSupplies(supplies: readonly JardinSupply[]): SupplyGroup[] {
  return SUPPLY_ORDER.map((category) => ({
    category,
    label: SUPPLY_LABEL[category],
    supplies: supplies
      .filter((s) => s.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
  })).filter((g) => g.supplies.length > 0);
}

// ── Today ──

export const HOY_SIN_CUIDADOS =
  'Todavía no hay cuidados programados. Para programarlos, edita una planta y elige cada cuánto se riega, abona, limpia o poda.';
export const HOY_SIN_PLANTAS =
  'Todavía no hay plantas ni cuidados programados. Agrega una planta y ponle sus cuidados.';
export const HOY_NADA = 'Nada pendiente hoy.';

export interface HoySummary {
  /** What to say when nothing is due today (null when there is something). */
  empty: string | null;
  /** True when no plant has any care yet: worth a way to the plants. */
  noCaresAtAll: boolean;
  /** "12 plantas sin cuidados programados", only when some plants have cares and others don't. */
  withoutCares: string | null;
}

export function hoySummary(status: Pick<JardinStatus, 'plants' | 'today'>): HoySummary {
  const total = status.plants.length;
  const bare = status.plants.filter((p) => p.cares.length === 0).length;
  const noCaresAtAll = bare === total;
  const empty =
    todayCares(status).length > 0
      ? null
      : total === 0
        ? HOY_SIN_PLANTAS
        : noCaresAtAll
          ? HOY_SIN_CUIDADOS
          : HOY_NADA;
  const withoutCares =
    bare > 0 && !noCaresAtAll
      ? `${bare} ${bare === 1 ? 'planta' : 'plantas'} sin cuidados programados`
      : null;
  return { empty, noCaresAtAll: total > 0 && noCaresAtAll, withoutCares };
}
