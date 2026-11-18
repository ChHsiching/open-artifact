import type { Dynamic } from '../../dynamic.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { lineRunsOfSheet } from '../../format/conditional/ask-agent.ts';
import { isSameJsonValue } from '../../model/same-json.ts';
import { acceptFormulaFromAgent, callsVolatileFunction, bringsNewCommaNumbers, addsVolatileFunction } from '../agent-answer-checks.ts';
import {
  checkFormulaResult,
  fillsOtherCells,
  differsFromResult,
  PLAIN_NUMBER_SHOWN_PATTERN,
  TWO_CURRENCY_SIGNS_PATTERN,
  quoteShownText,
} from '../from-words/ask-agent.ts';
import { cellsHangingOnFormulasWhere, areaTouchesHangingCells } from '../dependents.ts';
import { splitAreaAround, isAreaWithin } from '../../selection/several-ranges.ts';
import { areaOfPosition, isSameCell } from '../../selection/model.ts';
import { tableAreaWithHeaderAt, isFormulaWrittenInWords } from '../fix-prompt.ts';
import { findFormulaReferences, resolveFormulaReference } from '../references.ts';
import { isAddressWordInSheet } from '../column-headings.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function checkFixAnswer(
  workbookSeen: Dynamic,
  {
    cellId: cellId,
    broken: broken,
    linesAsTold: linesAsTold,
    fewestCellsToRead: fewestCellsToRead,
    formulaBeforeASortOrMove: formulaBeforeASortOrMove,
    cameToBeforeASort: cameToBeforeASort,
    callsForNoNewCell: callsForNoNewCell,
    isLabelOrHeadingTold: isLabelOrHeadingTold,
  }: Dynamic,
  answer?: Dynamic,
) {
  let workbook = readsAsStored(workbookSeen);
  let position = workbook.positionOfCell(cellId);
  let linesNow = lineRunsOfSheet(workbook, cellId.sheetId);
  if (position === null || !isSameJsonValue(linesNow, linesAsTold)) return null;
  let formula = acceptFormulaFromAgent(answer, workbook, cellId.sheetId, position);
  if (formula === null || isFixNoBetter(workbook, cellId, formula, broken, formulaBeforeASortOrMove, callsForNoNewCell, isLabelOrHeadingTold))
    return null;
  if ((countCellsRead(formula, workbook.decimalSign) ?? 1 / 0) < fewestCellsToRead) return null;
  let result = checkFormulaResult(workbook, cellId, formula);
  if (typeof result === 'string' || fillsOtherCells(result)) return null;
  if (differsFromResult(result, cameToBeforeASort)) return null;
  let isPlainNumberShown = PLAIN_NUMBER_SHOWN_PATTERN.test(result.shown) && !TWO_CURRENCY_SIGNS_PATTERN.test(result.shown);
  let isShownAsIs = result.shown === '' || (result.text === null && (result.isTrueOrFalse === true || isPlainNumberShown));
  return {
    formula: formula,
    shown: isShownAsIs ? result.shown : quoteShownText(result.shown),
  };
}
export function cellsHangingOnVolatiles(workbook: WorkbookReads) {
  let cached = volatileDependentsCache.get(workbook);
  if (cached !== undefined) return cached;
  let hanging = cellsHangingOnFormulasWhere(workbook, callsVolatileFunction);
  volatileDependentsCache.set(workbook, hanging);
  return hanging;
}
export function areasReadOnlyBy(workbook: WorkbookReads, cellId?: Dynamic, formula?: Dynamic, otherFormulas?: Dynamic) {
  let readByOthers = otherFormulas.flatMap((formula2?: Dynamic) => referencedAreasOf(workbook, cellId, formula2));
  return referencedAreasOf(workbook, cellId, formula).flatMap((referenced?: Dynamic) => {
    if (referenced === null) return [null];
    let { sheetId: sheetId } = referenced.sheet;
    let areas: Dynamic = [referenced.area];
    for (let readByOther of readByOthers as Dynamic)
      if (readByOther?.sheet.sheetId === sheetId) areas = areas.flatMap((area?: Dynamic) => splitAreaAround(area, readByOther.area, 'rows'));
    return areas.map(
      (area?: Dynamic) => ({
        sheetId: sheetId,
        area: area,
      }),
    );
  });
}
export function mayNameARange(workbook: WorkbookReads, cellId?: Dynamic, formula?: Dynamic) {
  let bounded = referencesNotNamingHeadings(workbook, cellId, formula).filter(isBoundedReference);
  return bounded.length > 1 || bounded.some(({ rows: rows, columns: columns }: Dynamic) => rows.count !== 1 || columns.count !== 1);
}
export function readsBeyondTables(
  workbook: WorkbookReads,
  cellId?: Dynamic,
  fixedFormula?: Dynamic,
  brokenFormula?: Dynamic,
  formulaBefore?: Dynamic,
) {
  let otherFormulas = [brokenFormula, ...(formulaBefore === null ? [] : [formulaBefore])];
  let newlyRead = areasReadOnlyBy(workbook, cellId, fixedFormula, otherFormulas);
  if (newlyRead.some((read?: Dynamic) => read?.sheetId !== cellId.sheetId)) return true;
  let areasLeft: Dynamic = newlyRead.flatMap((read?: Dynamic) => read?.area ?? []);
  let position = workbook.positionOfCell(cellId);
  let cornersRead = referencedAreasOf(workbook, cellId, brokenFormula)
    .flatMap((referenced?: Dynamic) => (referenced?.sheet.sheetId === cellId.sheetId ? [referenced.area] : []))
    .flatMap(
      ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic) => [
        {
          rowIndex: topRowIndex,
          columnIndex: leftColumnIndex,
        },
        {
          rowIndex: topRowIndex + rowCount - 1,
          columnIndex: leftColumnIndex + columnCount - 1,
        },
      ],
    );
  let spots = [...(position === null ? [] : [position]), ...cornersRead];
  let spotsToCheck = spots
    .filter(
      (spot?: Dynamic, index?: Dynamic) =>
        spots.findIndex((other?: Dynamic) => other.rowIndex === spot.rowIndex && other.columnIndex === spot.columnIndex) === index,
    )
    .slice(0, MOST_BLOCKS_CHECKED);
  let tables: Dynamic = [];
  for (let spot of spotsToCheck as Dynamic) {
    if (areasLeft.length === 0) break;
    if (tables.some((table2?: Dynamic) => isAreaWithin(areaOfPosition(spot), table2))) continue;
    let table = tableAreaWithHeaderAt(workbook, cellId.sheetId, spot);
    if (table === null) continue;
    tables.push(table);
    areasLeft = areasLeft.flatMap((area?: Dynamic) => splitAreaAround(area, table, 'rows'));
  }
  return areasLeft.length > 0;
}
export function blockOfFilledCellsAt(filledKeys?: Dynamic, start?: Dynamic) {
  if (!filledKeys.has(positionKey(start))) return null;
  let block = new (Set as Dynamic)([positionKey(start)]);
  let [topRowIndex, bottomRowIndex, leftColumnIndex, rightColumnIndex]: Dynamic = [
    start.rowIndex,
    start.rowIndex,
    start.columnIndex,
    start.columnIndex,
  ];
  let toVisit = [start];
  for (let position: Dynamic = toVisit.pop(); position !== undefined; position = toVisit.pop()) {
    let { rowIndex: rowIndex, columnIndex: columnIndex } = position;
    [topRowIndex, bottomRowIndex] = [Math.min(topRowIndex, rowIndex), Math.max(bottomRowIndex, rowIndex)];
    [leftColumnIndex, rightColumnIndex] = [Math.min(leftColumnIndex, columnIndex), Math.max(rightColumnIndex, columnIndex)];
    for (let neighbour of [
      {
        rowIndex: rowIndex - 1,
        columnIndex: columnIndex,
      },
      {
        rowIndex: rowIndex + 1,
        columnIndex: columnIndex,
      },
      {
        rowIndex: rowIndex,
        columnIndex: columnIndex - 1,
      },
      {
        rowIndex: rowIndex,
        columnIndex: columnIndex + 1,
      },
    ] as Dynamic) {
      if (!filledKeys.has(positionKey(neighbour)) || block.has(positionKey(neighbour))) continue;
      block.add(positionKey(neighbour));
      toVisit.push(neighbour);
    }
  }
  let hull = {
    topRowIndex: topRowIndex,
    leftColumnIndex: leftColumnIndex,
    rowCount: bottomRowIndex - topRowIndex + 1,
    columnCount: rightColumnIndex - leftColumnIndex + 1,
  };
  return block.size === 1
    ? null
    : {
        cells: block,
        hull: hull,
      };
}
export function readsBeyondBlocks(
  workbook: WorkbookReads,
  cellId?: Dynamic,
  fixedFormula?: Dynamic,
  brokenFormula?: Dynamic,
  formulaBefore?: Dynamic,
) {
  let brokenReferences = referencesNotNamingHeadings(workbook, cellId, brokenFormula);
  let boundedReferences = brokenReferences.filter(isBoundedReference);
  let formulaOfSpan = ({ start: start, end: end }: Dynamic) => `=${brokenFormula.slice(start, end)}`;
  let newlyRead = areasReadOnlyBy(workbook, cellId, fixedFormula, [
    ...brokenReferences.map(formulaOfSpan),
    ...(formulaBefore === null ? [] : [formulaBefore]),
    ...referencesSpanningWholeRanges(workbook, boundedReferences, fixedFormula).map(
      ({ start: start, end: end }: Dynamic) => `=${fixedFormula.slice(start, end)}`,
    ),
  ]);
  if (newlyRead.some((read?: Dynamic) => read?.sheetId !== cellId.sheetId)) return true;
  let areas = newlyRead.flatMap((read?: Dynamic) => read?.area ?? []);
  let sheet = workbook.listSheets().find(({ sheetId: sheetId }: Dynamic) => sheetId === cellId.sheetId);
  if (areas.length === 0 || sheet === undefined) return areas.length > 0;
  let filledPositionsIn = (area?: Dynamic) => {
    let positions = workbook
      .filledCellsIn(cellId.sheetId, area)
      .flatMap((filledCellId?: Dynamic) => (isSameCell(filledCellId, cellId) ? [] : (workbook.positionOfCell(filledCellId) ?? [])));
    positions.sort(
      (position?: Dynamic, otherPosition?: Dynamic) =>
        position.rowIndex === otherPosition.rowIndex ? position.columnIndex - otherPosition.columnIndex : position.rowIndex - otherPosition.rowIndex,
    );
    return positions;
  };
  let { rowCount: rowCount, columnCount: columnCount } = sheet;
  let filledKeys = new (Set as Dynamic)(
    filledPositionsIn({
      topRowIndex: 0,
      leftColumnIndex: 0,
      rowCount: rowCount,
      columnCount: columnCount,
    }).map(positionKey),
  );
  let starts = findFormulaReferences(brokenFormula, workbook.decimalSign).references.some(
    (reference?: Dynamic) =>
      reference.sheetName === null &&
      !referencedAreasOf(workbook, cellId, formulaOfSpan(reference)).includes(null) &&
      boundedLocalReferences(workbook, fixedFormula).some((span?: Dynamic) => spansOverlap(span, reference)),
  )
    ? brokenReferences
        .flatMap((reference?: Dynamic) => referencedAreasOf(workbook, cellId, formulaOfSpan(reference)))
        .flatMap((referenced?: Dynamic) => (referenced === null ? [] : filledPositionsIn(referenced.area)))
    : areas.flatMap(filledPositionsIn).slice(0, 1);
  let blocks: Dynamic = [];
  for (let start of starts as Dynamic) {
    if (blocks.length === MOST_BLOCKS_CHECKED) break;
    if (blocks.some(({ cells: cells }: Dynamic) => cells.has(positionKey(start)))) continue;
    let block = blockOfFilledCellsAt(filledKeys, start);
    if (block !== null) blocks.push(block);
  }
  return areas.some((area?: Dynamic) => {
    let positions = filledPositionsIn(area);
    return !blocks.some(
      ({ cells: cells, hull: hull }: Dynamic) =>
        isAreaWithin(area, hull) && positions.every((position?: Dynamic) => cells.has(positionKey(position))),
    );
  });
}
export function readsCellsHangingOnVolatiles(workbook: WorkbookReads, cellId?: Dynamic, fixedFormula?: Dynamic, brokenFormula?: Dynamic) {
  let newlyRead = areasReadOnlyBy(workbook, cellId, fixedFormula, [brokenFormula]);
  if (newlyRead.length === 0) return false;
  let hangingOnVolatiles = cellsHangingOnVolatiles(workbook);
  if (hangingOnVolatiles === null || hangingOnVolatiles.size === 0) return hangingOnVolatiles === null;
  return newlyRead.some((read?: Dynamic) => read === null || areaTouchesHangingCells(hangingOnVolatiles, read.sheetId, read.area));
}
export function onlyDropsRefErrors(fixedFormula?: Dynamic, brokenFormula?: Dynamic, isLabelOrHeadingTold?: Dynamic) {
  let [broken = '', fixed = ''] = [brokenFormula, fixedFormula].map(
    (formula?: Dynamic) => formula.replaceAll(REFERENCE_NOISE_PATTERN, '').toUpperCase(),
  );
  let brokenWithoutRefErrors = broken.replaceAll(isLabelOrHeadingTold ? /\/#REF!/g : /[*/]#REF!|#REF!\*/g, '');
  return brokenWithoutRefErrors !== broken && brokenWithoutRefErrors === fixed;
}
export function countCellsRead(formula?: Dynamic, decimalSign?: Dynamic) {
  let cellKeys = new (Set as Dynamic)();
  for (let { rows: rows, columns: columns, sheetName: sheetName } of findFormulaReferences(formula, decimalSign).references as Dynamic) {
    if (sheetName !== null) continue;
    if (rows.count === null || columns.count === null) return null;
    if (cellKeys.size + rows.count * columns.count > MOST_CELLS_COUNTED_AS_READ) return null;
    for (let rowOffset: Dynamic = 0; rowOffset < rows.count; rowOffset += 1)
      for (let columnOffset: Dynamic = 0; columnOffset < columns.count; columnOffset += 1)
        cellKeys.add(`${rows.first + rowOffset}/${columns.first + columnOffset}`);
  }
  return cellKeys.size;
}
export const volatileDependentsCache = new (WeakMap as Dynamic)();
export const referencedAreasOf = (workbook: WorkbookReads, cellId?: Dynamic, formula?: Dynamic) =>
  findFormulaReferences(formula, workbook.decimalSign).references.map(
    (reference?: Dynamic) => resolveFormulaReference(reference, cellId.sheetId, workbook.listSheets()),
  );
export const lastOfSpan = ({ first: first, count: count }: Dynamic) => (count === null ? 1 / 0 : first + count - 1);
export const spansStartTogether = (span?: Dynamic, otherSpan?: Dynamic) =>
  span.rows.first === otherSpan.rows.first && span.columns.first === otherSpan.columns.first;
export const spansEndTogether = (span?: Dynamic, otherSpan?: Dynamic) =>
  lastOfSpan(span.rows) === lastOfSpan(otherSpan.rows) && lastOfSpan(span.columns) === lastOfSpan(otherSpan.columns);
export const spansOverlap = (span?: Dynamic, otherSpan?: Dynamic) =>
  span.rows.first <= lastOfSpan(otherSpan.rows) &&
  otherSpan.rows.first <= lastOfSpan(span.rows) &&
  span.columns.first <= lastOfSpan(otherSpan.columns) &&
  otherSpan.columns.first <= lastOfSpan(span.columns);
export const spanHolds = (span?: Dynamic, otherSpan?: Dynamic) =>
  span.rows.first <= otherSpan.rows.first &&
  span.columns.first <= otherSpan.columns.first &&
  lastOfSpan(otherSpan.rows) <= lastOfSpan(span.rows) &&
  lastOfSpan(otherSpan.columns) <= lastOfSpan(span.columns);
export const isBoundedReference = ({ rows: rows, columns: columns }: Dynamic) => rows.count !== null && columns.count !== null;
export const boundedLocalReferences = (workbook: WorkbookReads, formula?: Dynamic) =>
  findFormulaReferences(formula, workbook.decimalSign).references.filter(
    (reference?: Dynamic) => reference.sheetName === null && isBoundedReference(reference),
  );
export const referencesNotNamingHeadings = (workbook: WorkbookReads, cellId?: Dynamic, formula?: Dynamic) =>
  findFormulaReferences(formula, workbook.decimalSign).references.filter(
    ({ sheetName: sheetName, ends: ends }: Dynamic) =>
      sheetName === null &&
      !ends.some(({ start: start, end: end }: Dynamic) => isAddressWordInSheet(formula.slice(start, end), cellId.sheetId, workbook)),
  );
export const referencesSpanningWholeRanges = (workbook: WorkbookReads, bounded?: Dynamic, formula?: Dynamic) =>
  boundedLocalReferences(workbook, formula).filter(
    (reference?: Dynamic) =>
      bounded.some(
        (boundedReference?: Dynamic) => spanHolds(reference, boundedReference) && spansStartTogether(reference, boundedReference),
      ) &&
      bounded.some((boundedReference?: Dynamic) => spanHolds(reference, boundedReference) && spansEndTogether(reference, boundedReference)),
  );
export const MOST_BLOCKS_CHECKED = 12;
export const positionKey = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => `${rowIndex}/${columnIndex}`;
export const withoutSpaces = (formula?: Dynamic) => formula.replaceAll(' ', '');
export const REFERENCE_NOISE_PATTERN = /[\s$()]/g;
export const isFixNoBetter = (
  workbook: WorkbookReads,
  cellId?: Dynamic,
  fixedFormula?: Dynamic,
  brokenFormula?: Dynamic,
  formulaBefore?: Dynamic,
  callsForNoNewCell?: Dynamic,
  isLabelOrHeadingTold?: Dynamic,
  areOwnWords: Dynamic = false,
) =>
  withoutSpaces(fixedFormula) === withoutSpaces(brokenFormula) ||
  (workbook.decimalSign === 'comma' && bringsNewCommaNumbers(fixedFormula, [brokenFormula])) ||
  onlyDropsRefErrors(fixedFormula, brokenFormula, isLabelOrHeadingTold) ||
  (findFormulaReferences(fixedFormula, workbook.decimalSign).references.length === 0 &&
    (findFormulaReferences(brokenFormula, workbook.decimalSign).references.length > 0 || brokenFormula.includes('#REF!'))) ||
  (/^=(?:IFERROR|IFNA)\(/i.test(fixedFormula) && withoutSpaces(fixedFormula).includes(withoutSpaces(brokenFormula).slice(1))) ||
  (callsForNoNewCell &&
    areasReadOnlyBy(workbook, cellId, fixedFormula, formulaBefore === null ? [brokenFormula] : [brokenFormula, formulaBefore]).length > 0) ||
  (!areOwnWords &&
    (addsVolatileFunction(fixedFormula, brokenFormula, workbook.decimalSign) ||
      (isFormulaWrittenInWords(workbook, brokenFormula)
        ? readsBeyondBlocks(workbook, cellId, fixedFormula, brokenFormula, formulaBefore)
        : readsBeyondTables(workbook, cellId, fixedFormula, brokenFormula, formulaBefore)) ||
      readsCellsHangingOnVolatiles(workbook, cellId, fixedFormula, brokenFormula)));
export const MOST_CELLS_COUNTED_AS_READ = 1e5;
