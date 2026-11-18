import type { Dynamic } from '../dynamic.ts';
import { holdsOneNumber, isYearCell, isSumWithFormulaCell, figuresOfSelection, insertFigureFormula } from '../selection/figures.ts';
import { selectedArea, selectionAreaAndKind, activeAnchorCell } from '../selection/model.ts';
import { hasOtherRanges } from '../selection/several-ranges.ts';
import { isSelectionMoreThanActiveCell, startEntryEditing } from '../editor/start-entry.ts';
import { withNoEffects } from '../state/transitions.ts';
import { wholeAreaToA1AsStored } from '../model/a1-references.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function lineIdsOfReference(reference?: Dynamic, along?: Dynamic) {
  let lineIdOf = ({ r: r2, c: c }: Dynamic) => (along === 'column' ? c : r2);
  switch (reference.kind) {
    case 'cell':
      return [lineIdOf(reference.cell)];
    case 'range':
      return [lineIdOf(reference.topLeft), lineIdOf(reference.bottomRight)];
    case 'columns':
      return along === 'column' ? [reference.left.c, reference.right.c] : null;
    case 'rows':
      return along === 'row' ? [reference.top.r, reference.bottom.r] : null;
  }
}
export function isSumOfOwnLine(workbook: WorkbookReads, sheetId?: Dynamic, position?: Dynamic, along?: Dynamic) {
  let cellId = workbook.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
  let input = cellId === null ? undefined : workbook.cellOf(cellId)?.input;
  if (cellId === null || input?.kind !== 'formula') return false;
  let { textBetweenReferences: textBetweenReferences, references: references } = input.formula;
  if (!SUM_FORMULA_START_PATTERN.test(textBetweenReferences[0] ?? '')) return false;
  let lineId = along === 'column' ? cellId.columnId : cellId.rowId;
  return references.some(
    (reference?: Dynamic) =>
      reference.sheetId === sheetId && lineIdsOfReference(reference, along)?.every((id?: Dynamic) => id === lineId) === true,
  );
}
export function numbersToSumBefore(
  workbook: WorkbookReads,
  sheetId: Dynamic,
  { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic,
  along?: Dynamic,
) {
  let positionBack = (steps?: Dynamic) =>
    along === 'column'
      ? {
          rowIndex: rowIndex - steps,
          columnIndex: columnIndex,
        }
      : {
          rowIndex: rowIndex,
          columnIndex: columnIndex - steps,
        };
  let isNumberToSum = (position?: Dynamic) =>
    holdsOneNumber(workbook, sheetId, position) && !isSumOfOwnLine(workbook, sheetId, position, along);
  let count: Dynamic = 0;
  while (isNumberToSum(positionBack(count + 1))) count += 1;
  let beyond = positionBack(count + 1);
  let beyondCellId = workbook.cellIdAt(sheetId, beyond.rowIndex, beyond.columnIndex);
  let summedCount =
    count > 0 && isYearCell(workbook, sheetId, positionBack(count)) && (beyondCellId === null || workbook.cellOnShowIn(beyondCellId) === null)
      ? count - 1
      : count;
  if (summedCount === 0) return null;
  let first = positionBack(summedCount);
  return {
    topRowIndex: first.rowIndex,
    leftColumnIndex: first.columnIndex,
    rowCount: along === 'column' ? summedCount : 1,
    columnCount: along === 'row' ? summedCount : 1,
  };
}
export function autoSumRunAt(workbook: WorkbookReads, sheetId?: Dynamic, position?: Dynamic) {
  let above = {
    ...position,
    rowIndex: position.rowIndex - 1,
  };
  let runOnLeft = numbersToSumBefore(workbook, sheetId, position, 'row');
  let isAlongColumn = holdsOneNumber(workbook, sheetId, above) && (runOnLeft === null || !isSumOfOwnLine(workbook, sheetId, above, 'row'));
  let numbers = isAlongColumn ? numbersToSumBefore(workbook, sheetId, position, 'column') : runOnLeft;
  return numbers === null
    ? null
    : {
        numbers: numbers,
        along: isAlongColumn ? 'column' : 'row',
      };
}
export function isAutoSumForSelectedCells(state: PageState, workbook: WorkbookReads, { numbers: numbers, along: along }: Dynamic) {
  let selected = selectedArea(state, workbook);
  let isCellsSelected = !hasOtherRanges(state) && selectionAreaAndKind(state, workbook)?.kind === 'cells';
  if (selected === null || !isCellsSelected || !isSelectionMoreThanActiveCell(state, workbook)) return false;
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = selected;
  if ((along === 'column' ? rowCount : columnCount) > 1) return false;
  return (
    workbook.cellsOnShowIn(state.sheetId, selected).length === 0 &&
    workbook.mergedAreasIn(state.sheetId, selected).length === 0 &&
    Array.from(
      {
        length: rowCount * columnCount,
      },
      (_unused: Dynamic, offset: Dynamic) =>
        along === 'column'
          ? {
              rowIndex: topRowIndex,
              columnIndex: leftColumnIndex + offset,
            }
          : {
              rowIndex: topRowIndex + offset,
              columnIndex: leftColumnIndex,
            },
    ).every((position?: Dynamic) => {
      let cellId = workbook.cellIdAt(state.sheetId, position.rowIndex, position.columnIndex);
      let isPlainCell = cellId !== null && workbook.formatOf(cellId).cellControl.kind === 'none';
      let run = autoSumRunAt(workbook, state.sheetId, position);
      return isPlainCell && run?.along === along && run.numbers.rowCount === numbers.rowCount && run.numbers.columnCount === numbers.columnCount;
    })
  );
}
export function insertAutoSum(state: PageState, workbook: ReadsWithTextMeasurer) {
  if (isSumWithFormulaCell(figuresOfSelection(state, workbook))) return insertFigureFormula(state, workbook, 'sum');
  let cellId = activeAnchorCell(state, workbook);
  let position = workbook.positionOfCell(cellId);
  if (position === null || workbook.cellOnShowIn(cellId) !== null) return withNoEffects(state);
  let run = autoSumRunAt(workbook, state.sheetId, position);
  let address = run === null ? null : wholeAreaToA1AsStored(run.numbers, ownRowOrderOfSheet(workbook, state.sheetId));
  let formula = address === null ? '=SUM(' : `=SUM(${address})`;
  let editing = startEntryEditing(state, workbook, formula, 'cell');
  let isForSelectedCells = run !== null && isAutoSumForSelectedCells(state, workbook, run);
  return withNoEffects(
    isForSelectedCells && editing.mode.kind === 'editing'
      ? {
          ...editing,
          mode: {
            ...editing.mode,
            isSumForSelectedCells: true,
          },
        }
      : editing,
  );
}
export const SUM_FORMULA_START_PATTERN = /^=\s*(?:SUM|SUBTOTAL)\s*\(/i;
