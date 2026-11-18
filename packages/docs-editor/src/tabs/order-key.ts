/**
 * Tab sort keys: base-62 strings compared as plain strings. A new key is the midpoint of its neighbours and never ends
 * in "0", so there is always room for another key before it.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0]!;
const MIDDLE = DIGITS[31]!;
const LAST = DIGITS[61]!;
const KEY = /^[0-9A-Za-z]{1,128}$/;

/** The key itself when it is one this page can place others next to, else null. */
export const usableKey = (key: string | undefined): string | null => (key !== undefined && KEY.test(key) ? key : null);

function digit(char: string): number {
  const at = DIGITS.indexOf(char);
  if (at < 0) throw new Error(`not a sort key digit: ${JSON.stringify(char)}`);
  return at;
}

function midpoint(low: string, high: string): string {
  let same = 0;
  while (same < low.length && same < high.length && low[same] === high[same]) same++;
  if (same > 0) return low.slice(0, same) + midpoint(low.slice(same), high.slice(same));
  const from = low.length ? digit(low[0]!) : 0;
  const to = high.length ? digit(high[0]!) : DIGITS.length;
  if (to - from > 1) return DIGITS[Math.floor((from + to) / 2)]!;
  return low.length ? low[0]! + midpoint(low.slice(1), '') : ZERO + midpoint('', high.slice(1));
}

const tidy = (key: string) => (key.endsWith(ZERO) ? key + MIDDLE : key);

/** A key that sorts after `before` and before `after` (null: no neighbour on that side). */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) throw new Error(`sort keys out of order: ${before} >= ${after}`);
  if (before === null && after === null) return MIDDLE;
  if (before === null) return tidy(midpoint('', after!));
  if (after === null) return before < LAST ? tidy(midpoint(before, LAST)) : before + MIDDLE;
  return tidy(midpoint(before, after));
}

/** A key after every one of `keys` (unusable keys are left out). */
export function keyAfterAll(keys: readonly (string | undefined)[]): string {
  let last: string | null = null;
  for (const key of keys) {
    const usable = usableKey(key);
    if (usable !== null && (last === null || usable > last)) last = usable;
  }
  return keyBetween(last, null);
}

/** `after` is a key there is room before when coming from `before`: not `before` followed only by zeros. */
const roomBefore = (before: string | null, after: string) => {
  const base = before ?? '';
  return !(after.startsWith(base) && /^0*$/.test(after.slice(base.length)));
};

/**
 * A key for a place in a sorted list of sibling keys: after the nearest usable key at or before `beforeIndex`, and
 * before the nearest usable key from `afterIndex` on that leaves room. Siblings with unusable keys are skipped.
 */
export function keyAmong(keys: readonly (string | undefined)[], beforeIndex: number, afterIndex: number): string {
  let before: string | null = null;
  for (let at = beforeIndex; at >= 0 && before === null; at--) before = usableKey(keys[at]);
  for (let at = afterIndex; at < keys.length; at++) {
    const after = usableKey(keys[at]);
    if (after === null) continue;
    if (before !== null && after < before) break;
    if (after !== before && roomBefore(before, after)) return keyBetween(before, after);
  }
  return keyBetween(before, null);
}
