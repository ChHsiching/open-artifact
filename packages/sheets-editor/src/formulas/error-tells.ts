import type { Dynamic } from '../dynamic.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { resolvePlaceArea } from '../agent/changes-by-agent.ts';
import { spanOfIndexes } from '../model/a1-references.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import { sheetPrefixForFormula } from './references.ts';
import { readsAsStored } from '../model/workbook.ts';
import { findFormulaFault } from './typed-faults.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function errorCodeOfCell(cell?: Dynamic) {
  let value = cellValueOf(cell);
  return value?.kind === 'error' ? value.value : null;
}
export function showsRealError(cell?: Dynamic) {
  let errorCode = errorCodeOfCell(cell);
  return errorCode !== null && errorCode !== '#TIMEOUT!';
}
export function explainFilledCellsInTheWay(reads: WorkbookReads, formulaCell?: Dynamic, bottomRight?: Dynamic) {
  let { sheetId: sheetId } = formulaCell;
  let cells = {
    topLeft: {
      r: formulaCell.rowId,
      c: formulaCell.columnId,
    },
    bottomRight: bottomRight,
  };
  let spillArea =
    resolvePlaceArea(
      {
        sheetId: sheetId,
        cells: cells,
      },
      reads,
    )?.area ?? null;
  let inTheWay = (spillArea === null ? [] : reads.filledCellsIn(sheetId, spillArea))
    .filter(({ rowId: rowId, columnId: columnId }: Dynamic) => rowId !== formulaCell.rowId || columnId !== formulaCell.columnId)
    .flatMap((input?: Dynamic) => reads.positionOfCell(input) ?? []);
  if (inTheWay.length < 2) return null;
  let rowSpan = spanOfIndexes(inTheWay.map(({ rowIndex: rowIndex }: Dynamic) => rowIndex));
  let columnSpan = spanOfIndexes(inTheWay.map(({ columnIndex: columnIndex }: Dynamic) => columnIndex));
  let [topRow, leftColumn] = [rowSpan.firstIndex, columnSpan.firstIndex];
  if (topRow === spillArea?.topRowIndex && leftColumn === spillArea.leftColumnIndex) {
    if (inTheWay.length > MAX_FEW_CELLS_IN_THE_WAY)
      return {
        cause: 'manyFilledCellsOnTwoSidesInTheWay',
        count: inTheWay.length,
      };
    inTheWay.sort(
      (input?: Dynamic, options?: Dynamic) =>
        input.rowIndex === options.rowIndex ? input.columnIndex - options.columnIndex : input.rowIndex - options.rowIndex,
    );
    return {
      cause: 'fewFilledCellsOnTwoSidesInTheWay',
      cells: inTheWay.map(addressOfPosition),
    };
  }
  return {
    cause: 'filledCellsInTheWay',
    count: inTheWay.length,
    cells: areaToA1AsStored(
      {
        topRowIndex: topRow,
        leftColumnIndex: leftColumn,
        rowCount: rowSpan.count,
        columnCount: columnSpan.count,
      },
      null,
    ),
  };
}
export function explainBlockedSpill(reads: WorkbookReads, formulaCell: Dynamic, { by: by, wouldFillTo: wouldFillTo }: Dynamic) {
  let { sheetId: sheetId } = formulaCell;
  if (by.kind === 'endOfSheet')
    return {
      cause: 'sheetEndsTooSoon',
    };
  let position = reads.positionOfCell({
    sheetId: sheetId,
    rowId: by.cell.r,
    columnId: by.cell.c,
  });
  if (position === null) return null;
  let address = addressOfPosition(position);
  switch (by.kind) {
    case 'filledCell':
      return (
        explainFilledCellsInTheWay(reads, formulaCell, wouldFillTo) ?? {
          cause: 'filledCellInTheWay',
          cell: address,
        }
      );
    case 'earlierFormula':
      return {
        cause: 'earlierFormulaKeepsTheCells',
        cell: address,
      };
  }
}
export function cellWrittenFor(reads: WorkbookReads, formulaCell: Dynamic, { sheetId: sheetId, cell: { r: rowId, c: columnId } }: Dynamic) {
  let cellId = {
    sheetId: sheetId,
    rowId: rowId,
    columnId: columnId,
  };
  let position = reads.positionOfCell(cellId);
  if (position === null) return null;
  let address = addressOfPosition(position);
  if (sheetId === formulaCell.sheetId)
    return {
      cellId: cellId,
      at: position,
      written: address,
    };
  let sheetName = reads.listSheets().find((input?: Dynamic) => input.sheetId === sheetId)?.name;
  if (sheetName === undefined) return null;
  return {
    cellId: cellId,
    at: position,
    written: `${sheetPrefixForFormula(sheetName)}${address}`,
  };
}
export function explainCauseAtCell(reads: WorkbookReads, formulaCell: Dynamic, { kind: kind, cell: cell }: Dynamic) {
  let written = cellWrittenFor(reads, formulaCell, cell);
  if (written === null) return null;
  let { cellId: cellId, at: position, written: address } = written;
  switch (kind) {
    case 'showsTheSameError':
      return {
        cause: 'usesACellWithTheSameError',
        cell: address,
      };
    case 'isBlankAndDividedBy':
      return reads.mergedAreaAt(cellId.sheetId, position) === null
        ? {
            cause: 'dividesByAnEmptyCell',
            cell: address,
          }
        : null;
    case 'isZeroAndDividedBy':
      return {
        cause: 'dividesByAZeroCell',
        cell: address,
      };
    case 'leadsBackToTheFormula':
      return {
        cause: 'refersBackToItself',
        cell: address,
      };
    case 'holdsANestedSubtotal': {
      let shown = reads.cellOnShowIn(cellId);
      if (shown === null || !('input' in shown) || shown.spill?.kind !== 'fills')
        return {
          cause: kind,
          cell: address,
        };
      let { r: toRow, c: toColumn } = shown.spill.to;
      let toPosition = reads.positionOfCell({
        sheetId: cellId.sheetId,
        rowId: toRow,
        columnId: toColumn,
      });
      return toPosition === null
        ? null
        : {
            cause: 'filledByANestedSubtotal',
            cells: `${address}:${addressOfPosition(toPosition)}`,
          };
    }
    case 'holdsTextWhereANumberIsNeeded': {
      let shown = reads.cellOnShowIn(cellId);
      if (shown === null || !('from' in shown))
        return {
          cause: 'textInArithmetic',
          cell: address,
        };
      let toRow = cellWrittenFor(reads, formulaCell, {
        sheetId: cellId.sheetId,
        cell: shown.from,
      });
      return toRow === null
        ? null
        : {
            cause: 'spilledTextInArithmetic',
            cell: address,
            from: toRow.written,
          };
    }
  }
}
export function explainCauseOfError(reads: WorkbookReads, formulaCell?: Dynamic, errorCode?: Dynamic, cause?: Dynamic) {
  switch (cause.kind) {
    case 'showsTheSameError':
    case 'isBlankAndDividedBy':
    case 'isZeroAndDividedBy':
    case 'leadsBackToTheFormula':
    case 'holdsTextWhereANumberIsNeeded':
      return explainCauseAtCell(reads, formulaCell, cause);
    case 'holdsANestedSubtotal': {
      let tell = explainCauseAtCell(reads, formulaCell, cause);
      return tell !== null && isTellShortEnough(tell)
        ? tell
        : {
            cause: 'wrongKindOrSize',
          };
    }
    case 'errorIsWritten':
      return errorCode === '#REF!'
        ? {
            cause: 'cellsAreGone',
          }
        : {
            cause: 'holdsTheError',
          };
    case 'cellsAreGone':
    case 'refersToItself':
    case 'dividesByAWrittenZero':
      return {
        cause: cause.kind,
      };
    case 'noSuchFunction':
    case 'unknownName':
      return {
        cause: cause.kind,
        name: cause.name,
      };
    case 'functionWithoutParentheses':
      return {
        cause: cause.kind,
        name: cause.function,
      };
    case 'noSuchCell':
      return {
        cause: cause.kind,
        address: cause.address,
      };
    case 'argumentIsMissing':
      return {
        cause: 'missingArgument',
        name: cause.function,
        argument: cause.argument,
      };
    case 'pairIsIncomplete':
      return {
        cause: 'incompletePair',
        name: cause.function,
        first: cause.first,
        second: cause.second,
      };
    case 'tooManyArguments':
      return {
        cause: cause.kind,
        name: cause.function,
        most: cause.most,
        given: cause.given,
        isOnlyCount: cause.takesNoFewer,
      };
    case 'severalCellsForOneValue':
      return cause.argument === null
        ? {
            cause: 'wrongKindOrSize',
          }
        : {
            cause: cause.kind,
            name: cause.function,
            argument: cause.argument,
          };
    case 'comesToSeveralCellsThatDoNotSpill':
    case 'operandsOfDifferentSizes':
      return {
        cause: 'wrongKindOrSize',
      };
    case 'lookupFindsNothing':
      return {
        cause: 'lookupFoundNothing',
        name: cause.function,
      };
    case 'filterKeepsNothing':
      return {
        cause: cause.kind,
        name: cause.function,
        argument: cause.argumentToAdd,
        hasSeveralConditions: cause.hasSeveralConditions,
      };
    case 'conditionsDoNotFitTheRange': {
      let { function: tell, range: range, condition: condition, canBeARow: canBeARow } = cause;
      return cause.hasSeveralConditions
        ? {
            cause: 'conditionsOfAnotherSize',
            name: tell,
            range: range,
            canBeARow: canBeARow,
          }
        : {
            cause: 'includeOfAnotherSize',
            name: tell,
            include: condition,
            range: range,
            canBeARow: canBeARow,
          };
    }
    case 'rangesOfDifferentSizes':
      return {
        cause: cause.kind,
        name: cause.function,
      };
    case 'noSuchColumnToSortBy':
      return {
        cause: cause.kind,
        name: cause.function,
        range: cause.range,
        columns: cause.columns,
        column: cause.column,
      };
    case 'sortOrderIsNotRead':
      return {
        cause: 'orderNotRead',
        name: cause.function,
        order: cause.order,
      };
    case 'functionCodeSkipsHiddenRows':
      return {
        cause: cause.kind,
        name: cause.function,
        functionCode: cause.functionCode,
        codeThatCountsHiddenRows: cause.codeThatCountsHiddenRows,
      };
    case 'argumentIsNoReference':
      return {
        cause: cause.kind,
        name: cause.function,
        argument: cause.argument,
      };
  }
}
export function explainErrorPassedOn(reads: WorkbookReads, formulaCell: Dynamic, { cause: cause, passedOnFrom: passedOnFrom }: Dynamic) {
  if (cause?.kind !== 'showsTheSameError' || passedOnFrom === null) return null;
  let [causeCell, fromCell] = [cellWrittenFor(reads, formulaCell, cause.cell), cellWrittenFor(reads, formulaCell, passedOnFrom)];
  if (fromCell === null || fromCell.written === causeCell?.written) return null;
  let tell = {
    cause: 'comesFromACellFurtherBack',
    cell: fromCell.written,
  };
  return isTellShortEnough(tell) ? tell : null;
}
export function explainCellError(readsSeen?: Dynamic, cell?: Dynamic) {
  let reads = readsAsStored(readsSeen);
  let shown = reads.cellOnShowIn(cell);
  let errorCode = errorCodeOfCell(shown);
  if (shown === null || errorCode === null) return null;
  if (errorCode === '#TIMEOUT!') return TIMEOUT_ERROR_TELL;
  let cacheOfReads = ERROR_TELL_CACHE.get(reads) ?? new (Map as Dynamic)();
  ERROR_TELL_CACHE.set(reads, cacheOfReads);
  let cached = cacheOfReads.get(cellKeyOf(cell));
  if (cached !== undefined) return cached;
  let tell: Dynamic = null;
  let isTellStale: Dynamic = false;
  if ('input' in shown && shown.input.kind === 'formula' && shown.formulaText !== undefined) {
    if (shown.spill?.kind === 'blocked') tell = explainBlockedSpill(reads, cell, shown.spill);
    else if (errorCode === '#ERROR!')
      tell = findFormulaFault(shown.formulaText, reads.listSheets(), cell.sheetId, reads.decimalSign, shown.input.formula.references);
    if (tell === null && shown.spill?.kind !== 'blocked') {
      let causeSaid = reads.causeOfError(cell, `${errorCode} ${shown.formulaText}`);
      if (causeSaid === null)
        return {
          code: errorCode,
          tell: null,
          isTellOnItsWay: true,
        };
      isTellStale = !causeSaid.isLatest;
      if (causeSaid.said.cause !== null)
        tell = explainErrorPassedOn(reads, cell, causeSaid.said) ?? explainCauseOfError(reads, cell, errorCode, causeSaid.said.cause);
    }
  }
  let explained = {
    code: errorCode,
    tell: tell !== null && isTellShortEnough(tell) ? tell : null,
  };
  if (!isTellStale) cacheOfReads.set(cellKeyOf(cell), explained);
  return explained;
}
export const MAX_TELL_TEXT_LENGTH = 32;
export const UNTELLABLE_CHAR_PATTERN = /["“”„‟«»＂″‶〝〞〟\p{C}\p{Zl}\p{Zp}]/u;
export const isTellShortEnough = (tell?: Dynamic) =>
  Object.entries(tell).every(
    ([key, value]: Dynamic) =>
      key === 'cause' || typeof value !== 'string' || (value.length <= MAX_TELL_TEXT_LENGTH && !UNTELLABLE_CHAR_PATTERN.test(value)),
  );
export const addressOfPosition = ({ rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  areaToA1AsStored(
    {
      topRowIndex: rowIndex,
      leftColumnIndex: columnIndex,
      rowCount: 1,
      columnCount: 1,
    },
    null,
  );
export const MAX_FEW_CELLS_IN_THE_WAY = 3;
export const cellKeyOf = ({ sheetId: sheetId, rowId: rowId, columnId: columnId }: Dynamic) => `${sheetId}/${rowId}/${columnId}`;
export const ERROR_TELL_CACHE = new (WeakMap as Dynamic)();
export const TIMEOUT_ERROR_TELL = {
  code: '#TIMEOUT!',
  tell: null,
};
