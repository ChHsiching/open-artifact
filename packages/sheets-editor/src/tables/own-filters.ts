import type { Dynamic } from '../dynamic.ts';
import { areaOfFilteredTable, indexRangesOverlap } from './finding.ts';
import { mergedAreaOrCellOf, selectionPositionsOf } from '../selection/model.ts';
import { areasOverlap } from '../model/workbook.ts';
import { isInSpan } from '../grid/geometry.ts';
import { booleanText } from '../model/cell-text.ts';
import { showNumberInColumnFormat, describeColumnCondition } from '../format/conditional/descriptions.ts';
import { isWholeDayRange } from './own-filter-conditions.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { ownFilterRecordsArea } from './own-filter-actions.ts';
import { findSheetById } from '../grid/layout.ts';
import { sortHoldsOfColumn } from './sort.ts';
import { rowIdsOutOfView, keepFilterClausesWhereColumns } from './filter-model.ts';
import { withoutFrozenRowKeys, keepSelectionOnShownRows, setRowsHiddenByOwnFilters } from './filtered-rows.ts';
import { columnLetters } from '../model/a1-references.ts';
import { columnLabelOf } from '../format/conditional/editor-view.ts';
import { spanCutsOwnRowOrder } from '../model/line-ids.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function filterTableOfCellTable(found?: Dynamic) {
  if (found === null || typeof found === 'string' || found.table === null) return null;
  let {
    cellTableId: cellTableId,
    cellTable: cellTable,
    liveCellTable: liveCellTable,
    table: { table: table, columns: columns },
  } = found;
  let { header: header } = table;
  if (header === null) throw Error('sheets-core read a cell table with no header');
  return {
    cellTableId: cellTableId,
    cellTable: cellTable,
    liveCellTable: liveCellTable,
    table: {
      ...table,
      header: header,
    },
    columns: columns,
  };
}
export function isOwnFilterKeyUnused(state?: Dynamic, key?: Dynamic) {
  let ownFilter = ownFilterByKey(state, key);
  return ownFilter !== null && isOwnFilterUnused(ownFilter);
}
export function ownFilterNotDrawnYet(state: PageState) {
  let key = ownFilterKeyNotDrawnYet(state);
  return ownFiltersOfSheet(state, state.sheetId).find(({ key: key2 }: Dynamic) => key2 === key) ?? null;
}
export function drawnOwnFiltersOfSheet(state?: Dynamic, sheetId?: Dynamic) {
  let ownFilters = ownFiltersOfSheet(state, sheetId);
  let keyNotDrawn = ownFilterKeyNotDrawnYet(state);
  if (keyNotDrawn === null || ownFilters.every(({ key: key }: Dynamic) => key !== keyNotDrawn)) return ownFilters;
  let cached = drawnOwnFiltersCache.get(ownFilters);
  if (cached?.butFor === keyNotDrawn) return cached.drawn;
  let drawn = ownFilters.filter(({ key: key }: Dynamic) => key !== keyNotDrawn);
  drawnOwnFiltersCache.set(ownFilters, {
    butFor: keyNotDrawn,
    drawn: drawn,
  });
  return drawn;
}
export function ownFiltersWithoutKey(ownFilters?: Dynamic, key?: Dynamic, evenIfItAsks?: Dynamic) {
  if (key === null) return ownFilters;
  let cached = ownFiltersWithoutKeyCache.get(ownFilters);
  if (cached?.key === key && cached.evenIfItAsks === evenIfItAsks) return cached.kept;
  let kept = new (Map as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      ownFilters,
      ([sheetId, filters]: Dynamic) => [
        sheetId,
        filters.filter((ownFilter?: Dynamic) => ownFilter.key !== key || (!evenIfItAsks && !isOwnFilterUnused(ownFilter))),
      ],
    ),
  );
  ownFiltersWithoutKeyCache.set(ownFilters, {
    key: key,
    evenIfItAsks: evenIfItAsks,
    kept: kept,
  });
  return kept;
}
export function ownFilterTableArea(reads: WorkbookReads, ownFilter?: Dynamic) {
  let area = areaOfFilteredTable(reads, ownFilter);
  let { footerRows: footerRows } = ownFilter.liveCellTable;
  if (area === null || footerRows === null) return area;
  let lastFooterRowIndex = reads.rowIndexOf(ownFilter.table.sheetId, footerRows.lastRow);
  return lastFooterRowIndex === null
    ? area
    : {
        ...area,
        rowCount: Math.max(area.rowCount, lastFooterRowIndex - area.topRowIndex + 1),
      };
}
export function ownFilterAtCell(state: Dynamic, reads: WorkbookReads, cell?: Dynamic) {
  let cellArea = mergedAreaOrCellOf(reads, cell);
  if (cellArea === null) return null;
  return (
    ownFiltersOfSheet(state, cell.sheetId).find((ownFilter?: Dynamic) => {
      let area = ownFilterTableArea(reads, ownFilter);
      return area !== null && areasOverlap(area, cellArea);
    }) ?? null
  );
}
export function rowBelowOwnFilterButtonsAt(state: Dynamic, reads: WorkbookReads, cell?: Dynamic) {
  let position = reads.positionOfCell(cell);
  if (position === null) return 0;
  let rowsBelowButtons = ownFiltersOfSheet(state, cell.sheetId).flatMap((ownFilter?: Dynamic) => {
    let area = areaOfFilteredTable(reads, ownFilter);
    return area !== null && position.rowIndex >= area.topRowIndex && isInSpan(position.columnIndex, area.leftColumnIndex, area.columnCount)
      ? area.rowIndexOfButtons + 1
      : [];
  });
  return (Math.max as Dynamic)(0, ...rowsBelowButtons);
}
export function filterValueText(place?: Dynamic, column?: Dynamic, value?: Dynamic) {
  switch (value.kind) {
    case 'text':
    case 'error':
      return value.value;
    case 'boolean':
      return booleanText(value.value);
    case 'number':
      return showNumberInColumnFormat(place, value.value, column);
  }
}
export function asDayEqualityTest(test?: Dynamic, condition?: Dynamic) {
  let { condition: testCondition } = test;
  if (testCondition.kind !== 'numberIsBetween' && testCondition.kind !== 'numberIsNotBetween') return test;
  if (!test.isOfDates || !isWholeDayRange(condition)) return test;
  let comparison = testCondition.kind === 'numberIsBetween' ? 'equalTo' : 'notEqualTo';
  return {
    ...test,
    condition: {
      kind: 'numberIs',
      comparison: comparison,
      operand: testCondition.oneEnd,
    },
  };
}
export function startAtFirstNumberRow(place?: Dynamic, column?: Dynamic) {
  let { reads: reads, sheetId: sheetId, topRowIndex: topRowIndex } = place;
  let columnIndex = reads.columnIndexOf(sheetId, column);
  if (topRowIndex === null || columnIndex === null) return place;
  for (let offset: Dynamic = 0; offset < NUMBER_ROW_SEARCH_LIMIT; offset += 1) {
    let cellId = reads.cellIdAt(sheetId, topRowIndex + offset, columnIndex);
    if (cellId === null) return place;
    if (cellValueOf(reads.cellOnShowIn(cellId))?.kind === 'number')
      return {
        ...place,
        topRowIndex: topRowIndex + offset,
      };
  }
  return place;
}
export function describeFilterItem(place: Dynamic, ownFilter: Dynamic, { c: column, asked: asked }: Dynamic) {
  let columnLabel = columnLabelOfFilterTable(place.reads, ownFilter, column);
  if (asked.kind === 'meets') {
    let test = describeColumnCondition(startAtFirstNumberRow(place, column), column, columnLabel, asked.condition);
    let { condition: condition } = asked;
    if (condition.kind === 'numberIs' && condition.operand.kind === 'sameRowInColumn' && test.condition.kind === 'numberIs') {
      let operand = {
        kind: 'column',
        column: columnLabelOfFilterTable(place.reads, ownFilter, condition.operand.c),
      };
      return {
        kind: 'test',
        test: {
          ...test,
          condition: {
            ...test.condition,
            operand: operand,
          },
        },
      };
    }
    return {
      kind: 'test',
      test: asDayEqualityTest(test, condition),
    };
  }
  let isOneOf = asked.kind === 'isOneOf';
  let [firstValue, ...otherValues] = asked.values;
  if (otherValues.length > 0)
    return {
      kind: asked.kind,
      column: columnLabel,
      values: asked.values.map((value?: Dynamic) => (value === null ? null : filterValueText(place, column, value))),
    };
  let valueText = firstValue === null ? null : filterValueText(place, column, firstValue);
  return {
    kind: 'test',
    test: {
      column: columnLabel,
      isOfDates: false,
      condition:
        valueText === null
          ? {
              kind: isOneOf ? 'isBlank' : 'isNotBlank',
            }
          : {
              kind: isOneOf ? 'textIs' : 'textIsNot',
              text: valueText,
            },
    },
  };
}
export function describeFilterLines(reads: WorkbookReads, ownFilter?: Dynamic, filter?: Dynamic) {
  let { sheetId: sheetId, firstRowOfBody: firstRowOfBody } = ownFilter.table;
  let place = {
    reads: reads,
    sheetId: sheetId,
    topRowIndex: reads.rowIndexOf(sheetId, firstRowOfBody),
  };
  return filter.allOf.map(
    ({ anyOf: [firstItem, ...otherItems] }: Dynamic) => [
      describeFilterItem(place, ownFilter, firstItem),
      ...otherItems.map((input?: Dynamic) => describeFilterItem(place, ownFilter, input)),
    ],
  );
}
export function canSortOwnFilterTable(reads: WorkbookReads, ownFilter?: Dynamic) {
  let { sheetId: sheetId } = ownFilter.table;
  let [recordsArea, sheet] = [ownFilterRecordsArea(reads, ownFilter), findSheetById(reads, sheetId)];
  if (recordsArea === null || sheet === undefined) return false;
  let rows = {
    firstIndex: recordsArea.topRowIndex,
    count: recordsArea.rowCount,
  };
  let rowsAcross = {
    ...recordsArea,
    leftColumnIndex: 0,
    columnCount: sheet.columnCount,
  };
  let isTallAndInRows = (area?: Dynamic) => area !== undefined && area.rowCount > 1 && areasOverlap(area, rowsAcross);
  return (
    rows.count > 1 &&
    !isInSpan(sheet.frozenRowCount - 1, rows.firstIndex, rows.count) &&
    !cutsRowGroup(rows, sheet.rowGroups) &&
    !reads.mergedAreasIn(sheetId, rowsAcross).some(isTallAndInRows) &&
    !reads.cellsWithSpillIn(sheetId).some(
      ({ r: rowId, c: columnId }: Dynamic) =>
        isTallAndInRows(
          reads.spillOver({
            sheetId: sheetId,
            rowId: rowId,
            columnId: columnId,
          })?.area,
        ),
    )
  );
}
export function saidOfSortColumn(reads: WorkbookReads, ownFilter: Dynamic, { c: columnId, direction: direction }: Dynamic) {
  let recordsArea = ownFilterRecordsArea(reads, ownFilter);
  let column = {
    sheetId: ownFilter.table.sheetId,
    columnId: columnId,
  };
  return {
    column: columnLabelOfFilterTable(reads, ownFilter, columnId),
    direction: direction,
    holds: recordsArea === null ? null : sortHoldsOfColumn(reads, column, recordsArea),
  };
}
export function rowIdsOutOfViewOf(ownFilters?: Dynamic) {
  let rowIds = new (Set as Dynamic)();
  for (let { rows: rows } of ownFilters as Dynamic) for (let rowId of rowIdsOutOfView(rows?.rowsOutOfView ?? []) as Dynamic) rowIds.add(rowId);
  return rowIds;
}
export function setOwnFiltersOfSheet(state: PageState, sheetId?: Dynamic, ownFilters?: Dynamic) {
  let bySheet = new (Map as Dynamic)(state.ownFilters);
  if (ownFilters.length === 0) bySheet.delete(sheetId);
  else bySheet.set(sheetId, ownFilters);
  let next = {
    ...state,
    ownFilters: bySheet,
  };
  return ownFilters.some(({ sort: sort }: Dynamic) => sort !== null) ? next : setOwnRowOrderOfSheet(next, sheetId, null);
}
export function setOwnRowOrderOfSheet(state: PageState, sheetId?: Dynamic, rows?: Dynamic) {
  if ((state.ownRowOrders.get(sheetId) ?? null) === rows) return state;
  let bySheet = new (Map as Dynamic)(state.ownRowOrders);
  if (rows === null) bySheet.delete(sheetId);
  else bySheet.set(sheetId, rows);
  return {
    ...state,
    ownRowOrders: bySheet,
  };
}
export function takeOwnRowOrderFromSorts(state: PageState, sheetId?: Dynamic) {
  let rows = sortedRowsOfOwnFilters(ownFiltersOfSheet(state, sheetId));
  return rows === null ? state : setOwnRowOrderOfSheet(state, sheetId, rows);
}
export function areSortedRowsInOrder({ ownRowOrders: ownRowOrders }: Dynamic, reads: WorkbookReads, sheetId: Dynamic, ownFilters: Dynamic) {
  let [sortedRows, lineRows] = [sortedRowsOfOwnFilters(ownFilters), reads.linesOf(sheetId)?.rows];
  if (sortedRows === null || lineRows === undefined || ownRowOrders.get(sheetId) === sortedRows) return true;
  let stretches = sortedRows.flatMap((rowId?: Dynamic) => lineRows.stretchesOf(rowId));
  return stretches.every((stretch?: Dynamic, index?: Dynamic) => {
    let previous = stretches[index - 1];
    return previous === undefined || previous.firstIndex + previous.count === stretch.firstIndex;
  });
}
export function areOwnFiltersInForce(state: Dynamic, reads: WorkbookReads, sheetId?: Dynamic, ownFilters?: Dynamic) {
  let rowOrder = reads.linesOf(sheetId)?.rows;
  let frozenRowCount = findSheetById(reads, sheetId)?.frozenRowCount;
  let outOfView = rowsOutOfViewByOwnFiltersOn(state, sheetId);
  let cached = ownFiltersInForceCache.get(ownFilters);
  if (cached !== undefined && cached.order === rowOrder && cached.frozenRowCount === frozenRowCount && cached.outOfView === outOfView)
    return cached.areSo;
  let areSo = isSameIdSet(withoutFrozenRowKeys(reads, sheetId, rowIdsOutOfViewOf(ownFilters)), outOfView);
  ownFiltersInForceCache.set(ownFilters, {
    order: rowOrder,
    frozenRowCount: frozenRowCount,
    outOfView: outOfView,
    areSo: areSo,
  });
  return areSo;
}
export function recordCountsOfOwnFilter(state: Dynamic, reads: WorkbookReads, { rows: rows, table: { sheetId: sheetId } }: Dynamic) {
  if (rows === null || !areOwnFiltersInForce(state, reads, sheetId, ownFiltersOfSheet(state, sheetId))) return null;
  return {
    inView: rows.recordsInView,
    all: rows.records,
  };
}
export function recordCountsOfPendingOwnFilter(state: PageState, reads: WorkbookReads) {
  let ownFilter = ownFilterNotDrawnYet(state);
  return ownFilter === null ? null : recordCountsOfOwnFilter(state, reads, ownFilter);
}
export function putOwnFiltersInForce(state: PageState, reads: ReadsWithTextMeasurer, sheetId?: Dynamic, ownFilters?: Dynamic) {
  let withFilters = setOwnFiltersOfSheet(state, sheetId, ownFilters);
  return areOwnFiltersInForce(state, reads, sheetId, ownFilters)
    ? keepSelectionOnShownRows(withFilters, reads)
    : setRowsHiddenByOwnFilters(withFilters, reads, sheetId, rowIdsOutOfViewOf(ownFilters));
}
export function keepOwnFiltersWhileUnanswered(
  state: PageState,
  reads: ReadsWithTextMeasurer,
  sheetId?: Dynamic,
  ownFilters?: Dynamic,
  keptWhileUnanswered?: Dynamic,
) {
  let withFilters = setOwnFiltersOfSheet(state, sheetId, ownFilters);
  if (keptWhileUnanswered.length === 0) return withFilters;
  if (ownFilters.every(({ filter: filter }: Dynamic) => filter === null))
    return setRowsHiddenByOwnFilters(withFilters, reads, sheetId, NO_ROWS_OUT_OF_VIEW);
  let keptKeys = new (Set as Dynamic)(keptWhileUnanswered.map(({ key: key }: Dynamic) => key));
  let [othersOutOfView, keptOutOfView] = [
    rowIdsOutOfViewOf(ownFiltersOfSheet(state, sheetId).filter(({ key: key }: Dynamic) => !keptKeys.has(key))),
    rowIdsOutOfViewOf(keptWhileUnanswered),
  ];
  let rowIdsStillOut = [...rowsOutOfViewByOwnFiltersOn(state, sheetId)].filter(
    (input?: Dynamic) => othersOutOfView.has(input) || !keptOutOfView.has(input),
  );
  return setRowsHiddenByOwnFilters(withFilters, reads, sheetId, new (Set as Dynamic)(rowIdsStillOut));
}
export function askFilteredRows(reads: WorkbookReads, table?: Dynamic, filter?: Dynamic, isRetry: Dynamic = false) {
  let answer = reads.filteredRows(table, filter);
  if (answer === null) return null;
  if (answer.kind === 'filteredRows')
    return {
      kind: 'rows',
      filter: filter,
      rows: answer,
    };
  let { refusal: refusal } = answer;
  if (refusal === 'filteredTableIsGone' || refusal === 'headerOfFilteredTableIsGone')
    return {
      kind: 'tableIsGone',
    };
  if (refusal === 'dayIsNotKnownToTheFilter')
    return {
      kind: 'notNow',
      why: 'dayIsNotKnown',
    };
  if (refusal !== 'columnIsNotOfTheFilteredTable')
    return {
      kind: 'notNow',
      why: refusal === 'readTookTooLong' ? 'tookTooLong' : 'fault',
    };
  let knownFilter = filterOnKnownColumns(reads, table.sheetId, filter);
  return isRetry || knownFilter === null || knownFilter.allOf.length === filter.allOf.length
    ? {
        kind: 'nothingLeftToAsk',
      }
    : askFilteredRows(reads, table, knownFilter, true);
}
export function refreshFilterTable(reads: WorkbookReads, ownFilter?: Dynamic, cellTables?: Dynamic) {
  if (cellTables === null || cellTables === 'tookTooLong') return cellTables;
  let sameCellTable =
    cellTables.find(({ cellTableId: cellTableId }: Dynamic) => cellTableId === ownFilter.cellTableId) ??
    cellTables.find(({ cellTable: cellTable2 }: Dynamic) => isSameByJson(cellTable2, ownFilter.cellTable));
  let cellTable = sameCellTable ?? reads.cellTableDeclaredAs(ownFilter.table.sheetId, ownFilter.cellTable);
  if (cellTable === null || typeof cellTable === 'string') return cellTable;
  let filterTable = filterTableOfCellTable(cellTable);
  if (filterTable === null) return 'hasNoRecord';
  let { isSure: isSure } = sameCellTable === undefined ? ownFilter.table.header : filterTable.table.header;
  let table = {
    ...filterTable.table,
    header: {
      ...filterTable.table.header,
      isSure: isSure,
    },
  };
  let { liveCellTable: liveCellTable } = filterTable;
  return {
    ...filterTable,
    cellTable: isSameByJson(filterTable.cellTable, ownFilter.cellTable) ? ownFilter.cellTable : filterTable.cellTable,
    liveCellTable: isSameByJson(liveCellTable, ownFilter.liveCellTable) ? ownFilter.liveCellTable : liveCellTable,
    table: isSameByJson(table, ownFilter.table) ? ownFilter.table : table,
    columns: isSameByJson(filterTable.columns, ownFilter.columns) ? ownFilter.columns : filterTable.columns,
  };
}
export function lookAtOwnSort(reads: WorkbookReads, ownFilter?: Dynamic, sort?: Dynamic, rowsIfUnanswered?: Dynamic) {
  let [firstBy, ...thenBy] = sort.by.filter(
    ({ c: columnId }: Dynamic) => ownFilter.columns.some((column?: Dynamic) => column.c === columnId),
  );
  if (firstBy === undefined || !canSortOwnFilterTable(reads, ownFilter)) return null;
  let by = thenBy.length + 1 === sort.by.length ? sort.by : [firstBy, ...thenBy];
  let { sheetId: sheetId, firstRowOfBody: firstRowOfBody, lastRowOfBody: lastRowOfBody } = ownFilter.table;
  let answer = reads.rowsInSortedOrder({
    sheetId: sheetId,
    oneRow: firstRowOfBody,
    otherRow: lastRowOfBody,
    byColumn: firstBy.c,
    direction: firstBy.direction,
    thenBy: thenBy.map(
      ({ c: columnId, direction: direction }: Dynamic) => ({
        byColumn: columnId,
        direction: direction,
      }),
    ),
  });
  let rows = answer?.kind !== 'rowsInSortedOrder' ? rowsIfUnanswered : isSameByJson(answer.rows, sort.rows) ? sort.rows : answer.rows;
  return {
    by: by,
    said: saidOfSortBy(reads, ownFilter, by),
    rows: rows,
    isRefused: answer?.kind === 'refused',
  };
}
export function lookAtOwnFilter(
  reads: WorkbookReads,
  ownFilter?: Dynamic,
  filter?: Dynamic,
  cellTables: Dynamic = reads.cellTables(ownFilter.table.sheetId),
) {
  let found = cellTables === 'asHeld' ? ownFilter : refreshFilterTable(reads, ownFilter, cellTables);
  let hasNoRecordYet = found === 'hasNoRecord' && areaOfFilteredTable(reads, ownFilter) !== null;
  if (found === null)
    return {
      kind: 'notNow',
      why: null,
    };
  if (found === 'tookTooLong' || hasNoRecordYet)
    return {
      kind: 'notNow',
      why: found,
    };
  if (found === 'nowhere' || found === 'hasNoRecord')
    return {
      kind: 'tableIsGone',
    };
  if (filter === null || haveFilterColumnsChanged(found, ownFilter))
    return {
      kind: 'answered',
      found: found,
      filter: null,
      rows: null,
    };
  let asked = askFilteredRows(reads, found.table, filter);
  if (asked === null)
    return {
      kind: 'notNow',
      why: null,
    };
  if (asked.kind === 'nothingLeftToAsk')
    return {
      kind: 'answered',
      found: found,
      filter: null,
      rows: null,
    };
  return asked.kind === 'rows'
    ? {
        ...asked,
        kind: 'answered',
        found: found,
      }
    : asked;
}
export function applyOwnFilter(state: PageState, reads: ReadsWithTextMeasurer, ownFilter?: Dynamic, filter?: Dynamic) {
  let { sheetId: sheetId } = ownFilter.table;
  let isAsHeld = ownFilter.lookedAtAsOf === lookStampOfWorkbook(state) && ownFilter.unanswered === null;
  let looked = isAsHeld ? lookAtOwnFilter(reads, ownFilter, filter, 'asHeld') : lookAtOwnFilter(reads, ownFilter, filter);
  switch (looked.kind) {
    case 'answered': {
      let sort =
        isAsHeld || ownFilter.sort === null ? ownFilter.sort : lookAtOwnSort(reads, looked.found, ownFilter.sort, ownFilter.sort.rows);
      return putOwnFiltersInForce(
        state,
        reads,
        sheetId,
        replaceOwnFilter(state, ownFilter, ownFilterFromAnswer(state, reads, ownFilter.key, looked, sort)),
      );
    }
    case 'tableIsGone':
      return withOwnFilterNotice(putOwnFiltersInForce(state, reads, sheetId, replaceOwnFilter(state, ownFilter, null)), {
        kind: 'filteredTableIsGone',
      });
    case 'notNow':
      if (filter !== null) return looked.why === null ? state : noticeFilterNotWorkedOut(state, looked.why);
      return putOwnFiltersInForce(
        state,
        reads,
        sheetId,
        replaceOwnFilter(state, ownFilter, {
          ...ownFilter,
          filter: filter,
          rows: null,
          unanswered: null,
          lines: [],
        }),
      );
  }
}
export function sortOwnFilter(state: PageState, reads: WorkbookReads, ownFilter?: Dynamic, by?: Dynamic) {
  let { sheetId: sheetId } = ownFilter.table;
  let sort =
    by === null
      ? null
      : lookAtOwnSort(
          reads,
          ownFilter,
          {
            by: by,
            rows: null,
          },
          null,
        );
  let ownFilters = ownFiltersOfSheet(state, sheetId).map(
    (other?: Dynamic) => withOwnSort(other, other.key === ownFilter.key ? sort : null),
  );
  let next = takeOwnRowOrderFromSorts(setOwnFiltersOfSheet(state, sheetId, ownFilters), sheetId);
  let columnIndex = sort === null ? null : reads.columnIndexOf(sheetId, sort.by[0].c);
  if (sort === null || columnIndex === null) return next;
  let column = columnLetters(columnIndex);
  return {
    ...next,
    lastDone: {
      what: 'rowsSorted',
      column: column,
      direction: sort.by[0].direction,
    },
  };
}
export function clearOwnSortByKey(state: PageState, reads: WorkbookReads, key?: Dynamic) {
  let ownFilter = ownFilterByKey(state, key);
  return ownFilter === null ? state : sortOwnFilter(state, reads, ownFilter, null);
}
export function ownRowOrdersNotGivenUp({ ownRowOrders: ownRowOrders }: Dynamic, book: WorkbookReads) {
  let kept = [...ownRowOrders].filter(([sheetId]: Dynamic) => findSheetById(book, sheetId)?.isOwnRowOrderGivenUp === false);
  return kept.length === ownRowOrders.size ? ownRowOrders : new (Map as Dynamic)(kept);
}
export function seeOwnRowOrderChanges(before: Dynamic, { state: state, effects: effects }: Dynamic, event: Dynamic, book: WorkbookReads) {
  if (state.ownRowOrders === before.ownRowOrders)
    return {
      state: state,
      effects: effects,
    };
  let keepsSelection =
    state.rowsAskedFor === null &&
    event.kind !== 'workbookChanged' &&
    event.kind !== 'ownFiltersLookedAtAgain' &&
    event.kind !== 'ownFiltersBroughtBack';
  let seeEffects = [...new (Set as Dynamic)([...before.ownRowOrders.keys(), ...state.ownRowOrders.keys()])].flatMap(
    (sheetId?: Dynamic) => {
      let rows = state.ownRowOrders.get(sheetId) ?? null;
      if (rows === (before.ownRowOrders.get(sheetId) ?? null)) return [];
      let positions = keepsSelection ? selectionPositionsOf(state, book) : null;
      let staysAt =
        sheetId !== state.sheetId
          ? null
          : (positions ?? {
              scrollTop: state.scrollTop,
            });
      return [
        {
          kind: 'seeRowsInOwnOrder',
          sheetId: sheetId,
          rows: rows,
          staysAt: staysAt,
        },
      ];
    },
  );
  let isOwnRowOrderAwaited = state.isOwnRowOrderAwaited || seeEffects.length > 0;
  return {
    state: {
      ...state,
      isOwnRowOrderAwaited: isOwnRowOrderAwaited,
    },
    effects: [...effects, ...seeEffects],
  };
}
export function restoreHeldOwnFilter(state: PageState, reads: ReadsWithTextMeasurer, snapshot?: Dynamic) {
  let current = ownFilterByKey(state, snapshot.held.key);
  if (current === null) return state;
  let { sheetId: sheetId } = snapshot.held.table;
  let heldWithSort = {
    ...snapshot.held,
    sort: current.sort,
  };
  let replaced = replaceOwnFilter(state, current, heldWithSort);
  return replaced.length === snapshot.others.length + 1 &&
    replaced.every(
      (ownFilter?: Dynamic) =>
        ownFilter === heldWithSort || snapshot.others.some((other?: Dynamic) => isSameOwnFilterLook(ownFilter, other)),
    )
    ? setRowsHiddenByOwnFilters(setOwnFiltersOfSheet(state, sheetId, replaced), reads, sheetId, snapshot.rowsOutOfView)
    : putOwnFiltersInForce(state, reads, sheetId, replaced);
}
export function lookAgainAtOwnFilters(state: PageState, reads: ReadsWithTextMeasurer, how?: Dynamic, sheetId?: Dynamic) {
  let held = ownFiltersOfSheet(state, sheetId);
  if (held.length === 0) return state;
  let cellTables = reads.cellTables(sheetId);
  let looked = held.map(
    (held2?: Dynamic) => ({
      held: held2,
      asked: lookAtOwnFilter(reads, held2, held2.filter, cellTables),
    }),
  );
  let refreshed = looked.flatMap(({ held: held2, asked: asked }: Dynamic) => {
    if (asked.kind === 'tableIsGone') return [];
    if (asked.kind === 'answered') {
      let sortKept = haveFilterColumnsChanged(asked.found, held2) ? null : held2.sort;
      let sort = sortKept === null ? null : lookAtOwnSort(reads, asked.found, sortKept, how === 'apply' ? null : sortKept.rows);
      return [ownFilterFromAnswer(state, reads, held2.key, asked, sort)];
    }
    if (held2.unanswered === null || asked.why === null || asked.why === 'hasNoRecord') return [held2];
    return [
      {
        ...held2,
        unanswered: {
          why: asked.why,
          tries: held2.unanswered.tries + 1,
        },
      },
    ];
  });
  let isNewlyAnswered = refreshed.some(
    ({ key: key, rows: rows }: Dynamic) =>
      rows !== null && held.some((input?: Dynamic) => input.key === key && input.unanswered !== null),
  );
  let missesRow =
    typeof how === 'object' && missesRowOutOfViewInArea(state, reads, sheetId, rowIdsOutOfViewOf(refreshed), how.applyIfARowIsMissedAmong);
  let next =
    how === 'apply' || missesRow || isNewlyAnswered
      ? putOwnFiltersInForce(state, reads, sheetId, refreshed)
      : keepOwnFiltersWhileUnanswered(
          state,
          reads,
          sheetId,
          refreshed,
          held.filter(
            ({ key: key, filter: filter }: Dynamic) =>
              filter !== null && !refreshed.some((input?: Dynamic) => input.key === key && input.filter !== null),
          ),
        );
  let hasSortUnanswered = held.some(({ sort: sort }: Dynamic) => sort?.rows === null);
  let withRowOrder = how === 'apply' || hasSortUnanswered ? takeOwnRowOrderFromSorts(next, sheetId) : next;
  let sorted = held.find(({ sort: sort }: Dynamic) => sort !== null);
  let gone = held.find(({ key: key }: Dynamic) => !refreshed.some((input?: Dynamic) => input.key === key));
  if (gone !== undefined)
    return withOwnFilterNotice(
      withRowOrder,
      gone === sorted && gone.filter === null
        ? {
            kind: 'ownSortIsOver',
            why: 'tableIsGone',
          }
        : {
            kind: 'filteredTableIsGone',
          },
    );
  let sortDropped = refreshed.find(({ key: key, sort: sort }: Dynamic) => key === sorted?.key && sort === null);
  if (sortDropped !== undefined) {
    let hasSortColumn = sorted?.sort?.by.some(
      ({ c: columnId }: Dynamic) => sortDropped.columns.some((column?: Dynamic) => column.c === columnId),
    );
    return withOwnFilterNotice(withRowOrder, {
      kind: 'ownSortIsOver',
      why: hasSortColumn === true ? 'tableChanged' : 'columnIsGone',
    });
  }
  let whyNotWorkedOut = looked.flatMap(
    ({ asked: asked }: Dynamic) => (asked.kind === 'notNow' && asked.why !== null ? [asked.why] : []),
  )[0];
  return how !== 'apply' || whyNotWorkedOut === undefined ? withRowOrder : noticeFilterNotWorkedOut(withRowOrder, whyNotWorkedOut);
}
export function recordAndTableRows(reads: WorkbookReads, ownFilter?: Dynamic) {
  let [recordsArea, tableArea] = [ownFilterRecordsArea(reads, ownFilter), ownFilterTableArea(reads, ownFilter)];
  return recordsArea === null || tableArea === null
    ? null
    : {
        records: indexRangeOfArea(recordsArea),
        all: indexRangeOfArea(tableArea),
      };
}
export function addOwnFilter(state: PageState, reads: ReadsWithTextMeasurer, ownFilter?: Dynamic) {
  let rows = recordAndTableRows(reads, ownFilter);
  let kept = ownFiltersOfSheet(state, ownFilter.table.sheetId).filter((other?: Dynamic) => {
    let otherRows = recordAndTableRows(reads, other);
    if (rows === null || otherRows === null) return true;
    return !indexRangesOverlap(rows.records, otherRows.all) && !indexRangesOverlap(otherRows.records, rows.all);
  });
  return putOwnFiltersInForce(state, reads, ownFilter.table.sheetId, [...kept, ownFilter]);
}
export const filterTableAtCell = (reads: WorkbookReads, cellId?: Dynamic) => filterTableOfCellTable(reads.cellTableAt(cellId));
export const NO_OWN_ROW_ORDERS = new (Map as Dynamic)();
export const isOwnFilterUnused = ({ filter: filter, sort: sort }: Dynamic) => filter === null && sort === null;
export const NO_OWN_FILTERS = new (Map as Dynamic)();
export const ownFiltersOfSheet = ({ ownFilters: ownFilters }: Dynamic, sheetId?: Dynamic) => ownFilters.get(sheetId) ?? [];
export const isOwnFilterDrawn = (state: Dynamic, { key: key }: Dynamic) => key !== ownFilterKeyNotDrawnYet(state);
export const ownFilterKeyNotDrawnYet = ({ ownFilterList: ownFilterList, rowsAskedFor: rowsAskedFor }: Dynamic) =>
  ownFilterList?.isFilterNotDrawnYet === true
    ? ownFilterList.tableKey
    : rowsAskedFor?.isFilterNotDrawnYet === true
      ? (rowsAskedFor.table?.key ?? null)
      : null;
export const drawnOwnFiltersCache = new (WeakMap as Dynamic)();
export const ownFiltersWithoutKeyCache = new (WeakMap as Dynamic)();
export const allOwnFilters = ({ ownFilters: ownFilters }: Dynamic) => [...ownFilters.values()].flat();
export const ownFilterByKey = (state?: Dynamic, key?: Dynamic) =>
  allOwnFilters(state).find((ownFilter?: Dynamic) => ownFilter.key === key) ?? null;
export const nextOwnFilterKey = (state?: Dynamic) =>
  String(1 + (Math.max as Dynamic)(0, ...allOwnFilters(state).map(({ key: key }: Dynamic) => Number(key))));
export const lookStampOfWorkbook = ({
  workbookChangeCount: workbookChangeCount,
  formulasWorkedOutCount: formulasWorkedOutCount,
}: Dynamic) => workbookChangeCount + formulasWorkedOutCount;
export const columnLabelOfFilterTable = (reads: WorkbookReads, { table: { sheetId: sheetId }, columns: columns }: Dynamic, c?: Dynamic) =>
  columnLabelOf(
    reads,
    sheetId,
    columns.find((column?: Dynamic) => column.c === c) ?? {
      c: c,
      name: null,
    },
  );
export const NUMBER_ROW_SEARCH_LIMIT = 50;
export const isFilterTableEmpty = ({ table: table }: Dynamic) => table.runs.length === 0;
export const cutsRowGroup = (rows?: Dynamic, rowGroups?: Dynamic) =>
  rowGroups.some((rowGroup?: Dynamic) => rowGroup.count > 1 && spanCutsOwnRowOrder(rows, rowGroup));
export const isOwnFilterSortable = (reads: WorkbookReads, ownFilter?: Dynamic) =>
  isFilterTableEmpty(ownFilter) && canSortOwnFilterTable(reads, ownFilter);
export const saidOfSortBy = (reads: WorkbookReads, ownFilter: Dynamic, [firstBy, ...thenBy]: Dynamic) => [
  saidOfSortColumn(reads, ownFilter, firstBy),
  ...thenBy.map((by?: Dynamic) => saidOfSortColumn(reads, ownFilter, by)),
];
export const NO_ROWS_OUT_OF_VIEW = new (Set as Dynamic)();
export const rowsOutOfViewByOwnFiltersOn = ({ rowsOutOfViewByOwnFilters: rowsOutOfViewByOwnFilters }: Dynamic, sheetId?: Dynamic) =>
  rowsOutOfViewByOwnFilters.get(sheetId) ?? NO_ROWS_OUT_OF_VIEW;
export const sortedRowsOfOwnFilters = (ownFilters?: Dynamic) =>
  ownFilters.find(({ sort: sort }: Dynamic) => sort !== null)?.sort?.rows ?? null;
export const isSameIdSet = (ids?: Dynamic, otherIds?: Dynamic) =>
  ids.size === otherIds.size && [...ids].every((id?: Dynamic) => otherIds.has(id));
export const ownFiltersInForceCache = new (WeakMap as Dynamic)();
export const filterOnKnownColumns = (reads: WorkbookReads, sheetId?: Dynamic, filter?: Dynamic) =>
  keepFilterClausesWhereColumns(filter, (columnId?: Dynamic) => reads.columnIndexOf(sheetId, columnId) !== null);
export const isSameByJson = (value?: Dynamic, otherValue?: Dynamic) => JSON.stringify(value) === JSON.stringify(otherValue);
export const haveFilterColumnsChanged = (found?: Dynamic, ownFilter?: Dynamic) =>
  found.cellTable.firstColumn !== ownFilter.cellTable.firstColumn &&
  found.cellTable.lastColumn !== ownFilter.cellTable.lastColumn &&
  ![found.cellTable.firstColumn, found.cellTable.lastColumn].every(
    (columnId?: Dynamic) => ownFilter.columns.some(({ c: c }: Dynamic) => c === columnId),
  );
export const ownFilterFromAnswer = (
  state: Dynamic,
  reads: WorkbookReads,
  key: Dynamic,
  { found: found, filter: filter, rows: rows }: Dynamic,
  sort?: Dynamic,
) => ({
  ...found,
  key: key,
  filter: filter,
  rows: rows,
  sort: sort,
  unanswered: null,
  lines: filter === null ? [] : describeFilterLines(reads, found, filter),
  lookedAtAsOf: lookStampOfWorkbook(state),
});
export const NEVER_LOOKED_AT = -1;
export const withOwnFilterNotice = (state?: Dynamic, notice?: Dynamic) => ({
  ...state,
  notice: notice,
});
export const noticeFilterNotWorkedOut = (state?: Dynamic, why?: Dynamic) =>
  withOwnFilterNotice(
    state,
    why === 'hasNoRecord'
      ? {
          kind: 'noTableToFilter',
        }
      : {
          kind: 'ownFilterNotWorkedOut',
          why: why,
        },
  );
export const replaceOwnFilter = (state: Dynamic, { key: key, table: table }: Dynamic, replacement?: Dynamic) =>
  ownFiltersOfSheet(state, table.sheetId).flatMap((ownFilter?: Dynamic) => (ownFilter.key === key ? (replacement ?? []) : ownFilter));
export const withOwnSort = (ownFilter?: Dynamic, sort?: Dynamic) =>
  ownFilter.sort === sort
    ? ownFilter
    : {
        ...ownFilter,
        sort: sort,
      };
export const heldOwnFilterSnapshot = (state?: Dynamic, held?: Dynamic) => ({
  held: held,
  others: ownFiltersOfSheet(state, held.table.sheetId).filter((ownFilter?: Dynamic) => ownFilter !== held),
  rowsOutOfView: rowsOutOfViewByOwnFiltersOn(state, held.table.sheetId),
});
export const isSameOwnFilterLook = (ownFilter?: Dynamic, other?: Dynamic) =>
  ownFilter.key === other.key &&
  ownFilter.filter === other.filter &&
  JSON.stringify(ownFilter.rows?.rowsOutOfView) === JSON.stringify(other.rows?.rowsOutOfView);
export const missesRowOutOfViewInArea = (
  state: Dynamic,
  reads: WorkbookReads,
  sheetId: Dynamic,
  rowIdsStillOut: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic,
) =>
  [...rowsOutOfViewByOwnFiltersOn(state, sheetId)].some((rowId?: Dynamic) => {
    let rowIndex = rowIdsStillOut.has(rowId) ? null : reads.rowIndexOf(sheetId, rowId);
    return rowIndex !== null && rowIndex >= topRowIndex && rowIndex < topRowIndex + rowCount;
  });
export const refreshStaleOwnFilters = (state: PageState, reads: ReadsWithTextMeasurer, sheetId?: Dynamic) =>
  ownFiltersOfSheet(state, sheetId).some(({ lookedAtAsOf: lookedAtAsOf }: Dynamic) => lookedAtAsOf !== lookStampOfWorkbook(state))
    ? lookAgainAtOwnFilters(state, reads, 'look', sheetId)
    : state;
export const indexRangeOfArea = ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) => ({
  first: topRowIndex,
  last: topRowIndex + rowCount - 1,
});
export const addOwnFilterForTable = (state: PageState, reads: ReadsWithTextMeasurer, filterTable?: Dynamic) =>
  addOwnFilter(
    state,
    reads,
    ownFilterFromAnswer(
      state,
      reads,
      nextOwnFilterKey(state),
      {
        kind: 'answered',
        found: filterTable,
        filter: null,
        rows: null,
      },
      null,
    ),
  );
