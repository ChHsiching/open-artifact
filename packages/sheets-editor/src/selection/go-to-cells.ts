import type { PageState } from '../state/initial-state.ts';
import type { CellArea } from './model.ts';
import { isModalOpen } from '../ui/find.ts';
import { selectionOfArea, selectionKindOf, moveActiveCellTo } from './model.ts';
import { layoutOfView } from '../grid/layout.ts';
import { unhideFilteredRowsIn } from '../tables/filtered-rows.ts';
import { revealAreaInCollapsedGroups } from '../grid/outline-groups.ts';
import { withoutOtherRanges } from './several-ranges.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function goToCells(state: PageState, workbook: ReadsWithTextMeasurer, area: CellArea): PageState {
  if (state.mode.kind !== 'navigating' || isModalOpen(state) || state.dragging !== null) return state;
  let isOneCell = area.rowCount === 1 && area.columnCount === 1;
  let selection = selectionOfArea(state, workbook, area);
  if (selection === null) return state;
  let selectionKind = selectionKindOf(area, layoutOfView(state, workbook));
  let firstLine: CellArea =
    selectionKind === 'rows'
      ? {
          ...area,
          rowCount: 1,
        }
      : {
          ...area,
          columnCount: 1,
        };
  let unhidden =
    selectionKind === 'cells'
      ? state
      : unhideFilteredRowsIn(revealAreaInCollapsedGroups(state, workbook, firstLine), workbook, state.sheetId, firstLine);
  let moved = moveActiveCellTo(
    {
      ...withoutOtherRanges(unhidden),
      menu: null,
    },
    workbook,
    selection.activeCell,
  );
  if (isOneCell) return moved;
  return {
    ...moved,
    ...selection,
    cameToMergedCellsAt: null,
  };
}
