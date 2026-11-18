import type { Dynamic } from '../dynamic.ts';
import { isInSpan } from '../grid/geometry.ts';
import { rangeSortArea, sheetSortArea, sortColumnIndex, headingRowCountByFreeze } from '../tables/sort.ts';
import { layoutOfView, sheetOfViewOrEmpty } from '../grid/layout.ts';
import { isLineShown } from '../model/line-sizes.ts';
import { anchorCellOf } from '../selection/model.ts';
import { peopleNamesOfCell } from './find.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { columnLetters } from '../model/a1-references.ts';
import { flattenEnteredText } from '../format/shown-text.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function filledColumnIndexesOf({ sheetId: sheetId }: Dynamic, workbook: WorkbookReads) {
  let sheet = workbook.sheetAsItStands(sheetId);
  let cached = sheet === null ? undefined : filledColumnIndexesCache.get(sheet);
  if (sheet === null || cached !== undefined) return cached ?? [];
  let columnIds = new (Set as Dynamic)();
  let columnIndexes = new (Set as Dynamic)();
  for (let [value, value2] of workbook.cellsHeldByRow(sheetId) as Dynamic) {
    if (workbook.rowIndexOf(sheetId, value) === null) continue;
    for (let [columnId, { spill: spill }] of value2 as Dynamic) {
      columnIds.add(columnId);
      if (spill?.kind !== 'fills') continue;
      let fromIndex = workbook.columnIndexOf(sheetId, columnId);
      let toIndex = workbook.columnIndexOf(sheetId, spill.to.c);
      if (fromIndex === null || toIndex === null) continue;
      for (let index: Dynamic = fromIndex; index <= toIndex; index += 1) columnIndexes.add(index);
    }
  }
  for (let value of columnIds as Dynamic) {
    let value2 = workbook.columnIndexOf(sheetId, value);
    if (value2 !== null) columnIndexes.add(value2);
  }
  let sortedIndexes = [...columnIndexes];
  sortedIndexes.sort((input?: Dynamic, options?: Dynamic) => input - options);
  filledColumnIndexesCache.set(sheet, sortedIndexes);
  return sortedIndexes;
}
export function columnHasCellsInRows(
  workbook: WorkbookReads,
  { sheetId: sheetId, columnId: columnId }: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic,
) {
  for (let rowId of workbook.rowsAsTheyStand(sheetId).keys() as Dynamic) {
    if (
      workbook.cellOnShowIn({
        sheetId: sheetId,
        rowId: rowId,
        columnId: columnId,
      }) === null
    )
      continue;
    let rowIndex = workbook.rowIndexOf(sheetId, rowId);
    if (rowIndex !== null && isInSpan(rowIndex, topRowIndex, rowCount)) return true;
  }
  return false;
}
export function sortColumnsPointedAtOf(state: PageState, workbook: ReadsWithTextMeasurer, pointedAt?: Dynamic) {
  if (pointedAt.kind === 'rowHeader' || pointedAt.kind === 'corner') return NO_SORT_COLUMNS_POINTED_AT;
  let { sheetId: sheetId } = state;
  let columnId = workbook.cellIdAt(sheetId, 0, pointedAt.columnIndex)?.columnId;
  if (columnId === undefined || columnId === state.activeCell.columnId) return NO_SORT_COLUMNS_POINTED_AT;
  let columnIfFilledIn = (input?: Dynamic) =>
    input !== null &&
    columnHasCellsInRows(
      workbook,
      {
        sheetId: sheetId,
        columnId: columnId,
      },
      input,
    )
      ? columnId
      : null;
  return {
    range: columnIfFilledIn(rangeSortArea(state, workbook)),
    sheet: columnIfFilledIn(sheetSortArea(state, workbook)),
  };
}
export function columnsOfferedToSortBy(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { sheetId: sheetId } = state;
  let { columnEdges: columnEdges } = layoutOfView(state, workbook);
  let columnIndexes = new (Set as Dynamic)(
    filledColumnIndexesOf(state, workbook)
      .filter((input?: Dynamic) => isLineShown(columnEdges, input))
      .slice(0, MAX_COLUMNS_OFFERED_TO_SORT_BY),
  );
  for (let value of [null, state.menu?.sortColumnsPointedAt?.sheet ?? null] as Dynamic) {
    let value2 = sortColumnIndex(state, workbook, value);
    if (value2 !== null) columnIndexes.add(value2);
  }
  let sortedIndexes = [...columnIndexes];
  sortedIndexes.sort((input?: Dynamic, options?: Dynamic) => input - options);
  let headingRowIndex = headingRowCountByFreeze(state, workbook) - 1;
  return sortedIndexes.flatMap((columnIndex?: Dynamic) => {
    let cellId = workbook.cellIdAt(sheetId, headingRowIndex, columnIndex);
    if (cellId === null) return [];
    let cell = workbook.cellOnShowIn(anchorCellOf(workbook, cellId));
    let heading = peopleNamesOfCell(cell, state.profilesById) ?? cellShownText(cell, workbook.decimalSign);
    return [
      {
        columnId: cellId.columnId,
        letters: columnLetters(columnIndex),
        heading: flattenEnteredText(heading).trim(),
      },
    ];
  });
}
export function pickColumnToSortBy(state: PageState, workbook: ReadsWithTextMeasurer, columnId?: Dynamic) {
  let { menu: menu } = state;
  if (menu?.holds !== 'all') return state;
  return columnsOfferedToSortBy(state, workbook).some((input?: Dynamic) => input.columnId === columnId)
    ? {
        ...state,
        menu: {
          ...menu,
          sortColumnPicked: columnId,
        },
      }
    : state;
}
export function headingTextAt(
  state: PageState,
  workbook: WorkbookReads,
  { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
  takesAnyKind?: Dynamic,
) {
  let { sheetId: sheetId } = state;
  let cellId = workbook.cellIdAt(sheetId, rowIndex, columnIndex);
  if (cellId === null) return '';
  let cellCorner = {
    topRowIndex: rowIndex,
    leftColumnIndex: columnIndex,
  };
  let isInWideMerge = workbook
    .mergedAreasIn(sheetId, {
      ...cellCorner,
      rowCount: 1,
      columnCount: 1,
    })
    .some(({ columnCount: columnCount }: Dynamic) => columnCount > 1);
  let cell = workbook.cellOnShowIn(anchorCellOf(workbook, cellId));
  if (cell === null || isInWideMerge) return '';
  let cellValue = 'input' in cell ? (cell.value ?? cell.input) : cell.value;
  let text =
    peopleNamesOfCell(cell, state.profilesById) ?? (takesAnyKind || cellValue.kind === 'text' ? cellShownText(cell, workbook.decimalSign) : '');
  return flattenEnteredText(text).trim();
}
export function lacksHeadingRow(state: PageState, workbook: WorkbookReads, cells?: Dynamic) {
  if (sheetOfViewOrEmpty(state, workbook).frozenRowCount > 0) return false;
  let headingRowIndex = headingRowCountByFreeze(state, workbook) - 1;
  let headingCount: Dynamic = 0;
  for (let { sheetId: sheetId, columnId: columnId } of cells as Dynamic) {
    let columnIndex = workbook.columnIndexOf(sheetId, columnId);
    if (columnIndex === null) continue;
    if (
      headingTextAt(
        state,
        workbook,
        {
          rowIndex: headingRowIndex,
          columnIndex: columnIndex,
        },
        true,
      ) !== ''
    )
      headingCount += 1;
    if (headingCount === 2) return false;
  }
  return headingCount < cells.length;
}
export function headingToSortBy(state: PageState, workbook: ReadsWithTextMeasurer, holds?: Dynamic, pointedAt?: Dynamic) {
  let columnIndex = sortColumnIndex(state, workbook, pointedAt);
  let topRowIndex = headingRowCountByFreeze(state, workbook);
  let { columnCount: columnCount } = layoutOfView(state, workbook);
  let area =
    holds === 'sheet'
      ? {
          topRowIndex: topRowIndex,
          leftColumnIndex: 0,
          columnCount: columnCount,
        }
      : rangeSortArea(state, workbook);
  if (columnIndex === null || area?.topRowIndex !== topRowIndex) return '';
  let topRowCells = workbook.cellsOnShowIn(state.sheetId, {
    ...area,
    rowCount: 1,
  });
  return lacksHeadingRow(state, workbook, topRowCells) ? '' : sortHeadingOfColumn(state, workbook, columnIndex);
}
export const filledColumnIndexesCache = new (WeakMap as Dynamic)();
export const NO_SORT_COLUMNS_POINTED_AT = {
  range: null,
  sheet: null,
};
export const MAX_COLUMNS_OFFERED_TO_SORT_BY = 100;
export const sortHeadingOfColumn = (state: PageState, workbook: WorkbookReads, columnIndex?: Dynamic) =>
  headingTextAt(
    state,
    workbook,
    {
      rowIndex: headingRowCountByFreeze(state, workbook) - 1,
      columnIndex: columnIndex,
    },
    sheetOfViewOrEmpty(state, workbook).frozenRowCount > 0,
  );
