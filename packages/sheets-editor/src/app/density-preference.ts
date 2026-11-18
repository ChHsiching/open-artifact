import type { Dynamic } from '../dynamic.ts';
import { DEFAULT_CELL_DENSITY } from '../grid/cell-metrics-values.ts';
export function readStoredDensity(getStorage: Dynamic = defaultDensityStorage) {
  try {
    let stored = getStorage().getItem(DENSITY_STORAGE_KEY);
    return stored === 'comfortable' || stored === 'compact' ? stored : DEFAULT_CELL_DENSITY;
  } catch {
    return DEFAULT_CELL_DENSITY;
  }
}
export function storeDensity(input?: Dynamic, options: Dynamic = defaultDensityStorage) {
  try {
    options().setItem(DENSITY_STORAGE_KEY, input);
  } catch {}
}
export const DENSITY_STORAGE_KEY = 'sheets-density';
export const defaultDensityStorage = () => localStorage;
