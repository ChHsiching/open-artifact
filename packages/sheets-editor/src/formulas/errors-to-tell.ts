import type { Dynamic } from '../dynamic.ts';
import { areaToA1AsStored } from './from-words/where.ts';
import { rootErrorCells } from './fix/cells-to-fix.ts';
import { cellKeyOf, explainCellError } from './error-tells.ts';
import { errorCellsOfSheet, errorsOfferShown } from './fix/errors-offer.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { fixesBarStage, fixesInSelectionStage } from './fix/fixes-on-cells.ts';
import { selectedArea } from '../selection/model.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function errorCellsToExplain(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let cacheOfReads = explainedErrorCellsCache.get(reads) ?? new (Map as Dynamic)();
  explainedErrorCellsCache.set(reads, cacheOfReads);
  let cacheKey = `${sheetId}/${area === null ? '' : areaToA1AsStored(area, null)}`;
  let cached = cacheOfReads.get(cacheKey);
  if (cached !== undefined) return cached;
  let cellsInErrorFirst = new (Set as Dynamic)(
    (rootErrorCells(reads, sheetId) ?? []).map((error?: Dynamic) => cellKeyOf(error.cellId)),
  );
  let errorCells = errorCellsOfSheet(reads, sheetId);
  let errorsInArea = (errorCells ?? []).filter(
    ({ position: position }: Dynamic) => area === null || isPositionInsideArea(area, position),
  );
  errorsInArea.sort((first?: Dynamic, second?: Dynamic) => {
    let [isFirstListed, isSecondListed] = [first, second].map(
      ({ cellId: cellId }: Dynamic) => cellsInErrorFirst.has(cellKeyOf(cellId)),
    );
    if (isFirstListed !== isSecondListed) return isFirstListed === true ? -1 : 1;
    return first.position.rowIndex === second.position.rowIndex
      ? first.position.columnIndex - second.position.columnIndex
      : first.position.rowIndex - second.position.rowIndex;
  });
  let found = {
    cells: errorsInArea.slice(0, MAX_ERROR_CELLS_EXPLAINED).map(({ cellId: cellId }: Dynamic) => cellId),
    leftOut: errorCells === null ? null : Math.max(0, errorsInArea.length - MAX_ERROR_CELLS_EXPLAINED),
  };
  cacheOfReads.set(cacheKey, found);
  return found;
}
export function errorsToTellOfSelection(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic, activeCellId?: Dynamic) {
  let { cells: cells, leftOut: leftOut } = errorCellsToExplain(reads, sheetId, area);
  if (leftOut === null && area.rowCount * area.columnCount > 1) return null;
  let errors = (cells.length === 0 ? [activeCellId] : cells).flatMap((cellId?: Dynamic) => {
    let [reason, position] = [explainCellError(reads, cellId), reads.positionOfCell(cellId)];
    if (reason === null || position === null || reason.code === '#TIMEOUT!') return [];
    return [
      {
        cell: areaToA1AsStored(
          {
            topRowIndex: position.rowIndex,
            leftColumnIndex: position.columnIndex,
            rowCount: 1,
            columnCount: 1,
          },
          ownRowOrderOfSheet(reads, sheetId),
        ),
        reason: reason,
      },
    ];
  });
  return errors.length === 0
    ? null
    : {
        errors: errors,
        leftOut: leftOut ?? 0,
      };
}
export function explainErrorCellsAhead(state: PageState, reads: WorkbookReads) {
  let isSheetErrorsShown = fixesBarStage(state) === null && (errorsOfferShown(state, reads) !== null || state.errorsAtOpening !== null);
  let areaOfSelection = state.menu !== null && fixesInSelectionStage(state) === null ? selectedArea(state, reads) : null;
  let cellIds = [
    ...(isSheetErrorsShown ? errorCellsToExplain(reads, state.sheetId, null).cells : []),
    ...(areaOfSelection === null ? [] : errorCellsToExplain(reads, state.sheetId, areaOfSelection).cells),
  ];
  for (let cellId of cellIds as Dynamic) explainCellError(reads, cellId);
}
export const MAX_ERROR_CELLS_EXPLAINED = 8;
export const explainedErrorCellsCache = new (WeakMap as Dynamic)();
export const isPositionInsideArea = (area: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) =>
  rowIndex >= area.topRowIndex &&
  rowIndex < area.topRowIndex + area.rowCount &&
  columnIndex >= area.leftColumnIndex &&
  columnIndex < area.leftColumnIndex + area.columnCount;
