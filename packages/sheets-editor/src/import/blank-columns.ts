import type { Dynamic } from '../dynamic.ts';
import { dataLineNumbers, importTextAt } from './column-readings.ts';
export function blankColumnsOf(file?: Dynamic, plan?: Dynamic) {
  let { headerLine: headerLine, linesLeftOut: linesLeftOut } = plan;
  let byLines = blankColumnsCache.get(file) ?? new (Map as Dynamic)();
  let key = `${headerLine} ${linesLeftOut.join()}`;
  let cached = byLines.get(key);
  if (cached !== undefined) return cached;
  let blankColumns = new (Set as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      {
        length: file.columnCount,
      },
      (input?: Dynamic, index?: Dynamic) => index,
    ),
  );
  for (let value of [...(headerLine === null ? [] : [headerLine]), ...dataLineNumbers(file, plan)] as Dynamic) {
    if (blankColumns.size === 0) break;
    for (let value2 of blankColumns as Dynamic) if (!isBlankImportCell(importTextAt(file, value, value2))) blankColumns.delete(value2);
  }
  let result = [...blankColumns];
  for (let value of [...byLines.keys()].slice(0, Math.max(0, byLines.size + 1 - BLANK_COLUMNS_CACHE_SIZE)) as Dynamic) byLines.delete(value);
  blankColumnsCache.set(file, byLines.set(key, result));
  return result;
}
export const isBlankImportCell = (text?: Dynamic) => text.trim() === '';
export const blankColumnsCache = new (WeakMap as Dynamic)();
export const BLANK_COLUMNS_CACHE_SIZE = 4;
