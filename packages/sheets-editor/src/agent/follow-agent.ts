import type { Dynamic } from '../dynamic.ts';
import { layoutOfView, findSheetById } from '../grid/layout.ts';
import { heightCoveredByStickyHeaders } from '../grid/sticky-headers.ts';
import { scrollToShowCell, clampScroll } from '../grid/geometry.ts';
import { cachedSelectedArea } from '../presence/selections.ts';
import { revealAreaInCollapsedGroups } from '../grid/outline-groups.ts';
import { unhideAreaIfAllFiltered } from '../tables/filtered-rows.ts';
import { scrollToPlacedView } from '../charts/placed-views.ts';
import { showSheet } from '../state/sheet-tabs.ts';
import { changesSpanWholeLines } from './changes-by-agent.ts';
import { unionOfAreas, isSameSelection } from '../selection/model.ts';
import { shownLineAtOrAfter } from '../model/line-sizes.ts';
import { pointDoneCardAtSheet, isAgentWorkingOnBlank, isChangeNotYetCounted } from './turn-of-agent.ts';
import { isNothingOpen, isEffectAnEdit } from '../state/edit-refusals.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function scrollAreaIntoView(state: PageState, reads: ReadsWithTextMeasurer, area?: Dynamic) {
  let layout = layoutOfView(state, reads);
  let frozenView = {
    gridWidth: state.gridWidth - SCROLLBAR_ROOM / state.zoom,
    gridHeight: state.gridHeight,
    heightUnderWhatFloats: Math.max(state.heightUnderWhatFloats, FLOATING_FOOT_HEIGHT / state.zoom),
    noticesAtFoot: null,
  };
  let topLeft = {
    rowIndex: snapPastFrozenLines(area.topRowIndex, area.rowCount, layout.frozenRowCount),
    columnIndex: snapPastFrozenLines(area.leftColumnIndex, area.columnCount, layout.frozenColumnCount),
  };
  let view = {
    rowIndex: Math.max(0, topLeft.rowIndex - 1),
    columnIndex: Math.max(0, topLeft.columnIndex - 1),
  };
  let bottomRight = {
    rowIndex: area.topRowIndex + area.rowCount - 1,
    columnIndex: area.leftColumnIndex + area.columnCount - 1,
  };
  let { scrollLeft: scrollLeft, scrollTop: scrollTop } = [bottomRight, view, topLeft].reduce(
    (input?: Dynamic, options?: Dynamic) => {
      let heightCoveredByStickyHeaders2 = heightCoveredByStickyHeaders(state, reads, options, layout);
      return scrollToShowCell(
        input,
        {
          ...options,
          heightCovered: heightCoveredByStickyHeaders2,
        },
        layout,
        frozenView,
        'key',
      );
    },
    state,
  );
  let scrolled = {
    scrollLeft: area.columnCount < layout.columnCount ? scrollLeft : state.scrollLeft,
    scrollTop: area.rowCount < layout.rowCount ? scrollTop : state.scrollTop,
  };
  return {
    ...state,
    ...clampScroll(scrolled, layout, state),
  };
}
export function showChangeByAgent(state: PageState, reads: ReadsWithTextMeasurer, change?: Dynamic) {
  let { sheetId: sheetId } = change.cells.activeCell;
  let sheet = findSheetById(reads, sheetId)?.name;
  let areas = [change.cells, ...(change.groupsApart ?? []).slice(-1)].map((input?: Dynamic) => cachedSelectedArea(input, reads));
  if (areas[0] === null || sheet === undefined) return state;
  let { chart: chart } = change;
  let showOnSheet = (input?: Dynamic) => {
    let value2 = areas.reduce(
      (input2?: Dynamic, options?: Dynamic) =>
        options === null
          ? input2
          : scrollAreaIntoView(revealAreaInCollapsedGroups(unhideAreaIfAllFiltered(input2, reads, options), reads, options), reads, options),
      input,
    );
    return chart === undefined ? value2 : scrollToPlacedView(value2, reads, chart);
  };
  if (sheetId === state.sheetId) return showOnSheet(state);
  let value = showSheet(state, reads, sheetId);
  if (value === state) return state;
  let lastDone = {
    what: 'sheetShownToFollow',
    name: sheet,
  };
  return showOnSheet({
    ...value,
    notice: state.notice,
    lastDone: lastDone,
  });
}
export function mergeChangedAreas(areas: Dynamic, area: Dynamic, reads: WorkbookReads, isAppended: Dynamic = false) {
  return area
    .flatMap((input?: Dynamic) => [input, ...(input.inOtherSheets ?? [])])
    .reduce((input: Dynamic, { cells: cells }: Dynamic) => {
      let { sheetId: sheetId } = cells.activeCell;
      let cachedSelectedArea2 = cachedSelectedArea(cells, reads);
      if (
        cachedSelectedArea2 === null ||
        (!isAppended &&
          changesSpanWholeLines(
            [
              {
                cells: cells,
              },
            ],
            reads,
          ))
      )
        return input;
      let match = input.find(isOnSheet(sheetId));
      let value = match === undefined ? null : cachedSelectedArea(match, reads);
      let value2 = value === null ? cachedSelectedArea2 : unionOfAreas(value, cachedSelectedArea2);
      let value3 = reads.cellIdAt(sheetId, value2.topRowIndex, value2.leftColumnIndex);
      let value4 = reads.cellIdAt(sheetId, value2.topRowIndex + value2.rowCount - 1, value2.leftColumnIndex + value2.columnCount - 1);
      return value3 === null || value4 === null
        ? input
        : [
            ...input.filter((input2?: Dynamic) => input2 !== match),
            {
              activeCell: value3,
              selectionCorner: value4,
            },
          ];
    }, areas);
}
export function isChangeInView(state: Dynamic, reads: ReadsWithTextMeasurer, cells?: Dynamic) {
  let area = cachedSelectedArea(cells, reads);
  if (area === null) return false;
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(
    {
      ...state,
      sheetId: cells.activeCell.sheetId,
    },
    reads,
  );
  return (
    shownLineAtOrAfter(rowEdges, area.topRowIndex) < area.topRowIndex + area.rowCount &&
    shownLineAtOrAfter(columnEdges, area.leftColumnIndex) < area.leftColumnIndex + area.columnCount
  );
}
export function changesInView(state: PageState, reads: ReadsWithTextMeasurer, changes?: Dynamic) {
  let value = (input?: Dynamic) => isOnSheet(state.sheetId)(input) && isChangeInView(state, reads, input);
  return [changes, ...(changes.inOtherSheets ?? [])].flatMap(({ cells: cells, groupsApart = [] }: Dynamic) => {
    let value2 = groupsApart.length === 0 ? [cells] : groupsApart;
    let matches = value2.filter(value);
    let { chart: chart } = cells === changes.cells ? changes : {};
    return matches.length === value2.length
      ? [
          {
            cells: cells,
            groupsApart: groupsApart,
            ...(chart !== undefined && {
              chart: chart,
            }),
          },
        ]
      : matches.map(
          (match?: Dynamic) => ({
            cells: match,
          }),
        );
  });
}
export function nextRunOfAgentGoneTo(
  run: Dynamic,
  reads: WorkbookReads,
  { revision: revision, inRunSince: inRunSince = revision }: Dynamic,
  { cells: cells, chart: chart }: Dynamic,
) {
  let runArea =
    run?.since === inRunSince && isOnSheet(cells.activeCell.sheetId)(run.cells) && chart === undefined ? cachedSelectedArea(run.cells, reads) : null;
  let area = cachedSelectedArea(cells, reads);
  if (run === null || runArea === null || area === null)
    return {
      since: inRunSince,
      cells: cells,
    };
  let isRowsApart =
    area.topRowIndex > runArea.topRowIndex + runArea.rowCount + 1 || runArea.topRowIndex > area.topRowIndex + area.rowCount + 1;
  let isColumnsApart =
    area.leftColumnIndex >= runArea.leftColumnIndex + runArea.columnCount || runArea.leftColumnIndex >= area.leftColumnIndex + area.columnCount;
  let [merged = cells] =
    isRowsApart || isColumnsApart
      ? []
      : mergeChangedAreas(
          [run.cells],
          [
            {
              cells: cells,
            },
          ],
          reads,
          true,
        );
  return {
    since: inRunSince,
    cells: merged,
  };
}
export function changeToShowFirst(state: PageState, reads: ReadsWithTextMeasurer) {
  let {
    changedSinceRest: changedSinceRest,
    changedOffShowSinceRest: changedOffShowSinceRest,
    followsOnOneSheet: followsOnOneSheet,
    sheetId: sheetId,
  } = state;
  if (followsOnOneSheet === 'no')
    return reads.listSheets().flatMap(({ sheetId: sheetId2 }: Dynamic) => changedSinceRest.filter(isOnSheet(sheetId2)))[0];
  if (changedOffShowSinceRest === null) return changedSinceRest.find(isOnSheet(sheetId));
  let sizeOf = (cells?: Dynamic) => {
    let area = cachedSelectedArea(cells, reads);
    return area === null ? 0 : area.rowCount * area.columnCount;
  };
  return changedOffShowSinceRest
    .filter((cells?: Dynamic) => isChangeInView(state, reads, cells))
    .reduce(
      (largest?: Dynamic, cells?: Dynamic) => (largest === undefined || sizeOf(cells) >= sizeOf(largest) ? cells : largest),
      undefined,
    );
}
export function chartGoneToAtSelection({ chartGoneToSinceRest: chartGoneToSinceRest }: Dynamic, workbook: WorkbookReads, cells?: Dynamic) {
  if (chartGoneToSinceRest === null) return;
  let placement = workbook
    .placementsIn(cells.activeCell.sheetId)
    .find(({ placementId: placementId }: Dynamic) => placementId === chartGoneToSinceRest);
  let area = cachedSelectedArea(cells, workbook);
  return area?.rowCount === 1 && area.columnCount === 1 && area.topRowIndex === placement?.rowIndex && area.leftColumnIndex === placement.columnIndex
    ? placement
    : undefined;
}
export function changeToShowAtRest(state: PageState, reads: ReadsWithTextMeasurer, lastGoneTo?: Dynamic) {
  if (lastGoneTo === null) {
    let cells = changeToShowFirst(state, reads);
    let chart = cells === undefined ? undefined : chartGoneToAtSelection(state, reads, cells);
    return cells === undefined
      ? undefined
      : {
          cells: cells,
          ...(chart !== undefined && {
            chart: chart,
          }),
        };
  }
  let { cells: cells, chart: chartId } = lastGoneTo;
  let placement = reads.placementsIn(cells.activeCell.sheetId).find((input?: Dynamic) => input.placementId === chartId);
  return changesInView(state, reads, {
    cells: cells,
    ...(placement !== undefined && {
      chart: placement,
    }),
  }).at(-1);
}
export function showChangesAtAgentRest(state: PageState, workbook: ReadsWithTextMeasurer, target?: Dynamic, isFirstShow?: Dynamic) {
  let restState = {
    ...followStateAtRest(state),
    changedOffShowSinceRest: [],
  };
  if (target === undefined) return restState;
  let shownBefore = (
    isFirstShow && state.followsOnOneSheet === 'no' && cachedSelectedArea(target.cells, workbook) !== null ? state.changedSinceRest : []
  )
    .filter((cells?: Dynamic) => isChangeInView(state, workbook, cells))
    .reduce(
      (shown?: Dynamic, cells?: Dynamic) =>
        showChangeByAgent(shown, workbook, {
          cells: cells,
        }),
      restState,
    );
  let shown = showChangeByAgent(shownBefore, workbook, target);
  let withDoneKept =
    shown.sheetId === state.sheetId
      ? {
          ...shown,
          lastDone: state.lastDone,
        }
      : shown;
  return pointDoneCardAtSheet(withDoneKept, workbook);
}
export function stepFollowAgent(before?: Dynamic, step?: Dynamic, event?: Dynamic, context?: Dynamic) {
  let { reads: workbook } = context;
  let state =
    (before.shownByAgent?.place ?? null) === null
      ? step.state
      : {
          ...followStateAtRest(step.state),
          isFirstBuild: step.state.isFirstBuild && workbook.isEveryCellBlank,
        };
  if (state.isAgentWorking && !before.isAgentWorking) {
    let isAsSpreadsheetOpens = event.kind === 'agentActivityChanged' && event.isAsSpreadsheetOpens === true;
    let mayEdit = context.refusalOfEveryEdit === null;
    let startsFollowing =
      (((before.isFollowingAgent && before.followsOnOneSheet === 'no') || isAsSpreadsheetOpens) && mayEdit) || isAgentWorkingOnBlank(state, context);
    let followsOnOneSheet = !startsFollowing && mayEdit && event.kind === 'agentActivityChanged' && event.isPersonAtWorkInPage !== true;
    let isFree = isViewFreeToFollow(state);
    let followsOnOneSheetBefore = before.isFollowingAgent ? before.followsOnOneSheet : 'yetToMove';
    let followingState = {
      ...state,
      isFollowingAgent: (startsFollowing || followsOnOneSheet) && isFree,
      followsOnOneSheet: followsOnOneSheet && isFree ? followsOnOneSheetBefore : 'no',
    };
    if (before.isFollowingAgent) return followingState;
    let changesSoFar = isAsSpreadsheetOpens
      ? state.changesByAgent.flatMap((change?: Dynamic) => [...change.joinedWith, change])
      : [];
    let areasOfNewSheet = isAsSpreadsheetOpens && event.isSheetJustMade === true ? wholeSheetsAsChanges(workbook) : [];
    let [changed, heldAsSheetOpened] = [
      mergeChangedAreas([], changesSoFar, workbook),
      mergeChangedAreas([], areasOfNewSheet, workbook, true),
    ];
    return {
      ...followingState,
      ...changesSinceRestState(changed.length > 0, changed, heldAsSheetOpened, workbook),
      changedOffShowSinceRest: [],
      chartGoneToSinceRest: null,
      lastGoneTo: null,
    };
  }
  if (!state.isFollowingAgent) return state;
  if (doesPersonTakeViewBack(before, step, event))
    return {
      ...state,
      isFollowingAgent: false,
      followsOnOneSheet: 'no',
      hasPersonTakenViewBack: true,
    };
  if (event.kind === 'agentActivityChanged' && before.isAgentWorking && !state.isAgentWorking) {
    let isPersonAtWork = event.isPersonAtWorkInPage === true;
    let lastGoneTo = before.isFirstBuild ? null : state.lastGoneTo;
    let target = isPersonAtWork ? undefined : changeToShowAtRest(state, workbook, lastGoneTo);
    return showChangesAtAgentRest(state, workbook, target, lastGoneTo === null);
  }
  if (event.kind !== 'changesByAgentChanged') return state;
  let isOnOneSheet = state.isFollowingAgent && state.followsOnOneSheet !== 'no';
  let isFollowed = ({ cells: cells, isOfViewer: isOfViewer, isOfLayoutAlone: isOfLayoutAlone }: Dynamic) =>
    ((state.isAgentWorking && !isOnOneSheet) || isOfViewer === true) &&
    isOfLayoutAlone !== true &&
    (isOnOneSheet || event.isPersonAtWorkInPage !== true || cells.activeCell.sheetId === state.sheetId);
  let changes = event.changes.filter((change?: Dynamic) => isChangeNotYetCounted(before)(change) && isFollowed(change));
  let followedChanges = isOnOneSheet ? changes.flatMap((change?: Dynamic) => changesInView(state, workbook, change)) : changes;
  let lastChange = followedChanges.at(-1);
  if (lastChange === undefined) {
    let { changedOffShowSinceRest: changedOffShowSinceRest } = state;
    if (changedOffShowSinceRest === null || !state.isAgentWorking || changes.length === 0) return state;
    let offShow = mergeChangedAreas(changedOffShowSinceRest, changes, workbook).filter(
      (cells?: Dynamic) => !isOnSheet(state.sheetId)(cells),
    );
    let chartGoneTo =
      changes.findLast(({ cells: cells, chart: chart }: Dynamic) => chart !== undefined && !isOnSheet(state.sheetId)(cells))?.chart
        ?.placementId ?? state.chartGoneToSinceRest;
    return {
      ...state,
      changedOffShowSinceRest: offShow,
      chartGoneToSinceRest: chartGoneTo,
    };
  }
  let changedSinceRest = mergeChangedAreas(state.changedSinceRest, followedChanges, workbook);
  let chartGoneTo =
    followedChanges.findLast(({ chart: chart }: Dynamic) => chart !== undefined)?.chart?.placementId ?? state.chartGoneToSinceRest;
  let nextState = {
    ...state,
    ...changesSinceRestState(true, changedSinceRest, state.heldAsSheetOpened, workbook),
    changedOffShowSinceRest: null,
    chartGoneToSinceRest: chartGoneTo,
  };
  let runOfAgentGoneTo = changes.reduce((run?: Dynamic, change?: Dynamic) => {
    let inView = (isOnOneSheet ? changesInView(state, workbook, change) : [change]).at(-1);
    return inView === undefined ? run : nextRunOfAgentGoneTo(run, workbook, change, inView);
  }, state.runOfAgentGoneTo);
  let shownChange =
    runOfAgentGoneTo === null || runOfAgentGoneTo.cells === lastChange.cells
      ? lastChange
      : {
          cells: runOfAgentGoneTo.cells,
        };
  let lastGoneTo = {
    cells: shownChange.groupsApart?.at(-1) ?? shownChange.cells,
    chart: shownChange.chart?.placementId ?? null,
  };
  let followingState = {
    ...nextState,
    runOfAgentGoneTo: runOfAgentGoneTo,
    lastGoneTo: lastGoneTo,
    isFollowingAgent: true,
  };
  return showChangeByAgent(followingState, workbook, shownChange);
}
export const FLOATING_FOOT_HEIGHT = 146;
export const SCROLLBAR_ROOM = 24;
export const snapPastFrozenLines = (start?: Dynamic, length?: Dynamic, frozenEnd?: Dynamic) =>
  start < frozenEnd && start + length > frozenEnd ? frozenEnd : start;
export const isOnSheet =
  (sheetId?: Dynamic) =>
  ({ activeCell: activeCell }: Dynamic) =>
    activeCell.sheetId === sheetId;
export const wholeSheetsAsChanges = (reads: WorkbookReads) =>
  reads.listSheets().flatMap(({ sheetId: sheetId, rowCount: rowCount, columnCount: columnCount }: Dynamic) => {
    let state = {
      topRowIndex: 0,
      leftColumnIndex: 0,
      rowCount: rowCount,
      columnCount: columnCount,
    };
    let value = reads.areaOnShowIn(sheetId, state);
    if (value === null) return [];
    let value2 = reads.cellIdAt(sheetId, value.topRowIndex, value.leftColumnIndex);
    let value3 = reads.cellIdAt(sheetId, value.topRowIndex + value.rowCount - 1, value.leftColumnIndex + value.columnCount - 1);
    return value2 === null || value3 === null
      ? []
      : [
          {
            cells: {
              activeCell: value2,
              selectionCorner: value3,
            },
          },
        ];
  });
export const changesSinceRestState = (
  isFollowing: Dynamic,
  changedSinceRest: Dynamic,
  heldAsSheetOpened: Dynamic,
  reads: WorkbookReads,
) =>
  !isFollowing
    ? {
        changedSinceRest: changedSinceRest,
        heldAsSheetOpened: heldAsSheetOpened,
      }
    : {
        changedSinceRest: mergeChangedAreas(
          changedSinceRest,
          heldAsSheetOpened.map(
            (input?: Dynamic) => ({
              cells: input,
            }),
          ),
          reads,
          true,
        ),
        heldAsSheetOpened: [],
      };
export const nextIsFirstBuild = (
  { isFirstBuild: isFirstBuild }: Dynamic,
  activity: Dynamic,
  { isEveryCellBlank: isEveryCellBlank }: Dynamic,
) =>
  activity.isWorking
    ? isFirstBuild || isEveryCellBlank || (activity.isAsSpreadsheetOpens === true && activity.isSheetJustMade === true)
    : isFirstBuild && isEveryCellBlank;
export const followStateAtRest = (state?: Dynamic) => ({
  ...state,
  changedSinceRest: [],
  heldAsSheetOpened: [],
  chartGoneToSinceRest: null,
  lastGoneTo: null,
});
export const isViewFreeToFollow = (state: PageState) =>
  state.mode.kind === 'navigating' &&
  state.dragging === null &&
  !state.isActShownAsCalculated &&
  state.contextBarMenu === null &&
  state.caretAtEnd === null &&
  state.ownFilterList === null &&
  isNothingOpen(state);
export const doesPersonTakeViewBack = (before: Dynamic, { state: state, effects: effects }: Dynamic, event?: Dynamic) =>
  event.kind === 'viewTakenBack' ||
  event.kind === 'wheelTurned' ||
  event.kind === 'rowsPutOutOfViewByOwnFilters' ||
  event.kind === 'ownFilterAsked' ||
  event.kind === 'ownFilterByCellChosen' ||
  event.kind === 'ownFilterLineRemoved' ||
  event.kind === 'ownFilterListSortChosen' ||
  event.kind === 'ownSortRemoved' ||
  event.kind === 'ownFiltersCleared' ||
  event.kind === 'ownFiltersRefreshed' ||
  event.kind === 'ownFilterListActedIn' ||
  event.kind === 'rowsAskedForActedOn' ||
  (event.kind !== 'editOfChartAsked' && effects.some(isEffectAnEdit)) ||
  (event.kind === 'editAnswered' && event.ifQueued.askOfChart === undefined) ||
  event.kind === 'undoOrRedoAnswered' ||
  event.kind === 'takeBackAnswered' ||
  !isViewFreeToFollow(state) ||
  (event.kind !== 'workbookChanged' && event.kind !== 'ownRowOrderSeen' && !isSameSelection(before, state));
