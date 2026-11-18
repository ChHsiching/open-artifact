import type { AdaptiveLimiter, BusyRetryResult, LimiterOutcome, PollClock } from './connector-types.ts';
import { QUERY_TIME_BUDGET_MS } from './model.ts';

/** After a busy answer the limiter pauses this long (times 1–2). */
export const BUSY_PAUSE_MS = 2000;
/** For this long after a busy answer the limiter stays under the size it had then. */
export const CEILING_MEMORY_MS = 60000;
/** A busy query waits this long (times 1–2) before its one retry. */
export const BUSY_RETRY_DELAY_MS = 6000;
export const POLL_FIRST_INTERVAL_MS = 2000;
export const POLL_MAX_INTERVAL_MS = 20000;

/** The real clock: `performance.now()`, `setTimeout` and `Math.random()`. */
export const SYSTEM_CLOCK: PollClock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

function jitter(clock: PollClock, ms: number): number {
  return ms * (1 + clock.random());
}

/**
 * A per-connector concurrency limiter that adapts: it grows by about one slot per successful round,
 * halves on a busy answer (then pauses ~2–4 s), and for a minute after a busy answer stays under
 * the size it had then. Waiters run in arrival order; a busy query trying again queues first,
 * and `enter` lets a tool's first call in at once.
 */
export function createAdaptiveLimiter(start: number, ceiling: number = start, clock: PollClock = SYSTEM_CLOCK): AdaptiveLimiter {
  let size = start;
  let busyCeiling = ceiling;
  let lastBusyAt = -Infinity;
  let active = 0;
  let paused = false;
  let generation = 0;
  const queue: (() => void)[] = [];
  const limit = (): number => (clock.now() - lastBusyAt < CEILING_MEMORY_MS ? Math.min(ceiling, busyCeiling) : ceiling);
  const hasRoom = (): boolean => !paused && active < Math.max(1, Math.floor(size));
  const admit = (): void => {
    while (queue.length > 0 && hasRoom()) {
      active++;
      queue.shift()?.();
    }
  };
  return {
    get idle(): boolean {
      return active === 0 && queue.length === 0;
    },
    enter(): Promise<void> {
      active++;
      return Promise.resolve();
    },
    acquire(front = false): Promise<void> {
      if (queue.length === 0 && hasRoom()) {
        active++;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        if (front) queue.unshift(resolve);
        else queue.push(resolve);
        admit();
      });
    },
    release(outcome: LimiterOutcome): void {
      active--;
      if (outcome === 'busy') {
        if (!paused) {
          busyCeiling = Math.max(2, Math.floor(size) - 1);
          size = Math.max(1, size / 2);
        }
        lastBusyAt = clock.now();
        paused = true;
        const current = ++generation;
        void clock.sleep(jitter(clock, BUSY_PAUSE_MS)).then(() => {
          if (current !== generation) return;
          paused = false;
          admit();
        });
      } else if (outcome === 'ok')
        size = Math.min(limit(), size + (lastBusyAt === -Infinity ? 1 : 1 / Math.max(1, Math.floor(size))));
      admit();
    },
  };
}

/**
 * Runs `run` (holding a slot of `limiter`); if its answer is busy and not stale, gives the slot back,
 * waits ~6–12 s, takes a slot at the front of the queue and runs it once more. The outcome is "busy"
 * when the last answer was busy, so the caller's release backs the limiter off.
 */
export async function retryWhileBusy<T>(
  run: () => Promise<T>,
  isBusy: (result: T) => boolean,
  isStale: () => boolean,
  limiter: AdaptiveLimiter,
  clock: PollClock = SYSTEM_CLOCK,
): Promise<BusyRetryResult<T>> {
  let result = await run();
  if (isBusy(result) && !isStale()) {
    limiter.release('busy');
    await clock.sleep(jitter(clock, BUSY_RETRY_DELAY_MS));
    await limiter.acquire(true);
    if (isStale()) return { result, outcome: 'other' };
    result = await run();
  }
  return { result, outcome: isBusy(result) ? 'busy' : 'other' };
}

/**
 * A gate a reader awaits before each poll of a running query: it waits 2 s, then twice as long each time
 * (at most 20 s), and answers `false` once the load is stale or the query's time budget is spent.
 */
export function createQueryPollGate(
  isStale: () => boolean,
  clock: PollClock = SYSTEM_CLOCK,
  budgetMs: number = QUERY_TIME_BUDGET_MS,
): () => Promise<boolean> {
  const deadline = clock.now() + budgetMs;
  const shouldStop = (): boolean => isStale() || clock.now() > deadline;
  let interval = 0;
  let previous = 0;
  return async () => {
    const wait = interval - (clock.now() - previous);
    if (!shouldStop() && wait > 0) await clock.sleep(wait);
    if (shouldStop()) return false;
    interval = interval === 0 ? POLL_FIRST_INTERVAL_MS : Math.min(interval * 2, POLL_MAX_INTERVAL_MS);
    previous = clock.now();
    return true;
  };
}
