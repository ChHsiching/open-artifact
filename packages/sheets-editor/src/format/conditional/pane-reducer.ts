import type { Dynamic } from '../../dynamic.ts';
import { selectedArea, isSameSelection } from '../../selection/model.ts';
import { readConditionalFormatFromWords } from '../../words/rule-in-table.ts';
import {
  isOneCellSelectedOnly,
  canRulesRunToSheetEnd,
  withRuleRangesMapped,
  stretchRangeToAreaEnd,
  rulesForSelection,
  originalRulesOf,
  matchesOfRules,
  originalOfStretchedRules,
} from './selection-target.ts';
import { tintFormatOf, defaultRuleForRanges, ruleWithEffectKind } from './rule-edits.ts';
import {
  isSameRulesJson,
  withConditionalFormatsPane,
  showRulesInPane,
  queueRuleEditEffect,
  tableOfRuleRange,
  stepBackInRulesPane,
  isAskingAgentForRules,
  conditionalFormatRuleById,
  ruleOfConditionalFormat,
  whatRuleLooksFor,
  NOTHING_SHOWN_IN_RULES_PANE,
  isCardFarFromSelection,
  cellRangeKey,
  cellsToAskAgentAbout,
  areSameRulesIgnoringFormat,
  ruleWithTestBeingAdded,
  conditionalFormatChangeEffect,
  isPlainRulesMenu,
  rulesOfAgentToKeep,
  isAgentOfferPendingOrAsked,
} from './pane-state.ts';
import { asNewRules, askAgentForRulesFromWords, sumMatches, doRulesTouchColumns, isAgentAnswerForCells } from './agent-rules.ts';
import { closeSidePane } from '../../chips/dropdowns.ts';
import { withNoEffects } from '../../state/transitions.ts';
import { askAgentForMoreSuggestions } from './ask-agent.ts';
import { rangesOfAreas, actInRuleEditor } from './editor-edits.ts';
import { areasOfAllRanges } from '../../selection/several-ranges.ts';
import { firstColumnOfRule } from './conditions.ts';
import { columnLabelOf, tableColumnSummary, conditionalFormatEditorView, conditionalFormatFieldValue } from './editor-view.ts';
import { openRuleEditor, PAGE_SUGGESTIONS_BESIDE_AGENT, PAGE_SUGGESTIONS_FOR_BLOCK, columnNameOfAbout } from './suggestions.ts';
import { conditionalRulesOfPane } from '../../state/queries.ts';
import { areasOfRuleRanges, describeRules, describeRule } from './descriptions.ts';
import { areasToA1AsStored } from '../../formulas/from-words/where.ts';
import { ownRowOrderOfSheet } from '../../model/line-ids.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
import type { PageState } from '../../state/initial-state.ts';
export function inWordsOfPane(
  state: PageState,
  reads: WorkbookReads,
  pane: Dynamic,
  { words: words, today: today2 }: Dynamic,
  mayKeepRead: Dynamic = true,
) {
  if (words.trim() === '') return null;
  let { sheetId: sheetId, forSelection: forSelection, inWords: inWords } = pane;
  let tableCorner = forSelection?.table.records.topLeft;
  let effectToStartFrom = forSelection?.ruleToStartFrom.effect;
  let selected = selectedArea(state, reads);
  let read = readConditionalFormatFromWords(reads, words, {
    inTable:
      tableCorner === undefined
        ? state.activeCell
        : {
            sheetId: sheetId,
            rowId: tableCorner.r,
            columnId: tableCorner.c,
          },
    selected: state.otherRanges.length > 0 ? null : selected,
    isOneCellSelected: isOneCellSelectedOnly(state, reads),
    viewer: state.viewerId,
    today: today2,
    lookToStartFrom: effectToStartFrom?.kind === 'formatWhere' ? effectToStartFrom.format : tintFormatOf('yellow'),
  });
  if (read.kind === 'notRead') {
    let isStillTyping = read.isOnItsWay && inWords !== null && words.startsWith(inWords.words);
    return {
      words: words,
      today: today2,
      read: null,
      stillTried: isStillTyping ? (inWords.read?.rules ?? inWords.stillTried) : null,
    };
  }
  let keptRead = mayKeepRead ? (inWords?.read ?? null) : null;
  if (keptRead !== null && isSameRulesJson(keptRead.asSaid, read.rules))
    return {
      words: words,
      today: today2,
      read: keptRead,
      stillTried: null,
    };
  let given = reads.formatsGivenAsIf(sheetId, asNewRules(read.rules));
  if (given === null)
    return {
      words: words,
      today: today2,
      read: null,
      stillTried: null,
    };
  let matches = given.matches.slice(0, read.rules.length);
  let rules =
    read.endAtLastRecord &&
    forSelection !== null &&
    forSelection.isInPlaceOfWhatIsSelected !== true &&
    forSelection.isOverSeveralTables !== true &&
    canRulesRunToSheetEnd(reads, sheetId, read.rules[0].ranges[0].bottomRight.r, read.rules, matches)
      ? withRuleRangesMapped(read.rules, stretchRangeToAreaEnd(reads, sheetId, selected))
      : read.rules;
  return {
    words: words,
    today: today2,
    read: {
      rules: rules,
      asSaid: read.rules,
      gives: given,
    },
    stillTried: null,
  };
}
export function actInRulesList(state: PageState, reads: WorkbookReads, pane?: Dynamic, action?: Dynamic) {
  let { sheetId: sheetId } = pane;
  let addRules = (
    rules?: Dynamic,
    paneChanges?: Dynamic,
    then?: Dynamic,
    done: Dynamic = {
      what: 'rulesAdded',
      ruleCount: rules.length,
    },
  ) => ({
    state:
      pane.drawnAs === 'pane'
        ? withConditionalFormatsPane(state, {
            ...pane,
            ...paneChanges,
          })
        : then === undefined
          ? closeSidePane(
              pane.drawnAs === 'menu'
                ? {
                    ...state,
                    menu: null,
                  }
                : state,
            )
          : showRulesInPane(state, {
              ...pane,
              ...paneChanges,
            }),
    effects: [
      queueRuleEditEffect(
        {
          kind: 'addConditionalFormats',
          sheetId: sheetId,
          rules: rules,
        },
        done,
        then,
      ),
    ],
  });
  let suggestedRulesOf = (rules?: Dynamic) =>
    rules === null
      ? null
      : ((
          pane.shown.suggestions.find(({ rules: suggestionRules }: Dynamic) => suggestionRules === rules) ??
          pane.shown.suggestions.find(({ rules: suggestionRules }: Dynamic) => isSameRulesJson(suggestionRules, rules))
        )?.rules ?? null);
  switch (action.kind) {
    case 'pointAtSuggestion': {
      let value = suggestedRulesOf(action.rules);
      return withNoEffects(
        value === pane.pointedAt
          ? state
          : withConditionalFormatsPane(state, {
              ...pane,
              pointedAt: value,
            }),
      );
    }
    case 'takeSuggestion': {
      let value = suggestedRulesOf(action.rules);
      return value === null
        ? withNoEffects(state)
        : addRules(value, {
            pointedAt: null,
          });
    }
    case 'showInPane': {
      if (pane.drawnAs === 'pane') return withNoEffects(state);
      let value = pane.drawnAs === 'menu' ? null : pane.pointedAt;
      return withNoEffects(
        showRulesInPane(state, {
          ...pane,
          pointedAt: value,
          isAskedForRules: true,
        }),
      );
    }
    case 'askForMoreSuggestions':
      return askAgentForMoreSuggestions(state, reads);
    case 'typeWords':
      return withNoEffects(
        withConditionalFormatsPane(state, {
          ...pane,
          pointedAt: null,
          inWords: inWordsOfPane(state, reads, pane, action),
        }),
      );
    case 'restAfterWords': {
      if (pane.inWords?.words !== action.words || pane.inWords.read !== null) return withNoEffects(state);
      let { words: inWords, today: inWords2 } = pane.inWords;
      let value = inWordsOfPane(state, reads, pane, {
        words: `${inWords} `,
        today: inWords2,
      });
      return withNoEffects(
        withConditionalFormatsPane(state, {
          ...pane,
          inWords:
            value === null
              ? null
              : {
                  ...value,
                  stillTried: null,
                },
        }),
      );
    }
    case 'takeReadAtOnce': {
      let value =
        (pane.inWords?.words === action.words ? pane.inWords.read : null) ??
        inWordsOfPane(state, reads, pane, {
          ...action,
          words: `${action.words} `,
        })?.read ??
        null;
      return value === null
        ? askAgentForRulesFromWords(state, reads, action.words, action.canChatTakeIt ?? false)
        : addRules(value.rules, {
            inWords: null,
            pointedAt: null,
          });
    }
    case 'askAgent':
      return askAgentForRulesFromWords(state, reads, action.words, action.canChatTakeIt ?? false);
    case 'keepOffer':
      return pane.offer === null
        ? withNoEffects(state)
        : addRules(pane.offer, {
            offer: null,
          });
    case 'editOffer':
      return pane.offer === null
        ? withNoEffects(state)
        : addRules(
            pane.offer,
            {
              offer: null,
            },
            {
              thenEditorOfTopRule: {
                cellsPickedByPage: null,
              },
            },
          );
    case 'discardOffer':
      return withNoEffects(
        withConditionalFormatsPane(state, {
          ...pane,
          offer: null,
        }),
      );
    case 'startRule': {
      let value = rangesOfAreas(reads, sheetId, areasOfAllRanges(state, reads));
      let value2 = pane.forSelection?.ruleToStartFrom ?? (value === null ? null : defaultRuleForRanges(value));
      if (value2 === null) return withNoEffects(state);
      let value3 = action.effect === undefined ? null : tableOfRuleRange(reads, sheetId, value2);
      let value4 = (action.effect === undefined || value3 === null ? null : ruleWithEffectKind(value2, action.effect, value3)) ?? value2;
      if (action.effect !== undefined && value4.effect.kind !== action.effect) return withNoEffects(state);
      let value5 = firstColumnOfRule(value4) !== firstColumnOfRule(value2);
      return addRules(
        [value4],
        {
          offer: null,
          pointedAt: null,
        },
        {
          thenEditorOfTopRule: {
            cellsPickedByPage: value5 ? 'movedToNumbers' : null,
          },
        },
        value5
          ? {
              what: 'movedToNumbers',
              column: columnLabelOf(reads, sheetId, tableColumnSummary(value3, firstColumnOfRule(value4))),
            }
          : undefined,
      );
    }
    case 'editRule':
      return withNoEffects(openRuleEditor(state, reads, action.conditionalFormatId, null));
    case 'removeRule': {
      let { conditionalFormatId: value } = action;
      return {
        state: state,
        effects: [
          queueRuleEditEffect(
            {
              kind: 'removeConditionalFormat',
              sheetId: sheetId,
              conditionalFormatId: value,
            },
            {
              what: 'ruleRemoved',
              isSaved: false,
            },
          ),
        ],
      };
    }
    case 'useSelectionFor': {
      let { conditionalFormatId: value } = action;
      let value2 = rangesOfAreas(reads, sheetId, areasOfAllRanges(state, reads));
      if (value2 === null) return withNoEffects(state);
      return {
        state: state,
        effects: [
          queueRuleEditEffect(
            {
              kind: 'changeConditionalFormat',
              sheetId: sheetId,
              conditionalFormatId: value,
              ranges: value2,
            },
            {
              what: 'ruleChanged',
            },
          ),
        ],
      };
    }
    case 'moveRule': {
      let { conditionalFormatId: value, toIndex: value2 } = action;
      let mapped = pane.shown.rules.map((rule?: Dynamic) => rule.conditionalFormatId);
      if (!mapped.includes(value) || mapped[value2] === value) return withNoEffects(state);
      let value3 = mapped.filter((conditionalFormatId?: Dynamic) => conditionalFormatId !== value)[value2] ?? null;
      let state2 = {
        kind: 'moveConditionalFormat',
        sheetId: sheetId,
        conditionalFormatId: value,
        before: value3,
      };
      let state3 = {
        what: 'ruleMoved',
        place: Math.min(value2, mapped.length - 1) + 1,
        ruleCount: mapped.length,
      };
      return {
        state: state,
        effects: [queueRuleEditEffect(state2, state3)],
      };
    }
    case 'previewRested':
    case 'stepBack':
      return withNoEffects(state);
    case 'leaveEditor':
    case 'chooseKindOfEffect':
    case 'type':
    case 'enterTyped':
    case 'dropTyped':
    case 'useSelection':
    case 'chooseTested':
    case 'chooseCondition':
    case 'chooseOperand':
    case 'chooseOperandColumn':
    case 'chooseDay':
    case 'chooseText':
    case 'addTest':
    case 'removeTest':
    case 'choosePreset':
    case 'chooseColor':
    case 'toggleStyle':
    case 'chooseAnchor':
    case 'chooseStopDay':
    case 'chooseStopColor':
    case 'setMiddleStop':
      return withNoEffects(state);
  }
}
export function actInConditionalFormats(state: PageState, reads: WorkbookReads, action?: Dynamic) {
  let pane = conditionalRulesOfPane(state);
  if (pane === null) return withNoEffects(state);
  if (pane.drawnAs === 'menu' && !isActionForMenu(pane, action)) return withNoEffects(state);
  if (action.kind === 'previewRested') {
    let { sheetId: sheetId, tried: tried } = pane;
    return withNoEffects(
      isPreviewBehind(pane)
        ? withConditionalFormatsPane(state, {
            ...pane,
            previewed: {
              asIf: tried,
              gives: reads.formatsGivenAsIf(sheetId, tried),
            },
          })
        : state,
    );
  }
  let result =
    action.kind === 'stepBack'
      ? stepBackInRulesPane(state, pane)
      : pane.editor === null
        ? actInRulesList(state, reads, pane, action)
        : actInRuleEditor(state, reads, pane, pane.editor, action);
  return pane.offer !== null && conditionalRulesOfPane(result.state)?.offer === null && action.kind !== 'keepOffer' && action.kind !== 'editOffer'
    ? {
        ...result,
        state: {
          ...result.state,
          lastDone: {
            what: 'offerDiscarded',
          },
        },
      }
    : result;
}
export function rulesToTryOf(pane?: Dynamic) {
  let { editor: editor, offer: offer, pointedAt: pointedAt } = pane;
  let inWords = isAskingAgentForRules(pane) ? null : pane.inWords;
  if (editor === null) return asNewRules(offer ?? pointedAt ?? inWords?.read?.rules ?? inWords?.stillTried ?? []);
  let rule = offer?.[0] ?? editor.typed?.rule ?? null;
  return rule === null
    ? []
    : [
        {
          ...rule,
          inPlaceOf: editor.conditionalFormatId,
        },
      ];
}
export function keepTestBeingAddedIfFits(reads: WorkbookReads, { effect: effect }: Dynamic, editor?: Dynamic) {
  let { testBeingAdded: testBeingAdded, table: table } = editor;
  let tested = testBeingAdded?.tested ?? null;
  return tested !== null &&
    testBeingAdded?.condition === null &&
    effect.kind === 'formatWhere' &&
    effect.allOf.length < reads.limitsOfConditionalFormats().mostTestsInAConditionalFormat &&
    (tested.kind === 'theCellItself' || table?.columns.some(({ c: c }: Dynamic) => c === tested.c) === true)
    ? editor
    : {
        ...editor,
        testBeingAdded: null,
      };
}
export function refreshConditionalFormatsPane(
  state: PageState,
  reads: WorkbookReads,
  pane?: Dynamic,
  isSelectionSame?: Dynamic,
  isWorkbookUnchanged?: Dynamic,
) {
  let { sheetId: sheetId } = pane;
  let conditionalFormats = reads.conditionalFormatsOf(sheetId);
  let editedRule = pane.editor === null ? null : conditionalFormatRuleById(reads, sheetId, pane.editor.conditionalFormatId);
  let editor =
    pane.editor === null || editedRule === null || isWorkbookUnchanged
      ? pane.editor
      : keepTestBeingAddedIfFits(reads, editedRule, {
          ...pane.editor,
          table: tableOfRuleRange(reads, sheetId, editedRule),
        });
  let forSelection =
    editor !== null || (isSelectionSame && isWorkbookUnchanged && pane.forSelection !== null)
      ? pane.forSelection
      : rulesForSelection(reads, state.activeCell, state.selectionCorner, selectedArea(state, reads), isOneCellSelectedOnly(state, reads));
  let inWords =
    pane.inWords === null || (isWorkbookUnchanged && forSelection === pane.forSelection)
      ? pane.inWords
      : inWordsOfPane(
          state,
          reads,
          {
            ...pane,
            forSelection: forSelection,
          },
          pane.inWords,
          false,
        );
  let rulesToTry = rulesToTryOf({
    ...pane,
    editor: editor,
    inWords: inWords,
  });
  let tried = isSameRulesJson(pane.tried, rulesToTry) ? pane.tried : rulesToTry;
  let isPreviewOfTried = pane.previewed?.asIf === tried;
  let isOnlyWords = editor === null && pane.offer === null && pane.pointedAt === null;
  let previewed =
    tried.length === 0
      ? null
      : isWorkbookUnchanged && (isPreviewOfTried || !isOnlyWords)
        ? pane.previewed
        : isPreviewOfTried || isOnlyWords
          ? {
              asIf: tried,
              gives: (isOnlyWords ? inWords?.read?.gives : undefined) ?? reads.formatsGivenAsIf(sheetId, tried),
            }
          : null;
  let isPreviewCurrent = previewed?.asIf === tried;
  let given = previewed?.gives ?? null;
  let { matches: matches } = given ?? reads.formatsGivenIn(sheetId);
  let existingRules = conditionalFormats.flatMap((format?: Dynamic) => ruleOfConditionalFormat(format) ?? []);
  let isSameRangeToEmptyEnd = (range?: Dynamic, otherRange?: Dynamic) => {
    let [area] = areasOfRuleRanges(reads, sheetId, [range]);
    let [otherArea] = areasOfRuleRanges(reads, sheetId, [otherRange]);
    if (area === undefined || otherArea === undefined) return false;
    let belowRowIndex = otherArea.topRowIndex + otherArea.rowCount;
    let below = {
      ...otherArea,
      topRowIndex: belowRowIndex,
      rowCount: area.rowCount - otherArea.rowCount,
    };
    return (
      isSameRulesJson(
        {
          ...area,
          rowCount: 0,
        },
        {
          ...otherArea,
          rowCount: 0,
        },
      ) &&
      (below.rowCount === 0 || (below.rowCount > 0 && reads.cellsOnShowIn(sheetId, below).length === 0))
    );
  };
  let isAlreadyAdded = (rules?: Dynamic) =>
    originalRulesOf(rules).every(
      (rule?: Dynamic) =>
        existingRules.some(
          (existing?: Dynamic) =>
            isSameRulesJson(whatRuleLooksFor(existing), whatRuleLooksFor(rule)) &&
            existing.ranges.length === rule.ranges.length &&
            rule.ranges.every((range?: Dynamic, rangeIndex?: Dynamic) => {
              let existingRange = existing.ranges[rangeIndex];
              return existingRange !== undefined && isSameRangeToEmptyEnd(existingRange, range);
            }),
        ),
    );
  let asSuggestion = (rules?: Dynamic, matched?: Dynamic, isFromAgent?: Dynamic) => ({
    rules: rules,
    toSay: describeRules(reads, sheetId, rules, matched),
    isFromAgent: isFromAgent,
  });
  let shownBefore = isWorkbookUnchanged ? pane.shown.suggestions : [];
  let keepsShownRules = isWorkbookUnchanged && pane.shown !== NOTHING_SHOWN_IN_RULES_PANE && previewed === pane.previewed;
  let shownSuggestionFor = (rules?: Dynamic, matched?: Dynamic) =>
    shownBefore.find((suggestion?: Dynamic) => suggestion.rules === rules) ?? asSuggestion(rules, matched, true);
  let isCardFar = isCardFarFromSelection({
    ...pane,
    forSelection: forSelection,
  });
  let isMenuInPlace = pane.drawnAs === 'menu' && (forSelection?.isInPlaceOfWhatIsSelected === true || state.otherRanges.length > 0);
  let pageSuggestions = (isCardFar || isMenuInPlace ? [] : (forSelection?.suggestions ?? []))
    .filter(({ rules: rules }: Dynamic) => !isAlreadyAdded(rules))
    .slice(
      0,
      pane.agent.kind !== 'isNotToBeHad' && pane.drawnAs !== 'menu'
        ? PAGE_SUGGESTIONS_BESIDE_AGENT
        : forSelection?.about.topLeft.c === forSelection?.about.bottomRight.c
          ? undefined
          : PAGE_SUGGESTIONS_FOR_BLOCK,
    );
  let rulesOfAgent =
    forSelection === null || isCardFar || pane.drawnAs === 'menu' ? [] : (pane.fromAgent[cellRangeKey(cellsToAskAgentAbout(forSelection))] ?? []);
  let agentForSelection = isWorkbookUnchanged && pane.ofAgentForSelection?.written === rulesOfAgent ? pane.ofAgentForSelection : null;
  let agentMatches =
    agentForSelection?.ofEach ??
    rulesOfAgent.map((rules?: Dynamic) => {
      let matches2 = matchesOfRules(reads, sheetId, rules);
      let lastRowId = forSelection === null ? undefined : cellsToAskAgentAbout(forSelection).bottomRight.r;
      return {
        matches: sumMatches(matches2 ?? []),
        mayGoOn: lastRowId !== undefined && canRulesRunToSheetEnd(reads, sheetId, lastRowId, rules, matches2),
      };
    });
  let stretchRange = stretchRangeToAreaEnd(
    reads,
    sheetId,
    forSelection?.isInPlaceOfWhatIsSelected === true || forSelection?.isOverSeveralTables === true ? null : selectedArea(state, reads),
  );
  let agentListed =
    agentForSelection !== null && forSelection === pane.forSelection
      ? agentForSelection.listed
      : rulesOfAgent.map((rules?: Dynamic, index?: Dynamic) => {
          let stretched = agentMatches[index]?.mayGoOn === true ? withRuleRangesMapped(rules, stretchRange) : rules;
          if (stretched !== rules) originalOfStretchedRules.set(stretched, rules);
          return stretched;
        });
  let agentSuggestions = agentListed.map(
    (rules?: Dynamic, index?: Dynamic) => ({
      rules: rules,
      matched: agentMatches[index]?.matches ?? null,
      goesByWhatIsSelected: forSelection === null || doRulesTouchColumns(reads, sheetId, forSelection.about, originalRulesOf(rules)),
    }),
  );
  let agentSuggestionsInOrder = [
    ...agentSuggestions.filter(({ goesByWhatIsSelected: goesByWhatIsSelected }: Dynamic) => goesByWhatIsSelected),
    ...agentSuggestions.filter(({ goesByWhatIsSelected: goesByWhatIsSelected }: Dynamic) => !goesByWhatIsSelected),
  ];
  let isRepeated = (rules?: Dynamic, before?: Dynamic) =>
    isAlreadyAdded(rules) ||
    [...pageSuggestions, ...before].some(
      (suggestion?: Dynamic) => areSameRulesIgnoringFormat(originalRulesOf(suggestion.rules), originalRulesOf(rules)),
    );
  let [firstOfAgent, ...otherOfAgent] = agentSuggestionsInOrder.flatMap(
    ({ rules: rules, matched: matched }: Dynamic, index?: Dynamic, list?: Dynamic) =>
      isRepeated(rules, list.slice(0, index)) ? [] : [shownSuggestionFor(rules, matched)],
  );
  let editedIndex = conditionalFormats.findIndex((format?: Dynamic) => format.conditionalFormatId === editor?.conditionalFormatId);
  let addedCount =
    previewed === null || given === null ? 0 : previewed.asIf.filter(({ inPlaceOf: rule }: Dynamic) => rule === null).length;
  let shownWithMatches = (rules?: Dynamic, isFromAgent?: Dynamic) => {
    let matchAt = (index?: Dynamic) =>
      given === null || !isPreviewCurrent ? null : (matches[editor === null ? index : editedIndex] ?? null);
    return {
      ...asSuggestion(
        rules,
        editor === null ? sumMatches(rules.map((input?: Dynamic, index?: Dynamic) => matchAt(index))) : matchAt(0),
        isFromAgent,
      ),
      each: rules.map((rule?: Dynamic, index?: Dynamic) => describeRule(reads, sheetId, rule, matchAt(index))),
    };
  };
  let readAtOnce = isOnlyWords && !isAskingAgentForRules(pane) ? (inWords?.read?.rules ?? null) : null;
  return {
    ...pane,
    forSelection: forSelection,
    ofAgentForSelection: {
      written: rulesOfAgent,
      ofEach: agentMatches,
      listed: agentListed,
    },
    inWords: inWords,
    editor: editor,
    tried: tried,
    previewed: previewed,
    shown: {
      about:
        forSelection === null || editor !== null
          ? null
          : {
              cells: areasToA1AsStored(areasOfRuleRanges(reads, sheetId, [forSelection.about]), ownRowOrderOfSheet(reads, sheetId)),
              nameOfColumn: columnNameOfAbout(forSelection),
            },
      suggestions:
        editor !== null
          ? []
          : [
              ...(firstOfAgent === undefined ? [] : [firstOfAgent]),
              ...pageSuggestions.map(
                (suggestion?: Dynamic) =>
                  shownBefore.find(({ rules: rules }: Dynamic) => rules === suggestion.rules) ??
                  asSuggestion(suggestion.rules, suggestion.matches, false),
              ),
              ...otherOfAgent,
            ],
      offer: pane.offer === null ? null : shownWithMatches(pane.offer, true),
      readAtOnce: readAtOnce === null ? null : shownWithMatches(readAtOnce, false),
      rules: keepsShownRules
        ? pane.shown.rules
        : conditionalFormats.map(
            ({ conditionalFormatId: conditionalFormatId, liveRanges: liveRanges, effect: effect }: Dynamic, index?: Dynamic) => ({
              conditionalFormatId: conditionalFormatId,
              toSay: describeRule(
                reads,
                sheetId,
                {
                  ranges: liveRanges,
                  effect: effect,
                },
                matches[index + addedCount] ?? null,
              ),
            }),
          ),
      notWorkedOut: reads.formatsGivenIn(sheetId).notWorkedOut,
      editor:
        editor === null || editedRule === null
          ? null
          : {
              conditionalFormatId: editor.conditionalFormatId,
              ...conditionalFormatEditorView(
                reads,
                sheetId,
                editor.typed?.rule ?? editor.typed?.ruleWithBox ?? ruleWithTestBeingAdded(editedRule, editor.testBeingAdded),
                {
                  ...editor,
                  testThatWaits: editor.testBeingAdded?.condition === null ? editor.testBeingAdded.tested : null,
                },
                matches[editedIndex + addedCount] ?? null,
              ),
            },
    },
  };
}
export function dropSettledRefusals(pane: Dynamic, reads: WorkbookReads) {
  let { editor = null } = pane ?? {};
  let { refused = [] } = editor ?? {};
  let savedRule = pane === null || editor === null ? null : conditionalFormatRuleById(reads, pane.sheetId, editor.conditionalFormatId);
  if (pane === null || editor === null || savedRule === null || refused.length === 0) return pane;
  let rule = ruleWithTestBeingAdded(savedRule, editor.testBeingAdded);
  let stillRefused = refused.filter(({ field: field, over: over }: Dynamic) => {
    let value = conditionalFormatFieldValue(rule, field);
    return value !== null && isSameRulesJson(value, conditionalFormatFieldValue(over, field));
  });
  return stillRefused.length === refused.length
    ? pane
    : {
        ...pane,
        editor: {
          ...editor,
          refused: stillRefused,
        },
      };
}
export function settleConditionalFormatsPane(
  stateBefore: Dynamic,
  result: Dynamic,
  { reads: reads, refusalOfEveryEdit: refusalOfEveryEdit }: Dynamic,
) {
  let [paneBefore, paneAfter] = [conditionalRulesOfPane(stateBefore), conditionalRulesOfPane(result.state)];
  if (paneBefore === null && paneAfter === null) return result;
  let { state: state } = result;
  let isSameSheet = paneAfter?.sheetId === state.sheetId;
  let paneOnSheet =
    paneAfter === null || isSameSheet
      ? paneAfter
      : {
          ...paneAfter,
          sheetId: state.sheetId,
          openedAtChangeCount: state.workbookChangeCount,
          isAskedForRules: false,
          forSelection: null,
          fromAgent: {},
          ofAgentForSelection: null,
          agent:
            paneAfter.agent.kind === 'isNotToBeHad'
              ? paneAfter.agent
              : {
                  kind: 'isIdle',
                },
          offer: null,
          pointedAt: null,
          inWords: null,
          editor: null,
          tried: [],
          previewed: null,
          shown: NOTHING_SHOWN_IN_RULES_PANE,
        };
  let isEditedRuleGone =
    paneOnSheet !== null &&
    paneOnSheet.editor !== null &&
    conditionalFormatRuleById(reads, paneOnSheet.sheetId, paneOnSheet.editor.conditionalFormatId) === null;
  let paneWithEditor =
    paneOnSheet !== null && isEditedRuleGone
      ? {
          ...paneOnSheet,
          editor: null,
          offer: null,
        }
      : paneOnSheet;
  let pane = dropSettledRefusals(paneWithEditor, reads);
  let editorBefore = paneBefore?.editor ?? null;
  let isEditorLeft = editorBefore !== null && pane?.editor?.conditionalFormatId !== editorBefore.conditionalFormatId;
  let typedRuleLeft = isEditorLeft ? (editorBefore.typed?.rule ?? null) : null;
  let ruleLeft =
    paneBefore === null || editorBefore === null ? null : conditionalFormatRuleById(reads, paneBefore.sheetId, editorBefore.conditionalFormatId);
  let saveLeftTyping =
    paneBefore === null || editorBefore === null || typedRuleLeft === null || ruleLeft === null || refusalOfEveryEdit !== null
      ? null
      : conditionalFormatChangeEffect(paneBefore.sheetId, editorBefore.conditionalFormatId, ruleLeft, typedRuleLeft);
  let [wasSelecting, isSelecting] = [stateBefore.dragging?.kind === 'selecting', state.dragging?.kind === 'selecting'];
  let isSelectionSame =
    paneBefore !== null &&
    isSameSheet &&
    (wasSelecting ? isSelecting : isSameSelection(stateBefore, state) && stateBefore.otherRanges === state.otherRanges) &&
    !isEditorLeft;
  let isWorkbookUnchanged =
    stateBefore.workbookChangeCount === state.workbookChangeCount && stateBefore.formulasWorkedOutCount === state.formulasWorkedOutCount;
  let agentAsked = paneBefore?.agent.kind === 'isAsked' ? paneBefore.agent : null;
  let isAnswerMoot =
    agentAsked !== null && pane?.agent === agentAsked && (agentAsked.about === 'change' ? isEditorLeft : pane.editor !== null);
  let isMenuToCard = paneBefore?.drawnAs === 'menu' && paneBefore.wordsOfMenu !== null && pane?.drawnAs === 'card';
  let shouldStopAsking = agentAsked !== null && (pane === null || !isSameSheet || isAnswerMoot || isMenuToCard);
  let isFailureStale =
    pane?.agent.kind === 'hasFailed' &&
    pane.agent === paneBefore?.agent &&
    (!isSelectionSame || pane.editor?.conditionalFormatId !== paneBefore.editor?.conditionalFormatId);
  let areRulesAdded = result.effects.some(
    (effect?: Dynamic) => effect.kind === 'queueEdit' && effect.edit.kind === 'addConditionalFormats',
  );
  let isKeptAskMoot = areRulesAdded && isPlainRulesMenu(paneBefore) && (state.rulesOfAgentKept?.stillAsked ?? null) !== null;
  let paneSettled =
    pane !== null && (isAnswerMoot || isFailureStale || isKeptAskMoot)
      ? {
          ...pane,
          agent: {
            kind: 'isIdle',
          },
        }
      : pane;
  let paneUnpointed =
    paneSettled !== null && paneSettled.pointedAt !== null && !isSelectionSame
      ? {
          ...paneSettled,
          pointedAt: null,
        }
      : paneSettled;
  let isUnchanged = paneUnpointed === paneBefore && isSelectionSame && isWorkbookUnchanged;
  let isPaneClosedByAdding = paneAfter === null && areRulesAdded;
  let kept =
    pane !== null || paneBefore === null || isPaneClosedByAdding
      ? null
      : isPlainRulesMenu(paneBefore)
        ? state.rulesOfAgentKept
        : rulesOfAgentToKeep(state, paneBefore);
  let isKeptStillAsked = (kept?.stillAsked ?? null) !== null;
  let stateWithNotice =
    (paneBefore?.offer ?? null) !== null &&
    (paneAfter === null || paneAfter.offer !== null) &&
    (pane?.offer ?? null) === null &&
    !isPaneClosedByAdding &&
    state.lastDone === stateBefore.lastDone
      ? {
          ...state,
          lastDone: {
            what: 'offerDiscarded',
          },
        }
      : state;
  let stateWithChange =
    saveLeftTyping === null
      ? stateWithNotice
      : {
          ...stateWithNotice,
          changesAskedFor: stateWithNotice.changesAskedFor + 1,
        };
  let refreshed =
    paneUnpointed === null || isUnchanged
      ? null
      : refreshConditionalFormatsPane(stateWithChange, reads, paneUnpointed, isSelectionSame, isWorkbookUnchanged);
  let isMoreAskMoot =
    refreshed?.agent.kind === 'isAsked' &&
    refreshed.agent.about === 'moreSuggestions' &&
    (refreshed.forSelection === null || !isAgentAnswerForCells(reads, refreshed.sheetId, refreshed.agent, refreshed.forSelection));
  let paneDone =
    refreshed !== null && isMoreAskMoot
      ? {
          ...refreshed,
          agent: {
            kind: 'isIdle',
          },
        }
      : refreshed;
  let settled = {
    state:
      paneDone === null
        ? paneUnpointed === null && paneBefore !== null
          ? {
              ...stateWithChange,
              rulesOfAgentKept: kept,
            }
          : stateWithChange
        : withConditionalFormatsPane(stateWithChange, paneDone),
    effects: [
      ...((shouldStopAsking && !isKeptStillAsked) || isMoreAskMoot || isKeptAskMoot
        ? [
            {
              kind: 'stopAskingAgentAboutConditionalFormats',
            },
          ]
        : []),
      ...result.effects,
      ...(saveLeftTyping === null ? [] : [saveLeftTyping]),
      ...(pane !== null && pane.drawnAs !== 'menu' && (paneBefore?.drawnAs ?? 'menu') === 'menu'
        ? [
            {
              kind: 'checkAgentForConditionalFormats',
            },
          ]
        : []),
    ],
  };
  let paneNow = conditionalRulesOfPane(settled.state);
  if (
    (paneBefore !== null && (!isPlainRulesMenu(paneBefore) || areRulesAdded)) ||
    paneNow?.drawnAs === 'menu' ||
    (paneNow?.drawnAs === 'pane' && paneNow.shown.rules.length > 0) ||
    (paneNow !== null && isCardFarFromSelection(paneNow))
  )
    return settled;
  let withMoreAsked = askAgentForMoreSuggestions(settled.state, reads);
  return {
    ...withMoreAsked,
    effects: [...settled.effects, ...withMoreAsked.effects],
  };
}
export function followContextBarRulesCard(stateBefore?: Dynamic, result?: Dynamic, settleWith?: Dynamic) {
  let { state: state } = result;
  let isCardAsked = state.contextBarMenu === 'conditionalFormatting';
  let drawnAs = conditionalRulesOfPane(state)?.drawnAs;
  let isMenuGone = drawnAs === 'menu' && (state.menu?.holds !== 'all' || state.menu.at !== stateBefore.menu?.at);
  if (isCardAsked === (drawnAs === 'card') && !isMenuGone) return result;
  if (isCardAsked && !isMenuGone)
    return {
      ...result,
      state: {
        ...state,
        contextBarMenu: null,
      },
    };
  let settled = settleConditionalFormatsPane(state, withNoEffects(closeSidePane(state)), settleWith);
  return {
    state:
      state.lastDone === stateBefore.lastDone
        ? settled.state
        : {
            ...settled.state,
            lastDone: state.lastDone,
          },
    effects: [...result.effects, ...settled.effects],
  };
}
export function hasRulesPaneWorkInProgress(state: PageState) {
  let pane = conditionalRulesOfPane(state);
  return pane !== null && ((pane.editor?.typed ?? null) !== null || isAgentOfferPendingOrAsked(pane));
}
export function hasRulesPaneRefusedRules(state: PageState) {
  return (conditionalRulesOfPane(state)?.editor?.refused ?? []).length > 0;
}
export function conditionalFormatsGivenNow(state: PageState, reads: WorkbookReads) {
  let [pane, { sheetId: sheetId }] = [conditionalRulesOfPane(state), state];
  return (pane !== null && pane.sheetId === sheetId ? pane.previewed?.gives : null) ?? reads.formatsGivenIn(sheetId);
}
export function areasOfRuleBeingEdited(state: PageState, reads: WorkbookReads) {
  let [pane, { sheetId: sheetId }] = [conditionalRulesOfPane(state), state];
  if (pane === null || pane.editor === null || pane.sheetId !== sheetId) return [];
  let rule = pane.editor.typed?.rule ?? conditionalFormatRuleById(reads, sheetId, pane.editor.conditionalFormatId);
  return rule === null ? [] : areasOfRuleRanges(reads, sheetId, rule.ranges);
}
export const ACTIONS_IN_ANY_MENU = new (Set as Dynamic)(['keepOffer', 'discardOffer', 'stepBack', 'previewRested']);
export const ACTIONS_IN_PLAIN_MENU = new (Set as Dynamic)(['pointAtSuggestion', 'takeSuggestion', 'startRule', 'showInPane']);
export const isActionForMenu = ({ wordsOfMenu: wordsOfMenu }: Dynamic, { kind: kind }: Dynamic) =>
  ACTIONS_IN_ANY_MENU.has(kind) || (wordsOfMenu === null && ACTIONS_IN_PLAIN_MENU.has(kind));
export const isPreviewBehind = ({ tried: tried, previewed: previewed }: Dynamic) => tried.length > 0 && previewed?.asIf !== tried;
