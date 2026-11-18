import type { Dynamic } from '../dynamic.ts';
import { areaOfReference } from '../model/reference-areas.ts';
import { cellValueOf } from '../model/cell-values.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function columnHoldsOf(reads: WorkbookReads, { table: table }: Dynamic, { c: c, name: name, kind: kind }: Dynamic) {
  let found = reads.valuesOfFilteredColumn(table, null, c);
  let valuesOfColumn = found?.kind === 'valuesOfFilteredColumn' ? found : null;
  let cellAt = (rowId?: Dynamic) => ({
    sheetId: table.sheetId,
    rowId: rowId,
    columnId: c,
  });
  let [firstValue] = valuesOfColumn?.values.filter(({ value: value }: Dynamic) => value !== null) ?? [];
  let dropdown = firstValue === undefined ? null : reads.dropdownOf(cellAt(firstValue.firstInRow));
  return {
    c: c,
    name: name,
    kind: kind,
    values: (valuesOfColumn?.values ?? []).map(({ value: value, firstInRow: firstInRow, records: records }: Dynamic) => {
      let input = reads.cellOf(cellAt(firstInRow))?.input;
      let users = input?.kind === 'users' ? input.users : input?.kind === 'user' ? [input] : [];
      return {
        value: value,
        records: records,
        userIds: users.map(({ userId: userId }: Dynamic) => userId),
      };
    }),
    areMoreValuesLeftOut: valuesOfColumn?.areMoreLeftOut ?? true,
    optionsOfDropdown: dropdown?.options.map(({ label: label }: Dynamic) => label) ?? null,
  };
}
export function isTooMuchToRead(holds?: Dynamic) {
  let cached = tooMuchToReadCache.get(holds);
  if (cached !== undefined) return cached;
  let [optionCount, characterCount]: Dynamic = [0, 0];
  for (let { name: name, values: values, optionsOfDropdown: options } of holds.columns as Dynamic) {
    optionCount += options?.length ?? 0;
    characterCount += name?.length ?? 0;
    for (let text of (options ?? []) as Dynamic) characterCount += text.length;
    for (let { value: text } of values as Dynamic) characterCount += text?.kind === 'text' ? text.value.length : 0;
  }
  let isTooMuch = optionCount > MOST_DROPDOWN_OPTIONS_HELD || characterCount > MOST_TEXT_CHARACTERS_HELD;
  tooMuchToReadCache.set(holds, isTooMuch);
  return isTooMuch;
}
export function tableHoldsOf(reads: WorkbookReads, table?: Dynamic) {
  let sheet = reads.sheetAsItStands(table.table.sheetId);
  let key = JSON.stringify(table.table);
  let cached = sheet === null ? undefined : tableHoldsCache.get(sheet)?.get(key);
  if (cached !== undefined) return cached;
  let holds = {
    records: 0,
    columns: table.columns.map((column?: Dynamic) => columnHoldsOf(reads, table, column)),
  };
  let isComplete = holds.columns.every(
    ({ values: values, areMoreValuesLeftOut: areMoreValuesLeftOut }: Dynamic) => values.length > 0 || !areMoreValuesLeftOut,
  );
  if (sheet !== null && isComplete) tableHoldsCache.set(sheet, (tableHoldsCache.get(sheet) ?? new (Map as Dynamic)()).set(key, holds));
  return holds;
}
export function tableAtCellCached(reads: WorkbookReads, cell?: Dynamic) {
  let sheet = reads.sheetAsItStands(cell.sheetId);
  let key = cell.rowId + ' ' + cell.columnId;
  let table = (sheet === null ? undefined : tableAtCellCache.get(sheet)?.get(key)) ?? reads.tableAtCell(cell);
  if (sheet !== null && table !== null) tableAtCellCache.set(sheet, (tableAtCellCache.get(sheet) ?? new (Map as Dynamic)()).set(key, table));
  return table;
}
export function rowsThatAreNotRecords(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, rowCount: rowCount, leftColumnIndex: leftColumnIndex, columnCount: columnCount }: Dynamic,
) {
  let rows: Dynamic = [];
  let isOneEmpty: Dynamic = false;
  let sumsByColumn = new (Map as Dynamic)();
  let rowsAtEachEnd = Math.max(Math.floor(MOST_CELLS_SCANNED_FOR_TOTALS / 2 / columnCount), 1);
  for (let index: Dynamic = 0; index < rowCount; index += 1) {
    if (index === rowsAtEachEnd && rowCount > 2 * rowsAtEachEnd) {
      index = rowCount - rowsAtEachEnd;
      sumsByColumn.clear();
    }
    let rowIndex = topRowIndex + index;
    let cells = reads
      .columnIndexesOnShowIn(sheetId, rowIndex)
      .filter((columnIndex?: Dynamic) => columnIndex >= leftColumnIndex && columnIndex < leftColumnIndex + columnCount)
      .flatMap((columnIndex?: Dynamic) => {
        let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
        let shown = cellId === null ? null : reads.cellOnShowIn(cellId);
        return shown === null
          ? []
          : [
              {
                columnIndex: columnIndex,
                shown: shown,
              },
            ];
      });
    isOneEmpty ||= cells.length === 0;
    let sumsReferencedRows = ({ columnIndex: columnIndex, shown: shown }: Dynamic) => {
      if (!('input' in shown) || shown.input.kind !== 'formula') return false;
      let spans = shown.input.formula.references.slice(0, MOST_REFERENCES_READ).flatMap((reference?: Dynamic) => {
        let area = reference.sheetId === sheetId ? areaOfReference(reads, reference) : null;
        let coversColumn = area !== null && area.leftColumnIndex <= columnIndex && columnIndex < area.leftColumnIndex + area.columnCount;
        let from = Math.max(area?.topRowIndex ?? 0, topRowIndex);
        let to = Math.min((area?.topRowIndex ?? 0) + (area?.rowCount ?? 0), topRowIndex + rowCount);
        return coversColumn && from < to
          ? [
              {
                from: from,
                to: to,
              },
            ]
          : [];
      });
      spans.sort((span?: Dynamic, other?: Dynamic) => span.from - other.from);
      let [rowsCovered, coveredTo]: Dynamic = [0, topRowIndex];
      for (let { from: from, to: to } of spans as Dynamic) {
        rowsCovered += Math.max(to - Math.max(from, coveredTo), 0);
        coveredTo = Math.max(coveredTo, to);
      }
      return rowsCovered >= 2;
    };
    let saysTotal = cells.slice(0, 2).some(({ shown: shown }: Dynamic) => {
      let value = cellValueOf(shown);
      return value?.kind === 'text' && value.value.length <= MOST_NAME_CHARACTERS && totalRowLabelPattern.test(value.value);
    });
    let numbers = cells.flatMap(({ columnIndex: columnIndex, shown: shown }: Dynamic) => {
      let value = cellValueOf(shown);
      return value?.kind === 'number' && value.value !== 0
        ? [
            {
              columnIndex: columnIndex,
              number: value.value,
            },
          ]
        : [];
    });
    let isSumOfRowsAbove = ({ columnIndex: columnIndex, number: number }: Dynamic) => {
      let { sum: sum, count: count } = sumsByColumn.get(columnIndex) ?? {
        sum: 0,
        count: 0,
      };
      return count >= LEAST_ROWS_FOR_TOTAL && Math.abs(number - sum) <= 0.000000001 * Math.abs(sum);
    };
    let sumCount = numbers.filter(isSumOfRowsAbove).length;
    let isTotalRow = sumCount > 1 && sumCount * 2 > numbers.length;
    if (cells.length <= 1 || saysTotal || isTotalRow || cells.some(sumsReferencedRows)) {
      rows.push(rowIndex);
      continue;
    }
    for (let { columnIndex: columnIndex, number: number } of numbers as Dynamic) {
      let { sum: sum, count: count } = sumsByColumn.get(columnIndex) ?? {
        sum: 0,
        count: 0,
      };
      sumsByColumn.set(columnIndex, {
        sum: sum + number,
        count: count + 1,
      });
    }
  }
  return {
    rows: rows,
    isOneEmpty: isOneEmpty,
    isMiddleUnread: rowCount > 2 * rowsAtEachEnd,
  };
}
export const RULE_WORDS_NOT_READ = {
  kind: 'notRead',
  isOnItsWay: false,
};
export const tableHoldsCache = new (WeakMap as Dynamic)();
export const MOST_DROPDOWN_OPTIONS_HELD = 500;
export const MOST_TEXT_CHARACTERS_HELD = 500000;
export const tooMuchToReadCache = new (WeakMap as Dynamic)();
export const tableAtCellCache = new (WeakMap as Dynamic)();
export const MOST_CELLS_SCANNED_FOR_TOTALS = 1e5;
export const MOST_REFERENCES_READ = 100;
export const MOST_NAME_CHARACTERS = 100;
export const LEAST_ROWS_FOR_TOTAL = 3;
export const MOST_RULE_RANGES = 40;
export const totalRowLabelPattern =
  /^\s*(?:(?:grand\s+|sub-?\s*)?totals?|average|avg)\b|\b(?:(?:sub-?\s*)?totals?|average|avg|mean|roll-?\s?up)\s*[.:]?\s*$|^\s*(?:sum|mean|median|max|min|maximum|minimum|overall|grand|count|all|net|ytd|tot|Σ)\s*[.:]?\s*$/i;
