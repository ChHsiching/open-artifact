import type { Dynamic } from '../dynamic.ts';
import { areaCoveringChanges, changeHoldMsForCellCount } from '../agent/changes-by-agent.ts';
import { isAreaWithin } from '../selection/several-ranges.ts';
import { drawnOwnFiltersOfSheet, ownFiltersOfSheet } from './own-filters.ts';
import { tablesInSightOf, isTableCertain, areaOfFilteredTable, hasCellsOnShowIn } from './finding.ts';
import { isInSpan } from '../grid/geometry.ts';
import { hasNoUnformattedMark } from '../grid/sticky-headers.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function tableOutlineDelayAfterAgent(area: Dynamic, { sheetId: sheetId, changesByAgent: changesByAgent }: Dynamic, reads: WorkbookReads) {
  for (let change of changesByAgent as Dynamic) {
    if (change.isOfWholeLines || change.cells.activeCell.sheetId !== sheetId) continue;
    let changedArea = areaCoveringChanges([change, ...change.joinedWith], reads);
    if (changedArea === null || !isAreaWithin(area, changedArea)) continue;
    let afterMs = changeHoldMsForCellCount(changedArea.rowCount * changedArea.columnCount);
    return {
      revisionOfMark: change.revision,
      afterMs: afterMs,
    };
  }
  return null;
}
export function outlinableTablesOf(tables: Dynamic, state: PageState, reads: WorkbookReads) {
  let ownFilterAreas = headedAreasOfOwnFilters(drawnOwnFiltersOfSheet(state, state.sheetId), reads);
  return tables.flatMap((table?: Dynamic) => {
    let { area: area, header: header } = table;
    if (!canOutlineTable(table, state, reads)) return [];
    if (ownFilterAreas.some((input?: Dynamic) => doAreasIntersect(area, input.area))) return [];
    let rowCountOfHeader = header.last - header.first + 1;
    return [
      {
        ...table,
        rowCountOfHeader: rowCountOfHeader,
        comesLater: tableOutlineDelayAfterAgent(area, state, reads),
      },
    ];
  });
}
export function tablesToOutline(state: PageState, reads: ReadsWithTextMeasurer) {
  if (state.sheetPointedIn !== null) return NO_TABLES_IN_VIEW;
  let cached = tablesInViewCache.get(state);
  if (cached?.reads === reads) return cached.found;
  let tables = tablesInSightOf(state, reads).filter(({ table: table }: Dynamic) => isTableCertain(table));
  let found = tables.length === 0 ? NO_TABLES_IN_VIEW : outlinableTablesOf(tables, state, reads);
  tablesInViewCache.set(state, {
    reads: reads,
    found: found,
  });
  return found;
}
export function isRowHeaderOfTables(rowIndex: Dynamic, state: PageState, reads: ReadsWithTextMeasurer) {
  let headedAreas = [...tablesToOutline(state, reads), ...headedAreasOfOwnFilters(ownFiltersOfSheet(state, state.sheetId), reads)].filter(
    ({ area: area, rowCountOfHeader: rowCountOfHeader }: Dynamic) => rowCountOfHeader > 0 && area.topRowIndex === rowIndex,
  );
  return (
    headedAreas.length > 0 &&
    reads
      .columnIndexesOnShowIn(state.sheetId, rowIndex)
      .every(
        (columnIndex?: Dynamic) =>
          headedAreas.some(({ area: area }: Dynamic) => isInSpan(columnIndex, area.leftColumnIndex, area.columnCount)),
      )
  );
}
export function makeIsInTableHeader(headedAreas?: Dynamic) {
  if (headedAreas.length === 0) return isInNoTableHeader;
  return ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex }: Dynamic) =>
    headedAreas.some(
      ({ area: area, rowCountOfHeader: rowCountOfHeader }: Dynamic) =>
        isInSpan(topRowIndex, area.topRowIndex, rowCountOfHeader) && isInSpan(leftColumnIndex, area.leftColumnIndex, area.columnCount),
    );
}
export const doAreasIntersect = (area?: Dynamic, otherArea?: Dynamic) =>
  area.topRowIndex < otherArea.topRowIndex + otherArea.rowCount &&
  otherArea.topRowIndex < area.topRowIndex + area.rowCount &&
  area.leftColumnIndex < otherArea.leftColumnIndex + otherArea.columnCount &&
  otherArea.leftColumnIndex < area.leftColumnIndex + area.columnCount;
export const NO_TABLES_IN_VIEW: Dynamic = [];
export const headedAreasOfOwnFilters = (ownFilters: Dynamic, reads: WorkbookReads) =>
  ownFilters.flatMap((ownFilter?: Dynamic) => {
    let area = areaOfFilteredTable(reads, ownFilter);
    if (area === null) return [];
    return [
      {
        area: area,
        rowCountOfHeader: area.rowIndexOfButtons - area.topRowIndex + 1,
      },
    ];
  });
export const tablesInViewCache = new (WeakMap as Dynamic)();
export const canOutlineTable = (table: Dynamic, state: Dynamic, reads: WorkbookReads) =>
  hasCellsOnShowIn(table.sheetId, table.header, table.columns, reads) && hasNoUnformattedMark(state, table, reads);
export const tableAreaOfFilledBody = (area: Dynamic, tables: Dynamic, state: PageState, reads: WorkbookReads) =>
  [...tables, ...headedAreasOfOwnFilters(ownFiltersOfSheet(state, state.sheetId), reads)].find(
    ({ area: tableArea, rowCountOfHeader: rowCountOfHeader }: Dynamic) =>
      isAreaWithin(area, tableArea) &&
      area.columnCount === tableArea.columnCount &&
      area.topRowIndex <= tableArea.topRowIndex + rowCountOfHeader &&
      area.topRowIndex + area.rowCount === tableArea.topRowIndex + tableArea.rowCount,
  )?.area ?? null;
export const isInNoTableHeader = () => false;
