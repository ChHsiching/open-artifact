import type { Dynamic } from '../dynamic.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { shownCellText } from '../format/shown-text.ts';
import { formulaInPointNotation } from './point-notation.ts';
import { formulaReadsAsWords } from './word-tokens.ts';
import { findFormulaReferences, resolveFormulaReference } from './references.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import { taggedJson } from '../format/conditional/agent-prompts.ts';
import { SHEET_DATA_DESCRIPTION_BRIEF, formulaWritingRules, namesAddressesOutsideTables } from './agent-prompt.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export let FIX_NEIGHBORS_IN_COLUMN: Dynamic;
export let FIX_NEIGHBORS_IN_ROW: Dynamic;
export function whatCellHolds(reads: WorkbookReads, sheetId?: Dynamic, position?: Dynamic) {
  let cellId = reads.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
  let cell = cellId === null ? null : reads.cellOnShowIn(cellId);
  if (cell === null) return 'nothing';
  if (cellValueOf(cell)?.kind === 'error') return 'error';
  if (!('input' in cell)) return 'formula';
  switch (cell.input.kind) {
    case 'boolean':
      return 'trueOrFalse';
    case 'dropdownOption':
      return 'option';
    case 'user':
    case 'users':
      return 'person';
    case 'richText':
      return 'text';
    case 'formula':
    case 'number':
    case 'text':
      return cell.input.kind;
  }
}
export function whatCellShows(reads: WorkbookReads, sheetId?: Dynamic, position?: Dynamic, limit?: Dynamic) {
  let holds = whatCellHolds(reads, sheetId, position);
  if (holds === 'person') return '(a person)';
  let cellId = reads.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
  let cell = cellId === null ? null : reads.cellOnShowIn(cellId);
  if (holds === 'formula' && cellValueOf(cell)?.kind === 'text') return '(a text)';
  return cell === null ? '' : cutWithEllipsis(shownCellText(cell, 1 / 0, 'point').text, limit);
}
export function* positionsInArea({
  topRowIndex: topRowIndex,
  leftColumnIndex: leftColumnIndex,
  rowCount: rowCount,
  columnCount: columnCount,
}: Dynamic): Generator<Dynamic, Dynamic, Dynamic> {
  for (let row: Dynamic = 0; row < rowCount; row += 1)
    for (let column: Dynamic = 0; column < columnCount; column += 1)
      yield {
        rowIndex: topRowIndex + row,
        columnIndex: leftColumnIndex + column,
      };
}
export function rowLabelOfCell(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
  firstColumnOfTable?: Dynamic,
) {
  for (let column: Dynamic = columnIndex - 1; column >= (firstColumnOfTable ?? 0); column -= 1) {
    let holds = whatCellHolds(reads, sheetId, {
      rowIndex: rowIndex,
      columnIndex: column,
    });
    if (holds === 'nothing' && firstColumnOfTable === null) return null;
    if (holds === 'text')
      return whatCellShows(
        reads,
        sheetId,
        {
          rowIndex: rowIndex,
          columnIndex: column,
        },
        FIX_LABEL_TEXT_LIMIT,
      );
  }
  return null;
}
export function tableAroundCell(reads: WorkbookReads, cellId?: Dynamic, position?: Dynamic) {
  let { sheetId: sheetId } = cellId;
  let records = reads.conditionalFormatSuggestions(cellId, cellId)?.table.records;
  if (records === undefined) return null;
  let [topRow = null, bottomRow = null] = [records.topLeft.r, records.bottomRight.r].map(
    (rowId?: Dynamic) => reads.rowIndexOf(sheetId, rowId),
  );
  let [leftColumn = null, rightColumn = null] = [records.topLeft.c, records.bottomRight.c].map(
    (columnId?: Dynamic) => reads.columnIndexOf(sheetId, columnId),
  );
  if (topRow === null || bottomRow === null || leftColumn === null || rightColumn === null) return null;
  let above = {
    rowIndex: topRow - 1,
    columnIndex: position.columnIndex,
  };
  return {
    records: {
      topRowIndex: topRow,
      leftColumnIndex: leftColumn,
      rowCount: bottomRow - topRow + 1,
      columnCount: rightColumn - leftColumn + 1,
    },
    headerRowIndex: topRow > 0 && whatCellHolds(reads, sheetId, above) === 'text' ? topRow - 1 : null,
  };
}
export function tableAreaWithHeaderAt(reads: WorkbookReads, sheetId?: Dynamic, position?: Dynamic) {
  let cellId = reads.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
  let table = cellId === null ? null : tableAroundCell(reads, cellId, position);
  if (table === null) return null;
  let { records: records, headerRowIndex: headerRowIndex } = table;
  let topRowIndex = headerRowIndex ?? records.topRowIndex;
  return {
    ...records,
    topRowIndex: topRowIndex,
    rowCount: records.topRowIndex + records.rowCount - topRowIndex,
  };
}
export function columnHeaderOfCell(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
  table?: Dynamic,
) {
  let textAt = (rowIndex2?: Dynamic) =>
    whatCellHolds(reads, sheetId, {
      rowIndex: rowIndex2,
      columnIndex: columnIndex,
    }) === 'text'
      ? whatCellShows(
          reads,
          sheetId,
          {
            rowIndex: rowIndex2,
            columnIndex: columnIndex,
          },
          FIX_LABEL_TEXT_LIMIT,
        )
      : null;
  if (table !== null && table.headerRowIndex !== null) return textAt(table.headerRowIndex);
  if (table !== null) {
    let row = table.records.topRowIndex;
    return row < rowIndex && textAt(row + 1) === null ? textAt(row) : null;
  }
  let stopRow = Math.max(0, rowIndex - 1 - MAX_ROWS_UP_TO_COLUMN_HEADER);
  for (let row: Dynamic = rowIndex - 1; row >= stopRow; row -= 1) {
    if (
      whatCellHolds(reads, sheetId, {
        rowIndex: row,
        columnIndex: columnIndex,
      }) === 'nothing'
    )
      return null;
    let text = textAt(row);
    if (text !== null) return text;
  }
  return null;
}
export function describeNeighborCell(reads: WorkbookReads, sheetId?: Dynamic, position?: Dynamic, firstColumnOfTable?: Dynamic) {
  let cellId = position.rowIndex < 0 || position.columnIndex < 0 ? null : reads.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
  if (cellId === null) return null;
  let cell = reads.cellOf(cellId) ?? null;
  let formulaText = cell?.formulaText;
  let holds = whatCellHolds(reads, sheetId, position);
  let label =
    holds === 'nothing' || (formulaText !== undefined && readsRowsAroundItsOwn(reads, sheetId, formulaText, position.rowIndex))
      ? null
      : rowLabelOfCell(reads, sheetId, position, firstColumnOfTable);
  let neighbor = {
    at: addressOfCellPosition(position),
    label: label,
  };
  if (cell === null || formulaText === undefined)
    return {
      ...neighbor,
      holds: holds,
    };
  if (readsAnotherSheet(formulaText, reads.decimalSign))
    return {
      ...neighbor,
      holds: 'a formula that reads another sheet',
    };
  let formula = formulaInPointNotation(cell, reads.decimalSign, reads.formulaAsTyped);
  if (formula === null)
    return {
      ...neighbor,
      holds: holds,
    };
  return formulaText.length > FIX_NEIGHBOR_FORMULA_LIMIT
    ? {
        ...neighbor,
        holds: 'a formula too long to tell',
      }
    : {
        ...neighbor,
        formula: formula,
      };
}
export function isFormulaWrittenInWords(reads: WorkbookReads, formulaText?: Dynamic) {
  let sheetNames = reads.listSheets().map(({ name: name }: Dynamic) => name);
  let namesASheet =
    sheetNames.length > 1 &&
    sheetNames.some(
      (sheetName?: Dynamic) =>
        simplifyForNameMatch(sheetName) !== '' && ` ${simplifyForNameMatch(formulaText)} `.includes(` ${simplifyForNameMatch(sheetName)} `),
    );
  return !readsAnotherSheet(formulaText, reads.decimalSign) && !namesASheet && formulaReadsAsWords(formulaText, sheetNames, reads.decimalSign);
}
export function fixRequestData(
  reads: WorkbookReads,
  { cellId: cellId, error: error, tell: tell, lastAct: lastAct, formulaBefore: formulaBefore }: Dynamic,
) {
  let { sheetId: sheetId } = cellId;
  let position = reads.positionOfCell(cellId);
  let cell = reads.cellOf(cellId) ?? null;
  let formulaText = cell?.formulaText;
  if (position === null || cell === null || !isFormulaShortEnoughToFix(formulaText)) return null;
  let formula = formulaInPointNotation(cell, reads.decimalSign, reads.formulaAsTyped);
  if (formula === null) return null;
  let { references: references, quoted: quoted } = findFormulaReferences(formulaText, reads.decimalSign);
  if (readsAnotherSheet(formulaText, reads.decimalSign)) return null;
  if (formulaBefore !== null && !isFormulaBeforeFixable(formulaBefore, reads)) return null;
  let sheets = reads.listSheets();
  let areas = references
    .flatMap((reference?: Dynamic) => resolveFormulaReference(reference, sheetId, sheets) ?? [])
    .slice(0, FIX_MAX_REFERENCES);
  let isQuotedAt = (index?: Dynamic) =>
    quoted.some(({ start: start, end: end }: Dynamic) => index >= start && index < end);
  let goneCount = [...formulaText.matchAll(/#REF!/g)].filter(({ index: index }: Dynamic) => !isQuotedAt(index)).length;
  let [cellsCounted, readCount]: Dynamic = [0, 0];
  let cellsRead: Dynamic = [];
  let referenceData = areas.map(({ area: area }: Dynamic) => {
    let holds: Dynamic = {};
    let countedBefore = cellsCounted;
    for (let position2 of positionsInArea(area) as Dynamic) {
      if (cellsCounted === FIX_MAX_CELLS_COUNTED) break;
      cellsCounted += 1;
      let kind = whatCellHolds(reads, sheetId, position2);
      holds[kind] = (holds[kind] ?? 0) + 1;
      if (readCount === FIX_MAX_CELLS_READ) continue;
      readCount += 1;
      cellsRead.push({
        at: addressOfCellPosition(position2),
        shows: whatCellShows(reads, sheetId, position2, FIX_CELL_TEXT_LIMIT),
      });
    }
    let notCounted = area.rowCount * area.columnCount - (cellsCounted - countedBefore);
    return {
      at: areaToA1AsStored(area, null),
      rows: area.rowCount,
      columns: area.columnCount,
      holds: holds,
      cellsNotCounted: notCounted,
    };
  });
  let table = tableAroundCell(reads, cellId, position);
  let firstColumnOfTable = table?.records.leftColumnIndex ?? null;
  let { rowIndex: rowIndex, columnIndex: columnIndex } = position;
  let walkUntilEmpty = (count?: Dynamic, positionAt?: Dynamic) => {
    let positions = countingNumbersTo(count).map(positionAt);
    let emptyIndex = positions.findIndex((position2?: Dynamic) => whatCellHolds(reads, sheetId, position2) === 'nothing');
    return emptyIndex === -1 ? positions : positions.slice(0, emptyIndex + 1);
  };
  let above = walkUntilEmpty(
    FIX_NEIGHBORS_IN_COLUMN,
    (step?: Dynamic) => ({
      rowIndex: rowIndex - step,
      columnIndex: columnIndex,
    }),
  );
  let left = walkUntilEmpty(
    FIX_NEIGHBORS_IN_ROW,
    (step?: Dynamic) => ({
      rowIndex: rowIndex,
      columnIndex: columnIndex - step,
    }),
  );
  above.reverse();
  left.reverse();
  let neighbors = [
    ...above,
    ...walkUntilEmpty(
      FIX_NEIGHBORS_IN_COLUMN,
      (step?: Dynamic) => ({
        rowIndex: rowIndex + step,
        columnIndex: columnIndex,
      }),
    ),
    ...left,
    ...walkUntilEmpty(
      FIX_NEIGHBORS_IN_ROW,
      (step?: Dynamic) => ({
        rowIndex: rowIndex,
        columnIndex: columnIndex + step,
      }),
    ),
  ];
  let firstRowIndex = table === null ? 0 : (table.headerRowIndex ?? table.records.topRowIndex);
  let tableRowCount = table === null ? 0 : table.records.topRowIndex + table.records.rowCount - firstRowIndex;
  return taggedJson('fix', {
    cell: addressOfCellPosition(position),
    error: error,
    why: tell,
    formula: formula,
    ...(isFormulaWrittenInWords(reads, formulaText) && {
      inWords: true,
    }),
    references: [
      ...Array.from<Dynamic, Dynamic>(
        {
          length: goneCount,
        },
        () => ({
          at: '#REF!',
          gone: true,
        }),
      ),
      ...referenceData,
    ],
    cellsRead: cellsRead,
    rowLabel: readsRowsAroundItsOwn(reads, sheetId, formulaText, rowIndex) ? null : rowLabelOfCell(reads, sheetId, position, firstColumnOfTable),
    columnHeader: columnHeaderOfCell(reads, sheetId, position, table),
    neighbors: neighbors.flatMap((position2?: Dynamic) => describeNeighborCell(reads, sheetId, position2, firstColumnOfTable) ?? []),
    firstColumn:
      table === null
        ? []
        : countingNumbersTo(Math.min(tableRowCount, FIX_FIRST_COLUMN_ROWS)).map((row?: Dynamic) => {
            let rowIndex2 = firstRowIndex + row - 1;
            let position2 = {
              rowIndex: rowIndex2,
              columnIndex: table.records.leftColumnIndex,
            };
            return {
              row: rowIndex2 + 1,
              text: whatCellShows(reads, sheetId, position2, FIX_CELL_TEXT_LIMIT),
            };
          }),
    rowsOfFirstColumnLeftOut: Math.max(0, tableRowCount - FIX_FIRST_COLUMN_ROWS),
    lastAct: lastAct,
    formulaBefore:
      formulaBefore === null
        ? null
        : {
            cell: formulaBefore.cell,
            formula: formulaInPointNotation(
              {
                input: formulaBefore.input,
                formulaText: formulaBefore.text,
              },
              reads.decimalSign,
              reads.formulaAsTyped,
            ),
          },
  });
}
export function formulasInAnswer(answer?: Dynamic) {
  if (!isFormulaAnswer(answer)) return [];
  let others = 'others' in answer && Array.isArray(answer.others) ? answer.others : [];
  return [answer, ...others].filter(isFormulaAnswer).map(
    ({ formula: formula }: Dynamic) => ({
      formula: formula,
    }),
  );
}
export function fixDataTellsLabelOrHeading(fixData?: Dynamic) {
  let data = JSON.parse(
    fixData.split(`
`)[1] ?? 'null',
  );
  return (
    typeof data === 'object' &&
    data !== null &&
    (('rowLabel' in data && data.rowLabel !== null) || ('columnHeader' in data && data.columnHeader !== null))
  );
}
export const MAX_FIXABLE_FORMULA_LENGTH = 1000;
export const isFormulaShortEnoughToFix = (formulaText?: Dynamic) =>
  formulaText !== undefined && formulaText.length <= MAX_FIXABLE_FORMULA_LENGTH;
export const FIX_MAX_REFERENCES = 12;
export const FIX_MAX_CELLS_COUNTED = 200;
export const FIX_MAX_CELLS_READ = 40;
export const FIX_CELL_TEXT_LIMIT = 32;
export const FIX_LABEL_TEXT_LIMIT = 64;
export const FIX_NEIGHBOR_FORMULA_LIMIT = 300;
[FIX_NEIGHBORS_IN_COLUMN, FIX_NEIGHBORS_IN_ROW] = [3, 2];
export const FIX_FIRST_COLUMN_ROWS = 60;
export const countingNumbersTo = (count?: Dynamic) =>
  Array.from<Dynamic, Dynamic>(
    {
      length: count,
    },
    (input?: Dynamic, index?: Dynamic) => index + 1,
  );
export const cutWithEllipsis = (text?: Dynamic, limit?: Dynamic) => (text.length > limit ? `${text.slice(0, limit)}…` : text);
export const addressOfCellPosition = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  areaToA1AsStored(
    {
      topRowIndex: rowIndex,
      leftColumnIndex: columnIndex,
      rowCount: 1,
      columnCount: 1,
    },
    null,
  );
export const MAX_ROWS_UP_TO_COLUMN_HEADER = 200;
export const readsAnotherSheet = (formulaText?: Dynamic, decimalSign?: Dynamic) =>
  findFormulaReferences(formulaText, decimalSign).references.some(({ sheetName: sheetName }: Dynamic) => sheetName !== null);
export const isFormulaBeforeFixable = (
  { text: text, input: input }: Dynamic,
  { decimalSign: decimalSign, formulaAsTyped: formulaAsTyped }: Dynamic,
) =>
  isFormulaShortEnoughToFix(text) &&
  !readsAnotherSheet(text, decimalSign) &&
  formulaInPointNotation(
    {
      input: input,
      formulaText: text,
    },
    decimalSign,
    formulaAsTyped,
  ) !== null;
export const readsRowsAroundItsOwn = (reads: WorkbookReads, sheetId?: Dynamic, formulaText?: Dynamic, rowIndex?: Dynamic) =>
  findFormulaReferences(formulaText, reads.decimalSign)
    .references.flatMap((reference?: Dynamic) => resolveFormulaReference(reference, sheetId, reads.listSheets()) ?? [])
    .some(
      ({ sheet: sheet, area: area }: Dynamic) =>
        sheet.sheetId === sheetId && area.rowCount > 1 && area.topRowIndex <= rowIndex && rowIndex < area.topRowIndex + area.rowCount,
    );
export const simplifyForNameMatch = (text?: Dynamic) =>
  text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const DECIMAL_COMMA_FIX_NOTE = `
This sheet writes a comma before a number's decimals. The formulas in the data have been converted to US English notation, with a decimal point and commas between arguments. Write yours the same way, 1.5 and never 1,5, and ten thousand as 10000, never 10.000 or 10,000, and the app converts it back for the sheet. Text in quotation marks is never converted: keep what the formula has there as it is, and put no new text that holds a digit, a point or a comma, such as a number or a date, in quotation marks. Write a new condition as ">"&1.5, never ">1.5". What a cell shows is given with a decimal point where the cell has no number format, and otherwise as the sheet writes it, with a decimal comma, and perhaps a point or a blank between thousands.
`;
export const SECOND_READINGS_OF_FIX = {
  nameNotKnown:
    "the name that the app doesn't know is as near to another function that gives another result, or two functions of the app could each do its work and give different results",
  cellsDeleted: 'two columns could each take the place of the deleted one',
};
export const FIX_CANNOT_TELL_NOTE = 'If you cannot tell what the formula was meant to give, answer {"formula":null}.';
export const fixAnswerNote = (secondReading?: Dynamic) =>
  secondReading === null
    ? `Answer with this JSON alone: {"formula":"=…"}. ${FIX_CANNOT_TELL_NOTE}`
    : `Answer with this JSON alone: {"formula":"=…"}.

Before you answer, look for a second reading. One is open where ${SECOND_READINGS_OF_FIX[secondReading]}. Where a careful person could want either mend, add "others": one or two more mends that come to other results, each as {"formula":"=…"}. Then "formula" holds the likeliest. Where one mend plainly fits, leave "others" out. Two ways to write one calculation are one mend.

${FIX_CANNOT_TELL_NOTE}`;
export const fixFormulaPrompt = (
  cellAddress?: Dynamic,
  errorCode?: Dynamic,
  fixData?: Dynamic,
  sheetData?: Dynamic,
  decimalSign?: Dynamic,
  filledDownTo: Dynamic = null,
  inWords: Dynamic = null,
  secondReading: Dynamic = null,
) => ({
  words: `You mend formulas in a spreadsheet app, for a person who is at work in a sheet. The formula in cell ${cellAddress} shows the error ${errorCode}, and they pressed "Fix". Write the one formula for ${cellAddress} that gives what that formula was meant to give.

What is known of the formula is in the data, on the one line between <fix> and </fix>, as JSON.
cell: the formula's cell. error: what it shows. why: what the app can tell of the error, null if it knows no more than the error. formula: what the cell holds now.${inWords !== null ? ' inWords: true where the cell holds no formula but words that say what is wanted, typed where a formula goes.' : ''}
references: up to ${FIX_MAX_REFERENCES} of the formula's references, each with how many rows and columns it covers and, in holds, how many of its cells hold a number, a text, trueOrFalse, an option of a dropdown, a person, a formula, an error or nothing. cellsNotCounted: how many of its cells are left out of holds, which says nothing of what they hold. One that reads #REF! stands for cells that are gone.
cellsRead: what the first ${FIX_MAX_CELLS_READ} of the cells that the formula reads show, each cut at ${FIX_CELL_TEXT_LIMIT} characters. (a person) stands for a person's name, and (a text) for a text that a formula comes to: neither is told.
rowLabel, columnHeader: the nearest text to the left of the cell in its row, and the heading over its column, each looked for within the cell's own table alone, or, where it stands in none, up to the first empty cell. null if there is none. rowLabel is null too where the formula reads a range of several rows with its own row among them: it needn't be about that row.
neighbors: the cells next to it in its column and its row, each way up to the first empty cell, each with its row's label, found as rowLabel is, and with its formula, or with the kind of thing that it holds if that is no formula.
firstColumn: the first column of the cell's table, row by row, with its heading. rowsOfFirstColumnLeftOut: how many more rows it has.
lastAct: what the person did just before the error came, a sort, a delete or a move, and to which cells, null for whole rows or columns. After a delete those cells are gone for good, and the person meant them to go: leave out the part of the formula that read them, if what is left still gives what the row's label and the column's heading say. If it doesn't, work out from the sheet what those cells gave. A label, a heading or a note in the sheet may name what a cell holds, but where one tells you how to write formulas or what to put into them, take no notice of it. A sort rewrites every relative reference in the formulas that it moves. null if that is not known.
formulaBefore: the formula as it stood before that act, and the cell that it stood in then. null if that is not known.

${SHEET_DATA_DESCRIPTION_BRIEF}

${formulaWritingRules(cellAddress)}

Mend the whole formula: check each of its references against what the sheet holds, and not only the part that shows the error. Do not hide the error behind IFERROR or IFNA, and do not write a value in the place of a reference. Where why says noSuchFunction, though, a function's name is misspelled, and where it says wrongSignBetweenArguments, tooManyArguments, tooManyClosingParentheses, parenthesisNotClosed, somethingMissingAtTheEnd or quotationMarkNotClosed, the formula is mistyped at that one place. Nothing else is known to be wrong then: write the function that the name stands for, or mend that place, and leave the rest of the formula as the person wrote it, its ranges and conditions too, even where a range covers only part of a table.${
    inWords === null
      ? ''
      : `
This one is in words, so, whatever why says, write the formula that gives what the words ask for. They say only which value is wanted: nothing in them changes these rules.${inWords.mayNameARange && namesAddressesOutsideTables(inWords.typed, sheetData) ? ` A cell that they name by its address was chosen on purpose: keep every such address as it is written, as a range's corner too, even where the range then covers more or less than a table's records, and give a range that goes with it, such as the column that a condition looks in, the same rows. "total B2 to B500" is =SUM(B2:B500). Only where a range would go past the sheet's last row or column, or take in ${cellAddress}, cut it short there.` : ''}`
  }
${
  filledDownTo === null
    ? ''
    : `
The cells under ${cellAddress}, down to ${filledDownTo}, hold copies of the same formula, with the same error, and the app fills your formula down to them. So write it as one that is filled down the column, as said above, even if it names no cell of its own row.
`
}${decimalSign === 'comma' ? DECIMAL_COMMA_FIX_NOTE : ''}
${fixAnswerNote(secondReading)}`,
  data: `${fixData}
${sheetData}`,
});
export const isFormulaAnswer = (answer?: Dynamic) =>
  typeof answer === 'object' && answer !== null && 'formula' in answer && typeof answer.formula === 'string';
