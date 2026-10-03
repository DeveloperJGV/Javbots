// Task zones (fork, Fase 3): which part of the office an activity belongs to.
//
// The server only tells us a status line ("Editing foo.ts", "Running: npm test").
// This module turns that line into a zone kind; the office decides where the
// zone actually is from the areas painted in the editor.

export const ZoneKind = {
  /** Editing code: desks with historic computers + a Matrix terminal. */
  CODE: 'code',
  /** Reading / searching: the Jedi archive. */
  LIBRARY: 'library',
  /** Running commands: the DeLorean workshop. */
  COMMANDS: 'commands',
  /** Internet: the radio telescope (Contact). */
  WEB: 'web',
  /** Running tests: the Aperture lab. */
  TESTS: 'tests',
  /** git commit / push: the Ring's pedestal. */
  COMMIT: 'commit',
  /** Waiting for the user's "yes": Senku with his revival formula. */
  PERMISSION: 'permission',
  /** Where interns (sub-agents) work. */
  INTERNS: 'interns',
  /** A tool just failed: the basement (The Binding of Isaac). */
  ERROR: 'error',
} as const;
export type ZoneKind = (typeof ZoneKind)[keyof typeof ZoneKind];

/** Every kind, in the order the editor lists them. */
export const ZONE_KINDS: readonly ZoneKind[] = [
  ZoneKind.CODE,
  ZoneKind.LIBRARY,
  ZoneKind.COMMANDS,
  ZoneKind.WEB,
  ZoneKind.TESTS,
  ZoneKind.COMMIT,
  ZoneKind.PERMISSION,
  ZoneKind.INTERNS,
  ZoneKind.ERROR,
];

export function isZoneKind(value: unknown): value is ZoneKind {
  return typeof value === 'string' && (ZONE_KINDS as readonly string[]).includes(value);
}

/** Display name of each zone in the editor. */
export const ZONE_LABELS: Record<ZoneKind, string> = {
  code: 'Código',
  library: 'Biblioteca',
  commands: 'Comandos',
  web: 'Internet',
  tests: 'Pruebas',
  commit: 'Commit',
  permission: 'Permiso',
  interns: 'Becarios',
  error: 'Error',
};

const BASH_PREFIX = 'Running: ';

const TEST_COMMAND =
  /^(?:npx\s+|pnpm\s+(?:exec\s+)?|yarn\s+|bunx?\s+)?(?:vitest|jest|mocha|pytest|phpunit|rspec|playwright\s+test)\b|^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|e2e)(?::\S*)?\b|^(?:cargo|go|dotnet|deno)\s+test\b|^python3?\s+-m\s+(?:pytest|unittest)\b/;

const COMMIT_COMMAND = /^git\s+(?:-\S+\s+(?:\S+\s+)?)*(?:commit|push)\b/;

/** Split a shell line into its commands (`a && b; c | d`), dropping `cd` hops
 *  and leading env assignments (`CI=1 npm test`). */
function commandsIn(line: string): string[] {
  return line
    .split(/&&|\|\||;|\|/)
    .map((part) => part.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, ''))
    .filter((part) => part.length > 0 && !/^cd\b/.test(part));
}

/** Zone for a shell command: commit beats tests, tests beat a plain command. */
export function zoneForCommand(command: string): ZoneKind {
  const commands = commandsIn(command);
  if (commands.some((c) => COMMIT_COMMAND.test(c))) return ZoneKind.COMMIT;
  if (commands.some((c) => TEST_COMMAND.test(c))) return ZoneKind.TESTS;
  return ZoneKind.COMMANDS;
}

/**
 * Zone for a tool status line, or null when the activity belongs at the
 * agent's own desk (spawning a subtask, planning, messaging, unknown tools).
 */
export function zoneForStatus(status: string): ZoneKind | null {
  if (status.startsWith(BASH_PREFIX)) return zoneForCommand(status.slice(BASH_PREFIX.length));
  if (/^(?:Editing|Writing)\b/.test(status)) return ZoneKind.CODE;
  if (/^(?:Reading|Searching (?:files|code))\b/.test(status)) return ZoneKind.LIBRARY;
  if (/^(?:Searching the web|Fetching web content)\b/.test(status)) return ZoneKind.WEB;
  // MCP tools reach outside the machine (browsers, mail, calendars…).
  if (/^Using mcp__/.test(status)) return ZoneKind.WEB;
  return null;
}
