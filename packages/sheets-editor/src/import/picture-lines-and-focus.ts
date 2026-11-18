import type { Dynamic } from '../dynamic.ts';
import { importRecordCount } from './bring-in.ts';
export function focusIfStillWanted(target?: Dynamic, isStillWanted?: Dynamic, focus?: Dynamic) {
  if (!isStillWanted()) return false;
  if (target !== null) focus(target);
  return true;
}
export function pendingFocusTarget(preferred?: Dynamic, fallback?: Dynamic, isKeyboardAway?: Dynamic, focus?: Dynamic) {
  if (fallback === null) return false;
  let target = preferred?.isConnected === true ? preferred : fallback;
  if (!isKeyboardAway()) return target;
  focus(target);
  return false;
}
export const importPictureLineCount = (open?: Dynamic, rowsShown?: Dynamic, linesUnfolded?: Dynamic) =>
  1 + Math.min(importRecordCount(open), rowsShown) + linesUnfolded;
export const fileLineOfRowNumber = (headerLine?: Dynamic, linesOfFirstRows?: Dynamic, rowNumber?: Dynamic) =>
  rowNumber === 1 ? headerLine : (linesOfFirstRows[rowNumber - 2] ?? null);
