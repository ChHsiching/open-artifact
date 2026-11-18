import type { Dynamic } from '../dynamic.ts';
import {
  isSameByJson,
  allOwnFilters,
  lookStampOfWorkbook,
  ownFilterTableArea,
  filterTableOfCellTable,
  filterTableAtCell,
  withOwnFilterNotice,
  refreshStaleOwnFilters,
  addOwnFilterForTable,
  ownFilterAtCell,
  ownFiltersOfSheet,
  applyOwnFilter,
  ownFilterByKey,
  putOwnFiltersInForce,
  lookAgainAtOwnFilters,
  indexRangeOfArea,
  clearOwnSortByKey,
  lookAtOwnFilter,
  haveFilterColumnsChanged,
  lookAtOwnSort,
  addOwnFilter,
  ownFilterFromAnswer,
  nextOwnFilterKey,
  takeOwnRowOrderFromSorts,
  saidOfSortBy,
  NEVER_LOOKED_AT,
  isOwnFilterKeyUnused,
} from './own-filters.ts';
import { placedTablesOfSheet, tableKeyOf, areaOfFilteredTable, indexRangesOverlap } from './finding.ts';
import { hasNoUnformattedMark } from '../grid/sticky-headers.ts';
import { selectedArea, mergedAreaOrCellOf, isSameArea, activeAnchorCell } from '../selection/model.ts';
import { isAreaWithin } from '../selection/several-ranges.ts';
import { clearPassingNotice } from '../state/transitions.ts';
import { withValueFilter, withValueExcluded, filterWithoutEntry } from './filter-model.ts';
import { areasOverlap } from '../model/workbook.ts';
import { keepSelectionOnShownRows } from './filtered-rows.ts';
import { findSheetById, clampScrollOfView } from '../grid/layout.ts';
import { isCellShownBlank } from '../format/shown-text.ts';
import { cellValueOf } from '../model/cell-values.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isCellTableUndeclaredButSure(reads: WorkbookReads, { cellTable: cellTable, table: table }: Dynamic) {
  let found = reads.cellTableAt({
    sheetId: table.sheetId,
    rowId: cellTable.headerRows.firstRow,
    columnId: cellTable.firstColumn,
  });
  return found !== null && found.cellTableId === null && found.table?.table.header?.isSure === true && isSameByJson(found.cellTable, cellTable);
}
export function declareCellTableOfNewFilter(before: Dynamic, state: PageState, reads: WorkbookReads, isAllowed?: Dynamic) {
  let ownFiltersBefore = allOwnFilters(before);
  let newFilter = allOwnFilters(state).find(
    ({ cellTableId: cellTableId, cellTable: cellTable }: Dynamic) =>
      cellTableId === null && !ownFiltersBefore.some((input?: Dynamic) => isSameByJson(input.cellTable, cellTable)),
  );
  if (newFilter === undefined || !isAllowed || !isCellTableUndeclaredButSure(reads, newFilter))
    return {
      state: state,
      effects: [],
    };
  let { firstColumn: firstColumn, headerRows: headerRows } = newFilter.cellTable;
  let placed = placedTablesOfSheet(state, reads, newFilter.table.sheetId).all.find(
    ({ key: key }: Dynamic) => key === tableKeyOf(headerRows.firstRow, firstColumn),
  );
  if (placed !== undefined && !hasNoUnformattedMark(state, placed, reads))
    return {
      state: state,
      effects: [],
    };
  let rowsAskedFor = state.rowsAskedFor;
  let nextRowsAskedFor =
    rowsAskedFor !== null && rowsAskedFor.placeBeforeAsOf === lookStampOfWorkbook(state)
      ? {
          ...rowsAskedFor,
          placeBeforeAsOf: rowsAskedFor.placeBeforeAsOf + 1,
        }
      : rowsAskedFor;
  return {
    state: {
      ...state,
      rowsAskedFor: nextRowsAskedFor,
    },
    effects: [
      {
        kind: 'declareCellTable',
        sheetId: newFilter.table.sheetId,
        cellTable: newFilter.cellTable,
      },
    ],
  };
}
export function isOneCellSelected(state: PageState, reads: WorkbookReads) {
  let [area, cellArea] = [selectedArea(state, reads), mergedAreaOrCellOf(reads, state.activeCell)];
  return area !== null && cellArea !== null && isSameArea(area, cellArea);
}
export function cellTableFromSelection(state: PageState, reads: WorkbookReads) {
  let area = selectedArea(state, reads);
  if (area === null || area.rowCount < 2) return null;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, columnCount: columnCount } = area;
  let firstCellId = reads.cellIdAt(state.sheetId, topRowIndex, leftColumnIndex);
  let lastCellId = reads.cellIdAt(state.sheetId, topRowIndex, leftColumnIndex + columnCount - 1);
  if (firstCellId === null || lastCellId === null) return null;
  return {
    headerRows: {
      firstRow: firstCellId.rowId,
      lastRow: firstCellId.rowId,
    },
    firstColumn: firstCellId.columnId,
    lastColumn: lastCellId.columnId,
    footerRows: null,
  };
}
export function selectionMatchesFilterTable(state: PageState, reads: WorkbookReads, filterTable?: Dynamic) {
  let area = selectedArea(state, reads);
  let recordsArea = filterTable === null ? null : ownFilterRecordsArea(reads, filterTable);
  let tableArea = filterTable === null ? null : ownFilterTableArea(reads, filterTable);
  if (area === null || recordsArea === null || tableArea === null) return false;
  let recordsToEnd = {
    ...recordsArea,
    rowCount: tableArea.topRowIndex + tableArea.rowCount - recordsArea.topRowIndex,
  };
  if (isSameArea(area, recordsArea) || isSameArea(area, recordsToEnd)) return true;
  return area.columnCount < recordsArea.columnCount && isAreaWithin(area, recordsToEnd);
}
export function cellTableWithFooterFromSelection(state: PageState, reads: WorkbookReads, filterTable?: Dynamic) {
  let area = selectedArea(state, reads);
  let recordsArea = filterTable === null ? null : ownFilterRecordsArea(reads, filterTable);
  if (filterTable === null || area === null || recordsArea === null) return null;
  if (
    !(
      area.topRowIndex === recordsArea.topRowIndex &&
      area.rowCount >= 2 &&
      area.rowCount < recordsArea.rowCount &&
      area.leftColumnIndex === recordsArea.leftColumnIndex &&
      area.columnCount === recordsArea.columnCount
    )
  )
    return null;
  let rowIdAt = (rowIndex?: Dynamic) => reads.cellIdAt(state.sheetId, rowIndex, recordsArea.leftColumnIndex)?.rowId ?? null;
  let firstFooterRow = rowIdAt(area.topRowIndex + area.rowCount);
  let lastFooterRow = filterTable.liveCellTable.footerRows?.lastRow ?? rowIdAt(recordsArea.topRowIndex + recordsArea.rowCount - 1);
  if (firstFooterRow === null || lastFooterRow === null) return null;
  return {
    ...filterTable.cellTable,
    footerRows: {
      firstRow: firstFooterRow,
      lastRow: lastFooterRow,
    },
  };
}
export function filterTableForSelection(state: PageState, reads: WorkbookReads) {
  let cellTableEntry = reads.cellTableAt(activeAnchorCell(state, reads));
  let filterTable = filterTableOfCellTable(cellTableEntry);
  if (isOneCellSelected(state, reads)) return filterTable;
  let area = filterTable === null ? selectedArea(state, reads) : null;
  let topLeftCellId = area === null ? null : reads.cellIdAt(state.sheetId, area.topRowIndex, area.leftColumnIndex);
  let filterTableAtTopLeft = topLeftCellId === null ? null : filterTableAtCell(reads, topLeftCellId);
  if (selectionMatchesFilterTable(state, reads, filterTableAtTopLeft)) return filterTableAtTopLeft;
  let isTableSettled =
    (cellTableEntry !== null && cellTableEntry.cellTableId !== null) || selectionMatchesFilterTable(state, reads, filterTable);
  let cellTable =
    cellTableWithFooterFromSelection(state, reads, filterTable) ?? (isTableSettled ? null : cellTableFromSelection(state, reads));
  return cellTable === null ? filterTable : filterTableOfCellTable(reads.cellTableDeclaredAs(state.sheetId, cellTable));
}
export function toggleOwnFilterOnSelection(state: PageState, reads: ReadsWithTextMeasurer) {
  let filterTable = filterTableForSelection(state, reads);
  if (filterTable === null)
    return withOwnFilterNotice(state, {
      kind: 'noTableToFilter',
    });
  let refreshed = refreshStaleOwnFilters(clearPassingNotice(state), reads, filterTable.table.sheetId);
  return ownFilterOfTable(refreshed, filterTable) === null ? addOwnFilterForTable(refreshed, reads, filterTable) : refreshed;
}
export function ownFilterRecordsArea(reads: WorkbookReads, ownFilter?: Dynamic) {
  let area = areaOfFilteredTable(reads, ownFilter);
  if (area === null) return null;
  let firstRecordIndex = area.rowIndexOfButtons + 1;
  return {
    ...area,
    topRowIndex: firstRecordIndex,
    rowCount: area.topRowIndex + area.rowCount - firstRecordIndex,
  };
}
export function filterByCellValue(state: PageState, reads: ReadsWithTextMeasurer, how?: Dynamic) {
  let cell = activeAnchorCell(state, reads);
  let refreshed = refreshStaleOwnFilters(state, reads, cell.sheetId);
  let filterAtCell = ownFilterAtCell(refreshed, reads, cell);
  let filterTable = filterAtCell ?? filterTableAtCell(reads, cell);
  if (filterTable === null)
    return withOwnFilterNotice(refreshed, {
      kind: 'noTableToFilter',
    });
  let ownFilter = filterAtCell ?? ownFilterOfTable(refreshed, filterTable);
  let withFilter = ownFilter === null ? addOwnFilterForTable(clearPassingNotice(refreshed), reads, filterTable) : refreshed;
  let target = ownFilter ?? ownFiltersOfSheet(withFilter, cell.sheetId).at(-1);
  let isFilterColumn = filterTable.columns.some(({ c: c }: Dynamic) => c === cell.columnId);
  if (target === undefined || !isFilterColumn || !isCellInFilterRecords(reads, target, cell)) return withFilter;
  let [columnId, value] = [cell.columnId, filterValueOfCell(reads, cell)];
  return applyOwnFilter(
    clearPassingNotice(withFilter),
    reads,
    target,
    how === 'only'
      ? withValueFilter(target.filter, columnId, {
          kind: 'isOneOf',
          values: [value],
        })
      : withValueExcluded(target.filter, columnId, value),
  );
}
export function removeOwnFilterLine(state: PageState, reads: ReadsWithTextMeasurer, key?: Dynamic, entry?: Dynamic) {
  let ownFilter = ownFilterByKey(state, key);
  if (ownFilter === null || ownFilter.filter === null) return state;
  return applyOwnFilter(state, reads, ownFilter, filterWithoutEntry(ownFilter.filter, entry));
}
export function clearOwnFilters(state: Dynamic, reads: ReadsWithTextMeasurer, which?: Dynamic) {
  let sheetId = 'sheetId' in which ? which.sheetId : ownFilterByKey(state, which.tableKey)?.table.sheetId;
  if (sheetId === undefined) return state;
  return putOwnFiltersInForce(
    {
      ...state,
      ownFilterList: null,
    },
    reads,
    sheetId,
    ownFiltersOfSheet(state, sheetId).filter(({ key: key }: Dynamic) => 'tableKey' in which && key !== which.tableKey),
  );
}
export function reapplyOwnFiltersAfterEdit(state: Dynamic, reads: ReadsWithTextMeasurer, message?: Dynamic) {
  let isEditQueued = message.kind === 'editAnswered' && message.outcome.kind === 'editQueued';
  let isSort = isEditQueued && (message.edit.kind === 'sortRows' || message.edit.kind === 'sortCells');
  return (
    isSort || (isEditQueued && message.ifQueued.reachesRowsOutOfView === true)
      ? [message.outcome.placeChanged]
      : message.kind === 'undoOrRedoAnswered' && message.outcome.kind === 'made'
        ? [...(message.outcome.changedBefore ?? []), message.outcome.changed]
        : []
  ).reduce((next: Dynamic, changed: Dynamic) => {
    if (changed === null || changed.area === null) return next;
    let { sheetId: sheetId, area: area } = changed;
    return ownFiltersOfSheet(next, sheetId).some((ownFilter?: Dynamic) => {
      let recordsArea = ownFilterRecordsArea(reads, ownFilter);
      return recordsArea !== null && areasOverlap(recordsArea, area);
    })
      ? lookAgainAtOwnFilters(
          next,
          reads,
          isSort
            ? 'apply'
            : {
                applyIfARowIsMissedAmong: area,
              },
          sheetId,
        )
      : next;
  }, state);
}
export function dropOwnSortAfterSortEdit(state: PageState, reads: ReadsWithTextMeasurer, message?: Dynamic) {
  if (message.kind !== 'editAnswered' || message.outcome.kind === 'refused') return state;
  let { edit: edit } = message;
  let [sheetId, ...rowIds] =
    edit.kind === 'sortRows'
      ? [edit.sheetId, edit.oneRow, edit.otherRow]
      : edit.kind === 'sortCells'
        ? [edit.cells.sheetId, edit.cells.oneCorner.r, edit.cells.otherCorner.r]
        : [];
  if (sheetId === undefined) return state;
  let sorted = ownFiltersOfSheet(state, sheetId).find(({ sort: sort }: Dynamic) => sort !== null);
  let recordsArea = sorted === undefined ? null : ownFilterRecordsArea(reads, sorted);
  let rowIndexes = rowIds.flatMap((rowId?: Dynamic) => reads.rowIndexOf(sheetId, rowId) ?? []);
  if (sorted === undefined || recordsArea === null) return state;
  return indexRangesOverlap(indexRangeOfArea(recordsArea), {
    first: (Math.min as Dynamic)(...rowIndexes),
    last: (Math.max as Dynamic)(...rowIndexes),
  })
    ? dropUnusedOwnFilter(clearOwnSortByKey(state, reads, sorted.key), reads, sorted.key)
    : state;
}
export function reapplyOwnFiltersAfterAnswer(state: PageState, reads: ReadsWithTextMeasurer, message?: Dynamic) {
  let next = reapplyOwnFiltersAfterEdit(dropOwnSortAfterSortEdit(state, reads, message), reads, message);
  return message.kind === 'editAnswered' && (message.edit.kind === 'sortRows' || message.edit.kind === 'sortCells')
    ? keepSelectionOnShownRows(next, reads)
    : next;
}
export function ownFiltersOfExistingSheets({ ownFilters: ownFilters }: Dynamic, reads: WorkbookReads) {
  let kept = [...ownFilters].filter(([sheetId]: Dynamic) => findSheetById(reads, sheetId) !== undefined);
  return kept.length === ownFilters.size ? ownFilters : new (Map as Dynamic)(kept);
}
export function bringBackOwnFilter(state: PageState, reads: ReadsWithTextMeasurer, { filter: filter, sortBy: sortBy, ...held }: Dynamic) {
  let looked = lookAtOwnFilter(reads, held, filter);
  if (looked.kind === 'tableIsGone') return state;
  if (looked.kind === 'answered' && (filter ?? sortBy) !== null && haveFilterColumnsChanged(looked.found, held)) return state;
  if (looked.kind === 'answered') {
    let sort =
      sortBy === null
        ? null
        : lookAtOwnSort(
            reads,
            looked.found,
            {
              by: sortBy,
              rows: null,
            },
            null,
          );
    let next = addOwnFilter(state, reads, ownFilterFromAnswer(state, reads, nextOwnFilterKey(state), looked, sort));
    return takeOwnRowOrderFromSorts(next, held.table.sheetId);
  }
  let isWorthKeeping = looked.why === 'dayIsNotKnown' || looked.why === 'tookTooLong';
  let ownFilter = {
    ...ownFilterFromAnswer(
      state,
      reads,
      nextOwnFilterKey(state),
      {
        kind: 'answered',
        found: held,
        filter: isWorthKeeping ? filter : null,
        rows: null,
      },
      sortBy === null
        ? null
        : {
            by: sortBy,
            said: saidOfSortBy(reads, held, sortBy),
            rows: null,
            isRefused: false,
          },
    ),
    lookedAtAsOf: NEVER_LOOKED_AT,
  };
  return addOwnFilter(
    state,
    reads,
    isWorthKeeping && filter !== null
      ? {
          ...ownFilter,
          unanswered: {
            why: looked.why,
            tries: 1,
          },
        }
      : ownFilter,
  );
}
export function bringBackOwnFilters(state: PageState, reads: ReadsWithTextMeasurer, heldFilters?: Dynamic) {
  let { scrollLeft: scrollLeft, scrollTop: scrollTop, notice: notice } = state;
  let restored = heldFilters.reduce((state2?: Dynamic, held?: Dynamic) => bringBackOwnFilter(state2, reads, held), state);
  return clampScrollOfView(
    {
      ...restored,
      scrollLeft: scrollLeft,
      scrollTop: scrollTop,
      notice: notice,
    },
    reads,
  );
}
export const ownFilterOfTable = (state?: Dynamic, filterTable?: Dynamic) =>
  ownFiltersOfSheet(state, filterTable.table.sheetId).find(
    (ownFilter?: Dynamic) =>
      filterTable.cellTableId === null ? isSameByJson(ownFilter.cellTable, filterTable.cellTable) : ownFilter.cellTableId === filterTable.cellTableId,
  ) ?? null;
export const isCellInFilterRecords = (reads: WorkbookReads, ownFilter?: Dynamic, cellId?: Dynamic) => {
  let [recordsArea, cellArea] = [ownFilterRecordsArea(reads, ownFilter), mergedAreaOrCellOf(reads, cellId)];
  return recordsArea !== null && cellArea !== null && areasOverlap(recordsArea, cellArea);
};
export const filterValueOfCell = (reads: WorkbookReads, cellId?: Dynamic) => {
  let cell = reads.cellOnShowIn(cellId);
  return isCellShownBlank(cell) ? null : cellValueOf(cell);
};
export const dropUnusedOwnFilter = (state: Dynamic, reads: ReadsWithTextMeasurer, key?: Dynamic) =>
  isOwnFilterKeyUnused(state, key)
    ? clearOwnFilters(state, reads, {
        tableKey: key,
      })
    : state;
export const ownFiltersToKeep = (state?: Dynamic) =>
  allOwnFilters(state).map(
    ({
      cellTableId: cellTableId,
      cellTable: cellTable,
      liveCellTable: liveCellTable,
      table: table,
      columns: columns,
      filter: filter,
      sort: sort,
    }: Dynamic) => ({
      cellTableId: cellTableId,
      cellTable: cellTable,
      liveCellTable: liveCellTable,
      table: table,
      columns: columns,
      filter: filter,
      sortBy: sort?.by ?? null,
    }),
  );
