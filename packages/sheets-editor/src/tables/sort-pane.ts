import type { Dynamic } from '../dynamic.ts';
import { headingRowCountByFreeze, sortHoldsOfColumn, widenToRegionColumns } from './sort.ts';
import { lacksHeadingRow, sortHeadingOfColumn, headingTextAt } from '../ui/sort-menu.ts';
import { sortColumnOfMenu, withNoEffects } from '../state/transitions.ts';
import { layoutOfView, sheetOfViewOrEmpty } from '../grid/layout.ts';
import { selectedArea, selectionPositionsOf } from '../selection/model.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import { currentRegionAround } from '../selection/jumps.ts';
import { parseA1AreaAsSeen, columnLetters } from '../model/a1-references.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { areaRefBetween } from '../model/workbook.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { openMenuAtActiveCell } from '../ui/menu.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function areaOfSortCorners(workbook: WorkbookReads, { topLeft: topLeft, bottomRight: bottomRight }: Dynamic) {
  let [topLeftPosition, bottomRightPosition] = [workbook.positionOfCell(topLeft), workbook.positionOfCell(bottomRight)];
  if (topLeftPosition === null || bottomRightPosition === null) return null;
  if (bottomRightPosition.rowIndex < topLeftPosition.rowIndex || bottomRightPosition.columnIndex < topLeftPosition.columnIndex) return null;
  return {
    topRowIndex: topLeftPosition.rowIndex,
    leftColumnIndex: topLeftPosition.columnIndex,
    rowCount: bottomRightPosition.rowIndex - topLeftPosition.rowIndex + 1,
    columnCount: bottomRightPosition.columnIndex - topLeftPosition.columnIndex + 1,
  };
}
export function guessHasHeaderRow(state: PageState, workbook: WorkbookReads, area?: Dynamic) {
  let recordsTopRowIndex = headingRowCountByFreeze(state, workbook);
  if (area.topRowIndex < recordsTopRowIndex) return true;
  let topRowCells = workbook.cellsOnShowIn(state.sheetId, {
    ...area,
    rowCount: 1,
  });
  if (area.topRowIndex === recordsTopRowIndex && !lacksHeadingRow(state, workbook, topRowCells)) return false;
  return (
    area.rowCount > 1 &&
    topRowCells.length > 0 &&
    topRowCells.every((input?: Dynamic) => valueOrInputOfCell(workbook, input)?.kind === 'text')
  );
}
export function sortSpecOfArea(state: PageState, workbook: ReadsWithTextMeasurer, area?: Dynamic, sort?: Dynamic, holds: Dynamic = 'range') {
  let { sheetId: sheetId } = state;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let topLeft = workbook.cellIdAt(sheetId, topRowIndex, leftColumnIndex);
  let bottomRight = workbook.cellIdAt(sheetId, topRowIndex + rowCount - 1, leftColumnIndex + columnCount - 1);
  if (topLeft === null || bottomRight === null) return null;
  let isColumnInSortArea = (input?: Dynamic) => isColumnInArea(workbook, sheetId, area, input);
  let keys = sort?.keys.filter(({ columnId: columnId }: Dynamic) => isColumnInSortArea(columnId)) ?? [];
  let nextKeyId = sort?.nextKeyId ?? 0;
  let columnPicked = sortColumnOfMenu(state.menu, holds) ?? state.activeCell.columnId;
  let firstKeyColumnId = isColumnInSortArea(columnPicked) ? columnPicked : topLeft.columnId;
  let { rowCount: sheetRowCount, columnCount: sheetColumnCount } = layoutOfView(state, workbook);
  return {
    sheetId: sheetId,
    topLeft: topLeft,
    bottomRight: bottomRight,
    stoodAt: area,
    sizeOfSheet: {
      rowCount: sheetRowCount,
      columnCount: sheetColumnCount,
    },
    hasHeaderRow: sort?.topLeft.rowId === topLeft.rowId ? sort.hasHeaderRow : guessHasHeaderRow(state, workbook, area),
    ...(keys.length > 0
      ? {
          keys: keys,
          nextKeyId: nextKeyId,
        }
      : {
          keys: [
            {
              keyId: nextKeyId,
              columnId: firstKeyColumnId,
              direction: 'ascending',
            },
          ],
          nextKeyId: nextKeyId + 1,
        }),
  };
}
export function areaOnShowIfWhole(state: PageState, workbook: ReadsWithTextMeasurer, area?: Dynamic) {
  let { rowCount: rowCount, columnCount: columnCount } = layoutOfView(state, workbook);
  if (area.rowCount < rowCount && area.columnCount < columnCount) return area;
  return workbook.areaOnShowIn(state.sheetId, area);
}
export function areaToSortFromSelection(state: PageState, workbook: ReadsWithTextMeasurer) {
  let area = selectedArea(state, workbook);
  if (area === null) return null;
  return isSelectionOneCell(state, workbook) ? currentRegionAround(state, workbook, area) : areaOnShowIfWhole(state, workbook, area);
}
export function areaToSort(state: PageState, workbook: ReadsWithTextMeasurer, holds?: Dynamic) {
  if (holds === 'range') return areaToSortFromSelection(state, workbook);
  let { rowCount: rowCount, columnCount: columnCount } = layoutOfView(state, workbook);
  let wholeSheet = {
    topRowIndex: 0,
    leftColumnIndex: 0,
    rowCount: rowCount,
    columnCount: columnCount,
  };
  return workbook.areaOnShowIn(state.sheetId, wholeSheet);
}
export function areaWithoutHeadingRow(state: PageState, workbook: WorkbookReads, area?: Dynamic) {
  if (area.topRowIndex > 0) return area;
  let areaBelowTopRow = {
    ...area,
    topRowIndex: 1,
    rowCount: area.rowCount - 1,
  };
  let shownArea = workbook.areaOnShowIn(state.sheetId, areaBelowTopRow);
  if (shownArea === null) return area;
  let topRowCells = workbook.cellsOnShowIn(state.sheetId, {
    ...shownArea,
    rowCount: 1,
  });
  return lacksHeadingRow(state, workbook, topRowCells) ? shownArea : area;
}
export function areaOfTypedCells(state: PageState, workbook: ReadsWithTextMeasurer, typed?: Dynamic) {
  let area = parseA1AreaAsSeen(typed, {
    ...layoutOfView(state, workbook),
    ownRowOrder: ownRowOrderOfSheet(workbook, state.sheetId),
  });
  if (area === null) return null;
  let shownArea = areaOnShowIfWhole(state, workbook, area) ?? area;
  return /\d/.test(typed) ? shownArea : areaWithoutHeadingRow(state, workbook, shownArea);
}
export function areaToSortFor(state: PageState, workbook: ReadsWithTextMeasurer, holds?: Dynamic) {
  let area = areaToSort(state, workbook, holds);
  if (area === null) return null;
  let selected = selectedArea(state, workbook);
  let { rowCount: rowCount, columnCount: columnCount } = layoutOfView(state, workbook);
  return holds === 'range' &&
    selected !== null &&
    !isSelectionOneCell(state, workbook) &&
    selected.rowCount < rowCount &&
    selected.columnCount < columnCount
    ? area
    : areaWithoutHeadingRow(state, workbook, area);
}
export function openSortPane(state: PageState, workbook: ReadsWithTextMeasurer, holds?: Dynamic, columnId: Dynamic = null) {
  let sort = sortSpecFor(state, workbook, holds, columnId);
  if (sort === null)
    return {
      ...state,
      menu: null,
    };
  let timesSidePaneAsked = state.timesSidePaneAsked + (sortOfSidePane(state) === null ? 0 : 1);
  return withSortPane(
    {
      ...state,
      menu: null,
      dropdown: null,
      timesSidePaneAsked: timesSidePaneAsked,
    },
    sort,
  );
}
export function settleSortPane(state: PageState, workbook: ReadsWithTextMeasurer) {
  let sort = sortOfSidePane(state);
  if (sort === null) return state;
  let isOnSheet2 = sort.sheetId === state.sheetId;
  let areaNow = isOnSheet2 ? areaOfSortCorners(workbook, sort) : null;
  let { rowCount: rowCount, columnCount: columnCount } = layoutOfView(state, workbook);
  let isSheetSameSize = rowCount === sort.sizeOfSheet.rowCount && columnCount === sort.sizeOfSheet.columnCount;
  let isSameSize = areaNow?.rowCount === sort.stoodAt.rowCount && areaNow.columnCount === sort.stoodAt.columnCount;
  let area = isOnSheet2 && isSheetSameSize && !isSameSize ? sort.stoodAt : areaNow;
  if (
    area !== null &&
    isSheetSameSize &&
    areSortAreasSame(area, sort.stoodAt) &&
    isSameSize &&
    sort.keys.every(({ columnId: columnId }: Dynamic) => isColumnInArea(workbook, sort.sheetId, area, columnId))
  )
    return state;
  let nextSort = area === null ? null : sortSpecOfArea(state, workbook, area, sort);
  if (nextSort === null) {
    let sortOfRange = sortSpecFor(state, workbook, 'range');
    return sortOfRange === null
      ? {
          ...state,
          sidePane: null,
        }
      : withSortPane(state, sortOfRange);
  }
  let { hasHeaderRow: hasHeaderRow, cellsTyped: cellsTyped, areCellsTypedRefused: areCellsTypedRefused } = sort;
  return withSortPane(state, {
    ...nextSort,
    hasHeaderRow: hasHeaderRow,
    ...(cellsTyped !== undefined && {
      cellsTyped: cellsTyped,
    }),
    ...(areCellsTypedRefused === true && {
      areCellsTypedRefused: areCellsTypedRefused,
    }),
  });
}
export function recordsAreaOfSort(state: PageState, workbook: WorkbookReads, sort?: Dynamic) {
  let area = areaOfSortCorners(workbook, sort);
  return area === null ? null : areaBelowRows(area, headingRowCountOfSort(state, workbook, area, sort));
}
export function drawnSortPane(state: PageState, workbook: WorkbookReads) {
  let sort = sortOfSidePane(state);
  if (sort === null) return null;
  let { frozenRowCount: frozenRowCount } = sheetOfViewOrEmpty(state, workbook);
  let { profilesById: profilesById } = state;
  let isLargeEditBeingSaved = state.isLargeEditUnsaved && state.saving !== 'allSaved';
  let cached = drawnSortPaneCache.get(sort);
  if (
    cached?.reads === workbook &&
    cached.isLargeEditBeingSaved === isLargeEditBeingSaved &&
    cached.frozenRowCount === frozenRowCount &&
    cached.profilesById === profilesById
  )
    return cached.drawn;
  let drawn = drawSortPane(state, workbook, sort, isLargeEditBeingSaved);
  drawnSortPaneCache.set(sort, {
    reads: workbook,
    frozenRowCount: frozenRowCount,
    profilesById: profilesById,
    isLargeEditBeingSaved: isLargeEditBeingSaved,
    drawn: drawn,
  });
  return drawn;
}
export function drawSortPane(state: PageState, workbook: WorkbookReads, sort?: Dynamic, isLargeEditBeingSaved?: Dynamic) {
  let area = areaOfSortCorners(workbook, sort);
  let recordsArea = recordsAreaOfSort(state, workbook, sort);
  let { sheetId: sheetId, hasHeaderRow: hasHeaderRow, keys: keys } = sort;
  let startsAtRecordsTop = recordsArea?.topRowIndex === headingRowCountByFreeze(state, workbook);
  let lacksHeadings =
    startsAtRecordsTop &&
    lacksHeadingRow(
      state,
      workbook,
      workbook.cellsOnShowIn(sheetId, {
        ...recordsArea,
        rowCount: 1,
      }),
    );
  let columns =
    area === null || recordsArea === null
      ? []
      : Array.from<Dynamic, Dynamic>(
          {
            length: area.columnCount,
          },
          (input?: Dynamic, offset?: Dynamic) => {
            let columnIndex = area.leftColumnIndex + offset;
            let headingRowIndex = Math.max(recordsArea.topRowIndex - 1, 0);
            let cellId = workbook.cellIdAt(sheetId, headingRowIndex, columnIndex);
            if (cellId === null) return [];
            let sortHeading = startsAtRecordsTop ? sortHeadingOfColumn(state, workbook, columnIndex) : '';
            let heading = hasHeaderRow
              ? headingTextAt(
                  state,
                  workbook,
                  {
                    rowIndex: headingRowIndex,
                    columnIndex: columnIndex,
                  },
                  true,
                )
              : sortHeading;
            let shownHeading = lacksHeadings ? '' : heading;
            return [
              {
                columnId: cellId.columnId,
                letters: columnLetters(columnIndex),
                heading: shownHeading,
              },
            ];
          },
        ).flat();
  return {
    cells: area === null ? '' : areaToA1AsStored(area, ownRowOrderOfSheet(workbook, sort.sheetId)),
    cellsTyped: sort.cellsTyped ?? null,
    areCellsTypedRefused: sort.areCellsTypedRefused === true,
    hasHeaderRow: hasHeaderRow,
    columns: columns,
    keys: keys.map(
      ({ keyId: keyId, columnId: columnId, direction: direction }: Dynamic) => ({
        keyId: keyId,
        columnId: columnId,
        direction: direction,
        holds:
          recordsArea === null
            ? null
            : sortHoldsOfColumn(
                workbook,
                {
                  sheetId: sheetId,
                  columnId: columnId,
                },
                recordsArea,
              ),
      }),
    ),
    isLargeEditBeingSaved: isLargeEditBeingSaved,
    canAddKey: keys.length < columns.length,
    canSort: !isLargeEditBeingSaved && recordsArea !== null && recordsArea.rowCount > 1 && sort.areCellsTypedRefused !== true,
  };
}
export function sortMovesWholeRows(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let isInsideArea = ({ leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic) =>
    leftColumnIndex >= area.leftColumnIndex && leftColumnIndex + columnCount <= area.leftColumnIndex + area.columnCount;
  let rowsArea = {
    ...area,
    leftColumnIndex: 0,
    columnCount: 1 / 0,
  };
  let shownRowsArea = workbook.areaOnShowIn(sheetId, rowsArea);
  return (shownRowsArea === null || isInsideArea(shownRowsArea)) && workbook.mergedAreasIn(sheetId, rowsArea).every(isInsideArea);
}
export function sortCells(state: PageState, workbook: WorkbookReads, sort?: Dynamic, isWithoutKeyboard?: Dynamic, select?: Dynamic) {
  let area = areaOfSortCorners(workbook, sort);
  let recordsArea = recordsAreaOfSort(state, workbook, sort);
  if (area === null || recordsArea === null || recordsArea.rowCount < 2) return withNoEffects(state);
  let topLeftCellId = workbook.cellIdAt(sort.sheetId, recordsArea.topRowIndex, recordsArea.leftColumnIndex);
  let keys = sort.keys.flatMap(({ columnId: columnId, direction: direction }: Dynamic) => {
    let columnIndex = workbook.columnIndexOf(sort.sheetId, columnId);
    return columnIndex !== null && isColumnInArea(workbook, sort.sheetId, area, columnId)
      ? [
          {
            sent: {
              byColumn: columnId,
              direction: direction,
            },
            said: {
              column: columnLetters(columnIndex),
              direction: direction,
            },
          },
        ]
      : [];
  });
  let [firstKey, ...thenByKeys] = keys;
  if (topLeftCellId === null || firstKey === undefined || keys.length < sort.keys.length) return withNoEffects(state);
  let sortBy = {
    ...firstKey.sent,
    ...(thenByKeys.length > 0 && {
      thenBy: thenByKeys.map(({ sent: sent }: Dynamic) => sent),
    }),
  };
  let movesWholeRows = sort.movesWholeRows ?? sortMovesWholeRows(workbook, sort.sheetId, recordsArea);
  let edit = movesWholeRows
    ? {
        kind: 'sortRows',
        sheetId: sort.sheetId,
        oneRow: topLeftCellId.rowId,
        otherRow: sort.bottomRight.rowId,
        ...sortBy,
      }
    : {
        kind: 'sortCells',
        cells: areaRefBetween(topLeftCellId, sort.bottomRight),
        ...sortBy,
      };
  let selectAfter = {
    active: {
      rowIndex: area.topRowIndex,
      columnIndex: area.leftColumnIndex,
    },
    corner: {
      rowIndex: area.topRowIndex + area.rowCount - 1,
      columnIndex: area.leftColumnIndex + area.columnCount - 1,
    },
    walked: null,
    isOneCell: false,
    scrollTop: state.scrollTop,
  };
  return queueEdit(state, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: select ?? (movesWholeRows ? selectAfter : area),
    done: {
      what: 'cellsSorted',
      ...firstKey.said,
      headingRowCount: area.rowCount - recordsArea.rowCount,
      ...(select !== undefined && {
        cells: areaToA1AsStored(recordsArea, ownRowOrderOfSheet(workbook, sort.sheetId)),
      }),
      ...(thenByKeys.length > 0 && {
        thenBy: thenByKeys.map(({ said: said }: Dynamic) => said),
      }),
    },
    undoOffer: isWithoutKeyboard
      ? {
          kind: 'sortedWithNoKeyboard',
          ...firstKey.said,
          isSaved: false,
        }
      : null,
  });
}
export function sortByPane(state: PageState, workbook: ReadsWithTextMeasurer, sort?: Dynamic, isWithoutKeyboard?: Dynamic, select?: Dynamic) {
  let recordsArea = recordsAreaOfSort(state, workbook, sort);
  if (recordsArea === null || recordsArea.rowCount < 2) return withNoEffects(state);
  let table = widenToRegionColumns(state, workbook, recordsArea);
  if (table.columnCount === recordsArea.columnCount || sort.movesWholeRows === true)
    return sortCells(state, workbook, sort, isWithoutKeyboard, select);
  return withNoEffects(
    openMenuAtActiveCell(state, workbook, {
      holds: 'cellsToSort',
      cellsToSort: {
        change: 'sortByKeysOfPane',
        selection: areaToA1AsStored(recordsArea, ownRowOrderOfSheet(workbook, sort.sheetId)),
        table: areaToA1AsStored(table, ownRowOrderOfSheet(workbook, sort.sheetId)),
      },
    }),
  );
}
export function sortTableWithKeys(
  state: PageState,
  workbook: ReadsWithTextMeasurer,
  { cells: cells, hasHeaderRow: hasHeaderRow, movesWholeRows: movesWholeRows }: Dynamic,
  keys?: Dynamic,
  isWithoutKeyboard?: Dynamic,
) {
  let sort = sortSpecOfArea(state, workbook, cells, null);
  if (sort === null || keys.length === 0) return withNoEffects(state);
  let keysWithIds = keys.map(
    (input?: Dynamic, options?: Dynamic) => ({
      ...input,
      keyId: options,
    }),
  );
  let sortState = {
    ...sort,
    hasHeaderRow: hasHeaderRow,
    keys: keysWithIds,
    nextKeyId: keysWithIds.length,
  };
  let sortToRun = {
    ...sortState,
    ...(movesWholeRows !== undefined && {
      movesWholeRows: movesWholeRows,
    }),
  };
  let stateWithPane = withSortPane(state, sortToRun);
  let coversAllRecords = recordsAreaOfSort(stateWithPane, workbook, sortToRun)?.rowCount === cells.rowCount - (hasHeaderRow ? 1 : 0);
  if (drawnSortPane(stateWithPane, workbook)?.canSort !== true || !coversAllRecords) return withNoEffects(withSortPane(state, sortState));
  let select = selectionPositionsOf(state, workbook) ?? undefined;
  let outcome = sortByPane(stateWithPane, workbook, sortToRun, isWithoutKeyboard, select);
  return outcome.state.menu !== null
    ? {
        ...outcome,
        state: withSortPane(outcome.state, sortState),
      }
    : {
        ...outcome,
        state: {
          ...outcome.state,
          sidePane: state.sidePane,
        },
      };
}
export function sortChosenCells(state: PageState, workbook: ReadsWithTextMeasurer, chosen?: Dynamic, isWithoutKeyboard?: Dynamic) {
  let sort = sortOfSidePane(state);
  let area = sort === null ? null : areaOfSortCorners(workbook, sort);
  let recordsArea = sort === null ? null : recordsAreaOfSort(state, workbook, sort);
  if (sort === null || area === null || recordsArea === null) return withNoEffects(state);
  if (chosen === 'selection') return sortCells(state, workbook, sort, isWithoutKeyboard);
  let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = widenToRegionColumns(state, workbook, recordsArea);
  let widenedSort = sortSpecOfArea(
    state,
    workbook,
    {
      ...area,
      leftColumnIndex: leftColumnIndex,
      columnCount: columnCount,
    },
    sort,
  );
  return widenedSort === null ? withNoEffects(state) : sortCells(withSortPane(state, widenedSort), workbook, widenedSort, isWithoutKeyboard);
}
export function actInSortPane(state: PageState, workbook: ReadsWithTextMeasurer, action?: Dynamic) {
  let sort = sortOfSidePane(state);
  if (sort === null) return withNoEffects(state);
  let { cellsTyped: cellsTyped, areCellsTypedRefused: areCellsTypedRefused, ...sortWithoutTyped } = sort;
  let withSort = (input?: Dynamic) => withNoEffects(withSortPane(state, input));
  let withKeys = (input?: Dynamic) =>
    withSort({
      ...sort,
      keys: input,
    });
  let changeKey = (keyId?: Dynamic, change?: Dynamic) =>
    withKeys(
      sort.keys.map(
        (input?: Dynamic) =>
          input.keyId === keyId
            ? {
                ...input,
                ...change,
              }
            : input,
      ),
    );
  switch (action.kind) {
    case 'typeCells':
      return withSort({
        ...sortWithoutTyped,
        cellsTyped: action.text,
      });
    case 'dropTypedCells':
      return withSort(sortWithoutTyped);
    case 'useSelection': {
      let value = areaToSortFor(state, workbook, 'range') ?? selectedArea(state, workbook);
      return withSort((value === null ? null : sortSpecOfArea(state, workbook, value, sortWithoutTyped)) ?? sortWithoutTyped);
    }
    case 'enterCells': {
      if (cellsTyped === undefined) return withNoEffects(state);
      if (cellsTyped.trim() === '') return withSort(sortWithoutTyped);
      let value = areaOfTypedCells(state, workbook, cellsTyped);
      let value2 = value === null ? null : sortSpecOfArea(state, workbook, value, sortWithoutTyped);
      return withSort(
        value2 ?? {
          ...sortWithoutTyped,
          cellsTyped: cellsTyped,
          areCellsTypedRefused: true,
        },
      );
    }
    case 'setHeaderRow':
      return withSort({
        ...sort,
        hasHeaderRow: action.isOn,
      });
    case 'setColumn':
      return changeKey(action.keyId, {
        columnId: action.columnId,
      });
    case 'setDirection':
      return changeKey(action.keyId, {
        direction: action.direction,
      });
    case 'addKey': {
      let values = new (Set as Dynamic)(sort.keys.map(({ columnId: columnId }: Dynamic) => columnId));
      let value = drawnSortPane(state, workbook);
      let columnToAdd = value?.columns.find(({ columnId: columnId }: Dynamic) => !values.has(columnId));
      if (columnToAdd === undefined || value?.canAddKey !== true) return withNoEffects(state);
      let state2 = {
        keyId: sort.nextKeyId,
        columnId: columnToAdd.columnId,
        direction: 'ascending',
      };
      return withSort({
        ...sort,
        keys: [...sort.keys, state2],
        nextKeyId: sort.nextKeyId + 1,
      });
    }
    case 'removeKey':
      return sort.keys.length < 2 ? withNoEffects(state) : withKeys(sort.keys.filter(({ keyId: keyId }: Dynamic) => keyId !== action.keyId));
    case 'moveKey': {
      let match = sort.keys.find(({ keyId: keyId }: Dynamic) => keyId === action.keyId);
      if (match === undefined) return withNoEffects(state);
      let matches = sort.keys.filter((input?: Dynamic) => input !== match);
      return withKeys([...matches.slice(0, action.toIndex), match, ...matches.slice(action.toIndex)]);
    }
    case 'sort': {
      let { state: value } = actInSortPane(state, workbook, {
        kind: 'enterCells',
      });
      let value2 = sortOfSidePane(value);
      let value3 = drawnSortPane(value, workbook)?.canSort !== true || value2?.cellsTyped !== undefined;
      return value2 === null || value3 ? withNoEffects(value) : sortByPane(value, workbook, value2, action.isWithNoKeyboard === true);
    }
  }
}
export const sortOfSidePane = ({ sidePane: sidePane }: Dynamic) => (sidePane?.kind === 'sort' ? sidePane.sort : null);
export const withSortPane = (state?: Dynamic, sort?: Dynamic) => ({
  ...state,
  sidePane: {
    kind: 'sort',
    sort: sort,
  },
});
export const valueOrInputOfCell = (workbook: WorkbookReads, cellId?: Dynamic) => {
  let cell = workbook.cellOnShowIn(cellId);
  if (cell === null) return;
  return 'input' in cell ? (cell.value ?? cell.input) : cell.value;
};
export const isColumnInArea = (
  workbook: WorkbookReads,
  sheetId: Dynamic,
  { leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
  columnId?: Dynamic,
) => {
  let columnIndex = workbook.columnIndexOf(sheetId, columnId);
  return columnIndex !== null && columnIndex >= leftColumnIndex && columnIndex < leftColumnIndex + columnCount;
};
export const areSortAreasSame = (one?: Dynamic, other?: Dynamic) =>
  one.topRowIndex === other.topRowIndex &&
  one.leftColumnIndex === other.leftColumnIndex &&
  one.rowCount === other.rowCount &&
  one.columnCount === other.columnCount;
export const sortSpecFor = (state: PageState, workbook: ReadsWithTextMeasurer, holds?: Dynamic, givenArea: Dynamic = null) => {
  let area = givenArea ?? areaToSortFor(state, workbook, holds);
  return area === null ? null : sortSpecOfArea(state, workbook, area, null, holds);
};
export const headingRowCountOfSort = (
  state: PageState,
  workbook: WorkbookReads,
  { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic,
  { hasHeaderRow: hasHeaderRow }: Dynamic,
) => Math.min(rowCount, Math.max(hasHeaderRow ? 1 : 0, sheetOfViewOrEmpty(state, workbook).frozenRowCount - topRowIndex));
export const areaBelowRows = (area?: Dynamic, rowCount?: Dynamic) => ({
  ...area,
  topRowIndex: area.topRowIndex + rowCount,
  rowCount: area.rowCount - rowCount,
});
export const drawnSortPaneCache = new (WeakMap as Dynamic)();
