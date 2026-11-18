import type { Dynamic } from '../dynamic.ts';
import { selectedArea, activeAnchorCell, isSameArea, isSameCell, scrollToShowSelection, selectionAtCell } from '../selection/model.ts';
import { areasOverlap } from '../model/workbook.ts';
import {
  filterTableAtCell,
  isOwnFilterSortable,
  isFilterTableEmpty,
  ownFiltersOfSheet,
  isOwnFilterUnused,
  refreshStaleOwnFilters,
  lookStampOfWorkbook,
  ownFilterAtCell,
  addOwnFilterForTable,
  ownFilterByKey,
  restoreHeldOwnFilter,
  applyOwnFilter,
  heldOwnFilterSnapshot,
  sortOwnFilter,
  drawnOwnFiltersOfSheet,
  columnLabelOfFilterTable,
  saidOfSortColumn,
  recordCountsOfOwnFilter,
} from './own-filters.ts';
import { tablesToOutline } from './tables-in-view.ts';
import { isInSpan, rowPanes, shownRowIndicesInPane } from '../grid/geometry.ts';
import { filterTableForSelection, ownFilterRecordsArea, clearOwnFilters } from './own-filter-actions.ts';
import { areaOfFilteredTable, tablesInSightOf } from './finding.ts';
import { columnHoldsOf } from '../words/table-holds.ts';
import { suggestedAsksOf } from '../words/suggested-asks.ts';
import { tableToSortOfColumns, sortTableOfColumns } from './table-to-sort.ts';
import { keepActiveCellClearOfStuckHeaders } from '../selection/keep-in-view.ts';
import { filterOfEntries, columnsOfFilterItem } from './filter-model.ts';
import { layoutOfView } from '../grid/layout.ts';
import { asLandedHold, newAwaitedHold } from '../format/answer-holds.ts';
import { withNoEffects } from '../state/transitions.ts';
import { sortOwnFilterTableForEveryone } from './own-filter-list.ts';
import { readWordsAsFilter } from '../words/read-filter.ts';
import { columnLetters } from '../model/a1-references.ts';
import { rowsFromWordsPrompt, ROWS_FROM_WORDS_INSTRUCTIONS, readRowsAnswer } from './rows-from-words.ts';
import { cleanTextForAgent } from '../agent/prompt-text.ts';
import { openSortPane } from './sort-pane.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function filterCornerCellsInSelection(state: PageState, workbook: ReadsWithTextMeasurer) {
  let area = selectedArea(state, workbook);
  if (area === null) return [];
  let corners = filterAreasOfSheet(state, workbook)
    .filter((input?: Dynamic) => areasOverlap(input, area))
    .map(
      (input?: Dynamic) => ({
        rowIndex: Math.max(area.topRowIndex, input.topRowIndex),
        columnIndex: Math.max(area.leftColumnIndex, input.leftColumnIndex),
      }),
    );
  corners.sort(
    (input?: Dynamic, options?: Dynamic) =>
      input.rowIndex === options.rowIndex ? input.columnIndex - options.columnIndex : input.rowIndex - options.rowIndex,
  );
  return corners.flatMap(
    ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => workbook.cellIdAt(state.sheetId, rowIndex, columnIndex) ?? [],
  );
}
export function isSortAndFilterOnBar(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (state.rowsAskedFor !== null) return state.rowsAskedFor.isToolOnBar;
  let { shape: shape } = state.selectionSeen;
  if (shape === 'columns') return true;
  if (shape === 'cell' || shape === 'mergedOnly') return false;
  return filterCornerCellsInSelection(state, workbook).length > 0;
}
export function firstShownCellOfArea({ sheetId: sheetId }: Dynamic, workbook: WorkbookReads, area?: Dynamic) {
  let shownArea = workbook.areaOnShowIn(sheetId, area);
  if (shownArea === null) return null;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, columnCount: columnCount } = shownArea;
  let columnIndex = workbook
    .columnIndexesOnShowIn(sheetId, topRowIndex)
    .find((input?: Dynamic) => input >= leftColumnIndex && input < leftColumnIndex + columnCount);
  let cellId = columnIndex === undefined ? null : workbook.cellIdAt(sheetId, topRowIndex, columnIndex);
  return cellId === null
    ? null
    : {
        ...cellId,
        rowIndex: topRowIndex,
      };
}
export function filterTableEndingAbove(workbook: WorkbookReads, cellId?: Dynamic) {
  let position = workbook.positionOfCell(cellId);
  let cellAbove = position === null ? null : workbook.cellIdAt(cellId.sheetId, position.rowIndex - 1, position.columnIndex);
  let filterTable = cellAbove === null ? null : filterTableAtCell(workbook, cellAbove);
  return filterTable?.table.rowUnderTheBody === cellId.rowId ? filterTable : null;
}
export function filterTableAroundCell(state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic) {
  let position = workbook.positionOfCell(cellId);
  let tableOutlined =
    position === null
      ? undefined
      : tablesToOutline(state, workbook).find(
          ({ area: area }: Dynamic) =>
            isInSpan(position.rowIndex, area.topRowIndex, area.rowCount) && isInSpan(position.columnIndex, area.leftColumnIndex, area.columnCount),
        );
  if (tableOutlined === undefined) return filterTableAtCell(workbook, cellId);
  let { sheetId: sheetId } = tableOutlined;
  let { headerRows: headerRows, firstColumn: firstColumn, lastColumn: lastColumn, body: body } = tableOutlined.table;
  let headerCell = [headerRows.firstRow, cellId.rowId, ...body.slice(0, 1).map(({ firstRow: firstRow }: Dynamic) => firstRow)]
    .map(
      (input?: Dynamic) => ({
        sheetId: sheetId,
        rowId: input,
        columnId: firstColumn,
      }),
    )
    .find((input?: Dynamic) => workbook.cellOnShowIn(input) !== null);
  let filterTableOfHeader = headerCell === undefined ? null : filterTableAtCell(workbook, headerCell);
  if (filterTableOfHeader?.table.firstColumn === firstColumn && filterTableOfHeader.table.lastColumn === lastColumn) return filterTableOfHeader;
  return (
    filterTableAtCell(workbook, cellId) ?? (filterTableOfHeader !== null && filterTableOfHeader.cellTableId !== null ? filterTableOfHeader : null)
  );
}
export function guessFilterTableOfSelection(state: PageState, workbook: ReadsWithTextMeasurer) {
  let { shape: shape } = state.selectionSeen;
  if (shape !== 'columns' && shape !== 'rows')
    return filterTableForSelection(state, workbook) ?? filterTableEndingAbove(workbook, activeAnchorCell(state, workbook));
  let unsureFound: Dynamic = null;
  let tryCell = (cellId?: Dynamic) => {
    let filterTable = filterTableAtCell(workbook, cellId) ?? filterTableEndingAbove(workbook, cellId);
    let isUnsure = filterTable !== null && filterTable.columns.length === 1 && !filterTable.table.header.isSure;
    if (isUnsure) unsureFound ??= filterTable;
    return isUnsure ? null : filterTable;
  };
  for (let value of filterCornerCellsInSelection(state, workbook) as Dynamic) {
    let value2 = tryCell(value);
    if (value2 !== null) return value2;
  }
  let area: Dynamic = selectedArea(state, workbook);
  for (let index: Dynamic = 0; area !== null && index < MAX_TABLE_GUESS_STEPS; index += 1) {
    let value = firstShownCellOfArea(state, workbook, area);
    if (value === null) break;
    let value2 = tryCell(value);
    if (value2 !== null) return value2;
    let filterTable = filterTableAtCell(workbook, value);
    let tableArea = filterTable === null ? null : areaOfFilteredTable(workbook, filterTable);
    let nextTopRowIndex = tableArea === null ? value.rowIndex + 1 : tableArea.topRowIndex + tableArea.rowCount;
    let rowsLeft = area.topRowIndex + area.rowCount - nextTopRowIndex;
    area =
      nextTopRowIndex > value.rowIndex && rowsLeft > 0
        ? {
            ...area,
            topRowIndex: nextTopRowIndex,
            rowCount: rowsLeft,
          }
        : null;
  }
  return unsureFound;
}
export function rowCountOfTableRuns(workbook: WorkbookReads, { table: table }: Dynamic) {
  return table.runs
    .map(({ firstRow: firstRow, lastRow: lastRow }: Dynamic) => {
      let firstIndex = workbook.rowIndexOf(table.sheetId, firstRow);
      let lastIndex = workbook.rowIndexOf(table.sheetId, lastRow);
      return firstIndex === null || lastIndex === null ? 0 : lastIndex - firstIndex + 1;
    })
    .reduce((input?: Dynamic, options?: Dynamic) => input + options, 0);
}
export function holdsOfFilterTable(workbook: WorkbookReads, filterTable?: Dynamic, blankRows?: Dynamic) {
  return {
    records: (ownFilterRecordsArea(workbook, filterTable)?.rowCount ?? 0) - blankRows,
    columns: filterTable.columns.map((input?: Dynamic) => columnHoldsOf(workbook, filterTable, input)),
  };
}
export function tableOfRowsAsk(state: PageState, workbook: WorkbookReads, filterTable?: Dynamic, leavesOutCurrent?: Dynamic) {
  let blankRows = rowCountOfTableRuns(workbook, filterTable);
  let holds = holdsOfFilterTable(workbook, filterTable, blankRows);
  let suggested = suggestedAsksOf(holds, state.viewerId);
  let shownSuggested = leavesOutCurrent ? suggestionsBeyondFilter(filterTable.filter, suggested) : suggested;
  let { columnId: activeColumnId } = activeAnchorCell(state, workbook);
  let isActiveColumnInTable =
    filterTable.table.header.isSure && filterTable.columns.some(({ c: c }: Dynamic) => c === activeColumnId);
  return {
    key: filterTable.key,
    holds: holds,
    suggested: shownSuggested,
    columnAtCell: isActiveColumnInTable ? activeColumnId : null,
    sorts: isOwnFilterSortable(workbook, filterTable) ? 'forOneself' : isFilterTableEmpty(filterTable) ? 'forEveryone' : null,
    blankRows: blankRows,
    isRead: holds.records > 0 && holds.columns.every(({ values: values }: Dynamic) => values.length > 0),
  };
}
export function ownFilterOverSelection(state: PageState, workbook: WorkbookReads) {
  let area = selectedArea(state, workbook);
  let overlapping = ownFiltersOfSheet(state, state.sheetId).flatMap((ownFilter?: Dynamic) => {
    let filterArea = areaOfFilteredTable(workbook, ownFilter);
    return area !== null && filterArea !== null && areasOverlap(filterArea, area)
      ? [
          {
            held: ownFilter,
            top: filterArea.topRowIndex,
          },
        ]
      : [];
  });
  overlapping.sort((input?: Dynamic, options?: Dynamic) => input.top - options.top);
  return (overlapping.find(({ held: held }: Dynamic) => !isOwnFilterUnused(held)) ?? overlapping[0])?.held ?? null;
}
export function ownFilterOverlappingTable(state: Dynamic, workbook: WorkbookReads, filterTable?: Dynamic) {
  let area = areaOfFilteredTable(workbook, filterTable);
  if (area === null) return null;
  return (
    ownFiltersOfSheet(state, filterTable.table.sheetId).find((input?: Dynamic) => {
      let value = areaOfFilteredTable(workbook, input);
      return value !== null && areasOverlap(value, area);
    }) ?? null
  );
}
export function openRowsAsk(state: PageState, workbook: ReadsWithTextMeasurer, asked: Dynamic = null) {
  let shownState = refreshStaleOwnFilters(
    {
      ...state,
      ownFilterList: null,
    },
    workbook,
    state.sheetId,
  );
  let rowsAskedFor = {
    table: null,
    placeBefore: rowsAskPlaceOf(shownState),
    placeBeforeAsOf: lookStampOfWorkbook(shownState),
    beforeTry: null,
    placeAfterTry: null,
    isToolOnBar: isSortAndFilterOnBar(
      {
        ...shownState,
        rowsAskedFor: null,
      },
      workbook,
    ),
    isOfFilterBar: false,
    hasTurnedFilterOn: false,
    isFilterNotDrawnYet: false,
    isTableGuessed: false,
    tableUnderLetters: null,
    cameBackFrom: state.ownFilterList?.c ?? null,
    words: '',
    read: null,
    hasStopped: false,
    today: null,
    agent: null,
    askAhead: null,
  };
  let cellAsked =
    typeof asked === 'object' && asked !== null
      ? {
          sheetId: shownState.sheetId,
          rowId: asked.r,
          columnId: asked.c,
        }
      : null;
  let isGuessing = asked === null || asked === GUESS_TABLE_FOR_ROWS_ASK;
  let guessesTable = (cellAsked === null && state.ownFilterList?.isTableGuessed === true) || (isGuessing && isLinesSelection(shownState));
  let columnsTable = guessesTable ? tableToSortOfColumns(shownState, workbook) : null;
  let filterTable =
    cellAsked !== null
      ? (ownFilterAtCell(shownState, workbook, cellAsked) ?? filterTableAroundCell(shownState, workbook, cellAsked))
      : isGuessing
        ? ((columnsTable === null ? null : filterTableAtCell(workbook, columnsTable.at)) ??
          (guessesTable ? ownFilterOverSelection(shownState, workbook) : null) ??
          guessFilterTableOfSelection(shownState, workbook) ??
          ownFilterOverSelection(shownState, workbook))
        : (ownFiltersOfSheet(shownState, shownState.sheetId).find(({ key: key }: Dynamic) => key === asked) ?? null);
  let found = filterTable === null ? null : (ownFilterOverlappingTable(shownState, workbook, filterTable) ?? filterTable);
  if (found === null)
    return {
      ...shownState,
      rowsAskedFor: rowsAskedFor,
    };
  let withFilter =
    'key' in found ? shownState : keepActiveCellClearOfStuckHeaders(state, addOwnFilterForTable(shownState, workbook, found), workbook);
  let ownFilter = ownFiltersOfSheet(withFilter, found.table.sheetId).find(
    (input?: Dynamic) => input === found || input.table === found.table,
  );
  if (ownFilter === undefined)
    return {
      ...shownState,
      rowsAskedFor: rowsAskedFor,
    };
  let ownFilterArea = areaOfFilteredTable(workbook, ownFilter);
  let tableUnderLetters =
    columnsTable !== null && ownFilterArea !== null && isSameArea(ownFilterArea, columnsTable.extent)
      ? {
          table: columnsTable.table,
          columnId: columnsTable.columnId,
        }
      : null;
  let isKeptOnForColumns = withFilter.filterKeptOnForColumnsCard === ownFilter.key;
  let hasTurnedFilterOn = !('key' in found) || isKeptOnForColumns;
  let isFilterNotDrawnYet = isKeptOnForColumns ? state.ownFilterList?.isFilterNotDrawnYet === true : hasTurnedFilterOn && !guessesTable;
  let isOfFilterBar = asked !== null && (isFilterNotDrawnYet || onlyOwnFilterKeyOfSheet(withFilter) === ownFilter.key);
  let table = tableOfRowsAsk(shownState, workbook, ownFilter, isOfFilterBar);
  return {
    ...withFilter,
    filterKeptOnForColumnsCard: isKeptOnForColumns ? null : withFilter.filterKeptOnForColumnsCard,
    rowsAskedFor: {
      ...rowsAskedFor,
      isOfFilterBar: isOfFilterBar,
      hasTurnedFilterOn: hasTurnedFilterOn,
      isFilterNotDrawnYet: isFilterNotDrawnYet,
      isTableGuessed: guessesTable,
      tableUnderLetters: tableUnderLetters,
      placeBefore: rowsAskPlaceOf(withFilter),
      table: table,
    },
  };
}
export function filterBeforeRowsTry({ ownFilters: ownFilters, rowsAskedFor: rowsAskedFor }: Dynamic) {
  if (rowsAskedFor === null || rowsAskedFor.table === null) return null;
  if (rowsAskedFor.beforeTry !== null) return rowsAskedFor.beforeTry.held.filter;
  return (
    ownFilterByKey(
      {
        ownFilters: ownFilters,
      },
      rowsAskedFor.table.key,
    )?.filter ?? null
  );
}
export function mergeFilterConditions(filterBefore?: Dynamic, filter?: Dynamic) {
  let columnsAsked = new (Set as Dynamic)(filter.allOf.map(columnsKeyOfCondition));
  let keptConditions = filterBefore.allOf.filter((input?: Dynamic) => !columnsAsked.has(columnsKeyOfCondition(input)));
  return filterOfEntries([...keptConditions, ...filter.allOf]) ?? filter;
}
export function suggestionsBeyondFilter(filter?: Dynamic, suggested?: Dynamic) {
  let conditions = filter?.allOf ?? [];
  return suggested.flatMap(
    (input?: Dynamic) =>
      input.asked.filter?.allOf.every(
        (input2?: Dynamic) => conditions.some((input3?: Dynamic) => areFilterConditionsSame(input3, input2)),
      ) === true
        ? []
        : [
            {
              ...input,
              records: null,
            },
          ],
  );
}
export function filterToTryForAsk({ filter: filter, sortBy: sortBy }: Dynamic, state: PageState) {
  let filterBefore = filterBeforeRowsTry(state);
  if (filter === null) return sortBy.length > 0 ? filterBefore : null;
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor?.isOfFilterBar !== true || rowsAskedFor.table === null || filterBefore === null) return filter;
  let merged = mergeFilterConditions(filterBefore, filter);
  let filterNow = ownFilterByKey(state, rowsAskedFor.table.key)?.filter ?? null;
  return [filterBefore, filterNow].find((input?: Dynamic) => areFilterConditionsSame(input, merged)) ?? merged;
}
export function restorePlaceBeforeRowsTry(state: PageState, workbook: ReadsWithTextMeasurer, target: Dynamic = state) {
  let { placeBefore: placeBefore, placeAfterTry = null } = state.rowsAskedFor ?? {};
  if (placeBefore === undefined || placeAfterTry === null) return target;
  if (!(workbook.positionOfCell(placeBefore.activeCell) !== null && workbook.positionOfCell(placeBefore.selectionCorner) !== null)) return target;
  if (state.sheetId !== placeBefore.sheetId)
    return {
      ...target,
      placesLeft: target.placesLeft.map((place?: Dynamic, index?: Dynamic) => {
        let placeNow = state.placesLeft[index];
        return placeNow?.sheetId === placeAfterTry.sheetId &&
          isSameCell(placeNow.activeCell, placeAfterTry.activeCell) &&
          isSameCell(placeNow.selectionCorner, placeAfterTry.selectionCorner)
          ? {
              ...place,
              ...placeBefore,
            }
          : place;
      }),
    };
  if (!(isSameRowsAskPlace(rowsAskPlaceOf(state), placeAfterTry) || workbook.positionOfCell(placeAfterTry.activeCell) === null)) return target;
  let isScrollUnchanged = state.scrollTop === placeAfterTry.scrollTop;
  let scrollTop = isScrollUnchanged ? placeBefore.scrollTop : target.scrollTop;
  let restored = {
    ...target,
    ...placeBefore,
    scrollTop: scrollTop,
  };
  return !isScrollUnchanged || state.rowsAskedFor?.placeBeforeAsOf === lookStampOfWorkbook(state)
    ? restored
    : scrollToShowSelection(restored, workbook);
}
export function undoRowsTry(state: PageState, workbook: ReadsWithTextMeasurer) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.table === null) return state;
  if (rowsAskedFor.beforeTry === null && rowsAskedFor.placeAfterTry === null) return state;
  let untried = rowsAskedFor.beforeTry === null ? state : restoreHeldOwnFilter(state, workbook, rowsAskedFor.beforeTry);
  return {
    ...restorePlaceBeforeRowsTry(state, workbook, untried),
    rowsAskedFor: {
      ...rowsAskedFor,
      beforeTry: null,
      placeAfterTry: null,
    },
  };
}
export function scrollToFilterButtonsRow(state: PageState, workbook: ReadsWithTextMeasurer, ownFilter?: Dynamic) {
  let area = areaOfFilteredTable(workbook, ownFilter);
  let activeCellPosition = workbook.positionOfCell(state.activeCell);
  if (area === null || activeCellPosition === null || ownFilter.table.sheetId !== state.sheetId) return state;
  let layout = layoutOfView(state, workbook);
  let isBodyShown = rowPanes(state, layout, state)
    .flatMap((input?: Dynamic) => shownRowIndicesInPane(input, layout))
    .some((input?: Dynamic) => input > area.rowIndexOfButtons && input < area.topRowIndex + area.rowCount);
  let buttonsRowIndex = Math.max(area.rowIndexOfButtons, layout.frozenRowCount);
  let cellAtButtons = workbook.cellIdAt(state.sheetId, buttonsRowIndex, activeCellPosition.columnIndex);
  if (isBodyShown || cellAtButtons === null) return state;
  let { scrollTop: scrollTop } = scrollToShowSelection(
    {
      ...state,
      ...selectionAtCell(cellAtButtons),
    },
    workbook,
  );
  return scrollTop < state.scrollTop
    ? {
        ...state,
        scrollTop: scrollTop,
      }
    : state;
}
export function tryRowsFilter(state: PageState, workbook: ReadsWithTextMeasurer, filter?: Dynamic) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.table === null) return state;
  let ownFilter = ownFilterByKey(state, rowsAskedFor.table.key);
  if (ownFilter === null) return state;
  if (filter === filterBeforeRowsTry(state)) return undoRowsTry(state, workbook);
  if (ownFilter.filter === filter) return state;
  let filtered = applyOwnFilter(restorePlaceBeforeRowsTry(state, workbook), workbook, ownFilter, filter);
  let ownFilterNow = ownFilterByKey(filtered, ownFilter.key);
  if (ownFilterNow === null) return applyOwnFilter(state, workbook, ownFilter, filter);
  if (ownFilterNow.filter !== filter)
    return {
      ...state,
      notice: filtered.notice,
    };
  let scrolled = scrollToFilterButtonsRow(filtered, workbook, ownFilter);
  let beforeTry = rowsAskedFor.beforeTry ?? heldOwnFilterSnapshot(state, ownFilter);
  return {
    ...scrolled,
    rowsAskedFor: {
      ...rowsAskedFor,
      beforeTry: beforeTry,
      placeAfterTry: rowsAskPlaceOf(scrolled),
    },
  };
}
export function tryAskedRows(state: PageState, workbook: ReadsWithTextMeasurer, asked?: Dynamic) {
  let filter = filterToTryForAsk(asked, state);
  let tried = tryRowsFilter(state, workbook, filter);
  let { rowsAskedFor: rowsAskedFor, holdOnRowsFilteredByAgent: hold } = tried;
  if (rowsAskedFor?.agent?.kind !== 'hasRead' || hold?.stands !== 'awaited') return tried;
  let filterOf = (input?: Dynamic) =>
    rowsAskedFor.table === null ? null : (ownFilterByKey(input, rowsAskedFor.table.key)?.filter ?? null);
  if (filterOf(tried) !== filter) return tried;
  let isNewFilter = filter !== filterBeforeRowsTry(state) && filter !== filterOf(state);
  return {
    ...tried,
    holdOnRowsFilteredByAgent: isNewFilter ? asLandedHold(hold) : null,
  };
}
export function areaFromButtonsRow(area?: Dynamic) {
  let rowIndexOfButtons = area.rowIndexOfButtons;
  return {
    ...area,
    topRowIndex: rowIndexOfButtons,
    rowCount: area.topRowIndex + area.rowCount - rowIndexOfButtons,
  };
}
export function ownFilterAreaFromButtons(workbook: WorkbookReads, ownFilter?: Dynamic) {
  let area = areaOfFilteredTable(workbook, ownFilter);
  return area === null ? null : areaFromButtonsRow(area);
}
export function takeRowsAsk(
  state: PageState,
  workbook: ReadsWithTextMeasurer,
  table?: Dynamic,
  asked?: Dynamic,
  isWithoutKeyboard?: Dynamic,
  canSort?: Dynamic,
) {
  let ownFilter = ownFilterByKey(refreshStaleOwnFilters(state, workbook, state.sheetId), table.key);
  let isColumnInFilter = (input?: Dynamic) => ownFilter?.columns.some((input2?: Dynamic) => input2.c === input) === true;
  if (
    ![
      ...(asked.filter?.allOf ?? []).flatMap(({ anyOf: anyOf }: Dynamic) => anyOf.flatMap(columnsOfFilterItem)),
      ...asked.sortBy.map(({ c: c }: Dynamic) => c),
    ].every(isColumnInFilter)
  ) {
    let { words: value = '', today: value2 = null } = state.rowsAskedFor ?? {};
    let tableKey = state.rowsAskedFor?.isOfFilterBar === true ? table.key : null;
    let reopened = openRowsAsk(undoRowsTry(state, workbook), workbook, tableKey);
    let hasTurnedFilterOn = state.rowsAskedFor?.hasTurnedFilterOn === true;
    let isFilterNotDrawnYet = state.rowsAskedFor?.isFilterNotDrawnYet === true;
    let isTableGuessed = state.rowsAskedFor?.isTableGuessed === true;
    let isOfFilterBar = (isFilterNotDrawnYet && tableKey !== null) || reopened.rowsAskedFor?.isOfFilterBar === true;
    let reopenedState =
      reopened.rowsAskedFor === null
        ? reopened
        : {
            ...reopened,
            rowsAskedFor: {
              ...reopened.rowsAskedFor,
              isOfFilterBar: isOfFilterBar,
              hasTurnedFilterOn: hasTurnedFilterOn,
              isFilterNotDrawnYet: isFilterNotDrawnYet,
              isTableGuessed: isTableGuessed,
            },
          };
    return value2 === null
      ? withNoEffects(reopenedState)
      : actOnRowsAsk(
          reopenedState,
          workbook,
          {
            kind: 'type',
            words: value,
            today: value2,
          },
          canSort,
        );
  }
  let filter = filterToTryForAsk(asked, state);
  let tried = tryRowsFilter(state, workbook, filter);
  if (ownFilterByKey(tried, table.key)?.filter !== filter) return withNoEffects(tried);
  let shownState = refreshStaleOwnFilters(tried, workbook, tried.sheetId);
  let ownFilterNow = ownFilterByKey(shownState, table.key);
  let closedState = {
    ...shownState,
    contextBarMenu: null,
    rowsAskedFor: null,
  };
  let [firstSort, ...otherSorts] = asked.sortBy;
  if (firstSort !== undefined && ownFilterNow !== null && table.sorts === 'forOneself' && isFilterTableEmpty(ownFilterNow))
    return withNoEffects(sortOwnFilter(closedState, workbook, ownFilterNow, [firstSort, ...otherSorts]));
  let stateAfter = shouldTurnFilterBackOff(state.rowsAskedFor, ownFilterNow)
    ? clearOwnFilters(closedState, workbook, {
        tableKey: table.key,
      })
    : closedState;
  if (firstSort === undefined || ownFilterNow === null) return withNoEffects(stateAfter);
  if (!isFilterTableEmpty(ownFilterNow)) return withNoEffects(tried);
  let tableUnderLetters = state.rowsAskedFor?.tableUnderLetters ?? null;
  if (tableUnderLetters === null) return sortOwnFilterTableForEveryone(stateAfter, workbook, ownFilterNow, asked.sortBy, isWithoutKeyboard);
  let keys = asked.sortBy.map(
    ({ c: c, direction: direction }: Dynamic) => ({
      columnId: c,
      direction: direction,
    }),
  );
  return sortTableOfColumns(stateAfter, workbook, tableUnderLetters, keys, isWithoutKeyboard);
}
export function reuseHeldFilter(read?: Dynamic, filters?: Dynamic) {
  if (read.kind !== 'read') return read;
  let filterText = JSON.stringify(read.asked.filter);
  let sameFilter = filters.find((input?: Dynamic) => JSON.stringify(input) === filterText);
  return sameFilter === undefined
    ? read
    : {
        ...read,
        asked: {
          ...read.asked,
          filter: sameFilter,
        },
      };
}
export function readRowsAskWords(state: PageState, workbook: WorkbookReads, table?: Dynamic, words?: Dynamic, today2?: Dynamic) {
  let read = readWordsAsFilter(words, table.holds, state.viewerId, {
    today: today2,
    signsOfNumbers: workbook.signsOfNumbers,
    isMonthFirst: workbook.locale === 'en-US',
  });
  let ownFilter = ownFilterByKey(state, table.key);
  return reuseHeldFilter(read, [filterBeforeRowsTry(state), ownFilter?.filter ?? null]);
}
export function rowsAskToTake({ read: read, table: table }: Dynamic, canSort?: Dynamic) {
  if (read?.kind !== 'read' || table === null) return null;
  let { filter: filter, sortBy: sortBy } = read.asked;
  if (sortBy.length === 0 || canSortRowsAskTable(table, canSort))
    return {
      asked: read.asked,
      isSortLeftOut: false,
    };
  return filter === null
    ? null
    : {
        asked: {
          filter: filter,
          sortBy: [],
        },
        isSortLeftOut: true,
      };
}
export function doesRowsActionSort({ rowsAskedFor: rowsAskedFor }: Dynamic, action?: Dynamic, canSort?: Dynamic) {
  if (action.kind === 'take') return action.asked.sortBy.length > 0;
  if (action.kind !== 'takeAnswer' || rowsAskedFor === null) return false;
  return (rowsAskToTake(rowsAskedFor, canSort)?.asked.sortBy.length ?? 0) > 0;
}
export function rowsAskPromptInput(state: Dynamic, workbook: WorkbookReads, { table: table, today: today2 }: Dynamic) {
  let ownFilter = ownFilterByKey(state, table.key);
  return [
    {
      columns: table.holds.columns.flatMap((column?: Dynamic) => {
        let columnIndex = ownFilter === null ? null : workbook.columnIndexOf(ownFilter.table.sheetId, column.c);
        return columnIndex === null
          ? []
          : [
              {
                letters: columnLetters(columnIndex),
                holds: column,
              },
            ];
      }),
      records: table.holds.records,
    },
    {
      today: today2,
      decimalSign: workbook.decimalSign,
      isMonthFirst: workbook.locale === 'en-US',
    },
  ];
}
export function askAgentAheadWhichRows(state: PageState, workbook: WorkbookReads) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.table === null || rowsAskedFor.today === null) return withNoEffects(state);
  if (rowsAskedFor.askAhead !== null || state.whyAgentIsAskedWhichRowsOnlyAtEnter !== null) return withNoEffects(state);
  let { table: table, today: today2 } = rowsAskedFor;
  let [tableHolds, options] = rowsAskPromptInput(state, workbook, {
    table: table,
    today: today2,
  });
  if (tableHolds.columns.length === 0 || rowsFromWordsPrompt(rowsAskedFor.words, tableHolds, options) === null)
    return withNoEffects({
      ...state,
      rowsAskedFor: {
        ...rowsAskedFor,
        askAhead: 'isHeldBack',
      },
    });
  let askId = state.rowsAskedForAskCount + 1;
  return {
    state: {
      ...state,
      rowsAskedForAskCount: askId,
      rowsAskedFor: {
        ...rowsAskedFor,
        askAhead: askId,
      },
    },
    effects: [
      {
        kind: 'askAgentAheadWhichRowsAreAskedFor',
        askId: askId,
        words: ROWS_FROM_WORDS_INSTRUCTIONS,
      },
    ],
  };
}
export function holdBackRowsAskAhead(state: PageState) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.askAhead === null || rowsAskedFor.askAhead === 'isHeldBack') return state;
  let askAhead = rowsAskedFor.askAhead === 'hasFailed' ? null : 'isHeldBack';
  return {
    ...state,
    rowsAskedFor: {
      ...rowsAskedFor,
      askAhead: askAhead,
    },
  };
}
export function askAgentWhichRows(state: PageState, workbook: WorkbookReads, isAtEnter?: Dynamic) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.table === null || rowsAskedFor.today === null) return withNoEffects(state);
  if (!(rowsAskedFor.agent === null || (isAtEnter && rowsAskedFor.agent.kind === 'hasFailed'))) return withNoEffects(state);
  let withAgent = (agent?: Dynamic, askAhead: Dynamic = null) => ({
    ...state,
    rowsAskedFor: {
      ...rowsAskedFor,
      agent: agent,
      askAhead: askAhead,
    },
  });
  let whyOnlyAtEnter = isAtEnter ? null : state.whyAgentIsAskedWhichRowsOnlyAtEnter;
  if (whyOnlyAtEnter === 'notToBeHad') return withNoEffects(state);
  if (whyOnlyAtEnter === 'rateLimited' || (!isAtEnter && rowsAskedFor.askAhead === 'hasFailed'))
    return withNoEffects(
      withAgent({
        kind: 'hasFailed',
        askId: state.rowsAskedForAskCount,
        isRateLimited: whyOnlyAtEnter === 'rateLimited',
      }),
    );
  let { table: table, today: today2, askAhead: askAhead } = rowsAskedFor;
  let [tableHolds, options] = rowsAskPromptInput(state, workbook, {
    table: table,
    today: today2,
  });
  let { columns: columns } = tableHolds;
  let asked = rowsFromWordsPrompt(rowsAskedFor.words, tableHolds, options);
  if (asked === null || columns.length === 0)
    return withNoEffects(
      withAgent(
        {
          kind: 'hasNotRead',
        },
        'isHeldBack',
      ),
    );
  let askedState = (askId?: Dynamic) => ({
    ...withAgent({
      kind: 'isAsked',
      askId: askId,
      columns: columns,
    }),
    holdOnRowsFilteredByAgent: newAwaitedHold(askId),
  });
  if (typeof askAhead === 'number') {
    let rest = {
      typed: cleanTextForAgent(rowsAskedFor.words),
      data: asked.data,
    };
    return {
      state: askedState(askAhead),
      effects: [
        {
          kind: 'tellAgentWhichRowsAreAskedFor',
          askId: askAhead,
          rest: rest,
        },
      ],
    };
  }
  let askId = state.rowsAskedForAskCount + 1;
  return {
    state: {
      ...askedState(askId),
      rowsAskedForAskCount: askId,
    },
    effects: [
      {
        kind: 'askAgentWhichRowsAreAskedFor',
        askId: askId,
        asked: asked,
        isAtEnter: isAtEnter,
      },
    ],
  };
}
export function askIdOfRowsAgentCall({ rowsAskedFor: rowsAskedFor }: Dynamic) {
  if (rowsAskedFor?.agent?.kind === 'isAsked') return rowsAskedFor.agent.askId;
  return typeof rowsAskedFor?.askAhead === 'number' ? rowsAskedFor.askAhead : null;
}
export function takeAgentRowsAnswer(state: PageState, workbook: ReadsWithTextMeasurer, askId?: Dynamic, outcome?: Dynamic) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.table === null || rowsAskedFor.today === null) return state;
  let isRateLimited = outcome.kind === 'failed' && outcome.isRateLimited === true;
  if (rowsAskedFor.askAhead === askId) {
    let whyNot = outcome.kind === 'notToBeHad' ? outcome.kind : isRateLimited ? 'rateLimited' : null;
    let isHeldBack = outcome.kind === 'isYetToBeAllowed' || outcome.kind === 'stopped';
    return {
      ...state,
      whyAgentIsAskedWhichRowsOnlyAtEnter: whyNot,
      rowsAskedFor: {
        ...rowsAskedFor,
        askAhead: whyNot !== null ? null : isHeldBack ? 'isHeldBack' : 'hasFailed',
      },
    };
  }
  if (rowsAskedFor.agent?.kind !== 'isAsked' || rowsAskedFor.agent.askId !== askId) return state;
  let withAgent = (agent?: Dynamic, { read: read2 = rowsAskedFor.read, whyNot = null }: Dynamic = {}) => ({
    ...state,
    whyAgentIsAskedWhichRowsOnlyAtEnter: whyNot,
    rowsAskedFor: {
      ...rowsAskedFor,
      agent: agent,
      read: read2,
    },
  });
  if (outcome.kind === 'isYetToBeAllowed') return withAgent(null);
  if (outcome.kind === 'notToBeHad')
    return withAgent(
      {
        kind: 'hasNotRead',
      },
      {
        whyNot: 'notToBeHad',
      },
    );
  if (outcome.kind !== 'answered')
    return withAgent(
      {
        kind: 'hasFailed',
        askId: askId,
        isRateLimited: isRateLimited,
      },
      {
        whyNot: isRateLimited ? 'rateLimited' : null,
      },
    );
  let asked = readRowsAnswer(outcome.answer, {
    columns: rowsAskedFor.agent.columns,
    viewer: state.viewerId,
    today: rowsAskedFor.today,
    limits: workbook.limitsOfConditionalFormats(),
  });
  if (asked === null)
    return withAgent({
      kind: 'hasNotRead',
    });
  let ownFilter = ownFilterByKey(state, rowsAskedFor.table.key);
  let read = reuseHeldFilter(
    {
      kind: 'read',
      asked: asked,
    },
    [filterBeforeRowsTry(state), ownFilter?.filter ?? null],
  );
  let hasTried = rowsAskedFor.beforeTry !== null;
  let answeredState = withAgent(
    {
      kind: 'hasRead',
      askId: askId,
    },
    {
      read: read,
    },
  );
  return read.kind !== 'read' || hasTried ? answeredState : tryAskedRows(answeredState, workbook, read.asked);
}
export function actOnRowsAsk(state: PageState, workbook: ReadsWithTextMeasurer, action?: Dynamic, canSort?: Dynamic) {
  let outcome = reduceRowsAsk(state, workbook, action, canSort);
  return askIdOfRowsAgentCall(state) !== null && askIdOfRowsAgentCall(outcome.state) === null
    ? {
        ...outcome,
        effects: [
          ...outcome.effects,
          {
            kind: 'stopAskingAgentWhichRowsAreAskedFor',
          },
        ],
      }
    : outcome;
}
export function reduceRowsAsk(state: PageState, workbook: ReadsWithTextMeasurer, action?: Dynamic, canSort?: Dynamic, isAtEnter: Dynamic = false) {
  let rowsAskedFor = state.rowsAskedFor;
  if (action.kind === 'giveUp') {
    let value = state.contextBarMenu === 'sort' ? null : state.contextBarMenu;
    let state2 = {
      ...undoRowsTry(state, workbook),
      contextBarMenu: value,
      rowsAskedFor: null,
    };
    let value2 = rowsAskedFor?.table?.key;
    let value3 =
      action.leavesFilterOn !== true && value2 !== undefined && shouldTurnFilterBackOff(rowsAskedFor, ownFilterByKey(state2, value2));
    return withNoEffects(
      value3
        ? clearOwnFilters(state2, workbook, {
            tableKey: value2,
          })
        : state2,
    );
  }
  if (action.kind === 'customSort') {
    let value = rowsAskedFor?.isOfFilterBar === true && rowsAskedFor.table !== null ? ownFilterByKey(state, rowsAskedFor.table.key) : null;
    let value2 = value === null ? null : ownFilterAreaFromButtons(workbook, value);
    let state2 = reduceRowsAsk(
      state,
      workbook,
      {
        kind: 'giveUp',
      },
      canSort,
    ).state;
    return withNoEffects(openSortPane(state2, workbook, action.of, value2));
  }
  if (rowsAskedFor === null || rowsAskedFor.table === null) return withNoEffects(state);
  switch (action.kind) {
    case 'type': {
      if (action.words === rowsAskedFor.words && action.today === rowsAskedFor.today) return withNoEffects(state);
      let value = ownFilterByKey(state, rowsAskedFor.table.key);
      let value2 =
        !rowsAskedFor.table.isRead && rowsAskedFor.words === '' && value !== null
          ? tableOfRowsAsk(state, workbook, value, rowsAskedFor.isOfFilterBar)
          : rowsAskedFor.table;
      let value3 = action.words.trim() === '' ? null : readRowsAskWords(state, workbook, value2, action.words, action.today);
      let { words: words, today: today2 } = action;
      let typedState = {
        ...state,
        rowsAskedFor: {
          ...rowsAskedFor,
          table: value2,
          words: words,
          today: today2,
          read: value3,
          hasStopped: false,
          agent: null,
        },
      };
      if (value3?.kind === 'read') return withNoEffects(tryRowsFilter(typedState, workbook, filterToTryForAsk(value3.asked, typedState)));
      let shownState =
        value3?.isOnItsWay === true && action.words.startsWith(rowsAskedFor.words) ? typedState : undoRowsTry(typedState, workbook);
      return value3?.kind === 'notRead' && value3.wordsNotPlaced.length > 0 && !value3.isOnItsWay
        ? askAgentAheadWhichRows(shownState, workbook)
        : withNoEffects(shownState);
    }
    case 'rest': {
      if (rowsAskedFor.read?.kind !== 'notRead') return withNoEffects(holdBackRowsAskAhead(state));
      let state2 = {
        ...state,
        rowsAskedFor: {
          ...rowsAskedFor,
          hasStopped: true,
        },
      };
      let value =
        rowsAskedFor.today === null ? null : readRowsAskWords(state, workbook, rowsAskedFor.table, `${rowsAskedFor.words} `, rowsAskedFor.today);
      if (action.isRowPointedAt && value?.kind === 'read') return withNoEffects(holdBackRowsAskAhead(state2));
      if (value?.kind !== 'read') {
        let value2 = action.isRowPointedAt ? state2 : undoRowsTry(state2, workbook);
        return action.isColumnFound === true ? withNoEffects(holdBackRowsAskAhead(value2)) : askAgentWhichRows(value2, workbook, isAtEnter);
      }
      let state3 = holdBackRowsAskAhead({
        ...state,
        rowsAskedFor: {
          ...rowsAskedFor,
          read: value,
        },
      });
      return withNoEffects(tryRowsFilter(state3, workbook, filterToTryForAsk(value.asked, state3)));
    }
    case 'pointAt': {
      if (action.asked !== null) return withNoEffects(tryRowsFilter(state, workbook, filterToTryForAsk(action.asked, state)));
      return withNoEffects(
        rowsAskedFor.read?.kind === 'read' ? tryAskedRows(state, workbook, rowsAskedFor.read.asked) : undoRowsTry(state, workbook),
      );
    }
    case 'take':
      return takeRowsAsk(state, workbook, rowsAskedFor.table, action.asked, action.isWithNoKeyboard === true, canSort);
    case 'takeAnswer': {
      let value = rowsAskedFor.agent?.kind === 'hasRead' || rowsAskedFor.agent?.kind === 'hasFailed' ? rowsAskedFor.agent : null;
      if (value !== null && action.askOnShow !== value.askId) return withNoEffects(state);
      if (value?.kind === 'hasFailed') return askAgentWhichRows(state, workbook, true);
      let value2 = reduceRowsAsk(
        state,
        workbook,
        {
          kind: 'rest',
          isRowPointedAt: false,
        },
        canSort,
        true,
      );
      if (value2.state.rowsAskedFor?.agent !== rowsAskedFor.agent) return value2;
      let state2 = value2.state;
      let value3 = state2.rowsAskedFor === null ? null : rowsAskToTake(state2.rowsAskedFor, canSort);
      let isReadAgain = state2.rowsAskedFor?.read !== rowsAskedFor.read;
      if (value3 === null || (isReadAgain && value3.asked.sortBy.length > 0)) {
        let askAhead = state2.rowsAskedFor?.askAhead ?? null;
        return withNoEffects({
          ...state,
          rowsAskedFor: {
            ...rowsAskedFor,
            hasStopped: true,
            askAhead: askAhead,
          },
        });
      }
      return takeRowsAsk(state2, workbook, rowsAskedFor.table, value3.asked, action.isWithNoKeyboard === true, canSort);
    }
  }
}
export function dropUnneededAgentRowsHold(state: PageState) {
  let { rowsAskedFor: rowsAskedFor, holdOnRowsFilteredByAgent: hold } = state;
  if (hold === null) return state;
  let agent = rowsAskedFor?.agent ?? null;
  let isAgentAtWork = agent?.kind === 'isAsked' || agent?.kind === 'hasRead';
  let isLandedAndHeld = rowsAskedFor === null && hold.stands === 'landed' && hold.actsHeld > 0;
  return isAgentAtWork || isLandedAndHeld
    ? state
    : {
        ...state,
        holdOnRowsFilteredByAgent: null,
      };
}
export function settlePlaceAfterRowsTry(before: Dynamic, state: PageState, dropsPlaceAfterTry?: Dynamic) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null || rowsAskedFor.placeAfterTry === null) return state;
  if (dropsPlaceAfterTry)
    return {
      ...state,
      rowsAskedFor: {
        ...rowsAskedFor,
        placeAfterTry: null,
      },
    };
  return rowsAskedFor.placeAfterTry !== (before.rowsAskedFor?.placeAfterTry ?? null)
    ? {
        ...state,
        rowsAskedFor: {
          ...rowsAskedFor,
          placeAfterTry: rowsAskPlaceOf(state),
        },
      }
    : state;
}
export function shouldEndRowsAsk(state: PageState) {
  let rowsAskedFor = state.rowsAskedFor;
  if (rowsAskedFor === null) return false;
  let isTableGone = rowsAskedFor.table !== null && ownFilterByKey(state, rowsAskedFor.table.key) === null;
  return state.contextBarMenu !== 'sort' || isTableGone;
}
export function onlyOwnFilterKeyOfSheet(state: PageState) {
  let [onlyFilter, ...otherFilters] = drawnOwnFiltersOfSheet(state, state.sheetId);
  return onlyFilter === undefined || otherFilters.length > 0 ? null : onlyFilter.key;
}
export function drawnRowsAsk(state: PageState, workbook: WorkbookReads, canSort?: Dynamic) {
  let rowsAskedFor = state.contextBarMenu === 'sort' ? state.rowsAskedFor : null;
  if (rowsAskedFor === null) return null;
  let ownFilter = rowsAskedFor.table === null ? null : ownFilterByKey(state, rowsAskedFor.table.key);
  let { isOfFilterBar: isOfFilterBar, isFilterNotDrawnYet: isFilterNotDrawnYet } = rowsAskedFor;
  if (rowsAskedFor.table === null || ownFilter === null)
    return {
      isOfFilterBar: isOfFilterBar,
      isFilterNotDrawnYet: isFilterNotDrawnYet,
      hasTable: false,
      ...DRAWN_ROWS_ASK_WITHOUT_TABLE,
    };
  let { table: table, read: read } = rowsAskedFor;
  let filterBefore = filterBeforeRowsTry(state);
  let columnsAsked = new (Set as Dynamic)(
    (filterBefore?.allOf ?? []).flatMap(({ anyOf: anyOf }: Dynamic) => anyOf.flatMap(columnsOfFilterItem)),
  );
  let canSortHere = canSortRowsAskTable(table, canSort);
  let usesColumnAtCell = canSortHere && !rowsAskedFor.isTableGuessed;
  let columnUnderLetters = canSortHere ? (rowsAskedFor.tableUnderLetters?.columnId ?? null) : null;
  let sortColumn = usesColumnAtCell
    ? table.columnAtCell
    : ownFilter.columns.some((input?: Dynamic) => input.c === columnUnderLetters)
      ? columnUnderLetters
      : null;
  let toTake = rowsAskToTake(rowsAskedFor, canSort);
  let isTaken = toTake !== null && ownFilter.filter === filterToTryForAsk(toTake.asked, state);
  let isSortLeftOut = read?.kind === 'read' && read.asked.sortBy.length > 0 && !canSortHere;
  let isAgentAsked = rowsAskedFor.agent?.kind === 'isAsked';
  let hasAgentFailed = rowsAskedFor.agent?.kind === 'hasFailed';
  let areWordsNotRead = read?.kind === 'notRead' && rowsAskedFor.hasStopped && !isAgentAsked && !hasAgentFailed;
  return {
    isOfFilterBar: isOfFilterBar,
    isFilterNotDrawnYet: isFilterNotDrawnYet,
    isFilterTried: rowsAskedFor.beforeTry !== null,
    tableKey: ownFilter.key,
    columnCameBackFrom: rowsAskedFor.cameBackFrom,
    columns: !isOfFilterBar
      ? []
      : ownFilter.columns.map(
          (input?: Dynamic) => ({
            c: input.c,
            column: columnLabelOfFilterTable(workbook, ownFilter, input.c),
            isAsked: columnsAsked.has(input.c),
          }),
        ),
    hasTable: true,
    areSortsForOneself: table.sorts === 'forOneself',
    sortsOfColumn:
      sortColumn === null
        ? []
        : SORT_DIRECTIONS.map((input?: Dynamic) => {
            let { column: value, holds: value2 } = saidOfSortColumn(workbook, ownFilter, {
              c: sortColumn,
              direction: input,
            });
            return {
              column: value,
              direction: input,
              holds: value2,
              asked: {
                filter: null,
                sortBy: [
                  {
                    c: sortColumn,
                    direction: input,
                  },
                ],
              },
            };
          }),
    suggested: (usesColumnAtCell ? table.suggested : suggestionsWithoutSort(table.suggested)).filter(
      (input?: Dynamic) => input.asked.filter !== null || input.asked.sortBy[0]?.c !== sortColumn,
    ),
    answer: !isTaken
      ? null
      : {
          asked: toTake.asked,
          lines: toTake.asked.filter === null ? [] : isOfFilterBar ? ownFilter.lines.slice(-toTake.asked.filter.allOf.length) : ownFilter.lines,
          sortBy: toTake.asked.sortBy.map((input?: Dynamic) => saidOfSortColumn(workbook, ownFilter, input)),
          records: recordCountsOfOwnFilter(state, workbook, ownFilter)?.inView ?? null,
        },
    sortLeftOutBecause: !isSortLeftOut
      ? null
      : canSort || table.sorts === null
        ? {
            blankRows: table.blankRows,
          }
        : 'cannotEdit',
    isAgentAsked: isAgentAsked,
    askThatAnswered: hasAgentFailed || (rowsAskedFor.agent?.kind === 'hasRead' && isTaken) ? rowsAskedFor.agent.askId : null,
    callToAgent: !hasAgentFailed ? null : rowsAskedFor.agent.isRateLimited ? 'rateLimited' : 'failed',
    areWordsNotRead: areWordsNotRead,
    wordsNotKnown: areWordsNotRead ? read.wordsNotKnown : [],
  };
}
export function ownFiltersBeforeRowsTry({ ownFilters: ownFilters, rowsAskedFor: rowsAskedFor }: Dynamic) {
  let beforeTry = rowsAskedFor?.beforeTry ?? null;
  if (beforeTry === null) return ownFilters;
  let { key: heldKey, filter: heldFilter } = beforeTry.held;
  let cached = ownFiltersKeptCache.get(beforeTry);
  if (cached?.of === ownFilters) return cached.kept;
  let kept = new (Map as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      ownFilters,
      ([input, input2]: Dynamic) => [
        input,
        input2.map((input3?: Dynamic) => (input3.key === heldKey ? ownFilterWithFilter(input3, heldFilter) : input3)),
      ],
    ),
  );
  ownFiltersKeptCache.set(beforeTry, {
    of: ownFilters,
    kept: kept,
  });
  return kept;
}
export const GUESS_TABLE_FOR_ROWS_ASK = '';
export const rowsAskPlaceOf = ({
  sheetId: sheetId,
  activeCell: activeCell,
  selectionCorner: selectionCorner,
  otherRanges: otherRanges,
  rangeWalked: rangeWalked,
  scrollTop: scrollTop,
}: Dynamic) => ({
  sheetId: sheetId,
  activeCell: activeCell,
  selectionCorner: selectionCorner,
  otherRanges: otherRanges,
  rangeWalked: rangeWalked,
  scrollTop: scrollTop,
});
export const isSameRowsAskPlace = (place?: Dynamic, otherPlace?: Dynamic) =>
  place.sheetId === otherPlace.sheetId &&
  isSameCell(place.activeCell, otherPlace.activeCell) &&
  isSameCell(place.selectionCorner, otherPlace.selectionCorner) &&
  place.otherRanges === otherPlace.otherRanges;
export const filterAreasOfSheet = (state: PageState, workbook: ReadsWithTextMeasurer) => [
  ...ownFiltersOfSheet(state, state.sheetId).flatMap((input?: Dynamic) => areaOfFilteredTable(workbook, input) ?? []),
  ...tablesInSightOf(state, workbook).map(({ area: area }: Dynamic) => area),
];
export const MAX_TABLE_GUESS_STEPS = 5;
export const suggestionsWithoutSort = (suggested?: Dynamic) =>
  suggested.filter(({ asked: asked }: Dynamic) => asked.sortBy.length === 0);
export const isLinesSelection = ({ selectionSeen: { shape: shape } }: Dynamic) => shape === 'columns' || shape === 'rows';
export const areFilterConditionsSame = (one?: Dynamic, other?: Dynamic) => JSON.stringify(one) === JSON.stringify(other);
export const columnsKeyOfCondition = ({ anyOf: anyOf }: Dynamic) =>
  [...new (Set as Dynamic)(anyOf.flatMap(columnsOfFilterItem))].toSorted().join(' ');
export const canSortRowsAskTable = ({ sorts: sorts }: Dynamic, canSort?: Dynamic) =>
  sorts === 'forOneself' || (sorts === 'forEveryone' && canSort);
export const isRowsAskOfFilterBar = ({ isOfFilterBar: isOfFilterBar, isFilterNotDrawnYet: isFilterNotDrawnYet }: Dynamic) =>
  isOfFilterBar || isFilterNotDrawnYet;
export const shouldTurnFilterBackOff = (rowsAskedFor?: Dynamic, ownFilter?: Dynamic) =>
  rowsAskedFor?.hasTurnedFilterOn === true && isRowsAskOfFilterBar(rowsAskedFor) && (ownFilter === null || isOwnFilterUnused(ownFilter));
export const tableKeyOfFilterBarTurnedOn = ({ rowsAskedFor: rowsAskedFor }: Dynamic) =>
  rowsAskedFor?.hasTurnedFilterOn === true && isRowsAskOfFilterBar(rowsAskedFor) ? (rowsAskedFor.table?.key ?? null) : null;
export const isOwnFilterHeldForTry = ({ rowsAskedFor: rowsAskedFor }: Dynamic, key?: Dynamic) =>
  rowsAskedFor?.beforeTry?.held.key === key;
export const hasRowsAskEndedWhereBegun = (before: Dynamic, state: PageState) =>
  before.rowsAskedFor !== null && state.rowsAskedFor === null && isSameRowsAskPlace(rowsAskPlaceOf(state), before.rowsAskedFor.placeBefore);
export const SORT_DIRECTIONS = ['ascending', 'descending'];
export const DRAWN_ROWS_ASK_WITHOUT_TABLE = {
  isFilterTried: false,
  tableKey: null,
  columnCameBackFrom: null,
  columns: [],
  areSortsForOneself: false,
  sortsOfColumn: [],
  suggested: [],
  answer: null,
  sortLeftOutBecause: null,
  isAgentAsked: false,
  askThatAnswered: null,
  callToAgent: null,
  areWordsNotRead: false,
  wordsNotKnown: [],
};
export const ownFilterWithFilter = (rowsAskedFor?: Dynamic, filter?: Dynamic) => ({
  ...rowsAskedFor,
  filter: filter,
});
export const ownFiltersKeptCache = new (WeakMap as Dynamic)();
