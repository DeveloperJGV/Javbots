export const LOG_PREFIX = '[Pomodoro]';

/** ~/.pixel-agents/pomodoro.json: the block that runs (or is paused) and today's count. */
export const POMODORO_STATE_FILE = 'pomodoro.json';

const MIN = 60_000;
/** Length of each block. */
export const POMODORO_BLOCK_MS = { focus: 25 * MIN, short: 5 * MIN, long: 15 * MIN } as const;
/** The long break is suggested after this many focus blocks. */
export const POMODORO_LONG_EVERY = 4;
/** A block that ended while the office was closed still notifies if it ended this recently. */
export const POMODORO_LATE_NOTIFY_MS = 5 * MIN;

export const NOTIFICATION_TITLE = 'Pomodoro';
