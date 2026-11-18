import type { Dynamic } from '../dynamic.ts';
import {
  dateToSerial,
  END_OF_DAY_FRACTION,
  serialRangeCondition,
  dueDatePresetCondition,
  weekRangeCondition,
  monthSpanRangeCondition,
  serialToIsoDate,
} from '../model/date-serials.ts';
import {
  RELATIVE_DAY_WORDS,
  AGE_COMPARISON_PHRASES,
  DAYS_IN_UNIT,
  PAST_PHRASES,
  RELATIVE_PERIOD_WORDS,
  MONTHS_IN_PERIOD,
  DATE_COMPARISON_PHRASES,
  DATE_TRAILING_COMPARISON_PHRASES,
  MONTH_NAMES,
  OVERDUE_PHRASES,
} from './dates-values.ts';
import { numberMatchedInWord, numberIsCondition, readRangeEndsAt, RANGE_JOINERS_AND_TO, RANGE_JOINERS_TO } from './numbers.ts';
import { DATE_CONDITION_WORDS } from './vocabulary.ts';
import { wordsMatchAt, longestPhraseAt } from './tokens.ts';
export function dayNumberOfDate(year?: Dynamic, month?: Dynamic, day?: Dynamic) {
  let date = new (Date as Dynamic)(Date.UTC(year, month, day));
  return date.getUTCMonth() === month && date.getUTCDate() === day && year >= 1900 && year <= 9999
    ? dateToSerial(date.toISOString().slice(0, 10))
    : null;
}
export function dayRangeIfNear(firstDay?: Dynamic, lastDay?: Dynamic) {
  if (firstDay === null || lastDay === null) return null;
  return yearOfDayNumber(firstDay) !== yearOfDayNumber(lastDay) && lastDay - firstDay > MOST_DAYS_IN_DATE_RANGE ? null : [firstDay, lastDay];
}
export function nearestYearForDay(dayRangeInYear?: Dynamic, today2?: Dynamic) {
  let [todayNumber, thisYear] = [dateToSerial(today2), Number(today2.slice(0, 4))];
  let [nearest, nearestDistance]: Dynamic = [null, MOST_DAYS_IN_DATE_RANGE + 1];
  for (let year of [thisYear + 1, thisYear, thisYear - 1] as Dynamic) {
    let range = dayRangeInYear(year);
    let distance = range === null ? nearestDistance : Math.max(range[0] - todayNumber, todayNumber - range[1], 0);
    if (distance < nearestDistance) [nearest, nearestDistance] = [range, distance];
  }
  return nearest;
}
export function dayInNearestYear(month?: Dynamic, day?: Dynamic, wordCount?: Dynamic, today2?: Dynamic) {
  let dayInYear = (year?: Dynamic) => dayNumberOfDate(year, month, day);
  let [nearest] = nearestYearForDay((year?: Dynamic) => dayRangeIfNear(dayInYear(year), dayInYear(year)), today2) ?? [];
  return nearest === undefined
    ? null
    : {
        number: nearest,
        wordCount: wordCount,
        inYear: dayInYear,
      };
}
export function readDayAt(words?: Dynamic, at2?: Dynamic, today2?: Dynamic) {
  let [first, second, third, fourth, fifth] = words.slice(at2, at2 + 5);
  let relativeDay = RELATIVE_DAY_WORDS.get(first?.plain ?? '');
  if (relativeDay !== undefined) return dayAndWordCount(dateToSerial(today2) + relativeDay, 1);
  let withYear = (dayInYear?: Dynamic, wordCount?: Dynamic, ...[nextWord, wordAfterComma]: Dynamic[]) => {
    let yearAfterComma = nextWord?.plain === ',' ? numberMatchedInWord(wordAfterComma, fourDigitYearPattern) : null;
    let year = yearAfterComma ?? numberMatchedInWord(nextWord, fourDigitYearPattern);
    if (year === null) return dayInNearestYear(dayInYear, wordCount, 2, today2);
    return dayAndWordCount(dayNumberOfDate(year, dayInYear, wordCount), yearAfterComma === null ? 3 : 4);
  };
  let theCount = first?.plain === 'the' ? 1 : 0;
  let wordBefore = words[at2 - 1]?.plain ?? '';
  let dayOfMonth =
    !['to', 'in', 'and'].includes(wordBefore) && (theCount === 1 || DATE_CONDITION_WORDS.has(wordBefore))
      ? numberMatchedInWord(words[at2 + theCount], ordinalDayPattern)
      : null;
  if (dayOfMonth !== null && monthIndexOf(words[at2 + theCount + 1]?.plain ?? '') < 0 && words[at2 + theCount + 1]?.plain !== 'of') {
    let value = dayNumberOfDate(Number(today2.slice(0, 4)), Number(today2.slice(5, 7)) - 1, dayOfMonth);
    return value === null || value < dateToSerial(today2) ? null : dayAndWordCount(value, theCount + 1);
  }
  let [firstMonth, secondMonth] = [monthIndexOf(first?.plain ?? ''), monthIndexOf(second?.plain ?? '')];
  let [firstDayOfMonth, secondDayOfMonth] = [numberMatchedInWord(first, dayOfMonthPattern), numberMatchedInWord(second, dayOfMonthPattern)];
  if (firstMonth >= 0 && secondDayOfMonth !== null) return withYear(firstMonth, secondDayOfMonth, third, fourth);
  if (firstDayOfMonth !== null && secondMonth >= 0) return withYear(secondMonth, firstDayOfMonth, third, fourth);
  let [firstNumber, thirdNumber] = [numberMatchedInWord(first, oneOrTwoDigitsPattern), numberMatchedInWord(third, oneOrTwoDigitsPattern)];
  if (firstNumber !== null && isSlashBetweenWords(second, third) && thirdNumber !== null) {
    let [value, value2] = isSlashBetweenWords(fourth, fifth)
      ? [numberMatchedInWord(fifth, fourDigitYearPattern), numberMatchedInWord(fifth, twoDigitYearPattern)]
      : [null, null];
    if (value === null && value2 === null) return dayInNearestYear(firstNumber - 1, thirdNumber, 3, today2);
    let nearYear = Number(today2.slice(0, 4)) + 20;
    let fullYear = value ?? nearYear - ((((nearYear - (value2 ?? 0)) % 100) + 100) % 100);
    return dayAndWordCount(dayNumberOfDate(fullYear, firstNumber - 1, thirdNumber), 5);
  }
  let firstYear = numberMatchedInWord(first, fourDigitYearPattern);
  let [secondNumber, thirdNumberAgain] = [numberMatchedInWord(second, oneOrTwoDigitsPattern), thirdNumber];
  let isHyphenatedDate = second?.isAfterHyphen === true && third?.isAfterHyphen === true;
  if (firstYear !== null && secondNumber !== null && thirdNumberAgain !== null && isHyphenatedDate)
    return dayAndWordCount(dayNumberOfDate(firstYear, secondNumber - 1, thirdNumberAgain), 3);
  return null;
}
export function dayInYearOnSide(dayInYear?: Dynamic, dayNumber?: Dynamic, side?: Dynamic) {
  return (
    [yearOfDayNumber(dayNumber), yearOfDayNumber(dayNumber) + side]
      .map(dayInYear)
      .find((year?: Dynamic) => year !== null && (year - dayNumber) * side >= 0) ?? null
  );
}
export function dayRangeOfEnds(oneEnd?: Dynamic, otherEnd?: Dynamic, today2?: Dynamic) {
  let [oneEndInYear, otherEndInYear] = [oneEnd.inYear, otherEnd.inYear];
  if (oneEndInYear === undefined)
    return otherEndInYear === undefined
      ? [Math.min(oneEnd.number, otherEnd.number), Math.max(oneEnd.number, otherEnd.number)]
      : dayRangeIfNear(oneEnd.number, dayInYearOnSide(otherEndInYear, oneEnd.number, 1));
  if (otherEndInYear === undefined) return dayRangeIfNear(dayInYearOnSide(oneEndInYear, otherEnd.number, -1), otherEnd.number);
  return nearestYearForDay((year?: Dynamic) => {
    let firstDay = oneEndInYear(year);
    return dayRangeIfNear(firstDay, firstDay === null ? null : dayInYearOnSide(otherEndInYear, firstDay, 1));
  }, today2);
}
export function readAgoCondition(words?: Dynamic, at2?: Dynamic, today2?: Dynamic) {
  let saysOlderThan = wordsMatchAt(words, at2, ['older', 'than']);
  let comparison = saysOlderThan
    ? {
        meant: 'before',
        wordCount: 2,
      }
    : longestPhraseAt(AGE_COMPARISON_PHRASES, words, at2);
  let numberAt = at2 + (comparison?.wordCount ?? 0);
  let days =
    (numberMatchedInWord(words[numberAt], /^(\d{1,5})$/) ?? Number.NaN) * (DAYS_IN_UNIT.get(words[numberAt + 1]?.plain ?? '') ?? Number.NaN);
  let saysAgo = words[numberAt + 2]?.plain === 'ago';
  if (!Number.isInteger(days) || days < 1 || days > 36600 || saysAgo === saysOlderThan) return null;
  let [thatDay, todayNumber] = [dateToSerial(today2) - days, dateToSerial(today2)];
  return {
    condition: (
      {
        before: numberIsCondition('lessThan', thatDay),
        byThen: numberIsCondition('lessThanOrEqualTo', thatDay + END_OF_DAY_FRACTION),
        since: serialRangeCondition(thatDay + 1, todayNumber),
        thatDay: serialRangeCondition(thatDay, thatDay),
      } as Dynamic
    )[comparison?.meant ?? 'thatDay'],
    wordCount: numberAt + (saysOlderThan ? 2 : 3) - at2,
  };
}
export function readDateCondition(words?: Dynamic, at2?: Dynamic, today2?: Dynamic) {
  let readDay = (dayAt?: Dynamic) => readDayAt(words, dayAt, today2);
  let agoCondition = readAgoCondition(words, at2, today2);
  if (agoCondition !== null) return agoCondition;
  let pastPhrase = longestPhraseAt(PAST_PHRASES, words, at2);
  if (pastPhrase !== null)
    return {
      condition: dueDatePresetCondition('overdue', today2),
      wordCount: pastPhrase.wordCount,
    };
  let periodAt: Dynamic = at2;
  if (words[periodAt]?.plain === 'in' || words[periodAt]?.plain === 'within') periodAt += 1;
  let saysThe = words[periodAt]?.plain === 'the';
  if (saysThe) periodAt += 1;
  let periodSide = RELATIVE_PERIOD_WORDS.get(words[periodAt]?.plain ?? '');
  let [periodWord, wordAfterPeriod] = [words[periodAt + 1]?.plain ?? '', words[periodAt + 2]?.plain ?? ''];
  let monthsInPeriod = MONTHS_IN_PERIOD.get(periodWord);
  let isTheWeek = saysThe && periodSide !== undefined && periodSide !== 0;
  if (isTheWeek && monthsInPeriod !== undefined)
    return {
      condition: null,
      wordCount: periodAt + 2 - at2,
    };
  let isOneWeek = isTheWeek && periodWord === 'week';
  if (periodSide !== undefined && !isOneWeek && (periodWord === 'week' || monthsInPeriod !== undefined))
    return {
      condition: monthsInPeriod === undefined ? weekRangeCondition(today2, periodSide) : monthSpanRangeCondition(today2, periodSide, monthsInPeriod),
      wordCount: periodAt + 2 - at2,
    };
  let days = isOneWeek
    ? 7
    : (numberMatchedInWord(words[periodAt + 1], /^(\d{1,5})$/) ?? Number.NaN) * (DAYS_IN_UNIT.get(wordAfterPeriod) ?? Number.NaN);
  if (periodSide !== undefined && periodSide !== 0 && Number.isInteger(days) && days >= 1 && days <= 36600) {
    let todayNumber = dateToSerial(today2);
    return {
      condition:
        periodSide > 0 ? serialRangeCondition(todayNumber, todayNumber + days - 1) : serialRangeCondition(todayNumber - days + 1, todayNumber),
      wordCount: periodAt + (isOneWeek ? 2 : 3) - at2,
    };
  }
  let comparison = longestPhraseAt(DATE_COMPARISON_PHRASES, words, at2);
  let comparedDay = comparison === null ? null : readDay(at2 + comparison.wordCount);
  let betweenWordCount = words[at2]?.plain === 'between' || words[at2]?.plain === 'from' ? 1 : 0;
  let range = readRangeEndsAt(words, at2 + betweenWordCount, betweenWordCount === 1 ? RANGE_JOINERS_AND_TO : RANGE_JOINERS_TO, readDay);
  if (range !== null) {
    let todayNumber = (dayRangeOfEnds as Dynamic)(...range.ends, today2);
    return {
      condition: todayNumber === null ? null : (serialRangeCondition as Dynamic)(...todayNumber),
      wordCount: betweenWordCount + range.wordCount,
    };
  }
  if (comparison !== null && comparedDay !== null) {
    let [todayNumber, meant] = comparison.meant;
    let value =
      words[at2]?.plain === 'since' && comparedDay.inYear !== undefined
        ? dayInYearOnSide(comparedDay.inYear, dateToSerial(today2), -1)
        : comparedDay.number;
    let value2 = todayNumber === 'lessThanOrEqualTo' && comparedDay.inYear !== undefined && comparedDay.number < dateToSerial(today2);
    return {
      condition: value === null || value2 ? null : numberIsCondition(todayNumber, value + (meant ? END_OF_DAY_FRACTION : 0)),
      wordCount: comparison.wordCount + comparedDay.wordCount,
    };
  }
  let onWordCount = words[at2]?.plain === 'on' ? 1 : 0;
  let day = readDay(at2 + onWordCount);
  let trailingComparison = day === null ? null : longestPhraseAt(DATE_TRAILING_COMPARISON_PHRASES, words, at2 + onWordCount + day.wordCount);
  if (day !== null && trailingComparison !== null)
    return {
      condition: numberIsCondition(trailingComparison.meant[0], day.number + (trailingComparison.meant[1] ? END_OF_DAY_FRACTION : 0)),
      wordCount: onWordCount + day.wordCount + trailingComparison.wordCount,
    };
  if (day !== null)
    return {
      condition: serialRangeCondition(day.number, day.number),
      wordCount: onWordCount + day.wordCount,
    };
  let inWordCount = words[at2]?.plain === 'in' ? 1 : 0;
  let month = monthIndexOf(words[at2 + inWordCount]?.plain ?? '');
  if (month < 0) return null;
  let year = numberMatchedInWord(words[at2 + inWordCount + 1], fourDigitYearPattern);
  let dayNumber = year === null ? (dayInNearestYear(month, 15, 1, today2)?.number ?? null) : dayNumberOfDate(year, month, 15);
  let isoDay = dayNumber === null ? null : serialToIsoDate(dayNumber);
  if (isoDay === null) return null;
  return {
    condition: monthSpanRangeCondition(isoDay, 0),
    wordCount: inWordCount + (year === null ? 1 : 2),
  };
}
export const monthIndexOf = (word?: Dynamic) =>
  MONTH_NAMES.findIndex((month?: Dynamic) => word === month || word === month.slice(0, 3) || (word === 'sept' && month === 'september'));
export const isMonthName = (word?: Dynamic) => monthIndexOf(word) >= 0;
export const dayOfMonthPattern = /^(\d{1,2})(?:st|nd|rd|th)?$/;
export const ordinalDayPattern = /^(\d{1,2})(?:st|nd|rd|th)$/;
export const oneOrTwoDigitsPattern = /^(\d{1,2})$/;
export const fourDigitYearPattern = /^(\d{4})$/;
export const twoDigitYearPattern = /^(\d{2})$/;
export const dayAndWordCount = (dayNumber?: Dynamic, wordCount?: Dynamic) =>
  dayNumber === null
    ? null
    : {
        number: dayNumber,
        wordCount: wordCount,
      };
export const MOST_DAYS_IN_DATE_RANGE = 183;
export const yearOfDayNumber = (dayNumber?: Dynamic) => Number(serialToIsoDate(dayNumber)?.slice(0, 4));
export const isSlashBetweenWords = (word?: Dynamic, nextWord?: Dynamic) =>
  word?.said === '/' && !word.isAfterBlank && nextWord?.isAfterBlank === false;
export const saysOverdueAt = (words?: Dynamic, at?: Dynamic) => longestPhraseAt(OVERDUE_PHRASES, words, at) !== null;
export {
  PAST_PHRASES,
  OVERDUE_PHRASES,
  DATE_COMPARISON_PHRASES,
  DATE_TRAILING_COMPARISON_PHRASES,
  AGE_COMPARISON_PHRASES,
  RELATIVE_PERIOD_WORDS,
  DAYS_IN_UNIT,
  RELATIVE_DAY_WORDS,
  MONTH_NAMES,
  MONTHS_IN_PERIOD,
} from './dates-values.ts';
