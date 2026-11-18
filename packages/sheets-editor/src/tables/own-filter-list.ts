import type { Dynamic } from '../dynamic.ts';
import { clampBetween, rowRunSpanOnScreen, isInSpan } from '../grid/geometry.ts';
import {
  ownFilterByKey,
  isFilterTableEmpty,
  refreshStaleOwnFilters,
  sortOwnFilter,
  filterOnKnownColumns,
  isOwnFilterKeyUnused,
  isOwnFilterSortable,
  applyOwnFilter,
  recordCountsOfOwnFilter,
  columnLabelOfFilterTable,
} from './own-filters.ts';
import { layoutOfView } from '../grid/layout.ts';
import { filterButtonRowIndex, columnSpanOfIdFinder, stuckHeaderAt, rowSpanInStuckHeader, tablesWithFilterButtons } from './table-drawing.ts';
import { stuckHeadersOfView } from '../grid/sticky-headers.ts';
import { ROW_HEADER_WIDTH } from '../grid/cell-metrics-values.ts';
import { COLUMN_HEADER_HEIGHT } from '../grid/cell-metrics.ts';
import { mergedAreaOrCellOf, selectionOfArea, selectionAtCell, isSameArea } from '../selection/model.ts';
import { areaOfFilteredTable } from './finding.ts';
import { ownFilterRecordsArea, filterValueOfCell, clearOwnFilters, removeOwnFilterLine } from './own-filter-actions.ts';
import { shownPiecesOfArea } from './filtered-rows.ts';
import { rangeSortArea, rangeSortWideningChoice, sortRange, sortHoldsOfColumn } from './sort.ts';
import { withNoEffects, sortColumnOfMenu, clearPassingNotice } from '../state/transitions.ts';
import { recordsSortableAsCells } from './table-to-sort.ts';
import { sortMovesWholeRows, sortTableWithKeys, sortOfSidePane } from './sort-pane.ts';
import { openMenuWith } from '../ui/menu.ts';
import { readsAsStored } from '../model/workbook.ts';
import { withDecimalSign } from '../format/number-signs.ts';
import { isShownCheckboxCell } from '../chips/checkboxes.ts';
import { cachedOptionChipColors } from '../format/cell-colors.ts';
import {
  filterForColumnValues,
  filterReplacingColumn,
  conditionFilterOfColumn,
  MAX_FILTER_CONDITIONS,
  withConditionFilter,
  valueFiltersOfColumn,
  withValueFilter,
  mixedEntryIndexesOfColumn,
} from './filter-model.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { dueDatePresetCondition } from '../model/date-serials.ts';
import { suggestedAsksOf, isDoneStatus } from '../words/suggested-asks.ts';
import { columnHoldsOf } from '../words/table-holds.ts';
import {
  isConditionEditableAsChoice,
  filterChoiceFromCondition,
  conditionFromFilterChoice,
  inputsOfFilterChoice,
  isFilterInputInvalid,
} from './own-filter-conditions.ts';
import { operatorsForColumnKind } from '../format/conditional/conditions.ts';
import { undoOwnFilterTry, tryOwnFilter } from './own-filter-tries.ts';
import { readWordsAsFilter } from '../words/read-filter.ts';
import { isColumnOfFewValues } from '../words/column-names.ts';
import { numberTypedFor } from '../format/conditional/editor-edits.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function clampSpanToShown({ start: start, end: end, showFrom: showFrom, showTo: showTo }: Dynamic) {
  let from = clampBetween(start, showFrom, showTo);
  return [from, clampBetween(end, from, showTo) - from];
}
export function ownFilterListAnchor(view: Dynamic, reads: ReadsWithTextMeasurer) {
  let ownFilterList = view.ownFilterList;
  let ownFilter = ownFilterList === null ? null : ownFilterByKey(view, ownFilterList.tableKey);
  if (ownFilterList === null || ownFilter === null) return null;
  let layout = layoutOfView(view, reads);
  let rowIndex = filterButtonRowIndex(reads, ownFilter, layout);
  let column = columnSpanOfIdFinder(view, reads, layout)(ownFilterList.c);
  if (rowIndex === null || column === null) return null;
  let stuckHeader = stuckHeaderAt(stuckHeadersOfView(view, reads, layout), rowIndex, column.columnIndex);
  let rowSpan =
    stuckHeader === undefined
      ? rowRunSpanOnScreen(
          {
            firstIndex: rowIndex,
            count: 1,
          },
          view,
          layout,
          view,
        )
      : rowSpanInStuckHeader(stuckHeader, rowIndex, layout);
  let [[x, width], [y, height]] = [clampSpanToShown(column.across), clampSpanToShown(rowSpan)];
  return {
    x: ROW_HEADER_WIDTH + x,
    y: COLUMN_HEADER_HEIGHT + y,
    width: width,
    height: height,
  };
}
export function filterButtonAtActiveCell(view: Dynamic, reads: ReadsWithTextMeasurer, activeCell?: Dynamic) {
  let cellArea = mergedAreaOrCellOf(reads, activeCell);
  if (cellArea === null || activeCell.sheetId !== view.sheetId) return null;
  for (let table of tablesWithFilterButtons(view, reads) as Dynamic) {
    let { rowIndex: rowIndex, table: tableOfCells2 } = table;
    let isInHeaderRow = rowIndex >= cellArea.topRowIndex && rowIndex < cellArea.topRowIndex + cellArea.rowCount;
    let columnsToMatch = table.columnsOfFound === undefined ? 1 : cellArea.columnCount;
    let match = table.columns.find(
      ({ c: columnId }: Dynamic) => isInSpan(reads.columnIndexOf(view.sheetId, columnId) ?? -1, cellArea.leftColumnIndex, columnsToMatch),
    );
    if (isInHeaderRow && match !== undefined)
      return {
        tableKey: table.key,
        r: tableOfCells2.header.lastRow,
        c: match.c,
        isOfFoundTable: table.columnsOfFound !== undefined,
      };
  }
  return null;
}
export function sortableRecordsOfOwnFilter(view: Dynamic, reads: ReadsWithTextMeasurer, ownFilter?: Dynamic) {
  let [tableArea, recordsArea] = [areaOfFilteredTable(reads, ownFilter), ownFilterRecordsArea(reads, ownFilter)];
  if (tableArea === null || recordsArea === null || !isFilterTableEmpty(ownFilter)) return null;
  let selection = selectionOfArea(view, reads, recordsArea);
  let [firstPiece] = shownPiecesOfArea(view, reads, recordsArea);
  if (selection === null || firstPiece === undefined) return null;
  let cellId = reads.cellIdAt(view.sheetId, firstPiece.topRowIndex, firstPiece.leftColumnIndex);
  if (cellId === null) return null;
  let rangeWalked = {
    from: selection.activeCell,
    to: selection.selectionCorner,
    at: cellId,
  };
  let selected = {
    ...view,
    ...selectionAtCell(cellId),
    rangeWalked: rangeWalked,
    otherRanges: [],
  };
  let sortArea = rangeSortArea(selected, reads);
  return sortArea !== null && isSameArea(sortArea, recordsArea)
    ? {
        selected: selected,
        table: tableArea,
        records: recordsArea,
      }
    : null;
}
export function sortFromOwnFilterList(state: PageState, reads: ReadsWithTextMeasurer, direction?: Dynamic, now?: Dynamic) {
  let ownFilterList = state.ownFilterList;
  let view = refreshStaleOwnFilters(state, reads, state.sheetId);
  let ownFilter = ownFilterList === null ? null : ownFilterByKey(view, ownFilterList.tableKey);
  if (ownFilterList?.sort?.isForOneself === true) {
    let closed = {
      ...view,
      ownFilterList: null,
      lastDone: null,
      notice: null,
    };
    return withNoEffects(
      ownFilter === null
        ? closed
        : sortOwnFilter(closed, reads, ownFilter, [
            {
              c: ownFilterList.c,
              direction: direction,
            },
          ]),
    );
  }
  let sortable = ownFilter === null ? null : sortableRecordsOfOwnFilter(view, reads, ownFilter);
  let anchor = ownFilterListAnchor(view, reads);
  if (ownFilterList === null || ownFilterList.sort === null || sortable === null || anchor === null) return withNoEffects(state);
  let nextState = {
    ...sortable.selected,
    ownFilterList: null,
    lastDone: null,
    notice: null,
  };
  let { table: table, records: records } = sortable;
  let cellsToSort = recordsSortableAsCells(nextState, reads, {
    table: table,
    records: records,
  });
  if (
    (cellsToSort !== null || sortMovesWholeRows(reads, nextState.sheetId, records)) &&
    reads.mergedAreasIn(nextState.sheetId, records).length === 0
  ) {
    let sortColumns = [
      {
        columnId: ownFilterList.c,
        direction: direction,
      },
    ];
    let sortCells2 =
      cellsToSort === null
        ? {
            cells: records,
            hasHeaderRow: false,
          }
        : {
            cells: cellsToSort,
            hasHeaderRow: false,
            movesWholeRows: true,
          };
    let sorted = sortTableWithKeys(
      {
        ...nextState,
        rangeWalked: null,
      },
      reads,
      sortCells2,
      sortColumns,
      now,
    );
    if (sortOfSidePane(sorted.state) === sortOfSidePane(nextState)) return sorted;
  }
  let sortMenu = {
    at: {
      x: anchor.x,
      y: anchor.y + anchor.height,
    },
    side: null,
    isAskedByKey: false,
    holds: 'all',
    sortColumnsPointedAt: {
      range: ownFilterList.c,
      sheet: null,
    },
  };
  let change = direction === 'ascending' ? 'sortRangeAscending' : 'sortRangeDescending';
  let wideningChoice = rangeSortWideningChoice(nextState, reads);
  return wideningChoice === null
    ? sortRange(nextState, reads, change, 'selection', sortColumnOfMenu(sortMenu, 'range'), now)
    : withNoEffects(
        openMenuWith(nextState, reads, sortMenu, {
          holds: 'cellsToSort',
          cellsToSort: {
            change: change,
            ...wideningChoice,
          },
        }),
      );
}
export function sortOwnFilterTableForEveryone(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  ownFilter?: Dynamic,
  by?: Dynamic,
  isWithoutKeyboard?: Dynamic,
) {
  let [tableArea, recordsArea] = [areaOfFilteredTable(reads, ownFilter), ownFilterRecordsArea(reads, ownFilter)];
  if (tableArea === null || recordsArea === null) return withNoEffects(state);
  let keys = by.map(
    ({ c: columnId, direction: direction }: Dynamic) => ({
      columnId: columnId,
      direction: direction,
    }),
  );
  let withHeader = {
    ...recordsArea,
    topRowIndex: recordsArea.topRowIndex - 1,
    rowCount: recordsArea.rowCount + 1,
  };
  let cellsToSort = recordsSortableAsCells(state, readsAsStored(reads), {
    table: tableArea,
    records: recordsArea,
  });
  if (cellsToSort !== null) {
    let { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = cellsToSort;
    let sortCells = {
      cells: {
        ...withHeader,
        leftColumnIndex: leftColumnIndex,
        columnCount: columnCount,
      },
      hasHeaderRow: true,
      movesWholeRows: true,
    };
    let sorted = sortTableWithKeys(state, reads, sortCells, keys, isWithoutKeyboard);
    if (sortOfSidePane(sorted.state) === sortOfSidePane(state)) return sorted;
  }
  return sortTableWithKeys(
    state,
    reads,
    {
      cells: withHeader,
      hasHeaderRow: true,
    },
    keys,
    isWithoutKeyboard,
  );
}
export function makeOwnSortForEveryone(state: PageState, reads: ReadsWithTextMeasurer, tableKey?: Dynamic, isWithoutKeyboard?: Dynamic) {
  let view = refreshStaleOwnFilters(state, reads, state.sheetId);
  let ownFilter = ownFilterByKey(view, tableKey);
  return ownFilter === null || ownFilter.sort === null || !isFilterTableEmpty(ownFilter)
    ? withNoEffects(view)
    : sortOwnFilterTableForEveryone(view, reads, ownFilter, ownFilter.sort.by, isWithoutKeyboard);
}
export function operandTextOfNumber(locale?: Dynamic, number?: Dynamic, numberKind?: Dynamic) {
  let text = numberKind === 'percent' ? `${Number((number * 100).toPrecision(15))}%` : String(number);
  return withDecimalSign(text, locale.decimalSign);
}
export function withDrawnFilterValues(reads: WorkbookReads, { table: { sheetId: sheetId } }: Dynamic, columnId?: Dynamic, listState?: Dynamic) {
  return {
    ...listState,
    drawn: listState.found.slice(0, MAX_LISTED_FILTER_VALUES).flatMap((index?: Dynamic) => {
      let listed = listState.listed[index];
      if (listed === undefined) return [];
      let cell = {
        sheetId: sheetId,
        rowId: listed.firstInRow,
        columnId: columnId,
      };
      let cellOnShow = reads.cellOnShowIn(cell);
      let dropdownOption = cellOnShow !== null && 'dropdownOption' in cellOnShow ? cellOnShow.dropdownOption : undefined;
      return [
        {
          index: index,
          text: listState.texts[index] ?? null,
          isChecked: listed.value?.kind === 'boolean' && isShownCheckboxCell(reads, cell) ? listed.value.value : null,
          optionPaints: dropdownOption === undefined ? null : cachedOptionChipColors(dropdownOption.color),
          records: listed.records,
          isTicked: listState.ticks[index] === true,
        },
      ];
    }),
  };
}
export function readFilterListValues(reads: WorkbookReads, ownFilter?: Dynamic, columnId?: Dynamic) {
  let { table: table, filter: filter } = ownFilter;
  let filterOfOtherColumns = filter === null ? null : filterOnKnownColumns(reads, table.sheetId, filter);
  let answer = reads.valuesOfFilteredColumn(table, filterForColumnValues(filterOfOtherColumns, columnId), columnId);
  if (answer === null) return null;
  if (answer.kind === 'refused')
    return answer.refusal === 'filteredTableIsGone' || answer.refusal === 'headerOfFilteredTableIsGone' ? 'tableIsGone' : null;
  let texts = answer.values.map(
    ({ value: value, firstInRow: firstInRow }: Dynamic) =>
      value === null
        ? null
        : cellShownText(
            reads.cellOnShowIn({
              sheetId: table.sheetId,
              rowId: firstInRow,
              columnId: columnId,
            }),
            reads.decimalSign,
          ),
  );
  return withDrawnFilterValues(reads, ownFilter, columnId, {
    listed: answer.values,
    areMoreLeftOut: answer.areMoreLeftOut,
    texts: texts,
    ticks: answer.values.map(({ meetsTheLinesOfItsColumn: meetsTheLinesOfItsColumn }: Dynamic) => meetsTheLinesOfItsColumn),
    found: texts.map((text?: Dynamic, index?: Dynamic) => index),
  });
}
export function sortDirectionInForce(
  reads: WorkbookReads,
  ownFilter: Dynamic,
  columnId: Dynamic,
  { listed: listed, areMoreLeftOut: areMoreLeftOut }: Dynamic,
) {
  let recordsArea = ownFilterRecordsArea(reads, ownFilter);
  if (recordsArea === null || areMoreLeftOut || recordsArea.rowCount > MAX_ROWS_TO_READ_SORT) return null;
  let indexOfValue = new (Map as Dynamic)(
    listed.map(({ value: value }: Dynamic, index?: Dynamic) => [JSON.stringify(value), index]),
  );
  let previousIndex: Dynamic = null;
  let isAscending: Dynamic = true;
  let isDescending: Dynamic = true;
  let hasBlank: Dynamic = false;
  let hasChange: Dynamic = false;
  for (let rowOffset: Dynamic = 0; rowOffset < recordsArea.rowCount; rowOffset += 1) {
    let cellId = reads.cellIdAt(ownFilter.table.sheetId, recordsArea.topRowIndex + rowOffset, recordsArea.leftColumnIndex);
    let value =
      cellId === null
        ? undefined
        : filterValueOfCell(reads, {
            ...cellId,
            columnId: columnId,
          });
    let index = value === undefined ? undefined : indexOfValue.get(JSON.stringify(value));
    if (index === undefined) return null;
    if (value === null) {
      hasBlank = true;
      continue;
    }
    if (hasBlank) return null;
    if (previousIndex !== null && index > previousIndex) isDescending = false;
    if (previousIndex !== null && index < previousIndex) isAscending = false;
    hasChange ||= previousIndex !== null && index !== previousIndex;
    previousIndex = index;
  }
  if (!hasChange || isAscending === isDescending) return null;
  return isAscending ? 'ascending' : 'descending';
}
export function quickFiltersOfColumnKind(columnKind?: Dynamic, today2?: Dynamic) {
  switch (columnKind) {
    case 'date':
      return today2 === null ? [] : DATE_QUICK_FILTERS.map((preset?: Dynamic) => [preset, dueDatePresetCondition(preset, today2)]);
    case 'number':
    case 'currency':
    case 'percent':
      return [
        [
          'largest',
          {
            kind: 'isAmongTheLargest',
            count: QUICK_FILTER_COUNT,
          },
        ],
        [
          'smallest',
          {
            kind: 'isAmongTheSmallest',
            count: QUICK_FILTER_COUNT,
          },
        ],
      ];
    case 'checkbox':
    case 'text':
    case 'fewWords':
      return [];
  }
}
export function readyFiltersOfColumn(
  reads: WorkbookReads,
  { table: table, filter: filter }: Dynamic,
  column?: Dynamic,
  viewerId?: Dynamic,
  today2?: Dynamic,
) {
  let { c: columnId } = column;
  let recordsWhere = (isCounted?: Dynamic) =>
    column.values.reduce((sum: Dynamic, { value: value, records: records }: Dynamic) => (isCounted(value) ? sum + records : sum), 0);
  let suggestedAsks = suggestedAsksOf(
    {
      records: recordsWhere(() => true),
      columns: [column],
    },
    viewerId,
  );
  let doneTexts = column.values.filter(({ value: value }: Dynamic) => value?.kind === 'text' && isDoneStatus(value.value));
  let isOfTexts = column.kind === 'text' || column.kind === 'fewWords';
  let singleRecordValues = column.values.filter((value?: Dynamic) => value.records === 1 && value.userIds.length === 0);
  let duplicatesChoice =
    isOfTexts && column.optionsOfDropdown === null && singleRecordValues.length * 2 > column.values.length
      ? [
          [
            'duplicates',
            {
              kind: 'appearsMoreThanOnce',
            },
          ],
        ]
      : [];
  let readyFilters = [
    ...suggestedAsks.flatMap(({ what: what, asked: { filter: filter2 } }: Dynamic) => {
      let asked = filter2?.allOf[0].anyOf[0].asked;
      if (asked === undefined || (what.kind !== 'mine' && what.kind !== 'allBut')) return [];
      if (what.kind === 'allBut' && doneTexts.length > 1) return [];
      return [
        {
          what: what.kind,
          asked: asked,
          label: what.kind === 'allBut' ? what.label : null,
        },
      ];
    }),
    ...[...quickFiltersOfColumnKind(column.kind, today2), ...duplicatesChoice].map(
      ([what, condition]: Dynamic) => ({
        what: what,
        asked: {
          kind: 'meets',
          condition: condition,
        },
        label: null,
      }),
    ),
  ];
  let filterOfOtherColumns = filter === null ? null : filterOnKnownColumns(reads, table.sheetId, filter);
  return readyFilters.flatMap((readyFilter?: Dynamic) => {
    let answer = reads.filteredRows(table, filterReplacingColumn(filterOfOtherColumns, columnId, readyFilter.asked));
    if (answer?.kind !== 'filteredRows') return [];
    let { recordsInView: recordsInView } = answer;
    let isOfCounts = readyFilter.what === 'largest' || readyFilter.what === 'smallest';
    return recordsInView === 0 ||
      recordsInView === answer.records ||
      (isOfCounts && recordsWhere((value?: Dynamic) => value?.kind === 'number') <= QUICK_FILTER_COUNT)
      ? []
      : [
          {
            ...readyFilter,
            records: recordsInView,
          },
        ];
  });
}
export function dropFilterKeptForColumnsCard(state: PageState, reads: ReadsWithTextMeasurer, tableKey?: Dynamic) {
  let filterKeptOnForColumnsCard = state.filterKeptOnForColumnsCard;
  if (filterKeptOnForColumnsCard === null || filterKeptOnForColumnsCard === tableKey || !isOwnFilterKeyUnused(state, filterKeptOnForColumnsCard))
    return state;
  return {
    ...clearOwnFilters(state, reads, {
      tableKey: filterKeptOnForColumnsCard,
    }),
    filterKeptOnForColumnsCard: null,
  };
}
export function openOwnFilterList(state: PageState, reads: ReadsWithTextMeasurer, tableKey?: Dynamic, columnId?: Dynamic, today2?: Dynamic) {
  let triedEnded = endOwnFilterTrial(state, reads);
  let sheetId = ownFilterByKey(triedEnded, tableKey)?.table.sheetId;
  let refreshed = sheetId === undefined ? triedEnded : refreshStaleOwnFilters(triedEnded, reads, sheetId);
  let withoutKeptFilter = dropFilterKeptForColumnsCard(refreshed, reads, tableKey);
  let { ownFilterList: ownFilterList } = state;
  let ownFilter = ownFilterByKey(withoutKeptFilter, tableKey);
  let column = ownFilter?.columns.find((column2?: Dynamic) => column2.c === columnId);
  if (ownFilter === null || column === undefined) return withoutKeptFilter;
  let { kind: columnKind } = column;
  let columnValues = columnHoldsOf(reads, ownFilter, column);
  let values = readFilterListValues(reads, ownFilter, columnId);
  if (values === 'tableIsGone')
    return {
      ...clearOwnFilters(withoutKeptFilter, reads, {
        tableKey: tableKey,
      }),
      notice: {
        kind: 'filteredTableIsGone',
      },
    };
  let { conditions: conditions, join: join } = conditionFilterOfColumn(
    ownFilter.filter,
    columnId,
    (condition?: Dynamic) => isConditionEditableAsChoice(condition, columnKind === 'date'),
  );
  let isForOneself = isOwnFilterSortable(reads, ownFilter);
  let sortRecords = isForOneself
    ? ownFilterRecordsArea(reads, ownFilter)
    : (sortableRecordsOfOwnFilter(withoutKeptFilter, reads, ownFilter)?.records ?? null);
  let [firstSortBy] = ownFilter.sort?.by ?? [];
  return {
    ...clearPassingNotice(withoutKeptFilter),
    menu: null,
    dropdown: null,
    calendar: null,
    ownFilterList: {
      tableKey: tableKey,
      isFilterNotDrawnYet: ownFilterList?.tableKey === tableKey && ownFilterList.isFilterNotDrawnYet,
      isTableGuessed: ownFilterList?.tableKey === tableKey && ownFilterList.isTableGuessed,
      c: columnId,
      values: values,
      startsFromNone: false,
      conditions: conditions.map(
        (condition?: Dynamic, index?: Dynamic) =>
          ownFilterConditionRow(
            reads,
            columnKind,
            index,
            filterChoiceFromCondition(
              condition,
              columnKind === 'date',
              (number?: Dynamic) => operandTextOfNumber(reads, number, columnKind),
            ),
            condition,
          ),
      ),
      join: join,
      choices: conditionFamilyOfColumnKind(columnKind) === null ? [] : operatorsForColumnKind(columnKind),
      sort:
        sortRecords === null || (ownFilterList?.tableKey === tableKey && ownFilterList.isTableGuessed && ownFilterList.sort === null)
          ? null
          : {
              keys: sortHoldsOfColumn(
                reads,
                {
                  sheetId: ownFilter.table.sheetId,
                  columnId: columnId,
                },
                sortRecords,
              ),
              inForce:
                firstSortBy?.c === columnId
                  ? firstSortBy.direction
                  : values === null
                    ? null
                    : sortDirectionInForce(reads, ownFilter, columnId, values),
              isForOneself: isForOneself,
            },
      today: today2,
      holds: {
        records: 0,
        columns: ownFilter.columns.map(
          (column2?: Dynamic) =>
            column2.c === columnId
              ? columnValues
              : {
                  ...column2,
                  values: [],
                  areMoreValuesLeftOut: true,
                  optionsOfDropdown: null,
                },
        ),
      },
      ready: readyFiltersOfColumn(reads, ownFilter, columnValues, withoutKeptFilter.viewerId, today2),
      words: '',
      answer: null,
      isAnswerRead: false,
      areWordsOnTheirWay: false,
    },
  };
}
export function applyOwnFilterListChange(state: PageState, reads: ReadsWithTextMeasurer, filterChange?: Dynamic, listChange?: Dynamic) {
  let [ownFilterList, ownFilter] = [state.ownFilterList, ownFilterOfList(state)];
  if (ownFilterList === null || ownFilter === null) return state;
  let nextState = applyOwnFilter(clearPassingNotice(state), reads, ownFilter, filterChange(ownFilter, ownFilterList));
  return ownFilterByKey(nextState, ownFilterList.tableKey) !== ownFilter
    ? {
        ...nextState,
        ownFilterList: {
          ...ownFilterList,
          ...listChange,
        },
      }
    : nextState;
}
export function setOwnFilterConditions(state: PageState, reads: ReadsWithTextMeasurer, conditions?: Dynamic, join?: Dynamic) {
  let ownFilterList = state.ownFilterList;
  if (ownFilterList === null) return state;
  let asksOf = (conditions2?: Dynamic) => conditions2.flatMap(({ asks: asks }: Dynamic) => asks ?? []);
  let [askedBefore, askedNow] = [asksOf(ownFilterList.conditions), asksOf(conditions)];
  if (
    askedBefore.length === askedNow.length &&
    askedBefore.every((asked?: Dynamic, index?: Dynamic) => asked === askedNow[index]) &&
    (join === ownFilterList.join || askedNow.length < MAX_FILTER_CONDITIONS)
  )
    return {
      ...state,
      ownFilterList: {
        ...ownFilterList,
        conditions: conditions,
        join: join,
      },
    };
  return applyOwnFilterListChange(
    state,
    reads,
    ({ filter: filter }: Dynamic, { c: columnId }: Dynamic) =>
      withConditionFilter(filter, columnId, askedBefore, {
        conditions: askedNow,
        join: join,
      }),
    {
      conditions: conditions,
      join: join,
    },
  );
}
export function endOwnFilterTrial(state: PageState, reads: ReadsWithTextMeasurer) {
  let ownFilterTried = state.ownFilterTried;
  return ownFilterTried === null
    ? state
    : {
        ...undoOwnFilterTry(state, reads, ownFilterTried),
        ownFilterTried: null,
      };
}
export function tryOwnFilterAsked(state: PageState, reads: ReadsWithTextMeasurer, asked?: Dynamic) {
  let [ownFilterList, ownFilter, ownFilterTried] = [state.ownFilterList, ownFilterOfList(state), state.ownFilterTried];
  if (ownFilterList === null || ownFilter === null) return state;
  if (ownFilterTried !== null && filterLineIndexOfAsked(ownFilter, ownFilterList.c, asked) !== -1) return state;
  let { filter: filter } = ownFilterTried?.before.held ?? ownFilter;
  let filterOfOtherColumns = filter === null ? null : filterOnKnownColumns(reads, ownFilter.table.sheetId, filter);
  let { state: triedState, tried: tried } = tryOwnFilter(
    clearPassingNotice(state),
    reads,
    ownFilter,
    ownFilterTried,
    filterReplacingColumn(filterOfOtherColumns, ownFilterList.c, asked),
  );
  return {
    ...triedState,
    ownFilterTried: tried,
  };
}
export function readFilterListWords(reads: WorkbookReads, ownFilterList?: Dynamic, words?: Dynamic, foundIndexes?: Dynamic, viewerId?: Dynamic) {
  let trimmed = words.trim();
  if (trimmed === '')
    return {
      asked: null,
      isOnItsWay: false,
      isRead: false,
    };
  let wordsRead = readWordsAsFilter(words, ownFilterList.holds, viewerId, {
    only: ownFilterList.c,
    today: ownFilterList.today,
    signsOfNumbers: reads.signsOfNumbers,
    isMonthFirst: reads.locale === 'en-US',
  });
  if (wordsRead.kind === 'read') {
    let [firstLine, ...otherLines] = wordsRead.asked.filter?.allOf ?? [];
    let asked =
      otherLines.length === 0 && firstLine?.anyOf.length === 1 && firstLine.anyOf[0].c === ownFilterList.c ? firstLine.anyOf[0].asked : null;
    if (!(asked?.kind === 'meets' && asked.condition.kind === 'numberIs' && asked.condition.comparison === 'equalTo'))
      return {
        asked: asked,
        isOnItsWay: false,
        isRead: asked !== null,
      };
  }
  let onItsWay = {
    isOnItsWay: wordsRead.kind === 'notRead' && wordsRead.isOnItsWay,
    isRead: false,
  };
  let column = ownFilterList.holds.columns.find(({ c: columnId }: Dynamic) => columnId === ownFilterList.c);
  if (ownFilterList.values === null || column === undefined)
    return {
      asked: null,
      ...onItsWay,
    };
  let { listed: listed, areMoreLeftOut: areMoreLeftOut } = ownFilterList.values;
  let [firstValue, ...moreValues] = foundIndexes.flatMap((index?: Dynamic) => listed[index]?.value ?? []);
  let isFreeText = column.kind === 'text' && !isColumnOfFewValues(column);
  if (isFreeText && (firstValue !== undefined || areMoreLeftOut))
    return {
      asked: {
        kind: 'meets',
        condition: {
          kind: 'textContains',
          text: trimmed,
        },
      },
      ...onItsWay,
    };
  if (isFreeText || areMoreLeftOut || firstValue === undefined || foundIndexes.length === listed.length)
    return {
      asked: null,
      ...onItsWay,
    };
  return {
    asked: {
      kind: 'isOneOf',
      values: [firstValue, ...moreValues],
    },
    ...onItsWay,
  };
}
export function valuesLeftOutKept(
  { listed: listed, ticks: ticks, areMoreLeftOut: areMoreLeftOut }: Dynamic,
  lines?: Dynamic,
  isTicked?: Dynamic,
) {
  if (!areMoreLeftOut) return [];
  let lineKind = isTicked ? 'isOneOf' : 'isNoneOf';
  let keptValues = lines.flatMap((line?: Dynamic) => (line.kind === lineKind ? line.values : []));
  let listedValues = new (Set as Dynamic)(listed.map(({ value: value }: Dynamic) => JSON.stringify(value)));
  let notListed = keptValues.filter((value?: Dynamic) => !listedValues.has(JSON.stringify(value)));
  let tickedCount = ticks.filter((tick?: Dynamic) => tick === isTicked).length;
  return keptValues.length - notListed.length === tickedCount ? notListed : [];
}
export function setFilterListTicks(state: PageState, reads: ReadsWithTextMeasurer, ticks?: Dynamic, startsFromNone?: Dynamic) {
  let [ownFilterList, ownFilter] = [state.ownFilterList, ownFilterOfList(state)];
  if (ownFilterList === null || ownFilterList.values === null || ownFilter === null) return state;
  let valueLines = valueFiltersOfColumn(ownFilter.filter, ownFilterList.c);
  let isShowOnly =
    valueLines.length === 0 ? ownFilterList.startsFromNone : valueLines.some(({ kind: kind }: Dynamic) => kind === 'isOneOf');
  let [firstValue, ...otherValues] = [
    ...ownFilterList.values.listed.flatMap(({ value: value }: Dynamic, index?: Dynamic) => (ticks[index] === isShowOnly ? [value] : [])),
    ...valuesLeftOutKept(ownFilterList.values, valueLines, isShowOnly),
  ];
  let valueLine =
    firstValue === undefined
      ? null
      : {
          kind: isShowOnly ? 'isOneOf' : 'isNoneOf',
          values: [firstValue, ...otherValues],
        };
  let lineToSet = startsFromNone === null ? valueLine : null;
  return applyOwnFilterListChange(
    state,
    reads,
    ({ filter: filter }: Dynamic, { c: columnId }: Dynamic) => withValueFilter(filter, columnId, lineToSet),
    {
      startsFromNone: startsFromNone ?? (valueLine === null ? isShowOnly : ownFilterList.startsFromNone),
      values: withDrawnFilterValues(reads, ownFilter, ownFilterList.c, {
        ...ownFilterList.values,
        ticks: ticks,
      }),
    },
  );
}
export function reduceOwnFilterList(state: PageState, reads: ReadsWithTextMeasurer, act?: Dynamic) {
  if (act.kind === 'giveUp') return endOwnFilterTrial(state, reads);
  let [ownFilterList, ownFilter] = [state.ownFilterList, ownFilterOfList(state)];
  if (ownFilterList === null || ownFilter === null) return state;
  if (!(act.kind === 'type' || act.kind === 'pointAt' || act.kind === 'take') && (state.ownFilterTried !== null || ownFilterList.answer !== null))
    return reduceOwnFilterList(
      {
        ...endOwnFilterTrial(state, reads),
        ownFilterList: {
          ...ownFilterList,
          answer: null,
        },
      },
      reads,
      act,
    );
  let columnKind = ownFilter.columns.find(({ c: columnId }: Dynamic) => columnId === ownFilterList.c)?.kind ?? 'text';
  switch (act.kind) {
    case 'tick': {
      let value = ownFilterList.values?.ticks ?? [];
      let value2 = value[act.index];
      return value2 === undefined ? state : setFilterListTicks(state, reads, value.with(act.index, !value2), null);
    }
    case 'tickAll':
    case 'tickNone': {
      let value = act.kind === 'tickAll';
      let { ticks: value2 = [], found: value3 = [] } = ownFilterList.values ?? {};
      let values = new (Set as Dynamic)(value3);
      return setFilterListTicks(
        state,
        reads,
        value2.map((tick?: Dynamic, index?: Dynamic) => (values.has(index) ? value : tick)),
        value3.length === value2.length ? !value : null,
      );
    }
    case 'type': {
      let value = ownFilterList.values === null ? [] : indexesOfMatchingTexts(ownFilterList.values.texts, act.blank, act.words);
      let value2 =
        ownFilterList.values === null
          ? null
          : withDrawnFilterValues(reads, ownFilter, ownFilterList.c, {
              ...ownFilterList.values,
              found: value,
            });
      let {
        asked: value3,
        isOnItsWay: value4,
        isRead: value5,
      } = readFilterListWords(reads, ownFilterList, act.words, value, state.viewerId);
      let value6 = act.words.startsWith(ownFilterList.words);
      let value7 = value3 === null && value4 && ownFilterList.isAnswerRead && value6;
      let value8 = value7 ? ownFilterList.answer : value3;
      let state2 = {
        ...state,
        ownFilterList: {
          ...ownFilterList,
          values: value2,
          words: act.words,
          answer: value8,
          isAnswerRead: value7 || value5,
          areWordsOnTheirWay: value4,
        },
      };
      return value8 === null ? endOwnFilterTrial(state2, reads) : tryOwnFilterAsked(state2, reads, value8);
    }
    case 'pointAt': {
      let value = act.row === null ? ownFilterList.answer : askedOfFilterListRow(ownFilterList, act.row);
      return value === null ? endOwnFilterTrial(state, reads) : tryOwnFilterAsked(state, reads, value);
    }
    case 'take': {
      let value = askedOfFilterListRow(ownFilterList, act.row);
      if (value === null) return state;
      let value2 = tryOwnFilterAsked(state, reads, value);
      let value3 = ownFilterOfList(value2);
      if (value3 === null || filterLineIndexOfAsked(value3, ownFilterList.c, value) === -1) return value2;
      return {
        ...value2,
        ownFilterTried: null,
        ownFilterList: null,
      };
    }
    case 'addCondition': {
      let value = ownFilterList.conditions.length < MAX_FILTER_CONDITIONS;
      if (ownFilterList.choices.length === 0 || !value || ownFilterList.conditions.some(({ key: key }: Dynamic) => key === act.key))
        return state;
      let value2 = conditionFamilyOfColumnKind(columnKind);
      let state2 = {
        choice: value2 === 'text' ? 'textContains' : value2 === 'days' ? 'lessThan' : 'greaterThan',
        first: '',
        second: '',
      };
      return setOwnFilterConditions(
        state,
        reads,
        [...ownFilterList.conditions, ownFilterConditionRow(reads, columnKind, act.key, state2, null)],
        ownFilterList.join,
      );
    }
    case 'changeCondition': {
      let value = conditionFromFilterChoice(act.held, columnKind === 'date', conditionInputLimits(reads, columnKind));
      return setOwnFilterConditions(
        state,
        reads,
        ownFilterList.conditions.map(
          (condition?: Dynamic) =>
            condition.key === act.key ? ownFilterConditionRow(reads, columnKind, condition.key, act.held, value) : condition,
        ),
        ownFilterList.join,
      );
    }
    case 'removeCondition':
      return setOwnFilterConditions(
        state,
        reads,
        ownFilterList.conditions.filter(({ key: key }: Dynamic) => key !== act.key),
        ownFilterList.join,
      );
    case 'joinConditions':
      return setOwnFilterConditions(state, reads, ownFilterList.conditions, act.by);
    case 'removeLine': {
      let value = openOwnFilterList(
        removeOwnFilterLine(clearPassingNotice(state), reads, ownFilterList.tableKey, act.lineIndex),
        reads,
        ownFilterList.tableKey,
        ownFilterList.c,
        ownFilterList.today,
      );
      let { conditions: value2, join: value3 } = ownFilterList;
      return value.ownFilterList === null
        ? value
        : {
            ...value,
            ownFilterList: {
              ...value.ownFilterList,
              conditions: value2,
              join: value3,
            },
          };
    }
  }
}
export function closeOwnFilterListOnEvent(state: PageState, trigger?: Dynamic) {
  if (state.ownFilterList === null) return state;
  if (
    ownFilterOfList(state)?.table.sheetId === state.sheetId &&
    state.sheetPointedIn === null &&
    state.mode.kind === 'navigating' &&
    state.menu === null &&
    trigger.kind !== 'pointerPressed'
  )
    return state;
  let { ownFilterTried: ownFilterTried, filterKeptOnForColumnsCard: filterKeptOnForColumnsCard } = state;
  let isKeptFilterUnused =
    filterKeptOnForColumnsCard !== null && !state.ownFilterList.isFilterNotDrawnYet && isOwnFilterKeyUnused(state, filterKeptOnForColumnsCard);
  let isTrialLeftOpen = ownFilterTried !== null || isKeptFilterUnused;
  let dropsDragging = trigger.kind === 'pointerPressed' && isTrialLeftOpen;
  let dropsPlaceAfterTry = trigger.kind === 'pointerPressed' || (trigger.kind === 'menuAsked' && trigger.at !== null);
  return {
    ...state,
    ownFilterList: null,
    dragging: dropsDragging ? null : state.dragging,
    ownFilterTried:
      ownFilterTried !== null && dropsPlaceAfterTry
        ? {
            ...ownFilterTried,
            placeAfterTry: null,
          }
        : ownFilterTried,
  };
}
export function ownFilterListView(state: PageState, reads: WorkbookReads) {
  let [ownFilterList, ownFilter] = [state.ownFilterList, ownFilterOfList(state)];
  if (ownFilterList === null || ownFilter === null) return null;
  let { c: columnId, tableKey: tableKey } = ownFilterList;
  let columnKind = ownFilter.columns.find((column?: Dynamic) => column.c === columnId)?.kind ?? 'text';
  let ticked = (ownFilterList.values?.found ?? []).map((index?: Dynamic) => ownFilterList.values?.ticks[index] === true);
  let answerLine =
    ownFilterList.answer === null ? undefined : ownFilter.lines[filterLineIndexOfAsked(ownFilter, columnId, ownFilterList.answer)];
  let recordCounts = recordCountsOfOwnFilter(state, reads, ownFilter);
  let filterShown = state.ownFilterTried?.before.held ?? ownFilter;
  let testsOfConditions = new (Map as Dynamic)(
    (filterShown.filter?.allOf ?? []).flatMap(
      ({ anyOf: anyOf }: Dynamic, lineIndex?: Dynamic) =>
        anyOf.flatMap(({ asked: asked }: Dynamic, index?: Dynamic) => {
          let said = filterShown.lines[lineIndex]?.[index];
          return asked.kind === 'meets' && said?.kind === 'test' ? [[asked.condition, said.test]] : [];
        }),
    ),
  );
  let asksOfConditions = ownFilterList.conditions.flatMap(({ asks: asks }: Dynamic) => asks ?? []);
  return {
    tableKey: tableKey,
    c: columnId,
    join: ownFilterList.join,
    choices: ownFilterList.choices,
    isOfDays: columnKind === 'date',
    mostCounted: reads.limitsOfConditionalFormats().largestCountInACondition,
    sort: ownFilterList.sort,
    canSortNow: recordCounts?.inView !== 0,
    areWordsOnTheirWay: ownFilterList.areWordsOnTheirWay,
    conditions: ownFilterList.conditions.map(
      ({ key: key, held: held, asks: asks, isMistyped: isMistyped }: Dynamic) => ({
        key: key,
        held: held,
        fields: inputsOfFilterChoice(held.choice, columnKind === 'date'),
        isMistyped: isMistyped,
        said: asks === null ? null : (testsOfConditions.get(asks) ?? null),
      }),
    ),
    answer:
      answerLine === undefined
        ? null
        : {
            line: answerLine,
            records: recordCounts?.inView ?? null,
          },
    ready: ownFilterList.ready.map(
      ({ what: what, label: label, records: records }: Dynamic) => ({
        what: what,
        label: label,
        records: records,
      }),
    ),
    otherLines: mixedEntryIndexesOfColumn(filterShown.filter, columnId, asksOfConditions).flatMap((lineIndex?: Dynamic) => {
      let line = filterShown.lines[lineIndex];
      return line === undefined
        ? []
        : [
            {
              lineIndex: lineIndex,
              line: line,
            },
          ];
    }),
    records: state.ownFilterTried === null ? recordCounts : null,
    isOnTrial: state.ownFilterTried !== null,
    column: columnLabelOfFilterTable(reads, ownFilter, columnId),
    values: ownFilterList.values?.drawn ?? null,
    areMoreLeftOut: ownFilterList.values?.areMoreLeftOut === true,
    ticked: ticked.every(Boolean) ? 'all' : ticked.some(Boolean) ? 'some' : 'none',
  };
}
export const conditionFamilyOfColumnKind = (columnKind?: Dynamic) => {
  switch (columnKind) {
    case 'number':
    case 'currency':
    case 'percent':
      return 'numbers';
    case 'date':
      return 'days';
    case 'fewWords':
    case 'text':
      return 'text';
    case 'checkbox':
      return null;
  }
};
export const QUICK_FILTER_COUNT = 10;
export const MAX_LISTED_FILTER_VALUES = 200;
export const ownFilterConditionRow = (reads: WorkbookReads, columnKind?: Dynamic, key?: Dynamic, held?: Dynamic, asks?: Dynamic) => ({
  key: key,
  held: held,
  asks: asks,
  isMistyped: inputsOfFilterChoice(held.choice, columnKind === 'date').map(
    (field?: Dynamic, fieldIndex?: Dynamic) =>
      isFilterInputInvalid(field, fieldIndex === 0 ? held.first : held.second, conditionInputLimits(reads, columnKind)),
  ),
});
export const ownFilterOfList = (state: PageState) =>
  state.ownFilterList === null ? null : ownFilterByKey(state, state.ownFilterList.tableKey);
export const conditionInputLimits = (reads: WorkbookReads, columnKind?: Dynamic) => ({
  numberTyped: (text?: Dynamic) => numberTypedFor(reads, text, columnKind),
  mostCounted: reads.limitsOfConditionalFormats().largestCountInACondition,
  longestText: reads.limitsOfConditionalFormats().longestTextOfAConditionInCharacters,
});
export const indexesOfMatchingTexts = (texts?: Dynamic, blank?: Dynamic, words?: Dynamic) => {
  let wordsLower = words.trim().toLowerCase();
  return texts.flatMap((text?: Dynamic, index?: Dynamic) => ((text ?? blank).toLowerCase().includes(wordsLower) ? [index] : []));
};
export const MAX_ROWS_TO_READ_SORT = 5000;
export const DATE_QUICK_FILTERS = ['thisWeek', 'nextWeek', 'thisMonth', 'overdue'];
export const filterLineIndexOfAsked = ({ filter: filter }: Dynamic, columnId?: Dynamic, asked?: Dynamic) =>
  (filter?.allOf ?? []).findIndex(
    ({ anyOf: [firstAsk, ...otherAsks] }: Dynamic) => otherAsks.length === 0 && firstAsk.c === columnId && firstAsk.asked === asked,
  );
export const askedOfFilterListRow = ({ answer: answer, ready: ready }: Dynamic, row?: Dynamic) =>
  row === 'answer' ? answer : (ready.find(({ what: what }: Dynamic) => what === row)?.asked ?? null);
export const isOwnFilterTrialLeftOpen = ({ ownFilterList: ownFilterList, ownFilterTried: ownFilterTried }: Dynamic) =>
  ownFilterList === null && ownFilterTried !== null;
