import type { Dynamic } from '../dynamic.ts';
import { cellShownText } from '../clipboard/text-escaping.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { previewCellsUnderReading, shortenImportLabel, PREVIEW_ROW_COUNT } from './preview.ts';
import { DEFAULT_CELL_FORMAT } from '../model/cell-format.ts';
import { columnLetters, spanOfIndexes } from '../model/a1-references.ts';
import { isFormulaCell } from '../model/workbook.ts';
import { tableImportRequest, countTableChangeRows } from './places.ts';
import { tableWriteHasRoom } from '../model/workbook-room.ts';
import { dataLineNumbers, readingFittingTexts, importColumnTexts } from './column-readings.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function previewCellOfSheetCell(reads: WorkbookReads, cellId?: Dynamic) {
  let cell = reads.cellOnShowIn(cellId);
  let shown = cellShownText(cell, reads.decimalSign);
  if (cell === null || shown === '')
    return {
      kind: 'blank',
    };
  if ('dropdownOption' in cell)
    return {
      kind: 'option',
      shown: cell.dropdownOption.label,
      color: cell.dropdownOption.color,
    };
  let kind = cellValueOf(cell)?.kind;
  if (kind === 'number')
    return {
      kind: kind,
      shown: shown,
    };
  return {
    kind: kind === 'boolean' ? 'trueOrFalse' : 'text',
    shown: shown,
  };
}
export function previewCellsIntoSheet(reading: Dynamic, texts: Dynamic, cellIds: Dynamic, optionsAdded: Dynamic, reads: WorkbookReads) {
  let previewCells = previewCellsUnderReading(
    reading.kind === 'dropdown'
      ? {
          kind: 'text',
        }
      : reading,
    texts,
    reads,
  );
  return texts.map((text?: Dynamic, index?: Dynamic) => {
    let cellId = cellIds[index] ?? null;
    let lowered = text.trim().toLowerCase();
    let dropdown = cellId === null || lowered === '' ? null : reads.dropdownOf(cellId);
    let labelsAdded = dropdown === null ? [] : (optionsAdded.get(dropdown.dropdownId) ?? []);
    let option = [
      ...(dropdown?.options ?? []),
      ...labelsAdded.map(
        (label?: Dynamic) => ({
          label: label,
          color: {
            kind: 'none',
          },
        }),
      ),
    ].find(({ label: label }: Dynamic) => label.trim().toLowerCase() === lowered);
    if (option !== undefined)
      return {
        kind: 'option',
        shown: option.label,
        color: option.color,
      };
    let previewCell = previewCells[index];
    if (previewCell === undefined)
      return {
        kind: 'blank',
      };
    let { cell: cell, held: held, hasAFormatOfItsOwn: hasAFormatOfItsOwn } = previewCell;
    let numberFormat = cellId === null ? DEFAULT_CELL_FORMAT.numberFormat : reads.formatOf(cellId).numberFormat;
    if (cell.kind !== 'number' || numberFormat.pattern === DEFAULT_CELL_FORMAT.numberFormat.pattern) return cell;
    if (!isNumberInput(held)) return cell;
    if (hasAFormatOfItsOwn && numberFormat.kind === 'percent') return cell;
    return {
      kind: 'number',
      shown: reads.shownWithRoomForAll(held, numberFormat.pattern) ?? cell.shown,
    };
  });
}
export function sheetColumnsOf(columnIds: Dynamic, { sheetId: sheetId, headerRowId: headerRowId }: Dynamic, reads: WorkbookReads) {
  let columns = [...columnIds].flatMap((columnId?: Dynamic) => {
    let columnIndex = reads.columnIndexOf(sheetId, columnId);
    let name = shortenImportLabel(
      cellShownText(
        reads.cellOnShowIn({
          sheetId: sheetId,
          rowId: headerRowId,
          columnId: columnId,
        }),
        reads.decimalSign,
      ),
    );
    return columnIndex === null
      ? []
      : [
          {
            at: columnIndex,
            columnId: columnId,
            letters: columnLetters(columnIndex),
            name: name === '' ? null : name,
          },
        ];
  });
  columns.sort((a?: Dynamic, b2?: Dynamic) => a.at - b2.at);
  return columns.map(
    ({ columnId: columnId, letters: letters, name: name }: Dynamic) => ({
      columnId: columnId,
      letters: letters,
      name: name,
    }),
  );
}
export function dropdownOptionsAdded({ optionsAdded: optionsAdded }: Dynamic, destination: Dynamic, reads: WorkbookReads) {
  let labelsByColumn = new (Map as Dynamic)();
  for (let { column: column, labels: labels } of optionsAdded as Dynamic) {
    let columnId = destination.intoColumns[column] ?? null;
    if (columnId !== null) labelsByColumn.set(columnId, [...(labelsByColumn.get(columnId) ?? []), ...labels]);
  }
  return sheetColumnsOf(new (Set as Dynamic)(labelsByColumn.keys()), destination, reads).flatMap(
    ({ columnId: columnId, letters: letters, name: name }: Dynamic) => {
      let shortLabels = [...new (Set as Dynamic)(labelsByColumn.get(columnId))]
        .map(shortenImportLabel)
        .filter((label?: Dynamic) => label !== '');
      return shortLabels.length === 0
        ? []
        : [
            {
              column: {
                letters: letters,
                name: name,
              },
              labels: shortLabels,
            },
          ];
    },
  );
}
export function formulasWrittenOver(changedRows: Dynamic, destination: Dynamic, reads: WorkbookReads) {
  let { sheetId: sheetId, intoColumns: intoColumns } = destination;
  let count: Dynamic = 0;
  let columnIds = new (Set as Dynamic)();
  for (let { row: rowId, columns: columns } of changedRows as Dynamic)
    for (let columnIndex of columns as Dynamic) {
      let columnId = intoColumns[columnIndex] ?? null;
      if (columnId === null) continue;
      if (
        !isFormulaCell(reads, {
          sheetId: sheetId,
          rowId: rowId,
          columnId: columnId,
        })
      )
        continue;
      count += 1;
      columnIds.add(columnId);
    }
  return {
    count: count,
    columns: sheetColumnLabels(columnIds, destination, reads),
  };
}
export function columnsClearedByReplace(rowIds: Dynamic, destination: Dynamic, reads: WorkbookReads) {
  let { sheetId: sheetId, intoColumns: intoColumns } = destination;
  let rowIndexes = rowIds.flatMap((rowId?: Dynamic) => reads.rowIndexOf(sheetId, rowId) ?? []);
  let sheetColumnCount = reads.listSheets().find((sheet?: Dynamic) => sheet.sheetId === sheetId)?.columnCount;
  if (rowIndexes.length === 0 || sheetColumnCount === undefined) return [];
  let rowIdSet = new (Set as Dynamic)(rowIds);
  let { firstIndex: firstIndex, count: count } = spanOfIndexes(rowIndexes);
  let filledCells = reads.filledCellsIn(sheetId, {
    topRowIndex: firstIndex,
    rowCount: count,
    leftColumnIndex: 0,
    columnCount: sheetColumnCount,
  });
  let clearedColumnIds = new (Set as Dynamic)(
    filledCells.flatMap(
      ({ rowId: rowId, columnId: columnId }: Dynamic) => (rowIdSet.has(rowId) && !intoColumns.includes(columnId) ? [columnId] : []),
    ),
  );
  return sheetColumnLabels(clearedColumnIds, destination, reads);
}
export function previewIntoSheet(file: Dynamic, plan: Dynamic, destination: Dynamic, reads: WorkbookReads) {
  let request = tableImportRequest(destination, file, plan);
  let read = reads.whatATableChanges(request);
  if (read === null || read.kind === 'refused') return read;
  if (!tableWriteHasRoom(request, read, reads))
    return {
      kind: 'refused',
      refusal: 'tooManyCells',
    };
  let { sheetId: sheetId, headerRowId: headerRowId, intoColumns: intoColumns } = destination;
  let columnsInto = intoColumns.flatMap((columnId?: Dynamic, columnIndexInTheFile?: Dynamic) => {
    let at = columnId === null ? null : reads.columnIndexOf(sheetId, columnId);
    return columnId === null || at === null
      ? []
      : [
          {
            columnId: columnId,
            columnIndexInTheFile: columnIndexInTheFile,
            at: at,
          },
        ];
  });
  columnsInto.sort((a?: Dynamic, b2?: Dynamic) => a.at - b2.at);
  let columns = columnsInto;
  let cellIdAt = (rowId: Dynamic, { columnId: columnId }: Dynamic) => ({
    sheetId: sheetId,
    rowId: rowId,
    columnId: columnId,
  });
  let lastRow: Dynamic = null;
  let headerRowIndex = reads.rowIndexOf(sheetId, headerRowId) ?? 0;
  for (let rowId of reads.rowsAsTheyStand(sheetId).keys() as Dynamic) {
    let rowIndex = reads.rowIndexOf(sheetId, rowId);
    if (rowIndex !== null && rowIndex > headerRowIndex && rowIndex > (lastRow?.at ?? -1))
      lastRow = {
        rowId: rowId,
        at: rowIndex,
      };
  }
  let lastRowId = lastRow?.rowId ?? null;
  let isReplace = destination.how.kind === 'replaceRows';
  let indexedRows = read.rows.map(
    (row?: Dynamic, index?: Dynamic) => ({
      row: row,
      index: index,
    }),
  );
  let changedRows = isReplace
    ? []
    : indexedRows
        .flatMap(
          ({ row: row, index: index }: Dynamic) =>
            row.kind === 'changes'
              ? [
                  {
                    row: row,
                    index: index,
                  },
                ]
              : [],
        )
        .slice(0, MAX_CHANGED_ROWS_SHOWN);
  let addedRows = indexedRows
    .filter(({ row: row }: Dynamic) => (isReplace ? row.kind !== 'leftOut' : row.kind === 'added'))
    .slice(0, PREVIEW_ROW_COUNT - changedRows.length);
  let shownRows = [
    ...changedRows.map(
      ({ row: row, index: index }: Dynamic) => ({
        index: index,
        rowId: row.row,
        looksAs: row.row,
        changes: new (Set as Dynamic)(row.columns),
      }),
    ),
    ...addedRows.map(
      ({ row: row, index: index }: Dynamic) => ({
        index: index,
        rowId: null,
        looksAs: row.kind === 'changes' || row.kind === 'same' ? row.row : lastRowId,
        changes: null,
      }),
    ),
  ];
  let records = dataLineNumbers(file, plan);
  let labelsByDropdown = new (Map as Dynamic)(
    read.optionsAdded.map(({ dropdownId: dropdownId, labels: labels }: Dynamic) => [dropdownId, labels]),
  );
  let previewColumns = columns.map((column?: Dynamic) => {
    let reading = plan.columns[column.columnIndexInTheFile]?.reading ?? {
      kind: 'text',
    };
    let fittingReading = readingFittingTexts(reading, importColumnTexts(file, records, column.columnIndexInTheFile));
    return previewCellsIntoSheet(
      fittingReading,
      shownRows.map(({ index: index }: Dynamic) => request.rows[index]?.[column.columnIndexInTheFile] ?? ''),
      shownRows.map(({ looksAs: looksAs }: Dynamic) => (looksAs === null ? null : cellIdAt(looksAs, column))),
      labelsByDropdown,
      reads,
    );
  });
  let rows = shownRows.map(
    ({ index: index, rowId: rowId, changes: changes }: Dynamic, rowIndex?: Dynamic) => ({
      id: rowId ?? `row ${index} of the file`,
      kind: rowId === null ? 'added' : 'changed',
      cells: columns.map((column?: Dynamic, columnIndex?: Dynamic) => {
        let cell = previewColumns[columnIndex]?.[rowIndex] ?? {
          kind: 'blank',
        };
        if (rowId === null)
          return {
            cell: cell,
            before: null,
          };
        let before = previewCellOfSheetCell(reads, cellIdAt(rowId, column));
        return changes.has(column.columnIndexInTheFile)
          ? {
              cell: cell,
              before: before.kind === 'blank' ? '' : before.shown,
            }
          : {
              cell: before,
              before: null,
            };
      }),
    }),
  );
  let goneRows = read.rowsThatGo.slice(0, isReplace ? 0 : MAX_GONE_ROWS_SHOWN).map(
    (rowId?: Dynamic) => ({
      id: rowId,
      kind: 'gone',
      cells: columns.map(
        (column?: Dynamic) => ({
          cell: previewCellOfSheetCell(reads, cellIdAt(rowId, column)),
          before: null,
        }),
      ),
    }),
  );
  let { added: addedCount, changing: changedCount, same: sameCount } = countTableChangeRows(read);
  return {
    kind: 'changes',
    columns: columns.map(
      (column?: Dynamic) => ({
        columnIndexInTheFile: column.columnIndexInTheFile,
        name: cellShownText(reads.cellOnShowIn(cellIdAt(headerRowId, column)), reads.decimalSign),
        reading: plan.columns[column.columnIndexInTheFile]?.reading ?? {
          kind: 'text',
        },
      }),
    ),
    isReplaced: isReplace,
    columnsLeftOut: plan.columns.flatMap(
      ({ name: name }: Dynamic, columnIndex?: Dynamic) =>
        (intoColumns[columnIndex] ?? null) === null
          ? [
              {
                columnIndexInTheFile: columnIndex,
                name: name,
              },
            ]
          : [],
    ),
    optionsAdded: dropdownOptionsAdded(read, destination, reads),
    columnsCleared: isReplace
      ? columnsClearedByReplace(
          read.rows.flatMap((row?: Dynamic) => (row.kind === 'changes' ? [row.row] : [])),
          destination,
          reads,
        )
      : [],
    formulasWrittenOver: formulasWrittenOver(
      read.rows.flatMap((row?: Dynamic) => (row.kind === 'changes' ? [row] : [])),
      destination,
      reads,
    ),
    rows: [...rows, ...goneRows],
    addedCount: addedCount,
    changedCount: changedCount,
    sameCount: sameCount,
    goneCount: read.rowsThatGo.length,
    untouchedCount: destination.how.kind === 'addRows' ? (lastRow?.at ?? headerRowIndex) - headerRowIndex : read.rowsNotInTheTable.length,
  };
}
export const MAX_CHANGED_ROWS_SHOWN = 50;
export const MAX_GONE_ROWS_SHOWN = 10;
export const isNumberInput = (value?: Dynamic) =>
  typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'number';
export const sheetColumnLabels = (columnIds: Dynamic, place: Dynamic, reads: WorkbookReads) =>
  sheetColumnsOf(columnIds, place, reads).map(
    ({ letters: letters, name: name }: Dynamic) => ({
      letters: letters,
      name: name,
    }),
  );
