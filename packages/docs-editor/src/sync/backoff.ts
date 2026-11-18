/**
 * How long to wait before trying the server again: `min(base × 2ⁿ, cap)` for the n-th failure in a row (n from 0),
 * with random jitter so pages cut off together don't all come back at the same moment. The wait is somewhere between
 * half and all of that.
 */
export const BACKOFF_BASE_MS = 250;
export const BACKOFF_CAP_MS = 30_000;

export function backoffDelay(failures: number, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS, random: () => number = Math.random): number {
  const n = Math.max(0, Math.floor(failures));
  // 2ⁿ overflows to Infinity long before it matters; the cap keeps the wait finite.
  const ceiling = Math.min(base * 2 ** n, cap);
  const share = Math.min(Math.max(random(), 0), 1);
  return Math.round(ceiling / 2 + (ceiling / 2) * share);
}

/** A run of tries: each failure waits longer, a success starts over. */
export class Backoff {
  private failures = 0;
  private readonly base: number;
  private readonly cap: number;
  private readonly random: () => number;

  constructor(base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS, random: () => number = Math.random) {
    this.base = base;
    this.cap = cap;
    this.random = random;
  }

  /** Failures in a row so far. */
  get count(): number {
    return this.failures;
  }

  /** One more failure: answers how long to wait before the next try. */
  fail(): number {
    return backoffDelay(this.failures++, this.base, this.cap, this.random);
  }

  succeed(): void {
    this.failures = 0;
  }
}
