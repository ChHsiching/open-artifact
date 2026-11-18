import type { ErrorExplained, PageState, ReasonsForErrors } from './initial-state.ts';
import type { EditAnswered, PageContext } from './event-reducer.ts';
import type { PageTransition } from './transitions.ts';
import type { CellId, WorkbookReads } from '../model/workbook.ts';
import { cellExplained, keepIfSameJson } from './explained-under-cell.ts';
import { explainCellError, cellKeyOf } from '../formulas/error-tells.ts';
import { activeAnchorCell, isSameCell, areaOfPosition } from '../selection/model.ts';
import { fixableErrorAt } from '../formulas/fix/ask.ts';
import { isSelectionOneCell } from '../selection/keyboard.ts';
import { checkAgentForFormulas } from '../formulas/from-words/offer.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { unansweredEntryOf } from '../editor/unanswered-entries.ts';
import type { ReadsWithTextMeasurer } from './controller.ts';
export function updateReasonsForErrors(state: PageState, reads: ReadsWithTextMeasurer, doCausesWaitForCalculation: boolean): PageState {
  let reasonsForErrors = state.reasonsForErrors;
  let explained = cellExplained(state, reads);
  let value = keepIfSameJson(explainCellError(reads, activeAnchorCell(state, reads)), reasonsForErrors.ofEntryCell);
  let value2 = keepIfSameJson(explained === null ? null : explainCellError(reads, explained.cellId), reasonsForErrors.ofCellExplained);
  let value3 = explained === null ? null : fixableErrorAt(state, reads, explained.cellId);
  let value4 = value3 === 'yetToBeKnown';
  let value5 = explained === null || value3 === null || value4 ? null : cellKeyOf(explained.cellId);
  let value6 = state.otherRanges.length === 0 && isSelectionOneCell(state, reads);
  let activeAnchorCell2 = activeAnchorCell(state, reads);
  let value7 =
    value === null || !value6
      ? null
      : explained !== null && isSameCell(explained.cellId, activeAnchorCell2)
        ? value3
        : fixableErrorAt(state, reads, activeAnchorCell2);
  let value8 = state.fixesOnCells.stage === null && value7 !== null && value7 !== 'yetToBeKnown';
  let value9 = state.fixesOnCells.stage === null && value7 === 'yetToBeKnown';
  let nextReasons: ReasonsForErrors = {
    ofEntryCell: value,
    ofCellExplained: value2,
    cellToFixInPlace: value5,
    isFixInPlaceYetToBeKnown: value4,
    isEntryCellToFixInPlace: value8,
    isFixAtEntryCellYetToBeKnown: value9,
    doCausesWaitForCalculation: doCausesWaitForCalculation,
  };
  return value === reasonsForErrors.ofEntryCell &&
    value2 === reasonsForErrors.ofCellExplained &&
    value5 === reasonsForErrors.cellToFixInPlace &&
    value4 === reasonsForErrors.isFixInPlaceYetToBeKnown &&
    value8 === reasonsForErrors.isEntryCellToFixInPlace &&
    value9 === reasonsForErrors.isFixAtEntryCellYetToBeKnown &&
    doCausesWaitForCalculation === reasonsForErrors.doCausesWaitForCalculation
    ? state
    : {
        ...state,
        reasonsForErrors: nextReasons,
      };
}
export function canOfferFixAtEntryCell({
  reasonsForErrors: { isEntryCellToFixInPlace: isEntryCellToFixInPlace, isFixAtEntryCellYetToBeKnown: isFixAtEntryCellYetToBeKnown },
  formulaFromWords: { agent: agentOnWords, hasAgentBeenMissed: hasAgentBeenMissed },
}: Pick<PageState, 'reasonsForErrors' | 'formulaFromWords'>): boolean {
  let isEntryCellFine = (agentOnWords === 'checking' || agentOnWords === 'unchecked') && !hasAgentBeenMissed;
  return isFixAtEntryCellYetToBeKnown ? isEntryCellFine || agentOnWords === 'available' : isEntryCellToFixInPlace && isEntryCellFine;
}
export function checkAgentWhenFixCellGone(state: PageState, transition: PageTransition): PageTransition {
  let wasToBeRead = state.errorsFoundAtOpening === 'toBeRead' && transition.state.errorsFoundAtOpening !== 'toBeRead';
  let isToBeRead = state.errorsReadAsOf === null && transition.state.errorsReadAsOf !== null;
  if (wasToBeRead || isToBeRead) return checkAgentForFormulas(transition);
  let [items, items2] = [transition.state.reasonsForErrors, state.reasonsForErrors];
  let value = items.cellToFixInPlace !== null && items.cellToFixInPlace !== items2.cellToFixInPlace;
  let value2 =
    items.isEntryCellToFixInPlace && (!items2.isEntryCellToFixInPlace || !isSameCell(transition.state.activeCell, state.activeCell));
  return value || value2 ? checkAgentForFormulas(transition) : transition;
}
export function entryCameToError(
  { sheetId: sheetId, entriesUnanswered: entriesUnanswered }: Pick<PageState, 'sheetId' | 'entriesUnanswered'>,
  reads: WorkbookReads,
  cellId: CellId,
): EntryCameToError | null {
  let isUnanswered = entriesUnanswered.some((entry) => isSameCell(entry.cellId, cellId));
  let value = cellId.sheetId === sheetId && !isUnanswered ? explainCellError(reads, cellId) : null;
  let position = reads.positionOfCell(cellId);
  return value === null || value.code === '#TIMEOUT!' || position === null
    ? null
    : {
        what: 'entryCameToError',
        cellId: cellId,
        cell: areaToA1AsStored(areaOfPosition(position), ownRowOrderOfSheet(reads, cellId.sheetId)),
        reason: value,
      };
}
export function refreshEntryError(state: PageState, reads: WorkbookReads, lastDone: EntryCameToError): PageState {
  let checked = keepIfSameJson(entryCameToError(state, reads, lastDone.cellId), lastDone);
  return checked === lastDone
    ? state
    : {
        ...state,
        lastDone: checked,
      };
}
export function noteEntryError(
  state: PageState,
  { reads: reads, areFormulasLeft: areFormulasLeft }: Pick<PageContext, 'reads' | 'areFormulasLeft'>,
  { edit: edit, outcome: outcome, ifQueued: ifQueued }: Pick<EditAnswered, 'edit' | 'outcome' | 'ifQueued'>,
): PageState {
  let lastDone = state.lastDone?.what === 'entryCameToError' ? state.lastDone : null;
  if (areFormulasLeft)
    return lastDone === null
      ? state
      : {
          ...state,
          lastDone: null,
        };
  let { entryBeforeLine: entryBeforeLine = edit } = ifQueued;
  let nextState =
    entryBeforeLine.kind === 'enter' &&
    (entryBeforeLine !== edit || outcome.kind === 'editQueued' || outcome.kind === 'nothingToChange') &&
    ifQueued.isSaveOfOpenEntry !== true
      ? entryCameToError(state, reads, unansweredEntryOf(entryBeforeLine).cellId)
      : null;
  if (nextState !== null)
    return {
      ...state,
      lastDone: nextState,
    };
  return lastDone === null ? state : refreshEntryError(state, reads, lastDone);
}
export function refreshEntryErrorOnRead(state: PageState, reads: WorkbookReads, cellIdRead: CellId | null): PageState {
  let lastDone = state.lastDone?.what === 'entryCameToError' ? state.lastDone : null;
  if (lastDone === null) return state;
  return (cellIdRead === null ? lastDone.reason.isTellOnItsWay === true : isSameCell(cellIdRead, lastDone.cellId))
    ? refreshEntryError(state, reads, lastDone)
    : state;
}
export const isFixInPlacePending = ({
  reasonsForErrors: { cellToFixInPlace: cellToFixInPlace, isFixInPlaceYetToBeKnown: isFixInPlaceYetToBeKnown },
  formulaFromWords: { agent: agentOnWords },
}: Pick<PageState, 'reasonsForErrors' | 'formulaFromWords'>): boolean => isFixInPlaceYetToBeKnown || (cellToFixInPlace !== null && agentOnWords === 'checking');
/** What was done last when an entry came to an error: the cell, its address as stored, and why it errs. */
export interface EntryCameToError {
  what: 'entryCameToError';
  cellId: CellId;
  cell: string;
  reason: ErrorExplained;
}
