import { MAIN_OFFICE, type OfficeDef } from '../../core/src/offices.js';

/**
 * The offices this server knows (core/src/offices.ts): the main office plus the ones the private packs declare.
 * Filled once by cli.ts before the server starts; VS Code and tests that never fill it only have the main office.
 */
let offices: readonly OfficeDef[] = [];
let mainLabel: string | undefined;
let mainTitle: string | undefined;

export function setOffices(
  defs: readonly OfficeDef[],
  main: { label?: string; title?: string } = {},
): void {
  offices = defs;
  mainLabel = main.label;
  mainTitle = main.title;
}

export function getOffices(): readonly OfficeDef[] {
  return offices;
}

export function getMainOfficeNames(): { label?: string; title?: string } {
  return { label: mainLabel, title: mainTitle };
}

/** The office id when this server knows it (the main office always), else null. */
export function knownOffice(value: unknown): string | null {
  if (value === MAIN_OFFICE) return MAIN_OFFICE;
  return typeof value === 'string' && offices.some((o) => o.id === value) ? value : null;
}
