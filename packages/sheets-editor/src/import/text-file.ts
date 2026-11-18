import type { Dynamic } from '../dynamic.ts';
import { cleanSheetName } from '../state/sheet-tabs.ts';
import { sanitizeCellText } from '../model/cell-text.ts';
import { unescapeLoneCellText, unescapeFirstCsvCellText, unescapeCsvCellText } from '../clipboard/text-escaping.ts';
import { filledCellCountOfLine } from './file-profile.ts';
import { withNoEffects } from '../state/transitions.ts';
import { closeImportOfAFile } from './bring-in.ts';
import { awaitFileAgain } from './file-awaited.ts';
import { startImportOfAFile } from './import-flow.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
export function sheetNameOfFileName(fileName?: Dynamic) {
  let stem = cleanSheetName(sanitizeCellText(fileName.replace(/\.[^.]*$/, '')));
  return stem === '' ? cleanSheetName(sanitizeCellText(fileName)) : stem;
}
export function unescapedImportLines(rows?: Dynamic, isCsv?: Dynamic) {
  let lines =
    unescapedLinesCache.get(rows) ??
    rows.map(
      (row?: Dynamic, rowIndex?: Dynamic) =>
        row.map(
          (text?: Dynamic, columnIndex?: Dynamic) =>
            !isCsv ? unescapeLoneCellText(text) : rowIndex === 0 && columnIndex === 0 ? unescapeFirstCsvCellText(text) : unescapeCsvCellText(text),
        ),
    );
  unescapedLinesCache.set(rows, lines);
  return lines;
}
export function importReadFile(
  state: PageState,
  workbook: WorkbookReads,
  { filename: filename, delimiter: delimiter, rows: rows, words: words }: Dynamic,
) {
  let lines = unescapedImportLines(rows, delimiter === ',');
  let columnCount = lines.reduce((widest?: Dynamic, line?: Dynamic) => Math.max(widest, filledCellCountOfLine(line)), 0);
  if (columnCount === 0)
    return withNoEffects({
      ...state,
      notice: {
        kind: 'fileNotImported',
        why: 'empty',
      },
    });
  let longTexts = lines.flatMap(
    (line?: Dynamic) => line.filter((text?: Dynamic) => text.length > LONG_IMPORTED_TEXT_LENGTH),
  );
  let [fit] =
    longTexts.length > 0
      ? (workbook.fitOfColumnReadings(
          [
            {
              kind: 'text',
            },
          ],
          longTexts,
        ) ?? [])
      : [];
  if (fit !== undefined && fit.notFitting > 0)
    return withNoEffects({
      ...state,
      notice: {
        kind: 'editRefused',
        why: 'textTooLong',
        asked: 'import',
      },
    });
  let filledCount: Dynamic = 0;
  for (let lineOrRefusal of lines as Dynamic) for (let textOrRefused of lineOrRefusal as Dynamic) if (textOrRefused.trim() !== '') filledCount += 1;
  if (filledCount > workbook.mostFilledCells()) {
    let lineOrRefusal = {
      kind: 'editRefused',
      why: 'noRoomInWorkbook',
      asked: 'import',
    };
    let textOrRefused = closeImportOfAFile(state);
    return {
      ...textOrRefused,
      state: awaitFileAgain(textOrRefused.state, state.fileAwaited, lineOrRefusal),
    };
  }
  let nameStem = sheetNameOfFileName(filename);
  let sheetName = nameStem === '' ? words.names.sheet : nameStem;
  let file = {
    fileName: filename,
    delimiter: delimiter,
    lines: lines,
    columnCount: columnCount,
  };
  let wordsWithName = {
    ...words,
    names: {
      ...words.names,
      sheet: sheetName,
    },
  };
  return startImportOfAFile(state, workbook, file, wordsWithName);
}
export const EVENTS_BEFORE_FILE_IMPORT = [
  {
    kind: 'sheetNameLeft',
  },
  {
    kind: 'sheetListOpened',
  },
];
export const LONG_IMPORTED_TEXT_LENGTH = 1e4;
export const unescapedLinesCache = new (WeakMap as Dynamic)();
