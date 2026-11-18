import type { Dynamic } from '../../dynamic.ts';
import { findFormulaReferences } from '../references.ts';
import { errorCellsOfSheet, isErrorsOfferBlocked, errorsOfferShown } from './errors-offer.ts';
import { errorCodeOfCell, cellKeyOf } from '../error-tells.ts';
import { areaOfReference } from '../../model/reference-areas.ts';
import { ownRowOrderOfSheet } from '../../model/line-ids.ts';
import { formulaLostToLastAct, fixableErrorAt } from './ask.ts';
import { rowNumberAsStored } from '../../model/a1-references.ts';
import { isLineShown } from '../../model/line-sizes.ts';
import { layoutOfView } from '../../grid/layout.ts';
import { isSameCell, selectedArea } from '../../selection/model.ts';
import { isSelectionOneCell } from '../../selection/keyboard.ts';
import { keepIfSameJson } from '../../state/explained-under-cell.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../../state/controller.ts';
export function shiftFormulaRows(formula?: Dynamic, rowShift?: Dynamic, decimalSign?: Dynamic) {
  let shifted: Dynamic = '';
  let lastEnd: Dynamic = 0;
  for (let { ends: reference } of findFormulaReferences(formula, decimalSign).references as Dynamic)
    for (let { start: value, end: value2, dollarOfColumn: value3, letters: value4, dollarOfRow: value5, digits: value6 } of reference as Dynamic) {
      let value7 = value6 === '' || value5 !== '' ? value6 : Number(value6) + rowShift;
      if (typeof value7 === 'number' && value7 < 1) return null;
      shifted += `${formula.slice(lastEnd, value)}${value3}${value4}${value5}${value7}`;
      lastEnd = value2;
    }
  return shifted + formula.slice(lastEnd);
}
export function relativeReferenceParts(reads: WorkbookReads, reference?: Dynamic, origin?: Dynamic) {
  let { sheetId: sheetId } = reference;
  let value = (input?: Dynamic) => {
    if (input === null) return '';
    let value3 = reads.rowIndexOf(sheetId, input.r);
    if (input.isRowAbsolute) return `$${input.r}`;
    return value3 === null ? Number.NaN : value3 - origin.rowIndex;
  };
  let value2 = (input?: Dynamic) => {
    if (input === null) return '';
    let value3 = reads.columnIndexOf(sheetId, input.c);
    if (input.isColumnAbsolute) return `$${input.c}`;
    return value3 === null ? input.c : value3 - origin.columnIndex;
  };
  switch (reference.kind) {
    case 'cell':
      return [value(reference.cell), value2(reference.cell)];
    case 'range':
      return [value(reference.topLeft), value2(reference.topLeft), value(reference.bottomRight), value2(reference.bottomRight)];
    case 'columns':
      return [value2(reference.left), value2(reference.right), value(reference.top)];
    case 'rows':
      return [value(reference.top), value(reference.bottom), value2(reference.left)];
  }
}
export function areFormulasCopies(reads: WorkbookReads, cellId?: Dynamic, otherCellId?: Dynamic) {
  let stored = reads.asStored() ?? reads;
  let [items, items2] = [stored.cellOf(cellId)?.input, stored.cellOf(otherCellId)?.input];
  let [items3, items4] = [stored.positionOfCell(cellId), stored.positionOfCell(otherCellId)];
  if (items?.kind !== 'formula' || items2?.kind !== 'formula') return false;
  if (items3 === null || items4 === null) return false;
  let [items5, items6] = [items.formula, items2.formula];
  return (
    items5.textBetweenReferences.length === items6.textBetweenReferences.length &&
    items5.textBetweenReferences.every(
      (textBetweenReference?: Dynamic, index?: Dynamic) => textBetweenReference === items6.textBetweenReferences[index],
    ) &&
    items5.references.every((reference?: Dynamic, index?: Dynamic) => {
      let value = items6.references[index];
      if (value?.kind !== reference.kind || value.sheetId !== reference.sheetId) return false;
      let value2 = relativeReferenceParts(stored, value, items4);
      return relativeReferenceParts(stored, reference, items3).every((input?: Dynamic, options?: Dynamic) => input === value2[options]);
    })
  );
}
export function hasRowInRange(view?: Dynamic, rowEdges?: Dynamic) {
  let [low, high]: Dynamic = [0, rowEdges.length];
  while (low < high) {
    let middle = (low + high) >> 1;
    if ((rowEdges[middle] ?? 0) < view.topRowIndex) low = middle + 1;
    else high = middle;
  }
  let value = rowEdges[low];
  return value !== undefined && value < view.topRowIndex + view.rowCount;
}
export function rootErrorCells(reads: WorkbookReads, sheetId?: Dynamic) {
  let bySheet = rootErrorCellsCache.get(reads) ?? new (Map as Dynamic)();
  rootErrorCellsCache.set(reads, bySheet);
  let entry = bySheet.get(sheetId);
  if (entry !== undefined) return entry;
  let errorCells = errorCellsOfSheet(reads, sheetId) ?? [];
  let rootCells = new (Map as Dynamic)();
  let value = (input?: Dynamic) => errorCodeOfCell(reads.cellOnShowIn(input));
  for (let { cellId: value3, position: value4 } of errorCells as Dynamic) {
    let value5 = rootCells.get(value(value3)) ?? new (Map as Dynamic)();
    rootCells.set(value(value3), value5);
    let value6 = value5.get(value4.columnIndex) ?? [];
    value5.set(value4.columnIndex, value6);
    value6.push(value4.rowIndex);
  }
  for (let value3 of rootCells.values() as Dynamic)
    for (let value4 of value3.values() as Dynamic) value4.sort((input?: Dynamic, options?: Dynamic) => input - options);
  let items: Dynamic = [];
  for (let value3 of errorCells as Dynamic) {
    let { cellId: value4 } = value3;
    let value5 = reads.cellOf(value4)?.input;
    let value6 = rootCells.get(value(value4)) ?? new (Map as Dynamic)();
    if (
      !(value5?.kind === 'formula' ? value5.formula.references : []).some((input?: Dynamic) => {
        let value7 = input.sheetId === sheetId ? areaOfReference(reads, input) : null;
        if (value7 === null) return false;
        return [...value6].some(
          ([input2, input3]: Dynamic) =>
            input2 >= value7.leftColumnIndex && input2 < value7.leftColumnIndex + value7.columnCount && hasRowInRange(value7, input3),
        );
      })
    )
      items.push(value3);
    if (items.length > MAX_ROOT_ERROR_CELLS) break;
  }
  items.sort(
    ({ position: position }: Dynamic, { position: position2 }: Dynamic) =>
      position.columnIndex === position2.columnIndex ? position.rowIndex - position2.rowIndex : position.columnIndex - position2.columnIndex,
  );
  let value2 = items.length === 0 || items.length > MAX_ROOT_ERROR_CELLS ? null : items;
  bySheet.set(sheetId, value2);
  return value2;
}
export function isCellFixable(state: PageState, reads: WorkbookReads, cellId?: Dynamic) {
  let formulasLostToLastAct = state.formulasLostToLastAct;
  return (
    (formulasLostToLastAct !== null &&
      formulasLostToLastAct.atChangeCount === state.workbookChangeCount &&
      formulasLostToLastAct.byCell.has(cellKeyOf(cellId))) ||
    FIXABLE_ERROR_CODES.has(errorCodeOfCell(reads.cellOnShowIn(cellId)))
  );
}
export function isFormulaCopyBelow(upper?: Dynamic, lower?: Dynamic, decimalSign?: Dynamic) {
  let rowShift = Number(TRAILING_DIGITS.exec(lower.cell)?.[0]) - Number(TRAILING_DIGITS.exec(upper.cell)?.[0]);
  return (
    Number.isInteger(rowShift) &&
    upper.cell.replace(TRAILING_DIGITS, '') === lower.cell.replace(TRAILING_DIGITS, '') &&
    shiftFormulaRows(upper.text, rowShift, decimalSign) === lower.text
  );
}
export function isCopyOfCellAbove({ state: state, reads: reads, rowEdges: rowEdges }: Dynamic, upper?: Dynamic, lower?: Dynamic) {
  let ownRowOrder = ownRowOrderOfSheet(reads, state.sheetId);
  let [upperFormula, lowerFormula] = [upper, lower].map(({ cellId: cellId }: Dynamic) => formulaLostToLastAct(state, cellId));
  return (
    lower.position.columnIndex === upper.position.columnIndex &&
    lower.position.rowIndex === upper.position.rowIndex + 1 &&
    rowNumberAsStored(lower.position.rowIndex, ownRowOrder) === rowNumberAsStored(upper.position.rowIndex, ownRowOrder) + 1 &&
    isLineShown(rowEdges, lower.position.rowIndex) &&
    reads.mergedAreaAt(state.sheetId, upper.position) === null &&
    reads.mergedAreaAt(state.sheetId, lower.position) === null &&
    errorCodeOfCell(reads.cellOnShowIn(lower.cellId)) === errorCodeOfCell(reads.cellOnShowIn(upper.cellId)) &&
    (upperFormula === undefined || lowerFormula === undefined
      ? upperFormula === lowerFormula && reads.cellOf(upper.cellId)?.formulaText?.includes('#REF!') !== true
      : isFormulaCopyBelow(upperFormula, lowerFormula, reads.decimalSign)) &&
    areFormulasCopies(reads, upper.cellId, lower.cellId)
  );
}
export function fixesToOffer(state: PageState, reads: ReadsWithTextMeasurer, view?: Dynamic) {
  if (state.fixesOnCells.cameToNothingAt === state.workbookChangeCount) return null;
  let rootCells = (rootErrorCells(reads, state.sheetId) ?? []).filter(
    ({ position: position }: Dynamic) => view === null || isPositionInGridArea(view, position),
  );
  if (rootCells.length === 0) return null;
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(state, reads);
  let inView = rootCells.filter(
    ({ cellId: cellId, position: position }: Dynamic) =>
      isCellFixable(state, reads, cellId) &&
      isLineShown(rowEdges, position.rowIndex) &&
      isLineShown(columnEdges, position.columnIndex) &&
      reads.formatOf(cellId).cellControl.kind === 'none',
  );
  let items: Dynamic = [];
  let copyContext = {
    state: state,
    reads: reads,
    rowEdges: rowEdges,
  };
  for (let value2 of inView as Dynamic) {
    let value3 = items.at(-1)?.at(-1);
    if (value3 !== undefined && isCopyOfCellAbove(copyContext, value3, value2)) items.at(-1)?.push(value2);
    else items.push([value2]);
  }
  if (items.length > MAX_FIX_GROUPS) return null;
  let items2: Dynamic = [];
  let value: Dynamic = false;
  for (let [value2, ...value3] of items as Dynamic) {
    let value4 = value2 === undefined ? null : fixableErrorAt(state, reads, value2.cellId);
    if (value4 === null || value2 === undefined) continue;
    if (value4 === 'yetToBeKnown') value = true;
    else if (isSameCell(value4.origin, value2.cellId))
      items2.push({
        ...value4,
        copies: value3.map(({ cellId: cellId }: Dynamic) => cellId),
      });
  }
  if (value) return 'yetToBeKnown';
  return items2.length === 0 ? null : items2;
}
export function fixesToOfferInSelection(state: PageState, reads: ReadsWithTextMeasurer) {
  if (state.otherRanges.length > 0 || isSelectionOneCell(state, reads)) return null;
  if (isErrorsOfferBlocked(state) || state.errorsOffered?.sheetId !== state.sheetId) return null;
  let selectedArea2 = selectedArea(state, reads);
  return selectedArea2 === null ? null : fixesToOffer(state, reads, selectedArea2);
}
export function updateFixesToOffer(state: PageState, reads: ReadsWithTextMeasurer) {
  let { toOffer: toOffer2, toOfferInSelection: toOfferInSelection, stage: stage } = state.fixesOnCells;
  if (stage !== null) return state;
  let toOffer = keepIfSameJson(fixesToOfferOnSheet(state, reads), toOffer2);
  let inSelection = keepIfSameJson(state.menu === null ? null : fixesToOfferInSelection(state, reads), toOfferInSelection);
  return toOffer === toOffer2 && inSelection === toOfferInSelection
    ? state
    : withFixesOnCells(state, {
        toOffer: toOffer,
        toOfferInSelection: inSelection,
      });
}
export const NO_FIXES_ON_CELLS = {
  toOffer: null,
  toOfferInSelection: null,
  stage: null,
  cameToNothingAt: null,
  askCount: 0,
  isEndToldDuringAct: false,
  offerDueBackOn: [],
};
export const MAX_FIX_GROUPS = 5;
export const MAX_ROOT_ERROR_CELLS = 200;
export const STOP_FIX_ASKS_EFFECTS = [
  {
    kind: 'stopAskingAgentForFixes',
  },
];
export const withFixesOnCells = (state: PageState, changes?: Dynamic) => ({
  ...state,
  fixesOnCells: {
    ...state.fixesOnCells,
    ...changes,
  },
});
export const isPositionInGridArea = (view: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  rowIndex >= view.topRowIndex &&
  rowIndex < view.topRowIndex + view.rowCount &&
  columnIndex >= view.leftColumnIndex &&
  columnIndex < view.leftColumnIndex + view.columnCount;
export const rootErrorCellsCache = new (WeakMap as Dynamic)();
export const FIXABLE_ERROR_CODES = new (Set as Dynamic)(['#NAME?', '#ERROR!']);
export const TRAILING_DIGITS = /\d+$/;
export const fixesToOfferOnSheet = (state: PageState, reads: ReadsWithTextMeasurer) =>
  errorsOfferShown(state, reads) === null && state.errorsAtOpening === null ? null : fixesToOffer(state, reads, null);
