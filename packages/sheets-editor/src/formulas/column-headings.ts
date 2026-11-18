import type { Dynamic } from '../dynamic.ts';
import { areaOfReference } from '../model/reference-areas.ts';
import { cellValueOf, cellPlainText } from '../model/cell-values.ts';
import { headingsInFirstRow } from '../chips/dropdown-editor.ts';
import { readsAsStored } from '../model/workbook.ts';
import { findFormulaReferences } from './references.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function lastRowReadInOwnColumn(reads: WorkbookReads, cellId?: Dynamic) {
  let { sheetId: sheetId, columnId: columnId } = cellId;
  let input = reads.cellOf(cellId)?.input;
  let position = reads.positionOfCell(cellId);
  if (input?.kind !== 'formula' || position === null) return null;
  let sameSheetReferences = input.formula.references.filter((reference?: Dynamic) => reference.sheetId === sheetId);
  let rowsInOwnColumn = sameSheetReferences.flatMap(
    (reference?: Dynamic) => (reference.kind === 'cell' && reference.cell.c === columnId ? [reference.cell.r] : []),
  );
  if (new (Set as Dynamic)(rowsInOwnColumn).size > 1) return Number.POSITIVE_INFINITY;
  let rangeAreas = sameSheetReferences.flatMap(
    (reference?: Dynamic) => (reference.kind === 'cell' ? [] : [areaOfReference(reads, reference)]),
  );
  let areas = rangeAreas.flatMap((area?: Dynamic) => area ?? []);
  if (areas.length < rangeAreas.length) return Number.POSITIVE_INFINITY;
  let areasOverColumn = areas.filter(
    ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
      leftColumnIndex <= position.columnIndex && position.columnIndex < leftColumnIndex + columnCount,
  );
  if (areasOverColumn.length > 0) return (Math.max as Dynamic)(...areasOverColumn.map(lastRowIndexOfArea));
  return areas.every((area?: Dynamic) => area.topRowIndex <= position.rowIndex && position.rowIndex <= lastRowIndexOfArea(area))
    ? null
    : Number.POSITIVE_INFINITY;
}
export function findHeadedColumns(reads: WorkbookReads, sheetId?: Dynamic) {
  let columnsInRow1 = reads.columnIndexesOnShowIn(sheetId, 0);
  let filledCellsInRow = (rowIndex?: Dynamic) =>
    columnsInRow1
      .flatMap((columnIndex?: Dynamic) => reads.cellIdAt(sheetId, rowIndex, columnIndex) ?? [])
      .filter((cellId?: Dynamic) => reads.cellOnShowIn(cellId) !== null);
  let rowsReadByFormulas = (rowIndex?: Dynamic) => {
    let cellIds = filledCellsInRow(rowIndex);
    if (cellIds.length === 0) return null;
    return cellIds.flatMap((cellId?: Dynamic) => lastRowReadInOwnColumn(reads, cellId) ?? []);
  };
  let holdsNonText = (rowIndex?: Dynamic) =>
    filledCellsInRow(rowIndex).some((cellId?: Dynamic) => {
      let kind = reads.cellOf(cellId)?.input.kind;
      return kind !== 'text' && kind !== 'richText' && kind !== 'formula';
    });
  let mergedRowCounts = columnsInRow1.map(
    (columnIndex?: Dynamic) =>
      reads.mergedAreaAt(sheetId, {
        rowIndex: 0,
        columnIndex: columnIndex,
      })?.rowCount ?? 1,
  );
  let headingRowCount = (Math.max as Dynamic)(1, ...mergedRowCounts);
  let [firstColumn = 0, lastColumn = firstColumn] = [columnsInRow1[0], columnsInRow1.at(-1)];
  let isBesideRow1 = (columnIndex?: Dynamic) =>
    columnIndex >= firstColumn - 1 && columnIndex <= lastColumn + 1 && !columnsInRow1.includes(columnIndex);
  let holdsNumberFormula = (columnIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, headingRowCount, columnIndex);
    return cellId !== null && reads.cellOf(cellId)?.input.kind === 'formula' && cellValueOf(reads.cellOnShowIn(cellId))?.kind !== 'text';
  };
  if (
    reads
      .columnIndexesOnShowIn(sheetId, headingRowCount)
      .some((columnIndex?: Dynamic) => isBesideRow1(columnIndex) && !holdsNumberFormula(columnIndex))
  )
    return NO_HEADED_COLUMNS;
  let end: Dynamic = headingRowCount;
  while (rowsReadByFormulas(end)?.length === 0) end += 1;
  for (let row: Dynamic = end, rowsRead: Dynamic = rowsReadByFormulas(end); rowsRead !== null; rowsRead = rowsReadByFormulas(++row))
    if (rowsRead.length === 0 || rowsRead.some((row2?: Dynamic) => row2 >= end) || holdsNonText(row)) return NO_HEADED_COLUMNS;
  let { rowCount = 0, columnCount = 0 } = reads.listSheets().find((sheet?: Dynamic) => sheet.sheetId === sheetId) ?? {};
  let headed = Array.from<Dynamic, Dynamic>(
    headingsInFirstRow(reads, sheetId, {
      topRowIndex: 0,
      leftColumnIndex: 0,
      rowCount: rowCount,
      columnCount: columnCount,
    }),
    ([columnIndex, { text: text }]: Dynamic) => {
      let columnId = reads.cellIdAt(sheetId, 0, columnIndex)?.columnId;
      let mergedColumns =
        reads.mergedAreaAt(sheetId, {
          rowIndex: 0,
          columnIndex: columnIndex,
        })?.columnCount ?? 1;
      if (columnId === undefined || mergedColumns > 1) return [];
      return [
        {
          columnId: columnId,
          heading: text.trim(),
          columnIndex: columnIndex,
        },
      ];
    },
  ).flat();
  return {
    inRow1: columnsInRow1,
    headed: headed,
    top: headingRowCount,
    end: end,
  };
}
export function headedColumnsOfSheet(reads: WorkbookReads, sheetId?: Dynamic) {
  let sheet = reads.sheetAsItStands(sheetId);
  let cached = sheet === null ? undefined : headedColumnsCache.get(sheet);
  if (sheet === null || cached !== undefined) return cached ?? NO_HEADED_COLUMNS;
  let headed = findHeadedColumns(reads, sheetId);
  headedColumnsCache.set(sheet, headed);
  return headed;
}
export function isAddressWordInSheet(word: Dynamic, sheetId: Dynamic, reads: WorkbookReads) {
  let sheet = reads.sheetAsItStands(sheetId);
  if (sheet === null) return false;
  let addressWords: Dynamic = addressWordsCache.get(sheet);
  if (addressWords === undefined) {
    let { rowCount = 0, columnCount = 0 } = reads.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId) ?? {};
    let scanned = {
      topRowIndex: 0,
      leftColumnIndex: 0,
      rowCount: Math.min(rowCount, Math.ceil(MAX_CELLS_SCANNED_FOR_ADDRESS_WORDS / Math.max(columnCount, 1))),
      columnCount: columnCount,
    };
    addressWords = new (Set as Dynamic)(
      reads.cellsOnShowIn(sheetId, scanned).flatMap((cellId?: Dynamic) => {
        let value = cellValueOf(reads.cellOnShowIn(cellId));
        if (value?.kind !== 'text') return [];
        return value.value
          .toLowerCase()
          .split(NON_WORD_CHARACTERS_PATTERN)
          .filter((word2?: Dynamic) => ADDRESS_WORD_PATTERN.test(word2));
      }),
    );
    addressWordsCache.set(sheet, addressWords);
  }
  return addressWords.has(word.replaceAll('$', '').toLowerCase());
}
export function headedColumnsMatchingWord(typed?: Dynamic, cellId?: Dynamic, readsSeen?: Dynamic) {
  let reads = readsAsStored(readsSeen);
  let position = reads.positionOfCell(cellId);
  if (position === null || TRUE_OR_FALSE_PATTERN.test(typed) || findFormulaReferences(typed, reads.decimalSign).references.length > 0) return [];
  let { inRow1: inRow1, headed: headed, top: headingTop, end: end } = headedColumnsOfSheet(reads, cellId.sheetId);
  let ownArea = reads.spillOver(cellId)?.area ??
    reads.mergedAreaAt(cellId.sheetId, position) ?? {
      topRowIndex: position.rowIndex,
      leftColumnIndex: position.columnIndex,
      rowCount: 1,
      columnCount: 1,
    };
  let isOwnColumn = (columnIndex?: Dynamic) =>
    columnIndex >= ownArea.leftColumnIndex && columnIndex < ownArea.leftColumnIndex + ownArea.columnCount;
  let isRowFreeBeside = inRow1.every((columnIndex?: Dynamic) => {
    let rowCellId = reads.cellIdAt(cellId.sheetId, ownArea.topRowIndex, columnIndex);
    let rowCell = rowCellId === null || isOwnColumn(columnIndex) ? null : reads.cellOnShowIn(rowCellId);
    return rowCell === null || ('input' in rowCell && cellPlainText(rowCell) !== null);
  });
  let isOwnRowEnd = inRow1.some(isOwnColumn) && ownArea.topRowIndex + ownArea.rowCount === end && isRowFreeBeside;
  let bottom = isOwnRowEnd ? ownArea.topRowIndex : end;
  let isInsideColumn = ownArea.topRowIndex < bottom && ownArea.topRowIndex + ownArea.rowCount > headingTop;
  let typedLower = typed.toLowerCase();
  return headed
    .filter(
      ({ heading: heading, columnIndex: columnIndex }: Dynamic) =>
        headingTop < bottom &&
        (isOwnColumn(columnIndex) ? !isInsideColumn : !isOwnRowEnd) &&
        heading
          .toLowerCase()
          .split(NON_WORD_CHARACTERS_PATTERN)
          .some((word?: Dynamic) => word.startsWith(typedLower)),
    )
    .map(({ columnId: columnId, heading: heading, columnIndex: columnIndex }: Dynamic) => {
      let area = {
        topRowIndex: headingTop,
        leftColumnIndex: columnIndex,
        rowCount: bottom - headingTop,
        columnCount: 1,
      };
      return {
        columnId: columnId,
        heading: heading,
        cells: areaToA1AsStored(area, null),
      };
    });
}
export const NO_HEADED_COLUMNS = {
  inRow1: [],
  headed: [],
  top: 0,
  end: 0,
};
export const lastRowIndexOfArea = ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) => topRowIndex + rowCount - 1;
export const headedColumnsCache = new (WeakMap as Dynamic)();
export const NON_WORD_CHARACTERS_PATTERN = /[^\p{L}\p{N}]+/u;
export const ADDRESS_WORD_PATTERN = /^[a-z]{1,3}[1-9]\d*$/;
export const MAX_CELLS_SCANNED_FOR_ADDRESS_WORDS = 5000;
export const addressWordsCache = new (WeakMap as Dynamic)();
export const TRUE_OR_FALSE_PATTERN = /^(?:true|false)$/i;
