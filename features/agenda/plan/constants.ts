// Fixed numbers of the day-plan engine (the ones a person tunes live in AgendaPlanPrefs).

/** Nothing is planned today before now + this (minutes). */
export const PLAN_LEAD_MINUTES = 5;
/** A block ending this close (minutes) before an event says it fits before it. */
export const PLAN_NEAR_EVENT_MINUTES = 60;
/** Days planned when the caller does not say (today included). */
export const PLAN_DEFAULT_DAYS = 7;
/** Most days the engine accepts to plan. */
export const PLAN_MAX_DAYS = 31;
/** A task with no due date and untouched this long (days) says how long it has waited. */
export const PLAN_WAITING_DAYS = 7;

/** A task's minutes are kept within these bounds and rounded up to the step. */
export const PLAN_MIN_TASK_MINUTES = 5;
export const PLAN_MAX_TASK_MINUTES = 480;
export const PLAN_MINUTES_STEP = 5;

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/** First words that make a task of the garden list part of the plant round. */
export const GARDEN_CARE_WORDS: readonly string[] = ['regar', 'abonar', 'limpiar', 'podar'];
export const PLAN_ROUND_TITLE = 'Ronda de plantas';
/** A plant round up to this many minutes over whole blocks still counts as those blocks. */
export const PLAN_ROUND_SLACK_MINUTES = 5;
/** The block that gathers small things. */
export const PLAN_QUICK_TITLE = 'Pendientes rápidos';
/** blockMinutes must be a multiple of this, within the bounds below. */
export const PLAN_BLOCK_STEP = 15;
export const PLAN_MIN_BLOCK_MINUTES = 15;
export const PLAN_MAX_BLOCK_MINUTES = 120;

// Bounds used when reading saved preferences.
export const PLAN_MAX_RULES = 40;
export const PLAN_MAX_RULE_WORD = 40;
export const PLAN_MAX_REST_RANGES = 10;
export const PLAN_MAX_GARDEN_LIST = 80;
export const PLAN_MAX_GARDEN_RULES = 20;
/** A garden care keeps its real minutes, within these bounds (no rounding to 5). */
export const PLAN_MIN_GARDEN_MINUTES = 1;
export const PLAN_MAX_GARDEN_MINUTES = 240;
export const PLAN_MAX_GARDEN_SETUP = 60;
