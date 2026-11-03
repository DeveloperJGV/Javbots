import {
  type FloorDef,
  type FloorSpec,
  GROUND_FLOOR,
  isValidFloorId,
  isValidFloorLevel,
  MAIN_OFFICE,
  type OfficeDef,
  sortFloorsTopDown,
} from '../../core/src/offices.js';

/**
 * The offices this server knows (core/src/offices.ts): the main office plus the ones the private packs declare,
 * and the floors packs and features add to them. Filled once by cli.ts before the server starts; VS Code and tests
 * that never fill it only have the main office with its ground floor.
 */
let offices: readonly OfficeDef[] = [];
let mainLabel: string | undefined;
let mainTitle: string | undefined;

interface FloorEntry extends FloorDef {
  defaultLayout: Record<string, unknown> | null;
}
/** Floors besides the ground floor, by office id. */
const floorsByOffice = new Map<string, FloorEntry[]>();

/** Sets the offices and forgets every floor added before (packs and features add theirs after this). */
export function setOffices(
  defs: readonly OfficeDef[],
  main: { label?: string; title?: string } = {},
): void {
  offices = defs;
  mainLabel = main.label;
  mainTitle = main.title;
  floorsByOffice.clear();
}

/** The offices, each with its floors (besides the ground floor), top floor first. */
export function getOffices(): readonly OfficeDef[] {
  return offices.map((o) => {
    const floors = getFloors(o.id);
    return floors.length ? { ...o, floors } : { ...o };
  });
}

export function getMainOfficeNames(): { label?: string; title?: string } {
  return { label: mainLabel, title: mainTitle };
}

/** The office id when this server knows it (the main office always), else null. */
export function knownOffice(value: unknown): string | null {
  if (value === MAIN_OFFICE) return MAIN_OFFICE;
  return typeof value === 'string' && offices.some((o) => o.id === value) ? value : null;
}

/**
 * Adds the floors a feature or a pack declares (`from` names it in the log). A floor is skipped, with a warning,
 * when its office doesn't exist, its id or level is invalid, or another floor of that office already took them.
 * Returns how many were added.
 */
export function addFloors(specs: readonly FloorSpec[], from: string): number {
  let added = 0;
  for (const spec of specs) {
    const office = spec.office ?? MAIN_OFFICE;
    const skip = (why: string): void =>
      console.warn(`[Pisos] ${from}: piso "${String(spec.id)}" ignorado (${why})`);
    if (knownOffice(office) === null) {
      skip(`no existe la oficina "${office}"`);
      continue;
    }
    if (!isValidFloorId(spec.id)) {
      skip('id inválido');
      continue;
    }
    if (!isValidFloorLevel(spec.level)) {
      skip('nivel inválido: un entero distinto de 0');
      continue;
    }
    const list = floorsByOffice.get(office) ?? [];
    if (list.some((f) => f.id === spec.id || f.level === spec.level)) {
      skip('otro piso ya tiene ese id o ese nivel');
      continue;
    }
    const entry: FloorEntry = {
      id: spec.id,
      level: spec.level,
      label: typeof spec.label === 'string' && spec.label ? spec.label.slice(0, 40) : spec.id,
      defaultLayout: spec.defaultLayout ?? null,
    };
    if (typeof spec.button === 'string' && spec.button) entry.button = spec.button.slice(0, 3);
    list.push(entry);
    floorsByOffice.set(office, list);
    added++;
  }
  return added;
}

/** An office's floors besides the ground floor, top floor first (no layouts: what the page gets). */
export function getFloors(office: string): FloorDef[] {
  return sortFloorsTopDown(floorsByOffice.get(office) ?? []).map(
    ({ defaultLayout: _layout, ...floor }) => floor,
  );
}

/** The floor id when this office has it, else the ground floor. */
export function knownFloor(office: string, value: unknown): string {
  return typeof value === 'string' && floorsByOffice.get(office)?.some((f) => f.id === value)
    ? value
    : GROUND_FLOOR;
}

/** The starting layout a floor (not the ground floor) was declared with. */
export function floorDefaultLayout(office: string, floor: string): Record<string, unknown> | null {
  return floorsByOffice.get(office)?.find((f) => f.id === floor)?.defaultLayout ?? null;
}
