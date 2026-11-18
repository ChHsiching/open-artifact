import type { Dynamic } from '../dynamic.ts';
export function commentAnchorOfCells(topLeft?: Dynamic, bottomRight?: Dynamic) {
  let cornerPart =
    topLeft.rowId === bottomRight.rowId && topLeft.columnId === bottomRight.columnId ? '' : `:${bottomRight.rowId}/${bottomRight.columnId}`;
  let anchor = `cells:${topLeft.sheetId}/${topLeft.rowId}/${topLeft.columnId}${cornerPart}`;
  return anchor.length <= 256 && COMMENT_CELLS_ANCHOR_PATTERN.test(anchor) ? anchor : null;
}
export function cellsOfCommentAnchor(anchor?: Dynamic) {
  let [, sheetId, rowId, columnId, cornerRowId, cornerColumnId] = COMMENT_CELLS_ANCHOR_PATTERN.exec(anchor) ?? [];
  if (sheetId === undefined || rowId === undefined || columnId === undefined) return null;
  let activeCell = {
    sheetId: sheetId,
    rowId: rowId,
    columnId: columnId,
  };
  return {
    activeCell: activeCell,
    selectionCorner:
      cornerRowId === undefined || cornerColumnId === undefined
        ? activeCell
        : {
            sheetId: sheetId,
            rowId: cornerRowId,
            columnId: cornerColumnId,
          },
  };
}
export const COMMENT_CELLS_ANCHOR_PATTERN = /^cells:([\w.]+)\/([\w.]+)\/([\w.]+)(?::([\w.]+)\/([\w.]+))?$/;
