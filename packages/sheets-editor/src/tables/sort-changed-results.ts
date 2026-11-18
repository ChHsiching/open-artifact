import type { Dynamic } from '../dynamic.ts';
import { formulaMatchesOutsideReferences, sheetPrefixForFormula } from '../formulas/references.ts';
import { areaOfReference } from '../model/reference-areas.ts';
import { areasOverlap } from '../model/workbook.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { shownCellText } from '../format/shown-text.ts';
import { cellsHangingOnFormulasWhere, areaTouchesHangingCells } from '../formulas/dependents.ts';
import { areaOfPosition, scrollToShowPosition } from '../selection/model.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { sortSourceRows } from '../formulas/lost-formulas.ts';
import { isEntryWorkPending } from '../editor/unanswered-entries.ts';
import { isInSpan } from '../grid/geometry.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function edgesOfReference(reference?: Dynamic) {
  switch (reference.kind) {
    case 'cell': {
      let { cell: cellOrTopLeft } = reference;
      return {
        top: cellOrTopLeft,
        bottom: cellOrTopLeft,
        left: cellOrTopLeft,
        right: cellOrTopLeft,
      };
    }
    case 'range': {
      let { topLeft: cellOrTopLeft, bottomRight: bottomRight } = reference;
      return {
        top: cellOrTopLeft,
        bottom: bottomRight,
        left: cellOrTopLeft,
        right: bottomRight,
      };
    }
    case 'columns':
      return {
        ...reference,
        bottom: null,
      };
    case 'rows':
      return {
        ...reference,
        right: null,
      };
  }
}
export function isReferenceKeptBySort(reference?: Dynamic, rowId?: Dynamic, facts?: Dynamic) {
  let {
    sheetId: sheetId,
    area: area,
    lastRowThatShowsAnything: lastRowThatShowsAnything,
    rowIndexOf: rowIndexOf,
    columnIndexOf: columnIndexOf,
  } = facts;
  if (reference.sheetId !== sheetId) return true;
  let edges = edgesOfReference(reference);
  let leftIndex = edges.left === null ? 0 : columnIndexOf(edges.left.c);
  let rightIndex = edges.right === null ? facts.lastColumnIndex : columnIndexOf(edges.right.c);
  if (leftIndex === null && edges.left?.c === edges.right?.c) return true;
  let isWithinColumns =
    facts.isEveryColumnSorted ||
    (isIndexInSpan(leftIndex, area.leftColumnIndex, area.columnCount) && isIndexInSpan(rightIndex, area.leftColumnIndex, area.columnCount));
  let [isTopFixed, isBottomFixed] = [isRowFixed(edges.top), isRowFixed(edges.bottom)];
  if (!isTopFixed && !isBottomFixed && edges.top?.r === rowId && edges.bottom?.r === rowId) return isWithinColumns;
  let topIndex = edges.top === null ? 0 : rowIndexOf(edges.top.r);
  let bottomIndex = edges.bottom === null ? facts.lastRowIndex : rowIndexOf(edges.bottom.r);
  if (topIndex === null || bottomIndex === null) return edges.top?.r === edges.bottom?.r;
  let [firstRow, lastRow] = [Math.min(topIndex, bottomIndex), Math.max(topIndex, bottomIndex)];
  if (isTopFixed && isBottomFixed)
    return (
      (leftIndex !== null && rightIndex !== null && Math.max(leftIndex, rightIndex) < area.leftColumnIndex) ||
      (leftIndex !== null && rightIndex !== null && Math.min(leftIndex, rightIndex) >= area.leftColumnIndex + area.columnCount) ||
      lastRow < area.topRowIndex ||
      firstRow > lastRowThatShowsAnything ||
      (firstRow <= area.topRowIndex && lastRow >= lastRowThatShowsAnything)
    );
  let isRowNearArea = (rowIndex?: Dynamic, isFixed?: Dynamic) =>
    isFixed || isIndexInSpan(rowIndex, area.topRowIndex - 1, area.rowCount + 2);
  return isWithinColumns && isRowNearArea(topIndex, isTopFixed) && isRowNearArea(bottomIndex, isBottomFixed);
}
export function isSameFilledFormula(
  { formula: formula, rowIndex: rowIndex }: Dynamic,
  { formula: otherFormula, rowIndex: otherRowIndex }: Dynamic,
  { sheetId: sheetId, rowIndexOf: rowIndexOf }: Dynamic,
) {
  let isSameRowEdge = (edge?: Dynamic, otherEdge?: Dynamic) => {
    if (edge === null || otherEdge === null) return edge === otherEdge;
    if (edge.isRowAbsolute !== otherEdge.isRowAbsolute) return false;
    if (edge.isRowAbsolute) return edge.r === otherEdge.r;
    let [edgeRow, otherEdgeRow] = [rowIndexOf(edge.r), rowIndexOf(otherEdge.r)];
    return edgeRow !== null && otherEdgeRow !== null && edgeRow - rowIndex === otherEdgeRow - otherRowIndex;
  };
  return (
    formula.references.length === otherFormula.references.length &&
    formula.textBetweenReferences.every((text?: Dynamic, nth?: Dynamic) => text === otherFormula.textBetweenReferences[nth]) &&
    formula.references.every((reference?: Dynamic, nth?: Dynamic) => {
      let otherReference = otherFormula.references[nth];
      if (reference.kind !== otherReference?.kind || reference.sheetId !== otherReference.sheetId) return false;
      if (reference.sheetId !== sheetId) return true;
      let [edges, otherEdges] = [edgesOfReference(reference), edgesOfReference(otherReference)];
      return (
        isSameRowEdge(edges.top, otherEdges.top) &&
        isSameRowEdge(edges.bottom, otherEdges.bottom) &&
        isSameColumnEdge(edges.left, otherEdges.left) &&
        isSameColumnEdge(edges.right, otherEdges.right)
      );
    })
  );
}
export function memoizeByKey(compute?: Dynamic) {
  let cache = new (Map as Dynamic)();
  return (key?: Dynamic) => {
    let cached = cache.get(key);
    if (cached !== undefined) return cached;
    let computed = compute(key);
    cache.set(key, computed);
    return computed;
  };
}
export function sortAreaFacts(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let shownArea = reads.areaOnShowIn(sheetId, area);
  let lines = reads.linesOf(sheetId);
  if (shownArea === null || lines === null) return null;
  return {
    sheetId: sheetId,
    area: area,
    isEveryColumnSorted: area.columnCount === lines.columns.count,
    lastRowThatShowsAnything: shownArea.topRowIndex + shownArea.rowCount - 1,
    lastRowIndex: lines.rows.count - 1,
    lastColumnIndex: lines.columns.count - 1,
    rowIndexOf: memoizeByKey((rowId?: Dynamic) => reads.rowIndexOf(sheetId, rowId)),
    columnIndexOf: memoizeByKey((columnId?: Dynamic) => reads.columnIndexOf(sheetId, columnId)),
  };
}
export function dependsOnOtherRows(
  reads: WorkbookReads,
  { formula: formula, text: text, rowIndex: rowIndex, drawsRandomNumbers: drawsRandomNumbers }: Dynamic,
  changedColumns: Dynamic,
  { sheetId: sheetId, area: area, rowIndexOf: rowIndexOf }: Dynamic,
) {
  let isOwnRowEdge = (edge?: Dynamic) => !isRowFixed(edge) && edge !== null && rowIndexOf(edge.r) === rowIndex;
  return (
    drawsRandomNumbers ||
    formulaMatchesOutsideReferences(text, ROW_DEPENDENT_FUNCTION_PATTERN, reads.decimalSign) ||
    formula.references.some((reference?: Dynamic) => {
      if (reference.sheetId !== sheetId) return false;
      let { top: top, bottom: bottom } = edgesOfReference(reference);
      if (!(isRowFixed(top) && isRowFixed(bottom)) && !(isOwnRowEdge(top) && isOwnRowEdge(bottom))) return true;
      let referencedArea = areaOfReference(reads, reference);
      if (referencedArea === null) return false;
      for (let columnIndex of changedColumns as Dynamic)
        if (
          areasOverlap(referencedArea, {
            ...area,
            leftColumnIndex: columnIndex,
            columnCount: 1,
          })
        )
          return true;
      return false;
    })
  );
}
export function orderDependentColumns(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let facts = sortAreaFacts(reads, sheetId, area);
  if (facts === null) return new (Set as Dynamic)();
  let rowsWithCells: Dynamic = 0;
  let formulaColumns = new (Map as Dynamic)();
  for (let [rowIdOrIsGrowing, cellsOrColumn] of reads.cellsHeldByRow(sheetId) as Dynamic) {
    let rowIndexOrCount = facts.rowIndexOf(rowIdOrIsGrowing);
    if (!isIndexInSpan(rowIndexOrCount, area.topRowIndex, area.rowCount)) continue;
    let hasCellsOrOneOfThem: Dynamic = false;
    for (let [columnId, cellFacts] of cellsOrColumn as Dynamic) {
      let { input: input, spill: spill, formulaText = '', drawsRandomNumbers = false } = cellFacts;
      let columnIndex = facts.columnIndexOf(columnId);
      if (!isIndexInSpan(columnIndex, area.leftColumnIndex, area.columnCount)) continue;
      hasCellsOrOneOfThem = true;
      if (input.kind !== 'formula') continue;
      let formulaCell = {
        formula: input.formula,
        text: formulaText,
        rowIndex: rowIndexOrCount,
        drawsRandomNumbers: drawsRandomNumbers,
      };
      let columnFacts = formulaColumns.get(columnIndex) ?? {
        count: 0,
        oneOfThem: formulaCell,
      };
      formulaColumns.set(columnIndex, columnFacts);
      columnFacts.count += 1;
      if (
        !(
          columnFacts.oneOfThem !== null &&
          spill === undefined &&
          formulaCell.formula.references.every((reference?: Dynamic) => isReferenceKeptBySort(reference, rowIdOrIsGrowing, facts)) &&
          isSameFilledFormula(columnFacts.oneOfThem, formulaCell, facts)
        )
      )
        columnFacts.oneOfThem = null;
    }
    if (hasCellsOrOneOfThem) rowsWithCells += 1;
  }
  if (rowsWithCells !== facts.lastRowThatShowsAnything - area.topRowIndex + 1) return new (Set as Dynamic)();
  let changedColumns = new (Set as Dynamic)();
  for (let rowIdOrIsGrowing: Dynamic = true; rowIdOrIsGrowing; ) {
    rowIdOrIsGrowing = false;
    for (let [cellsOrColumn, { count: rowIndexOrCount, oneOfThem: hasCellsOrOneOfThem }] of formulaColumns as Dynamic) {
      if (hasCellsOrOneOfThem === null || rowIndexOrCount !== rowsWithCells || changedColumns.has(cellsOrColumn)) continue;
      if (!dependsOnOtherRows(reads, hasCellsOrOneOfThem, changedColumns, facts)) continue;
      changedColumns.add(cellsOrColumn);
      rowIdOrIsGrowing = true;
    }
  }
  return changedColumns;
}
export function isSameCellValue(cell?: Dynamic, otherCell?: Dynamic) {
  let [value, otherValue] = [cellValueOf(cell), cellValueOf(otherCell)];
  if (cellValueKey(value) === cellValueKey(otherValue)) return true;
  if (value?.kind !== 'number' || otherValue?.kind !== 'number') return false;
  if (Number.isSafeInteger(value.value) && Number.isSafeInteger(otherValue.value)) return false;
  let [shown, otherShown] = [cell, otherCell].map((cell2?: Dynamic) => shownCellText(cell2, 1 / 0, 'point'));
  return JSON.stringify(shown) === JSON.stringify(otherShown);
}
export function compareCellValues(cell?: Dynamic, otherCell?: Dynamic) {
  let [value, otherValue] = [cellValueOf(cell), cellValueOf(otherCell)];
  if (value?.kind === 'number' && otherValue?.kind === 'number') return value.value - otherValue.value;
  let [key, otherKey] = [value, otherValue].map((value2?: Dynamic) => `${value2?.kind} ${value2?.value}`);
  return key === otherKey ? 0 : (key ?? '') < (otherKey ?? '') ? -1 : 1;
}
export function resultCellsOfFormula(reads: WorkbookReads, sheetId?: Dynamic, cell?: Dynamic) {
  if (cell?.input.kind !== 'formula' || cell.value === undefined) return null;
  let spillArea =
    cell.spill?.kind === 'fills'
      ? reads.spillOver({
          sheetId: sheetId,
          rowId: cell.r,
          columnId: cell.c,
        })?.area
      : undefined;
  if (spillArea === undefined) return [cell];
  let cells = reads.cellsOnShowIn(sheetId, spillArea).flatMap((cellRef?: Dynamic) => reads.cellOnShowIn(cellRef) ?? []);
  cells.sort(compareCellValues);
  return cells;
}
export function rowsWhoseResultsChanged(before?: Dynamic, after?: Dynamic) {
  for (let value of [before, after] as Dynamic)
    value.sort((first?: Dynamic, second?: Dynamic) => compareCellValues(first.cell, second.cell));
  let changedRows = new (Set as Dynamic)();
  let beforeIndex: Dynamic = 0;
  for (let { rowIndex: value, cell: afterCell } of after as Dynamic) {
    let isFound: Dynamic = false;
    for (let beforeEntry: Dynamic = before[beforeIndex]; beforeEntry !== undefined && !isFound; beforeEntry = before[beforeIndex]) {
      isFound = isSameCellValue(beforeEntry.cell, afterCell);
      if (!isFound && compareCellValues(beforeEntry.cell, afterCell) >= 0) break;
      beforeIndex += 1;
    }
    if (!isFound) changedRows.add(value);
  }
  return changedRows;
}
export function changedFormulaResults(readsBefore?: Dynamic, readsAfter?: Dynamic, sheetIdOfAct?: Dynamic, hasResultChanged?: Dynamic) {
  let cellsHangingOnNowOrToday: Dynamic = null;
  let isChangeNotFromTimeZone = (sheetId?: Dynamic, cell?: Dynamic, position?: Dynamic) => {
    if (readsBefore.timeZone === readsAfter.timeZone) return true;
    if (cell.value?.kind === 'error' && cell.value.value !== '#N/A') return true;
    cellsHangingOnNowOrToday ??=
      cellsHangingOnFormulasWhere(
        readsAfter,
        (formulaText?: Dynamic) => formulaMatchesOutsideReferences(formulaText, NOW_OR_TODAY_PATTERN, readsAfter.decimalSign),
      ) ?? 'tooManyToTell';
    return cellsHangingOnNowOrToday !== 'tooManyToTell' && !areaTouchesHangingCells(cellsHangingOnNowOrToday, sheetId, areaOfPosition(position));
  };
  let [changedCount, changedErrorCount]: Dynamic = [0, 0];
  let firstCellText: Dynamic = null;
  let sheets = readsAfter.listSheets();
  for (let { sheetId: sheetId, name: sheetName } of sheets as Dynamic) {
    if (readsBefore.sheetAsItStands(sheetId) === readsAfter.sheetAsItStands(sheetId)) continue;
    let changedPositions: Dynamic = [];
    let visitCell = (cell?: Dynamic) => {
      if (cell.input.kind !== 'formula') return;
      let position = readsAfter.positionOfCell({
        sheetId: sheetId,
        rowId: cell.r,
        columnId: cell.c,
      });
      if (position === null || !hasResultChanged(sheetId, cell, position)) return;
      if (!isChangeNotFromTimeZone(sheetId, cell, position)) return;
      changedPositions.push(position);
      if (cell.value?.kind === 'error') changedErrorCount += 1;
    };
    let cellsBeforeByRow = readsBefore.cellsHeldByRow(sheetId);
    for (let [rowId, cellsOfRow] of readsAfter.cellsHeldByRow(sheetId) as Dynamic) {
      if (cellsBeforeByRow.get(rowId) === cellsOfRow) continue;
      for (let cellOfRow of cellsOfRow.values() as Dynamic) if (cellOfRow.spill === undefined) visitCell(cellOfRow);
    }
    readsAfter.cellsWithSpillIn(sheetId).forEach(visitCell);
    changedCount += changedPositions.length;
    let [firstChanged, ...otherChanged] = changedPositions;
    if (firstChanged === undefined || (firstCellText !== null && sheetId !== sheetIdOfAct)) continue;
    let earliestChanged = otherChanged.reduce(
      (earliest?: Dynamic, position?: Dynamic) => (comesBeforeInReadingOrder(position, earliest) ? position : earliest),
      firstChanged,
    );
    let cellAddress = areaToA1AsStored(areaOfPosition(earliestChanged), ownRowOrderOfSheet(readsAfter, sheetId));
    firstCellText = sheets.length === 1 ? cellAddress : `${sheetPrefixForFormula(sheetName)}${cellAddress}`;
  }
  return firstCellText === null
    ? null
    : {
        count: changedCount,
        errorCount: changedErrorCount,
        firstCell: firstCellText,
      };
}
export function resultsChangedBySort(readsBeforeSort?: Dynamic, readsAfterSort?: Dynamic, sorted?: Dynamic) {
  let readsBefore = readsBeforeSort.asStored() ?? readsBeforeSort;
  let readsAfter = readsAfterSort.asStored() ?? readsAfterSort;
  let { area: area } = sorted;
  let columnsExpectedToChange: Dynamic = null;
  let sourceRows: Dynamic = null;
  let unmatchedRowsByColumn = new (Map as Dynamic)();
  let sourceRowOf = (rowIndex?: Dynamic) => {
    sourceRows ??= sortSourceRows(readsBefore, readsAfter, sorted);
    let rowOffset = sourceRows[rowIndex - area.topRowIndex] ?? null;
    return rowOffset === null ? null : area.topRowIndex + rowOffset;
  };
  let cellBeforeSortAt = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
    let sourceRow = sourceRowOf(rowIndex);
    let cellId = sourceRow === null ? null : readsBefore.cellIdAt(sorted.sheetId, sourceRow, columnIndex);
    return cellId === null ? null : readsBefore.cellOf(cellId);
  };
  let isResultUnmatchedInColumn = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
    let unmatchedRows: Dynamic = unmatchedRowsByColumn.get(columnIndex);
    if (unmatchedRows === undefined) {
      let rowIndexes = Array.from<Dynamic, Dynamic>(
        {
          length: area.rowCount,
        },
        (input?: Dynamic, offset?: Dynamic) => area.topRowIndex + offset,
      );
      let sourceRowsUsed = new (Set as Dynamic)(rowIndexes.map(sourceRowOf));
      let formulaCellsOfRows = (reads: WorkbookReads, keepsRow?: Dynamic) =>
        rowIndexes.filter(keepsRow).flatMap((rowIndex2?: Dynamic) => {
          let cellId = reads.cellIdAt(sorted.sheetId, rowIndex2, columnIndex);
          let cell = cellId === null ? null : reads.cellOf(cellId);
          return cell?.input.kind === 'formula'
            ? [
                {
                  rowIndex: rowIndex2,
                  cell: cell,
                },
              ]
            : [];
        });
      let formulaCellsBefore = formulaCellsOfRows(readsBefore, (rowIndex2?: Dynamic) => !sourceRowsUsed.has(rowIndex2));
      unmatchedRows = formulaCellsBefore.some(({ cell: cell }: Dynamic) => cell.value === undefined)
        ? new (Set as Dynamic)()
        : rowsWhoseResultsChanged(
            formulaCellsBefore,
            formulaCellsOfRows(readsAfter, (rowIndex2?: Dynamic) => sourceRowOf(rowIndex2) === null),
          );
      unmatchedRowsByColumn.set(columnIndex, unmatchedRows);
    }
    return unmatchedRows.has(rowIndex);
  };
  let hasResultChanged = (sheetId?: Dynamic, cell?: Dynamic, position?: Dynamic) => {
    let valuesAfter = resultCellsOfFormula(readsAfter, sheetId, cell);
    if (valuesAfter === null) return false;
    let isInSortedRows =
      sheetId === sorted.sheetId && position.rowIndex >= area.topRowIndex && position.rowIndex < area.topRowIndex + area.rowCount;
    if (!(isInSortedRows && position.columnIndex >= area.leftColumnIndex && position.columnIndex < area.leftColumnIndex + area.columnCount)) {
      let value = readsBefore.cellIdAt(sheetId, position.rowIndex, position.columnIndex);
      let valuesBefore = resultCellsOfFormula(readsBefore, sheetId, value === null ? null : readsBefore.cellOf(value));
      if (valuesBefore === null || areSameCellValues(valuesBefore, valuesAfter)) return false;
      if (!isInSortedRows) return true;
      let valuesAtSourceRow = resultCellsOfFormula(readsBefore, sheetId, cellBeforeSortAt(position));
      return valuesAtSourceRow === null || !areSameCellValues(valuesAtSourceRow, valuesAfter);
    }
    if (sourceRowOf(position.rowIndex) === null) {
      if (!isResultUnmatchedInColumn(position)) return false;
    } else {
      let value = cellBeforeSortAt(position);
      let valuesBefore = resultCellsOfFormula(readsBefore, sheetId, value);
      if (valuesBefore === null) return false;
      if ((value?.spill ?? cell.spill) !== undefined)
        return !areSameCellValues(valuesBefore, valuesAfter) || sourceRowOf(position.rowIndex) !== position.rowIndex;
      if (columnsExpectedToChange?.has(position.columnIndex) === true || areSameCellValues(valuesBefore, valuesAfter)) return false;
    }
    columnsExpectedToChange ??= orderDependentColumns(readsBefore, sheetId, area);
    return !columnsExpectedToChange.has(position.columnIndex);
  };
  return changedFormulaResults(readsBefore, readsAfter, sorted.sheetId, hasResultChanged);
}
export function columnMoveToLookBackOn(event: Dynamic, state: PageState) {
  if (event.kind !== 'editAnswered' || event.outcome.kind !== 'editQueued') return null;
  let { movesColumnsOfTable: moved } = event.ifQueued;
  if (moved === undefined || moved.before === null) return null;
  let { before: before, count: count } = moved;
  return {
    moved: moved,
    count: count,
    before: before,
    atChangeCount: state.workbookChangeCount,
  };
}
export function sortToLookBackOnFromAnswer(event: Dynamic, state: PageState) {
  if (event.kind !== 'editAnswered' || event.outcome.kind !== 'editQueued') return null;
  let { before: actBefore, ifQueued: ifQueued } = event;
  let done = typeof ifQueued.done === 'object' ? ifQueued.done : null;
  if (actBefore?.act.kind !== 'sorted') return null;
  if (done?.what !== 'rowsSorted' && done?.what !== 'cellsSorted') return null;
  let { column: column, direction: direction } = done;
  return {
    sorted: actBefore.act,
    before: actBefore.reads,
    column: column,
    direction: direction,
    atChangeCount: state.workbookChangeCount,
  };
}
export function offerUndoIfEditChangedResults(state?: Dynamic, event?: Dynamic, context?: Dynamic) {
  let settled = settleMoveOfColumnsAnswer(state, event, context.reads);
  return offerUndoIfSortChangedResults(settled, event, context);
}
export function settleMoveOfColumnsAnswer(state: Dynamic, event: Dynamic, reads: ReadsWithTextMeasurer) {
  if (event.kind !== 'editAnswered' || event.ifQueued.movesColumnsOfTable === undefined) return state;
  let answered = {
    ...state,
    moveOfColumnsUnanswered: null,
  };
  if (event.outcome.kind !== 'editQueued')
    return {
      ...answered,
      ...event.ifQueued.movesColumnsOfTable.selectedIfNotMade,
    };
  if (event.ifQueued.isViewLeftAsItIs === true) return answered;
  let scrollToCell = (state2?: Dynamic, cellId?: Dynamic) => {
    let position = reads.positionOfCell(cellId);
    return position === null
      ? state2
      : scrollToShowPosition(
          state2,
          reads,
          position,
          {
            rows: false,
            columns: true,
          },
          'pointer',
        );
  };
  return scrollToCell(scrollToCell(answered, answered.selectionCorner), answered.activeCell);
}
export function offerUndoIfSortChangedResults(state: PageState, event?: Dynamic, context?: Dynamic) {
  let { reads: reads } = context;
  let sortToLookBackOn = sortToLookBackOnFromAnswer(event, state) ?? columnMoveToLookBackOn(event, state) ?? state.sortToLookBackOn;
  if (sortToLookBackOn === null) return state;
  if (sortToLookBackOn.atChangeCount !== state.workbookChangeCount || context.refusalOfEveryEdit !== null)
    return {
      ...state,
      sortToLookBackOn: null,
    };
  if (isEntryWorkPending(state, context) || !context.areReadsTheLatest)
    return sortToLookBackOn === state.sortToLookBackOn
      ? state
      : {
          ...state,
          sortToLookBackOn: sortToLookBackOn,
        };
  let tookTooLong = sortToLookBackOn.before.calculationTookTooLong || reads.calculationTookTooLong;
  if ('moved' in sortToLookBackOn) {
    let changedResults = tookTooLong ? null : resultsChangedByColumnMove(sortToLookBackOn.before, reads, sortToLookBackOn.moved);
    return {
      ...state,
      sortToLookBackOn: null,
      ...(changedResults !== null && {
        undoOffer: {
          kind: 'moveOfColumnsChangedResults',
          count: sortToLookBackOn.count,
          results: changedResults,
          isSaved: state.saving === 'allSaved',
        },
      }),
    };
  }
  let { sorted: sorted, before: readsBefore, column: column, direction: direction } = sortToLookBackOn;
  let changedResults = tookTooLong ? null : resultsChangedBySort(readsBefore, reads, sorted);
  return {
    ...state,
    sortToLookBackOn: null,
    ...(changedResults !== null && {
      undoOffer: {
        kind: 'sortChangedResults',
        column: column,
        direction: direction,
        results: changedResults,
        isSaved: state.saving === 'allSaved',
      },
    }),
  };
}
export const isIndexInSpan = (index?: Dynamic, start?: Dynamic, count?: Dynamic) =>
  index !== null && index >= start && index < start + count;
export const isRowFixed = (edge?: Dynamic) => edge?.isRowAbsolute ?? true;
export const isSameColumnEdge = (edge?: Dynamic, otherEdge?: Dynamic) =>
  edge?.c === otherEdge?.c && edge?.isColumnAbsolute === otherEdge?.isColumnAbsolute;
export const ROW_DEPENDENT_FUNCTION_PATTERN = /\b(?:ROW|OFFSET|INDIRECT)\s*\(/i;
export const cellValueKey = (value?: Dynamic) =>
  `${value?.kind} ${value?.kind === 'number' ? value.value.toPrecision(15) : value?.value}`;
export const areSameCellValues = (cells?: Dynamic, otherCells?: Dynamic) =>
  cells.length === otherCells.length &&
  cells.every((cell?: Dynamic, nth?: Dynamic) => {
    let otherCell = otherCells[nth];
    return otherCell !== undefined && isSameCellValue(cell, otherCell);
  });
export const NOW_OR_TODAY_PATTERN = /\b(?:NOW|TODAY)\s*\(/i;
export const comesBeforeInReadingOrder = (first?: Dynamic, second?: Dynamic) =>
  first.rowIndex === second.rowIndex ? first.columnIndex < second.columnIndex : first.rowIndex < second.rowIndex;
export const resultsChangedByColumnMove = (
  readsBefore: Dynamic,
  readsAfter: Dynamic,
  { sheetId: sheetIdMoved, area: area, cameFrom: cameFrom }: Dynamic,
) =>
  changedFormulaResults(readsBefore, readsAfter, sheetIdMoved, (sheetId?: Dynamic, cell?: Dynamic, position?: Dynamic) => {
    let valuesAfter = resultCellsOfFormula(readsAfter, sheetId, cell);
    if (valuesAfter === null) return false;
    let columnBefore =
      (sheetId === sheetIdMoved && isInSpan(position.rowIndex, area.topRowIndex, area.rowCount)
        ? cameFrom[position.columnIndex - area.leftColumnIndex]
        : undefined) ?? position.columnIndex;
    let cellIdBefore = readsBefore.cellIdAt(sheetId, position.rowIndex, columnBefore);
    let valuesBefore = resultCellsOfFormula(readsBefore, sheetId, cellIdBefore === null ? null : readsBefore.cellOf(cellIdBefore));
    return valuesBefore !== null && !areSameCellValues(valuesBefore, valuesAfter);
  });
