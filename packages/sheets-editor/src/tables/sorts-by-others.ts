import type { Dynamic } from '../dynamic.ts';
import { columnLetters } from '../model/a1-references.ts';
import { reportErrorsSoftlyAt, reportErrorSoftly } from '../engine/loader.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function sortedRowSpan({ cells: cells }: Dynamic, rowCount?: Dynamic, rowsNow?: Dynamic, rowsSorted?: Dynamic) {
  if (cells === null || rowsNow === rowsSorted || rowsNow.count !== rowsSorted.count) return null;
  let [first, last] = [rowsSorted.indexOf(cells.topLeft.r), rowsSorted.indexOf(cells.bottomRight.r)];
  if (first === null || last === null || last - first + 1 !== rowCount) return null;
  return [cells.topLeft.r, cells.bottomRight.r].every((rowId?: Dynamic) => {
    let index = rowsNow.indexOf(rowId);
    return index !== null && index >= first && index <= last;
  })
    ? {
        first: first,
        last: last,
      }
    : null;
}
export function compareSortValues(value?: Dynamic, other?: Dynamic) {
  if (value.kind === 'number' && other.kind === 'number') return value.value - other.value;
  if (value.kind === 'boolean' && other.kind === 'boolean') return Number(value.value) - Number(other.value);
  if (value.kind === 'text' && other.kind === 'text') {
    let [text, otherText] = [value.value.toLowerCase(), other.value.toLowerCase()];
    return text < otherText ? -1 : Number(text > otherText);
  }
  return kindOrderOf(value) - kindOrderOf(other);
}
export function sortDirectionOf(values?: Dynamic) {
  let [ascents, descents, lastKindOrder]: Dynamic = [0, 0, 0];
  let lastValue: Dynamic = null;
  for (let value of values as Dynamic) {
    let kindOrder = kindOrderOf(value);
    if (kindOrder < lastKindOrder && lastKindOrder >= VALUE_KIND_ORDER.error) return null;
    if (value !== null && kindOrder < VALUE_KIND_ORDER.error) {
      let comparison = lastValue === null ? 0 : compareSortValues(lastValue, value);
      if (comparison < 0) ascents += 1;
      if (comparison > 0) descents += 1;
      lastValue = value;
    }
    lastKindOrder = kindOrder;
  }
  if (ascents > 0 && descents > 0) return null;
  if (ascents > 0) return 'ascending';
  if (descents > 0) return 'descending';
  return lastValue !== null && lastKindOrder >= VALUE_KIND_ORDER.error ? 'either' : null;
}
export function sortValueOfCell(reads: WorkbookReads, sheetId?: Dynamic, rowId?: Dynamic, columnId?: Dynamic) {
  let cell =
    rowId === null
      ? null
      : reads.cellOnShowIn({
          sheetId: sheetId,
          rowId: rowId,
          columnId: columnId,
        });
  if (cell === null || !('input' in cell)) return null;
  let { input: input } = cell;
  if (input.kind === 'dropdownOption')
    return {
      kind: 'option',
      value: input.optionId,
    };
  let value = input.kind === 'number' || input.kind === 'text' || input.kind === 'boolean' ? input : cell.value;
  if (value === undefined) return NOT_TOLD;
  return value.kind === 'text' && value.value === '' ? null : value;
}
export function hasValueRuns(values?: Dynamic) {
  let seen = new (Set as Dynamic)();
  let lastKey: Dynamic = null;
  for (let value of values as Dynamic) {
    let key = value === null ? '' : `${value.kind} ${value.value}`;
    if (key !== lastKey && seen.has(key)) return false;
    seen.add(key);
    lastKey = key;
  }
  return seen.size > 1;
}
export function findSortedColumn(readsBefore: Dynamic, reads: WorkbookReads, sheetId: Dynamic, { first: first, last: last }: Dynamic) {
  let rowCount = last - first + 1;
  if (rowCount > MAX_SORTED_ROWS) return null;
  let area = reads.areaOnShowIn(sheetId, {
    topRowIndex: first,
    rowCount: rowCount,
    leftColumnIndex: 0,
    columnCount: 1 / 0,
  });
  if (area === null || area.columnCount > MAX_SORTED_COLUMNS) return null;
  let rowIdsOf = (someReads?: Dynamic) => {
    let rows = someReads.linesOf(sheetId)?.rows;
    return Array.from<Dynamic, Dynamic>(
      {
        length: rowCount,
      },
      (input?: Dynamic, offset?: Dynamic) => rows?.idAt(first + offset) ?? null,
    );
  };
  let [before, after] = [
    {
      reads: readsBefore,
      rowIds: rowIdsOf(readsBefore),
    },
    {
      reads: reads,
      rowIds: rowIdsOf(reads),
    },
  ];
  let sortedColumns: Dynamic = [];
  for (let columnOffset: Dynamic = 0; columnOffset < area.columnCount; columnOffset += 1) {
    let columnId = reads.linesOf(sheetId)?.columns.idAt(area.leftColumnIndex + columnOffset) ?? null;
    if (columnId === null) continue;
    let sortValuesIn = ({ reads: reads2, rowIds: rowIds }: Dynamic) => {
      let values = rowIds.map((input?: Dynamic) => sortValueOfCell(reads2, sheetId, input, columnId));
      return values.includes(NOT_TOLD) ? null : values.filter((input?: Dynamic) => input !== NOT_TOLD);
    };
    let valuesAfter = sortValuesIn(after);
    let sortValuesAfter = valuesAfter?.filter((input?: Dynamic) => input?.kind !== 'option');
    if (valuesAfter === null || sortValuesAfter === undefined) return null;
    if (sortValuesAfter.length < rowCount && hasValueRuns(valuesAfter)) return null;
    if (sortValuesAfter.length < rowCount) continue;
    let sortValuesBefore = sortValuesIn(before)?.filter((input?: Dynamic) => input?.kind !== 'option');
    if (sortValuesBefore === undefined) return null;
    let directionAfter = sortDirectionOf(sortValuesAfter);
    if (directionAfter !== null && directionAfter !== sortDirectionOf(sortValuesBefore)) sortedColumns.push(area.leftColumnIndex + columnOffset);
  }
  return sortedColumns.length === 1 ? (sortedColumns[0] ?? null) : null;
}
export function createSortsByOthers(options?: Dynamic) {
  let editsStreamed = new (Map as Dynamic)();
  let sorts: Dynamic = NO_SORTS;
  let sortCount: Dynamic = 0;
  let rowsAtSort = new (Map as Dynamic)();
  let workbook: Dynamic = null;
  let stopFollowing: Dynamic = null;
  let areRowsUnchanged = (sheetId?: Dynamic) => workbook?.reads().linesOf(sheetId)?.rows === rowsAtSort.get(sheetId)?.rows;
  let listeners = new (Set as Dynamic)();
  let setSorts = (next?: Dynamic) => {
    sorts = next;
    for (let listener of listeners as Dynamic) listener();
  };
  let dropStaleSorts = () => {
    let kept = Array.from<Dynamic>(sorts).filter(([input]: Dynamic) => areRowsUnchanged(input));
    if (kept.length < sorts.size) setSorts(new (Map as Dynamic)(kept));
  };
  let noteEditsOfOthers = (edits: Dynamic, readsBefore: Dynamic, reads: WorkbookReads) => {
    let [edit, ...laterEdits] = edits;
    let streamed = edit === undefined ? undefined : editsStreamed.get(edit.revision);
    let lastRevision = edits.at(-1)?.revision ?? 0;
    for (let revision of editsStreamed.keys() as Dynamic) if (revision <= lastRevision) editsStreamed.delete(revision);
    if (edit === undefined || laterEdits.length > 0 || readsBefore === null || streamed === undefined) return;
    if (edit.placeChanged === null) return;
    let { sheetId: sheetId } = edit.placeChanged;
    let [rowsBefore, rowsAfter] = [readsBefore.linesOf(sheetId)?.rows, reads.linesOf(sheetId)?.rows];
    if (rowsBefore === undefined || rowsAfter === undefined) return;
    let sortedRows = sortedRowSpan(edit.placeChanged, streamed.rowsInItsOneMove, rowsBefore, rowsAfter);
    if (sortedRows === null) return;
    sortCount += 1;
    let nth = sortCount;
    rowsAtSort.set(sheetId, {
      nth: nth,
      rows: rowsAfter,
    });
    let columnIndex = findSortedColumn(readsBefore, reads, sheetId, sortedRows);
    let cellId = columnIndex === null ? null : reads.cellIdAt(sheetId, sortedRows.first, columnIndex);
    let column = new (Promise as Dynamic)((resolve?: Dynamic) => {
      if (columnIndex === null || cellId === null || workbook === null) resolve(null);
      else
        workbook.tableAt(cellId, (table?: Dynamic) => {
          let heading =
            (table?.table.header?.isSure === true ? table.columns : []).find(({ c: c }: Dynamic) => c === cellId.columnId)?.name ?? null;
          resolve({
            heading: heading,
            letters: columnLetters(columnIndex),
          });
        });
    });
    let { maker: maker } = streamed;
    let by =
      maker?.kind !== 'person'
        ? Promise.resolve(maker)
        : options.profiles([maker.userId]).then(
            ([profile]: Dynamic) => ({
              kind: 'person',
              name: profile?.name ?? '',
              avatarUrl: profile?.avatarUrl ?? '',
            }),
          );
    (async (): Promise<Dynamic> => {
      let [firstRow, lastRow] = [sortedRows.first + 1, sortedRows.last + 1];
      let sort = {
        nth: nth,
        sheetId: sheetId,
        by: await by,
        firstRow: firstRow,
        lastRow: lastRow,
        column: await column,
      };
      if (rowsAtSort.get(sheetId)?.nth === nth && areRowsUnchanged(sheetId)) setSorts(new (Map as Dynamic)(sorts).set(sheetId, sort));
    })().catch(reportErrorsSoftlyAt('sortsByOthers'));
  };
  return {
    now: () => sorts,
    onChanged(listener?: Dynamic) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    told(sort?: Dynamic) {
      if (sorts.get(sort.sheetId) !== sort) return;
      let kept = new (Map as Dynamic)(sorts);
      kept.delete(sort.sheetId);
      setSorts(kept);
    },
    streamChanged: () => editsStreamed.clear(),
    follow(workbook2?: Dynamic) {
      if (workbook2 === workbook) return;
      stopFollowing?.();
      workbook = workbook2;
      stopFollowing = workbook2?.onChanged(dropStaleSorts) ?? null;
      dropStaleSorts();
    },
    editStreamed(revision?: Dynamic, streamed?: Dynamic) {
      if (streamed.rowsInItsOneMove !== null && !streamed.isOfViewer) editsStreamed.set(revision, streamed);
    },
    editsOfOthersMade(...args: Dynamic[]) {
      try {
        (noteEditsOfOthers as Dynamic)(...args);
      } catch (error: Dynamic) {
        reportErrorSoftly(error, 'sortsByOthers');
      }
    },
  };
}
export const NO_SORTS = new (Map as Dynamic)();
export const NO_SORTS_BY_OTHERS = {
  now: () => NO_SORTS,
  onChanged: () => () => {},
  told() {},
};
export const MAX_SORTED_ROWS = 5000;
export const MAX_SORTED_COLUMNS = 40;
export const VALUE_KIND_ORDER = {
  number: 0,
  text: 1,
  boolean: 2,
  error: 3,
};
export const BLANK_KIND_ORDER = 4;
export const kindOrderOf = (value?: Dynamic) => (value === null ? BLANK_KIND_ORDER : VALUE_KIND_ORDER[value.kind]);
export const NOT_TOLD = 'notTold';
