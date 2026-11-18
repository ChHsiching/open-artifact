import type { Dynamic } from '../dynamic.ts';
import {
  hitTestGrid,
  columnRunSpanOnScreen,
  rowRunSpanOnScreen,
  isInSpan,
  frozenColumnsWidth,
  frozenRowsHeight,
  rangeSpansOnScreen,
  cellsAreaWidth,
} from '../grid/geometry.ts';
import { ROW_HEADER_WIDTH, firstLineHeight } from '../grid/cell-metrics-values.ts';
import { areaOfFilteredTable } from './finding.ts';
import { shownLineAtOrAfter, shownLineAtOrBefore } from '../model/line-sizes.ts';
import { FILTER_BUTTON_SIZE, filterButtonsOfTable, ROOM_AT_TABLE_END_FOR_FILTER_BUTTONS, FILTER_BUTTON_GAP } from './filter-buttons-place.ts';
import { layoutOfView } from '../grid/layout.ts';
import { drawnOwnFiltersOfSheet, ownFiltersOfSheet, ownFilterNotDrawnYet } from './own-filters.ts';
import { tablesToOutline } from './tables-in-view.ts';
import { flattenLineBreaks } from '../grid/text-overflow.ts';
import { textRoomPastPadding, cellPaddingBeside } from '../grid/cell-metrics.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function columnsUnderHeldButton(heldInView?: Dynamic, view?: Dynamic, layout?: Dynamic) {
  let columns: Dynamic = [];
  let end = heldInView === null ? 0 : heldInView.left + heldInView.width;
  for (let left: Dynamic = heldInView?.left ?? 0; left < end; ) {
    let hit = hitTestGrid(
      {
        x: ROW_HEADER_WIDTH + left + 0.5,
        y: 0,
      },
      view,
      layout,
    );
    if (hit?.kind !== 'columnHeader') break;
    let { columnIndex: columnIndex } = hit;
    let columnSpan = columnRunSpanOnScreen(
      {
        firstIndex: columnIndex,
        count: 1,
      },
      view,
      layout,
      view,
    );
    let width = Math.min(end, columnSpan.end) - left;
    if (width <= 0) break;
    columns.push({
      left: left,
      width: width,
      columnIndex: columnIndex,
    });
    left += width;
  }
  return columns;
}
export function filterButtonRowIndex(reads: WorkbookReads, ownFilter: Dynamic, { rowEdges: rowEdges, rowCount: rowCount }: Dynamic) {
  let area = areaOfFilteredTable(reads, ownFilter);
  if (area === null) return null;
  let rowIndex = shownLineAtOrAfter(rowEdges, area.rowIndexOfButtons);
  return rowIndex < rowCount ? rowIndex : null;
}
export function lastWideColumnOfFoundTable({ area: area }: Dynamic, { columnEdges: columnEdges }: Dynamic) {
  let leftColumnIndex = area.leftColumnIndex;
  for (let columnIndex: Dynamic = leftColumnIndex + area.columnCount - 1; columnIndex > leftColumnIndex; columnIndex -= 1)
    if (columnEdges.sizeOf(columnIndex) >= FILTER_BUTTON_SIZE) return columnIndex;
  return leftColumnIndex;
}
export function tablesWithFilterButtons(view: Dynamic, reads: ReadsWithTextMeasurer) {
  let cached = tablesWithButtonsCache.get(view);
  if (cached?.reads === reads) return cached.tables;
  let { sheetId: sheetId } = view;
  let layout = layoutOfView(view, reads);
  let ownFilterTables = drawnOwnFiltersOfSheet(view, sheetId).flatMap((ownFilter?: Dynamic) => {
    let rowIndex = filterButtonRowIndex(reads, ownFilter, layout);
    return rowIndex === null
      ? []
      : [
          {
            ...ownFilter,
            rowIndex: rowIndex,
          },
        ];
  });
  let foundTables = tablesToOutline(view, reads).flatMap((foundTable?: Dynamic) => {
    let { key: key, area: area, rowCountOfHeader: rowCountOfHeader } = foundTable;
    let table = {
      sheetId: sheetId,
      header: foundTable.table.headerRows,
    };
    let rowIndex = area.topRowIndex + rowCountOfHeader - 1;
    let cellId = reads.cellIdAt(sheetId, rowIndex, lastWideColumnOfFoundTable(foundTable, layout));
    if (shownLineAtOrAfter(layout.rowEdges, rowIndex) !== rowIndex || cellId === null) return [];
    let columns = [
      {
        c: cellId.columnId,
        name: null,
      },
    ];
    let columnsOfFound = {
      firstIndex: area.leftColumnIndex,
      count: area.columnCount,
    };
    return [
      {
        key: key,
        table: table,
        columns: columns,
        filter: null,
        columnsOfFound: columnsOfFound,
        rowIndex: rowIndex,
      },
    ];
  });
  let tables = [...ownFilterTables, ...foundTables];
  tablesWithButtonsCache.set(view, {
    reads: reads,
    tables: tables,
  });
  return tables;
}
export function rowSpanInStuckHeader(stuckHeader: Dynamic, rowIndex: Dynamic, { rowEdges: rowEdges }: Dynamic) {
  let start = stuckHeader.top + rowEdges.startOf(rowIndex) - stuckHeader.topInSheet;
  return {
    start: start,
    end: start + rowEdges.startOf(rowIndex + 1) - rowEdges.startOf(rowIndex),
    showFrom: stuckHeader.showFrom,
    showTo: stuckHeader.top + stuckHeader.height,
    isEndUnderFrozenLines: false,
  };
}
export function doesHeaderTextWrapBesideButton(
  textMeasurer: Dynamic,
  cellValue: Dynamic,
  font: Dynamic,
  { cellWidth: cellWidth, clearAtLeft: clearAtLeft }: Dynamic,
) {
  let flatText = flattenLineBreaks(cellValue);
  let textRoom = textRoomPastPadding(cellWidth - filterButtonRoomInCell(cellWidth)) + (cellPaddingBeside('comfortable') - clearAtLeft);
  let textWidth = textMeasurer.widthOfCharacters(flatText, font);
  if (firstLineHeight(font.size) > FILTER_BUTTON_SIZE || textWidth <= textRoom || textWidth > textRoomPastPadding(cellWidth)) return false;
  let [lineCount = 1] = textMeasurer.lineCountsOfWrappedTexts([
    {
      text: flatText,
      font: font,
      widthInPixels: textRoom,
    },
  ]);
  return lineCount > 1;
}
export function filterButtonAtPoint(point: Dynamic, { body: body, filterButtons: filterButtons }: Dynamic) {
  let [x, y] = [point.x - body.left, point.y - body.top];
  let match = filterButtons.find(
    ({ cell: cell }: Dynamic) => x >= cell.left && x < cell.left + cell.width && y >= cell.top && y < cell.top + cell.height,
  );
  return match === undefined
    ? null
    : {
        tableKey: match.tableKey,
        c: match.c,
      };
}
export function makeHasFilterButton(view: Dynamic, reads: ReadsWithTextMeasurer, layout?: Dynamic) {
  let tables = tablesWithFilterButtons(view, reads);
  if (tables.length === 0) return matchesNoCell;
  let columnIdsByRow = new (Map as Dynamic)();
  for (let table of tables as Dynamic) {
    let { rowIndex: rowIndex } = table;
    let { start: start, end: end } = rowRunSpanOnScreen(
      {
        firstIndex: rowIndex,
        count: 1,
      },
      view,
      layout,
      view,
    );
    if (end - start < FILTER_BUTTON_SIZE) continue;
    let columnIds = columnIdsByRow.get(rowIndex) ?? new (Set as Dynamic)();
    for (let { c: columnId } of table.columns as Dynamic) columnIds.add(columnId);
    columnIdsByRow.set(rowIndex, columnIds);
  }
  return (rowIndex?: Dynamic, columnId?: Dynamic) => columnIdsByRow.get(rowIndex)?.has(columnId) === true;
}
export function makeIsFilterHeaderArea(view: Dynamic, reads: ReadsWithTextMeasurer, layout?: Dynamic) {
  let hasFilterButton = makeHasFilterButton(view, reads, layout);
  let columnIndexesByRow = new (Map as Dynamic)();
  for (let ownFilter of drawnOwnFiltersOfSheet(view, view.sheetId) as Dynamic) {
    let rowIndex = areaOfFilteredTable(reads, ownFilter)?.rowIndexOfButtons;
    if (rowIndex === undefined) continue;
    let columnIndexes = columnIndexesByRow.get(rowIndex) ?? new (Set as Dynamic)();
    for (let { c: columnId } of ownFilter.columns as Dynamic) {
      let columnIndex = hasFilterButton(rowIndex, columnId) ? reads.columnIndexOf(view.sheetId, columnId) : null;
      if (columnIndex !== null) columnIndexes.add(columnIndex);
    }
    columnIndexesByRow.set(rowIndex, columnIndexes);
  }
  return ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic) => {
    for (let [rowIndex, columnIndexes] of columnIndexesByRow as Dynamic) {
      if (!isInSpan(rowIndex, topRowIndex, rowCount)) continue;
      for (let columnIndex: Dynamic = leftColumnIndex; columnIndex < leftColumnIndex + columnCount; columnIndex += 1)
        if (columnIndexes.has(columnIndex)) return true;
    }
    return false;
  };
}
export function makeIsColumnLineInTable(view: Dynamic, reads: WorkbookReads, { columnEdges: columnEdges }: Dynamic, foundTables?: Dynamic) {
  let spans = [
    ...ownFiltersOfSheet(view, view.sheetId).map((ownFilter?: Dynamic) => areaOfFilteredTable(reads, ownFilter)),
    ...foundTables.map(({ area: area }: Dynamic) => area),
  ].flatMap((area?: Dynamic) => {
    if (area === null) return [];
    let { topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount } = area;
    let first = shownLineAtOrBefore(columnEdges, leftColumnIndex - 1);
    if (shownLineAtOrBefore(columnEdges, leftColumnIndex + columnCount - 1) === first) return [];
    return [
      {
        topRowIndex: topRowIndex,
        rowCount: rowCount,
        first: first,
        count: leftColumnIndex + columnCount - first,
      },
    ];
  });
  if (spans.length === 0) return matchesNoCell;
  return (rowIndex?: Dynamic, columnIndex?: Dynamic) =>
    spans.some(
      ({ topRowIndex: topRowIndex, rowCount: rowCount, first: first, count: count }: Dynamic) =>
        isInSpan(rowIndex, topRowIndex, rowCount) && isInSpan(columnIndex, first, count),
    );
}
export function makeIsInTable(view: Dynamic, reads: WorkbookReads, foundTables?: Dynamic) {
  let areas = [
    ...ownFiltersOfSheet(view, view.sheetId).map((ownFilter?: Dynamic) => areaOfFilteredTable(reads, ownFilter)),
    ...foundTables.map(({ area: area }: Dynamic) => area),
  ].filter((area?: Dynamic) => area !== null);
  return ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex }: Dynamic) =>
    areas.some(
      (area?: Dynamic) =>
        isInSpan(topRowIndex, area.topRowIndex, area.rowCount) && isInSpan(leftColumnIndex, area.leftColumnIndex, area.columnCount),
    );
}
export function makeTableEdgeColumnsOfRow(view: Dynamic, reads: WorkbookReads, { columnEdges: columnEdges }: Dynamic, foundTables?: Dynamic) {
  let areas = [
    ...ownFiltersOfSheet(view, view.sheetId).map((ownFilter?: Dynamic) => areaOfFilteredTable(reads, ownFilter)),
    ...foundTables.map(({ area: area }: Dynamic) => area),
  ]
    .filter((area?: Dynamic) => area !== null)
    .filter(
      ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
        shownLineAtOrAfter(columnEdges, leftColumnIndex) < leftColumnIndex + columnCount,
    );
  if (areas.length === 0) return () => NO_TABLE_EDGE_COLUMNS;
  return (rowIndex?: Dynamic) =>
    areas.flatMap(
      ({ topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
        isInSpan(rowIndex, topRowIndex, rowCount) ? [leftColumnIndex - 1, leftColumnIndex + columnCount - 1] : [],
    );
}
export function cutSidesOfTableSpans({ across: across, down: down }: Dynamic, layout?: Dynamic) {
  let [frozenWidth, frozenHeight] = [frozenColumnsWidth(layout), frozenRowsHeight(layout)];
  return [
    isSpanCutAtStart(across) ? 'left' : null,
    isSpanCutAtStart(down) ? 'top' : null,
    isSpanCutAtEnd(across, frozenWidth) ? 'right' : null,
    isSpanCutAtEnd(down, frozenHeight) ? 'foot' : null,
  ].filter((side?: Dynamic) => side !== null);
}
export function makeCornersOfTable(view: Dynamic, reads: WorkbookReads, layout?: Dynamic, foundTables?: Dynamic) {
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layout;
  let boxes = [
    ...ownFiltersOfSheet(view, view.sheetId).map((ownFilter?: Dynamic) => areaOfFilteredTable(reads, ownFilter)),
    ...foundTables.map(({ area: area }: Dynamic) => area),
  ].flatMap((area?: Dynamic) => {
    if (area === null) return [];
    let topLine = shownLineAtOrAfter(rowEdges, area.topRowIndex);
    let bottomLine = shownLineAtOrBefore(rowEdges, area.topRowIndex + area.rowCount - 1);
    let leftLine = shownLineAtOrAfter(columnEdges, area.leftColumnIndex);
    let rightLine = shownLineAtOrBefore(columnEdges, area.leftColumnIndex + area.columnCount - 1);
    if (topLine > bottomLine || leftLine > rightLine) return [];
    return [
      {
        top: topLine,
        bottom: bottomLine,
        left: leftLine,
        right: rightLine,
        cut: cutSidesOfTableSpans(rangeSpansOnScreen(area, view, layout, view), layout),
      },
    ];
  });
  if (boxes.length === 0) return noTableCorners;
  return ({ topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) => {
    for (let { top: topLine, bottom: bottomLine, left: leftLine, right: rightLine, cut: cut } of boxes as Dynamic) {
      let hasTop = isInSpan(topLine, topRowIndex, rowCount);
      let hasBottom = isInSpan(bottomLine, topRowIndex, rowCount);
      if (!hasTop && !hasBottom) continue;
      let hasLeft = isInSpan(leftLine, leftColumnIndex, columnCount);
      let hasRight = isInSpan(rightLine, leftColumnIndex, columnCount);
      if (!hasLeft && !hasRight) continue;
      let isNotCut = (...sides: Dynamic[]) => !sides.some((side?: Dynamic) => cut.includes(side));
      let corners = [
        hasTop && hasLeft && isNotCut('top', 'left') ? 'top-left' : null,
        hasTop && hasRight && isNotCut('top', 'right') ? 'top-right' : null,
        hasBottom && hasLeft && isNotCut('foot', 'left') ? 'bottom-left' : null,
        hasBottom && hasRight && isNotCut('foot', 'right') ? 'bottom-right' : null,
      ].filter((corner?: Dynamic) => corner !== null);
      if (corners.length > 0) return corners.join(' ');
    }
    return null;
  };
}
export function filterButtonsInView(view: Dynamic, reads: ReadsWithTextMeasurer, stuckHeaders?: Dynamic, cellLooks?: Dynamic) {
  let layout = layoutOfView(view, reads);
  let tables = tablesWithFilterButtons(view, reads);
  if (tables.length === 0) return NO_FILTER_BUTTONS;
  let columnSpanOf = columnSpanOfIdFinder(view, reads, layout);
  let ownFilterNotDrawnYet2 = view.rowsAskedFor?.isOfFilterBar === false ? null : ownFilterNotDrawnYet(view);
  return tables.flatMap((table?: Dynamic) => {
    let { rowIndex: rowIndex } = table;
    let ownFilterList = view.ownFilterList;
    let { columnsOfFound: columnsOfFound } = table;
    let firstColumnId = columnsOfFound === undefined ? undefined : table.columns[0]?.c;
    let isNotDrawnYet =
      ownFilterNotDrawnYet2 !== null &&
      columnsOfFound !== undefined &&
      ownFilterNotDrawnYet2.table.header.lastRow === table.table.header.lastRow &&
      ownFilterNotDrawnYet2.columns.some(({ c: columnId }: Dynamic) => {
        let columnIndex = columnSpanOf(columnId)?.columnIndex;
        return columnIndex !== undefined && isInSpan(columnIndex, columnsOfFound.firstIndex, columnsOfFound.count);
      });
    let foundColumnsSpan = columnsOfFound === undefined ? null : columnRunSpanOnScreen(columnsOfFound, view, layout, view);
    let buttonsAcross = (rowSpan?: Dynamic) =>
      filterButtonsOfTable(
        table,
        columnSpanOf,
        rowSpan,
        view.density,
        isNotDrawnYet ? (firstColumnId ?? null) : ownFilterList?.tableKey === table.key ? ownFilterList.c : null,
        (columnIndex?: Dynamic) => cellLooks(rowIndex, columnIndex).text,
        foundColumnsSpan === null
          ? null
          : {
              table: foundColumnsSpan,
              takenAtEnd: foundColumnsSpan.showTo === cellsAreaWidth(view) ? ROOM_AT_TABLE_END_FOR_FILTER_BUTTONS / view.zoom : 0,
            },
      );
    let headerKeyOf = ({ columnIndex: columnIndex }: Dynamic) => stuckHeaderAt(stuckHeaders, rowIndex, columnIndex)?.key ?? null;
    let buttons = [
      ...stuckHeaders.flatMap(
        (stuckHeader?: Dynamic) =>
          buttonsAcross(rowSpanInStuckHeader(stuckHeader, rowIndex, layout)).filter(
            (button?: Dynamic) => headerKeyOf(button) === stuckHeader.key,
          ),
      ),
      ...buttonsAcross(
        rowRunSpanOnScreen(
          {
            firstIndex: rowIndex,
            count: 1,
          },
          view,
          layout,
          view,
        ),
      ).filter((button?: Dynamic) => headerKeyOf(button) === null),
    ];
    buttons.sort((first?: Dynamic, second?: Dynamic) => first.columnIndex - second.columnIndex);
    return buttons.map((button?: Dynamic) => {
      let { text: text, groundOverText: groundOverText, ...looks } = cellLooks(rowIndex, button.columnIndex);
      let heldColumns = columnsUnderHeldButton(button.heldInView, view, layout);
      let middle = button.left + FILTER_BUTTON_SIZE / 2;
      let heldColumnIndex = heldColumns.find((held?: Dynamic) => middle < held.left + held.width)?.columnIndex;
      return Object.assign({}, button, looks, {
        ...(heldColumnIndex !== undefined && {
          ink: cellLooks(rowIndex, heldColumnIndex).ink,
          ground: null,
        }),
        headerKept: headerKeyOf(button),
        groundsWhereHeld: heldColumns.map(
          ({ left: left, width: width, columnIndex: columnIndex }: Dynamic) => ({
            left: left,
            width: width,
            ground: cellLooks(rowIndex, columnIndex).groundOverText,
          }),
        ),
      });
    });
  });
}
export const columnSpanOfIdFinder =
  (view: Dynamic, reads: WorkbookReads, layout?: Dynamic) =>
  (columnId?: Dynamic) => {
    let columnIndex = reads.columnIndexOf(view.sheetId, columnId);
    return columnIndex === null
      ? null
      : {
          columnIndex: columnIndex,
          across: columnRunSpanOnScreen(
            {
              firstIndex: columnIndex,
              count: 1,
            },
            view,
            layout,
            view,
          ),
        };
  };
export const tablesWithButtonsCache = new (WeakMap as Dynamic)();
export const stuckHeaderAt = (stuckHeaders?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) =>
  stuckHeaders.find(
    (stuckHeader?: Dynamic) =>
      isInSpan(rowIndex, stuckHeader.firstRowIndex, stuckHeader.rowCount) &&
      isInSpan(columnIndex, stuckHeader.firstColumnIndex, stuckHeader.columnCount),
  );
export const filterButtonRoomInCell = (cellWidth?: Dynamic) =>
  cellWidth < FILTER_BUTTON_SIZE ? 0 : FILTER_BUTTON_GAP + FILTER_BUTTON_SIZE + cellPaddingBeside('comfortable');
export const matchesNoCell = () => false;
export const NO_TABLE_EDGE_COLUMNS: Dynamic = [];
export const noTableCorners = () => null;
export const isSpanCutAtStart = ({ start: start, showFrom: showFrom }: Dynamic) => start < showFrom + 1;
export const isSpanCutAtEnd = (
  { end: end, showTo: showTo, isEndUnderFrozenLines: isEndUnderFrozenLines }: Dynamic,
  frozenEnd?: Dynamic,
) => end > showTo || isEndUnderFrozenLines || (end > frozenEnd && end < frozenEnd + 1);
export const NO_FILTER_BUTTONS: Dynamic = [];
