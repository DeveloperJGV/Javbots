import { BOARD_MARK_COLORS, BOARD_MAX_NAMES } from '../../constants.js';
import type { AgentActivity, AgentTurnState } from './activityLog.js';

/** Spanish text for the activity panel. DOM-free so it can be tested on its own. */

const STATE_TEXT: Record<AgentTurnState, string> = {
  working: 'Trabajando',
  waiting: 'Terminó su turno',
  awaitingInput: 'Te está esperando',
  closed: 'Sesión cerrada',
};

/** "carrito.ts, menu.tsx y 3 más": the most recent names first. */
export function listNames(names: readonly string[], max = BOARD_MAX_NAMES): string {
  const recent = [...names].reverse();
  const shown = recent.slice(0, max);
  const rest = recent.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} y ${rest} más` : shown.join(', ');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function times(n: number): string {
  return plural(n, 'vez', 'veces');
}

/** The lines the panel shows for one agent, only for what it actually did. */
export function activityLines(a: AgentActivity): string[] {
  const lines: string[] = [];
  if (a.edited.length > 0) {
    lines.push(`Editó ${plural(a.edited.length, 'archivo', 'archivos')}: ${listNames(a.edited)}`);
  }
  if (a.read.length > 0) {
    lines.push(`Leyó ${plural(a.read.length, 'archivo', 'archivos')}: ${listNames(a.read)}`);
  }
  if (a.searches > 0) lines.push(`Buscó en el código ${times(a.searches)}`);
  if (a.commandCount > 0) {
    lines.push(`Corrió ${plural(a.commandCount, 'comando', 'comandos')}: ${listNames(a.commands)}`);
  }
  if (a.testRuns > 0) lines.push(`Corrió pruebas ${times(a.testRuns)}`);
  if (a.commits > 0) lines.push(`Hizo ${plural(a.commits, 'commit', 'commits')}`);
  if (a.webVisits > 0) lines.push(`Buscó en internet ${times(a.webVisits)}`);
  if (a.subtasks > 0) {
    const done =
      a.subtasksDone > 0
        ? ` (${a.subtasksDone} ${a.subtasksDone === 1 ? 'terminó' : 'terminaron'})`
        : '';
    lines.push(`Mandó ${plural(a.subtasks, 'becario', 'becarios')}${done}`);
  }
  if (a.failures > 0) lines.push(plural(a.failures, 'falla', 'fallas'));
  return lines;
}

export function stateText(state: AgentTurnState): string {
  return STATE_TEXT[state];
}

/** "hace un momento", "hace 5 min", "hace 2 h". */
export function ago(fromMs: number, nowMs: number): string {
  const min = Math.floor((nowMs - fromMs) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/** "a las 20:41". */
export function clockText(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function markColor(a: AgentActivity): string {
  return BOARD_MARK_COLORS[a.slot % BOARD_MARK_COLORS.length];
}
