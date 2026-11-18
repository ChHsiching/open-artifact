import type { Dynamic } from '../dynamic.ts';
import { wholeAreaToA1AsStored, columnLetters } from '../model/a1-references.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function filledRowSpanOfArea(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let onShow = workbook.areaOnShowIn(sheetId, area);
  return onShow === null ? 0 : onShow.topRowIndex + onShow.rowCount - area.topRowIndex;
}
export function placeChartForArea(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let sheet = workbook.listSheets().find((input?: Dynamic) => input.sheetId === sheetId);
  if (sheet === undefined || isChartSourceTooTall(workbook, sheetId, area)) return null;
  let sourceArea =
    area.rowCount > MAX_CHART_SOURCE_ROWS
      ? {
          ...area,
          rowCount: Math.max(1, filledRowSpanOfArea(workbook, sheetId, area)),
        }
      : area;
  let filledIn = (box?: Dynamic) => {
    let [rows, columns] = [Math.min(box.rows, sheet.rowCount - box.top), Math.min(box.columns, sheet.columnCount - box.left)];
    return rows <= 0 || columns <= 0
      ? null
      : workbook.areaOnShowIn(sheetId, {
          topRowIndex: box.top,
          leftColumnIndex: box.left,
          rowCount: rows,
          columnCount: columns,
        });
  };
  let rowBelow = sourceArea.topRowIndex + sourceArea.rowCount;
  let lastRowBox = {
    top: rowBelow - 1,
    left: sourceArea.leftColumnIndex,
    rows: 1,
    columns: sourceArea.columnCount,
  };
  let rowsToAdd = Math.min(MAX_ROWS_ADDED_TO_CHART_SOURCE, sheet.rowCount - rowBelow, MAX_CHART_SOURCE_ROWS - sourceArea.rowCount);
  let filledBelow = filledIn({
    ...lastRowBox,
    top: rowBelow,
    rows: rowsToAdd,
  });
  let addedRows =
    filledIn(lastRowBox) === null ? 0 : filledBelow === null ? Math.max(0, rowsToAdd) : Math.max(0, filledBelow.topRowIndex - rowBelow - 1);
  let range = wholeAreaToA1AsStored(
    {
      ...sourceArea,
      rowCount: sourceArea.rowCount + addedRows,
    },
    sheet.ownRowOrder,
  );
  if (range === null) return null;
  let chartRows = rowsForChartPixels(DEFAULT_CHART_SIZE.heightInPixels);
  let columnsForPixels = (column?: Dynamic, pixels?: Dynamic) =>
    sheet.columnEdges.indexAt(sheet.columnEdges.startOf(column) + pixels - 1) - column + 1;
  let placedCharts = workbook.placementsIn(sheetId).map(
    (placement?: Dynamic) => ({
      top: placement.rowIndex,
      left: placement.columnIndex,
      rows: rowsForChartPixels(placement.heightInPixels + placement.offsetFromAnchorCell.yInPixels),
      columns: columnsForPixels(placement.columnIndex, placement.widthInPixels + placement.offsetFromAnchorCell.xInPixels),
    }),
  );
  let isSpotFree = (spot2?: Dynamic) =>
    filledIn(spot2) === null && !placedCharts.some((placed?: Dynamic) => gridBoxesOverlap(placed, spot2));
  let findSpotFrom = (topRow?: Dynamic, leftColumn?: Dynamic) => {
    let { frozenRowCount: frozenRows, frozenColumnCount: frozenColumns } = sheet;
    let frozenRowCount = frozenRows < sheet.rowCount ? frozenRows : 0;
    let firstTop = Math.max(topRow, frozenRowCount);
    let topBelowFrozen = Math.max(topRow, frozenRowCount + CHART_ROWS_BELOW_FROZEN);
    let left = Math.max(leftColumn, frozenColumns < sheet.columnCount ? frozenColumns : 0);
    let columns = columnsForPixels(left, DEFAULT_CHART_SIZE.widthInPixels);
    let tops = Array.from<Dynamic, Dynamic>(
      {
        length: CHART_SPOT_TRIES,
      },
      (input?: Dynamic, index?: Dynamic) => topBelowFrozen + index * (chartRows + 1),
    );
    let spots = [...tops.slice(0, 1), firstTop, ...tops.slice(1)]
      .filter((top?: Dynamic) => top < sheet.rowCount)
      .map(
        (top?: Dynamic) => ({
          top: top,
          left: left,
          rows: chartRows,
          columns: columns,
        }),
      );
    return spots.find(isSpotFree) ?? spots.at(-1) ?? null;
  };
  let filledInRows = filledIn({
    top: sourceArea.topRowIndex,
    left: sourceArea.leftColumnIndex,
    rows: sourceArea.rowCount,
    columns: sheet.columnCount,
  });
  let lastFilledColumn =
    filledInRows === null ? sourceArea.leftColumnIndex + sourceArea.columnCount - 1 : filledInRows.leftColumnIndex + filledInRows.columnCount - 1;
  let besideColumn = lastFilledColumn + 2;
  let spotBelowData = () => {
    let filled = filledIn({
      top: 0,
      left: 0,
      rows: sheet.rowCount,
      columns: sheet.columnCount,
    });
    let rowBelowData = filled === null ? rowBelow : filled.topRowIndex + filled.rowCount;
    return findSpotFrom(rowBelowData + CHART_GAP_ROWS_BELOW_DATA, 0);
  };
  let spotBeside = findSpotFrom(sourceArea.topRowIndex, Math.min(besideColumn, sheet.columnCount - 1));
  let canGoBeside =
    lastFilledColumn <= MAX_LAST_COLUMN_FOR_CHART_BESIDE && besideColumn < sheet.columnCount && spotBeside !== null && isSpotFree(spotBeside);
  let fitsBeside =
    canGoBeside && sheet.columnEdges.startOf(spotBeside.left) + DEFAULT_CHART_SIZE.widthInPixels <= sheet.columnEdges.totalSize;
  let spotBelow = fitsBeside ? null : spotBelowData();
  let isBelowOffSheet = canGoBeside && (spotBelow === null || spotBelow.top + spotBelow.rows > sheet.rowCount);
  let spot = fitsBeside || isBelowOffSheet ? spotBeside : (spotBelow ?? spotBeside);
  return spot === null
    ? null
    : {
        range: range,
        topLeft: `${columnLetters(spot.left)}${spot.top + 1}`,
      };
}
export const DEFAULT_CHART_SIZE = {
  widthInPixels: 480,
  heightInPixels: 280,
};
export const CHART_ROW_HEIGHT_PX = 21;
export const rowsForChartPixels = (pixels?: Dynamic) => Math.ceil(pixels / CHART_ROW_HEIGHT_PX);
export const MAX_LAST_COLUMN_FOR_CHART_BESIDE = 7;
export const CHART_GAP_ROWS_BELOW_DATA = 3;
export const CHART_ROWS_BELOW_FROZEN = 1;
export const MAX_ROWS_ADDED_TO_CHART_SOURCE = 40;
export const MAX_CHART_SOURCE_ROWS = 2000;
export const CHART_SPOT_TRIES = 12;
export const gridBoxesOverlap = (box?: Dynamic, other?: Dynamic) =>
  box.top < other.top + other.rows && other.top < box.top + box.rows && box.left < other.left + other.columns && other.left < box.left + box.columns;
export const isChartSourceTooTall = (workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) =>
  area.rowCount > MAX_CHART_SOURCE_ROWS && filledRowSpanOfArea(workbook, sheetId, area) > MAX_CHART_SOURCE_ROWS;
