import type { Dynamic } from '../dynamic.ts';
import { cellsJoinForOverflow, flattenLineBreaks } from './text-overflow.ts';
import { unzoomedEditorWidth, listIndentOfLines, textRoomPastPadding } from './cell-metrics.ts';
import { resolvePlaceArea } from '../agent/changes-by-agent.ts';
import { readsAsStored } from '../model/workbook.ts';
import { areaAsSeen } from '../model/a1-references.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function frozenCellsAcrossEntry(entryBox?: Dynamic, frozenBy?: Dynamic, drawnRows?: Dynamic) {
  let cells = drawnRows.flatMap(
    (row?: Dynamic) =>
      row.cells.filter(
        (cell?: Dynamic) =>
          cell.frozenBy === frozenBy &&
          row.top + cell.top < entryBox.top + entryBox.height - GRID_PIXEL_SLACK &&
          row.top + cell.top + cell.height > entryBox.top + GRID_PIXEL_SLACK,
      ),
  );
  cells.sort((first?: Dynamic, second?: Dynamic) => first.left - second.left);
  return cells;
}
export function entryHintRoomOf(
  entryBox?: Dynamic,
  entryCell?: Dynamic,
  drawnRows?: Dynamic,
  shownLeft?: Dynamic,
  shownRight?: Dynamic,
  zoomedSize?: Dynamic,
) {
  let entryRight = entryBox.left + entryBox.width;
  let hintRight: Dynamic = entryCell.canHintReachOn ? shownRight : entryRight;
  let formatSoFar: Dynamic = entryCell.format;
  for (let cell of (entryCell.canHintReachOn ? frozenCellsAcrossEntry(entryBox, entryCell.frozenBy, drawnRows) : []) as Dynamic) {
    if (cell.left + cell.width <= entryRight + GRID_PIXEL_SLACK) continue;
    let looksSame = cell.mergedRowCount === null && cellsJoinForOverflow(formatSoFar, cell.format, true);
    if (cell.text !== '' || !looksSame) {
      hintRight = Math.max(entryRight, Math.min(cell.left, cell.textLeft));
      break;
    }
    formatSoFar = cell.format;
  }
  let room = Math.min(hintRight, shownRight) - entryBox.left;
  let hintRoom = zoomedSize === undefined ? room : Math.max(zoomedSize.width, unzoomedEditorWidth(room, zoomedSize.scale, 'along'));
  return entryBox.left < shownLeft - GRID_PIXEL_SLACK || hintRoom < ENTRY_HINT_MIN_FONT_WIDTHS * entryCell.format.font.size ? null : hintRoom;
}
export function seenAreaOfCells(reads: WorkbookReads, sheetId?: Dynamic, cells?: Dynamic) {
  let area =
    resolvePlaceArea(
      {
        sheetId: sheetId,
        cells: cells,
      },
      readsAsStored(reads),
    )?.area ?? null;
  return area === null ? null : areaAsSeen(area, ownRowOrderOfSheet(reads, sheetId));
}
export function spillOutlineOfCell(reads: WorkbookReads, cellId?: Dynamic) {
  let cell = reads.cellOf(cellId);
  if (cell?.spill?.kind !== 'blocked') {
    let spill = reads.spillOver(cellId);
    return spill === null
      ? null
      : {
          kind: 'fills',
          area: spill.area,
        };
  }
  let cellsBlocked = {
    topLeft: cell,
    bottomRight: cell.spill.wouldFillTo,
  };
  let area = seenAreaOfCells(reads, cellId.sheetId, cellsBlocked);
  return area === null
    ? null
    : {
        kind: 'blocked',
        area: area,
      };
}
export function spillOutlineOfEntry({ formulaFromWords: { stage: stage } }: Dynamic, reads: WorkbookReads, cellId?: Dynamic) {
  if (stage?.kind !== 'proposed') return spillOutlineOfCell(reads, cellId);
  if (stage.value.fillsTo === undefined) return null;
  let cellsFilled = {
    topLeft: {
      r: cellId.rowId,
      c: cellId.columnId,
    },
    bottomRight: stage.value.fillsTo,
  };
  let area = seenAreaOfCells(reads, cellId.sheetId, cellsFilled);
  return area === null
    ? null
    : {
        kind: 'ifKept',
        area: area,
      };
}
export function formulaSpilledOverCell(reads: WorkbookReads, cellId?: Dynamic) {
  if (reads.cellOf(cellId) !== null) return null;
  return reads.spillOver(cellId)?.formulaText ?? null;
}
export function endOfWrappedTextIfCut(
  {
    text: text,
    listLines: listLines,
    format: { font: font },
    alignment: alignment,
    left: left,
    width: width,
    textLeft: textLeft,
    textWidth: textWidth,
    textLeftInWholeRow: textLeftInWholeRow,
  }: Dynamic,
  measure?: Dynamic,
) {
  let shownText = flattenLineBreaks(text);
  let [middle, textRight] = [left + width / 2, textLeft + textWidth];
  let indent = listIndentOfLines(listLines, font.size);
  let roomForText =
    (alignment === 'center' ? 2 * Math.min(middle - textLeftInWholeRow, textRight - middle) : textRight - textLeftInWholeRow) - indent;
  let [lineCount = 1] = measure.lineCountsOfWrappedTexts([
    {
      text: shownText,
      font: font,
      widthInPixels: textRoomPastPadding(roomForText),
    },
  ]);
  if (lineCount < 2) return null;
  return alignment === 'center' ? Math.min(textRight, middle + (measure.widthOfCharacters(shownText, font) + indent) / 2) : textRight;
}
export const isCellEntryBlank = (mode?: Dynamic) => mode.kind === 'editing' && mode.typingIn === 'cell' && mode.text === '';
export const ENTRY_HINT_MIN_FONT_WIDTHS = 7;
export const GRID_PIXEL_SLACK = 0.5;
