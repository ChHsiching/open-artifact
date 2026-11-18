import type { Dynamic } from '../dynamic.ts';
import { createLineSizes } from '../model/line-sizes.ts';
import { isInSpan, rangeSpansOnScreen } from './geometry.ts';
import { buildBorderPaths } from './borders.ts';
import { layoutOfView } from './layout.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function readsWithColumnsMoved(reads: WorkbookReads, { sheetId: sheetId, area: area, cameFrom: cameFrom }: Dynamic = {}) {
  let key = [sheetId, area.leftColumnIndex, ...cameFrom].join(' ');
  let byKey = readsWithColumnsMovedCache.get(reads) ?? new Map();
  readsWithColumnsMovedCache.set(reads, byKey);
  let cached = byKey.get(key);
  if (cached !== undefined) return cached;
  let layBefore = (cell?: Dynamic) => {
    if (cell.sheetId !== sheetId) return cell;
    let position = reads.positionOfCell(cell);
    if (position === null) return cell;
    let columnIndex = cameFrom[position.columnIndex - area.leftColumnIndex];
    if (columnIndex === undefined || columnIndex === position.columnIndex) return cell;
    return reads.cellIdAt(sheetId, position.rowIndex, columnIndex) ?? cell;
  };
  let readBefore =
    (read?: Dynamic) =>
    (cell?: Dynamic) => {
      let before = layBefore(cell);
      let found = read(before);
      return found === null || before === cell
        ? found
        : {
            ...found,
            r: cell.rowId,
            c: cell.columnId,
          };
    };
  let cellOf = readBefore((cell?: Dynamic) => reads.cellOf(cell));
  let spilledCellOf = readBefore((cell?: Dynamic) => reads.spilledCellOf(cell));
  let sheet = reads.listSheets().find((listed?: Dynamic) => listed.sheetId === sheetId);
  let movedSheet =
    sheet === undefined
      ? sheet
      : {
          ...sheet,
          columnEdges: createLineSizes(
            sheet.columnCount,
            Array.from(
              {
                length: sheet.columnCount,
              },
              (_?: Dynamic, index?: Dynamic) => ({
                firstIndex: index,
                count: 1,
                sizeInPixels: sheet.columnEdges.sizeOf(cameFrom[index - area.leftColumnIndex] ?? index),
              }),
            ),
            0,
          ),
        };
  let sheets = reads.listSheets().map((listed?: Dynamic) => (listed === sheet && movedSheet !== undefined ? movedSheet : listed));
  let moved = {
    layBefore: layBefore,
    reads: {
      ...reads,
      listSheets: () => sheets,
      cellOf: cellOf,
      spilledCellOf: spilledCellOf,
      cellOnShowIn: (cell?: Dynamic) => cellOf(cell) ?? spilledCellOf(cell),
      formatOf: (cell?: Dynamic) => reads.formatOf(layBefore(cell)),
      dropdownOf: (cell?: Dynamic) => reads.dropdownOf(layBefore(cell)),
      columnIndexesOnShowIn(onSheetId?: Dynamic, rowIndex?: Dynamic) {
        let onShow = reads.columnIndexesOnShowIn(onSheetId, rowIndex);
        if (onSheetId !== sheetId) return onShow;
        let isOnShow = new Set(onShow);
        let indexes = [
          ...onShow.filter((columnIndex?: Dynamic) => !isInSpan(columnIndex, area.leftColumnIndex, area.columnCount)),
          ...cameFrom.flatMap(
            (columnIndex?: Dynamic, offset?: Dynamic) => (isOnShow.has(columnIndex) ? [area.leftColumnIndex + offset] : []),
          ),
        ];
        indexes.sort((a?: Dynamic, b?: Dynamic) => a - b);
        return indexes;
      },
    },
  };
  byKey.set(key, moved);
  return moved;
}
export function rowsInHandWithin(rows?: Dynamic, room?: Dynamic, keyPrefix: Dynamic = '') {
  let inHand: Dynamic = [];
  for (let row of rows as Dynamic) {
    let cells = row.cells
      .filter(({ isInHand: isInHand }: Dynamic = {}) => isInHand)
      .map((cell?: Dynamic) => cellRidingFrom(cell, room));
    if (cells.length > 0)
      inHand.push({
        ...row,
        key: keyPrefix + row.key,
        top: row.top - room.top,
        isActive: false,
        isFrozen: false,
        cells: cells,
      });
  }
  return inHand;
}
export function columnsRidingOf(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  { area: area, cameFrom: cameFrom, landsAt: landsAt, count: count }: Dynamic = {},
  drawn?: Dynamic,
) {
  let { dragging: dragging, sheetId: sheetId } = state;
  if (dragging?.kind !== 'movingColumnsOfTable') return null;
  let first = reads.positionOfCell(dragging.first);
  let [withinFirst, withinLast] = [reads.positionOfCell(dragging.within.first), reads.positionOfCell(dragging.within.last)];
  if (first === null || withinFirst === null || withinLast === null) return null;
  let { sheet: sheet } = drawn;
  let spansOf = (layout?: Dynamic, leftColumnIndex?: Dynamic, columnCount?: Dynamic) =>
    rangeSpansOnScreen(
      {
        topRowIndex: area.topRowIndex,
        rowCount: area.rowCount,
        leftColumnIndex: leftColumnIndex,
        columnCount: columnCount,
      },
      state,
      layout,
      state,
    );
  let landing = spansOf(sheet, landsAt, count);
  let run = spansOf(sheet, withinFirst.columnIndex, withinLast.columnIndex - withinFirst.columnIndex + 1);
  let top = Math.max(landing.down.start, landing.down.showFrom);
  let room = {
    left: landing.across.start,
    top: top,
    width: landing.across.end - landing.across.start,
    height: (landing.down.end > landing.down.showTo ? landing.down.showTo + 16 : landing.down.end) - top,
  };
  let rows = rowsInHandWithin(drawn.rows, room);
  let topOfRow = new Map();
  for (let { rowNumber: rowNumber, top: rowTop, height: height } of rows as Dynamic) {
    topOfRow.set(rowNumber - 1, rowTop);
    topOfRow.set(rowNumber, rowTop + height);
  }
  let lines = !reads.hasBorderLine(sheetId)
    ? []
    : buildBorderPaths({
        rows: {
          before: (rows[0]?.rowNumber ?? 1) - 2,
          indexes: rows.map(({ rowNumber: rowNumber }: Dynamic = {}) => rowNumber - 1),
          after: rows.at(-1)?.rowNumber ?? 0,
        },
        columns: {
          before: landsAt - 1,
          indexes: Array.from(
            {
              length: count,
            },
            (_?: Dynamic, offset?: Dynamic) => landsAt + offset,
          ).filter((columnIndex?: Dynamic) => sheet.columnEdges.sizeOf(columnIndex) > 0),
          after: landsAt + count,
        },
        formatAt: ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
          let cell =
            isInSpan(rowIndex, area.topRowIndex, area.rowCount) && isInSpan(columnIndex, landsAt, count)
              ? drawn.reads.cellIdAt(sheetId, rowIndex, columnIndex)
              : null;
          return cell === null ? null : drawn.reads.formatOf(cell);
        },
        mergedAreas: [],
        leftOfColumn: (columnIndex?: Dynamic) =>
          RIDING_BORDER_ROOM + sheet.columnEdges.startOf(columnIndex) - sheet.columnEdges.startOf(landsAt),
        topOfRow: (rowIndex?: Dynamic) => RIDING_BORDER_ROOM + (topOfRow.get(rowIndex) ?? -1000),
      });
  let box = {
    left: -RIDING_BORDER_ROOM,
    top: -RIDING_BORDER_ROOM,
    width: room.width + 2 * RIDING_BORDER_ROOM,
    height: room.height + 2 * RIDING_BORDER_ROOM,
  };
  return {
    key: `${dragging.first.columnId} ${dragging.last.columnId}`,
    room: room,
    rows: rows,
    borderLines:
      lines.length === 0
        ? []
        : [
            {
              key: 'riding',
              box: box,
              lines: lines,
            },
          ],
    homeLeft: spansOf(layoutOfView(state, reads), first.columnIndex, count).across.start,
    leastLeft: run.across.start,
    endOfRun: run.across.end,
    gripFromLeft: dragging.grip.fromLeft,
    firstRowIndex: area.topRowIndex,
    lastRowIndex: area.topRowIndex + area.rowCount - 1,
    order: Array.from(
      {
        length: withinLast.columnIndex - withinFirst.columnIndex + 1,
      },
      (_?: Dynamic, offset?: Dynamic) => {
        let columnIndex = withinFirst.columnIndex + offset;
        return {
          columnIndex: columnIndex,
          holdsCellsOf: cameFrom[columnIndex - area.leftColumnIndex] ?? columnIndex,
          left: spansOf(sheet, columnIndex, 1).across.start,
        };
      },
    ),
  };
}
export const readsWithColumnsMovedCache = new WeakMap();
export const RIDING_BORDER_ROOM = 2;
export const cellRidingFrom = (cell?: Dynamic, room?: Dynamic) => ({
  ...cell,
  isInHand: false,
  elementId: null,
  isActive: false,
  isSelected: false,
  cornersOfTable: null,
  left: cell.left - room.left,
  textLeft: cell.textLeft - room.left,
  textLeftInWholeRow: cell.textLeftInWholeRow - room.left,
});
export const withKeptHeadersRiding = (riding?: Dynamic, headersKept?: Dynamic) => ({
  ...riding,
  rows: [...riding.rows, ...headersKept.flatMap((kept?: Dynamic) => rowsInHandWithin(kept.rows, riding.room, 'kept '))],
});
