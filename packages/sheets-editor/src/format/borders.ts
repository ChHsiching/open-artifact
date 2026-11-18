import type { Dynamic } from '../dynamic.ts';
import { selectedArea, selectionOfArea, isSameArea } from '../selection/model.ts';
import { cellBlockOfSelection } from '../model/cell-blocks.ts';
import { withNoEffects } from '../state/transitions.ts';
import { IF_QUEUED_DEFAULTS, queueEdit } from '../model/edit-effects.ts';
import { NO_COLOR } from '../model/colors.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function drawBordersOnSelection(state: PageState, workbook: WorkbookReads, edges?: Dynamic, penOverride: Dynamic = {}) {
  let area = selectedArea(state, workbook);
  let selection = area === null ? null : selectionOfArea(state, workbook, area);
  let cells = selection === null ? null : cellBlockOfSelection(state, workbook, selection);
  if (area === null || cells === null) return withNoEffects(state);
  let touchesMergedArea = workbook.mergedAreasIn(state.sheetId, area).some((mergedArea?: Dynamic) => isSameArea(mergedArea, area));
  let queueOptions = {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    leavesEntryOpen: true,
  };
  return edges === 'clear'
    ? queueEdit(
        state,
        {
          kind: 'setBorders',
          cells: cells,
          edges: 'all',
          border: {
            kind: 'none',
          },
        },
        {
          ...queueOptions,
          done: 'bordersCleared',
        },
      )
    : queueEdit(
        state,
        {
          kind: 'setBorders',
          cells: cells,
          edges: edges,
          border: {
            kind: 'line',
            ...state.borderPen,
            ...penOverride,
          },
        },
        {
          ...queueOptions,
          done: showsBordersOnArea(area, touchesMergedArea, edges)
            ? {
                what: 'bordersDrawn',
                edges: edges,
              }
            : null,
        },
      );
}
export const BORDER_EDGE_CHOICES = ['all', 'inner', 'innerHorizontal', 'innerVertical', 'outer', 'left', 'top', 'right', 'bottom'];
export const BORDER_LINE_STYLES = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'];
export const DEFAULT_BORDER_PEN = {
  style: 'thin',
  color: NO_COLOR,
};
export const showsBordersOnArea = (
  { rowCount: rowCount, columnCount: columnCount }: Dynamic,
  touchesMergedArea?: Dynamic,
  edges?: Dynamic,
) => {
  if (touchesMergedArea) return !edges.startsWith('inner');
  if (edges === 'inner') return rowCount > 1 || columnCount > 1;
  if (edges === 'innerHorizontal') return rowCount > 1;
  return edges !== 'innerVertical' || columnCount > 1;
};
