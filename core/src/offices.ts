/**
 * Offices: one server, several offices, each with its own layout and seats. The main office is always there (the
 * one Pixel Agents always had: layout.json, plain seat keys); a private pack (privado/<pack>/pack.json) can add
 * more. The page picks the office it shows (webviewReady.office) and draws only the agents that sit there, by the
 * Claude Code profile their session runs under (agentCreated.profile).
 */

/** The office every page shows unless it asks for another one. */
export const MAIN_OFFICE = 'principal';

/** An extra office, as a pack declares it. */
export interface OfficeDef {
  /** Lowercase letters, digits and dashes (it names files under ~/.pixel-agents/). */
  id: string;
  label: string;
  /** Browser tab title while the page shows it (the label when absent). */
  title?: string;
  /** Claude Code profiles whose agents sit here (and not in the main office). */
  profiles: string[];
  /** Of those, the ones that ALSO sit in the main office. */
  alsoInMain?: string[];
  /** The profile that works here (its usage shows first). */
  mainProfile?: string;
  /** Its floors besides the ground floor (filled by the server from packs and features). */
  floors?: FloorDef[];
}

/**
 * Floors: every office (a building) has a ground floor, the layout it always had, where the agents live and sit.
 * Features and packs can add more floors: each one is a layout of its own, with no agent seats.
 */
export const GROUND_FLOOR = 'pb';

/** A floor besides the ground floor, as the page sees it. */
export interface FloorDef {
  /** Lowercase letters, digits and dashes (it names a layout file under ~/.pixel-agents/). */
  id: string;
  /** Where it sits in the building: 1, 2… above the ground floor (0), -1, -2… below it. Orders the elevator. */
  level: number;
  /** Short text on its elevator button (from the level when absent: "1", "2", "S", "S2"). */
  button?: string;
  label: string;
}

/** A floor a feature (ServerFeature.floors) or a pack (pack.json) declares. */
export interface FloorSpec extends FloorDef {
  /** The office (building) it belongs to; the main office when absent. */
  office?: string;
  /** Its starting layout, until someone saves it from the editor (an empty room when absent). */
  defaultLayout?: Record<string, unknown> | null;
}

/** A declared floor id is usable (and not the ground floor's). */
export function isValidFloorId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id) && id !== GROUND_FLOOR;
}

/** A declared floor level is usable: a whole number other than the ground floor's 0. */
export function isValidFloorLevel(level: unknown): level is number {
  return (
    typeof level === 'number' && Number.isInteger(level) && level !== 0 && Math.abs(level) <= 99
  );
}

/** The text on a floor's elevator button. */
export function floorButton(floor: Pick<FloorDef, 'level' | 'button'>): string {
  if (floor.button) return floor.button;
  if (floor.level > 0) return String(floor.level);
  return floor.level === -1 ? 'S' : `S${-floor.level}`;
}

/** Floors from the top of the building down (the order of an elevator panel). */
export function sortFloorsTopDown<T extends { level: number }>(floors: readonly T[]): T[] {
  return [...floors].sort((a, b) => b.level - a.level);
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A pack's office id is usable (and not the main office's). */
export function isValidOfficeId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id) && id !== MAIN_OFFICE;
}

/** The offices a profile's agents sit in: the ones that list it, plus the main office when none does (or it says so). */
export function officesForProfile(
  profile: string | undefined,
  offices: readonly OfficeDef[],
): string[] {
  if (profile === undefined) return [MAIN_OFFICE];
  const out: string[] = [];
  let main = true;
  for (const office of offices) {
    if (!office.profiles.includes(profile)) continue;
    out.push(office.id);
    if (!office.alsoInMain?.includes(profile)) main = false;
  }
  return main ? [MAIN_OFFICE, ...out] : out;
}

export function sitsInOffice(
  profile: string | undefined,
  office: string,
  offices: readonly OfficeDef[],
): boolean {
  return officesForProfile(profile, offices).includes(office);
}

/** The layout file of an office under ~/.pixel-agents/ (the main office keeps the original name). */
export function officeLayoutFileName(office: string): string {
  return office === MAIN_OFFICE ? 'layout.json' : `layout-${office}.json`;
}

/**
 * The layout file of one floor of an office: the ground floor keeps the office's file; any other floor adds
 * `~<floor>` to it (layout~agenda.json, layout-taller~agenda.json). `~` can't appear in an office or floor id.
 */
export function floorLayoutFileName(office: string, floor: string = GROUND_FLOOR): string {
  const base = officeLayoutFileName(office);
  return floor === GROUND_FLOOR ? base : base.replace(/\.json$/, `~${floor}.json`);
}

/** Seat keys: the main office keeps plain agent ids (as before offices existed), others prefix them with the office. */
export function officeSeatKey(office: string, agentId: string | number): string {
  return office === MAIN_OFFICE ? String(agentId) : `${office}:${agentId}`;
}

/** The agent id behind a seat key of this office, or null when the key belongs to another office. */
export function agentIdFromSeatKey(office: string, key: string): string | null {
  const colon = key.indexOf(':');
  if (office === MAIN_OFFICE) return colon === -1 ? key : null;
  return colon !== -1 && key.slice(0, colon) === office ? key.slice(colon + 1) : null;
}
