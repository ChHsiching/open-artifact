import type { Dynamic } from '../dynamic.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { truncateToCleanText, NEW_SHEET_DESTINATION } from './import-basics.ts';
import { readingFittingTexts, dataLineNumbers, importColumnTexts, importTextAt } from './column-readings.ts';
import { scrambledIndex, SHARED_ROWS_KEPT, SHARED_ROWS_COMPARED, readingAsSheetHolds } from './plan-without-agent.ts';
import { cellValueOf } from '../model/cell-values.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function lastRowIndexInUse(reads: WorkbookReads, sheetId?: Dynamic) {
  let lastRowIndex: Dynamic = -1;
  for (let rowId of reads.rowsAsTheyStand(sheetId).keys() as Dynamic) lastRowIndex = Math.max(lastRowIndex, reads.rowIndexOf(sheetId, rowId) ?? -1);
  return lastRowIndex;
}
export function tableUnderHeaderRow(
  reads: WorkbookReads,
  { sheetId: sheetId, name: sheetName }: Dynamic,
  headerRowIndex?: Dynamic,
  lastRowIndex?: Dynamic,
) {
  let shownTextAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
    return cellId === null ? '' : cellShownText(reads.cellOnShowIn(cellId), reads.decimalSign);
  };
  let headings = reads.columnIndexesOnShowIn(sheetId, headerRowIndex).flatMap((columnIndex?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, headerRowIndex, columnIndex);
    let heading = truncateToCleanText(shownTextAt(headerRowIndex, columnIndex), MAX_PLACE_HEADING_LENGTH);
    return cellId === null || heading === ''
      ? []
      : [
          {
            columnIndex: columnIndex,
            rowId: cellId.rowId,
            columnId: cellId.columnId,
            name: heading,
          },
        ];
  });
  let [firstHeading] = headings;
  if (firstHeading === undefined || headings.length > MAX_PLACE_COLUMNS) return null;
  let recordCount = lastRowIndex - headerRowIndex;
  return {
    sheetId: sheetId,
    name: sheetName,
    headerRowId: firstHeading.rowId,
    columns: headings.map(
      ({ columnId: columnId, name: name }: Dynamic) => ({
        columnId: columnId,
        name: name,
      }),
    ),
    recordCount: recordCount,
    firstRecords: Array.from<Dynamic, Dynamic>(
      {
        length: Math.min(recordCount, PLACE_FIRST_RECORDS),
      },
      (input?: Dynamic, recordIndex?: Dynamic) =>
        headings.map(
          ({ columnIndex: columnIndex }: Dynamic) =>
            truncateToCleanText(shownTextAt(headerRowIndex + 1 + recordIndex, columnIndex), PLACE_RECORD_CELL_LENGTH),
        ),
    ),
  };
}
export function matchHeadingsToColumns(headings?: Dynamic, columns?: Dynamic) {
  let usedColumnIds = new (Set as Dynamic)();
  return headings.map((heading?: Dynamic) => {
    let normalized = normalizeHeading(heading);
    let match =
      normalized === ''
        ? undefined
        : columns.find(
            ({ columnId: columnId, name: name }: Dynamic) => !usedColumnIds.has(columnId) && normalizeHeading(name) === normalized,
          );
    if (match === undefined) return null;
    usedColumnIds.add(match.columnId);
    return match.columnId;
  });
}
export function textsAreForReading(reading?: Dynamic, texts?: Dynamic) {
  let fittingReading = readingFittingTexts(reading, texts);
  if (fittingReading.kind === 'trueOrFalse')
    return {
      kind: 'trueOrFalse',
    };
  if (fittingReading.kind === 'dropdown')
    return {
      kind: 'read',
      reading: {
        kind: 'text',
      },
    };
  return {
    kind: 'read',
    reading: fittingReading,
  };
}
export function importRowsOf(file?: Dynamic, lineNumbers?: Dynamic) {
  let key = lineNumbers.join();
  let cached = importRowsCache.get(file.lines);
  if (cached?.lines === key) return cached.rows;
  let rows = lineNumbers.map((line?: Dynamic) => [...(file.lines[line - 1] ?? [])]);
  importRowsCache.set(file.lines, {
    lines: key,
    rows: rows,
  });
  return rows;
}
export function tableImportRequest(
  { sheetId: sheetId, headerRowId: headerRowId, intoColumns: intoColumns, how: how }: Dynamic,
  file?: Dynamic,
  plan?: Dynamic,
) {
  let records = dataLineNumbers(file, plan);
  return {
    sheetId: sheetId,
    headerRow: headerRowId,
    rows: importRowsOf(file, records),
    columns: plan.columns.map(({ reading: reading }: Dynamic, columnIndex?: Dynamic) => {
      let column = intoColumns[columnIndex] ?? null;
      return column === null
        ? null
        : {
            column: column,
            textsAre: textsAreForReading(reading, importColumnTexts(file, records, columnIndex)),
          };
    }),
    how:
      how.kind === 'mergeByKey'
        ? {
            kind: 'mergeByKey',
            keyColumn: how.keyColumnIndex,
          }
        : how,
  };
}
export function countTableChangeRows(read?: Dynamic) {
  let counts = {
    added: 0,
    changes: 0,
    same: 0,
    leftOut: 0,
  };
  for (let { kind: kind } of read.rows as Dynamic) counts[kind] += 1;
  let { added: added, changes: changes, same: same, leftOut: leftOut } = counts;
  return {
    added: added,
    changing: changes,
    same: same,
    leftOut: leftOut,
  };
}
export function areAllDistinctTexts(texts?: Dynamic) {
  let distinct = new (Set as Dynamic)(texts.map((text?: Dynamic) => text.trim().toLowerCase()));
  return texts.length > 0 && distinct.size === texts.length && !distinct.has('');
}
export function keyColumnCandidates(intoColumns?: Dynamic, file?: Dynamic, plan?: Dynamic) {
  let records = dataLineNumbers(file, plan);
  return plan.columns.flatMap(
    ({ reading: reading }: Dynamic, columnIndex?: Dynamic) =>
      (intoColumns[columnIndex] ?? null) !== null && canReadingBeKey(reading) && areAllDistinctTexts(importColumnTexts(file, records, columnIndex))
        ? [columnIndex]
        : [],
  );
}
export function keyMatchesOfPlace(place?: Dynamic, keyColumnIndexes?: Dynamic, file?: Dynamic, plan?: Dynamic, core?: Dynamic) {
  let { sheetId: sheetId, headerRowId: headerRowId } = place.table;
  let reads = keyColumnIndexes.map(
    (keyColumnIndex?: Dynamic) => ({
      keyColumnIndex: keyColumnIndex,
      read: core.whatATableChanges(
        tableImportRequest(
          {
            kind: 'sheet',
            sheetId: sheetId,
            headerRowId: headerRowId,
            intoColumns: place.intoColumns,
            how: {
              kind: 'mergeByKey',
              keyColumnIndex: keyColumnIndex,
            },
          },
          file,
          plan,
        ),
      ),
    }),
  );
  if (reads.some(({ read: read }: Dynamic) => read === null)) return null;
  return reads.flatMap(({ keyColumnIndex: keyColumnIndex, read: read }: Dynamic) => {
    if (read?.kind !== 'whatATableChanges') return [];
    let { added: added, changing: changing, same: same } = countTableChangeRows(read);
    return [
      {
        keyColumnIndex: keyColumnIndex,
        changing: changing,
        same: same,
        added: added,
        notInTheFile: read.rowsNotInTheTable.length,
      },
    ];
  });
}
export function bestPlaceInSheet(reads: WorkbookReads, sheet?: Dynamic, headings?: Dynamic) {
  let lastRowIndex = lastRowIndexInUse(reads, sheet.sheetId);
  let headerRowIndexes =
    sheet.frozenRowCount > 0
      ? [sheet.frozenRowCount - 1]
      : Array.from<Dynamic, Dynamic>(
          {
            length: HEADER_ROWS_TRIED,
          },
          (input?: Dynamic, index?: Dynamic) => index,
        );
  let best: Dynamic = null;
  for (let headerRowIndex of headerRowIndexes as Dynamic) {
    let table = headerRowIndex > lastRowIndex ? null : tableUnderHeaderRow(reads, sheet, headerRowIndex, lastRowIndex);
    if (table === null) continue;
    let intoColumns = matchHeadingsToColumns(headings, table.columns);
    let matchedCount = intoColumns.filter((columnId?: Dynamic) => columnId !== null).length;
    if (
      best === null
        ? matchedCount > 0
        : matchedCount > best.matchedCount || (matchedCount === best.matchedCount && table.columns.length > best.table.columns.length)
    )
      best = {
        table: table,
        intoColumns: intoColumns,
        matchedCount: matchedCount,
      };
  }
  return best;
}
export function findImportPlaces(file?: Dynamic, plan?: Dynamic, core?: Dynamic) {
  let headings = fileHeadingsOf(file, plan);
  let bestPlaces = core
    .listSheets()
    .slice(0, MAX_SHEETS_FOR_PLACES)
    .flatMap((sheet?: Dynamic) => bestPlaceInSheet(core, sheet, headings) ?? []);
  bestPlaces.sort((a?: Dynamic, b2?: Dynamic) => b2.matchedCount - a.matchedCount);
  let topPlaces = bestPlaces.slice(0, MAX_PLACES).map((place?: Dynamic, rank?: Dynamic) => {
    let keyColumns = keyColumnCandidates(place.intoColumns, file, plan);
    let keyColumnsTried = !isLargeImportFile(file) ? MAX_KEY_COLUMNS_TRIED : rank === 0 ? 1 : 0;
    return {
      place: place,
      likeliestKeyColumnIndex: keyColumns[0] ?? null,
      keys: keyMatchesOfPlace(place, keyColumns.slice(0, keyColumnsTried), file, plan, core),
    };
  });
  let placesWithKeys = topPlaces.flatMap(
    ({ place: place, likeliestKeyColumnIndex: likeliestKeyColumnIndex, keys: keys }: Dynamic) =>
      keys === null
        ? []
        : [
            {
              ...place,
              likeliestKeyColumnIndex: likeliestKeyColumnIndex,
              keys: keys,
            },
          ],
  );
  return placesWithKeys.length < topPlaces.length ? null : placesWithKeys;
}
export function likeliestImportDestination(places?: Dynamic, fileColumnCount?: Dynamic) {
  let [best, runnerUp] = places;
  if (best === undefined || best.matchedCount < fileColumnCount) return NEW_SHEET_DESTINATION;
  if (runnerUp !== undefined && runnerUp.matchedCount === best.matchedCount) return NEW_SHEET_DESTINATION;
  if (best.matchedCount * 2 < best.table.columns.length) return NEW_SHEET_DESTINATION;
  let likeliestKey = best.keys.find(
    ({ keyColumnIndex: keyColumnIndex }: Dynamic) => keyColumnIndex === best.likeliestKeyColumnIndex,
  );
  if (best.likeliestKeyColumnIndex !== null && likeliestKey === undefined) return NEW_SHEET_DESTINATION;
  let { sheetId: sheetId, headerRowId: headerRowId } = best.table;
  return {
    kind: 'sheet',
    sheetId: sheetId,
    headerRowId: headerRowId,
    intoColumns: best.intoColumns,
    how:
      likeliestKey !== undefined && likeliestKey.changing + likeliestKey.same > 0
        ? {
            kind: 'mergeByKey',
            keyColumnIndex: likeliestKey.keyColumnIndex,
          }
        : {
            kind: 'addRows',
          },
  };
}
export function readingsAsTheSheetHolds(
  file: Dynamic,
  plan: Dynamic,
  place: Dynamic,
  keyColumnIndex: Dynamic,
  columnsLeftOut: Dynamic,
  reads: WorkbookReads,
) {
  let { sheetId: sheetId, headerRowId: headerRowId, intoColumns: intoColumns } = place;
  let sheet = reads.sheetAsItStands(sheetId);
  let from = JSON.stringify([
    [plan.headerLine, plan.linesLeftOut, headerRowId],
    [keyColumnIndex, intoColumns[keyColumnIndex], plan.columns[keyColumnIndex]?.reading],
    reads.locale,
  ]);
  let cached: Dynamic = sharedRowsCache.get(file.lines);
  if (cached?.sheet !== sheet || cached.from !== from) {
    let how = {
      kind: 'mergeByKey',
      keyColumnIndex: keyColumnIndex,
    };
    let changes = reads.whatATableChanges(
      tableImportRequest(
        {
          ...place,
          how: how,
        },
        file,
        plan,
      ),
    );
    if (changes === null) return null;
    if (changes.kind === 'refused') return {};
    let rowsShared = changes.rows
      .flatMap(
        (row?: Dynamic, at?: Dynamic) =>
          row.kind === 'changes' || row.kind === 'same'
            ? [
                {
                  rowId: row.row,
                  at: at,
                },
              ]
            : [],
      )
      .toSorted((first?: Dynamic, second?: Dynamic) => scrambledIndex(first.at) - scrambledIndex(second.at))
      .slice(0, SHARED_ROWS_KEPT);
    cached = {
      sheet: sheet,
      from: from,
      rowsShared: rowsShared,
      readings: new Map(),
    };
    sharedRowsCache.set(file.lines, cached);
  }
  let { rowsShared: rowsShared, readings: readings } = cached;
  let records = dataLineNumbers(file, plan);
  let readingOfColumn = (columnIndex?: Dynamic, reading?: Dynamic) => {
    let columnId = intoColumns[columnIndex] ?? null;
    if (columnId === null) return null;
    let shared: Dynamic = [];
    for (let { rowId: rowId, at: at } of rowsShared) {
      if (shared.length === SHARED_ROWS_COMPARED) break;
      let line = records[at];
      if (line === undefined) continue;
      let text = importTextAt(file, line, columnIndex);
      let cell = {
        sheetId: sheetId,
        rowId: rowId,
        columnId: columnId,
      };
      let held = cellValueOf(reads.cellOnShowIn(cell));
      let isHeld = held?.kind === 'number' || (held?.kind === 'text' && held.value.trim() !== '');
      if (text.trim() !== '' && isHeld && reads.dropdownOf(cell) === null)
        shared.push({
          text: text,
          held: held.value,
          line: line,
        });
    }
    return readingAsSheetHolds(file, records, columnIndex, reading, shared, reads);
  };
  return Object.fromEntries(
    plan.columns.flatMap(({ reading: reading }: Dynamic, columnIndex?: Dynamic) => {
      if (columnsLeftOut.has(columnIndex) || columnIndex === keyColumnIndex) return [];
      let key = JSON.stringify([columnIndex, intoColumns[columnIndex], reading]);
      let held = readings.has(key) ? (readings.get(key) ?? null) : readingOfColumn(columnIndex, reading);
      readings.set(key, held);
      return held === null ? [] : [[columnIndex, held]];
    }),
  );
}
export const MAX_SHEETS_FOR_PLACES = 30;
export const HEADER_ROWS_TRIED = 5;
export const MAX_PLACE_COLUMNS = 60;
export const PLACE_FIRST_RECORDS = 3;
export const MAX_PLACE_HEADING_LENGTH = 1000;
export const PLACE_RECORD_CELL_LENGTH = 40;
export const MAX_PLACES = 3;
export const MAX_KEY_COLUMNS_TRIED = 2;
export const normalizeHeading = (text?: Dynamic) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const fileHeadingsOf = (file: Dynamic, { headerLine: headerLine, columns: columns }: Dynamic) =>
  columns.map((input?: Dynamic, columnIndex?: Dynamic) => (headerLine === null ? '' : importTextAt(file, headerLine, columnIndex)));
export const importRowsCache = new (WeakMap as Dynamic)();
export const isLargeImportFile = ({ lines: lines, columnCount: columnCount }: Dynamic) => lines.length * columnCount > 1e5;
export const canReadingBeKey = (reading?: Dynamic) =>
  reading.kind === 'text' || (reading.kind === 'number' && reading.decimalPlaces === 0);
export const sharedRowsCache = new (WeakMap as Dynamic)();
