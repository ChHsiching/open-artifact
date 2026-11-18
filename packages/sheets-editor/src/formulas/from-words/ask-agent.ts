import type { Dynamic } from '../../dynamic.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { canAskAgentForFormula, withFormulaFromWordsStage, FRESH_FORMULA_OFFER } from './offer.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { activeAnchorCell, areaOfPosition } from '../../selection/model.ts';
import { describeSheetForAgent, formulaFromWordsPrompt } from '../agent-prompt.ts';
import { lineRunsOfSheet } from '../../format/conditional/ask-agent.ts';
import { areaToA1AsStored } from './where.ts';
import { proposedFormulaResult } from '../proposed-result.ts';
import { isSafeArrayFormula, acceptFormulaFromAgent } from '../agent-answer-checks.ts';
import { startEntryEditing } from '../../editor/start-entry.ts';
import { cancelEntryIfEditing } from '../../editor/commit-entry.ts';
import { isFixNoBetter, countCellsRead, areasReadOnlyBy } from '../fix/answer-checks.ts';
import { isSameJsonValue } from '../../model/same-json.ts';
import { formulasInAnswer } from '../fix-prompt.ts';
import { findFormulaReferences, resolveFormulaReference } from '../references.ts';
import { tokenizeFormulaText, upperCaseAsciiLetters } from '../tokenizer.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../../state/controller.ts';
export function askAgentForFormula(state: PageState, workbookSeen?: Dynamic) {
  let workbook = readsAsStored(workbookSeen);
  let { mode: mode, formulaFromWords: formulaFromWords } = state;
  if (mode.kind !== 'editing' || !canAskAgentForFormula(state)) return withNoEffects(state);
  let words = mode.text;
  let activeCell = activeAnchorCell(state, workbook);
  let position = workbook.positionOfCell(activeCell);
  let sheetDescription = position === null ? null : describeSheetForAgent(workbook, activeCell.sheetId, position, '', true);
  let linesAsTold = lineRunsOfSheet(workbook, activeCell.sheetId);
  if (position === null || sheetDescription === null || linesAsTold === null)
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        kind: 'cameToNothing',
        words: words,
        why: 'sheetTooLarge',
      }),
    );
  let asked = formulaFromWordsPrompt(
    words.slice(1).trim(),
    areaToA1AsStored(areaOfPosition(position), null),
    sheetDescription,
    workbook.decimalSign,
  );
  let askId = formulaFromWords.askCount + 1;
  return {
    state: withFormulaFromWordsStage(
      state,
      {
        kind: 'asked',
        askId: askId,
        words: words,
        linesAsTold: linesAsTold,
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
export function checkFormulaResult(workbook: WorkbookReads, cellId?: Dynamic, formula?: Dynamic) {
  let result = proposedFormulaResult(workbook, cellId, formula);
  if (result === 'ranOutOfTime' || result === 'error') return result;
  if (result === null) return 'noFormula';
  if (result.fillsOtherCells === true && !isSafeArrayFormula(formula, workbook.decimalSign)) return 'noFormula';
  let shownText = `${result.shown} ${result.text ?? ''}`;
  return ADDRESS_LIKE_PATTERN.test(`${formula} ${shownText} ${shownText.replace(/[\t\n\r]/g, '')}`) ? 'makesAnAddress' : result;
}
export function differsFromResult({ result: result }: Dynamic, cameTo?: Dynamic) {
  if (cameTo === null) return false;
  if (cameTo.kind !== 'number' || result?.kind !== 'number') return cameTo.kind !== result?.kind || cameTo.value !== result.value;
  return Math.abs(cameTo.value - result.value) > numberTolerance(cameTo.value, result.value);
}
export function withEntryFormulaText(state: PageState, workbook: ReadsWithTextMeasurer, text?: Dynamic, formulaOfAgent?: Dynamic) {
  if (state.mode.kind !== 'editing') return state;
  let started = startEntryEditing(state, workbook, text, state.mode.typingIn);
  let caret = {
    text: text,
    start: text.length,
    end: text.length,
  };
  return {
    ...started,
    ...(started.mode.kind === 'editing' &&
      formulaOfAgent !== undefined && {
        mode: {
          ...started.mode,
          formulaOfAgent: formulaOfAgent,
          ...(formulaOfAgent === 'mayBeHeld' &&
            started.mode.textOfOthersHeld
              ?.split(
                `
`,
              )
              .includes(text) !== true && {
              textOfOthersHeld: `${started.mode.textOfOthersHeld ?? ''}
${text}`,
            }),
        },
      }),
    formulaHelp: {
      ...started.formulaHelp,
      caret: caret,
      caretAfterPick: caret,
    },
  };
}
export function takeAgentsFormulaAnswer(state: PageState, workbook: WorkbookReads, askId?: Dynamic, answer?: Dynamic) {
  let taken = proposeFormulaFromAnswer(state, workbook, askId, answer);
  let { stage: stage } = state.formulaFromWords;
  if (!(stage?.kind === 'asked' && stage.askId === askId && stage.isFix === true) || taken.state.formulaFromWords.stage?.kind === 'proposed')
    return taken;
  let stageAfter = taken.state.formulaFromWords.stage;
  let hasCallFailed = stageAfter?.kind === 'offered' && stageAfter.hasCallFailed;
  let isAnsweredWithNothing = answer.kind === 'answered' && !hasCallFailed;
  let whyFailed = answer.kind === 'failed' ? whyCallFailed(answer) : 'other';
  let why = isAnsweredWithNothing ? 'noFormula' : whyFailed;
  return {
    ...taken,
    state: endFixThatCameToNothing(taken.state, workbook, why, hasCallFailed),
  };
}
export function endFixThatCameToNothing(state: PageState, workbook: WorkbookReads, why?: Dynamic, mayGoBetterAgain: Dynamic = false) {
  let activeCell = activeAnchorCell(state, workbook);
  return withFixThatCameToNothing(cancelEntryIfEditing(state, workbook), activeCell, why, mayGoBetterAgain);
}
export function formulaFromAnswer(workbook: WorkbookReads, activeCell?: Dynamic, position?: Dynamic, stage?: Dynamic, answer?: Dynamic) {
  let formula = acceptFormulaFromAgent(answer, workbook, activeCell.sheetId, position);
  if (
    formula === null ||
    (stage.isFix === true &&
      isFixNoBetter(
        workbook,
        activeCell,
        formula,
        stage.words,
        stage.formulaBeforeASortOrMove ?? null,
        stage.callsForNoNewCell === true,
        stage.isLabelOrHeadingTold === true,
        stage.areOwnWords === true,
      ))
  )
    return 'noFormula';
  if ((countCellsRead(formula, workbook.decimalSign) ?? 1 / 0) < (stage.fewestCellsToRead ?? 0)) return 'noFormula';
  let result = checkFormulaResult(workbook, activeCell, formula);
  if (stage.isFix === true && stage.areOwnWords !== true && fillsOtherCells(result)) return 'noFormula';
  if (typeof result === 'string') return result === 'error' ? 'noFormula' : result;
  return differsFromResult(result, stage.cameToBeforeASort ?? null)
    ? 'noFormula'
    : {
        formula: formula,
        value: result,
      };
}
export function isTrulyOtherFix(workbook: WorkbookReads, activeCell?: Dynamic, othersMayFit?: Dynamic, formula?: Dynamic, other?: Dynamic) {
  let { decimalSign: decimalSign } = workbook;
  let [lines, otherLines] = [formulaTokenLines(formula, decimalSign), formulaTokenLines(other, decimalSign)];
  if (lines.includes(otherLines) || otherLines.includes(lines)) return false;
  if (othersMayFit === 'cellsDeleted') return areasReadOnlyBy(workbook, activeCell, formula, [other]).length > 0;
  let [calls, otherCalls] = [functionsCalledIn(formula, decimalSign), functionsCalledIn(other, decimalSign)];
  return calls.some((name?: Dynamic) => !otherCalls.includes(name)) || otherCalls.some((name?: Dynamic) => !calls.includes(name));
}
export function otherFixesOfAnswer(
  others: Dynamic,
  main: Dynamic,
  workbook: WorkbookReads,
  activeCell?: Dynamic,
  position?: Dynamic,
  stage?: Dynamic,
  othersMayFit?: Dynamic,
) {
  if (others.some(({ formula: formula }: Dynamic) => ADDRESS_LIKE_PATTERN.test(formula))) return 'makesAnAddress';
  if (
    others
      .map((answer?: Dynamic) => acceptFormulaFromAgent(answer, workbook, activeCell.sheetId, position))
      .map((formula?: Dynamic) => formula !== null && checkFormulaResult(workbook, activeCell, formula))
      .includes('makesAnAddress')
  )
    return 'makesAnAddress';
  let kept: Dynamic = [];
  for (let answer of others as Dynamic) {
    let fix = formulaFromAnswer(workbook, activeCell, position, stage, answer);
    if (typeof fix === 'string' || quotesSpacedTextNotInWords(fix.formula, stage.words, workbook.decimalSign)) continue;
    if (fix.value.text !== null && main.value.text === null) continue;
    if (
      [main, ...kept].every(
        ({ formula: formula, value: value }: Dynamic) =>
          isTrulyOtherFix(workbook, activeCell, othersMayFit, fix.formula, formula) && !comeToSameValue(fix.value, value),
      )
    )
      kept.push(fix);
  }
  return kept;
}
export function proposeFormulaFromAnswer(state: PageState, workbookSeen?: Dynamic, askId?: Dynamic, answer?: Dynamic) {
  let workbook = readsAsStored(workbookSeen);
  let { stage: stage } = state.formulaFromWords;
  if (stage?.kind !== 'asked' || stage.askId !== askId) return withNoEffects(state);
  let { words: words, linesAsTold: linesAsTold } = stage;
  if (answer.kind === 'notToBeHad')
    return withNoEffects(
      withFormulaFromWordsStage(
        state,
        {
          kind: 'cameToNothing',
          words: words,
          why: 'notAvailable',
        },
        {
          agent: 'notToBeHad',
        },
      ),
    );
  if (answer.kind === 'stopped') return withNoEffects(withFormulaFromWordsStage(state, null));
  let activeCell = activeAnchorCell(state, workbook);
  let position = workbook.positionOfCell(activeCell);
  let areLinesUnchanged = isSameJsonValue(lineRunsOfSheet(workbook, activeCell.sheetId), linesAsTold);
  if (answer.kind === 'failed' || !areLinesUnchanged || position === null)
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        ...FRESH_FORMULA_OFFER,
        hasCallFailed: true,
        isDrawn: true,
        hasRested: true,
      }),
    );
  let othersMayFit = stage.othersMayFit ?? null;
  let otherAnswers = othersMayFit === null ? [] : formulasInAnswer(answer.answer).slice(1);
  if (otherAnswers.length >= TOO_MANY_OTHER_FIXES)
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        kind: 'cameToNothing',
        words: words,
        why: 'noFormula',
      }),
    );
  let main = formulaFromAnswer(workbook, activeCell, position, stage, answer.answer);
  if (typeof main === 'string')
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        kind: 'cameToNothing',
        words: words,
        why: main,
      }),
    );
  let others = othersMayFit === null ? [] : otherFixesOfAnswer(otherAnswers, main, workbook, activeCell, position, stage, othersMayFit);
  if (others === 'makesAnAddress')
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        kind: 'cameToNothing',
        words: words,
        why: others,
      }),
    );
  let fixes = othersMayFit === 'nameNotKnown' ? withWhatSetsFixesApart([main, ...others], workbook.decimalSign) : [main, ...others];
  let { formula: formula, value: result } = main;
  let typedAreaKeys = new (Set as Dynamic)(state.referencesInEntry.map(({ area: area }: Dynamic) => areaToA1AsStored(area, null)));
  let lightsAtPart: Dynamic = {};
  for (let reference of findFormulaReferences(formula, workbook.decimalSign).references as Dynamic) {
    let area = resolveFormulaReference(reference, activeCell.sheetId, workbookSeen.listSheets())?.area;
    let areaKey = area === undefined ? null : areaToA1AsStored(area, null);
    if (areaKey !== null && !typedAreaKeys.has(areaKey)) lightsAtPart[areaKey] ??= reference.start / formula.length;
  }
  return withNoEffects(
    withFormulaFromWordsStage(withEntryFormulaText(state, workbookSeen, formula, 'mayBeHeld'), {
      kind: 'proposed',
      words: words,
      formula: formula,
      isArriving: true,
      isDiscardHighlighted: false,
      lightsAtPart: lightsAtPart,
      value: result,
      ...(stage.isFix === true && {
        isFix: true,
      }),
      ...(stage.areOwnWords === true && {
        areOwnWords: true,
      }),
      ...(others.length > 0 && {
        fixes: fixes,
      }),
    }),
  );
}
export const ADDRESS_LIKE_PATTERN = /:\/\/|\b(?:https?|ftp|wss?):|\bwww\.|\bmailto:|\.[a-z]{2,}[/?]/i;
export const fillsOtherCells = (result?: Dynamic) => typeof result !== 'string' && result.fillsOtherCells === true;
export const numberTolerance = (value?: Dynamic, other?: Dynamic) =>
  0.000000000001 * Math.max(1e6, Math.abs(value), Math.abs(other));
export const whyCallFailed = (failure?: Dynamic) => (failure.isRateLimited === true ? 'rateLimited' : 'callFailed');
export const withFixThatCameToNothing = (state: PageState, cellId?: Dynamic, why?: Dynamic, mayGoBetterAgain: Dynamic = false) => ({
  ...state,
  formulaFromWords: {
    ...state.formulaFromWords,
    stage: null,
    fixThatCameToNothing: {
      cellId: cellId,
      atChangeCount: state.workbookChangeCount,
      isNoticeUp: true,
      mayGoBetterAgain: mayGoBetterAgain,
      why: why,
    },
  },
});
export const TOO_MANY_OTHER_FIXES = 3;
export const functionsCalledIn = (text?: Dynamic, decimalSign?: Dynamic, withNameArgumentOnly: Dynamic = false) => {
  let { tokens: tokens } = tokenizeFormulaText(text, decimalSign);
  let isCallAt = (index?: Dynamic) => tokens[index]?.kind === 'name' && tokens[index + 1]?.kind === 'open';
  let takesNameArgument = (index?: Dynamic) => {
    for (let at: Dynamic = index + 1, depth: Dynamic = 0; at < tokens.length; at += 1) {
      if (tokens[at]?.kind === 'open') depth += 1;
      if (tokens[at]?.kind === 'close' && (depth -= 1) === 0) return false;
      if (tokens[at]?.kind === 'name' && !isCallAt(at)) return true;
    }
    return false;
  };
  return tokens.flatMap(
    ({ text: text2 }: Dynamic, index?: Dynamic) =>
      isCallAt(index) && (!withNameArgumentOnly || takesNameArgument(index)) ? [upperCaseAsciiLetters(text2)] : [],
  );
};
export const withWhatSetsFixesApart = (fixes?: Dynamic, decimalSign?: Dynamic) =>
  fixes.map(({ formula: formula, value: value }: Dynamic) => {
    let others = fixes.filter((other?: Dynamic) => other.formula !== formula);
    let calledByOthers = new (Set as Dynamic)(others.flatMap((other?: Dynamic) => functionsCalledIn(other.formula, decimalSign)));
    let [only, ...more] = [...new (Set as Dynamic)(functionsCalledIn(formula, decimalSign))].filter(
      (name?: Dynamic) => !calledByOthers.has(name),
    );
    return only === undefined || more.length > 0 || !functionsCalledIn(formula, decimalSign, true).includes(only)
      ? {
          formula: formula,
          value: value,
        }
      : {
          formula: formula,
          value: value,
          setApartBy: only,
        };
  });
export const comeToSameValue = (value?: Dynamic, other?: Dynamic) =>
  value.shown === other.shown || (other.result !== undefined && !differsFromResult(value, other.result));
export const formulaTokenLines = (text?: Dynamic, decimalSign?: Dynamic) => `
${tokenizeFormulaText(text, decimalSign).tokens.map(({ text: text2 }: Dynamic) => upperCaseAsciiLetters(text2).replaceAll('$', '')).join(`
`)}
`;
export const quotedTextsOf = (text?: Dynamic, decimalSign?: Dynamic) =>
  tokenizeFormulaText(text, decimalSign).tokens.flatMap(({ kind: kind, text: text2 }: Dynamic) => (kind === 'text' ? [text2] : []));
export const quotesSpacedTextNotInWords = (formula?: Dynamic, words?: Dynamic, decimalSign?: Dynamic) =>
  quotedTextsOf(formula, decimalSign).some((text?: Dynamic) => /\s/.test(text) && !quotedTextsOf(words, decimalSign).includes(text));
export const PLAIN_NUMBER_SHOWN_PATTERN = /^(?:[\p{Nd}\p{Zs}\p{Sc}.,'%()+\-/:]|(?<=\p{Nd})E(?=[+\-\p{Nd}]))*$/u;
export const TWO_CURRENCY_SIGNS_PATTERN = /\p{Sc}.*\p{Sc}/u;
export const UNSHOWABLE_CHARACTER_PATTERN =
  /(?!\u00AD|\u061C|[\u180B-\u180D]|\u180F|[\u200B-\u200F]|[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}])[\u2800\p{C}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu;
export const UNSHOWABLE_CHARACTER_STAND_IN = String.fromCharCode(65533);
export const quoteShownText = (shown?: Dynamic) =>
  `"${shown
    .replaceAll(/[\t\n\r]+/g, ' ')
    .replaceAll(UNSHOWABLE_CHARACTER_PATTERN, UNSHOWABLE_CHARACTER_STAND_IN)
    .replaceAll('"', '""')}"`;
