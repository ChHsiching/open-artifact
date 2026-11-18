import type { Dynamic } from '../dynamic.ts';
import { cachedSelectedArea } from '../presence/selections.ts';
import { unionOfAreas, areaGrownOverMerges, selectedArea } from '../selection/model.ts';
import { reportErrorSoftly } from '../engine/loader.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function gapBetweenAreas(area?: Dynamic, other?: Dynamic) {
  let rowGap = gapBetweenSpans(area.topRowIndex, area.rowCount, other.topRowIndex, other.rowCount);
  let columnGap = gapBetweenSpans(area.leftColumnIndex, area.columnCount, other.leftColumnIndex, other.columnCount);
  return rowGap > 0 && columnGap > 0 ? 1 / 0 : rowGap + columnGap;
}
export function areaCoveringChanges(changes: Dynamic, workbook: WorkbookReads) {
  return changes.reduce((covering: Dynamic, { cells: cells }: Dynamic) => {
    let area = cachedSelectedArea(cells, workbook);
    return covering === null || area === null ? (covering ?? area) : unionOfAreas(covering, area);
  }, null);
}
export function changesSpanWholeLines(changes: Dynamic, workbook: WorkbookReads) {
  let area = areaCoveringChanges(changes, workbook);
  let sheetId = changes[0]?.cells.activeCell.sheetId;
  let sheet = workbook.listSheets().find((input?: Dynamic) => input.sheetId === sheetId);
  return area !== null && sheet !== undefined && (area.rowCount === sheet.rowCount || area.columnCount === sheet.columnCount);
}
export function collectChangesNear(area?: Dynamic, candidates?: Dynamic, areaOf?: Dynamic, maxGap?: Dynamic) {
  let grownArea: Dynamic = area;
  let near = candidates.filter((candidate?: Dynamic) => {
    let candidateArea = areaOf(candidate);
    if (candidateArea === null || gapBetweenAreas(candidateArea, area) > maxGap) return false;
    grownArea = unionOfAreas(grownArea, candidateArea);
    return true;
  });
  if (near.length === 0) return near;
  let rest = candidates.filter((input?: Dynamic) => !near.includes(input));
  return [...near, ...collectChangesNear(grownArea, rest, areaOf, 0)];
}
export function clusterChangedCells(cells?: Dynamic, columnCount?: Dynamic, maxClusters?: Dynamic) {
  let keyOf = (rowIndex?: Dynamic, columnIndex?: Dynamic) => rowIndex * (columnCount + CHANGED_CELL_CLUSTER_GAP) + columnIndex;
  let cellsByKey = new (Map as Dynamic)(cells.map((cell?: Dynamic) => [keyOf(cell.rowIndex, cell.columnIndex), cell]));
  let clusters: Dynamic = [];
  for (let [key, cell] of cellsByKey as Dynamic) {
    if (clusters.length === maxClusters) return null;
    cellsByKey.delete(key);
    let cluster = [cell];
    let [topRow, leftColumn, bottomRow, rightColumn]: Dynamic = [cell.rowIndex, cell.columnIndex, cell.rowIndex, cell.columnIndex];
    for (let { rowIndex: rowIndex, columnIndex: columnIndex } of cluster as Dynamic) {
      [topRow, leftColumn] = [Math.min(topRow, rowIndex), Math.min(leftColumn, columnIndex)];
      [bottomRow, rightColumn] = [Math.max(bottomRow, rowIndex), Math.max(rightColumn, columnIndex)];
      for (let [rowOffset, columnOffset] of CLUSTER_NEIGHBOUR_OFFSETS as Dynamic) {
        let neighbourKey = keyOf(rowIndex + rowOffset, columnIndex + columnOffset);
        let neighbour = cellsByKey.get(neighbourKey);
        if (neighbour === undefined) continue;
        cellsByKey.delete(neighbourKey);
        cluster.push(neighbour);
      }
    }
    clusters.push({
      topRowIndex: topRow,
      leftColumnIndex: leftColumn,
      rowCount: bottomRow - topRow + 1,
      columnCount: rightColumn - leftColumn + 1,
    });
  }
  return clusters;
}
export function mergeChangedCellAreas(cells: Dynamic, sheetId: Dynamic, workbook: WorkbookReads) {
  let sheet = workbook.listSheets().find((input?: Dynamic) => input.sheetId === sheetId);
  let clusters = sheet === undefined ? null : clusterChangedCells(cells, sheet.columnCount, MAX_CHANGED_CELL_CLUSTERS);
  if (clusters === null) return null;
  let areas: Dynamic = [];
  for (let cluster of clusters as Dynamic) {
    let area: Dynamic = areaGrownOverMerges(workbook, sheetId, cluster);
    for (;;) {
      let near = collectChangesNear(area, areas, (input?: Dynamic) => input, CHANGED_CELL_CLUSTER_GAP);
      if (near.length === 0) break;
      areas = areas.filter((input?: Dynamic) => !near.includes(input));
      area = areaGrownOverMerges(workbook, sheetId, near.reduce(unionOfAreas, area));
    }
    areas.push(area);
  }
  areas.sort(
    (input?: Dynamic, options?: Dynamic) =>
      input.topRowIndex === options.topRowIndex ? input.leftColumnIndex - options.leftColumnIndex : input.topRowIndex - options.topRowIndex,
  );
  return areas;
}
export function selectionsApartForChangedCells(cells: Dynamic, sheetId: Dynamic, workbook: WorkbookReads) {
  let areas = mergeChangedCellAreas(cells, sheetId, workbook) ?? [];
  if (areas.length < 2 || areas.length > MAX_CHANGE_GROUPS_APART) return [];
  let selections = areas.flatMap(
    ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic) => {
      let activeCell = workbook.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
      let selectionCorner = workbook.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
      return activeCell === null || selectionCorner === null
        ? []
        : [
            {
              activeCell: activeCell,
              selectionCorner: selectionCorner,
            },
          ];
    },
  );
  return selections.length === areas.length ? selections : [];
}
export function mergeChangesByAgent(marks: Dynamic, changes: Dynamic, workbook: WorkbookReads) {
  let isRevisionJoined = (revision?: Dynamic) =>
    marks.some(({ joinedWith: joinedWith }: Dynamic) => joinedWith.some((input?: Dynamic) => input.revision === revision));
  let addChange = (
    marks2: Dynamic,
    { revision: revision, fadeBeginsAtMs: fadeBeginsAtMs, isOfLayoutAlone: isOfLayoutAlone, isOfViewer: isOfViewer }: Dynamic,
    selections?: Dynamic,
    groupBase?: Dynamic,
  ) => {
    let merged2: Dynamic = [...marks2];
    for (let [index, selection] of selections.entries() as Dynamic) {
      let sameSheetMarks = merged2.filter(
        (input?: Dynamic) => input.cells.activeCell.sheetId === selection.activeCell.sheetId && !input.isOfWholeLines,
      );
      let area = areaCoveringChanges(
        [
          {
            cells: selection,
          },
        ],
        workbook,
      );
      let near =
        area === null ||
        changesSpanWholeLines(
          [
            {
              cells: selection,
            },
          ],
          workbook,
        )
          ? []
          : collectChangesNear(
              area,
              sameSheetMarks,
              (input?: Dynamic) => areaCoveringChanges([...input.joinedWith, input], workbook),
              CHANGE_JOIN_GAP,
            );
      let joinedWith = near.flatMap(
        (input?: Dynamic) => [
          ...input.joinedWith,
          {
            revision: input.revision,
            cells: input.cells,
          },
        ],
      );
      merged2 = merged2.filter((input?: Dynamic) => !near.includes(input));
      merged2.push({
        revision: revision,
        cells: selection,
        group: groupBase + index,
        fadeBeginsAtMs: fadeBeginsAtMs,
        joinedWith: joinedWith,
        stoodAsOneMark: near.length === 1,
        isOfWholeLines: changesSpanWholeLines(
          [
            ...joinedWith,
            {
              cells: selection,
            },
          ],
          workbook,
        ),
        ...(isOfLayoutAlone === true && {
          isOfLayoutAlone: isOfLayoutAlone,
        }),
        ...(isOfViewer === true && {
          isOfViewer: isOfViewer,
        }),
      });
    }
    return merged2;
  };
  let merged: Dynamic = [];
  for (let change of changes as Dynamic) {
    let { revision: revision, fadeBeginsAtMs: fadeBeginsAtMs } = change;
    let sameRevision = marks.filter((input?: Dynamic) => input.revision === revision);
    (merged.push as Dynamic)(
      ...sameRevision.map(
        (input?: Dynamic) => ({
          ...input,
          fadeBeginsAtMs: fadeBeginsAtMs,
        }),
      ),
    );
    if (sameRevision.length > 0 || isRevisionJoined(revision)) continue;
    let groupIndex: Dynamic = 0;
    for (let { cells: cells, groupsApart = [cells] } of [...(change.inOtherSheets ?? []), change] as Dynamic) {
      let mergedInto = addChange(merged, change, groupsApart, groupIndex);
      merged = mergedInto.some((input?: Dynamic) => input.joinedWith.some((input2?: Dynamic) => input2.revision === revision))
        ? addChange(merged, change, [cells], groupIndex)
        : mergedInto;
      groupIndex += groupsApart.length;
    }
  }
  return merged;
}
export function linesKeepTheirOrder(before?: Dynamic, after?: Dynamic) {
  let nextIndex: Dynamic = 0;
  for (let run of before.runsIn({
    firstIndex: 0,
    count: before.count,
  }) as Dynamic) {
    let coveredCount: Dynamic = 0;
    for (let { firstIndex: firstIndex, count: count } of after.stretchesOf(run) as Dynamic) {
      if (firstIndex < nextIndex) return false;
      nextIndex = firstIndex + count;
      coveredCount += count;
    }
    if (coveredCount < run.count) return false;
  }
  return true;
}
export function isSameCellInput(before?: Dynamic, after?: Dynamic) {
  if (before === after) return true;
  if (before === undefined || before.input.kind !== after.input.kind) return false;
  if ('value' in before.input && 'value' in after.input) return before.input.value === after.input.value;
  return JSON.stringify(before.input) === JSON.stringify(after.input) && before.dropdownOption?.label === after.dropdownOption?.label;
}
export function listCellsChangedBetween(before?: Dynamic, after?: Dynamic) {
  let changed: Dynamic = [];
  for (let { sheetId: sheetId } of before.listSheets() as Dynamic) {
    let [beforeLines, afterLines] = [before.linesOf(sheetId), after.linesOf(sheetId)];
    if (beforeLines === null || afterLines === null) return null;
    if (before.sheetAsItStands(sheetId) === after.sheetAsItStands(sheetId)) continue;
    if (!linesKeepTheirOrder(beforeLines.rows, afterLines.rows)) return null;
    if (!linesKeepTheirOrder(beforeLines.columns, afterLines.columns)) return null;
  }
  for (let { sheetId: sheetId } of after.listSheets() as Dynamic) {
    let beforeLines = before.cellsHeldByRow(sheetId);
    let afterLines = after.cellsHeldByRow(sheetId);
    if (beforeLines === afterLines) continue;
    for (let [rowId, rowCells] of afterLines as Dynamic) {
      let otherRowCells = beforeLines.get(rowId);
      if (otherRowCells === rowCells) continue;
      for (let [columnId, cellAfter] of rowCells as Dynamic)
        if (!isSameCellInput(otherRowCells?.get(columnId), cellAfter))
          changed.push({
            sheetId: sheetId,
            rowId: rowId,
            columnId: columnId,
          });
    }
    for (let [rowId, rowCells] of beforeLines as Dynamic) {
      let otherRowCells = afterLines.get(rowId);
      if (rowCells === otherRowCells) continue;
      for (let columnId of rowCells.keys() as Dynamic)
        if (otherRowCells?.has(columnId) !== true)
          changed.push({
            sheetId: sheetId,
            rowId: rowId,
            columnId: columnId,
          });
    }
  }
  return changed;
}
export function resolvePlaceArea(place: Dynamic, workbook: WorkbookReads) {
  if (place === null) return null;
  let { sheetId: sheetId, cells: cells, placementId: placementId } = place;
  let placement =
    placementId === undefined
      ? {}
      : {
          placementId: placementId,
        };
  let positionOf = ({ r: r2, c: c }: Dynamic) =>
    workbook.positionOfCell({
      sheetId: sheetId,
      rowId: r2,
      columnId: c,
    });
  let [topLeft, bottomRight] = cells === null ? [null, null] : [positionOf(cells.topLeft), positionOf(cells.bottomRight)];
  if (topLeft === null || bottomRight === null)
    return {
      sheetId: sheetId,
      area: null,
      ...placement,
    };
  return {
    sheetId: sheetId,
    ...placement,
    area: {
      topRowIndex: topLeft.rowIndex,
      leftColumnIndex: topLeft.columnIndex,
      rowCount: bottomRight.rowIndex - topLeft.rowIndex + 1,
      columnCount: bottomRight.columnIndex - topLeft.columnIndex + 1,
    },
  };
}
export function placeCoveringCells(sheetId: Dynamic, [first, ...rest]: Dynamic, workbook: WorkbookReads) {
  if (first === undefined) return null;
  let [topRow, leftColumn, bottomRow, rightColumn]: Dynamic = [first.rowIndex, first.columnIndex, first.rowIndex, first.columnIndex];
  for (let { rowIndex: rowIndex, columnIndex: columnIndex } of rest as Dynamic) {
    [topRow, leftColumn] = [Math.min(topRow, rowIndex), Math.min(leftColumn, columnIndex)];
    [bottomRow, rightColumn] = [Math.max(bottomRow, rowIndex), Math.max(rightColumn, columnIndex)];
  }
  let [topLeftCell, bottomRightCell] = [workbook.cellIdAt(sheetId, topRow, leftColumn), workbook.cellIdAt(sheetId, bottomRow, rightColumn)];
  if (topLeftCell === null || bottomRightCell === null) return null;
  return {
    place: {
      sheetId: sheetId,
      cells: {
        topLeft: {
          r: topLeftCell.rowId,
          c: topLeftCell.columnId,
        },
        bottomRight: {
          r: bottomRightCell.rowId,
          c: bottomRightCell.columnId,
        },
      },
    },
    cellCount: (bottomRow - topRow + 1) * (rightColumn - leftColumn + 1),
  };
}
export function findChangedPlacesBySheet(before?: Dynamic, after?: Dynamic, onlyNewSheets?: Dynamic) {
  let sheetIdsBefore = new (Set as Dynamic)(before.listSheets().map(({ sheetId: sheetId }: Dynamic) => sheetId));
  let isChanged = didCellInputChange(before, after);
  let changedCells = onlyNewSheets ? null : listCellsChangedBetween(before, after);
  let sheetsToScan = after.listSheets().filter(({ sheetId: sheetId }: Dynamic) => !onlyNewSheets || !sheetIdsBefore.has(sheetId));
  let isTooBigToScan = ({ sheetId: sheetId }: Dynamic) =>
    sheetIdsBefore.has(sheetId) &&
    [...after.cellsHeldByRow(sheetId).values()].reduce((count?: Dynamic, rowCells?: Dynamic) => count + rowCells.size, 0) >
      MAX_CHANGED_CELLS_LISTED;
  if (changedCells === null && sheetsToScan.some(isTooBigToScan)) return null;
  let changed =
    changedCells?.filter(isChanged) ??
    sheetsToScan.flatMap(({ sheetId: sheetId, rowCount: rowCount, columnCount: columnCount }: Dynamic) => {
      let filled = after.filledCellsIn(sheetId, {
        topRowIndex: 0,
        leftColumnIndex: 0,
        rowCount: rowCount,
        columnCount: columnCount,
      });
      return sheetIdsBefore.has(sheetId) ? filled.filter(isChanged) : filled;
    });
  let positionsOf = (input?: Dynamic) => input.flatMap((input2?: Dynamic) => after.positionOfCell(input2) ?? []);
  return after.listSheets().flatMap(({ sheetId: sheetId }: Dynamic) => {
    let inSheet = changed.filter((input?: Dynamic) => input.sheetId === sheetId);
    let byRow = new (Map as Dynamic)(inSheet.map((input?: Dynamic) => [input.rowId, input]));
    let byColumn = new (Map as Dynamic)(inSheet.map((input?: Dynamic) => [input.columnId, input]));
    let covering = placeCoveringCells(sheetId, positionsOf([...byRow.values(), ...byColumn.values()]), after);
    if (covering === null) return [];
    let isWholePlace = inSheet.length === covering.cellCount || inSheet.length > MAX_CHANGED_CELLS_LISTED;
    let filled = inSheet.filter((input?: Dynamic) => after.cellOf(input) !== null);
    return [
      {
        place: covering.place,
        changed: isWholePlace ? [] : positionsOf(inSheet),
        rowsFilled: new (Set as Dynamic)(filled.map(({ rowId: rowId }: Dynamic) => rowId)).size,
      },
    ];
  });
}
export function areaBeforeByUnmovedLines(sheetId?: Dynamic, areaAfter?: Dynamic, before?: Dynamic, after?: Dynamic) {
  let [linesBefore, linesAfter] = [before.linesOf(sheetId), after.linesOf(sheetId)];
  if (linesBefore === null || linesAfter === null) return null;
  let isUnmoved =
    linesKeptUpToLast(linesBefore.rows, linesAfter.rows) &&
    linesKeptUpToLast(linesBefore.columns, linesAfter.columns) &&
    linesBefore.columns.count === linesAfter.columns.count;
  let rowCount = Math.min(areaAfter.rowCount, linesBefore.rows.count - areaAfter.topRowIndex);
  return isUnmoved && rowCount > 0
    ? {
        ...areaAfter,
        rowCount: rowCount,
      }
    : null;
}
export function findChangedCellsInPlace(place?: Dynamic, before?: Dynamic, after?: Dynamic) {
  let unchanged = {
    place: place,
    changed: [],
  };
  let areaAfter = resolvePlaceArea(place, after)?.area ?? null;
  if (place === null || areaAfter === null) return unchanged;
  let { sheetId: sheetId } = place;
  let areaBefore = resolvePlaceArea(place, before)?.area ?? areaBeforeByUnmovedLines(sheetId, areaAfter, before, after);
  if (areaBefore === null || areaBefore.rowCount <= 0 || areaBefore.columnCount <= 0) return unchanged;
  let filledAfter = after.filledCellsIn(sheetId, areaAfter);
  let changedCells = [
    ...filledAfter.filter(didCellInputChange(before, after)),
    ...before.filledCellsIn(sheetId, areaBefore).filter((input?: Dynamic) => after.cellOf(input) === null),
  ];
  let positionsWithinArea = (input?: Dynamic) =>
    input.flatMap((input2?: Dynamic) => {
      let position = after.positionOfCell(input2);
      return position !== null &&
        position.rowIndex >= areaAfter.topRowIndex &&
        position.rowIndex < areaAfter.topRowIndex + areaAfter.rowCount &&
        position.columnIndex >= areaAfter.leftColumnIndex &&
        position.columnIndex < areaAfter.leftColumnIndex + areaAfter.columnCount
        ? [position]
        : [];
    });
  let changedPositions = positionsWithinArea(changedCells);
  let sheet = after.listSheets().find((input?: Dynamic) => input.sheetId === sheetId);
  let coversWholeLines = areaAfter.rowCount === sheet?.rowCount || areaAfter.columnCount === sheet?.columnCount;
  if (changedPositions.length === 0 && coversWholeLines) return unchanged;
  let covering = placeCoveringCells(sheetId, changedPositions.length > 0 ? changedPositions : positionsWithinArea(filledAfter), after);
  if (covering === null) return unchanged;
  return {
    place: covering.place,
    changed: changedPositions.length === covering.cellCount ? [] : changedPositions,
  };
}
export function placesChangedByRevision(place?: Dynamic, before?: Dynamic, after?: Dynamic, isOfLayoutAlone?: Dynamic) {
  let inPlace = findChangedCellsInPlace(place, before, after);
  if (!isOfLayoutAlone && place?.cells !== null) return [inPlace];
  let changedPlaces =
    findChangedPlacesBySheet(before, after, !isOfLayoutAlone) ?? (place?.cells === null ? findChangedPlacesBySheet(before, after, true) : null);
  if (changedPlaces === null) return [inPlace];
  let inSameSheet = changedPlaces.filter((input?: Dynamic) => input.place?.sheetId === place?.sheetId);
  let candidates = isOfLayoutAlone || inSameSheet.length === 0 ? changedPlaces : inSameSheet;
  let mostRowsFilled = (Math.max as Dynamic)(...candidates.map(({ rowsFilled: rowsFilled }: Dynamic) => rowsFilled));
  let mostFilled = candidates.find(({ rowsFilled: rowsFilled }: Dynamic) => rowsFilled === mostRowsFilled);
  let isAllInSameSheet = inSameSheet.length === candidates.length && place?.cells !== null;
  if (mostFilled === undefined) return [inPlace];
  let rowCountOfSheet = (workbook: WorkbookReads) =>
    workbook.listSheets().find(({ sheetId: sheetId }: Dynamic) => sheetId === place?.sheetId)?.rowCount;
  let addsColumnsToKnownRows = (place2?: Dynamic) => {
    let linesBefore = place2 === null ? null : before.linesOf(place2.sheetId);
    if (place2 === null || place2.cells === null || linesBefore === null) return false;
    let corners = [place2.cells.topLeft, place2.cells.bottomRight];
    return (
      corners.every(({ r: rowId }: Dynamic) => linesBefore.rows.indexOf(rowId) !== null) &&
      corners.some(({ c: columnId }: Dynamic) => linesBefore.columns.indexOf(columnId) === null)
    );
  };
  let isOfNewColumns =
    rowCountOfSheet(before) === rowCountOfSheet(after) && addsColumnsToKnownRows(place) && addsColumnsToKnownRows(mostFilled.place);
  if (isAllInSameSheet) return [isOfNewColumns ? mostFilled : inPlace];
  return [
    mostFilled,
    ...candidates.filter((input?: Dynamic) => input !== mostFilled),
    ...(inSameSheet.length > 0 || place?.cells === null ? [] : [inPlace]),
  ];
}
export function findChartPlacedByEdit(sheetId?: Dynamic, place?: Dynamic, before?: Dynamic, after?: Dynamic) {
  let placements = after.placementsIn(sheetId);
  if (place?.sheetId === sheetId && place.placementId !== undefined)
    return placements.find(({ placementId: placementId }: Dynamic) => placementId === place.placementId);
  if (before === null) return;
  let placementIdsBefore = new (Set as Dynamic)(
    before.placementsIn(sheetId).map(({ placementId: placementId }: Dynamic) => placementId),
  );
  return placements.findLast(({ placementId: placementId }: Dynamic) => !placementIdsBefore.has(placementId));
}
export function selectionOfPlace(place?: Dynamic) {
  if (place === null || place.cells === null) return null;
  let { sheetId: sheetId, cells: cells } = place;
  return {
    activeCell: {
      sheetId: sheetId,
      rowId: cells.topLeft.r,
      columnId: cells.topLeft.c,
    },
    selectionCorner: {
      sheetId: sheetId,
      rowId: cells.bottomRight.r,
      columnId: cells.bottomRight.c,
    },
  };
}
export function createChangesByAgentTracker(
  workbook?: Dynamic,
  wait: Dynamic = (delayMs?: Dynamic) => new (Promise as Dynamic)((resolve?: Dynamic) => void setTimeout(resolve, delayMs)),
  nowMs2: Dynamic = () => performance.now(),
) {
  let editsStreamed = new (Map as Dynamic)();
  let changes: Dynamic = [];
  let listeners = new (Set as Dynamic)();
  let notifyListener = (listener?: Dynamic) => {
    try {
      listener(changes);
    } catch (error: Dynamic) {
      reportErrorSoftly(error, 'changesByAgent');
    }
  };
  let pending: Dynamic = null;
  let groupCount: Dynamic = 0;
  let runSince: Dynamic = 0;
  let fadeOutAt = async (fadeBeginsAtMs?: Dynamic): Promise<Dynamic> => {
    await wait(fadeBeginsAtMs + AGENT_CHANGE_FADE_MS - nowMs2());
    let hasFaded = (input?: Dynamic) => input.fadeBeginsAtMs !== null && input.fadeBeginsAtMs <= fadeBeginsAtMs;
    if (!changes.some(hasFaded)) return;
    changes = changes.filter((input?: Dynamic) => !hasFaded(input));
    if (pending !== null && hasFaded(pending.change)) pending = null;
    listeners.forEach(notifyListener);
  };
  let startPendingFade = () => {
    if (pending === null) return;
    let { change: change, onShowAtMs: onShowAtMs } = pending;
    pending = null;
    let fadeAtMs = Math.max(onShowAtMs, nowMs2());
    if (change.fadeBeginsAtMs !== null && change.fadeBeginsAtMs <= fadeAtMs) return;
    let fadingChange = {
      ...change,
      fadeBeginsAtMs: fadeAtMs,
    };
    changes = changes.map((input?: Dynamic) => (input === change ? fadingChange : input));
    fadeOutAt(fadeAtMs);
  };
  let showPending = () => {
    if (pending === null) return;
    startPendingFade();
    listeners.forEach(notifyListener);
  };
  let showPendingAfterMaxWait = async (change?: Dynamic): Promise<Dynamic> => {
    await wait(AGENT_CHANGE_MAX_WAIT_MS);
    if (pending?.change === change) showPending();
  };
  workbook.onChanged(() => {
    if (!workbook.isWorking()) showPending();
  });
  let tracker = {
    streamChanged: () => editsStreamed.clear(),
    editByAgentStreamed(revision?: Dynamic, isOfViewer?: Dynamic, isOfLayoutAlone?: Dynamic) {
      editsStreamed.set(revision, {
        isOfViewer: isOfViewer,
        isOfLayoutAlone: isOfLayoutAlone,
        streamedAtMs: nowMs2(),
      });
      if (!isOfLayoutAlone) showPending();
    },
    caughtUpByLoad({ revisionBefore: revisionBefore, revision: revision, before: before, after: after }: Dynamic) {
      let streamedInLoad = Array.from<Dynamic>(editsStreamed).filter(
        ([input]: Dynamic) => input > revisionBefore && input <= revision,
      );
      if (streamedInLoad.length < revision - revisionBefore) return;
      editsStreamed.set(revision, {
        isOfViewer: streamedInLoad.every(([, { isOfViewer: input }]: Dynamic) => input),
        isOfLayoutAlone: streamedInLoad.every(([, { isOfLayoutAlone: input }]: Dynamic) => input),
        streamedAtMs: (Math.min as Dynamic)(...streamedInLoad.map(([, { streamedAtMs: input }]: Dynamic) => input)),
      });
      tracker.editsOfOthersMade(
        [
          {
            revision: revision,
            placeChanged: null,
          },
        ],
        before,
        after,
      );
      if (pending?.change.revision !== revision) for (let [revision2, streamed] of streamedInLoad as Dynamic) editsStreamed.set(revision2, streamed);
    },
    editsOfOthersMade(edits?: Dynamic, before?: Dynamic, after?: Dynamic) {
      let nowMs3 = nowMs2();
      let newChanges: Dynamic = [];
      let layoutChanges: Dynamic = [];
      let largestCellCount: Dynamic = 0;
      let hasNewMark: Dynamic = null;
      let areAllStreamed = edits.every(({ revision: revision }: Dynamic) => editsStreamed.has(revision));
      for (let { revision: value, placeChanged: placeChanged } of edits as Dynamic) {
        let streamed = editsStreamed.get(value);
        for (let value2 of editsStreamed.keys() as Dynamic) if (value2 <= value) editsStreamed.delete(value2);
        if (streamed === undefined) continue;
        if (streamed.isOfLayoutAlone) {
          let value2 = selectionOfPlace(placeChanged);
          if (value2 !== null)
            layoutChanges.push({
              revision: value,
              cells: value2,
              ...(streamed.isOfViewer && {
                isOfViewer: true,
              }),
              isOfLayoutAlone: true,
              fadeBeginsAtMs: nowMs3,
            });
          continue;
        }
        let changedPlaces =
          areAllStreamed && before !== null
            ? placesChangedByRevision(placeChanged, before, after, edits.length === 1)
            : [
                {
                  place: placeChanged,
                  changed: [],
                },
              ];
        let [firstChange, ...inOtherSheets] = changedPlaces.flatMap(({ place: place, changed: changed }: Dynamic) => {
          let selection = selectionOfPlace(place);
          if (selection === null) return [];
          let groupsApart = selectionsApartForChangedCells(changed, selection.activeCell.sheetId, after);
          return [
            {
              cells: selection,
              ...(groupsApart.length > 0 && {
                groupsApart: groupsApart,
              }),
            },
          ];
        });
        let isInRun = streamed.streamedAtMs < groupCount || hasNewMark !== null;
        if (!isInRun) runSince = value;
        hasNewMark = firstChange !== undefined;
        if (firstChange === undefined) continue;
        for (let value2 of [firstChange, ...inOtherSheets].flatMap(
          ({ cells: cells, groupsApart: groupsApart }: Dynamic) => groupsApart ?? [cells],
        ) as Dynamic) {
          let area = selectedArea(value2, after);
          largestCellCount = Math.max(largestCellCount, area === null ? 1 / 0 : area.rowCount * area.columnCount);
        }
        let beforeIfOneEdit = edits.length === 1 ? before : null;
        let chart = findChartPlacedByEdit(firstChange.cells.activeCell.sheetId, placeChanged, beforeIfOneEdit, after);
        newChanges.push({
          revision: value,
          ...firstChange,
          ...(chart !== undefined && {
            chart: chart,
          }),
          ...(inOtherSheets.length > 0 && {
            inOtherSheets: inOtherSheets,
          }),
          ...(streamed.isOfViewer && {
            isOfViewer: true,
          }),
          ...(isInRun && {
            inRunSince: runSince,
          }),
        });
      }
      if (hasNewMark === null && layoutChanges.length === 0) return;
      if (layoutChanges.length > 0) fadeOutAt(nowMs3);
      if (hasNewMark !== null) {
        startPendingFade();
        groupCount = Math.max(groupCount, nowMs3 + changeHoldMsForCellCount(largestCellCount));
      }
      let fadeAtMs = groupCount;
      let lastChange = hasNewMark === true ? newChanges.pop() : undefined;
      let fadingChanges: Dynamic = [];
      for (let value of newChanges as Dynamic)
        fadingChanges.push({
          ...value,
          fadeBeginsAtMs: fadeAtMs,
        });
      if (fadingChanges.length > 0) fadeOutAt(fadeAtMs);
      changes = [...changes, ...fadingChanges];
      if (lastChange !== undefined && workbook.isWorking()) {
        let state = {
          ...lastChange,
          fadeBeginsAtMs: null,
        };
        pending = {
          change: state,
          onShowAtMs: fadeAtMs,
        };
        changes = [...changes, state];
        showPendingAfterMaxWait(state);
      } else if (lastChange !== undefined) {
        let state = {
          ...lastChange,
          fadeBeginsAtMs: nowMs3 + AGENT_CHANGE_HOLD_MS,
        };
        pending = {
          change: state,
          onShowAtMs: fadeAtMs,
        };
        changes = [...changes, state];
        fadeOutAt(state.fadeBeginsAtMs);
      }
      let allChanges = [...changes, ...layoutChanges];
      allChanges.sort((input?: Dynamic, options?: Dynamic) => input.revision - options.revision);
      changes = allChanges;
      listeners.forEach(notifyListener);
    },
    onChanged(listener?: Dynamic) {
      listeners.add(listener);
      if (changes.length > 0) notifyListener(listener);
      return () => void listeners.delete(listener);
    },
  };
  return tracker;
}
export function chartEndWordOfAgent(outcome?: Dynamic) {
  if (typeof outcome === 'object') return 'by_agent';
  switch (outcome) {
    case 'full':
    case 'codeRefused':
    case 'notMade':
      return CHART_END_WORDS[outcome];
    case 'stopped':
      return 'stopped';
    case 'noAgent':
      return 'no_agent';
    case 'tooLarge':
      return 'too_large';
    case 'forChat':
      return 'for_chat';
    case 'notChanged':
      return 'failed';
  }
}
export function chartCardActs(card?: Dynamic) {
  if (card.step === 'open') return [`chart_open_${card.what}`];
  if (card.step === 'press') return ['chart_asked', `chart_asked_${card.what}`];
  return chartEndHealth(card.what, card.lane)[1] === 'success' ? ['chart_added', `chart_end_${card.what}`] : [`chart_end_${card.what}`];
}
export function chartEndHealth(what?: Dynamic, lane?: Dynamic) {
  let kind = lane === 'page' ? 'insert' : 'generate';
  switch (what) {
    case 'by_page':
    case 'by_page_late':
    case 'by_agent':
      return [kind, 'success'];
    case 'cant_be_shown':
      return [kind, 'failure', 'invalid_content'];
    case 'refused':
    case 'failed':
    case 'stopped':
    case 'left':
    case 'busy':
    case 'waiting':
    case 'no_cells':
    case 'filter':
    case 'for_chat':
    case 'to_chat':
    case 'chat_no_agent':
    case 'not_to_chat':
    case 'no_agent':
    case 'too_large':
    case 'full':
      return [kind, 'aborted'];
  }
}
export function countChartAsk(count?: Dynamic, what?: Dynamic) {
  count({
    step: 'press',
    what: what,
  });
  let isCounted: Dynamic = false;
  return (endWhat?: Dynamic, lane?: Dynamic) => {
    if (isCounted) return;
    isCounted = true;
    count({
      step: 'end',
      what: endWhat,
      lane: lane,
    });
  };
}
export const AGENT_CHANGE_HOLD_MS = 3400;
export const AGENT_CHANGE_FADE_MS = 400;
export const AGENT_CHANGE_MAX_WAIT_MS = 300000;
export const CHANGE_HOLD_PER_CELL_MS = 60;
export const CHANGE_HOLD_MAX_GROWTH_MS = 2000;
export const CHANGE_HOLD_TAIL_MS = 200;
export const CHANGE_HOLD_BASE_MS = 100;
export const changeHoldMsForCellCount = (cellCount?: Dynamic) =>
  CHANGE_HOLD_BASE_MS + Math.min(CHANGE_HOLD_MAX_GROWTH_MS, cellCount * CHANGE_HOLD_PER_CELL_MS) + CHANGE_HOLD_TAIL_MS;
export const MAX_CHANGE_GROUPS_APART = 8;
export const gapBetweenSpans = (start?: Dynamic, length?: Dynamic, otherStart?: Dynamic, otherLength?: Dynamic) =>
  Math.max(start - (otherStart + otherLength - 1), otherStart - (start + length - 1), 0);
export const CHANGE_JOIN_GAP = 1;
export const CHANGED_CELL_CLUSTER_GAP = 2;
export const CLUSTER_NEIGHBOUR_OFFSETS = Array.from<Dynamic, Dynamic>(
  {
    length: CHANGED_CELL_CLUSTER_GAP,
  },
  (input?: Dynamic, index?: Dynamic) => index + 1,
).flatMap(
  (distance?: Dynamic) => [
    [-distance, 0],
    [distance, 0],
    [0, -distance],
    [0, distance],
  ],
);
export const MAX_CHANGED_CELL_CLUSTERS = 64;
export const didCellInputChange =
  (before?: Dynamic, after?: Dynamic) =>
  (cellId?: Dynamic) => {
    let [cellBefore, cellAfter] = [before.cellOf(cellId), after.cellOf(cellId)];
    return cellBefore !== cellAfter && JSON.stringify(cellBefore?.input) !== JSON.stringify(cellAfter?.input);
  };
export const MAX_CHANGED_CELLS_LISTED = 1e4;
export const linesKeptUpToLast = (before?: Dynamic, after?: Dynamic) =>
  linesKeepTheirOrder(before, after) && after.idAt(before.count - 1) === before.idAt(before.count - 1);
export const chartAskKindWord = (chartKind?: Dynamic, isTyped?: Dynamic, hasSuggestions?: Dynamic) =>
  isTyped ? 'typed' : chartKind === 'any' ? 'quick' : hasSuggestions ? 'suggested' : 'plain_kind';
export const CHART_END_WORDS = {
  full: 'full',
  codeRefused: 'cant_be_shown',
  notMade: 'refused',
};
