import { Tooltip, TooltipGroup } from '../../kit/tooltip.tsx';
import { Button } from '../../kit/button.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import {
  CONDITIONAL_FORMATTING_WORDS,
  rulesReadyHint,
  wordsOfRuleEntry,
  ruleSummary,
  reorderRuleLabel,
  ruleListWhat,
  ruleWhereWords,
  removeRuleLabel,
  writtenByAgentUnsavedWords,
  rulesNotAppliedReason,
  addRulesLabel,
} from '../../messages/conditional-format.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { RuleSample, SeveralRulesSample } from './rule-samples.ts';
import { joinMessageParts } from '../../i18n/messages.ts';
import {
  CardRowTexts,
  wordsFadeUnderButtonProps,
  cardRowFrameProps,
  CARD_ROW_HOVER_CLASSES,
  cardRowButtonProps,
  cardRowEndButtonsProps,
  CardSectionHeading,
} from '../../ui/card-rows.ts';
import { REORDER_LIFT_PROPS, useReorderRows } from '../../ui/reorder-rows.ts';
import { useAnyCoarsePointer } from '../../app/media-queries.ts';
import { useFocusAskField, agentRowClassProps, AgentRowContent } from '../../agent/agent-rows.ts';
import { isAskTakenToChat, ruleNumberOfConditionalFormat, AskAgentAboutRuleSection } from './ask-agent-about-rule.ts';
import { revealInSidePane, focusPaneStart, useSidePaneCaret, SidePane, PANE_START_ATTRIBUTE } from '../../ui/side-pane/side-pane.ts';
import { NO_LIST_ANSWER_TIMES, isTooSoonAfterListAnswer, isWithinPressGuard } from '../../ui/list-under-cell.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
import { ConditionalRuleEditor } from './rule-editor.ts';
import { ContentsBox } from '../../ui/contents-box.ts';
import { RuleAskBox } from './ask-box.ts';
export function conditionalPaneStatusWords({ agent: agent, offer: offer, moreFromAgent: moreFromAgent }: Dynamic, paneState?: Dynamic) {
  if (agent === 'writes') return CONDITIONAL_FORMATTING_WORDS.writingRules();
  if (offer !== null) return rulesReadyHint(offer.each.length);
  if (agent === 'hasFailed') return paneState.isForChat ? null : CONDITIONAL_FORMATTING_WORDS.rulesNotWritten();
  if (!paneState.isMakingRule) return null;
  if (moreFromAgent === 'isLookedFor') return CONDITIONAL_FORMATTING_WORDS.agentLooksForMore();
  if (moreFromAgent === 'couldNotBeLookedFor') return CONDITIONAL_FORMATTING_WORDS.moreSuggestionsFailed();
  if (moreFromAgent === 'isNone') return CONDITIONAL_FORMATTING_WORDS.agentFoundNothingMore();
  return moreFromAgent === null && paneState.areSomeOfAgent && !paneState.isTyped ? CONDITIONAL_FORMATTING_WORDS.suggestedByAgent() : null;
}
export function ruleSuggestionEntry(suggestion?: Dynamic) {
  let { what: title, where: second } = wordsOfRuleEntry(suggestion.toSay);
  return {
    key: ruleSuggestionKey(suggestion),
    sample: jsx(RuleSample, {
      rules: suggestion.toSay,
    }),
    title: title,
    second: second,
  };
}
export function ConditionalRuleRow({
  rule: { conditionalFormatId: conditionalFormatId, toSay: rule },
  index: index,
  isAlone: isAlone,
  isOnTouch: isOnTouch,
  reorder: reorder,
  keysThatMoveSaidBy: keysThatMoveSaidBy,
  onAct: onAct,
  onRemoved: onRemoved,
}: Dynamic) {
  let { className: rowClassName, ...rowProps } = reorder.ofRow(conditionalFormatId, index);
  let ruleText = ruleSummary(rule);
  let hasCells = rule.cells !== '';
  let isMovable = !isAlone && hasCells;
  let editRule = () =>
    onAct({
      kind: 'editRule',
      conditionalFormatId: conditionalFormatId,
    });
  let removeRule = () =>
    reorder.gliding(
      (onDone?: Dynamic) =>
        onAct(
          {
            kind: 'removeRule',
            conditionalFormatId: conditionalFormatId,
          },
          onDone,
        ),
      (isRemoved?: Dynamic) => {
        if (isRemoved) onRemoved(index);
      },
    );
  let reorderHandle = jsx(Tooltip, {
    content: isOnTouch ? CONDITIONAL_FORMATTING_WORDS.dragToReorder() : CONDITIONAL_FORMATTING_WORDS.keysThatMoveRule(),
    ...(reorder.areTooltipsOfHandlesShut
      ? {
          open: false,
        }
      : {}),
    children: jsx(Button, {
      variant: 'ghost',
      ...(!isOnTouch && {
        size: 'xs',
      }),
      iconOnly: true,
      icon: jsx(Icon, {
        name: 'Reorder',
        size: 'xs',
      }),
      'aria-label': reorderRuleLabel(joinMessageParts(ruleText)),
      'aria-describedby': keysThatMoveSaidBy,
      tooltip: false,
      'data-handle-of': conditionalFormatId,
      ...reorder.ofHandle(conditionalFormatId, index),
    }),
  });
  let rowContent = jsxs(Fragment, {
    children: [
      jsx(RuleSample, {
        rules: {
          kind: 'one',
          rule: rule,
        },
      }),
      jsx(CardRowTexts, {
        title: ruleListWhat(rule),
        second: ruleWhereWords(rule),
        className: isOnTouch || !hasCells ? '' : wordsFadeUnderButtonProps.className,
      }),
    ],
  });
  return jsxs('li', {
    ...rowProps,
    className: `group/rule ${rowClassName}`,
    children: [
      jsx('span', {
        ...REORDER_LIFT_PROPS,
      }),
      jsx('div', {
        className: `group-data-reorder/rule:bg-transparent! ${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
        children: jsxs(TooltipGroup, {
          closeDelay: 0,
          children: [
            isOnTouch &&
              !isAlone &&
              jsx('span', {
                className: `-me-2 ms-1 flex items-center justify-center text-muted group-hover/rule:text-primary group-focus-within/rule:text-primary group-data-reorder/rule:text-primary ${RULE_HANDLE_SLOT_CLASSES.className}`,
                children: isMovable && reorderHandle,
              }),
            hasCells
              ? jsx('button', {
                  type: 'button',
                  'data-opens-rule': true,
                  ...cardRowButtonProps,
                  ...(isMovable &&
                    !isOnTouch && {
                      onPointerDown: (event?: Dynamic) => reorder.pressOnRowItself(event, conditionalFormatId, index),
                    }),
                  onClick: () => {
                    if (!reorder.isRowHeld) editRule();
                  },
                  children: rowContent,
                })
              : jsxs(Fragment, {
                  children: [
                    jsx('div', {
                      ...cardRowButtonProps,
                      children: rowContent,
                    }),
                    jsx(Button, {
                      variant: 'ghost',
                      size: 'xs',
                      'data-opens-rule': true,
                      onClick: () =>
                        onAct({
                          kind: 'useSelectionFor',
                          conditionalFormatId: conditionalFormatId,
                        }),
                      children: CONDITIONAL_FORMATTING_WORDS.takeSelection(),
                    }),
                  ],
                }),
            !isOnTouch &&
              isMovable &&
              jsx('span', {
                className:
                  'absolute start-1 top-1/2 -translate-y-1/2 rounded bg-surface-popover opacity-0 not-has-focus-visible:pointer-events-none has-focus-visible:opacity-100',
                children: reorderHandle,
              }),
            isOnTouch
              ? jsx(Button, {
                  variant: 'ghost',
                  iconOnly: true,
                  icon: 'Minus',
                  'aria-label': removeRuleLabel(joinMessageParts(ruleText)),
                  tooltip: CONDITIONAL_FORMATTING_WORDS.removeRule(),
                  className: 'text-secondary',
                  onClick: removeRule,
                })
              : jsx('span', {
                  className: `${cardRowEndButtonsProps.className} ${hasCells ? '' : 'static! opacity-100!'}`,
                  children: jsx(Button, {
                    variant: 'ghost',
                    iconOnly: true,
                    icon: 'Trash',
                    'aria-label': removeRuleLabel(joinMessageParts(ruleText)),
                    tooltip: CONDITIONAL_FORMATTING_WORDS.removeRule(),
                    className: 'text-secondary',
                    onClick: removeRule,
                  }),
                }),
          ],
        }),
      }),
    ],
  });
}
export const RULE_PREVIEW_REST_MS = 120;
export const RULE_HANDLE_SLOT_CLASSES = {
  className: 'w-9 flex-none',
  inRowWithNone: 'ps-10!',
};
export const ruleAskFieldWords = () => ({
  placeholder: CONDITIONAL_FORMATTING_WORDS.askAgentToMakeARule(),
  write: CONDITIONAL_FORMATTING_WORDS.writeRules(),
  writes: CONDITIONAL_FORMATTING_WORDS.writingRules(),
  stop: CONDITIONAL_FORMATTING_WORDS.stop(),
  hasFailed: CONDITIONAL_FORMATTING_WORDS.rulesNotWritten(),
  suggested: CONDITIONAL_FORMATTING_WORDS.suggested(),
  suggestedSaid: CONDITIONAL_FORMATTING_WORDS.suggestedByAgent(),
  askForMore: CONDITIONAL_FORMATTING_WORDS.askAgentForMore(),
  moreHasFailed: CONDITIONAL_FORMATTING_WORDS.moreSuggestionsFailed(),
  draftSaid: writtenByAgentUnsavedWords(),
});
export const ruleSuggestionKey = ({ rules: rules }: Dynamic) => JSON.stringify(rules);
export const offeredRuleEntry = (rule?: Dynamic, index?: Dynamic) => ({
  key: String(index),
  sample: jsx(RuleSample, {
    rules: {
      kind: 'one',
      rule: rule,
    },
  }),
  title: ruleListWhat(rule),
  second: ruleWhereWords(rule),
});
export const ConditionalFormattingPane = React.memo(function ({
  pane: pane,
  timesAsked: timesAsked,
  changesAskedFor: changesAskedFor,
  paneRef: paneRef,
  takesNoTyping: takesNoTyping,
  paneWidth: paneWidth,
  onPaneWidthChange: onPaneWidthChange,
  onKeyDownInPane: onKeyDownInPane,
  whatHasCaretAfter: whatHasCaretAfter,
  wasPointerPressedLast: wasPointerPressedLast,
  whatColorPickerShows: whatColorPickerShows,
  onAct: onAct,
  lookOnceEventsAreFinished: lookOnceEventsAreFinished,
  onPressed: onPressed,
  onShut: onShut,
  onAskAgent: onAskAgent,
  onAskedInChat: onAskedInChat,
}: Dynamic) {
  let paneShown = pane?.drawnAs === 'pane' ? pane : null;
  let isPaneOpen = paneShown !== null;
  let isOnTouch = useAnyCoarsePointer();
  let askFieldRef = React.useRef(null);
  let focusAskField = useFocusAskField(askFieldRef);
  let [typed, setTyped] = React.useState('');
  if (typed !== '' && (paneShown === null || paneShown.editor !== null || paneShown.agent === null)) setTyped('');
  let isForChat =
    paneShown !== null &&
    isAskTakenToChat(paneShown, {
      areWordsAsAsked: true,
      isChatToBeHad: onAskedInChat !== null,
    });
  let [isMakingNew, setIsMakingNew] = React.useState(false);
  if (isMakingNew && (paneShown === null || paneShown.editor !== null)) setIsMakingNew(false);
  let isMakingRule =
    isMakingNew ||
    (paneShown?.rules.length === 0 && !paneShown.isAskedForRules) ||
    typed.trim() !== '' ||
    (paneShown !== null && (paneShown.offer !== null || paneShown.agent === 'writes'));
  let rulesListRef = React.useRef(null);
  let backButtonRef = React.useRef(null);
  let agentRowsRef = React.useRef(null);
  let keysHintId = React.useId();
  let caretTargetRef = React.useRef(null);
  let isCaretInPane = () => {
    let paneDocument = paneRef.current?.ownerDocument;
    let activeElement = paneDocument?.activeElement ?? null;
    return activeElement === paneDocument?.body || paneRef.current?.contains(activeElement) === true;
  };
  let ruleIds = (paneShown?.rules ?? []).map(({ conditionalFormatId: conditionalFormatId }: Dynamic) => conditionalFormatId);
  let editedRuleIndex = ruleIds.findIndex((input?: Dynamic) => input === paneShown?.editor?.conditionalFormatId);
  let isEditorOpen = paneShown !== null && paneShown.editor !== null;
  let wasEditorOpenRef = React.useRef(isEditorOpen);
  let lastEditedRuleRef = React.useRef({
    at: 0,
    among: ruleIds,
  });
  let ruleOpenerAt = (ruleIndex?: Dynamic) =>
    [...(rulesListRef.current?.querySelectorAll('[data-opens-rule]') ?? [])].find(
      (input?: Dynamic, index?: Dynamic, openers?: Dynamic) => index === Math.min(ruleIndex, openers.length - 1),
    );
  React.useLayoutEffect(() => {
    if (isEditorOpen && editedRuleIndex >= 0)
      lastEditedRuleRef.current = {
        at: editedRuleIndex,
        among: ruleIds,
      };
    if (wasEditorOpenRef.current === isEditorOpen) return;
    wasEditorOpenRef.current = isEditorOpen;
    let { at: lastRuleAt, among: lastRuleIds } = lastEditedRuleRef.current;
    let areRulesKept = !isEditorOpen && ruleIds.every((input?: Dynamic) => lastRuleIds.includes(input));
    if (isPaneOpen && isCaretInPane() && paneRef.current?.ownerDocument.hasFocus() === true)
      caretTargetRef.current = areRulesKept
        ? {
            ruleAt: lastRuleAt,
          }
        : 'startOfView';
    else if (areRulesKept) {
      let opener = ruleOpenerAt(lastRuleAt);
      if (opener !== undefined) revealInSidePane(paneRef.current, opener, true);
    }
  });
  let wasMakingRuleRef = React.useRef(isMakingRule);
  let isSteppingBackRef = React.useRef(false);
  let isTakingAnswerRef = React.useRef(false);
  let [, forceRender] = React.useReducer((input?: Dynamic) => input + 1, 0);
  let answerTimesRef = React.useRef(NO_LIST_ANSWER_TIMES);
  let noteActTime = (timeMs?: Dynamic) => {
    answerTimesRef.current = {
      ...answerTimesRef.current,
      lastActAtMs: timeMs,
    };
  };
  let lastRemovedAtRef = React.useRef(-1 / 0);
  let isPressTooSoonRef = React.useRef(false);
  let isPressSwallowedRef = React.useRef(false);
  React.useLayoutEffect(() => {
    let [wasMakingRule, wasSteppingBack] = [wasMakingRuleRef.current, isSteppingBackRef.current];
    [wasMakingRuleRef.current, isSteppingBackRef.current] = [isMakingRule, false];
    if (wasMakingRule && !isMakingRule)
      answerTimesRef.current = {
        ...answerTimesRef.current,
        answerShownAtMs: performance.now(),
      };
    if (wasMakingRule === isMakingRule || isEditorOpen || !isPaneOpen) return;
    if (isMakingNew)
      focusPaneStart(paneRef.current, 'start', {
        isByPointer: wasPointerPressedLast(),
      });
    else if (isCaretInPane() && paneRef.current?.ownerDocument.hasFocus() === true)
      caretTargetRef.current =
        isMakingRule || wasSteppingBack
          ? 'startOfView'
          : isTakingAnswerRef.current
            ? null
            : {
                ruleAt: 0,
              };
    if (wasMakingRule && !isMakingRule && !isTakingAnswerRef.current)
      onAct({
        kind: 'pointAtSuggestion',
        rules: null,
      });
  });
  let isLookingForMore = paneShown?.moreFromAgent === 'isLookedFor';
  let wasLookingForMoreRef = React.useRef(isLookingForMore);
  React.useLayoutEffect(() => {
    if (wasLookingForMoreRef.current === isLookingForMore) return;
    wasLookingForMoreRef.current = isLookingForMore;
    let paneDocument = paneRef.current?.ownerDocument;
    let isCaretLost = paneDocument?.activeElement === paneDocument?.body && paneDocument?.hasFocus() === true;
    if (!isLookingForMore && isCaretLost && !wasPointerPressedLast()) caretTargetRef.current = 'firstOfAgent';
  });
  React.useLayoutEffect(() => {
    let caretTarget = caretTargetRef.current;
    caretTargetRef.current = null;
    if (caretTarget === null) return;
    if (wasPointerPressedLast() && !isCaretInPane()) return;
    if (caretTarget === 'startOfView') {
      let backButton = backButtonRef.current;
      if (backButton === null)
        focusPaneStart(paneRef.current, 'start', {
          isByPointer: wasPointerPressedLast(),
        });
      else
        backButton.focus({
          preventScroll: true,
          focusVisible: !wasPointerPressedLast(),
        });
      return;
    }
    let rulesList = rulesListRef.current;
    let target =
      caretTarget === 'firstOfAgent'
        ? (agentRowsRef.current?.querySelector('button') ?? undefined)
        : 'handleOf' in caretTarget
          ? [...(rulesList?.querySelectorAll('[data-handle-of]') ?? [])].find(
              (handle?: Dynamic) => handle.dataset.handleOf === caretTarget.handleOf,
            )
          : ruleOpenerAt(caretTarget.ruleAt);
    if (target === undefined) {
      focusPaneStart(paneRef.current, 'start', {
        isByPointer: wasPointerPressedLast(),
      });
      return;
    }
    target.focus({
      preventScroll: true,
      focusVisible: !wasPointerPressedLast(),
    });
    revealInSidePane(paneRef.current, target, true);
  });
  let endPressGuard = () => {
    isPressSwallowedRef.current = false;
  };
  let pressGuardHandlers = (isAnswerShown?: Dynamic) => ({
    onPointerDownCapture: (event?: Dynamic) => {
      isPressTooSoonRef.current = (isAnswerShown && isTakingAnswerRef.current) || isTooSoonAfterListAnswer(answerTimesRef.current, event.timeStamp);
      isPressSwallowedRef.current = isPressTooSoonRef.current || isWithinPressGuard(lastRemovedAtRef.current, event.timeStamp);
      if (isPressSwallowedRef.current) event.stopPropagation();
      if (isPressTooSoonRef.current) noteActTime(event.timeStamp);
    },
    onPointerUpCapture: (event?: Dynamic) => {
      if (event.button !== 0) endPressGuard();
    },
    onPointerCancelCapture: endPressGuard,
    onKeyDownCapture: endPressGuard,
    onMouseDownCapture: (event?: Dynamic) => {
      if (isPressSwallowedRef.current) event.preventDefault();
    },
    onClickCapture: (event?: Dynamic) => {
      if (isPressSwallowedRef.current) {
        event.stopPropagation();
        if (isPressTooSoonRef.current) noteActTime(event.timeStamp);
        onPressed();
      }
      isPressSwallowedRef.current = false;
    },
  });
  let reorder = useReorderRows({
    listRef: rulesListRef,
    keys: (paneShown?.rules ?? []).map(({ conditionalFormatId: conditionalFormatId }: Dynamic) => conditionalFormatId),
    onMoved: (conditionalFormatId?: Dynamic, toIndex?: Dynamic, onDone?: Dynamic) =>
      onAct(
        {
          kind: 'moveRule',
          conditionalFormatId: conditionalFormatId,
          toIndex: toIndex,
        },
        (isMoved?: Dynamic) => {
          if (isMoved)
            caretTargetRef.current =
              wasPointerPressedLast() && !isOnTouch
                ? {
                    ruleAt: toIndex,
                  }
                : {
                    handleOf: conditionalFormatId,
                  };
          onDone(isMoved);
        },
      ),
    onDragEnded: onPressed,
    isRowPutBackPressed: false,
  });
  useSidePaneCaret({
    isOpen: isPaneOpen,
    isOpenInAnotherForm: pane !== null && !isPaneOpen,
    timesAsked: timesAsked,
    paneRef: paneRef,
    putCaretWhereToStart: () =>
      void focusPaneStart(paneRef.current, 'start', {
        isByPointer: wasPointerPressedLast(),
      }),
    whatHasCaretAfter: whatHasCaretAfter,
  });
  let previewAwaited = pane?.previewAwaited ?? null;
  React.useEffect(() => {
    if (previewAwaited === null) return;
    let timer = setTimeout(
      () =>
        onAct({
          kind: 'previewRested',
        }),
      RULE_PREVIEW_REST_MS,
    );
    return () => clearTimeout(timer);
  }, [previewAwaited, onAct]);
  if (paneShown === null) return null;
  let { moreFromAgent: moreFromAgent, editor: editor, suggestions: suggestions, rules: rules } = paneShown;
  let paneFrameProps = {
    ref: paneRef,
    takesNoTyping: takesNoTyping,
    width: paneWidth,
    onWidthChange: onPaneWidthChange,
    onClose: onShut,
    onKeyDown: onKeyDownInPane,
    onPressed: onPressed,
    wasPointerPressedLast: wasPointerPressedLast,
  };
  let ownSuggestions = suggestions.filter(({ isFromAgent: isFromAgent }: Dynamic) => !isFromAgent);
  let agentSuggestions = suggestions.filter(({ isFromAgent: isFromAgent }: Dynamic) => isFromAgent);
  let statusAnnouncer = jsx(LiveAnnouncer, {
    words: conditionalPaneStatusWords(paneShown, {
      isMakingRule: isMakingRule,
      isTyped: typed.trim() !== '',
      areSomeOfAgent: agentSuggestions.length > 0,
      isForChat: isForChat,
    }),
  });
  let editedRule = editor === null ? null : ruleNumberOfConditionalFormat(rules, editor.conditionalFormatId);
  if (editor !== null)
    return jsxs(SidePane, {
      ...paneFrameProps,
      title: CONDITIONAL_FORMATTING_WORDS.editRule(),
      beforeTitle: jsx(Button, {
        ref: backButtonRef,
        variant: 'ghost',
        iconOnly: true,
        icon: jsx(Icon, {
          name: 'ArrowLeft',
          size: 'sm',
        }),
        'aria-label': CONDITIONAL_FORMATTING_WORDS.backToAllRules(),
        className: 'text-secondary',
        ...{
          [PANE_START_ATTRIBUTE]: true,
        },
        onClick: () =>
          onAct({
            kind: 'leaveEditor',
          }),
      }),
      view: 'editor',
      actions: jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: jsx(Icon, {
          name: 'Trash',
          size: 'sm',
        }),
        'aria-label': CONDITIONAL_FORMATTING_WORDS.removeRule(),
        className: 'text-secondary',
        onClick: () =>
          onAct({
            kind: 'removeRule',
            conditionalFormatId: editor.conditionalFormatId,
          }),
      }),
      children: [
        jsx('div', {
          className: 'contents [--sheet-pane-gutter:var(--ui-pad-lg)]',
          children: jsx(ConditionalRuleEditor, {
            editor: editor,
            whatColorPickerShows: whatColorPickerShows,
            onAct: onAct,
          }),
        }),
        statusAnnouncer,
        onAskAgent !== null &&
          editedRule !== null &&
          jsx(
            AskAgentAboutRuleSection,
            {
              rule: editedRule,
              onAskAgent: onAskAgent,
            },
            editor.conditionalFormatId,
          ),
      ],
    });
  if (!isMakingRule)
    return jsxs(SidePane, {
      ...paneFrameProps,
      title: CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
      view: 'list',
      children: [
        jsxs(ContentsBox, {
          ...pressGuardHandlers(false),
          onKeyDownCapture: (event?: Dynamic) => {
            endPressGuard();
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (!isTooSoonAfterListAnswer(answerTimesRef.current, event.timeStamp)) return;
            event.preventDefault();
            event.stopPropagation();
            noteActTime(event.timeStamp);
          },
          children: [
            jsx('div', {
              className: 'flex min-w-0 shrink-0 flex-col pt-md',
              children: jsx('div', {
                className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
                children: jsx('button', {
                  type: 'button',
                  className: agentRowClassProps.className,
                  ...{
                    [PANE_START_ATTRIBUTE]: true,
                  },
                  onClick: () => {
                    setIsMakingNew(true);
                    onAct({
                      kind: 'askForMoreSuggestions',
                    });
                  },
                  children: jsx(AgentRowContent, {
                    icon: jsx(Icon, {
                      name: 'Add',
                      size: 'md',
                    }),
                    children: CONDITIONAL_FORMATTING_WORDS.createRule(),
                  }),
                }),
              }),
            }),
            jsxs('section', {
              className: 'flex min-w-0 shrink-0 flex-col pb-2',
              children: [
                rules.length > 0 &&
                  jsx(CardSectionHeading, {
                    children: CONDITIONAL_FORMATTING_WORDS.rules(),
                  }),
                paneShown.notWorkedOut !== null &&
                  jsx('output', {
                    className: 'block pb-1 ps-lg pe-md text-footnote text-secondary',
                    children: rulesNotAppliedReason(paneShown.notWorkedOut),
                  }),
                jsx('ul', {
                  ref: rulesListRef,
                  className: 'flex flex-col',
                  children: rules.map(
                    (rule?: Dynamic, index?: Dynamic) =>
                      jsx(
                        ConditionalRuleRow,
                        {
                          rule: rule,
                          index: index,
                          isAlone: rules.length === 1,
                          isOnTouch: isOnTouch,
                          reorder: reorder,
                          keysThatMoveSaidBy: keysHintId,
                          onAct: onAct,
                          onRemoved: (input?: Dynamic) => {
                            caretTargetRef.current = {
                              ruleAt: input,
                            };
                            lastRemovedAtRef.current = performance.now();
                          },
                        },
                        rule.conditionalFormatId,
                      ),
                  ),
                }),
                jsx('span', {
                  id: keysHintId,
                  hidden: true,
                  children: CONDITIONAL_FORMATTING_WORDS.keysThatMoveRule(),
                }),
              ],
            }),
          ],
        }),
        statusAnnouncer,
      ],
    });
  let rulesOfSuggestionKey = (suggestionKey?: Dynamic) =>
    suggestions.find((suggestion?: Dynamic) => ruleSuggestionKey(suggestion) === suggestionKey)?.rules ?? null;
  let answerOffer = (kind?: Dynamic) => {
    focusAskField();
    if (kind === 'keepOffer')
      takeAnswer({
        kind: kind,
      });
    else
      onAct({
        kind: kind,
      });
  };
  let [firstOffered, ...otherOffered] = paneShown.offer?.each ?? [];
  let draft =
    paneShown.offer === null || firstOffered === undefined
      ? null
      : otherOffered.length === 0
        ? {
            toTake: offeredRuleEntry(firstOffered, 0),
            shown: [],
          }
        : {
            toTake: {
              key: 'all',
              sample: jsx(SeveralRulesSample, {
                rules: paneShown.offer.each,
              }),
              title: [addRulesLabel(paneShown.offer.each.length)],
            },
            shown: paneShown.offer.each.map(offeredRuleEntry),
          };
  let hasRulesOrAsked = rules.length > 0 || paneShown.isAskedForRules;
  let clearAskField = () => {
    setTyped('');
    setIsMakingNew(false);
  };
  let takeAnswer = (answer?: Dynamic) => {
    isTakingAnswerRef.current = true;
    let nowMs2 = performance.now();
    answerTimesRef.current = {
      answerShownAtMs: nowMs2,
      lastActAtMs: nowMs2,
    };
    clearAskField();
    onAct(answer);
    lookOnceEventsAreFinished(() => {
      isTakingAnswerRef.current = false;
      answerTimesRef.current = {
        ...answerTimesRef.current,
        answerShownAtMs: performance.now(),
      };
      if (isCaretInPane() && paneRef.current?.ownerDocument.hasFocus() === true)
        caretTargetRef.current = {
          ruleAt: 0,
        };
      forceRender();
    });
  };
  return jsxs(SidePane, {
    ...paneFrameProps,
    title: hasRulesOrAsked ? CONDITIONAL_FORMATTING_WORDS.createRule() : CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
    view: 'newRule',
    ...(hasRulesOrAsked && {
      beforeTitle: jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: jsx(Icon, {
          name: 'ArrowLeft',
          size: 'sm',
        }),
        'aria-label': CONDITIONAL_FORMATTING_WORDS.backToAllRules(),
        className: 'text-secondary',
        onClick: () => {
          isSteppingBackRef.current = true;
          if (paneShown.doesEscapeStepBack)
            onAct({
              kind: 'stepBack',
            });
          onAct({
            kind: 'pointAtSuggestion',
            rules: null,
          });
          clearAskField();
        },
      }),
    }),
    children: [
      jsx(RuleAskBox, {
        words: ruleAskFieldWords(),
        typed: typed,
        onTyped: setTyped,
        changesAskedFor: changesAskedFor,
        fieldRef: askFieldRef,
        markOfStart: {
          [PANE_START_ATTRIBUTE]: true,
        },
        agent: paneShown.agent,
        draft: draft,
        ofAgent: agentSuggestions.map(ruleSuggestionEntry),
        moreOfAgent:
          moreFromAgent === null || moreFromAgent === 'isNone'
            ? null
            : moreFromAgent === 'isLookedFor'
              ? 'isLookedFor'
              : moreFromAgent === 'couldNotBeLookedFor'
                ? 'hasFailed'
                : 'canBeAsked',
        own: ownSuggestions.map(ruleSuggestionEntry),
        ofAgentRef: agentRowsRef,
        chatInstead:
          isForChat && onAskedInChat !== null
            ? {
                whyNotHere: CONDITIONAL_FORMATTING_WORDS.rulesAloneCantDoIt(),
                goThere: CONDITIONAL_FORMATTING_WORDS.goToChatForRules(),
                onAsked: (words?: Dynamic) =>
                  void onAskedInChat(words).then((isAdded?: Dynamic) => {
                    if (isAdded) setTyped((typedNow?: Dynamic) => (typedNow === typed ? '' : typedNow));
                    return;
                  }),
              }
            : null,
        onAsked: (input?: Dynamic) =>
          onAct({
            kind: 'askAgent',
            words: input,
            canChatTakeIt: onAskedInChat !== null,
          }),
        onStopped: () =>
          onAct({
            kind: 'stepBack',
          }),
        onKept: () => answerOffer('keepOffer'),
        onDiscarded: () => answerOffer('discardOffer'),
        kindsToSetUp: [
          {
            key: 'formatWhere',
            icon: 'TextHighlight',
            label: CONDITIONAL_FORMATTING_WORDS.addHighlightRule(),
          },
          {
            key: 'colorScale',
            icon: 'ColorScale',
            label: CONDITIONAL_FORMATTING_WORDS.addColorScaleRule(),
          },
        ],
        onKindSetUp: (input?: Dynamic) =>
          onAct({
            kind: 'startRule',
            effect: input === 'colorScale' ? 'colorScale' : 'formatWhere',
          }),
        onPointedAt: (input?: Dynamic) =>
          onAct({
            kind: 'pointAtSuggestion',
            rules: input === null ? null : rulesOfSuggestionKey(input),
          }),
        onTaken: (input?: Dynamic) => {
          let value = rulesOfSuggestionKey(input);
          if (value !== null)
            takeAnswer({
              kind: 'takeSuggestion',
              rules: value,
            });
        },
        onAskedForMore: () =>
          onAct({
            kind: 'askForMoreSuggestions',
          }),
        deafToPointer: pressGuardHandlers(true),
      }),
      statusAnnouncer,
    ],
  });
});
