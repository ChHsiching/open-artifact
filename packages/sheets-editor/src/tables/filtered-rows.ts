import type { Dynamic } from '../dynamic.ts';
import { allRangesOf, withoutOtherRanges } from '../selection/several-ranges.ts';
import {
  selectedArea,
  selectionOfArea,
  mergedAreaOrCellOf,
  selectionAreaAndKind,
  areaOfPosition,
  moveActiveCellTo,
  scrollToShowSelection,
} from '../selection/model.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import { rowsHiddenByOwnFilters, findSheetById, clampScrollOfView, keepScrollAnchoredAcrossChange, layoutOfView } from '../grid/layout.ts';
import { collapseLineSizes, createLineSizes, isLineShown, nearestShownLine, shownLineAtOrBefore, shownLineAtOrAfter } from '../model/line-sizes.ts';
import { NO_ROWS_OUT_OF_VIEW_BY_FILTERS, clipIndexRuns } from '../grid/line-runs.ts';
import { createLineIndex } from '../model/line-ids.ts';
import { remapSelectionCorners } from '../selection/remap.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function shownPiecesOfArea(state: PageState, reads: WorkbookReads, area?: Dynamic) {
  let filteredRuns = filteredRowRunsIn(state, reads, area);
  if (filteredRuns.length === 0) return [area];
  let pieces: Dynamic = [];
  let nextTop: Dynamic = area.topRowIndex;
  for (let run of [
    ...filteredRuns,
    {
      firstIndex: area.topRowIndex + area.rowCount,
      count: 0,
    },
  ] as Dynamic) {
    if (run.firstIndex > nextTop)
      pieces.push({
        ...area,
        topRowIndex: nextTop,
        rowCount: run.firstIndex - nextTop,
      });
    nextTop = run.firstIndex + run.count;
  }
  return pieces;
}
export function lastShownRowIndex(state: PageState, reads: WorkbookReads, rowCount?: Dynamic) {
  let lastRun = filteredRowRunsIn(state, reads, {
    topRowIndex: 0,
    rowCount: rowCount,
  }).at(-1);
  let lastShown = lastRun !== undefined && lastRun.firstIndex + lastRun.count === rowCount ? lastRun.firstIndex - 1 : rowCount - 1;
  return lastShown < 0 ? null : lastShown;
}
export function selectionOfShownPieces(selection: Dynamic, reads: WorkbookReads, scope?: Dynamic) {
  if (!selection.rowsOutOfViewByOwnFilters.has(selection.sheetId)) return selection;
  let ranges = allRangesOf(selection);
  let newRanges = ranges.flatMap((range?: Dynamic) => {
    let area = selectedArea(range, reads);
    if (area === null || isSelectionOneCell(range, reads)) return range;
    let pieces = shownPiecesOfArea(selection, reads, area);
    let isTooSplit = pieces.length > MAX_SHOWN_PIECES && scope === 'allOfIt';
    return pieces[0] === area || isTooSplit
      ? range
      : pieces.slice(0, MAX_SHOWN_PIECES).flatMap((piece?: Dynamic) => selectionOfArea(selection, reads, piece) ?? []);
  });
  let current = newRanges.at(-1);
  return newRanges.every((range?: Dynamic, rangeIndex?: Dynamic) => range === ranges[rangeIndex]) || current === undefined
    ? selection
    : {
        ...selection,
        ...current,
        otherRanges: newRanges.slice(0, -1),
      };
}
export function makeIsCellFilteredOut(state: PageState, reads: WorkbookReads) {
  let hiddenRowIds = state.rowsOutOfViewByOwnFilters.get(state.sheetId);
  if (hiddenRowIds === undefined || rowsHiddenByOwnFilters(state, reads, state.sheetId).length === 0) return () => false;
  return (cell?: Dynamic) => {
    let mergedArea = hiddenRowIds.has(cell.rowId) ? mergedAreaOrCellOf(reads, cell) : null;
    return mergedArea !== null && shownPiecesOfArea(state, reads, mergedArea).length === 0;
  };
}
export function readsOverShownRows(selection: Dynamic, reads: WorkbookReads) {
  let hiddenRuns = rowsHiddenByOwnFilters(selection, reads, selection.sheetId);
  let rowCount = findSheetById(reads, selection.sheetId)?.rowCount;
  if (hiddenRuns.length === 0 || rowCount === undefined) return null;
  let shownRowEdges = shownRowEdgesCache.get(hiddenRuns) ?? collapseLineSizes(createLineSizes(rowCount, [], 1), hiddenRuns);
  shownRowEdgesCache.set(hiddenRuns, shownRowEdges);
  let toActualArea = (area?: Dynamic) => {
    let topRowIndex = shownRowEdges.startOf(area.topRowIndex);
    let actualRowCount = shownRowEdges.startOf(area.topRowIndex + area.rowCount) - topRowIndex;
    return {
      ...area,
      topRowIndex: topRowIndex,
      rowCount: actualRowCount,
    };
  };
  let toShownArea = (area?: Dynamic) => {
    let topRowIndex = shownRowEdges.indexAt(area.topRowIndex);
    let bottomRowIndex = shownRowEdges.indexAt(area.topRowIndex + area.rowCount - 1);
    return {
      ...area,
      topRowIndex: topRowIndex,
      rowCount: bottomRowIndex - topRowIndex + 1,
    };
  };
  let isOtherSheet = (sheetId?: Dynamic) => sheetId !== selection.sheetId;
  return {
    there: toActualArea,
    here: toShownArea,
    reads: {
      ...reads,
      cellIdAt(sheetId?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) {
        if (isOtherSheet(sheetId)) return reads.cellIdAt(sheetId, rowIndex, columnIndex);
        let position = {
          rowIndex: shownRowEdges.indexAt(rowIndex),
          columnIndex: columnIndex,
        };
        let mergedAbove =
          position.rowIndex > 0 && !isLineShown(shownRowEdges, position.rowIndex - 1) ? reads.mergedAreaAt(sheetId, position) : null;
        let startsAtRow = mergedAbove?.leftColumnIndex === columnIndex && shownRowEdges.startOf(mergedAbove.topRowIndex) === rowIndex;
        return reads.cellIdAt(sheetId, startsAtRow ? mergedAbove.topRowIndex : position.rowIndex, columnIndex);
      },
      mergedAreaAt(sheetId?: Dynamic, position?: Dynamic) {
        if (isOtherSheet(sheetId)) return reads.mergedAreaAt(sheetId, position);
        let mergedArea = reads.mergedAreaAt(sheetId, {
          ...position,
          rowIndex: shownRowEdges.indexAt(position.rowIndex),
        });
        return mergedArea === null ? null : toActualArea(mergedArea);
      },
      mergedAreasIn: (sheetId?: Dynamic, area?: Dynamic) =>
        isOtherSheet(sheetId)
          ? reads.mergedAreasIn(sheetId, area)
          : reads
              .mergedAreasIn(sheetId, toShownArea(area))
              .map(toActualArea)
              .filter((area2?: Dynamic) => area2.rowCount > 0),
    },
  };
}
export function withRowsHiddenByOwnFilters(selection: Dynamic, reads: ReadsWithTextMeasurer, sheetId?: Dynamic, hiddenRowKeys?: Dynamic) {
  let hiddenBySheet = new (Map as Dynamic)(selection.rowsOutOfViewByOwnFilters);
  if (hiddenRowKeys.size === 0) hiddenBySheet.delete(sheetId);
  else hiddenBySheet.set(sheetId, hiddenRowKeys);
  return clampScrollOfView(
    keepScrollAnchoredAcrossChange(
      {
        ...selection,
        rowsOutOfViewByOwnFilters: hiddenBySheet,
      },
      reads,
      reads,
      selection,
    ),
    reads,
  );
}
export function moveSelectionOffFilteredRows(selection: Dynamic, reads: ReadsWithTextMeasurer) {
  let [activePosition, cornerPosition] = [reads.positionOfCell(selection.activeCell), reads.positionOfCell(selection.selectionCorner)];
  let area = selectedArea(selection, reads);
  if (activePosition === null || cornerPosition === null || area === null) return selection;
  let layout = layoutOfView(selection, reads);
  if (area.rowCount === layout.rowCount) return selection;
  let isWholeRows = selectionAreaAndKind(selection, reads)?.kind === 'rows';
  let isCellFilteredOut = (position?: Dynamic) => {
    let cellArea = (isWholeRows ? null : reads.mergedAreaAt(selection.sheetId, position)) ?? areaOfPosition(position);
    return !areaHasShownRow(layout, cellArea) && filteredRowRunsIn(selection, reads, cellArea).length > 0;
  };
  let { rowEdges: rowEdges, rowCount: rowCount, columnEdges: columnEdges, columnCount: columnCount } = layout;
  let { scrollTop: scrollTop, scrollLeft: scrollLeft } = selection;
  if (isCellFilteredOut(activePosition)) {
    let newActiveCell = reads.cellIdAt(
      selection.sheetId,
      nearestShownLine(rowEdges, rowCount, activePosition.rowIndex, 1),
      nearestShownLine(columnEdges, columnCount, activePosition.columnIndex, 1),
    );
    if (newActiveCell === null) return selection;
    return {
      ...moveActiveCellTo(withoutOtherRanges(selection), reads, newActiveCell),
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
    };
  }
  if (!isCellFilteredOut(cornerPosition)) return selection;
  let newCorner = reads.cellIdAt(
    selection.sheetId,
    cornerPosition.rowIndex >= activePosition.rowIndex
      ? shownLineAtOrBefore(rowEdges, area.topRowIndex + area.rowCount - 1)
      : shownLineAtOrAfter(rowEdges, area.topRowIndex),
    cornerPosition.columnIndex,
  );
  return newCorner === null
    ? selection
    : {
        ...selection,
        selectionCorner: newCorner,
      };
}
export function dropFilteredOutOtherRanges(selection: Dynamic, reads: ReadsWithTextMeasurer) {
  let layout = layoutOfView(selection, reads);
  let keptRanges = selection.otherRanges.filter((range?: Dynamic) => {
    let area = selectedArea(range, reads);
    return area === null || areaHasShownRow(layout, area) || filteredRowRunsIn(selection, reads, area).length === 0;
  });
  return keptRanges.length === selection.otherRanges.length
    ? selection
    : {
        ...selection,
        otherRanges: keptRanges,
      };
}
export function keepSelectionOnShownRows(selection: Dynamic, reads: ReadsWithTextMeasurer) {
  if (selection.rowsOutOfViewByOwnFilters.size === 0) return selection;
  let placesLeft = selection.placesLeft.map((place?: Dynamic) => {
    let placeSelection = {
      ...selection,
      ...place,
    };
    let { activeCell: activeCell, selectionCorner: selectionCorner } = moveSelectionOffFilteredRows(placeSelection, reads);
    return activeCell === place.activeCell && selectionCorner === place.selectionCorner
      ? place
      : {
          ...place,
          activeCell: activeCell,
          selectionCorner: selectionCorner,
        };
  });
  let withPlacesKept = {
    ...selection,
    placesLeft: placesLeft,
  };
  if (selection.mode.kind === 'editing' || selection.activeCell.sheetId !== selection.sheetId) return withPlacesKept;
  let moved = moveSelectionOffFilteredRows(dropFilteredOutOtherRanges(withPlacesKept, reads), reads);
  return moved.activeCell === selection.activeCell || selection.ownFilterList !== null ? moved : scrollToShowSelection(moved, reads);
}
export function withoutFrozenRowKeys(reads: WorkbookReads, sheetId?: Dynamic, rowKeys?: Dynamic) {
  let frozenRowCount = findSheetById(reads, sheetId)?.frozenRowCount ?? 0;
  let keptKeys = [...rowKeys].filter((rowKey?: Dynamic) => (reads.rowIndexOf(sheetId, rowKey) ?? -1) >= frozenRowCount);
  return keptKeys.length === rowKeys.size ? rowKeys : new (Set as Dynamic)(keptKeys);
}
export function rowsHiddenByOwnFiltersAfterChange(
  { rowsOutOfViewByOwnFilters: hiddenBySheet }: Dynamic,
  readsBefore?: Dynamic,
  readsNow?: Dynamic,
) {
  if (hiddenBySheet.size === 0) return hiddenBySheet;
  let kept = new (Map as Dynamic)();
  for (let [sheetId, rowKeys] of hiddenBySheet as Dynamic) {
    let keptKeys =
      readsNow.linesOf(sheetId)?.rows === readsBefore.linesOf(sheetId)?.rows &&
      findSheetById(readsNow, sheetId)?.frozenRowCount === findSheetById(readsBefore, sheetId)?.frozenRowCount
        ? rowKeys
        : withoutFrozenRowKeys(readsNow, sheetId, rowKeys);
    if (keptKeys.size > 0 && findSheetById(readsNow, sheetId) !== undefined) kept.set(sheetId, keptKeys);
  }
  if (kept.size === 0) return NO_ROWS_OUT_OF_VIEW_BY_FILTERS;
  return kept.size === hiddenBySheet.size && [...kept].every(([sheetId, rowKeys]: Dynamic) => hiddenBySheet.get(sheetId) === rowKeys)
    ? hiddenBySheet
    : kept;
}
export function shownRowRunsOfLines(rows?: Dynamic, hiddenRuns?: Dynamic) {
  let shownRuns: Dynamic = [];
  let nextIndex: Dynamic = 0;
  for (let hiddenRun of [
    ...hiddenRuns,
    {
      firstIndex: rows.count,
      count: 0,
    },
  ] as Dynamic) {
    (shownRuns.push as Dynamic)(
      ...rows.runsIn({
        firstIndex: nextIndex,
        count: hiddenRun.firstIndex - nextIndex,
      }),
    );
    nextIndex = hiddenRun.firstIndex + hiddenRun.count;
  }
  return shownRuns;
}
export function readsWithOnlyShownRows(reads: WorkbookReads, sheetId?: Dynamic, hiddenRuns?: Dynamic) {
  let lines = reads.linesOf(sheetId);
  if (lines === null) return reads;
  let shownRows = createLineIndex(shownRowRunsOfLines(lines.rows, hiddenRuns));
  return {
    linesOf: (otherSheetId?: Dynamic) =>
      otherSheetId === sheetId
        ? {
            ...lines,
            rows: shownRows,
          }
        : reads.linesOf(otherSheetId),
    cellIdAt(otherSheetId?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) {
      if (otherSheetId !== sheetId) return reads.cellIdAt(otherSheetId, rowIndex, columnIndex);
      let actualRowIndex = lines.rows.indexOf(shownRows.idAt(rowIndex) ?? '');
      return actualRowIndex === null ? null : reads.cellIdAt(otherSheetId, actualRowIndex, columnIndex);
    },
  };
}
export function remapSelectionOverShownRows(place?: Dynamic, selection?: Dynamic, readsBefore?: Dynamic, readsNow?: Dynamic) {
  let { sheetId: sheetId, activeCell: activeCell, selectionCorner: selectionCorner } = place;
  let hiddenRowKeys = selection.rowsOutOfViewByOwnFilters.get(sheetId);
  if (
    hiddenRowKeys === undefined ||
    hiddenRowKeys.has(activeCell.rowId) ||
    hiddenRowKeys.has(selectionCorner.rowId) ||
    readsBefore.linesOf(sheetId)?.rows === readsNow.linesOf(sheetId)?.rows
  )
    return remapSelectionCorners(place, readsBefore, readsNow);
  let hiddenRuns = rowsHiddenByOwnFilters(selection, readsNow, sheetId);
  return (
    remapSelectionCorners(place, readsBefore, readsWithOnlyShownRows(readsNow, sheetId, hiddenRuns)) ??
    remapSelectionCorners(place, readsBefore, readsNow)
  );
}
export function unhideFilteredRowsIn(
  selection: Dynamic,
  reads: ReadsWithTextMeasurer,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic,
) {
  let hiddenRowKeys = selection.rowsOutOfViewByOwnFilters.get(sheetId);
  if (hiddenRowKeys === undefined || rowCount === findSheetById(reads, sheetId)?.rowCount) return selection;
  let stillHidden = new (Set as Dynamic)(hiddenRowKeys);
  let runs = reads.linesOf(sheetId)?.rows.runsIn({
    firstIndex: topRowIndex,
    count: rowCount,
  });
  for (let { base: base, first: first, count: count } of (runs ?? []) as Dynamic)
    for (let index: Dynamic = first; index < first + count && stillHidden.size > 0; index += 1) stillHidden.delete(`${base}.${index}`);
  return stillHidden.size === hiddenRowKeys.size ? selection : withRowsHiddenByOwnFilters(selection, reads, sheetId, stillHidden);
}
export function unhideFilteredRowsOfSelection(selection: Dynamic, reads: ReadsWithTextMeasurer) {
  let area = selectedArea(selection, reads);
  return area === null ? selection : unhideFilteredRowsIn(selection, reads, selection.activeCell.sheetId, area);
}
export function trimAreaToShownRows(selection: Dynamic, reads: WorkbookReads, area?: Dynamic, sheetId?: Dynamic) {
  let pieces = shownPiecesOfArea(
    {
      ...selection,
      sheetId: sheetId,
    },
    reads,
    area,
  );
  let [firstPiece, lastPiece] = [pieces[0], pieces.at(-1)];
  if (firstPiece === undefined || lastPiece === undefined || firstPiece === area) return area;
  if (area.rowCount === findSheetById(reads, sheetId)?.rowCount) return area;
  let { topRowIndex: topRowIndex } = firstPiece;
  return {
    ...area,
    topRowIndex: topRowIndex,
    rowCount: lastPiece.topRowIndex + lastPiece.rowCount - topRowIndex,
  };
}
export function unhideRowsUnderActiveCell(before: Dynamic, selection: Dynamic, reads: ReadsWithTextMeasurer) {
  if (selection.rowsOutOfViewByOwnFilters.size === 0 || selection.activeCell.sheetId !== selection.sheetId) return selection;
  let cellArea = mergedAreaOrCellOf(reads, selection.activeCell);
  let area = selectedArea(selection, reads);
  if (cellArea === null || area === null) return selection;
  let layout = layoutOfView(selection, reads);
  if ((selection.mode.kind !== 'editing' && area.rowCount === layout.rowCount) || areaHasShownRow(layout, cellArea)) return selection;
  let unhidden = unhideFilteredRowsIn(selection, reads, selection.sheetId, cellArea);
  return unhidden === selection || selection.activeCell === before.activeCell ? unhidden : scrollToShowSelection(unhidden, reads);
}
export const filteredRowRunsIn = (state: PageState, reads: WorkbookReads, { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
  clipIndexRuns(rowsHiddenByOwnFilters(state, reads, state.sheetId), {
    firstIndex: topRowIndex,
    count: rowCount,
  });
export const hasFilteredRowsIn = (state: PageState, reads: WorkbookReads, area?: Dynamic) =>
  filteredRowRunsIn(
    {
      ...state,
      sheetId: state.activeCell.sheetId,
    },
    reads,
    area,
  ).length > 0;
export const shownRowCountIn = (state: PageState, reads: WorkbookReads, area?: Dynamic) =>
  filteredRowRunsIn(state, reads, area).reduce((shown: Dynamic, { count: count }: Dynamic) => shown - count, area.rowCount);
export const MAX_SHOWN_PIECES = 100;
export const shownRowEdgesCache = new (WeakMap as Dynamic)();
export const areaHasShownRow = ({ rowEdges: rowEdges }: Dynamic, { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
  shownLineAtOrAfter(rowEdges, topRowIndex) < topRowIndex + rowCount;
export const setRowsHiddenByOwnFilters = (selection: Dynamic, reads: ReadsWithTextMeasurer, sheetId?: Dynamic, rowKeys?: Dynamic) =>
  keepSelectionOnShownRows(withRowsHiddenByOwnFilters(selection, reads, sheetId, withoutFrozenRowKeys(reads, sheetId, rowKeys)), reads);
export const unhideAreaIfAllFiltered = (
  selection: Dynamic,
  reads: ReadsWithTextMeasurer,
  area?: Dynamic,
  sheetId: Dynamic = selection.sheetId,
) =>
  areaHasShownRow(
    layoutOfView(
      {
        ...selection,
        sheetId: sheetId,
      },
      reads,
    ),
    area,
  )
    ? selection
    : unhideFilteredRowsIn(selection, reads, sheetId, area);
