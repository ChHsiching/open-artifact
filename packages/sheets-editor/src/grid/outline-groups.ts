import type { Dynamic } from '../dynamic.ts';
import { sheetOfView, layoutOfView, findSheetById, clampScrollOfView, keepScrollAnchoredAcrossChange } from './layout.ts';
import { withOwnCollapsing, groupsNotInsideCollapsed, collapsedIndexRuns, clipIndexRuns } from './line-runs.ts';
import {
  selectedArea,
  selectionAreaAndKind,
  isSameCell,
  mergedAreaOrCellOf,
  moveActiveCellTo,
  selectionAtCell,
  scrollToShowSelection,
} from '../selection/model.ts';
import { shownLineAtOrBefore, shownLineAtOrAfter, collapseLineSizes, nearestShownLine } from '../model/line-sizes.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import { withoutOtherRanges } from '../selection/several-ranges.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { withNoEffects } from '../state/transitions.ts';
import { defaultRowHeightAtDensity, ROW_HEADER_WIDTH } from './cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT } from './cell-metrics.ts';
import { rowPanes, columnPanes, rowRunSpanOnScreen, columnRunSpanOnScreen } from './geometry.ts';
import { rowLabelEnds, columnLabelEnds } from '../model/a1-references.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function outlineGroupsOfView(view: Dynamic, reads: WorkbookReads, axis?: Dynamic) {
  let sheet = sheetOfView(view, reads);
  return sheet === undefined ? [] : withOwnCollapsing(view.ownCollapsing, outlineGroupsOnAxis(sheet, axis));
}
export function collapsibleGroupsAtSelection(view: Dynamic, reads: WorkbookReads, axis?: Dynamic) {
  let area = selectedArea(view, reads);
  if (area === null) return [];
  let span = areaSpanOnAxis(area, axis);
  let openGroups = groupsNotInsideCollapsed(outlineGroupsOfView(view, reads, axis)).filter(
    (group?: Dynamic) => !group.isCollapsed && doSpansOverlap(group, span),
  );
  return openGroups.filter((group?: Dynamic, index?: Dynamic) => {
    let next = openGroups[index + 1];
    return next === undefined || !isSpanWithin(next, group);
  });
}
export function expandableGroupsAtSelection(view: Dynamic, reads: ReadsWithTextMeasurer, axis?: Dynamic) {
  let area = selectedArea(view, reads);
  if (area === null) return [];
  let span = areaSpanOnAxis(area, axis);
  let { edges: edges } = layoutLinesOnAxis(layoutOfView(view, reads), axis);
  let firstShown = shownLineAtOrBefore(edges, span.firstIndex - 1) + 1;
  let shownSpan = {
    firstIndex: firstShown,
    count: shownLineAtOrAfter(edges, outlineSpanEnd(span)) - firstShown,
  };
  return groupsNotInsideCollapsed(outlineGroupsOfView(view, reads, axis)).filter(
    (group?: Dynamic) => group.isCollapsed && isSpanWithin(group, shownSpan),
  );
}
export function outlineAxisForAct(view: Dynamic, reads: WorkbookReads, act?: Dynamic) {
  if (selectionAreaAndKind(view, reads)?.kind === 'columns') return 'columns';
  if (view.movedClearOfColumnsTo === null || (act !== 'collapse' && act !== 'expand')) return 'rows';
  return GROUP_TOGGLE_FINDERS[act](view, reads, 'columns').length > 0 ? 'columns' : 'rows';
}
export function dropStaleMovedClearOfColumns(view: Dynamic, reads: WorkbookReads) {
  let { movedClearOfColumnsTo: movedTo } = view;
  return movedTo === null || (isSameCell(movedTo, view.activeCell) && isSelectionOneCell(view, reads))
    ? view
    : {
        ...view,
        movedClearOfColumnsTo: null,
      };
}
export function ungroupableGroupsAtSelection(view: Dynamic, reads: WorkbookReads, axis?: Dynamic) {
  let area = selectedArea(view, reads);
  if (area === null) return [];
  let span = areaSpanOnAxis(area, axis);
  let groups = outlineGroupsOfView(view, reads, axis);
  let innermostHolding = groups.findLast((group?: Dynamic) => isSpanWithin(span, group));
  if (innermostHolding !== undefined) return [innermostHolding];
  let within = groups.filter((group?: Dynamic) => isSpanWithin(group, span));
  return within.filter((group?: Dynamic) => !within.some((other?: Dynamic) => other !== group && isSpanWithin(group, other)));
}
export function groupableAxes(view: Dynamic, reads: WorkbookReads) {
  if (view.mode.kind === 'editing') return ['rows', 'columns'];
  let area = selectedArea(view, reads);
  let sheet = findSheetById(reads, view.activeCell.sheetId);
  if (area === null || sheet === undefined) return ['rows', 'columns'];
  return [...(area.rowCount < sheet.rowCount ? ['rows'] : []), ...(area.columnCount < sheet.columnCount ? ['columns'] : [])];
}
export function moveSelectionClearOfHiddenLines(view: Dynamic, reads: ReadsWithTextMeasurer, axis?: Dynamic, collapsedRuns?: Dynamic) {
  let area = mergedAreaOrCellOf(reads, view.activeCell);
  if (area === null || !groupableAxes(view, reads).includes(axis)) return view;
  let lines = layoutLinesOnAxis(layoutOfView(view, reads), axis);
  let edgesAfter = collapseLineSizes(lines.edges, collapsedRuns);
  let span = areaSpanOnAxis(area, axis);
  let lineAfter = shownLineAtOrAfter(edgesAfter, span.firstIndex);
  if (lineAfter < outlineSpanEnd(span)) return view;
  let line = lineAfter < lines.count ? lineAfter : shownLineAtOrBefore(edgesAfter, span.firstIndex);
  let otherAxis = axis === 'rows' ? 'columns' : 'rows';
  let otherLines = layoutLinesOnAxis(layoutOfView(view, reads), otherAxis);
  let otherLine = nearestShownLine(otherLines.edges, otherLines.count, areaSpanOnAxis(area, otherAxis).firstIndex, 1);
  let cellId = axis === 'rows' ? reads.cellIdAt(view.sheetId, line, otherLine) : reads.cellIdAt(view.sheetId, otherLine, line);
  if (cellId === null) return view;
  let { scrollTop: scrollTop, scrollLeft: scrollLeft } = view;
  let moved = moveActiveCellTo(withoutOtherRanges(view), reads, cellId);
  let movedClearOfColumnsTo = axis === 'columns' ? moved.activeCell : null;
  return {
    ...moved,
    scrollTop: scrollTop,
    scrollLeft: scrollLeft,
    movedClearOfColumnsTo: movedClearOfColumnsTo,
  };
}
export function queueCollapseEditKeepingSelection(view?: Dynamic, next?: Dynamic, edit?: Dynamic, done?: Dynamic) {
  if (next.activeCell === view.activeCell)
    return queueEdit(next, edit, {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: done,
    });
  let {
    activeCell: activeCell,
    selectionCorner: selectionCorner,
    rangeWalked: rangeWalked,
    otherRanges: otherRanges,
    movedClearOfColumnsTo: movedClearOfColumnsTo,
  } = view;
  return queueEdit(next, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: selectionAtCell(next.activeCell),
    done: done,
    selectionIfRefused: {
      activeCell: activeCell,
      selectionCorner: selectionCorner,
      rangeWalked: rangeWalked,
      otherRanges: otherRanges,
      movedClearOfColumnsTo: movedClearOfColumnsTo,
    },
  });
}
export function nextOwnCollapsing({ ownCollapsing: ownCollapsing }: Dynamic, groups?: Dynamic, isCollapsedOf?: Dynamic) {
  let next = new (Map as Dynamic)(ownCollapsing);
  for (let group of groups as Dynamic) {
    let isCollapsed = isCollapsedOf(group);
    if (isCollapsed === group.isCollapsed) next.delete(group.groupId);
    else next.set(group.groupId, isCollapsed);
  }
  return next;
}
export function changeGroupCollapsing(
  view: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
  axis?: Dynamic,
  isCollapsedOf?: Dynamic,
  isAsked?: Dynamic,
  edit?: Dynamic,
  done?: Dynamic,
) {
  let sheet = sheetOfView(view, reads);
  if (sheet === undefined) return withNoEffects(view);
  let groups = outlineGroupsOnAxis(sheet, axis);
  if (groups.length === 0) return withNoEffects(view);
  let collapsedRuns = collapsedIndexRuns(
    groups.map(
      (group?: Dynamic) => ({
        ...group,
        isCollapsed: isCollapsedOf(group),
      }),
    ),
  );
  let cleared = {
    ...view,
    lastDone: null,
    notice: null,
  };
  let moved = moveSelectionClearOfHiddenLines(cleared, reads, axis, collapsedRuns);
  let changesWorkbook = groups.some((group?: Dynamic) => isAsked(group) && isCollapsedOf(group) !== group.isCollapsed);
  if (refusalOfEveryEdit === null && changesWorkbook) {
    let differsFromShown = (group?: Dynamic) =>
      isCollapsedOf(group) !== (view.ownCollapsing.get(group.groupId) ?? group.isCollapsed);
    let ownCollapsing = nextOwnCollapsing(view, groups.filter(differsFromShown), (group?: Dynamic) => group.isCollapsed);
    return queueCollapseEditKeepingSelection(view, applyOwnCollapsing(moved, reads, ownCollapsing), edit, done);
  }
  if (wouldHideEveryLine(collapsedRuns, layoutLinesOnAxis(layoutOfView(view, reads), axis).count))
    return withNoEffects({
      ...view,
      lastDone: null,
      notice: {
        kind: 'editRefused',
        why: 'nothingLeftInSight',
        asked: 'otherEdit',
      },
    });
  let nextOwnCollapsing2 = nextOwnCollapsing(view, groups, isCollapsedOf);
  let next = {
    ...applyOwnCollapsing(moved, reads, nextOwnCollapsing2),
    lastDone: done,
  };
  return withNoEffects(moved.activeCell === view.activeCell ? next : scrollToShowSelection(next, reads));
}
export function groupCollapsingDoneNote(groups?: Dynamic, axis?: Dynamic, isCollapsed?: Dynamic) {
  let [first, ...others] = collapsedIndexRuns(
    groups.map(
      (group?: Dynamic) => ({
        ...group,
        isCollapsed: true,
      }),
    ),
  );
  if (first === undefined) return null;
  return others.length === 0
    ? {
        what: isCollapsed ? 'collapsed' : 'expanded',
        of: axis,
        ...spanLabelEnds(first, axis),
      }
    : {
        what: isCollapsed ? 'groupsCollapsed' : 'groupsExpanded',
        of: axis,
        groupCount: groups.length,
      };
}
export function setOutlineGroupsCollapsed(view?: Dynamic, workbook?: Dynamic, axis?: Dynamic, groupIds?: Dynamic, isCollapsed?: Dynamic) {
  let { sheetId: sheetId } = view;
  let asked = new (Set as Dynamic)(groupIds);
  let groups = outlineGroupsOfView(view, workbook.reads, axis).filter(({ groupId: groupId }: Dynamic) => asked.has(groupId));
  let [firstGroupId, ...otherGroupIds] = groups.map(({ groupId: groupId }: Dynamic) => groupId);
  let done = groupCollapsingDoneNote(groups, axis, isCollapsed);
  if (firstGroupId === undefined || done === null) return withNoEffects(view);
  return changeGroupCollapsing(
    view,
    workbook,
    axis,
    (group?: Dynamic) => (asked.has(group.groupId) ? isCollapsed : (view.ownCollapsing.get(group.groupId) ?? group.isCollapsed)),
    (group?: Dynamic) => asked.has(group.groupId),
    {
      kind: axis === 'rows' ? 'setRowGroupsCollapsed' : 'setColumnGroupsCollapsed',
      sheetId: sheetId,
      groupIds: [firstGroupId, ...otherGroupIds],
      isCollapsed: isCollapsed,
    },
    done,
  );
}
export function showOutlineGroupsToLevel(view?: Dynamic, workbook?: Dynamic, axis?: Dynamic, level?: Dynamic) {
  let depth = level - 1;
  return changeGroupCollapsing(
    view,
    workbook,
    axis,
    (group?: Dynamic) => group.depth > depth,
    () => true,
    {
      kind: axis === 'rows' ? 'showRowGroupsToDepth' : 'showColumnGroupsToDepth',
      sheetId: view.sheetId,
      depth: depth,
    },
    {
      what: 'shownToLevel',
      of: axis,
      level: level,
    },
  );
}
export function queueGroupingEdit(view?: Dynamic, workbook?: Dynamic, act?: Dynamic, axis?: Dynamic) {
  let { reads: reads } = workbook;
  let viewOneRange = withoutOtherRanges(view);
  let area = selectedArea(viewOneRange, reads);
  if (area === null) return withNoEffects(viewOneRange);
  let { sheetId: sheetId } = viewOneRange;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let topLeft = reads.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
  let bottomRight = reads.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
  if (topLeft === null || bottomRight === null) return withNoEffects(viewOneRange);
  let span = areaSpanOnAxis(area, axis);
  let edit =
    axis === 'rows'
      ? {
          kind: `${act}Rows`,
          sheetId: sheetId,
          oneRow: topLeft.rowId,
          otherRow: bottomRight.rowId,
        }
      : {
          kind: `${act}Columns`,
          sheetId: sheetId,
          oneColumn: topLeft.columnId,
          otherColumn: bottomRight.columnId,
        };
  let [onlyGroup, ...otherGroups] = act === 'ungroup' ? ungroupableGroupsAtSelection(viewOneRange, reads, axis) : [];
  let doneSpan = onlyGroup !== undefined && otherGroups.length === 0 ? onlyGroup : span;
  let done = {
    what: GROUPING_DONE_KIND[act],
    of: axis,
    ...spanLabelEnds(doneSpan, axis),
  };
  return queueEdit(viewOneRange, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: done,
  });
}
export function actOnOutlineGroups(view?: Dynamic, workbook?: Dynamic, act?: Dynamic, axis?: Dynamic) {
  let { reads: reads } = workbook;
  if (act !== 'collapse' && act !== 'expand') return queueGroupingEdit(view, workbook, act, axis);
  return setOutlineGroupsCollapsed(
    view,
    workbook,
    axis,
    GROUP_TOGGLE_FINDERS[act](view, reads, axis).map(({ groupId: groupId }: Dynamic) => groupId),
    act === 'collapse',
  );
}
export function outlineGroupsById(reads: WorkbookReads) {
  let byId = new (Map as Dynamic)();
  for (let { rowGroups: rowGroups, columnGroups: columnGroups } of reads.listSheets() as Dynamic)
    for (let groups of [rowGroups, columnGroups] as Dynamic) for (let group of groups as Dynamic) byId.set(group.groupId, group);
  return byId;
}
export function pruneSettledOwnCollapsing(view: Dynamic, readsBefore: Dynamic, reads: WorkbookReads) {
  if (view.ownCollapsing.size === 0) return view;
  let [before, after] = [outlineGroupsById(readsBefore), outlineGroupsById(reads)];
  let kept = [...view.ownCollapsing].filter(([groupId, isCollapsed]: Dynamic) => {
    let group = after.get(groupId);
    return group !== undefined && group.isCollapsed !== isCollapsed && group.isCollapsed === (before.get(groupId)?.isCollapsed ?? group.isCollapsed);
  });
  return kept.length === view.ownCollapsing.size
    ? view
    : {
        ...view,
        ownCollapsing: new (Map as Dynamic)(kept),
      };
}
export function collapsedGroupsHidingSpanStart(view: Dynamic, reads: WorkbookReads, { edges: edges }: Dynamic, span?: Dynamic, axis?: Dynamic) {
  if (shownLineAtOrAfter(edges, span.firstIndex) < outlineSpanEnd(span)) return [];
  let firstLine = {
    firstIndex: span.firstIndex,
    count: 1,
  };
  return outlineGroupsOfView(view, reads, axis).filter((group?: Dynamic) => group.isCollapsed && isSpanWithin(firstLine, group));
}
export function expandGroupsLocally(view?: Dynamic, groups?: Dynamic) {
  if (groups.length === 0) return view;
  let ownCollapsing = new (Map as Dynamic)(view.ownCollapsing);
  for (let { groupId: groupId } of groups as Dynamic) ownCollapsing.set(groupId, false);
  return {
    ...view,
    ownCollapsing: ownCollapsing,
  };
}
export function revealActiveCellLocally(view: Dynamic, reads: ReadsWithTextMeasurer, justCollapsed: Dynamic = NO_NEWLY_COLLAPSED_GROUPS) {
  let { sheetId: sheetId } = view.activeCell;
  let sheet = findSheetById(reads, sheetId);
  if (sheet === undefined) return view;
  if (sheet.rowGroups.length === 0 && sheet.columnGroups.length === 0) return view;
  let area = mergedAreaOrCellOf(reads, view.activeCell);
  if (area === null) return view;
  let viewOfSheet = {
    ...view,
    sheetId: sheetId,
  };
  let layout = layoutOfView(viewOfSheet, reads);
  let hiding = groupableAxes(view, reads).flatMap(
    (axis?: Dynamic) =>
      collapsedGroupsHidingSpanStart(viewOfSheet, reads, layoutLinesOnAxis(layout, axis), areaSpanOnAxis(area, axis), axis),
  );
  return hiding.some(({ groupId: groupId }: Dynamic) => justCollapsed.has(groupId)) ? view : expandGroupsLocally(view, hiding);
}
export function revealAreaInCollapsedGroups(view: Dynamic, reads: ReadsWithTextMeasurer, area?: Dynamic) {
  let layout = layoutOfView(view, reads);
  return expandGroupsLocally(
    view,
    ['rows', 'columns'].flatMap(
      (axis?: Dynamic) => collapsedGroupsHidingSpanStart(view, reads, layoutLinesOnAxis(layout, axis), areaSpanOnAxis(area, axis), axis),
    ),
  );
}
export function newlyCollapsedGroupIds(readsBefore: Dynamic, reads: WorkbookReads) {
  let collapsed = [...outlineGroupsById(reads).values()].filter(({ isCollapsed: isCollapsed }: Dynamic) => isCollapsed);
  if (collapsed.length === 0 || readsBefore === reads) return NO_NEWLY_COLLAPSED_GROUPS;
  let groupsBefore = outlineGroupsById(readsBefore);
  return new (Set as Dynamic)(
    collapsed.flatMap(({ groupId: groupId }: Dynamic) => (groupsBefore.get(groupId)?.isCollapsed === true ? [] : groupId)),
  );
}
export function moveSelectionsOutOfNewlyCollapsed(view: Dynamic, reads: ReadsWithTextMeasurer, justCollapsed?: Dynamic) {
  if (justCollapsed.size === 0) return view;
  let moveClear = (place?: Dynamic) =>
    ['rows', 'columns'].reduce((current?: Dynamic, axis?: Dynamic) => {
      let area = mergedAreaOrCellOf(reads, current.activeCell);
      if (area === null) return current;
      let lines = layoutLinesOnAxis(layoutOfView(current, reads), axis);
      return collapsedGroupsHidingSpanStart(current, reads, lines, areaSpanOnAxis(area, axis), axis).some(
        ({ groupId: groupId }: Dynamic) => justCollapsed.has(groupId),
      )
        ? moveSelectionClearOfHiddenLines(current, reads, axis, [])
        : current;
    }, place);
  let moved = view.activeCell.sheetId === view.sheetId ? moveClear(view) : view;
  let placesLeft = view.placesLeft.map((place?: Dynamic) => {
    let { activeCell: activeCell } = moveClear({
      ...view,
      ...place,
    });
    return activeCell === place.activeCell
      ? place
      : {
          ...place,
          ...selectionAtCell(activeCell),
        };
  });
  return {
    ...(moved === view ? view : scrollToShowSelection(moved, reads)),
    placesLeft: placesLeft,
  };
}
export function revealActiveCellAfterMove(viewBefore: Dynamic, view: Dynamic, reads: ReadsWithTextMeasurer) {
  let revealed = revealActiveCellLocally(view, reads);
  if (revealed === view) return view;
  return view.activeCell === viewBefore.activeCell ? revealed : scrollToShowSelection(revealed, reads);
}
export function mergeAdjacentCollapsedGroups(groups?: Dynamic) {
  let runs: Dynamic = [];
  let runByDepth = new (Map as Dynamic)();
  for (let group of groups as Dynamic) {
    let runIndex = group.isCollapsed ? runByDepth.get(group.depth) : undefined;
    let run = runIndex === undefined ? undefined : runs[runIndex];
    if (runIndex !== undefined && run !== undefined && run.firstIndex + run.count === group.firstIndex) {
      runs[runIndex] = {
        ...run,
        count: run.count + group.count,
        groupIds: [...run.groupIds, group.groupId],
      };
      continue;
    }
    if (group.isCollapsed) runByDepth.set(group.depth, runs.length);
    runs.push({
      ...group,
      groupIds: [group.groupId],
    });
  }
  return runs;
}
export function outlineGutterOnAxis(view: Dynamic, reads: WorkbookReads, layout?: Dynamic, axis?: Dynamic) {
  let groups = outlineGroupsOfView(view, reads, axis);
  if (groups.length === 0) return null;
  let maxDepth = groups.reduce((deepest: Dynamic, { depth: depth }: Dynamic) => Math.max(deepest, depth), 0);
  let halfMark = Math.ceil(OUTLINE_MARK_SIZE / 2);
  let edges = axis === 'rows' ? layout.rowEdges : layout.columnEdges;
  let nextFreeByLane = new (Map as Dynamic)();
  let placeMark = (lane?: Dynamic, wanted?: Dynamic) => {
    let at = Math.max(wanted, nextFreeByLane.get(lane) ?? wanted);
    nextFreeByLane.set(lane, at + OUTLINE_MARK_SIZE);
    return at;
  };
  let marks = mergeAdjacentCollapsedGroups(groupsNotInsideCollapsed(groups)).flatMap((run?: Dynamic) => {
    let { start: start, end: end, showFrom: showFrom, showTo: showTo } = outlineRunOnScreen(run, axis, view, layout);
    let lane = run.depth - 1;
    let mark = {
      key: run.groupId,
      groupIds: run.groupIds,
      lane: lane,
      isCollapsed: run.isCollapsed,
      ...spanLabelEnds(run, axis),
    };
    let firstShownLine = shownLineAtOrAfter(edges, run.firstIndex);
    let center = start + Math.ceil(Math.min(edges.sizeOf(firstShownLine), defaultRowHeightAtDensity(view.density)) / 2);
    if (run.isCollapsed) {
      if (start < showFrom || start > showTo) return [];
      let markAt = placeMark(lane, Math.max(showFrom + halfMark, Math.min(center, showTo - halfMark)));
      return [
        {
          ...mark,
          markAt: markAt,
          line: null,
        },
      ];
    }
    if (end <= showFrom || start >= showTo || end === start) return [];
    let wantedAt = Math.min(Math.max(center, showFrom + halfMark), end - halfMark);
    let placedAt = placeMark(lane, wantedAt);
    let startsBeforeMark = placedAt > wantedAt && start >= showFrom && placedAt + halfMark <= Math.min(end, showTo);
    return [
      {
        ...mark,
        markAt: placedAt,
        line: {
          start: startsBeforeMark ? start : placedAt,
          end: Math.max(placedAt, Math.min(end, showTo)),
          endsInView: end <= showTo,
          startsBeforeMark: startsBeforeMark,
        },
      },
    ];
  });
  return {
    of: axis,
    size: maxDepth * OUTLINE_LANE_SIZE,
    beforeBody: axis === 'rows' ? COLUMN_HEADER_HEIGHT : ROW_HEADER_WIDTH,
    levelCount: maxDepth + 1,
    hasLevelButtons: maxDepth > 1,
    groups: marks,
  };
}
export function hiddenLineSeams(view?: Dynamic, layout?: Dynamic, axis?: Dynamic) {
  let [hiddenRuns, panes] =
    axis === 'rows' ? [layout.rowsOutOfSight, rowPanes(view, layout, view)] : [layout.columnsOutOfSight, columnPanes(view, layout, view)];
  return panes
    .flatMap(
      ({ first: first, count: count }: Dynamic) =>
        clipIndexRuns(hiddenRuns, {
          firstIndex: first - 1,
          count: count + 2,
        }),
    )
    .flatMap((run?: Dynamic) => {
      let { start: start, showFrom: showFrom, showTo: showTo } = outlineRunOnScreen(run, axis, view, layout);
      return start < showFrom || start > showTo
        ? []
        : [
            {
              at: start,
              lines: run,
            },
          ];
    });
}
export function findRunEndingAfter(runs?: Dynamic, index?: Dynamic) {
  let [low, high]: Dynamic = [0, runs.length];
  while (low < high) {
    let middle = Math.floor((low + high) / 2);
    let run = runs[middle];
    if (run !== undefined && run.firstIndex + run.count <= index) low = middle + 1;
    else high = middle;
  }
  return runs[low];
}
export function outlineGutters(view: Dynamic, reads: ReadsWithTextMeasurer) {
  let layout = layoutOfView(view, reads);
  return {
    rows: outlineGutterOnAxis(view, reads, layout, 'rows'),
    columns: outlineGutterOnAxis(view, reads, layout, 'columns'),
  };
}
export const outlineGroupsOnAxis = ({ rowGroups: rowGroups, columnGroups: columnGroups }: Dynamic, axis?: Dynamic) =>
  axis === 'rows' ? rowGroups : columnGroups;
export const layoutLinesOnAxis = (layout?: Dynamic, axis?: Dynamic) =>
  axis === 'rows'
    ? {
        edges: layout.rowEdges,
        count: layout.rowCount,
      }
    : {
        edges: layout.columnEdges,
        count: layout.columnCount,
      };
export const areaSpanOnAxis = (area?: Dynamic, axis?: Dynamic) =>
  axis === 'rows'
    ? {
        firstIndex: area.topRowIndex,
        count: area.rowCount,
      }
    : {
        firstIndex: area.leftColumnIndex,
        count: area.columnCount,
      };
export const outlineSpanEnd = ({ firstIndex: firstIndex, count: count }: Dynamic) => firstIndex + count;
export const doSpansOverlap = (span?: Dynamic, other?: Dynamic) =>
  span.firstIndex < outlineSpanEnd(other) && other.firstIndex < outlineSpanEnd(span);
export const isSpanWithin = (inner?: Dynamic, outer?: Dynamic) =>
  inner.firstIndex >= outer.firstIndex && outlineSpanEnd(inner) <= outlineSpanEnd(outer);
export const spanLabelEnds = ({ firstIndex: firstIndex, count: count }: Dynamic, axis?: Dynamic) =>
  axis === 'rows'
    ? rowLabelEnds(
        {
          topRowIndex: firstIndex,
          rowCount: count,
          leftColumnIndex: 0,
          columnCount: 1,
        },
        null,
      )
    : columnLabelEnds({
        topRowIndex: 0,
        rowCount: 1,
        leftColumnIndex: firstIndex,
        columnCount: count,
      });
export const GROUP_TOGGLE_FINDERS = {
  collapse: collapsibleGroupsAtSelection,
  expand: expandableGroupsAtSelection,
};
export const wouldHideEveryLine = ([firstRun]: Dynamic, lineCount?: Dynamic) =>
  firstRun?.firstIndex === 0 && firstRun.count === lineCount;
export const applyOwnCollapsing = (view: Dynamic, reads: ReadsWithTextMeasurer, ownCollapsing?: Dynamic) =>
  clampScrollOfView(
    keepScrollAnchoredAcrossChange(
      {
        ...view,
        ownCollapsing: ownCollapsing,
      },
      reads,
      reads,
      view,
    ),
    reads,
  );
export const GROUPING_DONE_KIND = {
  group: 'grouped',
  ungroup: 'ungrouped',
};
export const OUTLINE_COMMAND_ACTS = {
  groupRows: ['group', 'rows'],
  groupColumns: ['group', 'columns'],
  ungroupRows: ['ungroup', 'rows'],
  ungroupColumns: ['ungroup', 'columns'],
  collapseRows: ['collapse', 'rows'],
  collapseColumns: ['collapse', 'columns'],
  expandRows: ['expand', 'rows'],
  expandColumns: ['expand', 'columns'],
};
export const runOutlineCommand = (view?: Dynamic, workbook?: Dynamic, command?: Dynamic) =>
  (actOnOutlineGroups as Dynamic)(view, workbook, ...OUTLINE_COMMAND_ACTS[command]);
export const NO_NEWLY_COLLAPSED_GROUPS = new (Set as Dynamic)();
export const ownCollapsingAfterReadsChange = (view: Dynamic, readsBefore: Dynamic, reads: ReadsWithTextMeasurer, justCollapsed?: Dynamic) =>
  revealActiveCellLocally(pruneSettledOwnCollapsing(view, readsBefore, reads), reads, justCollapsed).ownCollapsing;
export const OUTLINE_LANE_SIZE = 20;
export const OUTLINE_MARK_SIZE = 20;
export const outlineRunOnScreen = (run?: Dynamic, axis?: Dynamic, view?: Dynamic, layout?: Dynamic) =>
  axis === 'rows' ? rowRunSpanOnScreen(run, view, layout, view) : columnRunSpanOnScreen(run, view, layout, view);
export const hiddenLineSeamPositions = (view?: Dynamic, layout?: Dynamic, axis?: Dynamic) => [
  ...new (Set as Dynamic)(hiddenLineSeams(view, layout, axis).map(({ at: at }: Dynamic) => at)),
];
export const ownFilterSeamPositions = (view?: Dynamic, layout?: Dynamic, ownFilterRuns?: Dynamic) => [
  ...new (Set as Dynamic)(
    hiddenLineSeams(view, layout, 'rows')
      .filter(({ lines: lines }: Dynamic) => {
        let hiddenRun = findRunEndingAfter(layout.rowsOutOfSight, lines.firstIndex) ?? {
          firstIndex: lines.firstIndex,
          count: 1,
        };
        let filterRun = findRunEndingAfter(ownFilterRuns, hiddenRun.firstIndex);
        return filterRun !== undefined && filterRun.firstIndex < hiddenRun.firstIndex + hiddenRun.count;
      })
      .map(({ at: at }: Dynamic) => at),
  ),
];
