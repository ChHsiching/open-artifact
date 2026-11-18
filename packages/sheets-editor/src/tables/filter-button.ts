import type { Dynamic } from '../dynamic.ts';
import { isCellShownBlank } from '../format/shown-text.ts';
import { activeAnchorCell } from '../selection/model.ts';
import { ownFilterAtCell, isOwnFilterDrawn } from './own-filters.ts';
import { filterValueOfCell, isOneCellSelected, isCellInFilterRecords } from './own-filter-actions.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function hasFilledNeighbour(reads: WorkbookReads, cell?: Dynamic) {
  let position = reads.positionOfCell(cell);
  return (
    position !== null &&
    NEIGHBOUR_STEPS.some(([rowStep, columnStep]: Dynamic) => {
      let cellId = reads.cellIdAt(cell.sheetId, position.rowIndex + rowStep, position.columnIndex + columnStep);
      return cellId !== null && !isCellShownBlank(reads.cellOnShowIn(cellId));
    })
  );
}
export function filterButtonOffer(state: PageState, reads: WorkbookReads) {
  if (!isNavigatingOneRange(state)) return null;
  let cell = activeAnchorCell(state, reads);
  let ownFilter = ownFilterAtCell(state, reads, cell);
  let isBlank = filterValueOfCell(reads, cell) === null;
  let isValueOffered =
    isOneCellSelected(state, reads) &&
    (ownFilter === null ? !isBlank || hasFilledNeighbour(reads, cell) : isCellInFilterRecords(reads, ownFilter, cell));
  return {
    filter:
      ownFilter === null || !isOwnFilterDrawn(state, ownFilter)
        ? {
            kind: 'turnOn',
          }
        : {
            kind: 'remove',
            tableKey: ownFilter.key,
          },
    valueOfCell: !isValueOffered ? null : isBlank ? '' : cellShownText(reads.cellOnShowIn(cell), reads.decimalSign),
  };
}
export const NEIGHBOUR_STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
export const isNavigatingOneRange = (state: PageState) => state.mode.kind === 'navigating' && !hasOtherRanges(state);
