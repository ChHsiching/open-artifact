/**
 * How many edits this viewer made in this tab, told to the agent with the
 * view context (`edits`). Edits less than {@link EDIT_COUNT_COALESCE_MS}
 * apart count once; the count survives reloads of the tab (session
 * storage).
 */

/** Edits closer together than this count as one. */
export const EDIT_COUNT_COALESCE_MS = 500;
const MAX_EDIT_COUNT = 999_999_999;
const STORED_EDIT_COUNT_PATTERN = /^([0-9]{1,9})(?:\/[0-9]{1,9})?$/;

let count: number | undefined;
let lastEditAt = Number.NEGATIVE_INFINITY;
const listeners = new Set<(count: number) => void>();

function storageKey(): string | null {
  return typeof location === 'undefined' ? null : `data-edits:${location.pathname}`;
}

function readStoredCount(): number {
  try {
    const key = storageKey();
    const match = STORED_EDIT_COUNT_PATTERN.exec(key === null ? '' : (sessionStorage.getItem(key) ?? ''));
    return match === null ? 0 : Number(match[1]);
  } catch {
    return 0;
  }
}

function writeStoredCount(value: number): void {
  try {
    const key = storageKey();
    if (key !== null) sessionStorage.setItem(key, String(value));
  } catch {
    // No session storage: the count lasts until the tab reloads.
  }
}

/** Edits counted so far. */
export function getEditCount(): number {
  count ??= readStoredCount();
  return count;
}

/** Counts one edit (or none, when the last one was a moment ago). */
export function recordDocumentEdit(now: number = Date.now()): void {
  const coalesced = now - lastEditAt < EDIT_COUNT_COALESCE_MS;
  lastEditAt = now;
  if (coalesced) return;
  const next = Math.min(getEditCount() + 1, MAX_EDIT_COUNT);
  if (next === count) return;
  count = next;
  writeStoredCount(next);
  for (const listener of [...listeners]) listener(next);
}

/** Listens to the count; returns an unsubscribe function. */
export function subscribeEditCount(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
