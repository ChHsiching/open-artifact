import type { Dynamic } from '../dynamic.ts';
import { textLineMiddleY, textRoomInWidth, CELL_TEXT_PADDING_X } from './cell-metrics.ts';
import { rowHeightForLinesAtDensity } from './cell-metrics-values.ts';
import { cellsHeightAboveFloats, cellsAreaHeight } from './geometry.ts';
import type { PageState } from '../state/initial-state.ts';
export function middleOfCellTextFromTop(cell?: Dynamic, density?: Dynamic, measurer?: Dynamic) {
  let { height: height, format: format, hiddenByBorderAtFoot: hiddenByBorderAtFoot, text: text } = cell;
  if (isCellMarkInMiddle(cell)) return height / 2;
  let { vertical: vertical } = format.alignment;
  let { size: size } = format.font;
  let middle = textLineMiddleY(height, size, vertical, density, hiddenByBorderAtFoot);
  if (!cell.isTextWrapped || vertical === 'center') return middle;
  let [lineCount = 1] = measurer.lineCountsOfWrappedTexts([
    {
      text: text,
      font: format.font,
      widthInPixels: textRoomInWidth(cell.width),
    },
  ]);
  let extraHeight = rowHeightForLinesAtDensity(lineCount, size, density) - rowHeightForLinesAtDensity(1, size, density);
  return middle + ((vertical === 'top' ? 1 : -1) * extraHeight) / 2;
}
export function spanOfCellText(cell?: Dynamic, measurer?: Dynamic) {
  let { left: left, width: width, text: text, alignment: alignment } = cell;
  if (isCellMarkInMiddle(cell)) return [left + width / 2, left + width / 2];
  if (cell.isPerson || cell.pill !== null || cell.linkUrl !== null) return [left, left + width];
  let room = textRoomInWidth(cell.textWidth);
  let textWidth = cell.isTextWrapped ? room : Math.min(room, measurer.widthOfCharacters(text, cell.format.font));
  let alignedBy =
    {
      left: 0,
      center: 0.5,
      right: 1,
    }[alignment as 'left' | 'center' | 'right'] *
    (room - textWidth);
  let middle = cell.textLeft + CELL_TEXT_PADDING_X / 2 + alignedBy + textWidth / 2;
  return [middle, middle];
}
export function edgesOfBarsAtFoot(state: PageState, leftOfBody?: Dynamic) {
  let clearance = BARS_CLEARANCE / state.zoom;
  if (state.isNarrowByTouch)
    return [
      {
        edge: cellsHeightAboveFloats(state) - clearance,
        from: -1 / 0,
        to: 1 / 0,
      },
    ];
  return [
    ...state.boxesAtFootByTouch,
    {
      left: -1 / 0,
      right: 1 / 0,
      heightUnder: 0,
    },
  ]
    .slice(state.boxesAtFootByTouch.length === 0 ? 1 : 0)
    .map(
      ({ left: left, right: right, heightUnder: heightUnder }: Dynamic = {}) => ({
        edge: cellsAreaHeight(state) - heightUnder - clearance,
        from: left - leftOfBody,
        to: right - leftOfBody,
      }),
    );
}
export function rowsWithCellsBehindBars(
  rows?: Dynamic,
  edges?: Dynamic,
  { density: density, leftOfBody: leftOfBody }: Dynamic = {},
  measurer?: Dynamic,
) {
  let highestEdge = Math.min(...edges.map(({ edge: edge }: Dynamic = {}) => edge));
  let isBehindBars = (top?: Dynamic, [from, to]: Dynamic = []) =>
    edges.some(({ edge: edge, from: barFrom, to: barTo }: Dynamic = {}) => top > edge && to > barFrom && from < barTo);
  return rows.map((row?: Dynamic) => {
    let height = Math.max(row.height, ...row.cells.map(({ top: top, height: cellHeight }: Dynamic = {}) => top + cellHeight));
    if (row.top + height <= highestEdge) return row;
    let cells = row.cells.map(
      (cell?: Dynamic) =>
        !cell.isActive && isBehindBars(row.top + cell.top + middleOfCellTextFromTop(cell, density, measurer), spanOfCellText(cell, measurer))
          ? {
              ...cell,
              isBehindBars: true,
            }
          : cell,
    );
    let heightInView = row.height - row.outOfViewAbove - row.outOfViewBelow;
    let isNumberBehindBars = isBehindBars(row.top + row.outOfViewAbove + heightInView / 2, [-leftOfBody / 2, -leftOfBody / 2]);
    return {
      ...row,
      cells: cells,
      isNumberBehindBars: isNumberBehindBars,
      isBehindBars: isNumberBehindBars && cells.every(({ isBehindBars: isCellBehindBars }: Dynamic = {}) => isCellBehindBars),
    };
  });
}
export const BARS_CLEARANCE = 3;
export const isCellMarkInMiddle = (cell?: Dynamic) => cell.checkbox !== null || (cell.text.trim() === '' && !cell.isPerson);
