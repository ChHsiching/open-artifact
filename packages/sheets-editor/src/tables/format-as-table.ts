import type { Dynamic } from '../dynamic.ts';
import { areasOfAllRanges, isAreaWithin } from '../selection/several-ranges.ts';
import { placedTablesOfSheet, areaOfFilteredTable, isTableCertain, tableEdgesOf, hasCellsOnShowIn, tablesReadState } from './finding.ts';
import { outlinableTablesOf } from './tables-in-view.ts';
import { areasOverlap } from '../model/workbook.ts';
import { ownFiltersOfSheet } from './own-filters.ts';
import { hasNoUnformattedMark, unformattedMarksInHeader } from '../grid/sticky-headers.ts';
import { withNoEffects } from '../state/transitions.ts';
import { keepActiveCellClearOfStuckHeaders } from '../selection/keep-in-view.ts';
import { IF_QUEUED_DEFAULTS, queueEdit } from '../model/edit-effects.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function tableHoldingSelectionToFormat(state: PageState, workbook: WorkbookReads) {
  let areas = areasOfAllRanges(state, workbook);
  if (areas.length === 0) return null;
  let tables = placedTablesOfSheet(state, workbook, state.sheetId).certain.filter(
    ({ area: area }: Dynamic) => areas.every((areaSelected?: Dynamic) => isAreaWithin(areaSelected, area)),
  );
  return (
    outlinableTablesOf(
      tables,
      {
        ...state,
        tablesNotFormatted: [],
      },
      workbook,
    )[0] ?? null
  );
}
export function cellTableToDeclareAtSelection(state: PageState, workbook: WorkbookReads) {
  let { sheetId: sheetId } = state;
  let [area, ...otherAreas] = areasOfAllRanges(state, workbook);
  if (area === undefined || otherAreas.length > 0) return null;
  let tablesHit = placedTablesOfSheet(state, workbook, sheetId).all.filter((placed?: Dynamic) => areasOverlap(area, placed.area));
  if (
    ownFiltersOfSheet(state, sheetId).some((ownFilter?: Dynamic) => {
      let filteredArea = areaOfFilteredTable(workbook, ownFilter);
      return filteredArea !== null && areasOverlap(area, filteredArea);
    }) ||
    tablesHit.some((placed?: Dynamic) => isTableCertain(placed.table) && hasNoUnformattedMark(state, placed, workbook))
  )
    return null;
  let [firstHit, ...otherHits] = tablesHit;
  if (firstHit === undefined) return null;
  let headerRow = Math.max(area.topRowIndex, Math.min(...tablesHit.map(({ header: header }: Dynamic) => header.first)));
  let columns = {
    first: Math.max(area.leftColumnIndex, Math.min(...tablesHit.map((placed?: Dynamic) => placed.columns.first))),
    last: Math.min(area.leftColumnIndex + area.columnCount - 1, Math.max(...tablesHit.map((placed?: Dynamic) => placed.columns.last))),
  };
  if (
    otherHits.length === 0 &&
    (area.rowCount < 2 || columns.last - columns.first + 1 < firstHit.area.columnCount || headerRow <= firstHit.header.last + 1)
  )
    return isTableCertain(firstHit.table) || firstHit.body === null ? null : tableEdgesOf(firstHit.table);
  let hasCellsOnShowInRow = (row?: Dynamic) =>
    hasCellsOnShowIn(
      sheetId,
      {
        first: row,
        last: row,
      },
      columns,
      workbook,
    );
  let firstCell = workbook.cellIdAt(sheetId, headerRow, columns.first);
  let lastCell = workbook.cellIdAt(sheetId, headerRow, columns.last);
  if (firstCell === null || lastCell === null || !hasCellsOnShowInRow(headerRow) || !hasCellsOnShowInRow(headerRow + 1)) return null;
  return {
    headerRows: {
      firstRow: firstCell.rowId,
      lastRow: firstCell.rowId,
    },
    firstColumn: firstCell.columnId,
    lastColumn: lastCell.columnId,
    footerRows: null,
  };
}
export function formatAsTableChoice(state: PageState, workbook: WorkbookReads, canEdit?: Dynamic) {
  let table = tableHoldingSelectionToFormat(state, workbook);
  let basis = table?.table.basis;
  let canDeclare = canEdit && tablesReadState(state, state.sheetId) === 'asTheyAre';
  if (table !== null && basis?.kind === 'declared')
    return canDeclare
      ? {
          kind: 'remove',
          table: table,
          cellTableId: basis.cellTableId,
        }
      : null;
  if (table !== null && hasNoUnformattedMark(state, table, workbook))
    return {
      kind: 'look',
      table: table,
      isOn: false,
    };
  let cellTable = canDeclare ? cellTableToDeclareAtSelection(state, workbook) : null;
  if (cellTable !== null)
    return {
      kind: 'declare',
      cellTable: cellTable,
    };
  return table === null
    ? null
    : {
        kind: 'look',
        table: table,
        isOn: true,
      };
}
export function formatAsTableState(state: PageState, workbook: WorkbookReads, canEdit?: Dynamic) {
  let choice = formatAsTableChoice(state, workbook, canEdit);
  return choice === null
    ? null
    : {
        isOn: !isFormatAsTableChoiceOn(choice),
        isForEveryone: choice.kind !== 'look',
      };
}
export function tablesNotFormattedAfterChoice(marks: Dynamic, table: Dynamic, isOn: Dynamic, workbook: WorkbookReads) {
  let { headerRows: headerRows, firstColumn: firstColumn } = table.table;
  let marksInHeader = unformattedMarksInHeader(table, marks, workbook);
  let keptMarks = marks.filter((mark?: Dynamic) => !marksInHeader.includes(mark));
  return isOn
    ? keptMarks
    : [
        ...keptMarks,
        {
          sheetId: table.sheetId,
          rowId: headerRows.firstRow,
          columnId: firstColumn,
        },
      ];
}
export function setFormatAsTable(state: PageState, workbook: ReadsWithTextMeasurer, canEdit: Dynamic, { isOn: isOn, kept: kept }: Dynamic) {
  let choice = formatAsTableChoice(state, workbook, canEdit);
  let closed = {
    ...state,
    menu: null,
  };
  let done = {
    what: isOn ? 'formattedAsTable' : 'notFormattedAsTable',
  };
  let marks = kept ?? state.tablesNotFormatted;
  if (choice?.kind === 'look') {
    let looked = {
      ...closed,
      tablesNotFormatted: tablesNotFormattedAfterChoice(marks, choice.table, isOn, workbook),
      formatAsTableChosenLast: {
        isOn: isOn,
        before: marks,
      },
      lastDone: done,
    };
    return withNoEffects(keepActiveCellClearOfStuckHeaders(state, looked, workbook));
  }
  if (choice === null || isFormatAsTableChoiceOn(choice) !== isOn) return withNoEffects(closed);
  let { sheetId: sheetId } = state;
  let ifQueued = {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: done,
  };
  if (choice.kind === 'declare') {
    let { cellTable: cellTable } = choice;
    let scroll = {
      scrollLeft: state.scrollLeft,
      scrollTop: state.scrollTop,
    };
    return queueEdit(
      {
        ...closed,
        leftByKeyAt: scroll,
      },
      {
        kind: 'declareCellTable',
        sheetId: sheetId,
        cellTable: cellTable,
        isAskedFor: true,
      },
      ifQueued,
    );
  }
  return queueEdit(
    {
      ...closed,
      tablesNotFormatted: tablesNotFormattedAfterChoice(marks, choice.table, false, workbook),
    },
    {
      kind: 'removeCellTable',
      sheetId: sheetId,
      cellTableId: choice.cellTableId,
    },
    ifQueued,
  );
}
export function undoFormatAsTableChosenLast(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (state.formatAsTableChosenLast === null) return null;
  let { isOn: isOn, before: before } = state.formatAsTableChosenLast;
  let undone = {
    ...state,
    tablesNotFormatted: before,
    formatAsTableChosenLast: null,
    lastDone: {
      what: isOn ? 'notFormattedAsTable' : 'formattedAsTable',
    },
  };
  return keepActiveCellClearOfStuckHeaders(state, undone, workbook);
}
export const isFormatAsTableChoiceOn = (choice?: Dynamic) => (choice.kind === 'look' ? choice.isOn : choice.kind === 'declare');
