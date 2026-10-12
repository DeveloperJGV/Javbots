import { BOARD_MARK_COLORS, BOARD_MARK_MAX_LEN, BOARD_MARK_ROWS } from '../../constants.js';
import { zoneForCommand, ZoneKind } from '../zones/taskZones.js';

/**
 * What each agent did since the page was opened, for the activity board (the
 * hallway whiteboard and its panel). Fed from the same server messages the
 * office already reacts to; nothing is persisted, so a reload starts it over.
 * DOM-free so it can be tested on its own.
 */

/** Where an agent is in its turn, as the board shows it. */
export type AgentTurnState = 'working' | 'waiting' | 'awaitingInput' | 'closed';

export interface AgentActivity {
  id: number;
  name: string;
  /** Marker color slot on the board, fixed by the order agents first did something. */
  slot: number;
  /** Distinct file names, most recent last. */
  edited: string[];
  read: string[];
  /** Commands as the status shows them (already shortened by the server), most recent last. */
  commands: string[];
  commandCount: number;
  searches: number;
  commits: number;
  testRuns: number;
  webVisits: number;
  subtasks: number;
  subtasksDone: number;
  failures: number;
  /** Every tool start counted for this agent (its own and its interns'). */
  tools: number;
  state: AgentTurnState;
  /** ms timestamps. */
  firstAt: number;
  lastAt: number;
}

/** A marker line on the board: the agent's color and how long its line is. */
export interface BoardMark {
  color: string;
  length: number;
}

const EDIT = /^(?:Editing|Writing) (.+)$/;
const READ = /^Reading (.+)$/;
const SEARCH = /^Searching (?:files|code)\b/;
const RUN = /^Running: (.+)$/;
const WEB = /^(?:Searching the web|Fetching web content|Using mcp__)/;
const SUBTASK = /^Subtask:/;
const GIT_COMMIT = /\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*commit\b/;

function remember(list: string[], item: string): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
  list.push(item);
}

/** Board line length for a tool count: grows fast at first, then slower, never past the board. */
export function markLength(tools: number): number {
  if (tools <= 0) return 0;
  return Math.min(BOARD_MARK_MAX_LEN, 2 + Math.round(Math.log2(tools) * 3));
}

export class ActivityLog {
  readonly startedAt: number;
  private agents = new Map<number, AgentActivity>();
  /** Tool ids already counted: the same tool can arrive from hooks and from the transcript. */
  private seenTools = new Set<string>();
  private failedTools = new Set<string>();
  private nextSlot = 0;
  private listeners = new Set<() => void>();
  /** Bumped on every change; React reads it through subscribe(). */
  version = 0;

  constructor(now = Date.now()) {
    this.startedAt = now;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  private agent(id: number, name: string, now: number): AgentActivity {
    let a = this.agents.get(id);
    if (!a) {
      a = {
        id,
        name,
        slot: this.nextSlot++,
        edited: [],
        read: [],
        commands: [],
        commandCount: 0,
        searches: 0,
        commits: 0,
        testRuns: 0,
        webVisits: 0,
        subtasks: 0,
        subtasksDone: 0,
        failures: 0,
        tools: 0,
        state: 'working',
        firstAt: now,
        lastAt: now,
      };
      this.agents.set(id, a);
    }
    if (name) a.name = name;
    return a;
  }

  /** A tool started (the agent's own, or one of its interns' — counted for the agent). */
  toolStart(id: number, name: string, toolId: string, status: string, now = Date.now()): void {
    if (this.seenTools.has(toolId)) return;
    this.seenTools.add(toolId);
    const a = this.agent(id, name, now);
    a.tools++;
    a.lastAt = now;
    a.state = 'working';
    let m: RegExpExecArray | null;
    if ((m = EDIT.exec(status))) {
      remember(a.edited, m[1]);
    } else if ((m = READ.exec(status))) {
      remember(a.read, m[1]);
    } else if (SEARCH.test(status)) {
      a.searches++;
    } else if ((m = RUN.exec(status))) {
      const command = m[1].trim();
      a.commandCount++;
      remember(a.commands, command);
      const zone = zoneForCommand(command);
      if (zone === ZoneKind.COMMIT && GIT_COMMIT.test(command)) a.commits++;
      if (zone === ZoneKind.TESTS) a.testRuns++;
    } else if (WEB.test(status)) {
      a.webVisits++;
    } else if (SUBTASK.test(status)) {
      a.subtasks++;
    }
    this.changed();
  }

  /** A tool finished; only failures are counted (once per tool). */
  toolDone(id: number, toolId: string, failed: boolean, now = Date.now()): void {
    const a = this.agents.get(id);
    if (!a || !failed || this.failedTools.has(toolId)) return;
    this.failedTools.add(toolId);
    a.failures++;
    a.lastAt = now;
    this.changed();
  }

  /** One of the agent's interns finished its task. */
  subtaskDone(id: number, now = Date.now()): void {
    const a = this.agents.get(id);
    if (!a) return;
    a.subtasksDone = Math.min(a.subtasks, a.subtasksDone + 1);
    a.lastAt = now;
    this.changed();
  }

  /** The agent's status changed: working, finished its turn, or waiting for an answer. */
  setStatus(id: number, status: string, awaitingInput: boolean): void {
    const a = this.agents.get(id);
    if (!a) return;
    const state: AgentTurnState =
      status === 'waiting' ? (awaitingInput ? 'awaitingInput' : 'waiting') : 'working';
    if (a.state === state) return;
    a.state = state;
    this.changed();
  }

  /** The session closed: its record stays on the board, marked as closed. */
  close(id: number): void {
    const a = this.agents.get(id);
    if (!a || a.state === 'closed') return;
    a.state = 'closed';
    this.changed();
  }

  /** Every agent that did something, most recently active first. */
  summaries(): AgentActivity[] {
    return [...this.agents.values()].sort((x, y) => y.lastAt - x.lastAt);
  }

  /** Marker lines for the board: the most recently active agents, one per row. */
  marks(): BoardMark[] {
    return this.summaries()
      .slice(0, BOARD_MARK_ROWS.length)
      .map((a) => ({
        color: BOARD_MARK_COLORS[a.slot % BOARD_MARK_COLORS.length],
        length: markLength(a.tools),
      }));
  }
}
