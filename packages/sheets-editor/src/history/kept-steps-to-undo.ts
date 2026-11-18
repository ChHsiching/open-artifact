import type { Dynamic } from '../dynamic.ts';
export function hasStoredStepsToUndo(getStorage?: Dynamic) {
  try {
    return getStorage().getItem(STEPS_TO_UNDO_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
export function keepStepsToUndoFlag(getStorage?: Dynamic, store?: Dynamic) {
  return store.subscribe(() => {
    let hasStepsToUndo = store.getView().hasStepsToUndoForNextPageToKnowOf;
    if (hasStepsToUndo === hasStoredStepsToUndo(getStorage)) return;
    try {
      if (hasStepsToUndo) getStorage().setItem(STEPS_TO_UNDO_STORAGE_KEY, '1');
      else getStorage().removeItem(STEPS_TO_UNDO_STORAGE_KEY);
    } catch {}
  });
}
export const STEPS_TO_UNDO_STORAGE_KEY = 'sheets-steps-to-undo';
