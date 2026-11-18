import type { Dynamic } from '../../dynamic.ts';
export function readStoredSidePaneWidth(minWidth?: Dynamic, maxWidth?: Dynamic, getStorage: Dynamic = getLocalStorage) {
  try {
    let storedWidth = Number(getStorage().getItem('sheets-side-pane-width') ?? Number.NaN);
    return storedWidth >= minWidth && storedWidth <= maxWidth ? storedWidth : null;
  } catch {
    return null;
  }
}
export function storeSidePaneWidth(width?: Dynamic, getStorage: Dynamic = getLocalStorage) {
  try {
    getStorage().setItem('sheets-side-pane-width', String(width));
  } catch {}
}
export const getLocalStorage = () => localStorage;
