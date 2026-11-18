import type { Dynamic } from '../dynamic.ts';
import { areaOfReference } from '../model/reference-areas.ts';
import { mightFormulaSpill } from './agent-answer-checks.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function areaTouchesHangingCells(
  filledBySheet: Dynamic,
  sheetId: Dynamic,
  { topRowIndex: topRow, leftColumnIndex: leftColumn, rowCount: rowCount, columnCount: columnCount }: Dynamic,
  budget: Dynamic = {
    stepsLeft: 1 / 0,
  },
) {
  let filledIn = filledBySheet.get(sheetId);
  if (filledIn === undefined) return false;
  let { filled: filled, rowsByColumn: rowsByColumn } = filledIn;
  let [bottomRow, rightColumn] = [topRow + rowCount - 1, leftColumn + columnCount - 1];
  budget.stepsLeft -= filled.length + Math.min(columnCount, rowsByColumn.size);
  if (filled.some((input?: Dynamic) => input.rowIndex <= bottomRow && input.columnIndex <= rightColumn)) return true;
  let hasRowInRange2 = (rows?: Dynamic) => {
    if (rows.size <= rowCount) {
      for (let rowIndex of rows as Dynamic) if (((budget.stepsLeft -= 1), rowIndex >= topRow && rowIndex <= bottomRow)) return true;
      return false;
    }
    for (let rowIndex: Dynamic = topRow; rowIndex <= bottomRow; rowIndex += 1) if (((budget.stepsLeft -= 1), rows.has(rowIndex))) return true;
    return false;
  };
  if (columnCount <= rowsByColumn.size) {
    for (let columnIndex: Dynamic = leftColumn; columnIndex <= rightColumn; columnIndex += 1) {
      let rows = rowsByColumn.get(columnIndex);
      if (rows !== undefined && hasRowInRange2(rows)) return true;
    }
    return false;
  }
  for (let [columnIndex, rows] of rowsByColumn as Dynamic)
    if (columnIndex >= leftColumn && columnIndex <= rightColumn && hasRowInRange2(rows)) return true;
  return false;
}
export function areaOfReferenceOrSheet(reads: WorkbookReads, reference?: Dynamic) {
  let area = areaOfReference(reads, reference);
  if (area !== null || reference.kind === 'cell') return area;
  let sheet = reads.listSheets().find(({ sheetId: sheetId }: Dynamic) => sheetId === reference.sheetId);
  return sheet === undefined
    ? null
    : {
        topRowIndex: 0,
        leftColumnIndex: 0,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
      };
}
export function findCellsHangingOn(reads: WorkbookReads, startCells?: Dynamic, maxSteps: Dynamic = MAX_DEPENDENT_STEPS) {
  let hangingBySheet = new (Map as Dynamic)();
  let markHanging = (sheetId?: Dynamic, position?: Dynamic, couldFill?: Dynamic) => {
    let hanging = hangingBySheet.get(sheetId) ?? {
      rowsByColumn: new (Map as Dynamic)(),
      filled: [],
    };
    hangingBySheet.set(sheetId, hanging);
    let rows = hanging.rowsByColumn.get(position.columnIndex) ?? new (Set as Dynamic)();
    hanging.rowsByColumn.set(position.columnIndex, rows);
    rows.add(position.rowIndex);
    if (couldFill) hanging.filled.push(position);
  };
  for (let value of startCells as Dynamic) {
    let value2 = reads.positionOfCell(value);
    let value3 = reads.cellOf(value)?.formulaText ?? '';
    if (value2 !== null) markHanging(value.sheetId, value2, mightFormulaSpill(value3, reads.decimalSign));
  }
  let formulas: Dynamic = [];
  for (let { sheetId: value } of reads.listSheets() as Dynamic)
    for (let [value2, value3] of reads.cellsHeldByRow(value) as Dynamic)
      for (let [columnId, { input: input, formulaText = '' }] of value3 as Dynamic) {
        let position =
          input.kind === 'formula'
            ? reads.positionOfCell({
                sheetId: value,
                rowId: value2,
                columnId: columnId,
              })
            : null;
        if (input.kind !== 'formula' || position === null) continue;
        let readAreas = input.formula.references.flatMap((reference?: Dynamic) => {
          let area = areaOfReferenceOrSheet(reads, reference);
          return area === null
            ? []
            : [
                {
                  sheetId: reference.sheetId,
                  area: area,
                },
              ];
        });
        let couldFill = mightFormulaSpill(formulaText, reads.decimalSign);
        if (readAreas.length > 0 || couldFill)
          formulas.push({
            sheetId: value,
            at: position,
            couldFill: couldFill,
            read: readAreas,
          });
      }
  formulas.sort(
    ({ at: at }: Dynamic, { at: at2 }: Dynamic) =>
      at.rowIndex === at2.rowIndex ? at.columnIndex - at2.columnIndex : at.rowIndex - at2.rowIndex,
  );
  let budget = {
    stepsLeft: maxSteps,
  };
  while (budget.stepsLeft >= 0) {
    let matches = formulas.filter(({ sheetId: sheetId, at: at, couldFill: couldFill, read: read }: Dynamic) => {
      budget.stepsLeft -= 1;
      if (budget.stepsLeft < 0) return true;
      let isHanging =
        (couldFill && (hangingBySheet.get(sheetId)?.filled.length ?? 0) > 0) ||
        read.some((input?: Dynamic) => areaTouchesHangingCells(hangingBySheet, input.sheetId, input.area, budget));
      if (isHanging) markHanging(sheetId, at, couldFill);
      return !isHanging;
    });
    if (matches.length === formulas.length && budget.stepsLeft >= 0) return hangingBySheet;
    matches.reverse();
    formulas = matches;
  }
  return null;
}
export function cellsHangingOnFormulasWhere(reads: WorkbookReads, isWanted?: Dynamic) {
  let startCells: Dynamic = [];
  for (let { sheetId: sheetId } of reads.listSheets() as Dynamic)
    for (let [rowId, cellsByColumn] of reads.cellsHeldByRow(sheetId) as Dynamic)
      for (let [columnId, { formulaText: formulaText }] of cellsByColumn as Dynamic)
        if (formulaText !== undefined && isWanted(formulaText))
          startCells.push({
            sheetId: sheetId,
            rowId: rowId,
            columnId: columnId,
          });
  return startCells.length === 0 ? new (Map as Dynamic)() : findCellsHangingOn(reads, startCells);
}
export const MAX_DEPENDENT_STEPS = 20000000;
