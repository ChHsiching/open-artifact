import type { Dynamic } from '../../dynamic.ts';
import { CONDITIONAL_FORMATTING_WORDS, wordsOfRuleEntry } from '../../messages/conditional-format.ts';
import { toolSearchWords } from '../../tools/search-words.ts';
import { commandSearchSynonyms } from '../../messages/command-search.ts';
import { joinMessageParts } from '../../i18n/messages.ts';
import { jsx } from 'react/jsx-runtime';
import { RuleSample } from '../../format/conditional/rule-samples.ts';
export function isAboutConditionalFormatting(typed?: Dynamic) {
  let ruleWords = ruleCommandOtherWords().flatMap(searchWordsOf);
  return searchWordsOf(typed).every((input?: Dynamic) => ruleWords.some((input2?: Dynamic) => input2.startsWith(input)));
}
export function suggestedRulesFirst(commands?: Dynamic, typed?: Dynamic) {
  if (!isAboutConditionalFormatting(typed)) return commands;
  let ruleCommandsInOrder = [...commands.filter(isSuggestedRuleCommand), ...commands.filter(isRuleCommand)];
  let nextIndex: Dynamic = 0;
  return commands.map(
    (input?: Dynamic) => (isSuggestedRuleCommand(input) || isRuleCommand(input) ? (ruleCommandsInOrder[nextIndex++] ?? input) : input),
  );
}
export const SUGGESTED_RULE_COMMAND_PREFIX = 'rules.suggested.';
export const RULE_COMMAND_IDS = new (Set as Dynamic)(['rules.create', 'rules.show']);
export const isSuggestedRuleCommand = ({ id: id }: Dynamic) => id.startsWith(SUGGESTED_RULE_COMMAND_PREFIX);
export const isRuleCommand = ({ id: id }: Dynamic) => RULE_COMMAND_IDS.has(id);
export const ruleCommandOtherWords = () => [
  CONDITIONAL_FORMATTING_WORDS.conditionalFormatting(),
  ...toolSearchWords('conditionalFormatting'),
  ...commandSearchSynonyms('conditionalFormatting'),
];
export const suggestedRuleCommands = (suggestions: Dynamic, { onPointedAt: onPointedAt, onTaken: onTaken }: Dynamic) =>
  suggestions.map(({ rules: rules, toSay: toSay }: Dynamic, index?: Dynamic) => {
    let { what: what, where: where } = wordsOfRuleEntry(toSay);
    return {
      id: `${SUGGESTED_RULE_COMMAND_PREFIX}${index}`,
      label: joinMessageParts(what),
      otherWords: ruleCommandOtherWords(),
      icon: jsx(RuleSample, {
        rules: toSay,
        isSwatch: true,
      }),
      actsOn: 'cells',
      whyNot: null,
      isWeighty: true,
      gives: JSON.stringify(rules),
      where: where,
      tryOnCells: (input?: Dynamic) => onPointedAt(input ? rules : null),
      run: () => onTaken(rules),
    };
  });
export const ruleCommands = (onRulesAsked?: Dynamic) => [
  {
    id: 'rules.create',
    label: CONDITIONAL_FORMATTING_WORDS.createRule(),
    otherWords: ruleCommandOtherWords(),
    icon: 'Add',
    actsOn: 'cells',
    whyNot: null,
    isWeighty: true,
    run: () => onRulesAsked('newRule'),
  },
  {
    id: 'rules.show',
    label: CONDITIONAL_FORMATTING_WORDS.showRules(),
    otherWords: ruleCommandOtherWords(),
    icon: 'ConditionalFormat',
    actsOn: 'opens',
    home: 'pane',
    whyNot: null,
    run: () => onRulesAsked('list'),
  },
];
export const searchWordsOf = (text?: Dynamic) => text.trim().toLocaleLowerCase().split(/\s+/);
