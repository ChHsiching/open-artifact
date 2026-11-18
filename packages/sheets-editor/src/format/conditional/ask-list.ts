import { ContextMenu } from '../../kit/context-menu.tsx';
import { AgentMark } from '../../kit/agent-mark.tsx';
import { Tooltip } from '../../kit/tooltip.tsx';
import { Icon } from '../../kit/icon.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import {
  wordsOfRuleEntry,
  joinWithCommas,
  ruleSummary,
  addRulesLabel,
  joinWithDots,
  CONDITIONAL_FORMATTING_WORDS,
  rulesReadyHint,
  moreSuggestionsWords,
  notARuleHint,
  ruleReadingHint,
  ruleListWhat,
  ruleWhereWords,
  ruleCountBadgeLabel,
} from '../../messages/conditional-format.ts';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { RuleSample, SeveralRulesSample } from './rule-samples.ts';
import { WordsWithColumnNames } from '../../ui/card-rows.ts';
import { joinMessageParts } from '../../i18n/messages.ts';
import { DrawnAndSaid, AgentWritingRow } from '../../agent/agent-rows.ts';
import { goToChatInsteadWords, GoToChatInstead } from './ask-box.ts';
import { isAskTakenToChat } from './ask-agent-about-rule.ts';
import { AskOrPickList } from '../../ui/ask-list/ask-or-pick-list.ts';
import { isoDayOfDate } from '../../chips/calendar.ts';
import { TypedSearchAnnouncer } from '../../ui/search-announcer.ts';
import { SIDE_PANE_DEFAULT_WIDTH } from '../../ui/side-pane/side-pane.ts';
export function conditionalAskListHeight(rowCount?: Dynamic, extraPx: Dynamic = 0) {
  let height = `calc(3.625rem + ${Math.min(rowCount, MOST_ASK_LIST_ROWS)} * max(var(--ui-h-control), 1.75rem))`;
  return extraPx === 0 ? height : `min(calc(${height} + ${extraPx}px), ${conditionalAskListHeight(MOST_ASK_LIST_ROWS)})`;
}
export function askListRowAction(rowId?: Dynamic, suggestions?: Dynamic) {
  if (rowId === WRITE_RULE_ROW_ID) return 'ask';
  if (rowId === READ_AT_ONCE_ROW_ID) return 'takeRead';
  if (rowId === ANSWER_ROW_ID)
    return {
      kind: 'keepOffer',
    };
  if (isReadyRowId(rowId)) return READY_ROW_ACTIONS[rowId];
  let rules = rulesOfSuggestionRow(rowId, suggestions);
  return rules === null
    ? null
    : {
        kind: 'takeSuggestion',
        rules: rules,
      };
}
export function suggestionRow(suggestion?: Dynamic, easesIn: Dynamic = false) {
  let { what: what, cells: cells } = wordsOfRuleEntry(suggestion.toSay);
  return {
    id: suggestionRowId(suggestion),
    easesIn: easesIn,
    isOfAgent: suggestion.isFromAgent,
    mark: jsx(RuleSample, {
      rules: suggestion.toSay,
      isSwatch: true,
    }),
    drawn: jsx(WordsWithColumnNames, {
      words: what,
    }),
    atEnd: jsx('span', {
      className: 'block max-w-28 truncate',
      children: cells,
    }),
    inFull: joinWithCommas([joinMessageParts(what), cells]),
  };
}
export function OfferedRuleLine({ rule: rule }: Dynamic) {
  let words = ruleSummary(rule);
  let wordsRef = React.useRef(null);
  let [isTooltipOpen, setIsTooltipOpen] = React.useState(false);
  return jsx(Tooltip, {
    content: joinMessageParts(words),
    side: 'inline-end',
    sideOffset: 10,
    collisionAvoidance: {
      fallbackAxisSide: 'none',
    },
    hoverable: false,
    open: isTooltipOpen,
    children: jsxs('span', {
      className: 'flex min-h-control items-center gap-2 py-1',
      onPointerEnter: () => {
        let { scrollWidth = 0, clientWidth = 0 } = wordsRef.current ?? {};
        setIsTooltipOpen(scrollWidth > clientWidth);
      },
      onPointerLeave: () => setIsTooltipOpen(false),
      children: [
        jsx(RuleSample, {
          rules: {
            kind: 'one',
            rule: rule,
          },
          isSwatch: true,
        }),
        jsx('span', {
          ref: wordsRef,
          className: 'min-w-0 flex-1 truncate touch:whitespace-normal',
          children: jsx(WordsWithColumnNames, {
            words: words,
          }),
        }),
      ],
    }),
  });
}
export function offerRow({ toSay: toSay, each: each }: Dynamic, rowId: Dynamic = ANSWER_ROW_ID) {
  let { what: what, where: where } = wordsOfRuleEntry(toSay);
  if (toSay.kind === 'several')
    return {
      id: rowId,
      mark: jsx(SeveralRulesSample, {
        rules: each,
        isSwatch: true,
      }),
      drawn: jsx(DrawnAndSaid, {
        drawn: addRulesLabel(each.length),
        said: joinWithDots([addRulesLabel(each.length), ...each.map((input?: Dynamic) => joinMessageParts(ruleSummary(input)))]),
      }),
    };
  return {
    id: rowId,
    mark: jsx('span', {
      className: 'flex self-start',
      children: jsx(RuleSample, {
        rules: toSay,
        isSwatch: true,
      }),
    }),
    laysItselfOut: true,
    drawn: jsxs('span', {
      className: 'flex min-w-0 flex-1 flex-col',
      children: [
        jsx('span', {
          className: 'line-clamp-2 min-w-0 wrap-anywhere',
          children: jsx(WordsWithColumnNames, {
            words: what,
          }),
        }),
        jsx('span', {
          className: 'truncate text-footnote text-muted',
          children: where,
        }),
      ],
    }),
    inFull: joinWithCommas([joinMessageParts(what), where]),
  };
}
export function RuleOfferMenuItem(props?: Dynamic) {
  let { offer: offer, isUnderEnter: isUnderEnter, onKept: onKept } = props;
  let { mark: mark, drawn: drawn } = offerRow(offer);
  return jsxs(Fragment, {
    children: [
      jsx(ContextMenu.Item, {
        icon: jsx(Fragment, {
          children: mark,
        }),
        ...(isUnderEnter && {
          className: 'sheet-row-under-enter',
        }),
        onClick: onKept,
        children: jsx('span', {
          className: 'block w-0 min-w-full whitespace-normal',
          children: drawn,
        }),
      }),
      offer.toSay.kind === 'several' &&
        jsx('span', {
          'aria-hidden': true,
          className: 'flex flex-col px-md text-body text-primary',
          children: offer.each.map(
            (input?: Dynamic, options?: Dynamic) =>
              jsx(
                OfferedRuleLine,
                {
                  rule: input,
                },
                options,
              ),
          ),
        }),
    ],
  });
}
export function moreFromAgentWords(moreFromAgent?: Dynamic) {
  if (moreFromAgent === 'isLookedFor') return CONDITIONAL_FORMATTING_WORDS.agentLooksForMore();
  if (moreFromAgent === 'couldNotBeLookedFor') return CONDITIONAL_FORMATTING_WORDS.agentCouldNotLookForMore();
  return moreFromAgent === 'isNone' ? CONDITIONAL_FORMATTING_WORDS.agentFoundNothingMore() : null;
}
export function askListStatusWords(
  { agent: agent, offer: offer, moreFromAgent: moreFromAgent }: Dynamic,
  { hasFailed: hasFailed, isForChat: isForChat, countOfAgents: countOfAgents }: Dynamic,
) {
  if (agent === 'writes') return CONDITIONAL_FORMATTING_WORDS.writingRules();
  if (offer !== null) return rulesReadyHint(offer.each.length);
  if (hasFailed) return isForChat ? goToChatInsteadWords(chatInsteadForRules()) : CONDITIONAL_FORMATTING_WORDS.rulesNotWritten();
  return moreFromAgentWords(moreFromAgent) ?? (countOfAgents > 0 ? moreSuggestionsWords(countOfAgents) : null);
}
export function foundRuleWords(rule?: Dynamic, isNotComposing?: Dynamic) {
  if (rule === null) return isNotComposing && notARuleHint();
  return isNotComposing ? ruleReadingHint(rule) : joinWithCommas([joinMessageParts(ruleListWhat(rule)), ruleWhereWords(rule)]);
}
export function ConditionalAskCard({ pane: pane, onAct: onAct, onAskedInChat: onAskedInChat }: Dynamic) {
  let [typed, setTyped] = React.useState('');
  let [askedWords, setAskedWords] = React.useState(null);
  let [hasAsked, setHasAsked] = React.useState(false);
  let [pointedRowId, setPointedRowId] = React.useState(null);
  let pointedRulesRef = React.useRef(null);
  let stands = pane.agent === 'writes' ? 'whileAgentWrites' : 'atRest';
  let hasOffer = pane.offer !== null;
  let isTyped = typed.trim() !== '';
  let readAtOnce = isTyped ? pane.readAtOnce : null;
  let restTimerRef = React.useRef(undefined);
  React.useEffect(() => () => clearTimeout(restTimerRef.current), []);
  let readAtOnceWords = readAtOnce === null ? null : wordsOfRuleEntry(readAtOnce.toSay);
  let hasFailedForTyped = pane.agent === 'hasFailed' && askedWords === typed;
  let isForChat =
    readAtOnce === null &&
    isAskTakenToChat(pane, {
      areWordsAsAsked: askedWords === typed,
      isChatToBeHad: onAskedInChat !== null,
    });
  let suggestionsShown = hasFailedForTyped ? [] : pane.suggestions.slice(0, MAX_SUGGESTIONS_SHOWN);
  let [suggestionIdsAtOpen, setSuggestionIdsAtOpen] = React.useState(() => suggestionsShown.map(suggestionRowId));
  let [rowsAtOpen] = React.useState(() => askListRowsAtOpen(suggestionsShown.length, pane.moreFromAgent === 'isLookedFor'));
  let cardRef = React.useRef(null);
  let [extraHeight, setExtraHeight] = React.useState(0);
  let isAnswerShown = hasFailedForTyped || pane.offer !== null || (readAtOnceWords !== null && joinMessageParts(readAtOnceWords.what));
  React.useLayoutEffect(() => {
    let listbox = cardRef.current?.querySelector('[role="listbox"]') ?? null;
    if (isAnswerShown === false || listbox === null) return;
    let overflow = listbox.scrollHeight - listbox.clientHeight;
    if (overflow > 0) setExtraHeight((input?: Dynamic) => input + overflow + ROWS_ADDED_WITH_MORE);
  }, [isAnswerShown]);
  let wasShownAtOpen = (input?: Dynamic) => !input.isFromAgent || isTyped || suggestionIdsAtOpen.includes(suggestionRowId(input));
  if (isTyped && !suggestionsShown.every((input?: Dynamic) => suggestionIdsAtOpen.includes(suggestionRowId(input))))
    setSuggestionIdsAtOpen(suggestionsShown.map(suggestionRowId));
  let isLookingForMore = pane.moreFromAgent === 'isLookedFor';
  let showsKinds = !isTyped && suggestionsShown.length === 0;
  let ruleCount = pane.rules.length;
  let firstRowId = hasOffer ? ANSWER_ROW_ID : readAtOnce !== null ? READ_AT_ONCE_ROW_ID : WRITE_RULE_ROW_ID;
  let writeRow = {
    id: WRITE_RULE_ROW_ID,
    mark: inMarkColumn(
      jsx(AgentMark, {
        size: 14,
      }),
    ),
    drawn: CONDITIONAL_FORMATTING_WORDS.writeRules(),
  };
  let highlightRow = askListRow(
    'highlight',
    jsx(Icon, {
      name: 'TextHighlight',
      size: 'md',
    }),
    CONDITIONAL_FORMATTING_WORDS.addHighlightRule(),
  );
  let sections = [
    ...(pane.offer === null
      ? []
      : [
          {
            id: 'answer',
            heading: null,
            rows: [offerRow(pane.offer)],
          },
          ...(pane.offer.toSay.kind === 'several'
            ? [
                {
                  id: 'added',
                  heading: jsx('span', {
                    'aria-hidden': true,
                    className: '-mt-2 -mb-1 flex flex-col text-body font-normal text-primary',
                    children: pane.offer.each.map(
                      (input?: Dynamic, options?: Dynamic) =>
                        jsx(
                          OfferedRuleLine,
                          {
                            rule: input,
                          },
                          options,
                        ),
                    ),
                  }),
                  rows: [],
                },
              ]
            : []),
        ]),
    ...(pane.offer !== null || readAtOnce === null
      ? []
      : [
          {
            id: 'readAtOnce',
            heading: null,
            rows: [offerRow(readAtOnce, READ_AT_ONCE_ROW_ID)],
          },
          {
            id: 'write',
            heading: null,
            rows: [writeRow],
          },
        ]),
    ...(pane.offer === null && readAtOnce === null && !isForChat && (isTyped || suggestionsShown.length > 0)
      ? [
          {
            id: 'suggested',
            heading: isTyped
              ? null
              : jsx('span', {
                  className: 'flex h-4 items-center',
                  children: CONDITIONAL_FORMATTING_WORDS.suggested(),
                }),
            rows: isTyped ? [writeRow] : [],
            lateRows: suggestionsShown
              .slice(0, 1)
              .filter((input?: Dynamic) => !wasShownAtOpen(input))
              .map((input?: Dynamic) => suggestionRow(input)),
            rowsUnderLateRows: suggestionsShown
              .filter((input?: Dynamic, options?: Dynamic) => options > 0 || wasShownAtOpen(input))
              .map((input?: Dynamic) => suggestionRow(input, !wasShownAtOpen(input))),
          },
        ]
      : []),
    ...(showsKinds
      ? [
          {
            id: 'kinds',
            heading: null,
            rows: [
              highlightRow,
              {
                ...askListRow(
                  'colorScale',
                  jsx(Icon, {
                    name: 'ColorScale',
                    size: 'md',
                  }),
                  CONDITIONAL_FORMATTING_WORDS.addColorScaleRule(),
                ),
                isOutOfUse: pane.about === null,
              },
            ],
          },
        ]
      : []),
    {
      id: 'always',
      heading: null,
      rows: [
        ...(showsKinds
          ? []
          : [
              askListRow(
                'highlight',
                jsx(Icon, {
                  name: 'Add',
                  size: 'md',
                }),
                CONDITIONAL_FORMATTING_WORDS.createRule(),
              ),
            ]),
        {
          ...askListRow(
            'showRules',
            jsx(Icon, {
              name: 'ConditionalFormat',
              size: 'md',
            }),
            CONDITIONAL_FORMATTING_WORDS.showRules(),
          ),
          ...(ruleCount > 0 && {
            atEnd: jsx(DrawnAndSaid, {
              drawn: String(ruleCount),
              said: ruleCountBadgeLabel(ruleCount),
            }),
          }),
        },
      ],
    },
  ];
  let askAgent = () => {
    setAskedWords(typed);
    setHasAsked(true);
    onAct({
      kind: 'askAgent',
      words: typed,
      canChatTakeIt: onAskedInChat !== null,
    });
  };
  let askInChat = () => void onAskedInChat?.(typed);
  let stepBack = () =>
    onAct({
      kind: 'stepBack',
    });
  let askList = jsx(AskOrPickList, {
    nameOfField: CONDITIONAL_FORMATTING_WORDS.askAgentToMakeARule(),
    nameOfList: CONDITIONAL_FORMATTING_WORDS.waysToAddARule(),
    placeholder: CONDITIONAL_FORMATTING_WORDS.askAgentToMakeARule(),
    text: typed,
    stands: stands,
    hasAnswer: hasOffer,
    isAgentAtWork: stands === 'whileAgentWrites' || isLookingForMore,
    said: askListStatusWords(pane, {
      hasFailed: hasFailedForTyped,
      isForChat: isForChat,
      countOfAgents: isTyped ? 0 : suggestionsShown.filter(({ isFromAgent: isFromAgent }: Dynamic) => isFromAgent).length,
    }),
    note: hasFailedForTyped
      ? jsx('div', {
          className: 'px-md py-1 text-footnote text-secondary',
          children: isForChat
            ? jsx(GoToChatInstead, {
                ...chatInsteadForRules(),
                onTaken: askInChat,
              })
            : CONDITIONAL_FORMATTING_WORDS.rulesNotWritten(),
        })
      : null,
    sections: sections,
    ...(stands === 'whileAgentWrites' && {
      inPlaceOfList: jsx(AgentWritingRow, {
        words: {
          writes: CONDITIONAL_FORMATTING_WORDS.writingRules(),
          stop: CONDITIONAL_FORMATTING_WORDS.stop(),
        },
        isAmongRowsOfList: true,
        onStopped: stepBack,
      }),
    }),
    doesFirstRowAnswer: isTyped && !isForChat,
    foot: null,
    wordsOfFoot: {
      keep: CONDITIONAL_FORMATTING_WORDS.keep(),
      discard: CONDITIONAL_FORMATTING_WORDS.discard(),
      stop: CONDITIONAL_FORMATTING_WORDS.stop(),
    },
    height: conditionalAskListHeight(rowsAtOpen, extraHeight),
    width: CONDITIONAL_ASK_LIST_WIDTH,
    onTextChange: (text?: Dynamic) => {
      if (hasOffer && text !== typed)
        onAct({
          kind: 'discardOffer',
        });
      setTyped(text);
      setHasAsked(false);
      onAct({
        kind: 'typeWords',
        words: text,
        today: isoDayOfDate(new (Date as Dynamic)()),
      });
      clearTimeout(restTimerRef.current);
      restTimerRef.current = setTimeout(
        () =>
          onAct({
            kind: 'restAfterWords',
            words: text,
          }),
        REST_AFTER_WORDS_MS,
      );
    },
    onRowPointedAt: (rowId?: Dynamic) => {
      setPointedRowId(rowId);
      let rules = rulesOfSuggestionRow(rowId, pane.suggestions);
      if (rules === pointedRulesRef.current) return;
      pointedRulesRef.current = rules;
      onAct({
        kind: 'pointAtSuggestion',
        rules: rules,
      });
    },
    onRowTaken: (rowId?: Dynamic) => {
      let action = askListRowAction(rowId, pane.suggestions);
      if (action === 'ask') return askAgent();
      if (action === 'takeRead') {
        setAskedWords(typed);
        setHasAsked(true);
        return onAct({
          kind: 'takeReadAtOnce',
          words: typed,
          today: isoDayOfDate(new (Date as Dynamic)()),
          canChatTakeIt: onAskedInChat !== null,
        });
      }
      if (action === null) return;
      if (hasOffer && action.kind !== 'keepOffer' && action.kind !== 'startRule')
        onAct({
          kind: 'discardOffer',
        });
      return onAct(action);
    },
    onEntered: isForChat ? askInChat : askAgent,
    onKept: () =>
      onAct({
        kind: 'keepOffer',
      }),
    onSteppedBack: stepBack,
  });
  return jsxs('div', {
    ref: cardRef,
    className: 'contents',
    children: [
      askList,
      jsx(TypedSearchAnnouncer, {
        typed: typed,
        found: (isNotComposing?: Dynamic) => {
          let isOtherRowPointed = pointedRowId !== null && pointedRowId !== firstRowId;
          if (!isTyped || stands !== 'atRest' || hasOffer || (hasFailedForTyped && readAtOnce === null)) return false;
          if ((hasAsked && readAtOnce === null) || isOtherRowPointed) return false;
          return foundRuleWords(readAtOnce?.each[0] ?? null, isNotComposing);
        },
      }),
    ],
  });
}
export const MAX_SUGGESTIONS_SHOWN = 3;
export const MOST_ASK_LIST_ROWS = MAX_SUGGESTIONS_SHOWN + 3;
export const ROWS_ADDED_WITH_MORE = 2;
export const askListRowsAtOpen = (suggestionCount?: Dynamic, areAllShown?: Dynamic) =>
  areAllShown ? MOST_ASK_LIST_ROWS : suggestionCount === 0 ? 3 : suggestionCount + 3;
export const CONDITIONAL_ASK_LIST_WIDTH = SIDE_PANE_DEFAULT_WIDTH;
export const READY_ROW_ACTIONS = {
  highlight: {
    kind: 'startRule',
    effect: 'formatWhere',
  },
  colorScale: {
    kind: 'startRule',
    effect: 'colorScale',
  },
  showRules: {
    kind: 'showInPane',
  },
};
export const isReadyRowId = (rowId?: Dynamic) => rowId in READY_ROW_ACTIONS;
export const WRITE_RULE_ROW_ID = 'write';
export const suggestionRowId = ({ rules: rules }: Dynamic) => JSON.stringify(rules);
export const rulesOfSuggestionRow = (rowId?: Dynamic, suggestions?: Dynamic) =>
  suggestions.find((suggestion?: Dynamic) => suggestionRowId(suggestion) === rowId)?.rules ?? null;
export const isConditionalAskActionTaken = ({ kind: kind }: Dynamic) =>
  kind === 'takeSuggestion' || kind === 'takeReadAtOnce' || kind === 'keepOffer' || kind === 'startRule' || kind === 'showInPane';
export const inMarkColumn = (children?: Dynamic) =>
  jsx('span', {
    className: 'flex w-5 flex-none justify-center',
    children: children,
  });
export const askListRow = (id?: Dynamic, mark?: Dynamic, drawn?: Dynamic) => ({
  id: id,
  mark: mark,
  drawn: drawn,
});
export const ANSWER_ROW_ID = 'answer';
export const READ_AT_ONCE_ROW_ID = 'readAtOnce';
export const REST_AFTER_WORDS_MS = 500;
export const chatInsteadForRules = () => ({
  whyNotHere: CONDITIONAL_FORMATTING_WORDS.rulesAloneCantDoIt(),
  goThere: CONDITIONAL_FORMATTING_WORDS.goToChatForRules(),
});
