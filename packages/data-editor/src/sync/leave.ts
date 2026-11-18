/**
 * Holds that keep the Shell warning that leaving loses work (an upload
 * under way), besides unsent writes.
 */

let holds = 0;
const listeners = new Set<() => void>();

/** Holds in place now. */
export function leaveHolds(): number {
  return holds;
}

/** Listens to the hold count; returns an unsubscribe function. */
export function onLeaveHoldsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** Keeps the warning until the returned release is called. */
export function holdLeaveLosesWork(): () => void {
  holds += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    notify();
  };
}
