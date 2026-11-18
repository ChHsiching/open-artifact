import type { Dynamic } from '../../dynamic.ts';
import { cellValueOf } from '../../model/cell-values.ts';
import { areaOfReference } from '../../model/reference-areas.ts';
import { MOST_CELLS_LOOKED_AT, holdsOfEachColumn, holdsOfArea } from './area-holds.ts';
import { headedColumnsMatchingWord } from '../column-headings.ts';
import { parseA1Area } from '../../model/a1-references.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function isSummaryRow(
  workbook: WorkbookReads,
  { sheetId: sheetId, columnIndexes: columnIndexes, held: held }: Dynamic,
  rowIndex?: Dynamic,
  neighbourRowIndex?: Dynamic,
) {
  let cellIdsInRow = (rowIndex2?: Dynamic) =>
    columnIndexes.map((columnIndex?: Dynamic) => workbook.cellIdAt(sheetId, rowIndex2, columnIndex));
  let valueOfCellId = (cellId?: Dynamic) => (cellId === null ? null : cellValueOf(workbook.cellOnShowIn(cellId)));
  let isFormulaCell2 = (cellId?: Dynamic) => cellId !== null && workbook.cellOf(cellId)?.input.kind === 'formula';
  let [rowCells, neighbourCells] = [cellIdsInRow(rowIndex), cellIdsInRow(neighbourRowIndex)];
  let firstValue = valueOfCellId(rowCells[0] ?? null);
  let firstText = firstValue?.kind === 'text' ? firstValue.value.trim() : '';
  if (SUMMARY_LABEL_PATTERN.test(firstText) || REFERENCE_LABEL_PATTERN.test(firstText) || firstText.endsWith(':')) return true;
  let isLoneLabelOverNumbers = (cellId?: Dynamic, columnOffset?: Dynamic) => {
    let { textCount = 0, numberCount = 0 } = held[columnOffset] ?? {};
    return valueOfCellId(cellId)?.kind === 'text' && textCount === 1 && numberCount > 1;
  };
  if (rowCells.some(isLoneLabelOverNumbers)) return true;
  let isFormulaOverPlainValue = (cellId?: Dynamic, columnOffset?: Dynamic) =>
    isFormulaCell2(cellId) && valueOfCellId(neighbourCells[columnOffset] ?? null) !== null && !isFormulaCell2(neighbourCells[columnOffset] ?? null);
  if (rowCells.some(isFormulaOverPlainValue)) return true;
  let summaryKinds = rowCells.flatMap((cellId?: Dynamic, columnOffset?: Dynamic) => {
    let [value, { sum = 0, numberCount = 0 } = {}] = [valueOfCellId(cellId), held[columnOffset]];
    if (value?.kind !== 'number' || numberCount <= MIN_NUMBERS_FOR_SUMMARY_ROW) return [];
    let sumOfOthers = sum - value.value;
    if (value.value !== 0 && isNearlyEqualAsShown(value.value, sumOfOthers)) return ['sum'];
    let [lowest = 0, highest = 0] = held[columnOffset]?.numbersLieIn ?? [];
    if (isNearlyEqualAsShown(value.value, value.value + (highest - lowest) / 20)) return [];
    return [value.value !== 0 && isNearlyEqualAsShown(value.value, sumOfOthers / (numberCount - 1)) ? 'average' : 'neither'];
  });
  return summaryKinds.includes('sum') || (summaryKinds.length > 0 && !summaryKinds.includes('neither'));
}
export function hasSubtotalRows({ rowIds: rowIds, held: held }: Dynamic) {
  let runningSums = held.map(
    () => ({
      sum: 0,
      count: 0,
    }),
  );
  let headingColumns = held.flatMap(
    ({ textCount: textCount, numberCount: numberCount }: Dynamic, columnOffset?: Dynamic) =>
      columnOffset > 0 && textCount > 0 && numberCount === 0 ? [columnOffset] : [],
  );
  let [subtotalRowCount, rowsSinceSubtotal]: Dynamic = [0, 0];
  for (let rowId of rowIds as Dynamic) {
    let rowNumbers = held.map(({ byRow: byRow }: Dynamic) => byRow.get(rowId));
    if (held.length > 1 && rowNumbers.filter((input?: Dynamic) => input !== undefined).length < 2) return true;
    if (headingColumns.length > 0 && headingColumns.every((input?: Dynamic) => rowNumbers[input] === undefined)) return true;
    let numbersWithColumn = rowNumbers.flatMap(
      (input?: Dynamic, options?: Dynamic) => (typeof input === 'number' ? [[input, options]] : []),
    );
    let isSubtotalOfColumn = ([value, columnOffset]: Dynamic) => {
      let { sum = 0, count = 0 } = runningSums[columnOffset] ?? {};
      return count > 1 && value !== 0 && isNearlyEqualAsShown(value, sum);
    };
    let isSubtotalRow = numbersWithColumn.length > 0 && numbersWithColumn.every(isSubtotalOfColumn);
    [subtotalRowCount, rowsSinceSubtotal] = isSubtotalRow ? [subtotalRowCount + 1, 0] : [subtotalRowCount, rowsSinceSubtotal + 1];
    for (let [value, value2] of runningSums.entries() as Dynamic) {
      let value3 = isSubtotalRow ? undefined : rowNumbers[value];
      if (isSubtotalRow) [value2.sum, value2.count] = [0, 0];
      else if (typeof value3 === 'number') [value2.sum, value2.count] = [value2.sum + value3, value2.count + 1];
    }
  }
  return subtotalRowCount > 1 && rowsSinceSubtotal === 0;
}
export function hasSectionHeadingRows(workbook: WorkbookReads, { sheetId: sheetId, rows: rows, columnIndexes: columnIndexes }: Dynamic) {
  let filledCountsPerRow = Array.from<Dynamic, Dynamic>(
    {
      length: rows.rowCount,
    },
    (input?: Dynamic, rowOffset?: Dynamic) =>
      columnIndexes.slice(1).filter((columnIndex?: Dynamic) => {
        let cellId = workbook.cellIdAt(sheetId, rows.topRowIndex + rowOffset, columnIndex);
        let inputKind = cellId === null ? undefined : workbook.cellOf(cellId)?.input.kind;
        return inputKind !== undefined && inputKind !== 'formula';
      }).length,
  );
  return filledCountsPerRow.includes(0) && filledCountsPerRow.some((filledCount?: Dynamic) => filledCount > 0);
}
export function rowBelowBreaksTable(
  workbook: WorkbookReads,
  sheetId?: Dynamic,
  rowArea?: Dynamic,
  tableTopRowIndex?: Dynamic,
  tableEndRowIndex?: Dynamic,
) {
  let filled = workbook.filledCellsIn(sheetId, rowArea).map(
    (cellId?: Dynamic) => ({
      input: workbook.cellOf(cellId)?.input,
      columnIndex: workbook.positionOfCell(cellId)?.columnIndex ?? -1,
    }),
  );
  if (filled.filter(({ input: input }: Dynamic) => input?.kind === 'text' || input?.kind === 'richText').length > 1) return true;
  return filled.some(
    ({ input: input, columnIndex: columnIndex }: Dynamic) =>
      (input?.kind === 'formula' ? input.formula.references : []).some((reference?: Dynamic) => {
        if (reference.kind !== 'cell' && reference.sheetId !== sheetId) return true;
        let area = reference.kind === 'cell' ? null : areaOfReference(workbook, reference);
        return (
          area !== null &&
          area.leftColumnIndex <= columnIndex &&
          columnIndex < area.leftColumnIndex + area.columnCount &&
          (area.topRowIndex > tableTopRowIndex || area.topRowIndex + area.rowCount < tableEndRowIndex)
        );
      }),
  );
}
export function formulaReadsRowsAbove(workbook: WorkbookReads, cellId?: Dynamic, rowIndex?: Dynamic) {
  let input = workbook.cellOf(cellId)?.input;
  return (input?.kind === 'formula' ? input.formula.references : []).some(
    (reference?: Dynamic) =>
      reference.kind !== 'cell' && reference.sheetId === cellId.sheetId && (areaOfReference(workbook, reference)?.topRowIndex ?? rowIndex) < rowIndex,
  );
}
export function hasStrayCellsAroundTable(workbook: WorkbookReads, sheetId?: Dynamic, table?: Dynamic, sheet?: Dynamic) {
  let tableEndRowIndex = table.topRowIndex + table.rowCount;
  let tableEndColumnIndex = table.leftColumnIndex + table.columnCount;
  let fullHeight = {
    topRowIndex: 0,
    rowCount: sheet.rowCount,
  };
  let besideCells = [
    {
      ...fullHeight,
      leftColumnIndex: 0,
      columnCount: table.leftColumnIndex,
    },
    {
      ...fullHeight,
      leftColumnIndex: tableEndColumnIndex,
      columnCount: sheet.columnCount - tableEndColumnIndex,
    },
  ].flatMap((area?: Dynamic) => workbook.filledCellsIn(sheetId, area));
  let belowCells = workbook.filledCellsIn(sheetId, {
    ...table,
    topRowIndex: tableEndRowIndex,
    rowCount: sheet.rowCount - tableEndRowIndex,
  });
  if (besideCells.length + belowCells.length > MOST_CELLS_LOOKED_AT) return true;
  let inputKindOf = (cellId?: Dynamic) => workbook.cellOf(cellId)?.input.kind ?? 'formula';
  if (besideCells.some((cellId?: Dynamic) => inputKindOf(cellId) !== 'formula')) return true;
  let countByRow = new (Map as Dynamic)();
  for (let value of belowCells as Dynamic) {
    if (inputKindOf(value) === 'formula') {
      if (!formulaReadsRowsAbove(workbook, value, tableEndRowIndex)) return true;
      continue;
    }
    let count = (countByRow.get(value.rowId) ?? 0) + 1;
    if ((inputKindOf(value) !== 'text' && inputKindOf(value) !== 'richText') || count > 1) return true;
    countByRow.set(value.rowId, count);
  }
  return false;
}
export function isPlainRecordsTable(workbook: WorkbookReads, sheetId?: Dynamic, rows?: Dynamic) {
  let sheet = workbook.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  let columnIndexes = workbook.columnIndexesOnShowIn(sheetId, 0);
  let [leftColumnIndex, rightColumnIndex] = [(Math.min as Dynamic)(...columnIndexes), (Math.max as Dynamic)(...columnIndexes)];
  let isShortHeading = (columnIndex?: Dynamic) => {
    let cellId = workbook.cellIdAt(sheetId, 0, columnIndex);
    let value = cellId === null ? null : cellValueOf(workbook.cellOnShowIn(cellId));
    return value?.kind === 'text' && value.value.length <= MAX_HEADING_TEXT_LENGTH;
  };
  if (sheet === undefined || rightColumnIndex - leftColumnIndex + 1 > columnIndexes.length || !columnIndexes.every(isShortHeading)) return false;
  if (rows.rowCount * columnIndexes.length > MOST_CELLS_LOOKED_AT) return false;
  if (columnIndexes.length > MAX_PLAIN_TABLE_COLUMNS) return false;
  let rowsArea = (topRowIndex?: Dynamic, rowCount?: Dynamic) => ({
    topRowIndex: topRowIndex,
    rowCount: rowCount,
    leftColumnIndex: leftColumnIndex,
    columnCount: rightColumnIndex - leftColumnIndex + 1,
  });
  let rowsEndIndex = rows.topRowIndex + rows.rowCount;
  let tableEndIndex: Dynamic = rowsEndIndex;
  while (tableEndIndex < sheet.rowCount && workbook.filledCellsIn(sheetId, rowsArea(tableEndIndex, 1)).length > 0) tableEndIndex += 1;
  let tableArea = rowsArea(rows.topRowIndex, tableEndIndex - rows.topRowIndex);
  if (workbook.mergedAreasIn(sheetId, tableArea).length > 0) return false;
  for (let value: Dynamic = rowsEndIndex; value < tableEndIndex; value += 1)
    if (rowBelowBreaksTable(workbook, sheetId, rowsArea(value, 1), rows.topRowIndex, rowsEndIndex)) return false;
  if (hasStrayCellsAroundTable(workbook, sheetId, tableArea, sheet)) return false;
  let held = holdsOfEachColumn(workbook, sheetId, rowsArea(rows.topRowIndex, rows.rowCount));
  let rowIds = Array.from<Dynamic, Dynamic>(
    {
      length: rows.rowCount,
    },
    (input?: Dynamic, rowOffset?: Dynamic) => workbook.cellIdAt(sheetId, rows.topRowIndex + rowOffset, leftColumnIndex),
  ).flatMap((cellId?: Dynamic) => (cellId === null ? [] : [cellId.rowId]));
  let isFirstColumnPatchy = (held[0]?.filledCount ?? 0) < rows.rowCount;
  let isAnyTotalWord = held.some(
    ({ spelled: spelled }: Dynamic) => Array.from<Dynamic>(spelled.keys()).some((text?: Dynamic) => TOTAL_WORD_PATTERN.test(text)),
  );
  let firstColumnLabels = Array.from<Dynamic, Dynamic>(held[0]?.spelled.keys() ?? [], (text?: Dynamic) => text.trim());
  let isAnySubItem = firstColumnLabels.some((label?: Dynamic) => SUB_ITEM_LABEL_PATTERN.test(label));
  let indentedLabels = Array.from<Dynamic>(held[0]?.spelled.keys() ?? []).filter((text?: Dynamic) => /^\s/.test(text));
  let isSomeIndented = indentedLabels.length > 0 && indentedLabels.length < firstColumnLabels.length;
  let isHeadingRepeated = columnIndexes
    .map((columnIndex?: Dynamic) => {
      let cellId = workbook.cellIdAt(sheetId, 0, columnIndex);
      let value = cellId === null ? null : cellValueOf(workbook.cellOnShowIn(cellId));
      return value?.kind === 'text' ? value.value.trim().toLowerCase() : '';
    })
    .some((heading?: Dynamic) => firstColumnLabels.includes(heading));
  let table = {
    sheetId: sheetId,
    rowIds: rowIds,
    rows: rows,
    columnIndexes: columnIndexes,
    held: held,
  };
  return !(
    isFirstColumnPatchy ||
    isAnyTotalWord ||
    isAnySubItem ||
    isSomeIndented ||
    isHeadingRepeated ||
    hasSectionHeadingRows(workbook, table) ||
    hasSubtotalRows(table) ||
    isSummaryRow(workbook, table, rows.topRowIndex, rows.topRowIndex + 1) ||
    isSummaryRow(workbook, table, rowsEndIndex - 1, rowsEndIndex - 2)
  );
}
export function isOddFormulaBesideTable(workbook: WorkbookReads, cellId?: Dynamic, rows?: Dynamic) {
  let cell = workbook.cellOf(cellId);
  if (cell?.input.kind !== 'formula') return false;
  return (
    /"|IFS?\(|FILTER\(/i.test(cell.formulaText ?? '') ||
    cell.input.formula.references.some((reference?: Dynamic) => {
      let area = areaOfReference(workbook, reference);
      return (
        reference.kind === 'cell' ||
        reference.sheetId !== cellId.sheetId ||
        area === null ||
        area.topRowIndex !== rows.topRowIndex ||
        area.rowCount !== rows.rowCount
      );
    })
  );
}
export function isCellTiedToTableRows(workbook: WorkbookReads, cellId?: Dynamic, rows?: Dynamic, sheet?: Dynamic) {
  let position = workbook.positionOfCell(cellId);
  if (position === null) return true;
  let { sheetId: sheetId } = cellId;
  let tableColumnIndexes = new (Set as Dynamic)(workbook.columnIndexesOnShowIn(sheetId, 0));
  let rowsEndIndex = rows.topRowIndex + rows.rowCount;
  let othersInRow = workbook
    .filledCellsIn(sheetId, {
      topRowIndex: position.rowIndex,
      rowCount: 1,
      leftColumnIndex: 0,
      columnCount: sheet.columnCount,
    })
    .filter((otherCellId?: Dynamic) => otherCellId.columnId !== cellId.columnId);
  if (position.rowIndex >= rows.topRowIndex && position.rowIndex < rowsEndIndex) {
    if (tableColumnIndexes.has(position.columnIndex)) return true;
    if (
      othersInRow
        .filter((cellId2?: Dynamic) => !tableColumnIndexes.has(workbook.positionOfCell(cellId2)?.columnIndex ?? -1))
        .some((cellId2?: Dynamic) => cellValueOf(workbook.cellOnShowIn(cellId2))?.kind === 'text')
    )
      return true;
    return workbook
      .filledCellsIn(sheetId, {
        ...rows,
        leftColumnIndex: position.columnIndex,
        columnCount: 1,
      })
      .some((cellId2?: Dynamic) => {
        let input = workbook.cellOf(cellId2)?.input;
        let rowIndex = workbook.positionOfCell(cellId2)?.rowIndex;
        return (input?.kind === 'formula' ? input.formula.references : []).some((reference?: Dynamic) => {
          let area = reference.sheetId === sheetId ? areaOfReference(workbook, reference) : null;
          if (area === null || area.topRowIndex !== rowIndex) return false;
          return reference.kind === 'cell' || area.rowCount === 1;
        });
      });
  }
  return othersInRow.some((otherCellId?: Dynamic) => isOddFormulaBesideTable(workbook, otherCellId, rows));
}
export function headedColumnsOfPlainTable(workbook: WorkbookReads, activeCell?: Dynamic, isRowShown?: Dynamic) {
  let headedColumns = headedColumnsMatchingWord('', activeCell, workbook);
  let sheet = workbook.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === activeCell.sheetId);
  let sheetAsItStands = workbook.sheetAsItStands(activeCell.sheetId);
  let [firstColumn] = headedColumns;
  let rows = firstColumn === undefined || sheet === undefined ? null : parseA1Area(firstColumn.cells, sheet);
  if (rows === null || sheetAsItStands === null || sheet === undefined) return [];
  let sheetCache: Dynamic = plainTableCache.get(sheetAsItStands);
  if (sheetCache === undefined) plainTableCache.set(sheetAsItStands, (sheetCache = new (Map as Dynamic)()));
  let rowsKey = [rows.topRowIndex, rows.rowCount].join();
  let isPlainTable: Dynamic = sheetCache.get(rowsKey);
  if (isPlainTable === undefined) sheetCache.set(rowsKey, (isPlainTable = isPlainRecordsTable(workbook, activeCell.sheetId, rows)));
  if (!isPlainTable || isCellTiedToTableRows(workbook, activeCell, rows, sheet)) return [];
  for (let rowOffset: Dynamic = 0; rowOffset < rows.rowCount; rowOffset += 1) if (!isRowShown(rows.topRowIndex + rowOffset)) return [];
  let rowsEndIndex = rows.topRowIndex + rows.rowCount;
  let fitCache: Dynamic = wordsColumnFitCache.get(sheetAsItStands);
  if (fitCache === undefined) wordsColumnFitCache.set(sheetAsItStands, (fitCache = new (Map as Dynamic)()));
  let isWordsColumnFit = (cellsText?: Dynamic) => {
    let isFit: Dynamic = fitCache.get(cellsText);
    if (isFit !== undefined) return isFit;
    let area = parseA1Area(cellsText, sheet);
    isFit =
      area !== null &&
      holdsOfArea(workbook, activeCell.sheetId, area).filledCount * 2 >= rows.rowCount &&
      workbook
        .filledCellsIn(activeCell.sheetId, {
          ...area,
          topRowIndex: rowsEndIndex,
          rowCount: sheet.rowCount - rowsEndIndex,
        })
        .every((cellId?: Dynamic) => workbook.cellOf(cellId)?.input.kind === 'formula');
    fitCache.set(cellsText, isFit);
    return isFit;
  };
  return headedColumns.filter(({ cells: cells }: Dynamic) => isWordsColumnFit(cells));
}
export const SUMMARY_LABEL_PATTERN =
  /^(?:grand |sub|over)?(?:totals?|all|sum|average|avg|mean|median|count|min|max|overall|combined|target|goal|budget|forecast|plan|projected|projection|estimate|prior|previous|last year|benchmark|industry|best|worst|ytd|cumulative|running|%|change|growth|variance|difference)(?:$|[^\p{L}])/iu;
export const REFERENCE_LABEL_PATTERN =
  /(?:^|[^\p{L}])(?:est|estimated?|forecast|proj|projected|expected|planned|target|goal|budget|quota|par|possible|out of|max|maximum|min|minimum|passing|pass mark|limit|cap|capacity|allowance|spec|standard|baseline|benchmark|threshold|required|worth|weights?|avg|average|mean|median|typical|ideal|example|sample|template|e\.g|tbd|n\/a)(?:$|[^\p{L}])/iu;
export const SUB_ITEM_LABEL_PATTERN = /^(?:[-–—•·]\s|(?:of which|thereof|incl\.?|including)(?:$|[^\p{L}]))/iu;
export const TOTAL_WORD_PATTERN = /(?:^|[^\p{L}])(?:sub-?)?(?:totals?|tot|sum)(?:$|[^\p{L}])|Σ/iu;
export const MAX_HEADING_TEXT_LENGTH = 100;
export const MAX_PLAIN_TABLE_COLUMNS = 40;
export const MIN_NUMBERS_FOR_SUMMARY_ROW = 3;
export const isNearlyEqualAsShown = (shown?: Dynamic, value?: Dynamic) =>
  Math.abs(value - shown) <= 0.5000001 / 10 ** (String(shown).split('.')[1]?.length ?? 0);
export const plainTableCache = new (WeakMap as Dynamic)();
export const wordsColumnFitCache = new (WeakMap as Dynamic)();
