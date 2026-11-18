import { AgentMark } from '../../kit/agent-mark.tsx';
import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
import { CONDITIONAL_FORMATTING_WORDS } from '../../messages/conditional-format.ts';
import { cleanAskWords } from '../../agent/chat-with-agent.ts';
import { CONDITIONAL_FORMATTING_PRESS } from './pane-state.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { cardRowFrameProps, CARD_ROW_HOVER_CLASSES } from '../../ui/card-rows.ts';
import { agentRowClassProps, AgentRowContent } from '../../agent/agent-rows.ts';
import { LiveAnnouncer } from '../../ui/live-announcer.ts';
import { isNonNullObject } from '../../utils/objects.ts';
export function sheetNumberOfOpenSheet(sheets?: Dynamic) {
  let openIndex = sheets.findIndex(({ holdsOpenEntry: holdsOpenEntry }: Dynamic) => holdsOpenEntry);
  return (openIndex === -1 ? sheets.findIndex(({ isShown: isShown }: Dynamic) => isShown) : openIndex) + 1;
}
export function ruleNumberOfConditionalFormat(rules?: Dynamic, conditionalFormatId?: Dynamic) {
  let usableRules = rules.filter(({ toSay: toSay }: Dynamic) => isRuleUsable(toSay));
  let index = usableRules.findIndex((input?: Dynamic) => input.conditionalFormatId === conditionalFormatId);
  return index === -1
    ? null
    : {
        ruleNumber: index + 1,
        ruleCount: usableRules.length,
      };
}
export function askAgentAboutRule(store?: Dynamic, chat?: Dynamic, context?: Dynamic) {
  if (store.isEventUnfinished() || store.getView().hasUnsavedEdits) return Promise.resolve(false);
  let selectedPlacedView = () =>
    store.getView().grid.placedViews.find(({ isSelected: isSelected }: Dynamic) => isSelected);
  let placedView = selectedPlacedView();
  if (placedView !== undefined)
    store.dispatch({
      kind: 'placedViewActedOn',
      placementId: placedView.placementId,
      act: {
        kind: 'leave',
        isForCells: false,
      },
    });
  if (selectedPlacedView() !== undefined) return Promise.resolve(false);
  return chat.openAboutRule(CONDITIONAL_FORMATTING_WORDS.ruleAttached(), {
    ...context,
    sheetNumber: sheetNumberOfOpenSheet(store.getView().listedSheets),
  });
}
export function askAgentForRulesInChat(store?: Dynamic, chat?: Dynamic, words?: Dynamic) {
  let selectionByAddress = store.getView().selectionByAddress;
  let request = cleanAskWords(words);
  if (store.isEventUnfinished() || selectionByAddress === null || request === '') return Promise.resolve(false);
  return chat.openWithWhatWasPressed(cleanAskWords(request.slice(0, MOST_PRESSED_WORDS_CHARS)), selectionByAddress, CONDITIONAL_FORMATTING_PRESS, {
    request: request,
  });
}
export function AskAgentAboutRuleSection({ rule: rule, onAskAgent: onAskAgent }: Dynamic) {
  let ruleKey = `${rule.ruleNumber}/${rule.ruleCount}`;
  let [addedRuleKey, setAddedRuleKey] = React.useState(null);
  if (addedRuleKey !== null && addedRuleKey !== ruleKey) setAddedRuleKey(null);
  return jsxs('section', {
    className: 'flex min-w-0 shrink-0 flex-col border-t border-alpha-2 py-1.5',
    children: [
      jsx('div', {
        className: `${cardRowFrameProps.className} ${CARD_ROW_HOVER_CLASSES}`,
        children: jsx('button', {
          type: 'button',
          className: agentRowClassProps.className,
          onClick: () => {
            onAskAgent(rule).then((input?: Dynamic) => setAddedRuleKey((input2?: Dynamic) => (input ? ruleKey : input2)));
          },
          children: jsx(AgentRowContent, {
            icon: jsx(AgentMark, {
              size: 14,
            }),
            children: CONDITIONAL_FORMATTING_WORDS.askAgentForEdits(),
          }),
        }),
      }),
      jsx(LiveAnnouncer, {
        words: addedRuleKey === null ? null : CONDITIONAL_FORMATTING_WORDS.ruleAddedToMessage(),
      }),
    ],
  });
}
export const isGoneReference = (reference?: Dynamic) => isNonNullObject(reference) && reference.kind === 'gone';
export const isRuleUsable = ({ cells: cells, does: does }: Dynamic) =>
  cells !== '' &&
  (does.kind === 'colorScale' ||
    does.tests.every(
      ({ column: column, condition: condition }: Dynamic) =>
        !isGoneReference(column) &&
        Object.values(condition).every((input?: Dynamic) => !isNonNullObject(input) || !isGoneReference(input.column)),
    ));
export const isAskTakenToChat = ({ agent: agent, isAskBeyondRules: isAskBeyondRules }: Dynamic, offer?: Dynamic) =>
  agent === 'hasFailed' && isAskBeyondRules && offer.areWordsAsAsked && offer.isChatToBeHad;
export const MOST_PRESSED_WORDS_CHARS = 60;
