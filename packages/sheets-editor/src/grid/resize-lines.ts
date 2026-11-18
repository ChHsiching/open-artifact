import type { Dynamic } from '../dynamic.ts';
import { shownRowRunsBetween } from '../model/cell-blocks.ts';
import { selectedArea, selectionOfArea, selectionAreaAndKind } from '../selection/model.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS, holdUntilAnswered } from '../model/edit-effects.ts';
import { layoutOfView, lineBeingResized, clampScrollOfView } from './layout.ts';
import { rangeSpansOnScreen, isSpanEndInSight, rowResizeLineAt, columnResizeLineAt, clampColumnWidth, clampRowHeight } from './geometry.ts';
import { ROW_HEADER_WIDTH } from './cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT } from './cell-metrics.ts';
import { isRowUnderStuckHeader } from './sticky-headers.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function setRowHeightsEdit(view: Dynamic, reads: WorkbookReads, oneRowId?: Dynamic, otherRowId?: Dynamic, heightInPixels?: Dynamic) {
  let { sheetId: sheetId } = view;
  let rows = shownRowRunsBetween(view, reads, sheetId, oneRowId, otherRowId);
  return rows === null
    ? null
    : {
        kind: 'setRowHeights',
        sheetId: sheetId,
        rows: rows,
        heightInPixels: heightInPixels,
      };
}
export function resizeSelectedLines(state: PageState, reads: WorkbookReads, editForSelection?: Dynamic) {
  let area = selectedArea(state, reads);
  let selection = area === null ? null : selectionOfArea(state, reads, area);
  let edit = selection === null ? null : editForSelection(selection);
  if (edit === null) return withNoEffects(state);
  let done =
    edit.kind === 'setRowHeights'
      ? {
          what: 'rowsSized',
          heightInPixels: edit.heightInPixels,
        }
      : {
          what: 'columnsSized',
          widthInPixels: edit.widthInPixels,
        };
  return queueEdit(state, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: state,
    done: done,
  });
}
export function lastShownColumnEdge(state: PageState, reads: ReadsWithTextMeasurer, isSuppressed?: Dynamic) {
  if (isSuppressed || state.mode.kind === 'editing') return null;
  let selectionArea = selectionAreaAndKind(state, reads);
  if (selectionArea?.kind !== 'columns') return null;
  let layout = layoutOfView(state, reads);
  let { across: across } = rangeSpansOnScreen(selectionArea.area, state, layout, state);
  if (!isSpanEndInSight(across)) return null;
  let columnIndex: Dynamic = selectionArea.area.leftColumnIndex + selectionArea.area.columnCount - 1;
  while (columnIndex >= selectionArea.area.leftColumnIndex && layout.columnEdges.sizeOf(columnIndex) === 0) columnIndex -= 1;
  if (columnIndex < selectionArea.area.leftColumnIndex) return null;
  return {
    columnIndex: columnIndex,
    edge: across.end,
    showFrom: across.showFrom,
  };
}
export function columnResizeUnderFinger(state: PageState, pointer: Dynamic, reads: ReadsWithTextMeasurer) {
  let columnEdge = lastShownColumnEdge(state, reads, false);
  if (columnEdge === null) return null;
  let grab = FINGER_RESIZE_GRAB / state.zoom;
  let { columnEdges: columnEdges, columnCount: columnCount } = layoutOfView(state, reads);
  let nextColumnIndex: Dynamic = columnEdge.columnIndex + 1;
  while (nextColumnIndex < columnCount && columnEdges.sizeOf(nextColumnIndex) === 0) nextColumnIndex += 1;
  let grabBefore = Math.min(grab, columnEdges.sizeOf(columnEdge.columnIndex) / 3);
  let grabAfter = nextColumnIndex < columnCount ? Math.min(grab, columnEdges.sizeOf(nextColumnIndex) / 3) : 0;
  let x = pointer.x - ROW_HEADER_WIDTH;
  return x >= Math.max(columnEdge.showFrom, columnEdge.edge - grabBefore) &&
    x <= columnEdge.edge + grabAfter &&
    pointer.y < Math.max(COLUMN_HEADER_HEIGHT, 2 * grab)
    ? columnEdge.columnIndex
    : null;
}
export function resizeLineUnderPointer(state: PageState, pointer: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  if (refusalOfEveryEdit !== null || state.mode.kind === 'editing') return null;
  if (pointer.isByFinger && pointer.isToldOfLate === true) return null;
  let layout = layoutOfView(state, reads);
  let rowLineIndex = pointer.isByFinger ? null : rowResizeLineAt(pointer, state, layout);
  let rowIndex = rowLineIndex !== null && isRowUnderStuckHeader(rowLineIndex, state, reads, layout) ? null : rowLineIndex;
  let columnIndex = pointer.isByFinger ? columnResizeUnderFinger(state, pointer, reads) : columnResizeLineAt(pointer, state, layout);
  let cellId = reads.cellIdAt(state.sheetId, rowIndex ?? 0, columnIndex ?? 0);
  if (cellId === null) return null;
  if (rowIndex !== null)
    return {
      line: {
        isA: 'row',
        rowId: cellId.rowId,
      },
      sizeInPixels: layout.rowEdges.sizeOf(rowIndex),
    };
  if (columnIndex === null) return null;
  return {
    line: {
      isA: 'column',
      columnId: cellId.columnId,
    },
    sizeInPixels: layout.columnEdges.sizeOf(columnIndex),
  };
}
export function selectionCoveringLine(state: PageState, reads: ReadsWithTextMeasurer, line?: Dynamic) {
  let selectionArea = selectionAreaAndKind(state, reads);
  if (selectionArea === null) return null;
  let { area: area, kind: kind } = selectionArea;
  let layout = layoutOfView(state, reads);
  if (!(area.rowCount === layout.rowCount && area.columnCount === layout.columnCount) && kind !== (line.isA === 'row' ? 'rows' : 'columns'))
    return null;
  let [lineIndex, firstIndex, count] =
    line.isA === 'row'
      ? [reads.rowIndexOf(state.sheetId, line.rowId), area.topRowIndex, area.rowCount]
      : [reads.columnIndexOf(state.sheetId, line.columnId), area.leftColumnIndex, area.columnCount];
  return lineIndex !== null && lineIndex >= firstIndex && lineIndex < firstIndex + count ? selectionOfArea(state, reads, area) : null;
}
export function rowHeightsEditForLine(state: PageState, reads: ReadsWithTextMeasurer, line?: Dynamic, heightInPixels?: Dynamic) {
  let selection = selectionCoveringLine(state, reads, line);
  return selection === null
    ? setRowHeightsEdit(state, reads, line.rowId, line.rowId, heightInPixels)
    : setRowHeightsEdit(state, reads, selection.activeCell.rowId, selection.selectionCorner.rowId, heightInPixels);
}
export function columnsToResizeForLine(state: PageState, reads: ReadsWithTextMeasurer, line?: Dynamic) {
  let selection = selectionCoveringLine(state, reads, line);
  return selection === null ? [line.columnId, line.columnId] : [selection.activeCell.columnId, selection.selectionCorner.columnId];
}
export function finishResizeDrag(state: PageState, drag: Dynamic, { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) {
  let { line: line, sizeAtPress: sizeAtPress } = drag;
  let view = endDragKeepingScroll(state, reads);
  let sizeInPixels = lineBeingResized(state, reads)?.sizeInPixels;
  let isUnchanged = sizeInPixels === sizeAtPress || drag.sizeInPixels === sizeAtPress;
  if (sizeInPixels === undefined || isUnchanged) return withNoEffects(view);
  if (refusalOfEveryEdit !== null)
    return withNoEffects({
      ...view,
      notice: {
        kind: 'editRefused',
        why: refusalOfEveryEdit,
        asked: 'otherEdit',
      },
    });
  let edit =
    line.isA === 'row'
      ? rowHeightsEditForLine(state, reads, line, sizeInPixels)
      : (setColumnWidthsEdit as Dynamic)(state.sheetId, ...columnsToResizeForLine(state, reads, line), sizeInPixels);
  return edit === null ? withNoEffects(view) : holdUntilAnswered(queueResizeEdit(view, edit), drag);
}
export function resetRowHeightOnDoublePress(state: PageState, message?: Dynamic, context?: Dynamic) {
  let line = resizeLineUnderPointer(state, message, context)?.line;
  if (line?.isA !== 'row') return null;
  let edit = rowHeightsEditForLine(state, context.reads, line, null);
  return edit === null ? withNoEffects(state) : queueResizeEdit(state, edit);
}
export const setColumnWidthsEdit = (sheetId?: Dynamic, oneColumn?: Dynamic, otherColumn?: Dynamic, widthInPixels?: Dynamic) => ({
  kind: 'setColumnWidths',
  sheetId: sheetId,
  oneColumn: oneColumn,
  otherColumn: otherColumn,
  widthInPixels: widthInPixels,
});
export const chooseColumnWidth = (state: PageState, reads: WorkbookReads, widthInPixels?: Dynamic) =>
  resizeSelectedLines(
    state,
    reads,
    ({ activeCell: activeCell, selectionCorner: selectionCorner }: Dynamic) =>
      setColumnWidthsEdit(state.sheetId, activeCell.columnId, selectionCorner.columnId, clampColumnWidth(widthInPixels)),
  );
export const chooseRowHeight = (state: PageState, reads: WorkbookReads, heightInPixels?: Dynamic) =>
  resizeSelectedLines(
    state,
    reads,
    ({ activeCell: activeCell, selectionCorner: selectionCorner }: Dynamic) =>
      setRowHeightsEdit(state, reads, activeCell.rowId, selectionCorner.rowId, heightInPixels === null ? null : clampRowHeight(heightInPixels)),
  );
export const FINGER_RESIZE_GRAB = 20;
export const queueResizeEdit = (state?: Dynamic, edit?: Dynamic) =>
  queueEdit(
    {
      ...state,
      lastDone: null,
    },
    edit,
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
    },
  );
export const endDragKeepingScroll = (state: Dynamic, reads: ReadsWithTextMeasurer) =>
  clampScrollOfView(
    {
      ...state,
      dragging: null,
    },
    reads,
  );
