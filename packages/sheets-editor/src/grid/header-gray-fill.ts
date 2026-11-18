import type { Dynamic } from '../dynamic.ts';
import { makeIsFilterHeaderArea } from '../tables/table-drawing.ts';
import { layoutOfView } from './layout.ts';
import { makeIsInTableHeader, tablesToOutline } from '../tables/tables-in-view.ts';
import { LIGHT_GRAY_HEX, hasFontOrBorderFormatting, DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { cellColorsOfFormat, NO_CELL_COLORS } from '../format/cell-colors.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isHeaderGrayHidden(state: PageState, reads: ReadsWithTextMeasurer, cellRef?: Dynamic, position?: Dynamic, look?: Dynamic) {
  if (cellRef.sheetId !== state.sheetId || !isPlainLightGrayLook(look, reads, cellRef)) return false;
  let area = mergedAreaOrCellAt(reads, cellRef, position);
  return makeIsFilterHeaderArea(state, reads, layoutOfView(state, reads))(area) || makeIsInTableHeader(tablesToOutline(state, reads))(area);
}
export const isPlainLightGrayFill = (format?: Dynamic) =>
  format.fillColor.kind === 'rgb' &&
  format.fillColor.hex === LIGHT_GRAY_HEX &&
  !hasFontOrBorderFormatting({
    font: format.font,
    border: DEFAULT_CELL_FORMAT.border,
  });
export const mergedAreaOrCellAt = (reads: WorkbookReads, { sheetId: sheetId }: Dynamic, position?: Dynamic) =>
  reads.mergedAreaAt(sheetId, position) ?? {
    topRowIndex: position.rowIndex,
    rowCount: 1,
    leftColumnIndex: position.columnIndex,
    columnCount: 1,
  };
export const isPlainLightGrayLook = (look: Dynamic, reads: WorkbookReads, cellRef?: Dynamic) =>
  isPlainLightGrayFill(look.format) &&
  isPlainLightGrayFill(reads.formatOf(cellRef)) &&
  !look.isFillFromRule &&
  look.paints === cellColorsOfFormat(look.format);
export const looksWithoutHeaderGray = (looks: Dynamic, reads: WorkbookReads, isHeaderArea?: Dynamic) => ({
  formatOf: (cellRef?: Dynamic) => looks.formatOf(cellRef),
  formatOver: (input?: Dynamic, options?: Dynamic) => looks.formatOver(input, options),
  lookOf(cellRef?: Dynamic, position?: Dynamic) {
    let look = looks.lookOf(cellRef, position);
    return isPlainLightGrayLook(look, reads, cellRef) && isHeaderArea(mergedAreaOrCellAt(reads, cellRef, position))
      ? {
          ...look,
          paints: NO_CELL_COLORS,
        }
      : look;
  },
});
