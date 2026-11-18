import type { Dynamic } from '../dynamic.ts';
import { cellTextForCsv, fullDateBehindMonthDayTime, escapeFirstCsvCellText } from '../clipboard/text-escaping.ts';
import { numberFormatOfCell, fullShownTextOfCell } from '../model/workbook.ts';
import { csvFileName } from './file-names.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function csvLineOf(fields?: Dynamic) {
  let startsWithSign = CSV_LEADING_SIGN_PATTERN.test(fields[0] ?? '');
  let line = fields
    .map((field?: Dynamic, index?: Dynamic) => (startsWithSign && index > 0 && field !== '' ? quoteCsvField(field) : csvField(field)))
    .join(',');
  return line === '' ? '""' : line;
}
export function shownTextsForCsv(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let textsByRow = new (Map as Dynamic)();
  let rowIndexById = new (Map as Dynamic)();
  let columnIndexById = new (Map as Dynamic)();
  for (let cell of reads.cellsOnShowIn(sheetId, area) as Dynamic) {
    let rowIndex: Dynamic = rowIndexById.get(cell.rowId);
    let columnIndex: Dynamic = columnIndexById.get(cell.columnId);
    if (rowIndex === undefined || columnIndex === undefined) {
      let position = reads.positionOfCell(cell);
      if (position === null) continue;
      ({ rowIndex: rowIndex, columnIndex: columnIndex } = position);
      rowIndexById.set(cell.rowId, rowIndex);
      columnIndexById.set(cell.columnId, columnIndex);
    }
    let cellOnShow = reads.cellOnShowIn(cell);
    let shownText = cellTextForCsv(
      cellOnShow,
      fullDateBehindMonthDayTime(cellOnShow, () => numberFormatOfCell(reads, cell).pattern) ?? fullShownTextOfCell(reads, cell),
      reads.decimalSign,
    );
    if (shownText === '') continue;
    let rowTexts = textsByRow.get(rowIndex) ?? new (Map as Dynamic)();
    let isFirstCell = rowIndex === 0 && columnIndex === 0;
    textsByRow.set(rowIndex, rowTexts.set(columnIndex, isFirstCell ? escapeFirstCsvCellText(shownText) : shownText));
  }
  return textsByRow;
}
export function blankMergedCellsForCsv(textsByRow?: Dynamic, mergedArea?: Dynamic) {
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = mergedArea;
  let rowIndexes =
    rowCount < textsByRow.size
      ? Array.from<Dynamic, Dynamic>(
          {
            length: rowCount,
          },
          (input?: Dynamic, offset?: Dynamic) => topRowIndex + offset,
        )
      : [...textsByRow.keys()].filter((rowIndex?: Dynamic) => rowIndex >= topRowIndex && rowIndex < topRowIndex + rowCount);
  for (let rowIndex of rowIndexes as Dynamic) {
    let rowTexts = textsByRow.get(rowIndex);
    for (let columnIndex of (rowTexts?.keys() ?? []) as Dynamic)
      if (
        columnIndex >= leftColumnIndex &&
        columnIndex < leftColumnIndex + columnCount &&
        (rowIndex !== topRowIndex || columnIndex !== leftColumnIndex)
      )
        rowTexts?.delete(columnIndex);
  }
}
export function csvFileOfSheet(reads: WorkbookReads, sheetId?: Dynamic, workbookTitle?: Dynamic) {
  let sheet = reads.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  if (sheet === undefined) throw Error('the workbook has no such sheet');
  let { name: name, rowCount: rowCount, columnCount: columnCount } = sheet;
  let wholeSheet = {
    topRowIndex: 0,
    leftColumnIndex: 0,
    rowCount: rowCount,
    columnCount: columnCount,
  };
  let textsByRow = shownTextsForCsv(reads, sheetId, wholeSheet);
  for (let value of reads.mergedAreasIn(sheetId, wholeSheet) as Dynamic) blankMergedCellsForCsv(textsByRow, value);
  let lineCount: Dynamic = 1;
  let fieldCount: Dynamic = 1;
  for (let [value, value2] of textsByRow as Dynamic) {
    if (value2.size > 0) lineCount = Math.max(lineCount, value + 1);
    for (let value3 of value2.keys() as Dynamic) fieldCount = Math.max(fieldCount, value3 + 1);
  }
  if (lineCount * fieldCount > MAX_CSV_CELLS) return null;
  let blankLine = csvLineOf(
    Array.from<Dynamic, Dynamic>(
      {
        length: fieldCount,
      },
      () => '',
    ),
  );
  let lines = Array.from<Dynamic, Dynamic>(
    {
      length: lineCount,
    },
    (input?: Dynamic, rowIndex?: Dynamic) => {
      let rowTexts = textsByRow.get(rowIndex);
      if (rowTexts === undefined || rowTexts.size === 0) return blankLine;
      return csvLineOf(
        Array.from<Dynamic, Dynamic>(
          {
            length: fieldCount,
          },
          (input2?: Dynamic, columnIndex?: Dynamic) => rowTexts.get(columnIndex) ?? '',
        ),
      );
    },
  );
  return {
    filename: csvFileName(workbookTitle, name),
    csv: `${lines.join(`\r
`)}\r
`,
  };
}
export const quoteCsvField = (field?: Dynamic) => `"${field.replaceAll('"', '""')}"`;
export const CSV_NEEDS_QUOTES_PATTERN = /[",;\t\r\n]/;
export const csvField = (field?: Dynamic) => (CSV_NEEDS_QUOTES_PATTERN.test(field) ? quoteCsvField(field) : field);
export const CSV_LEADING_SIGN_PATTERN = /^ *[+-]/;
export const MAX_CSV_CELLS = 5000000;
