import type { Dynamic } from '../dynamic.ts';
import {
  rowsEndOnScreen,
  cellsAreaHeight,
  ROOM_BELOW_LAST_ROW,
  cellsAreaWidth,
  columnsEndOnScreen,
  ROOM_RIGHT_OF_LAST_COLUMN_BASE,
  cellsHeightAboveFloats,
  frozenRowsHeight,
  frozenColumnsWidth,
  ROOM_RIGHT_OF_LAST_COLUMN,
  maxScrollTop,
  maxScrollLeft,
} from './geometry.ts';
import { layoutOfView } from './layout.ts';
import { withNoEffects } from '../state/transitions.ts';
import { IF_QUEUED_DEFAULTS, queueEdit } from '../model/edit-effects.ts';
import { skipRowsAddedAfterEntries, mostRowsToInsert } from '../edits/insert-lines.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function parseLineCount(text?: Dynamic) {
  let cleaned = text.normalize('NFKC').trim();
  if (!/^\d[\d,]*$/.test(cleaned)) return null;
  let count = Number(cleaned.replaceAll(',', ''));
  return Number.isSafeInteger(count) && count >= 1 ? count : null;
}
export function isEndOfLinesShown(what: Dynamic, state: PageState, layout?: Dynamic) {
  let {
    end: end,
    sizeOfFrozen: sizeOfFrozen,
    sizeOfBody: sizeOfBody,
    isScrolledOnPastCells: isScrolledOnPastCells,
  } = endOfLinesMeasure(what, state, layout);
  return end < sizeOfBody && (end >= sizeOfFrozen || !isScrolledOnPastCells);
}
export function addRowsControlBox(state: PageState, layout?: Dynamic, isHiddenAnyway?: Dynamic) {
  let rowsEnd = rowsEndOnScreen(state, layout);
  let hasNoRoom = roomForMoreLines('rows', layout.rowCount) === 0;
  let isEndOffScreen = !isEndOfLinesShown('rows', state, layout);
  if (isLinesAtEndControlHidden(state, isHiddenAnyway) || hasNoRoom || (isEndOffScreen && state.caretAtEnd !== 'rows')) return null;
  return {
    left: 0,
    top: isEndOffScreen ? cellsAreaHeight(state) + ROOM_BELOW_LAST_ROW : rowsEnd,
    width: cellsAreaWidth(state),
    height: ROOM_BELOW_LAST_ROW,
  };
}
export function addColumnsControlBox(state: PageState, layout?: Dynamic, isHiddenAnyway?: Dynamic) {
  let columnsEnd = columnsEndOnScreen(state, layout);
  let hasNoRoom = roomForMoreLines('columns', layout.columnCount) === 0;
  let isEndOffScreen = !isEndOfLinesShown('columns', state, layout);
  if (isLinesAtEndControlHidden(state, isHiddenAnyway) || hasNoRoom || (isEndOffScreen && state.caretAtEnd !== 'columns')) return null;
  return {
    left: isEndOffScreen ? cellsAreaWidth(state) + ROOM_RIGHT_OF_LAST_COLUMN_BASE : columnsEnd,
    width: ROOM_RIGHT_OF_LAST_COLUMN_BASE,
  };
}
export function addLinesAtEnd(state: PageState, workbook: ReadsWithTextMeasurer, event?: Dynamic) {
  let { sheetId: sheetId } = state;
  let layout = layoutOfView(state, workbook);
  let { rowCount: rowCount, columnCount: columnCount } = layout;
  let isRows = event.what === 'rows';
  let countNow = isRows ? rowCount : columnCount;
  if (state.mode.kind !== 'navigating' || countNow !== event.countSeen) return withNoEffects(state);
  let queueOptionsFor = (count?: Dynamic) => ({
    ...IF_QUEUED_DEFAULTS,
    select: 'placeChanged',
    endBroughtIntoView: {
      what: event.what,
      count: count,
    },
    done: {
      what: isRows ? 'rowsInserted' : 'columnsInserted',
    },
  });
  if (!isRows) {
    let lastCell = workbook.cellIdAt(sheetId, rowCount - 1, columnCount - 1);
    let columnsToAdd = Math.min(event.count, roomForMoreLines('columns', countNow));
    if (lastCell === null || !isLineCount(columnsToAdd)) return withNoEffects(state);
    return queueEdit(state, insertColumnsAtEndEdit(lastCell, columnsToAdd), queueOptionsFor(columnsToAdd));
  }
  let lastArea = lastRowArea(state, workbook, layout);
  let firstCellOfLastRow = workbook.cellIdAt(sheetId, lastArea.topRowIndex, 0);
  let rowsToAdd = Math.min(event.count, rowsAddableAtEnd(state, workbook, layout, lastArea));
  if (firstCellOfLastRow === null || !isLineCount(rowsToAdd)) return withNoEffects(state);
  return queueEdit(
    state,
    {
      ...insertRowsAtEndEdit(firstCellOfLastRow, rowsToAdd),
      formulasFromRow: firstCellOfLastRow.rowId,
    },
    queueOptionsFor(rowsToAdd + rowCount - lastArea.topRowIndex - 1),
  );
}
export function keepCaretAtEndInView(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (state.caretAtEnd === null) return state;
  let {
    end: end,
    sizeOfFrozen: sizeOfFrozen,
    sizeOfControl: sizeOfControl,
    clearRoom: clearRoom,
  } = endOfLinesMeasure(state.caretAtEnd, state, layoutOfView(state, workbook));
  return end >= sizeOfFrozen && end + sizeOfControl <= clearRoom ? state : scrollToCaretAtEnd(state, workbook);
}
export function followCaretAtEnd(previousState: Dynamic, state: PageState, workbook: ReadsWithTextMeasurer, previousWorkbook: Dynamic = workbook) {
  if (previousState.caretAtEnd === null || state.sheetId !== previousState.sheetId) return state;
  let previousLayout = layoutOfView(previousState, previousWorkbook);
  if (!isEndOfLinesShown(previousState.caretAtEnd, previousState, previousLayout)) return state;
  return endOfLinesMeasure(previousState.caretAtEnd, state, layoutOfView(state, workbook)).isScrolledOnPastCells
    ? keepCaretAtEndInView(state, workbook)
    : scrollToCaretAtEnd(state, workbook);
}
export function bringEndIntoView(state: PageState, workbook: ReadsWithTextMeasurer, { what: what, count: count }: Dynamic) {
  let layout = layoutOfView(state, workbook);
  let [edges, lineCount, room, roomAfterEnd] =
    what === 'rows'
      ? [layout.rowEdges, layout.rowCount, cellsHeightAboveFloats(state) - frozenRowsHeight(layout), ROOM_BELOW_LAST_ROW]
      : [layout.columnEdges, layout.columnCount, cellsAreaWidth(state) - frozenColumnsWidth(layout), ROOM_RIGHT_OF_LAST_COLUMN];
  if (edges.totalSize - edges.startOf(lineCount - count) + roomAfterEnd > room) return state;
  return what === 'rows'
    ? {
        ...state,
        scrollTop: Math.max(0, maxScrollTop(layout, state)),
      }
    : {
        ...state,
        scrollLeft: Math.max(0, maxScrollLeft(layout, state)),
      };
}
export const DEFAULT_LINES_TO_ADD = 1;
export const MOST_SHEET_LINES = {
  rows: 1048576,
  columns: 16384,
};
export const MOST_LINES_ADDED_AT_ONCE = {
  rows: 1e4,
  columns: 100,
};
export const roomForMoreLines = (what?: Dynamic, count?: Dynamic) =>
  Math.max(0, Math.min(MOST_LINES_ADDED_AT_ONCE[what], MOST_SHEET_LINES[what] - count));
export const lastRowArea = (state: Dynamic, workbook: WorkbookReads, layout?: Dynamic) => ({
  topRowIndex: skipRowsAddedAfterEntries(state, workbook, layout, layout.rowCount - 1),
  leftColumnIndex: 0,
  rowCount: 1,
  columnCount: layout.columnCount,
});
export const rowsAddableAtEnd = (
  state: PageState,
  workbook: WorkbookReads,
  layout?: Dynamic,
  lastArea: Dynamic = lastRowArea(state, workbook, layout),
) => Math.min(roomForMoreLines('rows', layout.rowCount), mostRowsToInsert(workbook, state.sheetId, lastArea));
export const isLinesAtEndControlHidden = (state: PageState, isHiddenAnyway?: Dynamic) =>
  isHiddenAnyway || state.sheetPointedIn !== null;
export const endOfLinesMeasure = (what: Dynamic, state: PageState, layout?: Dynamic) =>
  what === 'rows'
    ? {
        end: rowsEndOnScreen(state, layout),
        sizeOfFrozen: frozenRowsHeight(layout),
        sizeOfBody: cellsAreaHeight(state),
        sizeOfControl: ROOM_BELOW_LAST_ROW,
        clearRoom: cellsHeightAboveFloats(state),
        isScrolledOnPastCells: state.scrollTop > maxScrollTop(layout, state),
      }
    : {
        end: columnsEndOnScreen(state, layout),
        sizeOfFrozen: frozenColumnsWidth(layout),
        sizeOfBody: cellsAreaWidth(state),
        sizeOfControl: ROOM_RIGHT_OF_LAST_COLUMN_BASE,
        clearRoom: cellsAreaWidth(state),
        isScrolledOnPastCells: state.scrollLeft > maxScrollLeft(layout, state),
      };
export const insertRowsAtEndEdit = ({ sheetId: sheetId, rowId: rowId }: Dynamic, count?: Dynamic) => ({
  kind: 'insertRows',
  sheetId: sheetId,
  afterRow: rowId,
  count: count,
  formatsFromRow: rowId,
  groupsFromRow: null,
});
export const insertColumnsAtEndEdit = ({ sheetId: sheetId, columnId: columnId }: Dynamic, count?: Dynamic) => ({
  kind: 'insertColumns',
  sheetId: sheetId,
  afterColumn: columnId,
  count: count,
  formatsFromColumn: columnId,
  groupsFromColumn: null,
});
export const isLineCount = (count?: Dynamic) => Number.isInteger(count) && count >= 1;
export const scrollToCaretAtEnd = (state: PageState, workbook: ReadsWithTextMeasurer) =>
  state.caretAtEnd === null
    ? state
    : bringEndIntoView(state, workbook, {
        what: state.caretAtEnd,
        count: 0,
      });
export const dropCaretAtEndOfOtherSheet = (previousState: Dynamic, state: PageState) =>
  state.caretAtEnd === null || state.sheetId === previousState.sheetId
    ? state
    : {
        ...state,
        caretAtEnd: null,
      };
