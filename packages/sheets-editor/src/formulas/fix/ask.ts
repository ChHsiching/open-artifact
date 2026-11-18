import type { Dynamic } from '../../dynamic.ts';
import { cellKeyOf, errorCodeOfCell, explainCellError } from '../error-tells.ts';
import { findFormulaFault } from '../typed-faults.ts';
import { isSameCell, anchorCellOf, areaOfPosition, moveActiveCellTo, activeAnchorCell } from '../../selection/model.ts';
import { layoutOfView } from '../../grid/layout.ts';
import { isLineShown } from '../../model/line-sizes.ts';
import {
  isFormulaShortEnoughToFix,
  isFormulaBeforeFixable,
  isFormulaWrittenInWords,
  fixRequestData,
  fixFormulaPrompt,
  fixDataTellsLabelOrHeading,
} from '../fix-prompt.ts';
import { usesFunctionAgentMayNotWrite } from '../agent-answer-checks.ts';
import {
  ADDRESS_LIKE_PATTERN,
  withFixThatCameToNothing,
  withEntryFormulaText,
  checkFormulaResult,
  fillsOtherCells,
  endFixThatCameToNothing,
} from '../from-words/ask-agent.ts';
import { formulaInPointNotation } from '../point-notation.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { areOwnWordsOfCell, withFormulaFromWordsStage, FRESH_FORMULA_OFFER } from '../from-words/offer.ts';
import { describeSheetForAgent, typedCellData, formulaFromWordsPrompt } from '../agent-prompt.ts';
import { lineRunsOfSheet } from '../../format/conditional/ask-agent.ts';
import { areaToA1AsStored } from '../from-words/where.ts';
import { isPromptDataTooLong } from '../../agent/prompt-text.ts';
import { mayNameARange, readsCellsHangingOnVolatiles, countCellsRead } from './answer-checks.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { startEntryEditing } from '../../editor/start-entry.ts';
import { withoutOtherRanges } from '../../selection/several-ranges.ts';
import { syncReferencesInEntry } from '../reference-pointing.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../../state/controller.ts';
export function fewestCellsToReadAt(state: PageState, cellId?: Dynamic, decimalSign?: Dynamic) {
  let [formulasLostToLastAct, formulaLost] = [state.formulasLostToLastAct, formulaLostToLastAct(state, cellId)];
  return formulasLostToLastAct === null || formulaLost === undefined ? 0 : fewestCellsAfterAct(formulasLostToLastAct.act, formulaLost, decimalSign);
}
export function formulaBeforeSortOrMove(state: PageState, cellId?: Dynamic) {
  let act = state.formulasLostToLastAct?.act;
  return act === 'sort' || act === 'move' ? (formulaLostToLastAct(state, cellId)?.text ?? null) : null;
}
export function errorOriginOf(workbook: WorkbookReads, cellId?: Dynamic) {
  let originByCell = errorOriginCache.get(workbook) ?? new (Map as Dynamic)();
  errorOriginCache.set(workbook, originByCell);
  let cached = originByCell.get(cellKeyOf(cellId));
  if (cached !== undefined) return cached;
  let cell = workbook.cellOnShowIn(cellId);
  let errorCode = errorCodeOfCell(cell);
  if (cell === null || errorCode === null || !('input' in cell) || cell.formulaText === undefined) return null;
  let isTypedFault =
    errorCode === '#ERROR!' &&
    cell.input.kind === 'formula' &&
    findFormulaFault(cell.formulaText, workbook.listSheets(), cellId.sheetId, workbook.decimalSign, cell.input.formula.references) !== null;
  if (cell.spill?.kind === 'blocked' || isTypedFault) {
    originByCell.set(cellKeyOf(cellId), cellId);
    return cellId;
  }
  let cause = workbook.causeOfError(cellId, `${errorCode} ${cell.formulaText}`);
  if (cause === null) return 'yetToBeKnown';
  let { cause: saidCause, passedOnFrom: passedOnFrom } = cause.said;
  let passedOnCellId =
    passedOnFrom === null
      ? null
      : {
          sheetId: passedOnFrom.sheetId,
          rowId: passedOnFrom.cell.r,
          columnId: passedOnFrom.cell.c,
        };
  let origin = saidCause?.kind === 'showsTheSameError' ? passedOnCellId : cellId;
  if (cause.isLatest) originByCell.set(cellKeyOf(cellId), origin);
  return origin;
}
export function fixableErrorAt(state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic) {
  if (workbook.calculationTookTooLong) return null;
  let origin = errorOriginOf(workbook, cellId);
  if (origin === 'yetToBeKnown') return origin;
  if (origin === null || origin.sheetId !== cellId.sheetId) return null;
  if (!isSameCell(anchorCellOf(workbook, origin), origin)) return null;
  let position = workbook.positionOfCell(origin);
  let { rowEdges: rowEdges, columnEdges: columnEdges } = layoutOfView(state, workbook);
  if (position === null) return null;
  if (!isLineShown(rowEdges, position.rowIndex) || !isLineShown(columnEdges, position.columnIndex)) return null;
  let cell = workbook.cellOf(origin);
  if (cell?.input.kind !== 'formula' || !isFormulaShortEnoughToFix(cell.formulaText)) return null;
  if (usesFunctionAgentMayNotWrite(cell.formulaText, workbook.decimalSign) || ADDRESS_LIKE_PATTERN.test(cell.formulaText)) return null;
  if (cell.input.formula.references.some(({ sheetId: sheetId }: Dynamic) => sheetId !== origin.sheetId)) return null;
  let fixThatCameToNothing = state.formulaFromWords.fixThatCameToNothing;
  if (
    fixThatCameToNothing !== null &&
    !fixThatCameToNothing.mayGoBetterAgain &&
    isSameCell(fixThatCameToNothing.cellId, origin) &&
    fixThatCameToNothing.atChangeCount === state.workbookChangeCount
  )
    return null;
  let formulasLostToLastAct = state.formulasLostToLastAct;
  let formulaBefore =
    formulasLostToLastAct !== null && formulasLostToLastAct.atChangeCount === state.workbookChangeCount
      ? (formulasLostToLastAct.byCell.get(cellKeyOf(origin)) ?? null)
      : null;
  if (formulaBefore !== null && !isFormulaBeforeFixable(formulaBefore, workbook)) return null;
  if (formulaInPointNotation(cell, workbook.decimalSign, workbook.formulaAsTyped) === null) return null;
  let explained = explainCellError(workbook, origin);
  if (explained?.isTellOnItsWay === true) return 'yetToBeKnown';
  if (isFormulaWrittenInWords(workbook, cell.formulaText))
    return {
      origin: origin,
      formulaBefore: formulaBefore,
    };
  let cause = explained?.tell?.cause;
  if (cause === undefined) return null;
  return formulaBefore !== null || FIXABLE_ERROR_CAUSES.has(cause)
    ? {
        origin: origin,
        formulaBefore: formulaBefore,
      }
    : null;
}
export function cellOfFixNotice({
  formulaFromWords: { fixThatCameToNothing: fixThatCameToNothing },
  workbookChangeCount: workbookChangeCount,
  sheetId: sheetId,
}: Dynamic) {
  return fixThatCameToNothing !== null &&
    fixThatCameToNothing.isNoticeUp &&
    fixThatCameToNothing.atChangeCount === workbookChangeCount &&
    fixThatCameToNothing.cellId.sheetId === sheetId
    ? fixThatCameToNothing.cellId
    : null;
}
export function withFixNoticeDown(state: PageState) {
  let { fixThatCameToNothing: fixThatCameToNothing } = state.formulaFromWords;
  return fixThatCameToNothing === null || !fixThatCameToNothing.isNoticeUp
    ? state
    : {
        ...state,
        formulaFromWords: {
          ...state.formulaFromWords,
          fixThatCameToNothing: {
            ...fixThatCameToNothing,
            isNoticeUp: false,
          },
        },
      };
}
export function ownWordsAskFor(state?: Dynamic, workbookSeen?: Dynamic, cellId?: Dynamic) {
  let workbook = readsAsStored(workbookSeen);
  let { sheetId: sheetId } = cellId;
  let position = workbook.positionOfCell(cellId);
  let typed = workbook.cellOf(cellId)?.formulaText;
  if (position === null || typed === undefined || !isFormulaWrittenInWords(workbook, typed)) return null;
  if (!areOwnWordsOfCell(state, cellId, typed)) return null;
  let words = typed.slice(1).trim();
  let sheetDescription = describeSheetForAgent(workbook, sheetId, position, typedCellData(words), true);
  let linesAsTold = lineRunsOfSheet(workbook, sheetId);
  if (sheetDescription === null || linesAsTold === null) return 'cantBeDescribed';
  let cellAddress = areaToA1AsStored(areaOfPosition(position), null);
  let asked = formulaFromWordsPrompt(words, cellAddress, sheetDescription, workbook.decimalSign, true);
  if (isPromptDataTooLong(asked)) return 'tooMuchToSend';
  return {
    asked: asked,
    broken: typed,
    linesAsTold: linesAsTold,
    fewestCellsToRead: 0,
    formulaBeforeASortOrMove: null,
    cameToBeforeASort: null,
    callsForNoNewCell: false,
    isLabelOrHeadingTold: false,
    areOwnWords: true,
  };
}
export function fixAskFor(
  state: PageState,
  workbookSeen: Dynamic,
  { origin: origin, formulaBefore: formulaBefore }: Dynamic,
  otherCell: Dynamic = null,
  mayHaveOthers: Dynamic = false,
) {
  let workbook = readsAsStored(workbookSeen);
  let explained = explainCellError(workbook, origin);
  let position = workbook.positionOfCell(origin);
  let broken = workbook.cellOf(origin)?.formulaText;
  if (explained === null || position === null || broken === undefined) return null;
  let formulasLostToLastAct = state.formulasLostToLastAct;
  let requestData = fixRequestData(workbook, {
    cellId: origin,
    error: explained.code,
    tell: explained.tell,
    lastAct:
      formulaBefore === null || formulasLostToLastAct === null
        ? null
        : {
            act: formulasLostToLastAct.act,
            cells: formulasLostToLastAct.cells,
          },
    formulaBefore: formulaBefore,
  });
  let sheetDescription = requestData === null ? null : describeSheetForAgent(workbook, origin.sheetId, position, requestData);
  let linesAsTold = lineRunsOfSheet(workbook, origin.sheetId);
  if (requestData === null || sheetDescription === null || linesAsTold === null) return 'cantBeDescribed';
  let otherPosition = otherCell === null ? null : workbook.positionOfCell(otherCell);
  let isWrittenInWords = isFormulaWrittenInWords(workbook, broken);
  let secondReading =
    mayHaveOthers && !isWrittenInWords
      ? (() => {
          if (formulaBefore !== null) return formulasLostToLastAct?.areColumnsDeleted === true ? 'cellsDeleted' : null;
          return explained.tell?.cause === 'noSuchFunction' ? 'nameNotKnown' : null;
        })()
      : null;
  let asked = fixFormulaPrompt(
    areaToA1AsStored(areaOfPosition(position), null),
    explained.code,
    requestData,
    sheetDescription,
    workbook.decimalSign,
    otherPosition === null ? null : areaToA1AsStored(areaOfPosition(otherPosition), null),
    isWrittenInWords
      ? {
          typed: broken,
          mayNameARange: mayNameARange(workbook, origin, broken),
        }
      : null,
    secondReading,
  );
  let fewestCellsToRead = fewestCellsToReadAt(state, origin, workbook.decimalSign);
  let formulaBeforeASortOrMove = formulaBeforeSortOrMove(state, origin);
  return isPromptDataTooLong(asked)
    ? 'tooMuchToSend'
    : {
        asked: asked,
        broken: broken,
        linesAsTold: linesAsTold,
        fewestCellsToRead: fewestCellsToRead,
        formulaBeforeASortOrMove: formulaBeforeASortOrMove,
        cameToBeforeASort: cameToBeforeASortAt(state, origin),
        callsForNoNewCell: !isWrittenInWords && explained.tell !== null && CAUSES_CALLING_FOR_NO_NEW_CELL.has(explained.tell.cause),
        isLabelOrHeadingTold: fixDataTellsLabelOrHeading(requestData),
        ...(secondReading !== null && {
          othersMayFit: secondReading,
        }),
      };
}
export function askAgentToFixFormula(state: PageState, workbook: ReadsWithTextMeasurer, cellId?: Dynamic) {
  if (state.mode.kind === 'editing') return withNoEffects(state);
  let fixable = fixableErrorAt(state, workbook, cellId);
  let fixAsk =
    fixable === null || fixable === 'yetToBeKnown'
      ? null
      : (ownWordsAskFor(state, workbook, fixable.origin) ?? fixAskFor(state, workbook, fixable, null, true));
  if (fixable === null || fixable === 'yetToBeKnown' || fixAsk === null) return withNoEffects(state);
  if (typeof fixAsk === 'string') return withNoEffects(withFixThatCameToNothing(state, fixable.origin, 'tooLarge', fixAsk === 'cantBeDescribed'));
  let {
    asked: asked,
    broken: broken,
    linesAsTold: linesAsTold,
    fewestCellsToRead: fewestCellsToRead,
    formulaBeforeASortOrMove: formulaBeforeASortOrMove,
  } = fixAsk;
  let {
    cameToBeforeASort: cameToBeforeASort,
    callsForNoNewCell: callsForNoNewCell,
    isLabelOrHeadingTold: isLabelOrHeadingTold,
    areOwnWords: areOwnWords,
  } = fixAsk;
  let { othersMayFit: othersMayFit } = fixAsk;
  let editing = startEntryEditing(withoutOtherRanges(moveActiveCellTo(state, workbook, fixable.origin)), workbook, broken, 'cell');
  if (editing.mode.kind !== 'editing') return withNoEffects(state);
  let askId = state.formulaFromWords.askCount + 1;
  return {
    state: withFormulaFromWordsStage(
      withEntryFormulaText(withFixNoticeDown(editing), workbook, broken),
      {
        kind: 'asked',
        askId: askId,
        words: broken,
        linesAsTold: linesAsTold,
        isFix: true,
        fewestCellsToRead: fewestCellsToRead,
        ...(formulaBeforeASortOrMove !== null && {
          formulaBeforeASortOrMove: formulaBeforeASortOrMove,
        }),
        ...(cameToBeforeASort !== null && {
          cameToBeforeASort: cameToBeforeASort,
        }),
        ...(callsForNoNewCell && {
          callsForNoNewCell: callsForNoNewCell,
        }),
        ...(isLabelOrHeadingTold && {
          isLabelOrHeadingTold: isLabelOrHeadingTold,
        }),
        ...(areOwnWords === true && {
          areOwnWords: areOwnWords,
        }),
        ...(othersMayFit !== undefined && {
          othersMayFit: othersMayFit,
        }),
      },
      {
        askCount: askId,
      },
    ),
    effects: [
      {
        kind: 'askAgentForAFormula',
        askId: askId,
        asked: asked,
      },
    ],
  };
}
export function refreshProposedFormula(state: PageState, workbook: ReadsWithTextMeasurer, proposed?: Dynamic) {
  let activeCell = activeAnchorCell(state, workbook);
  let isFixOfOthers = proposed.isFix === true && proposed.areOwnWords !== true;
  let resultOf = (formula: Dynamic) =>
    isFixOfOthers && readsCellsHangingOnVolatiles(workbook, activeCell, formula, proposed.words)
      ? 'noFormula'
      : checkFormulaResult(workbook, activeCell, formula);
  if (proposed.fixes !== undefined) {
    let results = proposed.fixes.map(({ formula: formula }: Dynamic) => resultOf(formula));
    let fixes = proposed.fixes.flatMap((fix: Dynamic, index: Dynamic) => {
      let result = results[index] ?? 'noFormula';
      if (result === 'error')
        return [
          {
            ...fix,
            value: EMPTY_FORMULA_VALUE,
          },
        ];
      return typeof result === 'string' || (isFixOfOthers && fillsOtherCells(result))
        ? []
        : [
            {
              ...fix,
              value: result,
            },
          ];
    });
    let picked = fixes.find(({ formula: formula }: Dynamic) => formula === proposed.formula);
    if (picked === undefined || results.includes('makesAnAddress')) return endFixThatCameToNothing(state, workbook, 'other');
    let { fixes: _fixesBefore, ...rest } = proposed;
    return withFormulaFromWordsStage(state, {
      ...rest,
      value: picked.value,
      ...(fixes.length > 1 && {
        fixes: fixes,
      }),
    });
  }
  let result = resultOf(proposed.formula);
  if (result === 'error')
    return withFormulaFromWordsStage(state, {
      ...proposed,
      value: EMPTY_FORMULA_VALUE,
    });
  if (proposed.isFix === true && (typeof result === 'string' || (isFixOfOthers && fillsOtherCells(result))))
    return endFixThatCameToNothing(state, workbook, 'other');
  if (typeof result !== 'string')
    return withFormulaFromWordsStage(state, {
      ...proposed,
      value: result,
    });
  let { words: words } = proposed;
  let backToWords = syncReferencesInEntry(state, withEntryFormulaText(state, workbook, words, 'wasHeld'), workbook);
  if (result === 'noFormula') return withFormulaFromWordsStage(backToWords, FRESH_FORMULA_OFFER);
  return withFormulaFromWordsStage(backToWords, {
    kind: 'cameToNothing',
    words: words,
    why: result,
  });
}
export const fewestCellsAfterAct = (act?: Dynamic, formulaLost?: Dynamic, decimalSign?: Dynamic) =>
  act === 'delete' ? 0 : (countCellsRead(formulaLost.text, decimalSign) ?? 0);
export const formulaLostToLastAct = (
  { formulasLostToLastAct: formulasLostToLastAct, workbookChangeCount: workbookChangeCount }: Dynamic,
  cellId?: Dynamic,
) =>
  formulasLostToLastAct !== null && formulasLostToLastAct.atChangeCount === workbookChangeCount
    ? formulasLostToLastAct.byCell.get(cellKeyOf(cellId))
    : undefined;
export const cameToBeforeASortAt = (state: PageState, cellId?: Dynamic) =>
  state.formulasLostToLastAct?.act === 'sort' ? (formulaLostToLastAct(state, cellId)?.cameTo ?? null) : null;
export const FIXABLE_ERROR_CAUSES = new (Set as Dynamic)([
  'noSuchFunction',
  'functionWithoutParentheses',
  'missingArgument',
  'tooManyArguments',
  'incompletePair',
  'quotationMarkNotClosed',
  'parenthesisNotClosed',
  'tooManyClosingParentheses',
  'wrongSignBetweenArguments',
  'somethingMissingAtTheEnd',
]);
export const CAUSES_CALLING_FOR_NO_NEW_CELL = new (Set as Dynamic)([
  'noSuchFunction',
  'parenthesisNotClosed',
  'tooManyClosingParentheses',
  'wrongSignBetweenArguments',
  'somethingMissingAtTheEnd',
]);
export const errorOriginCache = new (WeakMap as Dynamic)();
export const EMPTY_FORMULA_VALUE = {
  shown: '',
  text: null,
};
