import type { Dynamic } from '../dynamic.ts';
import { selectedChartInputAreas } from '../charts/placed-views.ts';
import { areasOverlap } from '../model/workbook.ts';
import { isCommentMarkedOnGrid } from '../comments/comment-state.ts';
import { selectedAreaAsSeen } from '../presence/selections.ts';
import { isSpanInSight, paneRect } from './geometry.ts';
import { checkboxCentreInCell } from '../chips/checkbox-presses.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function textColorNameOf(color?: Dynamic) {
  if (color.kind === 'named') return color.name;
  return INDEXED_FORMAT_COLOR_NAMES[color.index - 1] ?? null;
}
export function makeIsAreaMarkedByEntry(state: PageState, reads: WorkbookReads) {
  let areasMarked = [
    ...state.referencesInEntry.flatMap(
      (reference?: Dynamic) => (reference.sheetId === state.sheetId ? (reference.pieces ?? [reference.area]) : []),
    ),
    ...(state.referencesInEntry.length > 0 ? [] : selectedChartInputAreas(state, reads)).map(({ area: area }: Dynamic) => area),
  ];
  return (area?: Dynamic) => areasMarked.some((markedArea?: Dynamic) => areasOverlap(markedArea, area));
}
export function makeIsCellMarkedForAttention(state: PageState, reads: WorkbookReads) {
  let { sheetId: sheetId } = state;
  let foundCellKeys = new (Set as Dynamic)((state.find?.hits ?? []).map(({ cellId: cellId }: Dynamic) => cellDrawKey(cellId)));
  let commentAreas = [
    ...(state.newCommentOn === null ? [] : [state.newCommentOn]),
    ...(state.comments ?? []).flatMap((comment?: Dynamic) => (isCommentMarkedOnGrid(state, comment) ? [comment.cells] : [])),
  ].flatMap((cells?: Dynamic) => (cells.activeCell.sheetId === sheetId ? (selectedAreaAsSeen(cells, reads) ?? []) : []));
  let isMarkedByEntry = makeIsAreaMarkedByEntry(state, reads);
  return (cellId?: Dynamic, area?: Dynamic) =>
    foundCellKeys.has(cellDrawKey(cellId)) ||
    isMarkedByEntry(area) ||
    commentAreas.some((commentArea?: Dynamic) => areasOverlap(commentArea, area));
}
export function clipBoxToShown({ left: left, top: top, width: width, height: height, showsIn: showsIn }: Dynamic) {
  let [clippedLeft, clippedTop] = [Math.max(left, showsIn.left), Math.max(top, showsIn.top)];
  return {
    left: clippedLeft,
    top: clippedTop,
    width: Math.min(left + width, showsIn.left + showsIn.width) - clippedLeft,
    height: Math.min(top + height, showsIn.top + showsIn.height) - clippedTop,
  };
}
export function drawnBoxOfSpans({ across: across, down: down }: Dynamic, margin: Dynamic = BOX_MARGIN_PAST_SIGHT) {
  if (!isSpanInSight(across) || !isSpanInSight(down)) return null;
  let startOf = ({ start: start, showFrom: showFrom }: Dynamic) => Math.max(start, showFrom - margin);
  let endOf = ({ end: end, showTo: showTo, isEndUnderFrozenLines: isEndUnderFrozenLines }: Dynamic) =>
    isEndUnderFrozenLines ? showTo + BOX_MARGIN_PAST_SIGHT : Math.min(end, showTo + margin);
  let [left, top] = [startOf(across), startOf(down)];
  return {
    left: left,
    top: top,
    width: endOf(across) - left,
    height: endOf(down) - top,
    showsIn: paneRect(across, down),
  };
}
export function checkboxMiddleInBox(cellBox?: Dynamic, cellRect?: Dynamic, shownBox?: Dynamic, alignment?: Dynamic) {
  let middle = checkboxCentreInCell(cellRect.right - cellRect.left, cellRect.bottom - cellRect.top, alignment);
  return {
    middleFromLeft: clampToTwiceSize(cellBox.left + middle.x - shownBox.left, shownBox.width),
    middleFromTop: clampToTwiceSize(cellBox.top + middle.y - shownBox.top, shownBox.height),
  };
}
export function indentToCenterIn(span?: Dynamic, box?: Dynamic) {
  let roomBefore = box.left - span.start;
  let roomAfter = span.end - (box.left + box.width);
  return Math.max(-2 * box.width, Math.min(roomAfter - roomBefore, 2 * box.width));
}
export function clipSpanToShown(start?: Dynamic, size?: Dynamic, shownStart?: Dynamic, shownEnd?: Dynamic) {
  if (size <= shownEnd - shownStart) return [start, size];
  let clippedStart = Math.max(start, shownStart);
  return [clippedStart, Math.min(start + size, shownEnd) - clippedStart];
}
export const INDEXED_FORMAT_COLOR_NAMES = [
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'magenta',
  'cyan',
  'red',
  'green',
  'blue',
  'yellow',
  'magenta',
  'cyan',
  'gray',
  'gray',
  'blue',
  'magenta',
  'yellow',
  'cyan',
  'magenta',
  'red',
  'blue',
  'blue',
  'blue',
  'magenta',
  'yellow',
  'cyan',
  'magenta',
  'red',
  'cyan',
  'blue',
  'cyan',
  'cyan',
  'green',
  'yellow',
  'blue',
  'magenta',
  'violet',
  'orange',
  'blue',
  'cyan',
  'yellow',
  'yellow',
  'orange',
  'orange',
  'blue',
  'gray',
  'blue',
  'green',
  'green',
  'yellow',
  'orange',
  'magenta',
  'blue',
  'gray',
];
export const cellDrawKey = ({ sheetId: sheetId, rowId: rowId, columnId: columnId }: Dynamic) => `${sheetId} ${rowId} ${columnId}`;
export const commentMarksAtPoint = ({ body: body, marksOfComments: marksOfComments }: Dynamic, point?: Dynamic) =>
  marksOfComments.flatMap((mark?: Dynamic) => {
    let { left: left, top: top, width: width, height: height } = clipBoxToShown(mark);
    let [x, y] = [point.x - body.left - left, point.y - body.top - top];
    return x >= 0 && x < width && y >= 0 && y < height ? [mark.key] : [];
  });
export const BOX_MARGIN_PAST_SIGHT = 8;
export const BIG_BOX_MARGIN_PAST_SIGHT = 4096;
export const startAndSizeOf = ({ start: start, end: end }: Dynamic) => ({
  start: start,
  size: end - start,
});
export const paneWithExtraReach = (pane?: Dynamic, { before: before, after: after }: Dynamic = {}) => ({
  ...pane,
  showFrom: pane.showFrom - before,
  showTo: pane.showTo + after,
});
export const editorBoxOfSpans = ({ across: across, down: down }: Dynamic) => ({
  left: across.start,
  top: down.start,
  width: across.end - across.start,
});
export const withEndsNotUnderFrozenLines = ({ across: across, down: down }: Dynamic) => ({
  across: {
    ...across,
    isEndUnderFrozenLines: false,
  },
  down: {
    ...down,
    isEndUnderFrozenLines: false,
  },
});
export const boxInScrolledPane = ({ scrollLeft: scrollLeft, scrollTop: scrollTop }: Dynamic, rect?: Dynamic) => ({
  left: rect.left - scrollLeft,
  top: rect.top - scrollTop,
  width: rect.right - rect.left,
  height: rect.bottom - rect.top,
});
export const clampToTwiceSize = (offset?: Dynamic, size?: Dynamic) => Math.max(-size, Math.min(offset, 2 * size));
export const NO_EDITOR_LAYOUT = {
  editorBox: null,
  editorLineCount: 1,
  editorFoldsAt: null,
};
