import type { Dynamic } from '../dynamic.ts';
import { measureOfColumn } from './column-holds.ts';
import { readNumberCondition, readNumberAt, numberIsCondition } from './numbers.ts';
import { readDateCondition } from './dates.ts';
import { NO_WORD_TOKEN, longestPhraseAt, phrasesMeaning } from './tokens.ts';
import { TEXT_TEST_PHRASES, CELL_TEST_PHRASES } from './conditions-values.ts';
import { NUMBER_COMPARISON_PHRASES } from './numbers-values.ts';
export function readMeasureCondition(words?: Dynamic, at?: Dynamic, column?: Dynamic, today2?: Dynamic) {
  if (measureOfColumn(column) === 'numbers') return readNumberCondition(words, at, column);
  return column.kind === 'date' && today2 !== null ? readDateCondition(words, at, today2) : null;
}
export function readTextCondition(words?: Dynamic, at2?: Dynamic, endsTextAt?: Dynamic, stopsTextAt?: Dynamic) {
  let { isInQuotes: isInQuotes, gap: gap } = words[at2] ?? NO_WORD_TOKEN;
  let quotedTest = /["“”]/.test(gap)
    ? {
        meant: 'textIs',
        wordCount: 0,
      }
    : null;
  let test = isInQuotes ? quotedTest : longestPhraseAt(TEXT_TEST_PHRASES, words, at2);
  if (test === null) return null;
  let textAt = at2 + test.wordCount;
  let startsInQuotes = words[textAt]?.isInQuotes === true;
  let textEnd: Dynamic = textAt;
  for (; textEnd < words.length; textEnd += 1) {
    let { isInQuotes: isEndInQuotes, gap: endGap } = words[textEnd] ?? NO_WORD_TOKEN;
    let endsAtQuote = textEnd > textAt && /["“”]/.test(endGap);
    if (startsInQuotes ? !isEndInQuotes || endsAtQuote : textEnd > textAt && endsTextAt(textEnd)) break;
    if (!startsInQuotes && (endsAtQuote || stopsTextAt(textEnd, textEnd === textAt)))
      return {
        condition: null,
        wordCount: textEnd + 1 - at2,
      };
  }
  let saidText = words
    .slice(textAt, textEnd)
    .map(({ said: said, gap: gap2 }: Dynamic, index?: Dynamic) => (index === 0 ? said : gap2 + said))
    .join('');
  if (!/[\p{L}\p{N}]/u.test(saidText)) return null;
  let [leadingText = ''] = /[^"“”]*$/.exec(words[textAt]?.gap ?? '') ?? [];
  let [trailingText = ''] = /^[^"“”]*/.exec(words[textEnd - 1]?.tail ?? '') ?? [];
  let text = startsInQuotes ? `${leadingText}${saidText}${trailingText}`.trim() : saidText.replace(/^['‘’](.+)['‘’]$/, '$1');
  return {
    condition:
      text.length > MOST_TEXT_TEST_CHARACTERS || /[\p{Cc}"“”]/u.test(text)
        ? null
        : {
            kind: test.meant,
            text: text,
          },
    wordCount: textEnd - at2,
  };
}
export function readCellTestCondition(words?: Dynamic, at?: Dynamic) {
  let test = words[at]?.isInQuotes === true ? null : longestPhraseAt(CELL_TEST_PHRASES, words, at);
  return test === null
    ? null
    : {
        condition: {
          kind: test.meant,
        },
        wordCount: test.wordCount,
      };
}
export function readEqualsNumberCondition(words?: Dynamic, at?: Dynamic, column?: Dynamic) {
  let number = measureOfColumn(column) === 'numbers' ? readNumberAt(words, at, column) : null;
  let hasLetters = words.slice(at, at + (number?.wordCount ?? 0)).some(({ plain: plain }: Dynamic) => plain.includes(','));
  if (number === null || number.number < 0 || hasLetters) return null;
  return {
    condition: numberIsCondition('equalTo', number.number),
    wordCount: number.wordCount,
  };
}
export const MOST_TEXT_TEST_CHARACTERS = 100;
export const startsNumberComparisonAt = (words?: Dynamic, at?: Dynamic) => {
  let comparison = longestPhraseAt(NUMBER_COMPARISON_PHRASES, words, at);
  return comparison !== null && /^[$€£¥]?-?[\d.]/.test(words[at + comparison.wordCount]?.plain ?? '');
};
export const testPhraseWordCountAt = (words?: Dynamic, at?: Dynamic) =>
  words[at]?.isInQuotes === true
    ? 0
    : ((longestPhraseAt(TEXT_TEST_PHRASES, words, at) ?? longestPhraseAt(CELL_TEST_PHRASES, words, at))?.wordCount ?? 0);
export const COLUMN_COMPARISON_PHRASES = [
  ...phrasesMeaning('lessThan', 'before, earlier than'),
  ...phrasesMeaning('greaterThan', 'after, later than'),
  ...phrasesMeaning('greaterThanOrEqualTo', 'on or after'),
  ...phrasesMeaning('lessThanOrEqualTo', 'on or before'),
];
export const columnComparisonAt = (words?: Dynamic, at?: Dynamic, column?: Dynamic) => {
  let measure = measureOfColumn(column);
  if (measure === null) return null;
  return longestPhraseAt(measure === 'numbers' ? NUMBER_COMPARISON_PHRASES : COLUMN_COMPARISON_PHRASES, words, at);
};
export { TEXT_TEST_PHRASES, CELL_TEST_PHRASES } from './conditions-values.ts';
