import type { Dynamic } from '../dynamic.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { layoutOfView, findSheetById } from '../grid/layout.ts';
import { textRoomInWidth } from '../grid/cell-metrics.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { shownCellText } from '../format/shown-text.ts';
import { unansweredEntryOf } from './unanswered-entries.ts';
import { isOptionText } from '../chips/dropdown-options.ts';
import { isEffectAnEdit } from '../state/edit-refusals.ts';
import { activeAnchorCell, isSameCell, areaOfPosition } from '../selection/model.ts';
import { sheetPrefixForFormula } from '../formulas/references.ts';
import { areaToA1AsStored } from '../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../model/line-ids.ts';
import { isOfferEmptyWithoutAgent, formulaReadForOffer } from '../formulas/from-words/offer.ts';
import { formulaReadsAsWords } from '../formulas/word-tokens.ts';
import { keepsAgentsFormula } from './commit-entry.ts';
import { isNonNullObject } from '../utils/objects.ts';
import { canAskAgentForFormat } from '../format/custom-number-format.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
import type { PageState } from '../state/initial-state.ts';
export function doesEntryFitOneLine(state: PageState, reads: ReadsWithTextMeasurer, cellId?: Dynamic, text?: Dynamic) {
  let { alignment: alignment, font: font } = reads.formatOf(cellId);
  if (!alignment.wrap) return true;
  let position = reads.positionOfCell(cellId);
  if (position === null || isFormulaText(text)) return false;
  let value = layoutOfView(state, reads).columnEdges.sizeOf(position.columnIndex);
  let textRoomInWidth2 = textRoomInWidth(value);
  let value2 = reads.cellOnShowIn(cellId);
  let value3 = cellValueOf(value2)?.kind === 'text' ? [shownCellText(value2, 0, 'point').text] : [];
  return reads
    .lineCountsOfWrappedTexts(
      [text, ...value3].map(
        (input?: Dynamic) => ({
          text: input,
          font: font,
          widthInPixels: textRoomInWidth2,
        }),
      ),
    )
    .every((input?: Dynamic) => input === 1);
}
export function canEntryBeAnsweredLater(
  state: PageState,
  { reads: reads, areEditsAnsweredLater: areEditsAnsweredLater }: Dynamic,
  { edit: edit, editsBefore: editsBefore, editsThatGoAlong: editsThatGoAlong, ifQueued: ifQueued }: Dynamic,
) {
  if (!areEditsAnsweredLater || edit.kind !== 'enter') return false;
  let { cellId: cellId, text: text } = unansweredEntryOf(edit);
  let dropdown = reads.dropdownOf(cellId);
  return (
    text.length <= MAX_TEXT_ANSWERED_LATER &&
    (dropdown === null || text === '' || isOptionText(dropdown, text)) &&
    ifQueued.thenLine === undefined &&
    editsBefore === undefined &&
    (editsThatGoAlong === undefined || ifQueued.formatsToCome !== undefined) &&
    doesEntryFitOneLine(state, reads, cellId, text)
  );
}
export function doesEntryEndAtOnce(event: Dynamic, stateBefore: Dynamic, { state: state, effects: effects }: Dynamic, reads: WorkbookReads) {
  if (
    !effects.every(
      (state2?: Dynamic) =>
        state2.kind === 'queueEdit' ? state2.ifQueued.endsEntryAtOnce === true : !isEffectAnEdit(state2) && !EFFECTS_THAT_KEEP_ENTRY.has(state2.kind),
    )
  )
    return false;
  if (state === stateBefore) return true;
  if (state.mode.kind === 'navigating') return stateBefore.mode.kind === 'editing' || isMoveOutEvent(event);
  if (stateBefore.mode.kind === 'editing') return true;
  if (state.mode.isTypedOverCell === true) return true;
  let activeAnchorCell2 = activeAnchorCell(state, reads);
  return !state.entriesUnanswered.some(({ cellId: cellId }: Dynamic) => isSameCell(cellId, activeAnchorCell2));
}
export function noticeEntryNotKept(state: PageState, reads: WorkbookReads, cellId?: Dynamic) {
  let position = reads.positionOfCell(cellId);
  if (position === null)
    return {
      ...state,
      lastDone: null,
      notice: {
        kind: 'entryDroppedByRemoval',
      },
    };
  let value = cellId.sheetId === state.sheetId ? undefined : findSheetById(reads, cellId.sheetId);
  let value2 = value === undefined ? '' : sheetPrefixForFormula(value.name);
  let value3 = state.notice?.kind === 'entriesNotKept' ? state.notice.cells : [];
  let items = [
    ...new (Set as Dynamic)([...value3, value2 + areaToA1AsStored(areaOfPosition(position), ownRowOrderOfSheet(reads, cellId.sheetId))]),
  ];
  let { leftByCaret: leftByCaret } = state;
  let value4 = leftByCaret?.what === 'entry' && isSameCell(leftByCaret.cellId, cellId);
  return {
    ...state,
    lastDone: null,
    leftByCaret: value4 ? null : leftByCaret,
    notice: {
      kind: 'entriesNotKept',
      cells: items,
    },
  };
}
export function answerFirstEntry(state: PageState, reads: WorkbookReads, { outcome: outcome }: Dynamic) {
  let [entriesUnanswered, ...entriesUnanswered2] = state.entriesUnanswered;
  if (entriesUnanswered === undefined) return state;
  let nextState = {
    ...state,
    entriesUnanswered: entriesUnanswered2,
  };
  return outcome.kind === 'refused' ? noticeEntryNotKept(nextState, reads, entriesUnanswered.cellId) : nextState;
}
export function updateEntryEndedUnasked(state: PageState, stateBefore: Dynamic, { kind: kind }: Dynamic) {
  let isLossNew =
    stateBefore.newsOfLoss !== null && stateBefore.newsOfLoss !== state.newsOfLoss && stateBefore.newsOfLoss.kind !== 'editsDropped';
  let isEndedUnasked =
    stateBefore.mode.kind !== 'editing' &&
    (state.mode.kind === 'editing' ? EVENTS_NOT_ASKED_BY_PERSON.has(kind) || isLossNew : stateBefore.isEntryEndedUnasked);
  return isEndedUnasked === stateBefore.isEntryEndedUnasked
    ? stateBefore
    : {
        ...stateBefore,
        isEntryEndedUnasked: isEndedUnasked,
      };
}
export function isAskedByPerson({ event: event, before: before, made: made }: Dynamic) {
  if (event === null || isEventNotAskedByPerson(event.kind)) return false;
  return !(before.mode.kind === 'editing' && made.state.mode.kind !== 'editing' && made.state.isEntryEndedUnasked);
}
export function actOfWordsSaved({ formulaFromWords: { stage: stage, isWavedOff: isWavedOff, agent: agent } }: Dynamic) {
  if (stage?.kind === 'cameToNothing') return 'words_saved_no_formula';
  if (isWavedOff) return 'words_saved_waved_off';
  if (stage?.kind === 'offered' && !isOfferEmptyWithoutAgent(stage)) return 'words_saved_offer_up';
  return agent === 'unavailable' || agent === 'notToBeHad' ? 'words_saved_no_agent' : 'words_saved_no_offer';
}
export function textOfEnterEdit(edit: Dynamic) {
  if (edit.kind === 'enterInCells') return edit.text;
  return edit.kind === 'enter' && edit.entry.kind === 'text' ? edit.entry.text : null;
}
export function actsOfFormulaEntered({ before: before, made: made, reads: reads }: Dynamic) {
  if (before.mode.kind !== 'editing') return [];
  let { stage: stage } = before.formulaFromWords;
  for (let effect of made.effects as Dynamic) {
    if (effect.kind !== 'queueEdit' || effect.ifQueued.isSaveOfOpenEntry === true) continue;
    let { edit: edit, ifQueued: ifQueued } = effect;
    let text = textOfEnterEdit(edit);
    if (text === null || !text.startsWith('=')) continue;
    if (ifQueued.isKeepOfAgentsFix === true)
      return [
        {
          act: 'fix_one_kept',
          onceQueued: edit,
        },
      ];
    if (ifQueued.isKeepOfAgentsFormula === true)
      return [
        {
          act: 'formula_of_agent_kept',
          onceQueued: edit,
        },
      ];
    if (stage?.kind === 'offered' && (text === formulaReadForOffer(stage) || text === stage.readOtherwise?.formula))
      return [
        {
          act: 'formula_of_page_taken',
          onceQueued: edit,
        },
      ];
    let sheetNames = reads.listSheets().map(({ name: name }: Dynamic) => name);
    return formulaReadsAsWords(text, sheetNames, reads.decimalSign)
      ? [
          {
            act: actOfWordsSaved(before),
            onceQueued: edit,
          },
        ]
      : [];
  }
  return [];
}
export function actsOfFormulaAsk(change: Dynamic) {
  let { event: event, before: before, made: made } = change;
  let stageBefore = before.formulaFromWords.stage;
  let { stage: stage } = made.state.formulaFromWords;
  if (stageBefore?.kind !== 'asked' || stageBefore.isFix === true) return [];
  if (event?.kind !== 'agentRepliedWithAFormula')
    return isAskedByPerson(change) && stopsAskingAgentForFormula(made) ? actsByPerson('formula_ask_stopped') : [];
  if (stage?.kind === 'proposed') return actsByPage('formula_of_agent_shown');
  if (stage?.kind === 'offered' && stage.hasCallFailed) return actsByPage('formula_ask_failed');
  if (stage?.kind !== 'cameToNothing') return [];
  return actsByPage(stage.why === 'notAvailable' ? 'formula_ask_failed' : 'formula_ask_no_formula');
}
export function isFormulaOfAgentLeft(change: Dynamic) {
  let { before: before, made: made } = change;
  let stageBefore = before.formulaFromWords.stage;
  let { mode: mode, formulaFromWords: formulaFromWords } = made.state;
  return (
    isAskedByPerson(change) &&
    stageBefore?.kind === 'proposed' &&
    stageBefore.isFix !== true &&
    formulaFromWords.stage?.kind !== 'proposed' &&
    formulaFromWords.stage?.kind !== 'cameToNothing' &&
    !keepsAgentsFormula(made) &&
    (mode.kind !== 'editing' || mode.text === stageBefore.words)
  );
}
export function isAnswerWithoutFormula(answer: Dynamic) {
  let formula = isNonNullObject(answer) ? answer.formula : null;
  return typeof formula !== 'string' || !formula.startsWith('=');
}
export function actsOfFixOne(change: Dynamic) {
  let { event: event, before: before, made: made } = change;
  let stageBefore = before.formulaFromWords.stage;
  let { mode: mode, formulaFromWords: formulaFromWords } = made.state;
  if (stageBefore?.kind === 'asked' && stageBefore.isFix === true) {
    let fixThatCameToNothing = formulaFromWords.fixThatCameToNothing;
    return event?.kind === 'agentRepliedWithAFormula' &&
      event.reply.kind === 'answered' &&
      isAnswerWithoutFormula(event.reply.answer) &&
      fixThatCameToNothing !== before.formulaFromWords.fixThatCameToNothing &&
      fixThatCameToNothing?.why === 'noFormula'
      ? actsByPage('refused_none_written')
      : [];
  }
  if (stageBefore?.kind !== 'proposed' || stageBefore.isFix !== true) return [];
  return isAskedByPerson(change) && mode.kind !== 'editing' && !keepsAgentsFormula(made) ? actsByPerson('fix_one_discarded') : [];
}
export function actsOfFormatAsk(change: Dynamic) {
  let { event: event, before: before, made: made } = change;
  let agentBefore = before.customNumberFormat?.agent ?? null;
  let agent = made.state.customNumberFormat?.agent ?? null;
  if (agentBefore?.kind === 'asked') {
    if (event?.kind !== 'agentRepliedWithANumberFormat')
      return isAskedByPerson(change) && stopsAskingAgentForFormula(made) ? actsByPerson('format_ask_stopped') : [];
    if (agent?.kind === 'wrote') return actsByPage('format_of_agent_shown');
    if (agent?.kind !== 'cameToNothing') return [];
    return actsByPage(agent.why === 'noFormat' ? 'format_ask_no_format' : 'format_ask_failed');
  }
  if (agentBefore?.kind !== 'wrote' || event === null || !isAskedByPerson(change)) return [];
  let formatEdit =
    event.kind === 'customNumberFormatEntered' ? made.effects.find((effect?: Dynamic) => effect.kind === 'queueEdit') : undefined;
  if (formatEdit !== undefined)
    return [
      {
        act: 'format_of_agent_kept',
        onceQueued: formatEdit.edit,
      },
    ];
  return event.kind !== 'editAnswered' && agent?.kind !== 'wrote' && agent?.kind !== 'typedOn' ? actsByPerson('format_of_agent_left') : [];
}
export function createAgentAskActs(whoActs: Dynamic) {
  let wasFormulaOfferShown: Dynamic = false;
  let wasFormatOfferShown: Dynamic = false;
  let actsAwaitingAnswer = new Map();
  let actsOfAnswer = (event?: Dynamic) => {
    if (event?.kind !== 'agentRepliedWithAFormula' && event?.kind !== 'agentRepliedWithANumberFormat') return [];
    let act = actsAwaitingAnswer.get(event.askId);
    actsAwaitingAnswer.delete(event.askId);
    return act === undefined || event.reply.kind === 'notToBeHad' ? [] : [act];
  };
  return (change?: Dynamic) => {
    let { mode: mode, formulaFromWords: formulaFromWords, customNumberFormat: customNumberFormat } = change.made.state;
    let { stage: stage } = formulaFromWords;
    let isFormulaOfferShown = mode.kind === 'editing' && stage?.kind === 'offered' && stage.isDrawn && !isOfferEmptyWithoutAgent(stage);
    let isFormatOfferShown = customNumberFormat?.isRefusalTold === false && canAskAgentForFormat(change.made.state);
    let offersShown = [
      ...(isFormulaOfferShown && !wasFormulaOfferShown ? actsByPage('formula_offer_shown') : []),
      ...(isFormatOfferShown && !wasFormatOfferShown ? actsByPage('format_offer_shown') : []),
    ];
    wasFormulaOfferShown = mode.kind === 'editing' && (wasFormulaOfferShown || isFormulaOfferShown);
    wasFormatOfferShown = customNumberFormat !== null && (wasFormatOfferShown || isFormatOfferShown);
    let acts = [
      ...offersShown,
      ...actsOfAgentAsked(change),
      ...actsOfFormulaAsk(change),
      ...(isFormulaOfAgentLeft(change) ? actsByPerson('formula_of_agent_left') : []),
      ...actsOfFormulaEntered(change),
      ...actsOfFixOne(change),
      ...actsOfFormatAsk(change),
    ];
    return [
      ...actsOfAnswer(change.event),
      ...acts.flatMap((act?: Dynamic) => {
        if ('onceQueued' in act) return [act];
        let from = 'by' in act && act.by === 'page' ? 'page' : whoActs();
        if ('by' in act)
          return [
            {
              act: act.act,
              from: from,
            },
          ];
        actsAwaitingAnswer.set(act.onceAnswered, {
          act: act.act,
          from: from,
        });
        return [];
      }),
    ];
  };
}
export const MAX_TEXT_ANSWERED_LATER = 250;
export const ARROW_OR_TAB_KEY = /^(?:Arrow(?:Up|Down|Left|Right)|Tab)$/;
export const isMoveOutEvent = (event?: Dynamic) =>
  event.kind === 'keyPressed'
    ? !event.isModifierHeld && !event.isAltHeld && ARROW_OR_TAB_KEY.test(event.key)
    : event.kind === 'pointerPressed' || event.kind === 'pointerDragged' || event.kind === 'pointerReleased';
export const EFFECTS_THAT_KEEP_ENTRY = new (Set as Dynamic)(['waitForPeople', 'workOutFormulasLeft', 'dropWhatIsHeld']);
export const EVENTS_NOT_ASKED_BY_PERSON = new (Set as Dynamic)([
  'figuresOfSelectionDue',
  'waysInWaitedFor',
  'agentRepliedAboutConditionalFormats',
  'versionsLookedAtAgain',
  'cellHistoryLookedAtAgain',
  'findLookedAgain',
  'windowCaretChanged',
  'ownFiltersLookedAtAgain',
  'agentRepliedWithANumberFormat',
  'agentRepliedAboutImport',
  'agentWroteOnAboutImport',
  'importAskedByHost',
  'formulaOfAgentArrived',
  'agentsAnswerSeen',
  'agentForFormulasChecked',
  'agentRepliedWithAFormula',
  'agentRepliedWithAFix',
  'agentRepliedWhichRowsAreAskedFor',
  'tablesRead',
  'selectionsOfOthersChanged',
  'workbookChanged',
  'formulasWorkedOut',
  'textMeasuredAnew',
  'editsDropped',
  'savingChanged',
  'formulasLeftChanged',
  'causeOfErrorRead',
  'workShownLongEnough',
  'agentActivityChanged',
  'changesByAgentChanged',
  'followAsked',
  'viewShownByAgentChanged',
  'commentModeChanged',
  'commentsTold',
  'commentsPointedAt',
  'commentPicked',
]);
export const isEventNotAskedByPerson = (kind?: Dynamic) => EVENTS_NOT_ASKED_BY_PERSON.has(kind);
export const actsByPerson = (act?: Dynamic) => [
  {
    act: act,
    by: 'person',
  },
];
export const actsByPage = (act?: Dynamic) => [
  {
    act: act,
    by: 'page',
  },
];
export const stopsAskingAgentForFormula = ({ effects: effects }: Dynamic) =>
  effects.some(({ kind: kind }: Dynamic) => kind === 'stopAskingAgentForAFormula');
export const actsOfAgentAsked = ({ made: { state: state, effects: effects } }: Dynamic) =>
  effects.flatMap((effect?: Dynamic) => {
    if (effect.kind === 'askAgentForANumberFormat')
      return [
        {
          act: 'ask_number_format',
          onceAnswered: effect.askId,
        },
      ];
    if (effect.kind !== 'askAgentForAFormula') return [];
    let { stage: stage } = state.formulaFromWords;
    return [
      {
        act: stage?.kind === 'asked' && stage.isFix === true ? 'ask_fix_one' : 'ask_formula',
        onceAnswered: effect.askId,
      },
    ];
  });
