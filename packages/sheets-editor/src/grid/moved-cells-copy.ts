import type { Dynamic } from '../dynamic.ts';
import { isInSpan } from './geometry.ts';
import { createLineSizes } from '../model/line-sizes.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { NO_OWN_COLLAPSING } from './line-runs.ts';
import { layoutOfView } from './layout.ts';
import { ROW_HEADER_WIDTH, oneLineRowHeight } from './cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT, hasRoomForText, textRoomInWidth } from './cell-metrics.ts';
import { mayRowsGrowInSheet, wrappedTextOfCell, rowGrowthsOfTexts } from './wrapped-rows.ts';
import { buildBorderPaths } from './borders.ts';
import { checkboxCentreInCell } from '../chips/checkbox-presses.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function columnEdgesAtLanding(
  { columnEdges: columnEdges, columnCount: columnCount }: Dynamic,
  sheetColumnEdges?: Dynamic,
  columns?: Dynamic,
  shift?: Dynamic,
) {
  let runs: Dynamic = [];
  for (let index = 0; index < columnCount; index += 1) {
    let size = isInSpan(index, columns.firstIndex, columns.count) ? columnEdges.sizeOf(index + shift) : sheetColumnEdges.sizeOf(index);
    let last = runs.at(-1);
    if (last?.sizeInPixels === size)
      runs[runs.length - 1] = {
        ...last,
        count: last.count + 1,
      };
    else
      runs.push({
        firstIndex: index,
        count: 1,
        sizeInPixels: size,
      });
  }
  return createLineSizes(columnCount, runs, 0);
}
export function viewOfHeldCells(
  state: Dynamic,
  reads: WorkbookReads,
  place?: Dynamic,
  { rows: rows, columns: columns }: Dynamic = {},
  { held: held, landing: landing }: Dynamic = {},
) {
  let sheet = reads.listSheets().find(({ sheetId: sheetId }: Dynamic = {}) => sheetId === place.sheetId);
  if (sheet === undefined) return null;
  let sheetAtLanding = {
    ...sheet,
    columnEdges: columnEdgesAtLanding(place.layout, sheet.columnEdges, columns, landing.leftColumnIndex - held.leftColumnIndex),
    frozenRowCount: 0,
    frozenColumnCount: 0,
    rowGroups: [],
    columnGroups: [],
  };
  let sheets = reads.listSheets().map((listed?: Dynamic) => (listed === sheet ? sheetAtLanding : listed));
  let heldReads = {
    ...reads,
    listSheets: () => sheets,
    mergedAreaAt: () => null,
    mergedAreasIn: () => [],
    formatsGivenIn: () => NO_FORMATS_GIVEN_TO_COPY,
    whereTextWraps: () => [],
    cellsWithListsIn: () => NO_CELLS_WITH_LISTS,
    placementsIn: () => [],
    columnIndexesOnShowIn: (sheetId?: Dynamic, rowIndex?: Dynamic) =>
      reads.columnIndexesOnShowIn(sheetId, rowIndex).filter((columnIndex?: Dynamic) => isInArea(held, rowIndex, columnIndex)),
    formatOf(cell?: Dynamic) {
      let position = reads.positionOfCell(cell);
      return position !== null && isInArea(held, position.rowIndex, position.columnIndex) ? reads.formatOf(cell) : DEFAULT_CELL_FORMAT;
    },
  };
  let heldState = {
    ...state,
    dragging: null,
    selectionsOfOthers: [],
    changesByAgent: [],
    marksOfImport: null,
    sidePane: null,
    ownCollapsing: NO_OWN_COLLAPSING,
    rowsOutOfViewByOwnFilters: new Map(),
  };
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(heldState, heldReads);
  let [scrollLeft, scrollTop] = [columnEdges.startOf(columns.firstIndex), rowEdges.startOf(rows.firstIndex)];
  return {
    reads: heldReads,
    state: {
      ...heldState,
      scrollLeft: scrollLeft,
      scrollTop: scrollTop,
      gridWidth: ROW_HEADER_WIDTH + columnEdges.startOf(columns.firstIndex + columns.count) - scrollLeft + COPY_ROOM_AT_RIGHT,
      gridHeight: COLUMN_HEADER_HEIGHT + rowEdges.startOf(rows.firstIndex + rows.count) - scrollTop,
    },
  };
}
export function heightsOfLandingRows(
  rows: Dynamic,
  { held: held, landing: landing }: Dynamic = {},
  { sheetId: sheetId, layout: { rowEdges: rowEdges, columnEdges: columnEdges, columnCount: columnCount } }: Dynamic = {},
  reads: WorkbookReads,
  density?: Dynamic,
) {
  let [rowShift, columnShift] = [landing.topRowIndex - held.topRowIndex, landing.leftColumnIndex - held.leftColumnIndex];
  let sizing = reads.rowSizingOf(sheetId);
  let sizingOfRow = (rowIndex?: Dynamic) =>
    sizing.find(({ firstIndex: firstIndex, count: count }: Dynamic = {}) => isInSpan(rowIndex, firstIndex, count));
  let defaultSize = DEFAULT_CELL_FORMAT.font.size;
  let largestFontSize = (rowIndex?: Dynamic, isWanted?: Dynamic) => {
    if ((sizingOfRow(rowIndex)?.largestFontSizeInPoints ?? defaultSize) <= defaultSize) return defaultSize;
    let largest: Dynamic = defaultSize;
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      let cell = isWanted(columnIndex) ? reads.cellIdAt(sheetId, rowIndex, columnIndex) : null;
      if (cell !== null) largest = Math.max(largest, reads.formatOf(cell).font.size);
    }
    return largest;
  };
  let mayRowsGrow = mayRowsGrowInSheet(sheetId, reads);
  let wrappedTextsOf = (rowIndex?: Dynamic, isWanted?: Dynamic, widthOfColumn?: Dynamic, mayBeMerged?: Dynamic) =>
    !mayRowsGrow
      ? []
      : reads
          .columnIndexesOnShowIn(sheetId, rowIndex)
          .filter(isWanted)
          .flatMap((columnIndex?: Dynamic) => {
            let cell = reads.cellIdAt(sheetId, rowIndex, columnIndex);
            if (cell === null) return [];
            let isMerged =
              mayBeMerged &&
              reads.mergedAreaAt(sheetId, {
                rowIndex: rowIndex,
                columnIndex: columnIndex,
              }) !== null;
            let wrapped = wrappedTextOfCell(cell, isMerged, reads);
            let width = widthOfColumn(columnIndex);
            return wrapped === null || !hasRoomForText(width, wrapped.font.size)
              ? []
              : [
                  {
                    ...wrapped,
                    widthInPixels: textRoomInWidth(width),
                  },
                ];
          });
  let isHeldColumn = (columnIndex?: Dynamic) => isInSpan(columnIndex, held.leftColumnIndex, held.columnCount);
  let landingRows = indexesOfSpan(rows).map((rowIndex?: Dynamic) => {
    let landingRowIndex = rowIndex + rowShift;
    if (rowEdges.sizeOf(landingRowIndex) === 0)
      return {
        least: 0,
        texts: [],
      };
    let isLeftInPlace = (columnIndex?: Dynamic) =>
      !isInArea(held, landingRowIndex, columnIndex) && !isInArea(landing, landingRowIndex, columnIndex);
    let fontSize = () => Math.max(largestFontSize(rowIndex, isHeldColumn), largestFontSize(landingRowIndex, isLeftInPlace));
    return {
      least: sizingOfRow(landingRowIndex)?.heightInPixels ?? oneLineRowHeight(fontSize(), density),
      texts: [
        ...wrappedTextsOf(rowIndex, isHeldColumn, (columnIndex?: Dynamic) => columnEdges.sizeOf(columnIndex + columnShift), false),
        ...wrappedTextsOf(landingRowIndex, isLeftInPlace, (columnIndex?: Dynamic) => columnEdges.sizeOf(columnIndex), true),
      ],
    };
  });
  let growths = rowGrowthsOfTexts(
    landingRows.flatMap(({ texts: texts }: Dynamic = {}) => texts),
    reads,
    density,
  );
  let measuredSoFar: Dynamic = 0;
  return landingRows.map(
    ({ least: least, texts: texts }: Dynamic = {}) => (
      (measuredSoFar += texts.length),
      Math.max(least, ...growths.slice(measuredSoFar - texts.length, measuredSoFar))
    ),
  );
}
export function drawnHeldCells(state: Dynamic, reads: WorkbookReads, place?: Dynamic, window?: Dynamic, move?: Dynamic, viewOf?: Dynamic) {
  let held = viewOfHeldCells(state, reads, place, window, move);
  if (held === null) return null;
  let { rows: rows, filterButtons: filterButtons } = viewOf(held.state, held.reads);
  let isInWindow = (rowIndex?: Dynamic, columnIndex?: Dynamic) =>
    isInSpan(rowIndex, window.rows.firstIndex, window.rows.count) && isInSpan(columnIndex, window.columns.firstIndex, window.columns.count);
  let { columnEdges: columnEdges } = layoutOfView(held.state, held.reads);
  return {
    rows: rows.flatMap((row?: Dynamic) => {
      let cells = row.cells.filter((cell?: Dynamic) => cell.width > 0 && isInWindow(row.rowNumber - 1, cell.columnNumber - 1));
      return cells.length === 0
        ? []
        : [
            {
              ...row,
              isActive: false,
              isFrozen: false,
              cells: cells.map(cellOfCopy),
            },
          ];
    }),
    filterButtons: filterButtons.filter(
      ({ headerKept: headerKept, heldInView: heldInView, columnIndex: columnIndex, cell: cell }: Dynamic = {}) =>
        headerKept === null && heldInView === null && cell.width > 0 && isInSpan(columnIndex, window.columns.firstIndex, window.columns.count),
    ),
    width: held.state.gridWidth - ROW_HEADER_WIDTH - COPY_ROOM_AT_RIGHT,
    leftOfColumn: (columnIndex?: Dynamic) => columnEdges.startOf(columnIndex) - held.state.scrollLeft,
  };
}
export function copyOfHeldCells(drawn: Dynamic, heights: Dynamic, window: Dynamic, held: Dynamic, sheetId: Dynamic, reads: WorkbookReads) {
  let tops = [0];
  for (let height of heights as Dynamic) tops.push((tops.at(-1) ?? 0) + height);
  let topOfRow = (rowIndex?: Dynamic) => tops[rowIndex - window.rows.firstIndex] ?? 0;
  let heightOfRow = (rowIndex?: Dynamic) => heights[rowIndex - window.rows.firstIndex] ?? 0;
  let rows = drawn.rows.filter(({ rowNumber: rowNumber }: Dynamic = {}) => heightOfRow(rowNumber - 1) > 0);
  let lines = !reads.hasBorderLine(sheetId)
    ? []
    : buildBorderPaths({
        rows: {
          before: window.rows.firstIndex - 1,
          indexes: rows.map(({ rowNumber: rowNumber }: Dynamic = {}) => rowNumber - 1),
          after: window.rows.firstIndex + window.rows.count,
        },
        columns: {
          before: window.columns.firstIndex - 1,
          indexes: indexesOfSpan(window.columns).filter(
            (columnIndex?: Dynamic) => drawn.leftOfColumn(columnIndex + 1) > drawn.leftOfColumn(columnIndex),
          ),
          after: window.columns.firstIndex + window.columns.count,
        },
        formatAt: ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
          let cell = isInArea(held, rowIndex, columnIndex) ? reads.cellIdAt(sheetId, rowIndex, columnIndex) : null;
          return cell === null ? null : reads.formatOf(cell);
        },
        mergedAreas: [],
        leftOfColumn: (columnIndex?: Dynamic) => COPY_BORDER_ROOM + drawn.leftOfColumn(columnIndex),
        topOfRow: (rowIndex?: Dynamic) => COPY_BORDER_ROOM + topOfRow(rowIndex),
      });
  let rowAtHeight = (row?: Dynamic) => {
    let [top, height] = [topOfRow(row.rowNumber - 1), heightOfRow(row.rowNumber - 1)];
    return {
      ...row,
      top: top,
      height: height,
      outOfViewAbove: 0,
      outOfViewBelow: 0,
      cells: row.cells.map(cellAtHeight(height)),
    };
  };
  let height = tops.at(-1) ?? 0;
  return {
    rows: rows.map(rowAtHeight),
    borderLines:
      lines.length === 0
        ? []
        : [
            {
              key: 'copy',
              box: {
                left: -COPY_BORDER_ROOM,
                top: -COPY_BORDER_ROOM,
                width: drawn.width + 2 * COPY_BORDER_ROOM,
                height: height + 2 * COPY_BORDER_ROOM,
              },
              lines: lines,
            },
          ],
    filterButtons: drawn.filterButtons.flatMap((button?: Dynamic) => {
      let row = drawn.rows.find(({ top: top, height: rowHeight }: Dynamic = {}) => isInSpan(button.cell.top, top, rowHeight));
      return row === undefined || heightOfRow(row.rowNumber - 1) === 0 ? [] : [filterButtonMovedDown(button, topOfRow(row.rowNumber - 1) - row.top)];
    }),
    width: drawn.width,
    height: height,
  };
}
export function keptOrMade(kept?: Dynamic, key?: Dynamic, make?: Dynamic) {
  let found = kept.get(key);
  if (found !== undefined) return found;
  let made = make();
  let [oldestKey] = kept.keys();
  if (kept.size >= MOST_PARTS_KEPT && oldestKey !== undefined) kept.delete(oldestKey);
  kept.set(key, made);
  return made;
}
export function movedCellsCopy(
  parts: Dynamic,
  window: Dynamic,
  move: Dynamic,
  place: Dynamic,
  state: PageState,
  reads: WorkbookReads,
  viewOf?: Dynamic,
) {
  let windowKey = `${window.rows.firstIndex} ${window.rows.count} ${window.columns.firstIndex} ${window.columns.count}`;
  return keptOrMade(parts.byLanding, `${windowKey} ${move.landing.topRowIndex} ${move.landing.leftColumnIndex}`, () => {
    let columnShift = move.landing.leftColumnIndex - move.held.leftColumnIndex;
    let widths = indexesOfSpan(window.columns).map(
      (columnIndex?: Dynamic) => place.layout.columnEdges.sizeOf(columnIndex + columnShift),
    );
    let acrossKey = `${windowKey} ${widths.join(' ')}`;
    let drawn = keptOrMade(parts.across, acrossKey, () => drawnHeldCells(state, reads, place, window, move, viewOf));
    if (drawn === null) return null;
    let heights = heightsOfLandingRows(window.rows, move, place, reads, state.density);
    return keptOrMade(
      parts.drawn,
      `${acrossKey} ${heights.join(' ')}`,
      () => copyOfHeldCells(drawn, heights, window, move.held, place.sheetId, reads),
    );
  });
}
export function windowOfLines(lines?: Dynamic, inSight?: Dynamic) {
  if (lines.count <= MOST_LINES_UNWINDOWED) return lines;
  let firstStep = Math.floor((inSight.firstIndex - lines.firstIndex) / WINDOW_STEP) - 1;
  let lastStep = Math.ceil((inSight.firstIndex + inSight.count - lines.firstIndex) / WINDOW_STEP) + 1;
  let firstIndex = lines.firstIndex + Math.max(0, firstStep * WINDOW_STEP);
  let end = Math.min(lines.firstIndex + lines.count, lines.firstIndex + lastStep * WINDOW_STEP);
  return {
    firstIndex: firstIndex,
    count: end - firstIndex,
  };
}
export const NO_CELLS_WITH_LISTS = new Map();
export const isInArea = (area?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) =>
  isInSpan(rowIndex, area.topRowIndex, area.rowCount) && isInSpan(columnIndex, area.leftColumnIndex, area.columnCount);
export const indexesOfSpan = ({ firstIndex: firstIndex, count: count }: Dynamic) =>
  Array.from(
    {
      length: count,
    },
    (_?: Dynamic, offset?: Dynamic) => firstIndex + offset,
  );
export const COPY_ROOM_AT_RIGHT = 48;
export const NO_FORMATS_GIVEN_TO_COPY = {
  notWorkedOut: null,
  formats: [],
  colorScales: [],
  matches: [],
};
export const COPY_BORDER_ROOM = 2;
export const cellOfCopy = (cell?: Dynamic) => ({
  ...cell,
  elementId: null,
  isActive: false,
  isSelected: false,
});
export const cellAtHeight =
  (height?: Dynamic) =>
  (cell?: Dynamic) => {
    let centre = checkboxCentreInCell(cell.width, height, cell.hiddenByBorderAtFoot);
    let checkbox =
      cell.checkbox === null
        ? null
        : {
            ...cell.checkbox,
            middleFromLeft: centre.x,
            middleFromTop: centre.y,
          };
    return {
      ...cell,
      height: height,
      checkbox: checkbox,
    };
  };
export const filterButtonMovedDown = (button?: Dynamic, by?: Dynamic) => ({
  ...button,
  isInActiveCell: false,
  isListOpen: false,
  top: button.top + by,
  cell: {
    ...button.cell,
    top: button.cell.top + by,
  },
});
export const newMovedCellsParts = () => ({
  byLanding: new Map(),
  across: new Map(),
  drawn: new Map(),
});
export const MOST_PARTS_KEPT = 32;
export const WINDOW_STEP = 16;
export const MOST_LINES_UNWINDOWED = 96;
