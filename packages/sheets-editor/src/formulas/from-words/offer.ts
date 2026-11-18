import type { Dynamic } from '../../dynamic.ts';
import { isFormulaWrittenInWords } from '../fix-prompt.ts';
import { cellKeyOf } from '../error-tells.ts';
import { isFormulaText } from '../../chips/dropdown-pane-edits.ts';
import { MAX_FORMULA_FROM_WORDS_TEXT_LENGTH } from '../agent-prompt.ts';
import { activeAnchorCell } from '../../selection/model.ts';
import { formulaReadsAsWords } from '../word-tokens.ts';
import { keepsAgentsFormula } from '../../editor/commit-entry.ts';
import { refreshProposedFormula, cellOfFixNotice, withFixNoticeDown } from '../fix/ask.ts';
import { headedColumnsMatchingWord } from '../column-headings.ts';
import { highlightedReferences } from '../reference-pointing.ts';
import { findFormulaReferences } from '../references.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { layoutOfView } from '../../grid/layout.ts';
import { formulaFromWordsWhereAt } from './where.ts';
import { isLineShown } from '../../model/line-sizes.ts';
import { formulaOfWords, otherFormulaOfWords } from './rules.ts';
import { proposedFormulaResult } from '../proposed-result.ts';
import { isAreaWithin } from '../../selection/several-ranges.ts';
import type { PageState } from '../../state/initial-state.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../../state/controller.ts';
export function rememberOwnWords({ mode: mode }: Dynamic, { state: state, effects: effects }: Dynamic, workbook: WorkbookReads) {
  if (mode.kind !== 'editing' || !isEntryFreshForWords(mode) || mode.holdsWhatWasNotTyped === true) return state;
  for (let effect of effects as Dynamic) {
    if (effect.kind !== 'queueEdit' || effect.edit.kind !== 'enter') continue;
    let { sheetId: sheetId, cell: cell, entry: entry } = effect.edit;
    if (entry.kind !== 'text' || !entry.text.startsWith(mode.text)) continue;
    if (!isFormulaWrittenInWords(workbook, entry.text)) continue;
    let ownWords = new (Map as Dynamic)(state.formulaFromWords.ownWords);
    ownWords.set(
      cellKeyOf({
        sheetId: sheetId,
        rowId: cell.r,
        columnId: cell.c,
      }),
      entry.text,
    );
    return {
      ...state,
      formulaFromWords: {
        ...state.formulaFromWords,
        ownWords: ownWords,
      },
    };
  }
  return state;
}
export function checkAgentWhenEntryStarts(step?: Dynamic) {
  let { mode: mode, formulaFromWords: formulaFromWords } = step.state;
  let withAgent = (agent?: Dynamic) => ({
    ...step.state,
    formulaFromWords: {
      ...formulaFromWords,
      agent: agent,
    },
  });
  if (mode.kind !== 'editing')
    return formulaFromWords.agent === 'unavailable'
      ? {
          ...step,
          state: withAgent('unchecked'),
        }
      : step;
  if (formulaFromWords.agent !== 'unchecked' || !isFormulaText(mode.text)) return step;
  return {
    state: withAgent('checking'),
    effects: [
      ...step.effects,
      {
        kind: 'checkAgentForFormulas',
      },
    ],
  };
}
export function checkAgentForFormulas(step?: Dynamic) {
  let { formulaFromWords: formulaFromWords } = step.state;
  if (formulaFromWords.agent !== 'unchecked') return step;
  return {
    state: {
      ...step.state,
      formulaFromWords: {
        ...formulaFromWords,
        agent: 'checking',
      },
    },
    effects: [
      ...step.effects,
      {
        kind: 'checkAgentForFormulas',
      },
    ],
  };
}
export function shouldOfferFormula(state: PageState, workbook: WorkbookReads) {
  let { mode: mode, formulaFromWords: formulaFromWords } = state;
  if (mode.kind !== 'editing' || formulaFromWords.isWavedOff) return false;
  if (workbook.calculationTookTooLong) return false;
  if (mode.text.length > MAX_FORMULA_FROM_WORDS_TEXT_LENGTH) return false;
  if (mode.text === mode.textAtStart && !canAskAgentForFormula(state)) return false;
  if (isListOpenBelowEntry(state)) return false;
  if (workbook.dropdownOf(activeAnchorCell(state, workbook)) !== null) return false;
  return formulaReadsAsWords(
    mode.text,
    workbook.listSheets().map(({ name: name }: Dynamic) => name),
    workbook.decimalSign,
  );
}
export function updateFormulaOffer(before: Dynamic, step: Dynamic, workbook: ReadsWithTextMeasurer, isOfferShut?: Dynamic) {
  let { state: state, effects: effects } = step;
  let { mode: mode, formulaFromWords: formulaFromWords } = state;
  let { stage: stage, isWavedOff: isWavedOff } = formulaFromWords;
  let effectsStoppingAsk = stage?.kind === 'asked' ? [...effects, ...STOP_ASKING_AGENT_EFFECTS] : effects;
  if (mode.kind !== 'editing' || isOfferShut)
    return stage === null && !isWavedOff && formulaFromWords.notOfferedWhileShut === null
      ? step
      : {
          state: withFormulaFromWordsStage(state, null, {
            isWavedOff: false,
            notOfferedWhileShut: null,
          }),
          effects: effectsStoppingAsk,
        };
  if (stage?.kind === 'proposed' && keepsAgentsFormula(step))
    return {
      ...step,
      state: withFormulaFromWordsStage(state, null),
    };
  let isWorkbookUnchanged = state.workbookChangeCount === before.workbookChangeCount;
  if (
    mode === before.mode &&
    formulaFromWords === before.formulaFromWords &&
    isWorkbookUnchanged &&
    isListOpenBelowEntry(state) === isListOpenBelowEntry(before)
  )
    return step;
  let isStageForThisText =
    stage !== null && stage.kind !== 'offered' && mode.text === (stage.kind === 'proposed' ? stage.formula : stage.words);
  if (isStageForThisText && stage.kind === 'proposed' && !isWorkbookUnchanged)
    return {
      ...step,
      state: refreshProposedFormula(state, workbook, stage),
    };
  if (isStageForThisText) return step;
  if (stage?.kind === 'proposed')
    return {
      ...step,
      state: withFormulaFromWordsStage(state, null),
    };
  if (isWavedOff && mode.text.length <= 1)
    return {
      ...step,
      state: withFormulaFromWordsStage(state, null, {
        isWavedOff: false,
      }),
    };
  let shouldOffer = shouldOfferFormula(state, workbook);
  let isAgentLeftOut = !canAskAgentForFormula(state);
  let isOfferStanding = stage?.kind === 'offered' && !(stage.hasCallFailed && mode !== before.mode);
  if (shouldOffer && isOfferStanding && (stage.isAgentLeftOut === true) !== isAgentLeftOut) {
    let { isAgentLeftOut: wasAgentLeftOut, ...stageWithAgent } = stage;
    return {
      ...step,
      state: withFormulaFromWordsStage(
        state,
        isAgentLeftOut
          ? {
              ...stage,
              isAgentLeftOut: isAgentLeftOut,
            }
          : stageWithAgent,
      ),
    };
  }
  if (!shouldOffer && stage === null && formulaFromWords.notOfferedWhileShut !== null)
    return {
      ...step,
      state: withFormulaFromWordsStage(state, null, {
        notOfferedWhileShut: null,
      }),
    };
  if (shouldOffer ? isOfferStanding : stage === null) return step;
  let stageBefore = before.formulaFromWords.stage;
  let { notOfferedWhileShut: notOfferedWhileShut } = formulaFromWords;
  let notOfferedFields =
    notOfferedWhileShut === null
      ? {}
      : {
          formulaNotOffered: notOfferedWhileShut,
        };
  let isDrawn = isAgentLeftOut || (stageBefore !== null && (stageBefore.kind !== 'offered' || stageBefore.isDrawn));
  return {
    state: withFormulaFromWordsStage(
      state,
      shouldOffer
        ? {
            ...FRESH_FORMULA_OFFER,
            isDrawn: isDrawn,
            ...(isDrawn && {
              hasRested: true,
            }),
            ...(isAgentLeftOut && {
              isAgentLeftOut: isAgentLeftOut,
              ...notOfferedFields,
            }),
          }
        : null,
      {
        notOfferedWhileShut: null,
      },
    ),
    effects: effectsStoppingAsk,
  };
}
export function columnsNamedInWords(state: PageState, workbook: WorkbookReads, words?: Dynamic) {
  let activeCell = activeAnchorCell(state, workbook);
  let cellsNamed = [...words.matchAll(HEADING_WORD_PATTERN)].flatMap(({ 0: word, index: index }: Dynamic) => {
    let isWordFinished = index + word.length < words.length;
    return headedColumnsMatchingWord(word, activeCell, workbook)
      .filter(
        ({ heading: heading }: Dynamic) =>
          (isWordFinished && word.length >= MIN_HEADING_WORD_LENGTH) ||
          heading.toLowerCase().match(HEADING_WORD_PATTERN)?.includes(word.toLowerCase()) === true,
      )
      .map(({ cells: cells }: Dynamic) => cells);
  });
  return [...new (Set as Dynamic)(cellsNamed)];
}
export function withReferencesNamedInWords(before: Dynamic, state: PageState, workbook: WorkbookReads, isForced: Dynamic = false) {
  let { mode: mode, formulaFromWords: formulaFromWords, activeCell: activeCell } = state;
  let stageKind = formulaFromWords.stage?.kind;
  if (mode.kind !== 'editing' || (stageKind !== 'offered' && stageKind !== 'asked')) {
    let typedReferences = state.referencesInEntry.filter(({ isNamedInWords: isNamedInWords }: Dynamic) => isNamedInWords !== true);
    return typedReferences.length === state.referencesInEntry.length
      ? state
      : {
          ...state,
          referencesInEntry: typedReferences,
        };
  }
  if (
    mode === before.mode &&
    stageKind === before.formulaFromWords.stage?.kind &&
    state.workbookChangeCount === before.workbookChangeCount &&
    !isForced
  )
    return state;
  let cellsNamed = columnsNamedInWords(state, workbook, mode.text.slice(1));
  if (cellsNamed.length === 0) return state;
  let typedReferenceCount = highlightedReferences(mode.text, activeCell.sheetId, workbook).length;
  let isQuoteOpen = findFormulaReferences(mode.text, workbook.decimalSign).quoted.some(
    ({ isClosed: isClosed }: Dynamic) => !isClosed,
  );
  let textWithNames = `${mode.text}${isQuoteOpen ? '"' : ''} ${cellsNamed.join(' ')}`;
  let references = highlightedReferences(textWithNames, activeCell.sheetId, workbook);
  return {
    ...state,
    referencesInEntry: [
      ...references.slice(0, typedReferenceCount),
      ...references.slice(typedReferenceCount).map(
        ({ sheetId: sheetId, area: area, pieces: pieces, hue: hue }: Dynamic) =>
          pieces === undefined
            ? {
                sheetId: sheetId,
                area: area,
                hue: hue,
                isNamedInWords: true,
              }
            : {
                sheetId: sheetId,
                area: area,
                pieces: pieces,
                hue: hue,
                isNamedInWords: true,
              },
      ),
    ],
  };
}
export function readFormulaForOffer(before: Dynamic, state: PageState, workbook: ReadsWithTextMeasurer) {
  let { mode: mode, formulaFromWords: formulaFromWords } = state;
  let { stage: stage } = formulaFromWords;
  if (mode.kind !== 'editing' || stage?.kind !== 'offered') return withNoEffects(state);
  let stageBefore = before.formulaFromWords.stage;
  let isWorkbookUnchanged =
    state.workbookChangeCount === before.workbookChangeCount && state.formulasWorkedOutCount === before.formulasWorkedOutCount;
  if (
    mode.text === (before.mode.kind === 'editing' ? before.mode.text : null) &&
    stageBefore?.kind === 'offered' &&
    stageBefore.read === stage.read &&
    stageBefore.formulaNotOffered === stage.formulaNotOffered &&
    state.sheetPointedIn === before.sheetPointedIn &&
    isWorkbookUnchanged
  )
    return withNoEffects(state);
  let activeCell = activeAnchorCell(state, workbook);
  let { rowEdges: rowEdges } = layoutOfView(state, workbook);
  let where = formulaFromWordsWhereAt(
    workbook,
    activeCell,
    (rowIndex?: Dynamic) => isLineShown(rowEdges, rowIndex),
    state.sheetPointedIn === null,
  );
  let formula = where === null ? null : formulaOfWords(mode.text.slice(1), where);
  let otherRead = where === null ? null : otherFormulaOfWords(mode.text.slice(1), where);
  let other = otherRead?.formula ?? null;
  let formulaBefore = stage.toWorkOut?.formula ?? stage.read?.formula ?? stage.formulaNotOffered ?? null;
  let otherBefore = stage.toWorkOut === undefined ? (stage.readOtherwise?.formula ?? stage.otherNotOffered ?? null) : stage.toWorkOut.other;
  if (formula === formulaBefore && other === otherBefore && isWorkbookUnchanged) return withNoEffects(state);
  let isTextChanged = mode.text !== (before.mode.kind === 'editing' ? before.mode.text : null);
  let {
    formulaNotOffered: formulaNotOffered,
    otherNotOffered: otherNotOffered,
    toWorkOut: toWorkOutBefore,
    isLightMovedByPerson: isLightMovedByPerson,
    readOtherwise: readOtherwise,
    ...offered
  } = stage;
  let isLightKept = isLightMovedByPerson === true && !isTextChanged;
  let offeredKeepingLight = isLightKept
    ? {
        ...offered,
        isLightMovedByPerson: isLightMovedByPerson,
      }
    : offered;
  let litIfItGoes = isReadingHighlighted(stage.highlighted) ? (stage.toWorkOut?.litIfItGoes ?? 'write') : stage.highlighted;
  if (formula === null)
    return withNoEffects(
      withFormulaFromWordsStage(state, {
        ...(isReadingHighlighted(stage.highlighted) ? offered : offeredKeepingLight),
        read: null,
        highlighted: litIfItGoes,
      }),
    );
  let leavesLitRow = stageBefore?.kind === 'asked' || stage.toWorkOut?.leavesLitRow === true;
  let isKeptOutOfRow =
    other === otherBefore && (formula === formulaNotOffered || (stage.toWorkOut?.isKeptOutOfRow === true && formula === stage.toWorkOut.formula));
  let isReadToLight =
    !isLightKept && (formula !== formulaReadForOffer(stage) || (isTextChanged && other !== otherBefore)) && !leavesLitRow && !isKeptOutOfRow;
  let isOtherUnchanged = formula === formulaBefore && other !== null && other === otherBefore;
  let isOtherNew = other !== null && !isOtherUnchanged;
  let isRowHeldForOther =
    (isOtherNew && formula !== stage.read?.formula) || (isOtherUnchanged && stage.toWorkOut?.isRowHeldForOther === true);
  let isOtherToLight = isOtherNew && (isReadToLight || (stage.highlighted === 'read' && !isLightKept));
  let isLitIfAlone = isOtherToLight || (other !== null && stage.toWorkOut?.isLitIfAlone === true);
  let wasOtherLit = stage.highlighted === 'readOtherwise' && !isOtherUnchanged;
  let isOtherTheirs = isOtherNew && !isTextChanged && ((wasOtherLit && isLightKept) || stage.toWorkOut?.isOtherTheirs === true);
  let toWorkOut = {
    formula: formula,
    leavesLitRow: leavesLitRow,
    isKeptOutOfRow: isKeptOutOfRow,
    litIfItGoes: litIfItGoes,
    other: other,
    mustOtherStandToo: otherRead?.mustStandToo === true,
    isRowHeldForOther: isRowHeldForOther,
    isLitIfAlone: isLitIfAlone,
    isOtherTheirs: isOtherTheirs,
  };
  let highlighted = wasOtherLit ? litIfItGoes : stage.highlighted;
  return {
    state: withFormulaFromWordsStage(state, {
      ...(wasOtherLit ? offered : offeredKeepingLight),
      ...(isRowHeldForOther && {
        read: null,
      }),
      ...(isOtherUnchanged &&
        readOtherwise !== undefined && {
          readOtherwise: readOtherwise,
        }),
      ...(isOtherUnchanged &&
        otherNotOffered !== undefined && {
          otherNotOffered: otherNotOffered,
        }),
      toWorkOut: toWorkOut,
      highlighted: isOtherToLight ? litIfItGoes : isReadToLight ? 'read' : highlighted,
    }),
    effects: [
      {
        kind: 'workOutFormulaRead',
        formula: formula,
      },
    ],
  };
}
export function takeWorkedOutFormula(state: PageState, workbook: WorkbookReads, formula?: Dynamic) {
  let { stage: stage } = state.formulaFromWords;
  if (stage?.kind !== 'offered' || stage.toWorkOut?.formula !== formula) return state;
  let result = proposedFormulaResult(workbook, activeAnchorCell(state, workbook), formula);
  let read =
    result !== null && typeof result !== 'string' && result.fillsOtherCells !== true
      ? {
          formula: formula,
          value: result,
        }
      : null;
  let {
    other: other,
    mustOtherStandToo: mustOtherStandToo,
    isLitIfAlone: isLitIfAlone,
    isOtherTheirs: isOtherTheirs,
    litIfItGoes: litIfItGoes,
  } = stage.toWorkOut;
  let otherResult = read === null || other === null ? null : proposedFormulaResult(workbook, activeAnchorCell(state, workbook), other);
  let readOtherwise =
    other !== null &&
    otherResult !== null &&
    typeof otherResult !== 'string' &&
    otherResult.fillsOtherCells !== true &&
    otherResult.shown !== read?.value.shown
      ? {
          formula: other,
          value: otherResult,
        }
      : null;
  let readKept = mustOtherStandToo && readOtherwise === null ? null : read;
  let isLitRowGone =
    (readKept === null && stage.highlighted === 'read') || (readOtherwise === null && stage.highlighted === 'readOtherwise');
  let isLightMovedByPerson = stage.isLightMovedByPerson === true;
  let isReadToLight = readKept !== null && readOtherwise === null && isLitIfAlone && !isLightMovedByPerson;
  let isOtherToLight = readOtherwise !== null && isOtherTheirs && !isLightMovedByPerson;
  let isLightToMove = readOtherwise !== null && stage.highlighted === 'read' && !isLightMovedByPerson;
  let highlighted = isLitRowGone || isLightToMove ? litIfItGoes : stage.highlighted;
  let {
    toWorkOut: toWorkOut,
    isLightMovedByPerson: lightMoved,
    readOtherwise: readOtherwiseBefore,
    otherNotOffered: otherNotOffered,
    ...offered
  } = stage;
  return withFormulaFromWordsStage(state, {
    ...offered,
    ...(((isLightMovedByPerson && !isLitRowGone) || isOtherToLight) && {
      isLightMovedByPerson: true,
    }),
    read: readKept,
    ...(readOtherwise !== null && {
      readOtherwise: readOtherwise,
    }),
    highlighted: isOtherToLight ? 'readOtherwise' : isReadToLight ? 'read' : highlighted,
    ...(readKept === null && {
      formulaNotOffered: formula,
    }),
    ...(other !== null &&
      readOtherwise === null && {
        otherNotOffered: other,
      }),
  });
}
export function formulaReadForOffer(stage?: Dynamic) {
  if (stage?.kind !== 'offered') return null;
  return stage.toWorkOut !== undefined && !stage.toWorkOut.isKeptOutOfRow && !stage.toWorkOut.isRowHeldForOther
    ? stage.toWorkOut.formula
    : (stage.read?.formula ?? null);
}
export function formulaOfOfferRow(stage?: Dynamic, highlighted?: Dynamic) {
  if (stage?.kind !== 'offered') return null;
  if (highlighted === 'read') return formulaReadForOffer(stage);
  return highlighted === 'readOtherwise' ? (stage.readOtherwise?.formula ?? null) : null;
}
export function shutEmptyOffer(state: PageState) {
  let { stage: stage } = state.formulaFromWords;
  return isOfferEmptyWithoutAgent(stage) && stage?.kind === 'offered' && stage.toWorkOut === undefined
    ? withFormulaFromWordsStage(state, null, {
        notOfferedWhileShut: stage.formulaNotOffered ?? null,
      })
    : state;
}
export function moveLightOffWrite(state: PageState) {
  let { stage: stage } = state.formulaFromWords;
  return stage?.kind === 'offered' && stage.isAgentLeftOut === true && stage.highlighted === 'write'
    ? withFormulaFromWordsStage(state, {
        ...stage,
        highlighted: 'keepTyping',
      })
    : state;
}
export function withReferencesOfHighlightedFormula(before: Dynamic, state: PageState, workbook: WorkbookReads) {
  let { mode: mode, activeCell: activeCell } = state;
  let [formula, formulaBefore] = [highlightedOfferFormula(state), highlightedOfferFormula(before)];
  if (mode.kind !== 'editing' || (formula === null && formulaBefore === null)) return state;
  if (formula === formulaBefore && mode === before.mode && state.workbookChangeCount === before.workbookChangeCount) return state;
  let typedReferences = isFormulaText(mode.text) ? highlightedReferences(mode.text, activeCell.sheetId, workbook) : [];
  if (formula === null)
    return withReferencesNamedInWords(
      before,
      {
        ...state,
        referencesInEntry: typedReferences,
      },
      workbook,
      true,
    );
  let formulaReferences = highlightedReferences(formula, activeCell.sheetId, workbook);
  let smallestCovering = ({ area: area }: Dynamic) =>
    formulaReferences
      .filter(({ area: formulaArea }: Dynamic) => isAreaWithin(area, formulaArea))
      .reduce(
        (smallest?: Dynamic, reference?: Dynamic) =>
          smallest === undefined || cellCountOfArea(reference.area) < cellCountOfArea(smallest.area) ? reference : smallest,
        undefined,
      );
  let typedKept = typedReferences.flatMap((reference?: Dynamic) => {
    let covering = smallestCovering(reference);
    let { sheetId: sheetId, writtenAt: writtenAt } = reference;
    if (covering === undefined || writtenAt === undefined) return [];
    return [
      {
        sheetId: sheetId,
        area: covering.area,
        hue: covering.hue,
        writtenAt: writtenAt,
      },
    ];
  });
  let namedInWords = formulaReferences
    .filter((reference?: Dynamic) => !typedReferences.some((typed?: Dynamic) => smallestCovering(typed) === reference))
    .map(
      ({ sheetId: sheetId, area: area, hue: hue }: Dynamic) => ({
        sheetId: sheetId,
        area: area,
        hue: hue,
        isNamedInWords: true,
      }),
    );
  return {
    ...state,
    referencesInEntry: [...typedKept, ...namedInWords],
  };
}
export function stepFormulaFromWords(before: Dynamic, step: Dynamic, workbook: ReadsWithTextMeasurer, isOfferShut?: Dynamic) {
  let withOwnWords = {
    ...step,
    state: rememberOwnWords(before, step, workbook),
  };
  let checked = isOfferShut ? withOwnWords : checkAgentWhenEntryStarts(withOwnWords);
  let offerUpdated = updateFormulaOffer(before, checked, workbook, isOfferShut);
  let noticed = cellOfFixNotice(offerUpdated.state) === null ? withFixNoticeDown(offerUpdated.state) : offerUpdated.state;
  let read = readFormulaForOffer(before, noticed, workbook);
  return {
    state: withReferencesOfHighlightedFormula(
      before,
      withReferencesNamedInWords(before, moveLightOffWrite(shutEmptyOffer(read.state)), workbook),
      workbook,
    ),
    effects: [...offerUpdated.effects, ...read.effects],
  };
}
export const isReadingHighlighted = (highlighted?: Dynamic) => highlighted === 'read' || highlighted === 'readOtherwise';
export const FORMULA_FROM_WORDS_START = {
  agent: 'unchecked',
  hasAgentBeenMissed: false,
  askCount: 0,
  isWavedOff: false,
  actsHeld: 0,
  stage: null,
  notOfferedWhileShut: null,
  ownWords: new (Map as Dynamic)(),
  fixThatCameToNothing: null,
};
export const withFormulaFromWordsStage = (state: PageState, stage?: Dynamic, fields: Dynamic = {}) => ({
  ...state,
  formulaFromWords: {
    ...state.formulaFromWords,
    ...fields,
    stage: stage,
  },
});
export const FRESH_FORMULA_OFFER = {
  kind: 'offered',
  highlighted: 'write',
  read: null,
  hasCallFailed: false,
  isDrawn: false,
};
export const STOP_ASKING_AGENT_EFFECTS = [
  {
    kind: 'stopAskingAgentForAFormula',
  },
];
export const isEntryFreshForWords = (mode?: Dynamic) =>
  mode.mayHoldTextOfOthers !== true &&
  mode.formulaOfAgent !== 'mayBeHeld' &&
  (mode.isTypedOverCell === true || mode.wasEmptied === true || mode.textAtStart === '') &&
  !mode.text.includes('!');
export const areOwnWordsOfCell = ({ formulaFromWords: { ownWords: ownWords } }: Dynamic, cellId?: Dynamic, text?: Dynamic) =>
  ownWords.get(cellKeyOf(cellId))?.toUpperCase() === text.toUpperCase();
export const isListOpenBelowEntry = (state: PageState) =>
  state.menu !== null ||
  state.peopleList !== null ||
  state.timeList !== null ||
  state.dropdown !== null ||
  state.calendar !== null ||
  state.formulaHelp.list !== null;
export const canAskAgentForFormula = ({ mode: mode, formulaFromWords: formulaFromWords }: Dynamic) =>
  mode.kind === 'editing' && formulaFromWords.agent === 'available' && isEntryFreshForWords(mode);
export const HEADING_WORD_PATTERN = /\p{L}[\p{L}\p{N}]*/gu;
export const MIN_HEADING_WORD_LENGTH = 3;
export const isOfferLitOnItsOwn = (stage?: Dynamic) =>
  stage?.kind === 'offered' &&
  stage.toWorkOut?.isLitIfAlone === true &&
  !stage.toWorkOut.mustOtherStandToo &&
  stage.isLightMovedByPerson !== true &&
  !isReadingHighlighted(stage.highlighted);
export const isOfferEmptyWithoutAgent = (stage?: Dynamic) =>
  stage?.kind === 'offered' && stage.isAgentLeftOut === true && formulaReadForOffer(stage) === null;
export const cellCountOfArea = ({ rowCount: rowCount, columnCount: columnCount }: Dynamic) => rowCount * columnCount;
export const highlightedOfferFormula = ({ formulaFromWords: { stage: stage } }: Dynamic) =>
  stage?.kind === 'offered' && stage.isDrawn ? formulaOfOfferRow(stage, stage.highlighted) : null;
