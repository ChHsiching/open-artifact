import type { Dynamic } from '../../dynamic.ts';
import { showsRealError, errorCodeOfCell } from '../error-tells.ts';
import { isSameCell } from '../../selection/model.ts';
import { cellExplained } from '../../state/explained-under-cell.ts';
import { cellOfFixNotice } from './ask.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function errorColumnIdsOfRow(row?: Dynamic) {
  let cached = errorCellsCache.get(row);
  if (cached !== undefined) return cached;
  let columnIds = [...row]
    .filter(([, input]: Dynamic) => showsRealError(input) && errorCodeOfCell(input) !== '#N/A')
    .map(([input]: Dynamic) => input);
  errorCellsCache.set(row, columnIds);
  return columnIds;
}
export function errorCellsAround(reads: WorkbookReads, sheetId?: Dynamic) {
  let count: Dynamic = 0;
  for (let rowCells of reads.cellsHeldByRow(sheetId).values() as Dynamic) count += errorColumnIdsOfRow(rowCells).length;
  if (count > MAX_ERROR_CELLS) return null;
  let around = new (Map as Dynamic)();
  let aroundCount: Dynamic = 0;
  let [items, items2, items3, items4, items5]: Dynamic = [1 / 0, -1, 1 / 0, -1, 1 / 0];
  for (let [rowCells, value] of reads.cellsHeldByRow(sheetId) as Dynamic) {
    let value2 = errorColumnIdsOfRow(value);
    let value3 = value2.length === 0 ? null : reads.rowIndexOf(sheetId, rowCells);
    if (value3 === null) continue;
    let value4: Dynamic = 1 / 0;
    for (let value5 of value2 as Dynamic) {
      let entry: Dynamic = around.get(value5);
      if (entry === undefined) {
        entry = reads.columnIndexOf(sheetId, value5);
        around.set(value5, entry);
      }
      if (entry === null) continue;
      aroundCount += 1;
      if (entry < value4) value4 = entry;
      if (entry > items4) items4 = entry;
    }
    if (value4 === 1 / 0) continue;
    if (value4 < items3) items3 = value4;
    if (value3 > items2) items2 = value3;
    if (value3 < items) [items, items5] = [value3, value4];
  }
  return {
    count: aroundCount,
    around:
      aroundCount === 0
        ? null
        : {
            top: items,
            bottom: items2,
            left: items3,
            right: items4,
            leftInTopRow: items5,
          },
  };
}
export function errorCountInArea(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic,
) {
  let count: Dynamic = 0;
  let countInArea: Dynamic = 0;
  for (let [rowId, rowCells] of reads.cellsHeldByRow(sheetId) as Dynamic) {
    let value = errorColumnIdsOfRow(rowCells);
    count += value.length;
    if (count > MAX_ERROR_CELLS) return null;
    let value2 = value.length === 0 ? null : reads.rowIndexOf(sheetId, rowId);
    if (value2 === null || value2 < topRowIndex || value2 >= topRowIndex + rowCount) continue;
    for (let value3 of value as Dynamic) {
      let value4 = reads.columnIndexOf(sheetId, value3);
      if (value4 !== null && value4 >= leftColumnIndex && value4 < leftColumnIndex + columnCount) countInArea += 1;
    }
  }
  return countInArea;
}
export function errorCellsOfSheet(reads: WorkbookReads, sheetId?: Dynamic) {
  let errorCells: Dynamic = [];
  for (let [rowId, rowCells] of reads.cellsHeldByRow(sheetId) as Dynamic)
    for (let value of errorColumnIdsOfRow(rowCells) as Dynamic) {
      let state = {
        sheetId: sheetId,
        rowId: rowId,
        columnId: value,
      };
      let value2 = reads.positionOfCell(state);
      if (value2 !== null)
        errorCells.push({
          cellId: state,
          position: value2,
        });
      if (errorCells.length > MAX_ERROR_CELLS) return null;
    }
  return errorCells;
}
export function errorsAtOpeningOf(reads: WorkbookReads, sheetId?: Dynamic) {
  let errors = errorCellsAround(reads, sheetId);
  if (errors === null || errors.around === null) return null;
  let { top: around, bottom: bottom, left: left, right: right } = errors.around;
  let [items, items2] = [reads.cellIdAt(sheetId, around, left), reads.cellIdAt(sheetId, bottom, right)];
  return items === null || items2 === null
    ? null
    : {
        count: errors.count,
        first: items,
        last: items2,
      };
}
export function errorsOffer(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic, baseline?: Dynamic, isBlocked?: Dynamic, detail?: Dynamic) {
  let topLeft = reads.cellIdAt(sheetId, area.top, area.left);
  let topRight = reads.cellIdAt(sheetId, area.bottom, area.right);
  let bottomLeft = reads.cellIdAt(sheetId, area.top, area.leftInTopRow);
  if (topLeft === null || topRight === null || bottomLeft === null) return null;
  if (detail && baseline !== null)
    return isSameCell(baseline.first, topLeft) && isSameCell(baseline.last, topRight)
      ? baseline
      : {
          ...baseline,
          first: topLeft,
          last: topRight,
        };
  if (
    !isBlocked &&
    baseline !== null &&
    isSameCell(baseline.firstWithAnError, bottomLeft) &&
    baseline.endOfTable !== null &&
    reads.positionOfCell(baseline.endOfTable) !== null
  )
    return isSameCell(baseline.first, topLeft) && isSameCell(baseline.last, topRight)
      ? baseline
      : {
          ...baseline,
          first: topLeft,
          last: topRight,
        };
  let bottomRight = reads.conditionalFormatSuggestions(bottomLeft, bottomLeft)?.table.records.bottomRight;
  if (bottomRight !== undefined)
    return {
      first: topLeft,
      last: topRight,
      firstWithAnError: bottomLeft,
      endOfTable: {
        sheetId: sheetId,
        rowId: bottomRight.r,
        columnId: bottomRight.c,
      },
    };
  return baseline !== null &&
    baseline.endOfTable !== null &&
    isSameCell(baseline.firstWithAnError, bottomLeft) &&
    reads.positionOfCell(baseline.endOfTable) !== null
    ? {
        ...baseline,
        first: topLeft,
        last: topRight,
      }
    : {
        first: topLeft,
        last: topRight,
        firstWithAnError: bottomLeft,
        endOfTable: null,
      };
}
export function updateErrorsOffered(offered: Dynamic, reads: WorkbookReads, sheetId?: Dynamic, baseline?: Dynamic, isForced: Dynamic = false) {
  let errors = errorCellsAround(reads, sheetId);
  let nextOffered = {
    sheetId: sheetId,
    sentAwayOn: offered?.sentAwayOn ?? [],
    offer: null,
    isInsertOfRowsAwaited: false,
  };
  if (errors === null)
    return {
      ...nextOffered,
      count: 1 / 0,
      countWithValues: 1 / 0,
      baseline: 1 / 0,
    };
  let { count: count, around: around } = errors;
  if (offered === null || offered.sheetId !== sheetId)
    return {
      ...nextOffered,
      count: count,
      countWithValues: count,
      baseline: count,
    };
  let { sentAwayOn: sentAwayOn, isInsertOfRowsAwaited: isInsertOfRowsAwaited } = offered;
  let value = baseline ? Math.min(offered.baseline, offered.countWithValues) : offered.baseline;
  let value2 =
    (count > value || isForced) && around !== null && !isInsertOfRowsAwaited
      ? errorsOffer(reads, sheetId, around, offered.offer, baseline, isForced)
      : null;
  let value3 = reads.calculationTookTooLong ? offered.countWithValues : count;
  return {
    sheetId: sheetId,
    count: count,
    countWithValues: value3,
    baseline: value,
    sentAwayOn: sentAwayOn,
    offer: value2,
    isInsertOfRowsAwaited: isInsertOfRowsAwaited,
  };
}
export function errorsOfferShown(state: PageState, reads: WorkbookReads) {
  let { errorsOffered: errorsOffered, sheetId: sheetId } = state;
  return isErrorsOfferBlocked(state) ||
    errorsOffered?.sheetId !== sheetId ||
    cellExplained(
      {
        ...state,
        isSteppedOutOfCells: false,
      },
      reads,
    ) !== null
    ? null
    : errorsOffered.offer;
}
export function readErrorsAtOpening(state: PageState, reads: WorkbookReads) {
  let isToBeRead = state.errorsFoundAtOpening === 'toBeRead';
  if (isToBeRead ? !areErrorsAtOpeningDue(state) : state.errorsAtOpening === null) return state;
  let errors = errorsAtOpeningOf(reads, state.sheetId);
  if (!isToBeRead)
    return {
      ...state,
      errorsAtOpening: errors,
    };
  let { sheetsWhoseToastIsSpent: sheetsWhoseToastIsSpent, sheetId: sheetId } = state;
  return {
    ...state,
    errorsAtOpening: errors,
    errorsFoundAtOpening: {
      sheetId: sheetId,
      count: errors?.count ?? 0,
    },
    sheetsWhoseToastIsSpent: errors === null ? sheetsWhoseToastIsSpent : [...sheetsWhoseToastIsSpent, sheetId],
  };
}
export function updateErrorsAtOpening(state: PageState, stateBefore?: Dynamic, event?: Dynamic) {
  let { sheetsWhoseToastIsSpent: sheetsWhoseToastIsSpent, sheetId: sheetId } = stateBefore;
  let isToastSpent = sheetsWhoseToastIsSpent.includes(sheetId);
  if (sheetId !== state.sheetId && !isTakeBackMade(event))
    return {
      ...stateBefore,
      errorsAtOpening: null,
      errorsFoundAtOpening: isToastSpent ? null : 'toBeRead',
    };
  if (doesEventSpendErrorsToast(event))
    return {
      ...stateBefore,
      errorsAtOpening: null,
      errorsFoundAtOpening: null,
      sheetsWhoseToastIsSpent: isToastSpent ? sheetsWhoseToastIsSpent : [...sheetsWhoseToastIsSpent, sheetId],
    };
  if (stateBefore.isAgentWorking === state.isAgentWorking) return stateBefore;
  if (!stateBefore.isAgentWorking)
    return isToastSpent
      ? stateBefore
      : {
          ...stateBefore,
          errorsFoundAtOpening: 'toBeRead',
        };
  return stateBefore.errorsAtOpening === null
    ? stateBefore
    : {
        ...stateBefore,
        errorsAtOpening: null,
        errorsFoundAtOpening: 'toBeRead',
        sheetsWhoseToastIsSpent: sheetsWhoseToastIsSpent.filter((sheet?: Dynamic) => sheet !== sheetId),
      };
}
export const errorCellsCache = new (WeakMap as Dynamic)();
export const MAX_ERROR_CELLS = 2000;
export const ASK_AGENT_TO_FIX_LABEL = 'Ask Agent to fix';
export const withoutStaleOffer = (offered?: Dynamic) =>
  offered === null || offered.count > offered.baseline
    ? offered
    : {
        ...offered,
        offer: null,
      };
export const withBaselineRaised = (offered?: Dynamic) => ({
  ...offered,
  baseline: Math.max(offered.count, offered.countWithValues),
  offer: null,
});
export const putAwayErrorsOffer = (state?: Dynamic) => ({
  ...withBaselineRaised(state),
  sentAwayOn: state.sentAwayOn.includes(state.sheetId) ? state.sentAwayOn : [...state.sentAwayOn, state.sheetId],
});
export const resetBaselineOfOffer = (offered?: Dynamic) =>
  offered === null || offered.sentAwayOn.includes(offered.sheetId)
    ? offered
    : {
        ...offered,
        baseline: 0,
      };
export const awaitInsertOfRows = (offered?: Dynamic) =>
  offered.offer === null
    ? {
        ...offered,
        isInsertOfRowsAwaited: true,
      }
    : offered;
export const endAwaitInsertOfRows = (offered?: Dynamic) =>
  offered.isInsertOfRowsAwaited
    ? {
        ...withBaselineRaised(offered),
        isInsertOfRowsAwaited: false,
      }
    : offered;
export const isErrorsOfferBlocked = (state: PageState) =>
  state.mode.kind === 'editing' || state.isAgentWorking || state.doesCommentModePickCells || cellOfFixNotice(state) !== null;
export const areErrorsAtOpeningDue = (state: PageState) => state.errorsFoundAtOpening === 'toBeRead' && !state.isAgentWorking;
export const isTakeBackMade = (event?: Dynamic) =>
  (event.kind === 'takeBackAnswered' && event.outcome.kind === 'made') || (event.kind === 'undoOrRedoAnswered' && event.outcome.kind === 'made');
export const doesEventSpendErrorsToast = (event?: Dynamic) =>
  (event.kind === 'editAnswered' && event.outcome.kind === 'editQueued') ||
  isTakeBackMade(event) ||
  event.kind === 'errorsOfferPutAway' ||
  event.kind === 'fixesInPlaceAsked';
