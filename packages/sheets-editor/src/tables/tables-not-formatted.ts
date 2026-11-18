import type { Dynamic } from '../dynamic.ts';
export function readTablesNotFormatted(storage: Dynamic = tablesNotFormattedStorage) {
  try {
    let stored = JSON.parse(storage().getItem('sheets-tables-not-formatted') ?? '[]');
    return Array.isArray(stored) ? stored.filter(isStoredTableCell).slice(-200) : null;
  } catch {
    return null;
  }
}
export function writeTablesNotFormatted(tables?: Dynamic, storage: Dynamic = tablesNotFormattedStorage) {
  try {
    storage().setItem('sheets-tables-not-formatted', JSON.stringify(tables.slice(-200)));
    return true;
  } catch {
    return false;
  }
}
export const tablesNotFormattedStorage = () => localStorage;
export const isStoredTableCell = (stored?: Dynamic) =>
  typeof stored === 'object' &&
  stored !== null &&
  'sheetId' in stored &&
  'rowId' in stored &&
  'columnId' in stored &&
  [stored.sheetId, stored.rowId, stored.columnId].every((part?: Dynamic) => typeof part === 'string');
