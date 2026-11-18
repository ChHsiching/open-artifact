/**
 * Fill or Fit in the focused view. The last choice is kept as a preference:
 * every artboard opens in it, on later visits too. Until one is made, an
 * artboard marked `expand: "fill"` opens in Fill and others in Fit.
 */

const KEY = 'mc-focused/fit';

/** Whether an artboard shows in Fit: the kept choice, else what its `expand` says. */
export function focusedFit(preferred: boolean | null, expand: 'fill' | undefined): boolean {
  return preferred ?? expand !== 'fill';
}

/** The kept choice: true for Fit, false for Fill, null when none was made or storage is unavailable. */
export function storedFit(storage: () => Storage | undefined = () => globalThis.localStorage): boolean | null {
  try {
    const value = storage()?.getItem(KEY);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

/** Keeps the choice for later artboards and visits. */
export function storeFit(fit: boolean, storage: () => Storage | undefined = () => globalThis.localStorage): void {
  try {
    storage()?.setItem(KEY, fit ? '1' : '0');
  } catch {
    /* storage may be unavailable */
  }
}
