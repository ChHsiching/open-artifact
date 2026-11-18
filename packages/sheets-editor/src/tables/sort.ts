import type { Dynamic } from '../dynamic.ts';
import { layoutOfView, sheetOfViewOrEmpty } from '../grid/layout.ts';
import { columnLetters } from '../model/a1-references.ts';
import { selectionPositionsOf, selectedArea, selectionAreaAndKind, selectionAtCell } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { isInSpan } from '../grid/geometry.ts';
import { placedTablesOfSheet, hasTableHeadings } from './finding.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import { currentRegionAround } from '../selection/jumps.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { areaRefBetween, numberFormatOfCell } from '../model/workbook.ts';
import { rowBelowOwnFilterButtonsAt } from './own-filters.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function sheetSortColumnLetters(state: PageState, reads: ReadsWithTextMeasurer, columnId?: Dynamic) {
  let columnIndex = sortColumnIndex(state, reads, columnId);
  let hasRowsBelow = layoutOfView(state, reads).rowCount > headingRowCountByFilter(state, reads);
  return columnIndex === null || !hasRowsBelow ? null : columnLetters(columnIndex);
}
export function sheetSortArea(state: PageState, reads: ReadsWithTextMeasurer) {
  let topRowIndex = Math.max(headingRowCountByFreeze(state, reads), headingRowCountByFilter(state, reads));
  return {
    topRowIndex: topRowIndex,
    rowCount: layoutOfView(state, reads).rowCount - topRowIndex,
  };
}
export function sheetSortEnds(state: PageState, reads: ReadsWithTextMeasurer, columnId?: Dynamic) {
  let columnIndex = sortColumnIndex(state, reads, columnId);
  let columnLetters2 = sheetSortColumnLetters(state, reads, columnId);
  if (columnIndex === null || columnLetters2 === null) return null;
  let first = reads.cellIdAt(state.sheetId, headingRowCountByFilter(state, reads), columnIndex);
  let last = reads.cellIdAt(state.sheetId, layoutOfView(state, reads).rowCount - 1, columnIndex);
  return first === null || last === null
    ? null
    : {
        first: first,
        last: last,
        column: columnLetters2,
      };
}
export function sortSheetByColumn(state: PageState, reads: ReadsWithTextMeasurer, act?: Dynamic, columnId?: Dynamic, withNoKeyboard?: Dynamic) {
  let ends = sheetSortEnds(state, reads, columnId);
  let selectionPositions = selectionPositionsOf(state, reads);
  if (ends === null || selectionPositions === null) return withNoEffects(state);
  let { first: first, last: last, column: column } = ends;
  let direction = act === 'sortAscending' ? 'ascending' : 'descending';
  return queueEdit(
    state,
    {
      kind: 'sortRows',
      sheetId: state.sheetId,
      oneRow: first.rowId,
      otherRow: last.rowId,
      byColumn: first.columnId,
      direction: direction,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: selectionPositions,
      done: {
        what: 'rowsSorted',
        column: column,
        direction: direction,
      },
      undoOffer: withNoKeyboard
        ? {
            kind: 'sortedWithNoKeyboard',
            column: column,
            direction: direction,
            isSaved: false,
          }
        : null,
    },
  );
}
export function firstRowBelowTableHeader(
  view: Dynamic,
  reads: WorkbookReads,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
) {
  let columnsShown = reads
    .columnIndexesOnShowIn(view.sheetId, topRowIndex)
    .filter((columnIndex?: Dynamic) => isInSpan(columnIndex, leftColumnIndex, columnCount));
  let tablesWithHeaderAtTop = placedTablesOfSheet(view, reads, view.sheetId).all.filter(
    ({ table: table, header: header }: Dynamic) => hasTableHeadings(table) && topRowIndex >= header.first && topRowIndex <= header.last,
  );
  let headerEnds = columnsShown.map(
    (columnIndex?: Dynamic) =>
      tablesWithHeaderAtTop.find(({ columns: columns }: Dynamic) => columnIndex >= columns.first && columnIndex <= columns.last)?.header
        .last,
  );
  return headerEnds.every((headerEnd?: Dynamic) => headerEnd !== undefined)
    ? (Math.max as Dynamic)(topRowIndex - 1, ...headerEnds) + 1
    : topRowIndex;
}
export function rangeSortArea(state: PageState, reads: ReadsWithTextMeasurer) {
  let area = selectedArea(state, reads);
  if (area === null || isSelectionOneCell(state, reads)) return null;
  let layout = layoutOfView(state, reads);
  if (area.rowCount === layout.rowCount) return null;
  let { frozenRowCount: frozenRowCount } = sheetOfViewOrEmpty(state, reads);
  let topRowIndex = Math.max(firstRowBelowTableHeader(state, reads, area), MIN_SORT_HEADING_ROWS, frozenRowCount);
  let rowCount = area.topRowIndex + area.rowCount - topRowIndex;
  return rowCount < 2
    ? null
    : {
        ...area,
        topRowIndex: topRowIndex,
        rowCount: rowCount,
      };
}
export function widenToRegionColumns(state: PageState, reads: ReadsWithTextMeasurer, area?: Dynamic) {
  if (reads.cellsOnShowIn(state.sheetId, area).length === 0) return area;
  let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = currentRegionAround(state, reads, area);
  return {
    ...area,
    leftColumnIndex: leftColumnIndex,
    columnCount: columnCount,
  };
}
export function rangeSortWideningChoice(state: PageState, reads: ReadsWithTextMeasurer) {
  let area = rangeSortArea(state, reads);
  if (area === null) return null;
  let widenedArea = widenToRegionColumns(state, reads, area);
  return widenedArea.columnCount === area.columnCount
    ? null
    : {
        selection: areaToA1AsStored(area, ownRowOrderOfSheet(reads, state.sheetId)),
        table: areaToA1AsStored(widenedArea, ownRowOrderOfSheet(reads, state.sheetId)),
      };
}
export function rangeSortAreaIn(state: PageState, reads: ReadsWithTextMeasurer, widening?: Dynamic) {
  let area = rangeSortArea(state, reads);
  if (area === null) return null;
  return widening === 'table' ? widenToRegionColumns(state, reads, area) : area;
}
export function rangeSortPlan(state: PageState, reads: ReadsWithTextMeasurer, widening?: Dynamic, columnId?: Dynamic) {
  let area = rangeSortAreaIn(state, reads, widening);
  if (area === null) return null;
  let columnIndex = sortColumnIndex(state, reads, columnId);
  if (columnIndex === null) return null;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let headingRowCount = topRowIndex - (selectedArea(state, reads)?.topRowIndex ?? topRowIndex);
  let topLeft = reads.cellIdAt(state.sheetId, topRowIndex, leftColumnIndex);
  let topLeftWithHeadings = reads.cellIdAt(state.sheetId, topRowIndex - headingRowCount, leftColumnIndex);
  let bottomRight = reads.cellIdAt(state.sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
  let byColumn = reads.cellIdAt(state.sheetId, topRowIndex, columnIndex)?.columnId;
  return topLeft === null || topLeftWithHeadings === null || bottomRight === null || byColumn === undefined
    ? null
    : {
        topLeft: topLeft,
        bottomRight: bottomRight,
        byColumn: byColumn,
        column: columnLetters(columnIndex),
        areWholeRows: selectionAreaAndKind(state, reads)?.kind === 'rows',
        headingRowCount: headingRowCount,
        topLeftWithHeadings: topLeftWithHeadings,
      };
}
export function sortRange(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  act?: Dynamic,
  widening?: Dynamic,
  columnId?: Dynamic,
  withNoKeyboard?: Dynamic,
) {
  let plan = rangeSortPlan(state, reads, widening, columnId);
  if (plan === null) return withNoEffects(state);
  let {
    topLeft: topLeft,
    bottomRight: bottomRight,
    byColumn: byColumn,
    column: column,
    areWholeRows: areWholeRows,
    headingRowCount: headingRowCount,
  } = plan;
  let direction = act === 'sortRangeAscending' ? 'ascending' : 'descending';
  let rowSelection = areWholeRows ? selectionPositionsOf(state, reads) : null;
  let { activeCell: activeCell } = state;
  let walkedSelection = {
    ...selectionAtCell(activeCell),
    rangeWalked: {
      from: plan.topLeftWithHeadings,
      to: bottomRight,
      at: activeCell,
    },
  };
  return queueEdit(
    state,
    rowSelection === null
      ? {
          kind: 'sortCells',
          cells: areaRefBetween(topLeft, bottomRight),
          byColumn: byColumn,
          direction: direction,
        }
      : {
          kind: 'sortRows',
          sheetId: state.sheetId,
          oneRow: topLeft.rowId,
          otherRow: bottomRight.rowId,
          byColumn: byColumn,
          direction: direction,
        },
    {
      ...IF_QUEUED_DEFAULTS,
      select: rowSelection ?? (widening === 'table' ? walkedSelection : null),
      done: {
        what: 'cellsSorted',
        column: column,
        direction: direction,
        headingRowCount: headingRowCount,
      },
      undoOffer: withNoKeyboard
        ? {
            kind: 'sortedWithNoKeyboard',
            column: column,
            direction: direction,
            isSaved: false,
          }
        : null,
    },
  );
}
export function sortHoldsOfCell(reads: WorkbookReads, cellId?: Dynamic) {
  let cell = reads.cellOf(cellId);
  if (cell === null) return null;
  if (cell.input.kind === 'dropdownOption') {
    let { optionId: optionId } = cell.input;
    return reads.dropdownOf(cellId)?.options.some((option?: Dynamic) => option.optionId === optionId) === true ? 'options' : 'other';
  }
  let value = cell.value ?? (cell.input.kind === 'formula' ? null : cell.input);
  if (value === null || value.kind === 'boolean') return 'other';
  if (value.kind === 'error') return null;
  if (value.kind !== 'number') return value.kind === 'text' && value.value === '' ? null : 'text';
  let formatKind = numberFormatOfCell(reads, cellId).kind;
  if (formatKind === 'date' || formatKind === 'dateAndTime') return 'dates';
  if (formatKind !== 'time') return 'numbers';
  return value.value >= 0 && value.value < 1 ? 'times' : 'other';
}
export function sortHoldsOfColumnArea(
  reads: WorkbookReads,
  { sheetId: sheetId, columnId: columnId }: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic,
) {
  let holds: Dynamic = null;
  let dropdownId: Dynamic = null;
  for (let [rowId, columnIds] of reads.cellsHeldByRow(sheetId) as Dynamic) {
    if (!columnIds.has(columnId)) continue;
    let rowIndex = reads.rowIndexOf(sheetId, rowId);
    if (rowIndex === null || rowIndex < topRowIndex || rowIndex >= topRowIndex + rowCount) continue;
    let cellId = {
      sheetId: sheetId,
      rowId: rowId,
      columnId: columnId,
    };
    let cellHolds = sortHoldsOfCell(reads, cellId);
    if (cellHolds === null) continue;
    if (cellHolds === 'other' || (holds !== null && cellHolds !== holds)) return null;
    holds = cellHolds;
    if (cellHolds !== 'options') continue;
    let rowDropdownId = reads.dropdownOf(cellId)?.dropdownId ?? null;
    if (dropdownId !== null && rowDropdownId !== dropdownId) return null;
    dropdownId = rowDropdownId;
  }
  return holds;
}
export function sortHoldsOfColumn(reads: WorkbookReads, column?: Dynamic, span?: Dynamic) {
  let sheet = reads.sheetAsItStands(column.sheetId);
  if (sheet === null || span.rowCount < 1) return null;
  let bySpan = sortHoldsCache.get(sheet) ?? new (Map as Dynamic)();
  sortHoldsCache.set(sheet, bySpan);
  let key = `${column.columnId} ${span.topRowIndex} ${span.rowCount}`;
  let cached = bySpan.get(key);
  if (cached !== undefined) return cached;
  let holds = sortHoldsOfColumnArea(reads, column, span);
  bySpan.set(key, holds);
  return holds;
}
export function sortHoldsForMenu(state: PageState, reads: ReadsWithTextMeasurer, scope?: Dynamic, columnId?: Dynamic) {
  let { sheetId: sheetId } = state;
  let columnIndex = sortColumnIndex(state, reads, columnId);
  let byColumnId = columnIndex === null ? undefined : reads.cellIdAt(sheetId, 0, columnIndex)?.columnId;
  let span = scope === 'range' ? rangeSortArea(state, reads) : sheetSortArea(state, reads);
  return byColumnId === undefined || span === null
    ? null
    : sortHoldsOfColumn(
        reads,
        {
          sheetId: sheetId,
          columnId: byColumnId,
        },
        span,
      );
}
export function sortKeysHoldSpills(reads: WorkbookReads, edit?: Dynamic) {
  let [sheetId, oneRow, otherRow] =
    edit.kind === 'sortRows' ? [edit.sheetId, edit.oneRow, edit.otherRow] : [edit.cells.sheetId, edit.cells.oneCorner.r, edit.cells.otherCorner.r];
  let [oneRowIndex, otherRowIndex] = [reads.rowIndexOf(sheetId, oneRow), reads.rowIndexOf(sheetId, otherRow)];
  if (oneRowIndex === null || otherRowIndex === null) return false;
  let [topRowIndex, rowCount] = [Math.min(oneRowIndex, otherRowIndex), Math.abs(oneRowIndex - otherRowIndex) + 1];
  return [edit, ...(edit.thenBy ?? [])].some(({ byColumn: byColumn }: Dynamic) => {
    let columnIndex = reads.columnIndexOf(sheetId, byColumn);
    return (
      columnIndex !== null &&
      reads
        .cellsOnShowIn(sheetId, {
          topRowIndex: topRowIndex,
          rowCount: rowCount,
          leftColumnIndex: columnIndex,
          columnCount: 1,
        })
        .some((cellId?: Dynamic) => reads.spilledCellOf(cellId) !== null)
    );
  });
}
export const MIN_SORT_HEADING_ROWS = 1;
export const headingRowCountByFreeze = (state: PageState, reads: WorkbookReads) =>
  Math.max(MIN_SORT_HEADING_ROWS, sheetOfViewOrEmpty(state, reads).frozenRowCount);
export const headingRowCountByFilter = (state: PageState, reads: WorkbookReads) =>
  Math.max(MIN_SORT_HEADING_ROWS, rowBelowOwnFilterButtonsAt(state, reads, state.activeCell));
export const sortColumnIndex = (state: PageState, reads: WorkbookReads, columnId?: Dynamic) =>
  reads.columnIndexOf(state.sheetId, columnId ?? state.activeCell.columnId);
export const canSortRange = (state: PageState, reads: ReadsWithTextMeasurer) => rangeSortArea(state, reads) !== null;
export const rangeSortColumnLetters = (state: PageState, reads: ReadsWithTextMeasurer, columnId?: Dynamic) =>
  rangeSortPlan(state, reads, 'selection', columnId)?.column ?? null;
export const sortHoldsCache = new (WeakMap as Dynamic)();
