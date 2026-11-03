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
