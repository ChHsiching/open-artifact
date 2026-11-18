import type { Dynamic } from '../dynamic.ts';
import {
  drawnOwnFiltersOfSheet,
  rowsOutOfViewByOwnFiltersOn,
  lookStampOfWorkbook,
  areOwnFiltersInForce,
  areSortedRowsInOrder,
  isFilterTableEmpty,
} from './own-filters.ts';
import { columnsOfFilterItem } from './filter-model.ts';
import { areasToA1AsStored } from '../formulas/from-words/where.ts';
import { areasOfRuleRanges } from '../format/conditional/descriptions.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function ownFilterBar(state: PageState, reads: WorkbookReads) {
  let drawn = drawnOwnFiltersOfSheet(state, state.sheetId);
  if (drawn.length === 0) return null;
  let cached = ownFilterBarCache.get(drawn);
  let outOfView = rowsOutOfViewByOwnFiltersOn(state, state.sheetId);
  let { ownRowOrders: ownRowOrders } = state;
  if (cached?.reads === reads && cached.asOf === lookStampOfWorkbook(state) && cached.outOfView === outOfView && cached.ownRowOrders === ownRowOrders)
    return cached.bar;
  let bar = buildOwnFilterBar(state, reads, drawn);
  ownFilterBarCache.set(drawn, {
    reads: reads,
    asOf: lookStampOfWorkbook(state),
    outOfView: outOfView,
    ownRowOrders: ownRowOrders,
    bar: bar,
  });
  return bar;
}
export function buildOwnFilterBar(state: PageState, reads: WorkbookReads, ownFilters?: Dynamic) {
  let { sheetId: sheetId } = state;
  let rowsOfFilters = ownFilters.flatMap(({ rows: rows }: Dynamic) => rows ?? []);
  let isRefreshOffered =
    ownFilters.some(({ unanswered: unanswered, sort: sort }: Dynamic) => unanswered !== null || sort?.isRefused === true) ||
    !areOwnFiltersInForce(state, reads, sheetId, ownFilters) ||
    !areSortedRowsInOrder(state, reads, sheetId, ownFilters);
  let [sort = null] = ownFilters.flatMap((ownFilter?: Dynamic) => {
    if (ownFilter.sort === null) return [];
    let { by: by, said: said } = ownFilter.sort;
    return {
      tableKey: ownFilter.key,
      c: by[0].c,
      said: said,
      canBeForEveryone: isFilterTableEmpty(ownFilter),
    };
  });
  let dayTries = ownFilters.flatMap(
    ({ unanswered: unanswered }: Dynamic) => (unanswered?.why === 'dayIsNotKnown' ? [unanswered.tries] : []),
  );
  return {
    sheetId: sheetId,
    sort: sort,
    isNothingAsked: ownFilters.every(({ filter: filter }: Dynamic) => filter === null),
    records:
      rowsOfFilters.length === 0 || isRefreshOffered
        ? null
        : {
            inView: rowsOfFilters.reduce((input: Dynamic, { recordsInView: recordsInView }: Dynamic) => input + recordsInView, 0),
            all: rowsOfFilters.reduce((input: Dynamic, { records: records }: Dynamic) => input + records, 0),
          },
    lines: ownFilters.flatMap(
      ({ key: key, lines: lines, filter: filter }: Dynamic) =>
        lines.map((line?: Dynamic, lineIndex?: Dynamic) => {
          let [onlyColumn, ...otherColumns] = [...new (Set as Dynamic)(filter?.allOf[lineIndex]?.anyOf.flatMap(columnsOfFilterItem) ?? [])];
          return {
            tableKey: key,
            lineIndex: lineIndex,
            line: line,
            c: otherColumns.length > 0 ? null : (onlyColumn ?? null),
          };
        }),
    ),
    cellsBesideOutOfView: isRefreshOffered
      ? ''
      : areasToA1AsStored(
          areasOfRuleRanges(
            reads,
            sheetId,
            rowsOfFilters.flatMap(({ cellsBesideTheTableOutOfView: cellsBesideTheTableOutOfView }: Dynamic) => cellsBesideTheTableOutOfView),
          ),
          ownRowOrderOfSheet(reads, sheetId),
        ),
    isRefreshOffered: isRefreshOffered,
    behindAsOf: ownFilters.some(({ lookedAtAsOf: lookedAtAsOf }: Dynamic) => lookedAtAsOf !== lookStampOfWorkbook(state))
      ? lookStampOfWorkbook(state)
      : null,
    dayAwaitedSinceTry: dayTries.length === 0 ? null : (Math.max as Dynamic)(...dayTries),
  };
}
export const ownFilterBarCache = new (WeakMap as Dynamic)();
