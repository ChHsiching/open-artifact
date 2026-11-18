import type { Dynamic } from '../dynamic.ts';
import { toggleableCheckboxValue } from '../chips/checkbox-presses.ts';
import { isLineShown } from '../model/line-sizes.ts';
import { selectedArea } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { shownRowCountIn } from '../tables/filtered-rows.ts';
import { IF_QUEUED_DEFAULTS, queueEdit } from '../model/edit-effects.ts';
import { layoutOfView } from '../grid/layout.ts';
import { isRowHeaderOfTables } from '../tables/tables-in-view.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function mostRowsToInsert(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let checkboxCount = workbook
    .filledCellsIn(sheetId, area)
    .filter((input?: Dynamic) => toggleableCheckboxValue(workbook, input) !== null).length;
  return Math.floor(workbook.mostCheckboxesOfOneInsert() / checkboxCount);
}
export function noteRowAddedAfterEntry(state: PageState, action: Dynamic, workbook: WorkbookReads) {
  if (action.kind !== 'editAnswered' || action.ifQueued.entryBeforeLine === undefined) return state;
  if (action.edit.kind !== 'insertRows' || action.outcome.kind !== 'editQueued') return state;
  let { sheetId: sheetId } = action.edit;
  let area = action.outcome.placeChanged?.area ?? null;
  let rowId = area === null ? undefined : workbook.cellIdAt(sheetId, area.topRowIndex, 0)?.rowId;
  if (rowId === undefined) return state;
  let isOnSheet2 = (input?: Dynamic) => input.sheetId === sheetId;
  let otherSheets = state.rowsAddedAfterEntries.filter((input?: Dynamic) => !isOnSheet2(input));
  let onSheet = [
    ...state.rowsAddedAfterEntries.filter(isOnSheet2),
    {
      sheetId: sheetId,
      rowId: rowId,
    },
  ];
  return {
    ...state,
    rowsAddedAfterEntries: [...otherSheets, ...onSheet.slice(-MAX_ROWS_ADDED_AFTER_ENTRIES)],
  };
}
export function isRowAddedAfterEntry(
  { sheetId: sheetId, rowsAddedAfterEntries: rowsAddedAfterEntries }: Dynamic,
  workbook: WorkbookReads,
  { columnCount: columnCount, rowEdges: rowEdges }: Dynamic,
  rowIndex?: Dynamic,
) {
  if (rowsAddedAfterEntries.length === 0 || rowIndex < 1) return false;
  let rowId = workbook.cellIdAt(sheetId, rowIndex, 0)?.rowId;
  let rowArea = {
    topRowIndex: rowIndex,
    leftColumnIndex: 0,
    rowCount: 1,
    columnCount: columnCount,
  };
  let isBlankUnderFilledCell = (cellId?: Dynamic) => {
    let columnIndex = workbook.positionOfCell(cellId)?.columnIndex;
    let cellAbove = columnIndex === undefined ? null : workbook.cellIdAt(sheetId, rowIndex - 1, columnIndex);
    return toggleableCheckboxValue(workbook, cellId) === false && cellAbove !== null && toggleableCheckboxValue(workbook, cellAbove) !== null;
  };
  return (
    rowsAddedAfterEntries.some((input?: Dynamic) => input.sheetId === sheetId && input.rowId === rowId) &&
    isLineShown(rowEdges, rowIndex) &&
    workbook.cellsOnShowIn(sheetId, rowArea).every(isBlankUnderFilledCell) &&
    workbook.mergedAreasIn(sheetId, rowArea).length === 0
  );
}
export function skipRowsAddedAfterEntries(state: Dynamic, workbook: WorkbookReads, layout?: Dynamic, rowIndex?: Dynamic) {
  let index: Dynamic = rowIndex;
  while (isRowAddedAfterEntry(state, workbook, layout, index)) index -= 1;
  return index;
}
export function continuesRowBands(workbook: WorkbookReads, sheetId?: Dynamic, rowIndex?: Dynamic, step?: Dynamic) {
  let isRowFilled = (input?: Dynamic) => workbook.columnIndexesOnShowIn(sheetId, input).length > 0;
  if (!isRowFilled(rowIndex) || isRowFilled(rowIndex - step)) return false;
  let neighborRowIndex = rowIndex + step;
  let farRowIndex: Dynamic = neighborRowIndex;
  while (!isRowFilled(farRowIndex) && workbook.cellIdAt(sheetId, farRowIndex, 0) !== null) farRowIndex += step;
  let matchesNeighborLook = (input?: Dynamic) =>
    isRowFilled(input) && workbook.lookOfRow(sheetId, input) === workbook.lookOfRow(sheetId, neighborRowIndex);
  return (
    matchesNeighborLook(farRowIndex) &&
    (matchesNeighborLook(farRowIndex + step) || (isRowFilled(farRowIndex + step) && matchesNeighborLook(farRowIndex + 2 * step)))
  );
}
export function insertRowsOrColumns(state: PageState, workbook: ReadsWithTextMeasurer, command?: Dynamic) {
  let area = selectedArea(state, workbook);
  if (area === null) return withNoEffects(state);
  let { sheetId: sheetId, activeCell: activeCell, selectionCorner: selectionCorner, rangeWalked: rangeWalked } = state;
  let isRows = command === 'insertRowAbove' || command === 'insertRowBelow';
  let isBefore = command === 'insertRowAbove' || command === 'insertColumnLeft';
  let startIndex = isRows ? area.topRowIndex : area.leftColumnIndex;
  let lineCount = isRows ? area.rowCount : area.columnCount;
  let count = isRows ? shownRowCountIn(state, workbook, area) : lineCount;
  let insertIndex = isBefore ? startIndex : startIndex + lineCount;
  let cellBefore = isRows ? workbook.cellIdAt(sheetId, insertIndex - 1, 0) : workbook.cellIdAt(sheetId, 0, insertIndex - 1);
  let neighborIndex = isBefore ? insertIndex : insertIndex - 1;
  let neighborCell = isRows ? workbook.cellIdAt(sheetId, neighborIndex, 0) : workbook.cellIdAt(sheetId, 0, neighborIndex);
  let step = isBefore ? -1 : 1;
  let select = isRows
    ? {
        ...area,
        topRowIndex: insertIndex,
        rowCount: count,
      }
    : {
        ...area,
        leftColumnIndex: insertIndex,
      };
  let ifQueued = {
    ...IF_QUEUED_DEFAULTS,
    undoSelects: {
      activeCell: activeCell,
      selectionCorner: selectionCorner,
      rangeWalked: rangeWalked,
    },
    select: select,
    done: {
      what: isRows ? 'rowsInserted' : 'columnsInserted',
    },
  };
  if (!isRows)
    return queueEdit(
      state,
      {
        kind: 'insertColumns',
        sheetId: sheetId,
        afterColumn: cellBefore?.columnId ?? null,
        count: count,
        formatsFromColumn: neighborCell?.columnId ?? null,
        groupsFromColumn: neighborCell?.columnId ?? null,
      },
      ifQueued,
    );
  let layout = layoutOfView(state, workbook);
  let isAfterAddedRow = isBefore && isRowAddedAfterEntry(state, workbook, layout, neighborIndex);
  let formulasRowIndex = continuesRowBands(workbook, sheetId, neighborIndex, step) || isAfterAddedRow ? neighborIndex + step : neighborIndex;
  let formulasCell =
    isBefore && isRowHeaderOfTables(neighborIndex, state, workbook) ? null : workbook.cellIdAt(sheetId, formulasRowIndex, 0);
  return queueEdit(
    state,
    {
      kind: 'insertRows',
      sheetId: sheetId,
      afterRow: cellBefore?.rowId ?? null,
      count: count,
      formatsFromRow: formulasCell?.rowId ?? null,
      groupsFromRow: neighborCell?.rowId ?? null,
      formulasFromRow: formulasCell?.rowId ?? null,
    },
    ifQueued,
  );
}
export const givesNewRowsFormulas = (edit?: Dynamic) => edit.kind === 'insertRows' && (edit.formulasFromRow ?? null) !== null;
export const MAX_ROWS_ADDED_AFTER_ENTRIES = 3;
