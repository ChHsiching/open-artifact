import type { Dynamic } from '../../dynamic.ts';
import { cellValueOf, usersOfCell } from '../../model/cell-values.ts';
import { numberFormatOfCell } from '../../model/workbook.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function holdsOfCells(workbook: WorkbookReads, cellIds?: Dynamic) {
  let kinds = new (Set as Dynamic)();
  let spelled = new (Map as Dynamic)();
  let squeezed = new (Map as Dynamic)();
  let distinct = new (Set as Dynamic)();
  let byRow = new (Map as Dynamic)();
  let [filledCount, textCount, numberCount, sum]: Dynamic = [0, 0, 0, 0];
  let [lowest, highest]: Dynamic = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let [isEveryNumberWhole, isAnyFilledAndBlank]: Dynamic = [true, false];
  let isTooMany = cellIds.length > MOST_CELLS_LOOKED_AT;
  for (let cellId of (isTooMany ? [] : cellIds) as Dynamic) {
    let cell = workbook.cellOnShowIn(cellId);
    let value = cellValueOf(cell);
    if (value === null || (value.kind === 'text' && value.value.trim() === '')) {
      isAnyFilledAndBlank = true;
      continue;
    }
    if (value.kind === 'text' && !/[\p{L}\p{N}]/u.test(value.value)) isAnyFilledAndBlank = true;
    distinct.add(String(value.value).toLowerCase());
    filledCount += 1;
    byRow.set(cellId.rowId, value.kind === 'number' ? value.value : null);
    if (usersOfCell(cell).length > 1) kinds.add('severalPeople');
    if (value.kind === 'boolean') kinds.add('trueOrFalse');
    else if (value.kind === 'error') kinds.add('error');
    else if (value.kind === 'number') {
      kinds.add(HELD_KIND_OF_NUMBER_FORMAT[numberFormatOfCell(workbook, cellId).kind]);
      [numberCount, sum] = [numberCount + 1, sum + value.value];
      [lowest, highest] = [Math.min(lowest, value.value), Math.max(highest, value.value)];
      isEveryNumberWhole &&= Number.isInteger(value.value);
    } else {
      kinds.add('text');
      textCount += 1;
      if (NUMBER_LIKE_TEXT_PATTERN.test(value.value.trimStart())) kinds.add('numberAsText');
      let lowered = value.value.toLowerCase();
      let squeezedText = squeezeSpaces(lowered);
      squeezed.set(squeezedText, !squeezed.has(squeezedText) || squeezed.get(squeezedText) === lowered ? lowered : null);
      if (!spelled.has(lowered)) spelled.set(lowered, value.value);
    }
  }
  return {
    filledCount: isTooMany ? cellIds.length : filledCount,
    kinds: kinds,
    spelled: spelled,
    squeezed: squeezed,
    isTooMany: isTooMany,
    isAnyRepeated: isTooMany || distinct.size < filledCount,
    textCount: textCount,
    numberCount: numberCount,
    sum: sum,
    byRow: byRow,
    numbersLieIn: numberCount === 0 ? null : [lowest, highest],
    isEveryNumberWhole: isEveryNumberWhole,
    isAnyFilledAndBlank: isTooMany || isAnyFilledAndBlank,
  };
}
export function areAllNumbersIn(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  if (area.rowCount * area.columnCount > MOST_CELLS_CHECKED_FOR_NUMBERS) return false;
  let sheet = workbook.sheetAsItStands(sheetId) ?? {};
  let sheetCache: Dynamic = allNumbersCache.get(sheet);
  if (sheetCache === undefined) allNumbersCache.set(sheet, (sheetCache = new (Map as Dynamic)()));
  let areaKey = [area.topRowIndex, area.leftColumnIndex, area.rowCount, area.columnCount].join();
  let areAllNumbers: Dynamic = sheetCache.get(areaKey);
  if (areAllNumbers === undefined) {
    let cellIds = workbook.cellsOnShowIn(sheetId, area);
    let isNumberCell = (cellId?: Dynamic) => cellValueOf(workbook.cellOnShowIn(cellId))?.kind === 'number';
    sheetCache.set(areaKey, (areAllNumbers = cellIds.every(isNumberCell)));
  }
  return areAllNumbers;
}
export function holdsOfArea(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let sheet = workbook.sheetAsItStands(sheetId);
  if (sheet === null) return holdsOfCells(workbook, workbook.cellsOnShowIn(sheetId, area));
  let sheetCache: Dynamic = areaHoldsCache.get(sheet);
  if (sheetCache === undefined) areaHoldsCache.set(sheet, (sheetCache = new (Map as Dynamic)()));
  let holds: Dynamic = sheetCache.get(areaCacheKey(area));
  if (holds === undefined) sheetCache.set(areaCacheKey(area), (holds = holdsOfCells(workbook, workbook.cellsOnShowIn(sheetId, area))));
  return holds;
}
export function holdsOfEachColumn(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let columnAreas = Array.from<Dynamic, Dynamic>(
    {
      length: area.columnCount,
    },
    (input?: Dynamic, offset?: Dynamic) => ({
      ...area,
      leftColumnIndex: area.leftColumnIndex + offset,
      columnCount: 1,
    }),
  );
  let sheet = workbook.sheetAsItStands(sheetId);
  let sheetCache = sheet === null ? undefined : areaHoldsCache.get(sheet);
  if (sheet === null || columnAreas.every((columnArea?: Dynamic) => sheetCache?.has(areaCacheKey(columnArea)) === true))
    return columnAreas.map((columnArea?: Dynamic) => holdsOfArea(workbook, sheetId, columnArea));
  let cellsByColumn = columnAreas.map(() => []);
  for (let value of workbook.cellsOnShowIn(sheetId, area) as Dynamic)
    cellsByColumn[(workbook.positionOfCell(value)?.columnIndex ?? -1) - area.leftColumnIndex]?.push(value);
  let holdsByColumn = cellsByColumn.map((cellIds?: Dynamic) => holdsOfCells(workbook, cellIds));
  let cache = sheetCache ?? new (Map as Dynamic)();
  areaHoldsCache.set(sheet, cache);
  for (let [value, columnArea] of columnAreas.entries() as Dynamic) {
    let holds = holdsByColumn[value];
    if (holds !== undefined) cache.set(areaCacheKey(columnArea), holds);
  }
  return holdsByColumn;
}
export const MOST_CELLS_LOOKED_AT = 3000;
export const NUMBER_LIKE_TEXT_PATTERN = /^[-+(]?\p{Sc}?\s*\d/u;
export const HELD_KIND_OF_NUMBER_FORMAT = {
  general: 'number',
  number: 'number',
  currency: 'number',
  scientific: 'number',
  fraction: 'number',
  text: 'number',
  percent: 'percent',
  date: 'date',
  time: 'time',
  duration: 'time',
  dateAndTime: 'dateAndTime',
};
export const squeezeSpaces = (text?: Dynamic) => text.replaceAll(/\s+/g, '');
export const MOST_CELLS_CHECKED_FOR_NUMBERS = 20000;
export const allNumbersCache = new (WeakMap as Dynamic)();
export const areaHoldsCache = new (WeakMap as Dynamic)();
export const areaCacheKey = (area?: Dynamic) => [area.topRowIndex, area.leftColumnIndex, area.rowCount, area.columnCount].join();
