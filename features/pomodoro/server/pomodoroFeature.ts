import * as os from 'os';

import type { PomodoroBlock } from '../../../core/src/messages.js';
import { notifyDesktop } from '../../../server/src/notifyDesktop.js';
import type { FeatureClient, ServerFeature } from '../../../server/src/serverFeature.js';
import {
  LOG_PREFIX,
  NOTIFICATION_TITLE,
  POMODORO_BLOCK_MS,
  POMODORO_LATE_NOTIFY_MS,
} from './constants.js';
import type { PomodoroData } from './pomodoroData.js';
import {
  isBlock,
  localDay,
  readData,
  rollDay,
  suggested,
  toStatus,
  writeData,
} from './pomodoroData.js';

export interface PomodoroFeatureOptions {
  home?: string;
  now?: () => Date;
  notify?: (title: string, message: string) => void;
  /** Off in tests: they call tick() themselves. */
  timers?: boolean;
}

/** The same data with no block running or paused. */
function withoutBlock(data: PomodoroData): PomodoroData {
  const out: PomodoroData = { day: data.day, done: data.done, streak: data.streak };
  if (data.lastFinished) out.lastFinished = data.lastFinished;
  return out;
}

/** The Mac notification when a block ends. */
export function finishedText(block: PomodoroBlock, next: PomodoroBlock): string {
  if (block !== 'focus') return 'Se acabó el descanso: ¿otro pomodoro?';
  const minutes = POMODORO_BLOCK_MS[next === 'long' ? 'long' : 'short'] / 60_000;
  return `Terminó tu pomodoro: toma ${minutes} minutos${next === 'long' ? ' (te toca el descanso largo)' : ''}.`;
}

/**
 * The pomodoro of the roof garden (features/pomodoro): focus blocks and breaks timed by the server, so the end rings
 * (a Mac notification) with the page closed and survives a restart. It never starts the next block by itself.
 * Privileged connections only, like the rest of the roof.
 */
export function createPomodoroFeature(opts: PomodoroFeatureOptions = {}): ServerFeature & {
  /** Finish the running block if its time is up (the timer calls it; tests too). */
  tick(): void;
} {
  const home = opts.home ?? os.homedir();
  const now = opts.now ?? (() => new Date());
  const notify = opts.notify ?? notifyDesktop;
  const clients = new Set<FeatureClient>();
  let data: PomodoroData = readData(home, localDay(now()));
  let timer: NodeJS.Timeout | null = null;

  const fresh = (): void => {
    data = rollDay(data, localDay(now()));
  };

  function broadcast(): void {
    const msg = toStatus(data) as unknown as Record<string, unknown>;
    for (const c of clients) c.send(msg);
  }

  function save(): void {
    writeData(home, data);
    schedule();
    broadcast();
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (opts.timers === false || data.endsAt === undefined) return;
    // setTimeout tops out at ~24.8 days; a block is minutes long, the cap only guards odd files
    const wait = Math.min(Math.max(0, data.endsAt - now().getTime()), 60 * 60_000);
    timer = setTimeout(tick, wait + 50);
    timer.unref?.();
  }

  function tick(): void {
    const t = now().getTime();
    if (!data.block || data.endsAt === undefined || data.endsAt > t) {
      schedule();
      return;
    }
    const block = data.block;
    const late = t - data.endsAt;
    // The count belongs to the day the block ended
    data = rollDay(data, localDay(new Date(data.endsAt)));
    if (block === 'focus') data = { ...data, done: data.done + 1, streak: data.streak + 1 };
    else if (block === 'long') data = { ...data, streak: 0 };
    data = rollDay({ ...withoutBlock(data), lastFinished: block }, localDay(new Date(t)));
    if (late <= POMODORO_LATE_NOTIFY_MS)
      notify(NOTIFICATION_TITLE, finishedText(block, suggested(data)));
    console.log(`${LOG_PREFIX} Terminó: ${block} (${data.done} hoy).`);
    save();
  }

  function start(block: PomodoroBlock): void {
    fresh();
    data = { ...data, block, endsAt: now().getTime() + POMODORO_BLOCK_MS[block] };
    delete data.remainingMs;
    save();
  }

  function pause(): void {
    if (!data.block || data.endsAt === undefined) return;
    const remainingMs = Math.max(0, data.endsAt - now().getTime());
    data = { ...data, remainingMs };
    delete data.endsAt;
    save();
  }

  function resume(): void {
    if (!data.block || data.remainingMs === undefined) return;
    data = { ...data, endsAt: now().getTime() + data.remainingMs };
    delete data.remainingMs;
    save();
  }

  function stop(): void {
    if (!data.block) return;
    data = withoutBlock(data);
    save();
  }

  // A block that ended while the office was closed is finished now; one still running gets its timer back
  if (data.endsAt !== undefined) tick();

  return {
    name: 'pomodoro',
    connect(client) {
      if (!client.privileged) return () => {};
      clients.add(client);
      return () => clients.delete(client);
    },
    handleClientMessage(msg, client) {
      if (msg.type === 'webviewReady') {
        if (client.privileged) {
          fresh();
          client.send(toStatus(data) as unknown as Record<string, unknown>);
        }
        return false; // the core handler still runs
      }
      const mine = ['startPomodoro', 'pausePomodoro', 'resumePomodoro', 'stopPomodoro'];
      if (!mine.includes(String(msg.type))) return false;
      if (!client.privileged) {
        console.warn(`${LOG_PREFIX} Ignorando ${String(msg.type)} de un cliente sin token.`);
        return true;
      }
      if (msg.type === 'startPomodoro') {
        if (isBlock(msg.phase)) start(msg.phase);
      } else if (msg.type === 'pausePomodoro') pause();
      else if (msg.type === 'resumePomodoro') resume();
      else stop();
      return true;
    },
    dispose() {
      if (timer) clearTimeout(timer);
    },
    tick,
  };
}
