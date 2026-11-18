import type { Dynamic } from '../dynamic.ts';
import { selectedArea, selectionOfArea, areaGrownOverMerges, areaOfPosition } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { cellBlockOfSelection, unbrokenCellBlockOfCorners } from '../model/cell-blocks.ts';
import { IF_QUEUED_DEFAULTS, queueEdit, selectedRangeOf } from '../model/edit-effects.ts';
import { noticeRowsOutOfViewInTheWay } from '../edits/rows-out-of-view.ts';
import { cellInputKey } from '../model/cell-values.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function fitsMergeUndo(cellKeys?: Dynamic) {
  return cellKeys.reduce((total?: Dynamic, key?: Dynamic) => total + 200 + 6 * key.length, 0) <= 262144;
}
export function topLeftPositionOf(cellIds: Dynamic, reads: WorkbookReads) {
  let topLeft: Dynamic = null;
  for (let cellId of cellIds as Dynamic) {
    let position = reads.positionOfCell(cellId);
    if (position === null) continue;
    if (
      topLeft === null ||
      position.rowIndex < topLeft.rowIndex ||
      (position.rowIndex === topLeft.rowIndex && position.columnIndex < topLeft.columnIndex)
    )
      topLeft = position;
  }
  return topLeft;
}
export function mergeOrUnmergeSelection(state: PageState, reads: WorkbookReads, act?: Dynamic) {
  let area = selectedArea(state, reads);
  let selection = area === null ? null : selectionOfArea(state, reads, area);
  if (area === null || selection === null) return withNoEffects(state);
  if (act === 'unmergeCells') {
    let cells = cellBlockOfSelection(state, reads, selection);
    let queueOptions = {
      ...IF_QUEUED_DEFAULTS,
      select: area,
      done: 'unmerged',
    };
    return cells === null
      ? withNoEffects(state)
      : queueEdit(
          state,
          {
            kind: 'unmergeCells',
            cells: cells,
          },
          queueOptions,
        );
  }
  let grownArea = areaGrownOverMerges(reads, state.sheetId, area);
  let grownSelection = selectionOfArea(state, reads, grownArea);
  let cellBlock = grownSelection === null ? null : unbrokenCellBlockOfCorners(state, reads, selectedRangeOf(grownSelection));
  if (cellBlock === null) return noticeRowsOutOfViewInTheWay(state, 'mergeCells');
  let filledCells = reads.filledCellsIn(state.sheetId, grownArea);
  let cellKeys = filledCells.map((cellId?: Dynamic) => cellInputKey(reads.cellOf(cellId)));
  if (filledCells.length > 1 && !fitsMergeUndo(cellKeys))
    return withNoEffects({
      ...state,
      notice: {
        kind: 'mergeWouldClearCells',
      },
    });
  let keptPosition = filledCells.length > 1 ? topLeftPositionOf(filledCells, reads) : null;
  let undoOffer =
    keptPosition === null
      ? null
      : {
          kind: 'mergeClearedCells',
          cells: areaToA1AsStored(grownArea, ownRowOrderOfSheet(reads, state.sheetId)),
          keptCell: areaToA1AsStored(areaOfPosition(keptPosition), ownRowOrderOfSheet(reads, state.sheetId)),
        };
  return queueEdit(
    state,
    {
      kind: 'mergeCells',
      cells: cellBlock,
    },
    {
      ...IF_QUEUED_DEFAULTS,
      select: grownArea,
      done: undoOffer === null ? 'merged' : null,
      undoOffer: undoOffer,
    },
  );
}
