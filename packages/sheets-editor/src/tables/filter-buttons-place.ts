import type { Dynamic } from '../dynamic.ts';
import { cellPaddingBeside, textLineMiddleY } from '../grid/cell-metrics.ts';
import { clampBetween } from '../grid/geometry.ts';
import { clampSpanToShown } from './own-filter-list.ts';
import { columnLabelOf } from '../format/conditional/editor-view.ts';
import { isColumnFiltered } from './filter-model.ts';
export function roomAroundFilterButton(start: Dynamic, { showFrom: showFrom, showTo: showTo }: Dynamic) {
  let [roomBefore, roomAfter] = [start - showFrom, showTo - start - FILTER_BUTTON_SIZE];
  return Math.min(roomBefore, roomAfter) <= -FILTER_BUTTON_SIZE ? null : [roomBefore, roomAfter];
}
export function filterButtonLeftInTable(
  left: Dynamic,
  across: Dynamic,
  { table: table, takenAtEnd: takenAtEnd }: Dynamic,
  padding?: Dynamic,
) {
  let tableStart = Math.max(table.start, table.showFrom);
  let minLeft = table.showFrom < across.showFrom ? Math.max(across.showFrom - padding - FILTER_BUTTON_SIZE, tableStart) : left;
  let maxLeft = Math.max(table.showTo - Math.max(padding, takenAtEnd) - FILTER_BUTTON_SIZE, tableStart);
  return Math.min(Math.max(left, minLeft), maxLeft);
}
export function filterButtonsOfTable(
  filterTable?: Dynamic,
  placeOfColumn?: Dynamic,
  rowSpan?: Dynamic,
  density?: Dynamic,
  columnWithListOpen?: Dynamic,
  textLookOfColumn?: Dynamic,
  foundTableSpan: Dynamic = null,
) {
  let rowHeight = rowSpan.end - rowSpan.start;
  if (rowHeight < FILTER_BUTTON_SIZE) return [];
  let columnIndexOfColumn = (input?: Dynamic, options?: Dynamic) => placeOfColumn(options)?.columnIndex ?? null;
  return filterTable.columns.flatMap(({ c: columnId, name: name }: Dynamic) => {
    let place = placeOfColumn(columnId);
    if (place === null) return [];
    let { start: acrossStart, end: acrossEnd } = place.across;
    let padding = cellPaddingBeside(density);
    let restingLeft = Math.max(acrossStart, acrossEnd - padding - FILTER_BUTTON_SIZE);
    let left = foundTableSpan === null ? restingLeft : filterButtonLeftInTable(restingLeft, place.across, foundTableSpan, padding);
    let span =
      foundTableSpan === null
        ? place.across
        : {
            ...foundTableSpan.table,
            showFrom: Math.max(foundTableSpan.table.start, foundTableSpan.table.showFrom),
            showTo: Math.min(foundTableSpan.table.end, foundTableSpan.table.showTo + 1),
          };
    let clearAcross = roomAroundFilterButton(left, span);
    let heldBy = Math.max(Math.abs(left - restingLeft), span.showFrom < place.across.showFrom ? place.across.showFrom - left : 0);
    let {
      fontSizeInPoints: fontSizeInPoints,
      isAt: isAt,
      hiddenByBorderAtFoot: hiddenByBorderAtFoot2,
    } = textLookOfColumn(place.columnIndex);
    let textMiddle = textLineMiddleY(rowHeight, fontSizeInPoints, isAt, density, hiddenByBorderAtFoot2);
    let top = rowSpan.start + clampBetween(Math.floor(textMiddle - FILTER_BUTTON_SIZE / 2), 0, rowHeight - FILTER_BUTTON_SIZE);
    let clearDown = roomAroundFilterButton(top, rowSpan);
    if (acrossEnd - acrossStart < FILTER_BUTTON_SIZE || clearAcross === null || clearDown === null) return [];
    let [[cellLeft, cellWidth], [cellTop, cellHeight]] = [clampSpanToShown(place.across), clampSpanToShown(rowSpan)];
    let heldRight = left < place.across.showFrom ? Math.min(span.showTo, left + FILTER_BUTTON_SIZE + padding) : span.showTo;
    let fade = clampBetween(left - span.showFrom, 0, Math.min(heldBy, MAX_FILTER_BUTTON_FADE));
    return [
      {
        tableKey: filterTable.key,
        r: filterTable.table.header.lastRow,
        isOfFoundTable: filterTable.columnsOfFound !== undefined,
        c: columnId,
        columnIndex: place.columnIndex,
        column: columnLabelOf(
          {
            columnIndexOf: columnIndexOfColumn,
          },
          filterTable.table.sheetId,
          {
            c: columnId,
            name: name,
          },
        ),
        left: left,
        top: top,
        clearAt: {
          left: clearAcross[0],
          right: clearAcross[1],
          top: clearDown[0],
          bottom: clearDown[1],
        },
        cell: {
          left: cellLeft,
          top: cellTop,
          width: cellWidth,
          height: cellHeight,
        },
        isOn: isColumnFiltered(filterTable.filter, columnId),
        isListOpen: columnId === columnWithListOpen,
        heldInView:
          heldBy === 0
            ? null
            : {
                left: left - fade,
                width: heldRight - (heldRight === span.end ? 1 : 0) - left + fade,
                top: cellTop,
                height: Math.min(cellHeight, rowSpan.end - 1 - cellTop),
                fade: fade,
              },
      },
    ];
  });
}
export const FILTER_BUTTON_SIZE = 20;
export const FILTER_BUTTON_GAP = 2;
export const MAX_FILTER_BUTTON_FADE = 20;
export const ROOM_AT_TABLE_END_FOR_FILTER_BUTTONS = 10;
