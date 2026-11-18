import type { Dynamic } from '../dynamic.ts';
import { plainWordsOf, isWordOrItsPlural, longestPhraseAt, NO_WORD_TOKEN } from './tokens.ts';
import { NUMBER_CONDITION_WORDS } from './vocabulary.ts';
import { NUMBER_COMPARISON_PHRASES, LARGEST_SMALLEST_PHRASES, NUMBER_TRAILING_COMPARISON_PHRASES } from './numbers-values.ts';
export function columnNameWords(column?: Dynamic) {
  let nameWords = columnNameWordsCache.get(column) ?? plainWordsOf(column.name ?? '');
  columnNameWordsCache.set(column, nameWords);
  return nameWords;
}
export function largestAbsoluteNumberInColumn(column?: Dynamic) {
  let largest =
    largestNumberInColumnCache.get(column) ??
    column.values.reduce(
      (largestSoFar: Dynamic, { value: value }: Dynamic) =>
        value?.kind === 'number' ? Math.max(largestSoFar, Math.abs(value.value)) : largestSoFar,
      0,
    );
  largestNumberInColumnCache.set(column, largest);
  return largest;
}
export function countUnitWordsAfter(words?: Dynamic, at?: Dynamic, column?: Dynamic) {
  let nameWords = columnNameWords(column);
  let count: Dynamic = 0;
  for (; ; count += 1) {
    let plain = words[at + count]?.plain ?? '';
    if (
      !(
        !NUMBER_CONDITION_WORDS.has(plain) &&
        nameWords.some((nameWord?: Dynamic) => isWordOrItsPlural(plain, nameWord) || isWordOrItsPlural(nameWord, plain))
      )
    )
      return count;
  }
}
export function readNumberAt(words?: Dynamic, at2?: Dynamic, column?: Dynamic) {
  let columnName = column.name ?? '';
  let plain = words[at2]?.plain ?? '';
  let numberAt = CURRENCY_SIGNS.has(plain) && (column.kind === 'currency' || columnName.includes(plain)) ? at2 + 1 : at2;
  let [, thousandsDigits] = /[.,]$/.test(words[numberAt]?.gap ?? '') ? [] : (/^(\d{1,6})k$/.exec(words[numberAt]?.plain ?? '') ?? []);
  let digits = thousandsDigits ?? words[numberAt]?.plain ?? '';
  if (!/^-?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)$/.test(digits)) return null;
  let nameSaysK = columnNameWords(column).includes('k');
  let mayBeInThousands = nameSaysK || /(?<!\p{L})(?:m|000s?|thousands?|millions?)(?!\p{L})/iu.test(columnName);
  let hasLargeNumbers = column.areMoreValuesLeftOut || largestAbsoluteNumberInColumn(column) >= 1000;
  let number = Number(digits.replaceAll(',', ''));
  if (thousandsDigits !== undefined && (nameSaysK ? hasLargeNumbers : mayBeInThousands || !hasLargeNumbers)) return null;
  if (thousandsDigits === undefined && mayBeInThousands && Math.abs(number) >= 1000 && largestAbsoluteNumberInColumn(column) < 1000) return null;
  let scaled = number * (thousandsDigits !== undefined && !nameSaysK ? 1000 : 1);
  let isPercentSign = words[numberAt + 1]?.plain === '%';
  let isWholePercent = thousandsDigits === undefined && (isPercentSign || /^[1-9]\d+$|^[2-9]$/.test(digits));
  let hasFractionsBelowOne = () =>
    column.values.some(({ value: value }: Dynamic) => value?.kind === 'number' && value.value !== 0 && Math.abs(value.value) < 1);
  let isPercentOfWholeNumbers =
    isPercentSign && columnName.includes('%') && largestAbsoluteNumberInColumn(column) > 1 && !hasFractionsBelowOne();
  if (column.kind === 'percent' ? !isWholePercent : isPercentSign && !isPercentOfWholeNumbers) return null;
  let endAt = numberAt + (isPercentSign ? 2 : 1);
  return {
    number: column.kind === 'percent' ? scaled / 100 : scaled,
    wordCount: endAt + countUnitWordsAfter(words, endAt, column) - at2,
    isInThousands: thousandsDigits !== undefined,
  };
}
export function readRangeEndsAt(words?: Dynamic, at2?: Dynamic, joiners?: Dynamic, readEnd?: Dynamic) {
  let oneEnd = readEnd(at2);
  if (oneEnd === null) return null;
  let afterOneEnd = at2 + oneEnd.wordCount;
  let isHyphenated = words[afterOneEnd]?.isAfterHyphen === true;
  if (!isHyphenated && !joiners.has(words[afterOneEnd]?.plain ?? '')) return null;
  let otherEnd = readEnd(isHyphenated ? afterOneEnd : afterOneEnd + 1);
  if (otherEnd === null) return null;
  return {
    ends: [oneEnd, otherEnd],
    wordCount: oneEnd.wordCount + (isHyphenated ? 0 : 1) + otherEnd.wordCount,
  };
}
export function readNumberCondition(words?: Dynamic, at2?: Dynamic, column?: Dynamic) {
  let readNumber = (numberAt?: Dynamic) => readNumberAt(words, numberAt, column);
  let comparison = longestPhraseAt(NUMBER_COMPARISON_PHRASES, words, at2);
  let comparedNumber = comparison === null ? null : readNumber(at2 + comparison.wordCount);
  if (comparison !== null && comparedNumber !== null)
    return {
      condition: numberIsCondition(comparison.meant, comparedNumber.number),
      wordCount: comparison.wordCount + comparedNumber.wordCount,
    };
  let largestSmallest = longestPhraseAt(LARGEST_SMALLEST_PHRASES, words, at2);
  let count = largestSmallest === null ? null : numberMatchedInWord(words[at2 + largestSmallest.wordCount], /^(\d{1,4})$/);
  if (largestSmallest !== null && count !== null && count >= 1 && count <= MOST_AMONG_THE_LARGEST)
    return {
      condition: {
        kind: largestSmallest.meant,
        count: count,
      },
      wordCount: largestSmallest.wordCount + 1,
    };
  let betweenWordCount = words[at2]?.plain === 'between' || words[at2]?.plain === 'from' ? 1 : 0;
  let range = readRangeEndsAt(words, at2 + betweenWordCount, betweenWordCount === 1 ? RANGE_JOINERS_AND_TO : RANGE_JOINERS_TO, readNumber);
  if (range !== null) {
    let [mapped, mapped2] = range.ends.map(
      ({ number: number }: Dynamic) => ({
        kind: 'number',
        number: number,
      }),
    );
    if (range.ends[0].isInThousands !== range.ends[1].isInThousands)
      return {
        condition: null,
        wordCount: betweenWordCount + range.wordCount,
      };
    if (mapped !== undefined && mapped2 !== undefined)
      return {
        condition: {
          kind: 'numberIsBetween',
          oneEnd: mapped,
          otherEnd: mapped2,
        },
        wordCount: betweenWordCount + range.wordCount,
      };
  }
  let bareNumber = readNumber(at2);
  if (bareNumber === null) return null;
  let afterNumber = at2 + bareNumber.wordCount;
  let { said: saidAfter, plain: plainAfter } = words[afterNumber] ?? NO_WORD_TOKEN;
  let isPlusAnd = saidAfter === '+' && plainAfter === 'and';
  if (isPlusAnd && afterNumber < words.length - 1)
    return {
      condition: null,
      wordCount: bareNumber.wordCount + 1,
    };
  let trailingComparison = isPlusAnd
    ? {
        meant: 'greaterThanOrEqualTo',
        wordCount: 1,
      }
    : longestPhraseAt(NUMBER_TRAILING_COMPARISON_PHRASES, words, afterNumber);
  if (trailingComparison === null) return null;
  let wordCount = bareNumber.wordCount + trailingComparison.wordCount;
  return {
    condition: numberIsCondition(trailingComparison.meant, bareNumber.number),
    wordCount: wordCount + countUnitWordsAfter(words, at2 + wordCount, column),
  };
}
export const MOST_AMONG_THE_LARGEST = 1000;
export const numberMatchedInWord = (word?: Dynamic, pattern?: Dynamic) => {
  let [, digits] = pattern.exec(word?.plain ?? '') ?? [];
  return digits === undefined ? null : Number(digits);
};
export const CURRENCY_SIGNS = new (Set as Dynamic)(['$', '€', '£', '¥']);
export const columnNameWordsCache = new (WeakMap as Dynamic)();
export const largestNumberInColumnCache = new (WeakMap as Dynamic)();
export const numberIsCondition = (comparison?: Dynamic, number?: Dynamic) => ({
  kind: 'numberIs',
  comparison: comparison,
  operand: {
    kind: 'number',
    number: number,
  },
});
export const RANGE_JOINERS_TO = new (Set as Dynamic)(['to']);
export const RANGE_JOINERS_AND_TO = new (Set as Dynamic)(['and', 'to']);
export { NUMBER_COMPARISON_PHRASES, NUMBER_TRAILING_COMPARISON_PHRASES, LARGEST_SMALLEST_PHRASES } from './numbers-values.ts';
