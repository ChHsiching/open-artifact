import type { Dynamic } from '../../dynamic.ts';
import { conditionalRulesOfPane, canOfferAgentForRules } from '../../state/queries.ts';
import { cleanTextForAgent, joinPrompts } from '../../agent/prompt-text.ts';
import {
  MOST_RULE_WORDS_FOR_AGENT,
  isAgentFreeForRules,
  agentAskFailed,
  rulesBriefForAgent,
  askAgentAboutRules,
  lineRunsOfSheet,
  MOST_AGENT_ATTEMPTS,
} from './ask-agent.ts';
import { withNoEffects } from '../../state/transitions.ts';
import {
  tableInPlaceOfSelection,
  isOneCellSelectedOnly,
  doesSelectionGoPastTable,
  canRulesRunToSheetEnd,
  matchesOfRules,
  withRuleRangesMapped,
  stretchRangeToAreaEnd,
} from './selection-target.ts';
import {
  conditionalFormatFromWordsPrompt,
  editConditionalFormatRulePrompt,
  suggestionsFromAnswer,
  rulesFromAnswer,
  isNoRulesAnswer,
  refusedAnswerPrompt,
} from './agent-prompts.ts';
import { selectedArea } from '../../selection/model.ts';
import {
  conditionalFormatRuleById,
  cornerCellIdsOf,
  openConditionalFormatsAs,
  withRulesOfAgentKept,
  withConditionalFormatsPane,
  cellRangeKey,
  cellsToAskAgentAbout,
  rulesOfAgentToKeep,
  isPlainRulesMenu,
  showRulesInPane,
  isSameRulesJson,
} from './pane-state.ts';
import { MAX_COMMAND_WORDS_LENGTH } from '../../ui/commands-from-words.ts';
import { areasOfRuleRanges } from './descriptions.ts';
import { isInSpan } from '../../grid/geometry.ts';
import { NUMBER_OPERAND_FIELDS, numberConditionOperand } from './editor-view.ts';
import { closeSidePane } from '../../chips/dropdowns.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
export function askAgentForRulesFromWords(state: PageState, reads: WorkbookReads, words?: Dynamic, canChatTakeIt?: Dynamic, attempt: Dynamic = 1) {
  let pane = conditionalRulesOfPane(state);
  let wordsForAgent = cleanTextForAgent(words, MOST_RULE_WORDS_FOR_AGENT);
  let canAsk = pane !== null && (isAgentFreeForRules(pane) || (pane.agent.kind === 'isAsked' && pane.agent.about === 'moreSuggestions'));
  if (pane === null || wordsForAgent === '' || !canAsk) return withNoEffects(state);
  let paneAsking = {
    ...pane,
    offer: null,
    pointedAt: null,
    inWords: null,
  };
  let failWith = (about?: Dynamic) => agentAskFailed(state, pane, about);
  if (pane.editor === null) {
    let cornerCells = [state.activeCell, state.selectionCorner];
    let suggestions = (reads.conditionalFormatSuggestions as Dynamic)(...cornerCells);
    let tableInPlace =
      suggestions === null ? null : tableInPlaceOfSelection(reads, pane.sheetId, suggestions, isOneCellSelectedOnly(state, reads));
    let brief = (rulesBriefForAgent as Dynamic)(reads, ...(tableInPlace ?? cornerCells));
    if (brief === null) return failWith('request');
    let { told: told, linesAsTold: linesAsTold } = brief;
    let asked = conditionalFormatFromWordsPrompt(told, wordsForAgent, state.otherRanges.length === 0, canChatTakeIt);
    let reach =
      suggestions === null || tableInPlace !== null || doesSelectionGoPastTable(reads, pane.sheetId, suggestions)
        ? null
        : {
            selected: selectedArea(state, reads),
            lastRowTold: suggestions.table.records.bottomRight.r,
          };
    return askAgentAboutRules(state, paneAsking, {
      about: 'request',
      words: wordsForAgent,
      canChatTakeIt: canChatTakeIt,
      asked: asked,
      attempt: attempt,
      linesAsTold: linesAsTold,
      reach: reach,
    });
  }
  let editedRule = conditionalFormatRuleById(reads, pane.sheetId, pane.editor.conditionalFormatId);
  let editedBrief =
    editedRule === null ? null : (rulesBriefForAgent as Dynamic)(reads, ...cornerCellIdsOf(pane.sheetId, editedRule.ranges[0]));
  let [ruleAsTold = null] = editedRule === null ? [] : (reads.conditionalFormatsByAddress(pane.sheetId, [editedRule]) ?? []);
  if (editedBrief === null || ruleAsTold === null) return failWith('change');
  let { told: editedTold, linesAsTold: editedLinesAsTold } = editedBrief;
  let editAsked = editConditionalFormatRulePrompt(editedTold, ruleAsTold, wordsForAgent);
  return askAgentAboutRules(state, paneAsking, {
    about: 'change',
    words: wordsForAgent,
    asked: editAsked,
    attempt: attempt,
    linesAsTold: editedLinesAsTold,
  });
}
export function askRulesFromMenuWords(state: PageState, reads: WorkbookReads, words?: Dynamic, menuAt?: Dynamic) {
  let pane = conditionalRulesOfPane(state);
  let { menu: menu } = state;
  if (menu === null || menu.holds !== 'all' || menu.isOfContextBar === true) return withNoEffects(state);
  if (menu.at !== menuAt) return withNoEffects(state);
  if (pane === null ? !canOfferAgentForRules(state) : pane.drawnAs !== 'menu') return withNoEffects(state);
  let menuWords = cleanTextForAgent(words, MAX_COMMAND_WORDS_LENGTH);
  if (menuWords === '' || pane?.wordsOfMenu === menuWords) return withNoEffects(state);
  let menuPane = pane === null ? conditionalRulesOfPane(openConditionalFormatsAs(state, 'menu')) : withRulesOfAgentKept(state, pane);
  if (menuPane === null) return withNoEffects(state);
  let paneWithWords = {
    ...menuPane,
    wordsOfMenu: menuWords,
    offer: null,
    agent: {
      kind: 'isIdle',
    },
  };
  let stateNow =
    menuPane.offer === null
      ? state
      : {
          ...state,
          lastDone: {
            what: 'offerDiscarded',
          },
        };
  let asked = askAgentForRulesFromWords(
    withConditionalFormatsPane(
      {
        ...stateNow,
        dropdown: null,
      },
      paneWithWords,
    ),
    reads,
    menuWords,
    false,
  );
  return menuPane.agent.kind === 'isAsked' && conditionalRulesOfPane(asked.state)?.agent.kind !== 'isAsked'
    ? {
        ...asked,
        effects: [
          {
            kind: 'stopAskingAgentAboutConditionalFormats',
          },
          ...asked.effects,
        ],
      }
    : asked;
}
export function showRulesInMenu(state: PageState, menuAt?: Dynamic) {
  let { menu: menu } = state;
  if (menu === null || menu.holds !== 'all' || menu.isOfContextBar === true) return state;
  if (menu.at !== menuAt || state.sidePane !== null) return state;
  let pane = conditionalRulesOfPane(openConditionalFormatsAs(state, 'menu'));
  if (pane === null) return state;
  let agent =
    pane.agent.kind === 'isAsked'
      ? {
          kind: 'isIdle',
        }
      : pane.agent;
  return withConditionalFormatsPane(
    {
      ...state,
      dropdown: null,
    },
    {
      ...pane,
      agent: agent,
    },
  );
}
export function isUsefulSuggestion(
  reads: WorkbookReads,
  sheetId?: Dynamic,
  rules?: Dynamic,
  matchTotal: Dynamic = matchTotalOfRules(reads, sheetId, rules),
) {
  if (rules.every(({ effect: effect }: Dynamic) => effect.kind === 'colorScale')) return true;
  let cellCount = rules
    .flatMap(({ ranges: ranges }: Dynamic) => areasOfRuleRanges(reads, sheetId, ranges))
    .reduce((total: Dynamic, { rowCount: rowCount, columnCount: columnCount }: Dynamic) => total + rowCount * columnCount, 0);
  return matchTotal !== null && matchTotal.cells > 0 && (rules.length > 1 || matchTotal.cells <= MOST_SHARE_OF_CELLS_MATCHED * cellCount);
}
export function areRulesWithinRows(reads: WorkbookReads, sheetId?: Dynamic, range?: Dynamic, rules?: Dynamic) {
  let [area] = areasOfRuleRanges(reads, sheetId, [range]);
  return (
    area !== undefined &&
    rules.every(
      ({ ranges: ranges }: Dynamic) =>
        areasOfRuleRanges(reads, sheetId, ranges).every(
          ({ topRowIndex: topRowIndex, rowCount: rowCount }: Dynamic) =>
            topRowIndex >= area.topRowIndex && topRowIndex + rowCount <= area.topRowIndex + area.rowCount,
        ),
    )
  );
}
export function doRulesTouchColumns(reads: WorkbookReads, sheetId?: Dynamic, range?: Dynamic, rules?: Dynamic) {
  let [
    { leftColumnIndex: leftColumnIndex, columnCount: columnCount } = {
      leftColumnIndex: 0,
      columnCount: 0,
    },
  ] = areasOfRuleRanges(reads, sheetId, [range]);
  let isColumnInRange = (columnId?: Dynamic) =>
    isInSpan(reads.columnIndexOf(sheetId, columnId) ?? -1, leftColumnIndex, columnCount);
  return rules.some(({ ranges: ranges, effect: effect }: Dynamic) => {
    let overlapsRange = areasOfRuleRanges(reads, sheetId, ranges).some(
      (area?: Dynamic) => area.leftColumnIndex < leftColumnIndex + columnCount && leftColumnIndex < area.leftColumnIndex + area.columnCount,
    );
    if (effect.kind === 'colorScale') return overlapsRange;
    return effect.allOf.some(
      ({ tested: tested, condition: condition }: Dynamic) =>
        (tested.kind === 'theCellItself' ? overlapsRange : isColumnInRange(tested.c)) ||
        NUMBER_OPERAND_FIELDS.some((operandKey?: Dynamic) => {
          let operand = numberConditionOperand(condition, operandKey);
          return operand?.kind === 'sameRowInColumn' && isColumnInRange(operand.c);
        }),
    );
  });
}
export function agentRulesByColumn(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topLeft: topLeft, bottomRight: bottomRight }: Dynamic,
  rules?: Dynamic,
) {
  let [area] = areasOfRuleRanges(reads, sheetId, [
    {
      topLeft: topLeft,
      bottomRight: bottomRight,
    },
  ]);
  let columns = reads.linesOf(sheetId)?.columns;
  if (area === undefined || columns === undefined || area.columnCount < 2) return {};
  return Object.fromEntries(
    Array.from<Dynamic, Dynamic>(
      {
        length: area.columnCount,
      },
      (input?: Dynamic, offset?: Dynamic) => columns.idAt(area.leftColumnIndex + offset),
    )
      .flatMap(
        (columnId?: Dynamic) =>
          columnId === null
            ? []
            : [
                {
                  topLeft: {
                    ...topLeft,
                    c: columnId,
                  },
                  bottomRight: {
                    ...bottomRight,
                    c: columnId,
                  },
                },
              ],
      )
      .map(
        (columnRange?: Dynamic) => [
          cellRangeKey(columnRange),
          rules.filter((rule?: Dynamic) => doRulesTouchColumns(reads, sheetId, columnRange, rule)),
        ],
      )
      .filter(([, columnRules]: Dynamic) => columnRules.length > 0),
  );
}
export function isAgentAnswerForCells(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { forCells: forCells, areWholeColumns: areWholeColumns }: Dynamic,
  forSelection?: Dynamic,
) {
  let { topLeft: topLeft, bottomRight: bottomRight } = cellsToAskAgentAbout(forSelection);
  if (
    cellRangeKey({
      topLeft: topLeft,
      bottomRight: bottomRight,
    }) === cellRangeKey(forCells)
  )
    return true;
  let [forCellsArea] = areasOfRuleRanges(reads, sheetId, [forCells]);
  return (
    areWholeColumns &&
    forCellsArea !== undefined &&
    topLeft.c === bottomRight.c &&
    topLeft.r === forCells.topLeft.r &&
    bottomRight.r === forCells.bottomRight.r &&
    isInSpan(reads.columnIndexOf(sheetId, topLeft.c) ?? -1, forCellsArea.leftColumnIndex, forCellsArea.columnCount)
  );
}
export function takeAgentAnswerForKeptRules(state: PageState, reads: WorkbookReads, askId?: Dynamic, answer?: Dynamic) {
  let kept = state.rulesOfAgentKept;
  if (kept === null || kept.stillAsked?.askId !== askId) return state;
  let stateWithAnswer = {
    ...state,
    isAgentForRulesNotToBeHad: answer.kind === 'notToBeHad',
    rulesOfAgentKept: {
      ...kept,
      stillAsked: null,
    },
  };
  let reopened = openConditionalFormatsAs(
    {
      ...state,
      sheetId: kept.sheetId,
    },
    'card',
  );
  if (conditionalRulesOfPane(reopened)?.agent !== kept.stillAsked) return stateWithAnswer;
  let paneAfter = conditionalRulesOfPane(takeAgentAnswerAboutRules(reopened, reads, askId, answer).state);
  return paneAfter === null
    ? stateWithAnswer
    : {
        ...stateWithAnswer,
        rulesOfAgentKept: rulesOfAgentToKeep(state, paneAfter),
      };
}
export function takeAgentAnswerAboutRules(state: PageState, reads: WorkbookReads, askId?: Dynamic, answer?: Dynamic) {
  let pane = conditionalRulesOfPane(state);
  if (pane === null || isPlainRulesMenu(pane)) return withNoEffects(takeAgentAnswerForKeptRules(state, reads, askId, answer));
  if (pane.agent.kind !== 'isAsked' || pane.agent.askId !== askId) return withNoEffects(state);
  let stateWithAnswer = {
    ...state,
    isAgentForRulesNotToBeHad: answer.kind === 'notToBeHad',
  };
  let agent = pane.agent;
  let { asked: asked, attempt: attempt } = agent;
  let withAgent = (agent2?: Dynamic, paneChanges: Dynamic = {}) =>
    withNoEffects(
      withConditionalFormatsPane(stateWithAnswer, {
        ...pane,
        ...paneChanges,
        agent: agent2,
      }),
    );
  if (answer.kind === 'notToBeHad') {
    let suggestedRules = {
      ...pane,
      agent: {
        kind: 'isNotToBeHad',
      },
    };
    return withNoEffects(
      pane.drawnAs === 'card' ? showRulesInPane(stateWithAnswer, suggestedRules) : withConditionalFormatsPane(stateWithAnswer, suggestedRules),
    );
  }
  let isSameLines = isSameRulesJson(lineRunsOfSheet(reads, pane.sheetId), agent.linesAsTold);
  let failed = {
    kind: 'hasFailed',
    about: agent.about,
    isBeyondRules: false,
  };
  if (agent.about === 'moreSuggestions') {
    if (answer.kind !== 'answered' || !isSameLines) return withAgent(failed);
    let suggestedRules = suggestionsFromAnswer(answer.answer).flatMap((ids?: Dynamic) => {
      let found = reads.conditionalFormatsInIds(pane.sheetId, ids);
      let [firstRule, ...otherRules] = found?.kind === 'rules' ? found.rules : [];
      if (firstRule === undefined) return [];
      let rules = [firstRule, ...otherRules];
      return doRulesTouchColumns(reads, pane.sheetId, agent.forCells, rules) &&
        areRulesWithinRows(reads, pane.sheetId, agent.forCells, rules) &&
        isUsefulSuggestion(reads, pane.sheetId, rules)
        ? [rules]
        : [];
    });
    if (suggestedRules.length === 0 && answer.isMended === true) return withAgent(failed);
    let fromAgent = {
      ...(agent.areWholeColumns ? agentRulesByColumn(reads, pane.sheetId, agent.forCells, suggestedRules) : {}),
      ...pane.fromAgent,
      [cellRangeKey(agent.forCells)]: suggestedRules,
    };
    return withAgent(
      {
        kind: 'isIdle',
      },
      {
        fromAgent: fromAgent,
      },
    );
  }
  if (!isSameLines)
    return attempt >= MOST_AGENT_ATTEMPTS
      ? withAgent(failed)
      : askAgentForRulesFromWords(
          withAgent({
            kind: 'isIdle',
          }).state,
          reads,
          agent.words,
          agent.about === 'request' && agent.canChatTakeIt,
          attempt + 1,
        );
  let answerRules = answer.kind === 'answered' ? rulesFromAnswer(answer.answer) : null;
  if (answer.kind === 'answered' && answer.isMended !== true && agent.about === 'request' && isNoRulesAnswer(answer.answer))
    return withAgent({
      ...failed,
      isBeyondRules: true,
    });
  if (answer.kind !== 'answered' || answerRules === null) return withAgent(failed);
  let rulesFound = reads.conditionalFormatsInIds(pane.sheetId, answerRules);
  if (rulesFound === null) return withAgent(failed);
  if (rulesFound.kind === 'rules') {
    let [suggestedRules, ...fromAgent] = rulesFound.rules;
    if (suggestedRules === undefined) return withAgent(failed);
    if (agent.about === 'change')
      return withAgent(
        {
          kind: 'isIdle',
        },
        {
          offer: [suggestedRules],
        },
      );
    let rules = [suggestedRules, ...fromAgent];
    let runsToSheetEnd =
      agent.reach !== null && canRulesRunToSheetEnd(reads, pane.sheetId, agent.reach.lastRowTold, rules, matchesOfRules(reads, pane.sheetId, rules));
    let offer =
      agent.reach !== null && runsToSheetEnd ? withRuleRangesMapped(rules, stretchRangeToAreaEnd(reads, pane.sheetId, agent.reach.selected)) : rules;
    return withAgent(
      {
        kind: 'isIdle',
      },
      {
        offer: offer,
      },
    );
  }
  if (attempt >= MOST_AGENT_ATTEMPTS || answer.isMended === true) return withAgent(failed);
  return askAgentAboutRules(stateWithAnswer, pane, {
    ...agent,
    asked: joinPrompts(asked, refusedAnswerPrompt(answer.answer, rulesFound)),
    attempt: attempt + 1,
  });
}
export const closeRulesMenu = (state: PageState) =>
  conditionalRulesOfPane(state)?.drawnAs === 'menu' ? closeSidePane(state) : state;
export const asNewRules = (rules?: Dynamic) =>
  rules.map(
    (rule?: Dynamic) => ({
      ...rule,
      inPlaceOf: null,
    }),
  );
export const sumMatches = (matches?: Dynamic) =>
  matches.reduce(
    (total?: Dynamic, match?: Dynamic) =>
      match === null
        ? total
        : {
            cells: (total?.cells ?? 0) + match.cells,
            rows: (total?.rows ?? 0) + match.rows,
          },
    null,
  );
export const matchTotalOfRules = (reads: WorkbookReads, sheetId?: Dynamic, rules?: Dynamic) =>
  sumMatches(matchesOfRules(reads, sheetId, rules) ?? []);
export const MOST_SHARE_OF_CELLS_MATCHED = 0.9;
