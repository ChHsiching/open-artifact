import { ContextMenu } from '../../kit/context-menu.tsx';
import type { Dynamic } from '../../dynamic.ts';
import { jsx } from 'react/jsx-runtime';
import { translateMessage } from '../../i18n/messages.ts';
import { truncateGraphemes } from '../../i18n/grid-action-labels.ts';
export function wordsToFind(typed?: Dynamic) {
  let words = typed.trim();
  if (findLeadWords().includes(words.toLowerCase())) return null;
  let leadWords = findLeadWords()
    .filter((input?: Dynamic) => words.toLowerCase().startsWith(`${input} `))
    .reduce((items?: Dynamic, items2?: Dynamic) => (items2.length > items.length ? items2 : items), '');
  return leadWords === '' ? null : words.slice(leadWords.length).trim();
}
export function FindInSheetItem({ words: words, isUnderEnter = false, hint: hint, onAsked: onAsked }: Dynamic) {
  return jsx(ContextMenu.Item, {
    icon: 'Search',
    ...(hint !== undefined && {
      hint: hint,
    }),
    ...(isUnderEnter && {
      className: 'sheet-row-under-enter',
    }),
    onClick: onAsked,
    children: findInSheetLabel(words),
  });
}
export const FIND_WORDS_SHOWN_LENGTH = 16;
export const findInSheetLabel = (words?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Find “{words}” in this sheet',
      id: 'j5pshFJ6HW',
    },
    {
      words: `⁨${truncateGraphemes(words, FIND_WORDS_SHOWN_LENGTH)}⁩`,
    },
  );
export const findLeadWords = () =>
  translateMessage({
    defaultMessage: 'find, search for, search, look for',
    id: 'jJJnRLlSuy',
  })
    .split(/[,،、，]/)
    .map((input?: Dynamic) => input.trim().toLowerCase())
    .filter((input?: Dynamic) => input !== '');
