import type { Dynamic } from '../dynamic.ts';
import { selectedAreaAsSeen, selectionInRowOrder } from '../presence/selections.ts';
import { rangeSpansOnScreen, isSpanEndInSight, hitTestGrid } from '../grid/geometry.ts';
import { isPointOnFillHandle } from '../selection/fill-handle.ts';
import { selectedArea, mergedAreaOrCellOf, moveActiveCellTo, isSameCell } from '../selection/model.ts';
import { layoutOfView } from '../grid/layout.ts';
import { withoutOtherRanges } from '../selection/several-ranges.ts';
import { commentAnchorOfCells, cellsOfCommentAnchor } from './anchors.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet, wholeRowSpanIn } from '../model/line-ids.ts';
import { withNoEffects } from '../state/transitions.ts';
import { isModalOpen } from '../ui/find.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { isNothingOpenButPane } from '../state/edit-refusals.ts';
import { hasFilteredRowsIn } from '../tables/filtered-rows.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function isActiveCellInComment({ cells: cells }: Dynamic, { activeCell: activeCell }: Dynamic, reads: WorkbookReads) {
  let activeCellPosition = reads.positionOfCell(activeCell);
  let value = cells.activeCell.sheetId === activeCell.sheetId ? selectedAreaAsSeen(cells, reads) : null;
  return (
    activeCellPosition !== null &&
    value !== null &&
    activeCellPosition.rowIndex >= value.topRowIndex &&
    activeCellPosition.rowIndex < value.topRowIndex + value.rowCount &&
    activeCellPosition.columnIndex >= value.leftColumnIndex &&
    activeCellPosition.columnIndex < value.leftColumnIndex + value.columnCount
  );
}
export function openCommentCountBySheet({ comments: comments }: Dynamic, reads: WorkbookReads) {
  let countBySheet = new (Map as Dynamic)();
  for (let { cells: cells, isResolved: isResolved } of (comments ?? []) as Dynamic) {
    let { sheetId: sheetId } = cells.activeCell;
    if (!isResolved && selectedAreaAsSeen(cells, reads) !== null) countBySheet.set(sheetId, (countBySheet.get(sheetId) ?? 0) + 1);
  }
  return countBySheet;
}
export function doesCommentEndAtSelectionCorner(cells?: Dynamic, area?: Dynamic, reads?: Dynamic, cellReads?: Dynamic, layout?: Dynamic) {
  let commentArea = cells.activeCell.sheetId === reads.sheetId ? selectedAreaAsSeen(cells, cellReads) : null;
  if (commentArea === null || area === null) return false;
  let [commentSpans, areaSpans] = [rangeSpansOnScreen(commentArea, reads, layout, reads), rangeSpansOnScreen(area, reads, layout, reads)];
  return (
    [commentSpans.across, commentSpans.down, areaSpans.across, areaSpans.down].every(isSpanEndInSight) &&
    [commentSpans.across, commentSpans.down].every(({ start: start, end: end }: Dynamic) => start < end) &&
    commentSpans.across.end === areaSpans.across.end &&
    commentSpans.down.end === areaSpans.down.end
  );
}
export function commentAtSelectionCorner(state: PageState, reads?: Dynamic, context?: Dynamic) {
  if (!isPointOnFillHandle(state, reads, context, true)) return null;
  let { reads: cellReads } = context;
  let [selection, layout] = [selectedArea(state, cellReads), layoutOfView(state, cellReads)];
  return (
    state.comments?.findLast(
      ({ cells: cells, isResolved: isResolved, isOpen: isOpen }: Dynamic) =>
        (isOpen || !isResolved) && doesCommentEndAtSelectionCorner(cells, selection, state, cellReads, layout),
    ) ?? null
  );
}
export function newCommentPlace(state: PageState, reads: WorkbookReads) {
  let filteredArea = isFilteredSelectionForComment(state, reads)
    ? mergedAreaOrCellOf(reads, state.activeCell)
    : selectedArea(withoutOtherRanges(state), reads);
  if (filteredArea === null) return null;
  let { sheetId: sheetId } = state.activeCell;
  let startCellId = reads.cellIdAt(sheetId, filteredArea.topRowIndex, filteredArea.leftColumnIndex);
  let endCellId = reads.cellIdAt(
    sheetId,
    filteredArea.topRowIndex + filteredArea.rowCount - 1,
    filteredArea.leftColumnIndex + filteredArea.columnCount - 1,
  );
  if (startCellId === null || endCellId === null) return null;
  let stored = selectionInRowOrder(
    'stored',
    {
      activeCell: startCellId,
      selectionCorner: endCellId,
    },
    reads,
  );
  let value = commentAnchorOfCells(stored.activeCell, stored.selectionCorner);
  let matchIndex = reads.listSheets().findIndex((input?: Dynamic) => input.sheetId === sheetId);
  if (value === null || matchIndex < 0) return null;
  return {
    anchor: value,
    cells: areaToA1AsStored(filteredArea, ownRowOrderOfSheet(reads, sheetId)),
    sheetNumber: matchIndex + 1,
  };
}
export function openCommentAtSelection(state: PageState, reads: ReadsWithTextMeasurer, isForAgent?: Dynamic) {
  let navigated = withoutOtherRanges(
    state.menu === null
      ? state
      : {
          ...state,
          menu: null,
        },
  );
  let area = isFilteredSelectionForComment(navigated, reads) ? moveActiveCellTo(navigated, reads, navigated.activeCell) : navigated;
  if (area.comments === null || area.mode.kind !== 'navigating') return withNoEffects(area);
  let comment = commentAtActiveCell(area, reads);
  if (comment !== null)
    return {
      state: area,
      effects: [
        {
          kind: 'openComment',
          handle: comment.handle,
        },
      ],
    };
  let place = newCommentPlace(area, reads);
  return place === null
    ? withNoEffects(area)
    : {
        state: area,
        effects: [
          {
            kind: 'openCommentBox',
            ...place,
            isForAgent: isForAgent,
          },
        ],
      };
}
export function openCommentByKeyboard(state: PageState, reads: WorkbookReads, handle?: Dynamic) {
  let comment = state.comments?.find((comment2?: Dynamic) => comment2.handle === handle);
  return comment === undefined ||
    state.mode.kind !== 'navigating' ||
    state.newCommentOn !== null ||
    state.comments?.some(({ isOpen: isOpen }: Dynamic) => isOpen) === true ||
    state.contextBarMenu !== null ||
    isCommentBlocked(state) ||
    !isActiveCellInComment(comment, state, reads)
    ? withNoEffects(state)
    : {
        state: state,
        effects: [
          {
            kind: 'openComment',
            handle: comment.handle,
            isKeyboardLeft: true,
          },
        ],
      };
}
export function shutCommentLeftBehind(state: PageState, transition: Dynamic, reads: WorkbookReads) {
  let comment = transition.state.comments?.find(({ isOpen: isOpen }: Dynamic) => isOpen);
  return comment !== undefined &&
    !isSameCell(state.activeCell, transition.state.activeCell) &&
    !isActiveCellInComment(comment, transition.state, reads) &&
    !transition.effects.some(({ kind: kind }: Dynamic) => kind === 'openComment')
    ? {
        ...transition,
        effects: [
          ...transition.effects,
          {
            kind: 'shutComment',
          },
        ],
      }
    : transition;
}
export function goToComment(state: PageState, reads: ReadsWithTextMeasurer, handle?: Dynamic) {
  let isBlocked = state.mode.kind !== 'navigating' || isModalOpen(state) || state.dragging !== null;
  let commentCells = state.comments?.find((comment2?: Dynamic) => comment2.handle === handle)?.cells;
  let comment = commentCells === undefined ? undefined : selectionInRowOrder('seen', commentCells, reads);
  if (isBlocked || comment === undefined || selectedArea(comment, reads) === null) return state;
  let navigated = withoutOtherRanges(showSheet(state, reads, comment.activeCell.sheetId));
  if (navigated.sheetId !== comment.activeCell.sheetId) return state;
  return {
    ...moveActiveCellTo(navigated, reads, comment.activeCell),
    selectionCorner: comment.selectionCorner,
  };
}
export function shutCommentBoxLeftBehind(state: PageState, transition: Dynamic, reads: WorkbookReads) {
  let newCommentOn = transition.state.newCommentOn;
  return newCommentOn !== null &&
    !isSameCell(state.activeCell, transition.state.activeCell) &&
    !canCommentModePickNow(state) &&
    !isActiveCellInComment(
      {
        cells: newCommentOn,
      },
      transition.state,
      reads,
    )
    ? {
        ...transition,
        effects: [
          {
            kind: 'shutCommentBox',
          },
          ...transition.effects,
        ],
      }
    : transition;
}
export function shutCommentsOnPress(state: PageState, reads?: Dynamic, transition?: Dynamic, cellReads?: Dynamic) {
  let hasNewComment = state.newCommentOn !== null && !canCommentModePickNow(state);
  let hasOpenComment = state.comments?.some(({ isOpen: isOpen }: Dynamic) => isOpen) === true;
  let isDraggingChanged = transition.state.dragging !== state.dragging;
  if ((!hasNewComment && !hasOpenComment) || isDraggingChanged) return transition;
  if (hitTestGrid(reads, state, layoutOfView(state, cellReads)) !== null) return transition;
  return {
    ...transition,
    effects: [
      ...(hasNewComment
        ? [
            {
              kind: 'shutCommentBox',
            },
          ]
        : []),
      ...transition.effects,
      ...(hasOpenComment
        ? [
            {
              kind: 'shutComment',
            },
          ]
        : []),
    ],
  };
}
export const withCommentsTold = (transition: Dynamic, { listed: listed, boxAnchor: boxAnchor }: Dynamic) => ({
  ...transition,
  comments: listed.flatMap(({ anchor: anchor, ...input }: Dynamic) => {
    let cellsOfCommentAnchor2 = cellsOfCommentAnchor(anchor);
    return cellsOfCommentAnchor2 === null
      ? []
      : [
          {
            ...input,
            cells: cellsOfCommentAnchor2,
          },
        ];
  }),
  newCommentOn: boxAnchor === null ? null : cellsOfCommentAnchor(boxAnchor),
});
export const isActiveCellInOpenComment = (
  { comments: comments, newCommentOn: newCommentOn }: Dynamic,
  reads: WorkbookReads,
  activeCell?: Dynamic,
) =>
  [
    ...(newCommentOn === null ? [] : [newCommentOn]),
    ...(comments ?? []).flatMap(({ cells: cells, isOpen: isOpen }: Dynamic) => (isOpen ? [cells] : [])),
  ].some(
    (input?: Dynamic) =>
      isActiveCellInComment(
        {
          cells: input,
        },
        {
          activeCell: activeCell,
        },
        reads,
      ),
  );
export const isCommentWithAgent = ({ commentsWithAgent: commentsWithAgent }: Dynamic, handle?: Dynamic) =>
  commentsWithAgent?.handles.includes(handle) === true;
export const isCommentMarkedOnGrid = (state: PageState, { handle: handle, isOpen: isOpen, isResolved: isResolved }: Dynamic) =>
  isOpen || (!isResolved && (state.commentsPointedAt.includes(handle) || isCommentWithAgent(state, handle)));
export const commentAtActiveCell = (state: PageState, reads: WorkbookReads) =>
  state.comments?.find((comment?: Dynamic) => !comment.isResolved && isActiveCellInComment(comment, state, reads)) ?? null;
export const updateCommentModePicksCells = (state: PageState, { refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic) => {
  let picksCells =
    state.isCommentModeOn && !state.isCommentModeLeftByPress && (refusalOfEveryEdit === 'readOnly' || state.isCommentModeForACard !== true);
  return picksCells === state.doesCommentModePickCells
    ? state
    : {
        ...state,
        doesCommentModePickCells: picksCells,
      };
};
export const doesCommentModePick = (state: PageState) =>
  state.doesCommentModePickCells && state.comments !== null && state.mode.kind !== 'editing';
export const canCommentModePickNow = (state: PageState) =>
  state.doesCommentModePickCells && state.comments !== null && state.mode.kind === 'navigating' && state.find === null && isNothingOpenButPane(state);
export const isFilteredSelectionForComment = (state: PageState, reads: WorkbookReads) => {
  let selectedArea2 = selectedArea(withoutOtherRanges(state), reads);
  if (selectedArea2 === null) return false;
  let rowSpan = {
    firstIndex: selectedArea2.topRowIndex,
    count: selectedArea2.rowCount,
  };
  return (
    hasFilteredRowsIn(state, reads, selectedArea2) || wholeRowSpanIn('stored', ownRowOrderOfSheet(reads, state.activeCell.sheetId), rowSpan) === null
  );
};
export const hasCommentToOpenAtSelection = (state: PageState, reads: WorkbookReads) =>
  state.comments !== null &&
  state.mode.kind === 'navigating' &&
  (commentAtActiveCell(state, reads) !== null || newCommentPlace(state, reads) !== null);
export const isCommentBlocked = (state: PageState) =>
  state.find !== null || state.dragging !== null || isModalOpen(state) || !isNothingOpenButPane(state);
export const goToCommentKeepingScroll = (state: PageState, reads: ReadsWithTextMeasurer, handle?: Dynamic) => {
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = state;
  let navigated = goToComment(state, reads, handle);
  return navigated === state
    ? state
    : {
        ...navigated,
        scrollLeft: scrollLeft,
        scrollTop: scrollTop,
      };
};
