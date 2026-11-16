/**
 * The shelf's pixel art, made a few at a time and kept small: a cache of finished results with a cap (the least
 * recently used go first), a queue that runs at most `concurrency` jobs at once, and the waits before trying again
 * a cover that could not be fetched. No DOM: the job that makes each result is given (tested in Node).
 */

/** What a job ends with: the result, null (the image is unusable: never tried again), or undefined (try later). */
export type JobResult<T> = T | null | undefined;

export interface PixelCacheOptions {
  /** Most results kept. */
  max: number;
  /** Most jobs running at once. */
  concurrency: number;
  /** Runs between jobs, so the page breathes (a timer in the page; nothing in tests). */
  yieldTo?: () => Promise<void>;
}

export class PixelCache<T> {
  private readonly done = new Map<string, T | null>();
  private readonly pending = new Map<string, Promise<JobResult<T>>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private readonly opts: PixelCacheOptions;

  constructor(opts: PixelCacheOptions) {
    this.opts = opts;
  }

  /** The finished result (null: unusable), or undefined while it is not made. */
  peek(key: string): T | null | undefined {
    if (!this.done.has(key)) return undefined;
    const v = this.done.get(key) as T | null;
    // Used again: it goes to the back of the line to be dropped
    this.done.delete(key);
    this.done.set(key, v);
    return v;
  }

  /** The result of `key`, made by `job` when its turn comes (one job per key at a time). */
  request(key: string, job: () => Promise<JobResult<T>>): Promise<JobResult<T>> {
    const ready = this.peek(key);
    if (ready !== undefined) return Promise.resolve(ready);
    const waiting = this.pending.get(key);
    if (waiting) return waiting;
    const p = new Promise<JobResult<T>>((resolve) => {
      this.queue.push(() => {
        this.running++;
        void (async () => {
          let out: JobResult<T>;
          try {
            if (this.opts.yieldTo) await this.opts.yieldTo();
            out = await job();
          } catch {
            out = undefined;
          }
          this.running--;
          this.pending.delete(key);
          if (out !== undefined) this.keep(key, out);
          resolve(out);
          this.next();
        })();
      });
    });
    this.pending.set(key, p);
    this.next();
    return p;
  }

  /** Forgets the results (and stops waiting for the jobs not started) whose key matches. */
  forget(match: (key: string) => boolean): void {
    for (const k of [...this.done.keys()]) if (match(k)) this.done.delete(k);
  }

  /** How many results are kept (for tests). */
  get size(): number {
    return this.done.size;
  }

  /** How many jobs run right now (for tests). */
  get active(): number {
    return this.running;
  }

  private keep(key: string, value: T | null): void {
    this.done.delete(key);
    this.done.set(key, value);
    while (this.done.size > this.opts.max) {
      const oldest = this.done.keys().next().value as string;
      this.done.delete(oldest);
    }
  }

  private next(): void {
    while (this.running < this.opts.concurrency && this.queue.length > 0) this.queue.shift()?.();
  }
}

/** Waits (ms) before trying again a cover that could not be fetched: a few times, further apart, then never. */
export const RETRY_WAITS_MS: readonly number[] = [3_000, 15_000, 60_000];

/** The wait before try number `attempt` (0 = the first retry), or null when it is time to give up. */
export const retryWait = (attempt: number): number | null => RETRY_WAITS_MS[attempt] ?? null;

/**
 * The size a cover is drawn at before it is pixelated: never larger than `maxSide` on its longest side (a huge
 * image is drawn already reduced), never enlarged.
 */
export function drawSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}
