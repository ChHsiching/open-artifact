import type { Dynamic } from '../dynamic.ts';
import { isUnquotedWord, RULE_PREAMBLE_WORDS } from './rule-formats.ts';
import { RULE_WORD_REWRITES, UNCHECKED_RULE_WORDS } from './rule-tests-values.ts';
import { wordsMatchAt, splitIntoWords, plainWordsOf } from './tokens.ts';
import { LARGEST_SMALLEST_WORDS, CHECKED_RULE_WORDS, NO_WITHOUT_WORDS } from './vocabulary.ts';
import { columnNamedAt } from './column-names.ts';
import { measureOfColumn } from './column-holds.ts';
import { columnsNamedIn, columnsOfConditionClause, isShortEnoughToRead } from './read-rule.ts';
import { namesAPeriod } from '../formulas/from-words/aggregates.ts';
import { dateToSerial, serialToIsoDate } from '../model/date-serials.ts';
import { readWordsAsFilter } from './read-filter.ts';
import { isDoneStatus } from './suggested-asks.ts';
export function isAfterTextTest(words?: Dynamic, at?: Dynamic) {
  for (let before: Dynamic = at - 1; before >= 0; before -= 1) {
    if (isTextTestAt(words, before)) return true;
    if (CLAUSE_JOINERS.has(words[before]?.plain ?? '')) return false;
  }
  return false;
}
export function ruleWordRewrites(words?: Dynamic, holds?: Dynamic, situation?: Dynamic) {
  let rewrites = new (Map as Dynamic)();
  for (let [at, word] of words.entries() as Dynamic) {
    let nextWord = words[at + 1];
    if (isTextTestAt(words, at)) break;
    if (!isUnquotedWord(word) || rewrites.has(word)) continue;
    let [phrase, replacement] =
      RULE_WORD_REWRITES.find(
        ([phrase2]: Dynamic) => wordsMatchAt(words, at, phrase2) && words.slice(at, at + phrase2.length).every(isUnquotedWord),
      ) ?? [];
    if (phrase !== undefined && replacement !== undefined)
      for (let [index, phraseWord] of words.slice(at, at + phrase.length).entries() as Dynamic)
        rewrites.set(phraseWord, index === 0 ? replacement : '');
    else if (LARGEST_SMALLEST_WORDS.has(word.plain) && !/^\d/.test(nextWord?.plain ?? '')) rewrites.set(word, word.said + ' 1');
    else if ((word.plain === 'column' || word.plain === 'col') && isUnquotedWord(nextWord) && /^[a-z]{1,3}$/.test(nextWord.plain)) {
      let index = situation.columnLettered(nextWord.plain);
      let phraseWord = holds.columns.find((column?: Dynamic) => column.c === index)?.name ?? null;
      if (phraseWord !== null) rewrites.set(word, '').set(nextWord, phraseWord);
    }
    let named = columnNamedAt(holds, words, at, true);
    if (named?.column.kind !== 'checkbox') continue;
    let afterName: Dynamic = at + named.wordCount;
    let linkingWords: Dynamic = [];
    for (; IS_ARE_WORDS.has(words[afterName]?.plain ?? ''); afterName += 1) (linkingWords.push as Dynamic)(...words.slice(afterName, afterName + 1));
    let [stateWord, wordAfterState] = [words[afterName], words[afterName + 1]];
    let isNotChecked = stateWord?.plain === 'not' && CHECKED_RULE_WORDS.has(wordAfterState?.plain ?? '');
    if (stateWord === undefined || !(isNotChecked || CHECKED_RULE_WORDS.has(stateWord.plain) || UNCHECKED_RULE_WORDS.has(stateWord.plain))) continue;
    for (let index of [...linkingWords, stateWord, ...(isNotChecked && wordAfterState !== undefined ? [wordAfterState] : [])] as Dynamic)
      rewrites.set(index, '');
    if (isNotChecked || UNCHECKED_RULE_WORDS.has(stateWord.plain)) rewrites.set(word, 'not ' + word.said);
  }
  return rewrites;
}
export function testOfFilterClause({ c: c, asked: asked }: Dynamic) {
  if (asked.kind === 'meets')
    return {
      c: c,
      condition: asked.condition,
    };
  let [value, ...otherValues] = asked.values;
  let condition = otherValues.length > 0 ? null : conditionOfFilterValue(value, asked.kind === 'isNoneOf');
  return condition === null
    ? null
    : {
        c: c,
        condition: condition,
      };
}
export function columnAfterWord(holds?: Dynamic, words?: Dynamic, word?: Dynamic) {
  let at = ['a', 'an', 'the'].includes(words[word.at + 1]?.plain ?? '') ? word.at + 2 : word.at + 1;
  let named = columnNamedAt(holds, words, at, true);
  return named === null
    ? null
    : {
        column: named.column,
        end: at + named.wordCount,
      };
}
export function doubtAboutRule(typed?: Dynamic, holds?: Dynamic, tests?: Dynamic, situation?: Dynamic) {
  let { today: today2, selected: selectedCs, areSeveralCellsSelected: areSeveralCellsSelected } = situation;
  let columnOf = (c?: Dynamic) => holds.columns.find((column?: Dynamic) => column.c === c);
  if (tests.some(({ c: c }: Dynamic) => columnOf(c)?.areMoreValuesLeftOut !== false)) return 'notAllValuesListed';
  let isNumberColumn = (c?: Dynamic) =>
    measureOfColumn(
      columnOf(c) ?? {
        kind: 'text',
      },
    ) === 'numbers';
  let isEqualsNumberTest = ({ c: c, condition: condition }: Dynamic) =>
    condition.kind === 'numberIs' &&
    condition.operand.kind === 'number' &&
    (condition.comparison === 'equalTo' || condition.comparison === 'notEqualTo') &&
    isNumberColumn(c);
  if (tests.filter(isEqualsNumberTest).length > (typed.match(saidNumberPattern)?.length ?? 0)) return 'numberAlone';
  let columnsNamed = columnsNamedIn(splitIntoWords(typed), holds);
  let namedCs = new (Set as Dynamic)(columnsNamed.map(({ c: c }: Dynamic) => c));
  let [firstNamed] = columnsNamed;
  let checkboxWordCount = firstNamed !== undefined && columnOf(firstNamed.c)?.kind === 'checkbox' ? 1 : 0;
  let isOnlyPreambleBefore = splitIntoWords(typed)
    .slice(0, Math.max((firstNamed?.from ?? 0) - checkboxWordCount, 0))
    .every(({ plain: plain }: Dynamic) => RULE_PREAMBLE_WORDS.has(plain));
  let isUnjoinedTest = ({ c: c, condition: condition }: Dynamic, index?: Dynamic) =>
    index > 0 &&
    !namedCs.has(c) &&
    !(condition.kind === 'textIs' && trailingJoinerPattern.test(typed.slice(0, typed.toLowerCase().lastIndexOf(condition.text.toLowerCase()))));
  if (tests.some(isUnjoinedTest)) return 'testsNotJoined';
  let words = splitIntoWords(typed);
  let deniedCs = new (Set as Dynamic)(
    words.flatMap(
      (word?: Dynamic) => (isUnquotedWord(word) && NO_WITHOUT_WORDS.has(word.plain) ? [columnAfterWord(holds, words, word)?.column.c] : []),
    ),
  );
  for (let [index, test] of tests.entries() as Dynamic) {
    let { c: c, condition: condition } = test;
    let columnValues = columnOf(c)?.values ?? [];
    let hasBlanks = columnValues.some(({ value: value }: Dynamic) => value === null);
    let operands = operandsOfCondition(condition);
    let isRankingTest = operands.length > 0 || condition.kind === 'isAmongTheLargest' || condition.kind === 'isAmongTheSmallest';
    if (
      isNegatedTest(test) &&
      index < tests.length - 1 &&
      !(tests.slice(index).every((test2?: Dynamic) => namedCs.has(test2.c)) && isOnlyPreambleBefore)
    )
      return 'notBeforeSeveralTests';
    if (
      (condition.kind === 'isAmongTheLargest' || condition.kind === 'isAmongTheSmallest') &&
      (isRankLikeColumn(columnOf(c)) || areManyNegative(numbersInColumn(columnOf(c))) || tests.length > 1)
    )
      return 'largestIsInDoubt';
    if (isNegatedTest(test) && condition.kind !== 'booleanIs' && deniedCs.has(c)) return 'noneIsSaidToBe';
    if (isNegatedTest(test) && condition.kind !== 'isNotBlank' && hasBlanks) return 'deniedOfBlanksToo';
    if (condition.kind === 'isNotBlank' && !/\b(?:blank|empty|filled)\b/i.test(typed)) return 'filledIsNotSaid';
    if ((condition.kind === 'textContains' || condition.kind === 'textDoesNotContain') && condition.text.length < 3) return 'textTooShort';
    if (condition.kind === 'isBlank' && isNumberColumn(c) && /\b(?:no|without)\b/i.test(typed)) return 'noneOfANumber';
    if (
      (condition.kind === 'isBlank' || condition.kind === 'isNotBlank') &&
      !columnsNamed.some(
        (named?: Dynamic) =>
          named.c === c &&
          /^(?:is|are)(?: not)? (?:blank|empty)\b/.test(
            splitIntoWords(typed)
              .slice(named.to, named.to + 3)
              .map(({ plain: plain }: Dynamic) => plain)
              .join(' '),
          ),
      ) &&
      columnValues.some(({ value: value }: Dynamic) => value?.kind === 'text' && placeholderValuePattern.test(value.value.trim()))
    )
      return 'nothingIsWrittenOut';
    if (isRankingTest && !areSeveralCellsSelected && columnsOfConditionClause(test).some((c2?: Dynamic) => hasNumbersAsText(columnOf(c2))))
      return 'numbersKeptAsText';
    if (TEXT_TEST_KINDS.has(condition.kind) && 'text' in condition && !isTextSetApart(condition.text, typed)) return 'signBesideTheText';
    if (TEXT_TEST_KINDS.has(condition.kind) && 'text' in condition) {
      let { text: text } = condition;
      let countContaining = (fold?: Dynamic) =>
        columnValues.filter(({ value: value }: Dynamic) => fold(String(value?.value ?? '')).includes(fold(text))).length;
      if (countContaining(lowerCasedText) === 0 || countContaining(lowerCasedText) < countContaining(foldedText)) return 'textIsFoundNowhere';
    }
    if (
      condition.kind === 'textIsNot' &&
      columnValues.some(
        ({ value: value }: Dynamic) =>
          value?.kind === 'text' &&
          isShortEnoughToRead(value.value) &&
          !isSameTextIgnoringCase(value.value, condition.text) &&
          !/^\s*not?\b/i.test(value.value) &&
          plainWordsOf(condition.text).every((word?: Dynamic) => plainWordsOf(value.value).includes(word)),
      )
    )
      return 'deniedOfOneOfSeveralAlike';
    if (
      'text' in condition &&
      namesAPeriod(condition.text.toLowerCase()) &&
      columnValues.some(({ value: value }: Dynamic) => value?.kind === 'number')
    )
      return 'periodBesideDates';
    if (TEXT_TEST_KINDS.has(condition.kind) && 'text' in condition && joinerWordPattern.test(condition.text) && !/["“”]/.test(typed))
      return 'joinsInsideTheText';
    if (condition.kind === 'textIs' && /^not\b/i.test(condition.text) && !typed.toLowerCase().includes(condition.text.toLowerCase()))
      return 'notIsOfTheValue';
    if (condition.kind === 'textIs') {
      let { text: text } = condition;
      if (
        !(namedCs.has(c) || onlySelectedColumn(situation) === c) &&
        (holds.columns.some((column?: Dynamic) => column.c !== c && columnHasText(column, text)) ||
          (hasBlanks && placeholderValuePattern.test(text.trim())))
      )
        return 'valueStandsElsewhereToo';
    }
    let hasBlanksIn = (c2?: Dynamic) => columnOf(c2)?.values.some(({ value: value }: Dynamic) => value === null) !== false;
    if (isNumberColumn(c) && columnsOfConditionClause(test).length > 1 && columnsOfConditionClause(test).some(hasBlanksIn))
      return 'heldAgainstABlank';
    let numbers = (selectedCs.includes(c) ? selectedCs : [c]).flatMap((c2?: Dynamic) => numbersInColumn(columnOf(c2)));
    let [least, most] = rangeOfNumbers(numbers);
    if (
      condition.kind === 'numberIs' &&
      condition.comparison.startsWith('lessThan') &&
      condition.operand.kind === 'number' &&
      condition.operand.number > 0 &&
      areManyNegative(numbers) &&
      isNumberColumn(c)
    )
      return 'belowZeroIsTakenIn';
    if (
      columnOf(c)?.kind === 'date' &&
      operands.some((operand?: Dynamic) => operand.kind === 'daysFromToday' && operand.days >= 0) &&
      !isBeforeTodayTest(test) &&
      isShortEnoughToRead(columnOf(c)?.name ?? '') &&
      recurringDatePattern.test(columnOf(c)?.name ?? '')
    )
      return 'daysMayRecur';
    let isOnOtherScale = (operand?: Dynamic) =>
      operand.kind === 'number' && ((least >= -1 && most <= 1 && Math.abs(operand.number) > 1) || (most <= 0 && operand.number > 0));
    if (isNumberColumn(c) && operands.length > 0 && operands.every(isOnOtherScale)) return 'numberIsOnAnotherScale';
    let [oneEnd, otherEnd] = operands;
    if (otherEnd !== undefined && (oneEnd?.kind === 'daysFromToday') !== (otherEnd.kind === 'daysFromToday')) return 'oneEndMoves';
    if (
      columnOf(c)?.kind === 'date' &&
      !yearNumberPattern.test(typed) &&
      operands.some(
        (operand?: Dynamic) => operand.kind === 'number' && Math.abs(operand.number - dateToSerial(today2)) > MOST_DAYS_FROM_TODAY_UNSAID,
      )
    )
      return 'dayWithNoYear';
  }
  return null;
}
export function isRankLikeColumn(column?: Dynamic) {
  let numbers = numbersInColumn(column);
  let [least, most] = rangeOfNumbers(numbers);
  let name = column?.name ?? '';
  return (
    most <= 0 ||
    (isShortEnoughToRead(name) && rankOrCodeNamePattern.test(name)) ||
    (most - least + 1 === numbers.length &&
      numbers.every(Number.isInteger) &&
      (column?.values ?? []).every(({ value: value, records: records }: Dynamic) => value?.kind !== 'number' || records === 1))
  );
}
export function isTextSetApart(text?: Dynamic, typed?: Dynamic) {
  let at = typed.toLowerCase().lastIndexOf(text.toLowerCase());
  let charsAround = [typed[at - 1] ?? ' ', typed[at + text.length] ?? ' '];
  return at !== -1 && charsAround.every((char?: Dynamic) => /[\s"“”]/.test(char));
}
export function nextLastDaysOf(typed?: Dynamic) {
  let [match, ...moreMatches] = plainTextOfWords(typed).matchAll(nextLastDaysPattern);
  if (match === undefined) return null;
  if (moreMatches.length > 0) return 'several';
  let [, direction = '', count, unit = ''] = match;
  let days = Number(count) * (unit.startsWith('w') ? 7 : 1);
  let sign = direction === 'next' ? 1 : -1;
  return {
    ofFilter: sign * (days - 1),
    ofRule: sign * days,
  };
}
export function conditionMovingWithToday([dayBefore, onDay, dayAfter]: Dynamic, today2?: Dynamic, nextLastDays?: Dynamic) {
  let [operandsBefore, operandsOnDay, operandsAfter] = [dayBefore, onDay, dayAfter].map(operandsOfCondition);
  let movingOperands = (operandsOnDay ?? []).map((operand?: Dynamic, index?: Dynamic) => {
    let [before, after] = [operandsBefore?.[index], operandsAfter?.[index]];
    if (operand.kind !== 'number') return isSameAsJson(operand, before) && isSameAsJson(operand, after) ? operand : null;
    if (before?.kind !== 'number' || after?.kind !== 'number') return null;
    let [stepBefore, stepAfter] = [operand.number - before.number, after.number - operand.number];
    if (stepBefore === 0 && stepAfter === 0)
      return {
        kind: 'number',
        number: Math.floor(operand.number),
      };
    if (Math.abs(stepBefore - 1) > 0.000001 || Math.abs(stepAfter - 1) > 0.000001) return null;
    return {
      kind: 'daysFromToday',
      days: Math.floor(operand.number) - dateToSerial(today2),
    };
  });
  let [oneEnd = null, otherEnd = null] = movingOperands;
  if (dayBefore.kind !== onDay.kind || dayAfter.kind !== onDay.kind || movingOperands.includes(null)) return null;
  if (onDay.kind === 'numberIs' && oneEnd !== null)
    return {
      ...onDay,
      operand: oneEnd,
    };
  if (onDay.kind !== 'numberIsBetween' || oneEnd === null || otherEnd === null) return null;
  let [oneEndDays, otherEndDays] = [daysFromTodayOf(oneEnd), daysFromTodayOf(otherEnd)];
  if (
    nextLastDays !== null &&
    ((oneEndDays === 0 && otherEndDays === nextLastDays.ofFilter) || (otherEndDays === 0 && oneEndDays === nextLastDays.ofFilter))
  )
    return {
      ...onDay,
      oneEnd: {
        kind: 'daysFromToday',
        days: Math.min(0, nextLastDays.ofRule),
      },
      otherEnd: {
        kind: 'daysFromToday',
        days: Math.max(0, nextLastDays.ofRule),
      },
    };
  if (isSameAsJson(oneEnd, otherEnd))
    return {
      kind: 'numberIs',
      comparison: 'equalTo',
      operand: oneEnd,
    };
  return {
    ...onDay,
    oneEnd: oneEnd,
    otherEnd: otherEnd,
  };
}
export function readWordsAsTests(typed?: Dynamic, holds?: Dynamic, viewerId?: Dynamic, situation?: Dynamic) {
  let readOn = (today2?: Dynamic) =>
    readWordsAsFilter(typed, holds, viewerId, {
      ...situation,
      today: today2,
      needsHeaders: true,
    });
  if (unfinishedWordsPattern.test(typed))
    return {
      kind: 'notRead',
      isOnItsWay: true,
    };
  let read = readOn(situation.today);
  if (read.kind === 'notRead') {
    let [noted] = read.wordsNotPlaced;
    return {
      kind: 'notRead',
      isOnItsWay: read.isOnItsWay,
      ...(noted !== undefined && {
        firstNotPlaced: noted,
      }),
    };
  }
  let notRead = {
    kind: 'notRead',
    isOnItsWay: false,
  };
  let clauses = singleClausesOf(read);
  if (clauses === null) return notRead;
  let testsDateNumbers = ({ c: c, asked: asked }: Dynamic) =>
    asked.kind === 'meets' &&
    holds.columns.find((column?: Dynamic) => column.c === c)?.kind === 'date' &&
    operandsOfCondition(asked.condition).length > 0;
  let movingClauses: Dynamic = clauses;
  if (clauses.some(testsDateNumbers)) {
    let noted = nextLastDaysOf(typed);
    if (relativePeriodPattern.test(plainTextOfWords(typed)) || noted === 'several') return notRead;
    let columnsOfClause = ({ c: c, asked: asked }: Dynamic) =>
      asked.kind === 'meets'
        ? columnsOfConditionClause({
            c: c,
            condition: asked.condition,
          })
        : [c];
    if (
      clauses
        .filter(testsDateNumbers)
        .flatMap(columnsOfClause)
        .some((c?: Dynamic) => hasFractionalNumbers(holds, c))
    )
      return notRead;
    let [readBefore, readAfter] = [readOn(isoDayPlusDays(situation.today, -1)), readOn(isoDayPlusDays(situation.today, 1))];
    let [clausesBefore, clausesAfter] = [readBefore, readAfter].map(
      (read2?: Dynamic) => (read2.kind === 'read' ? singleClausesOf(read2) : null),
    );
    let clausesMoving = clauses.map((clause?: Dynamic, index?: Dynamic) => {
      let [clauseBefore, clauseAfter] = [clausesBefore?.[index], clausesAfter?.[index]];
      if (clauseBefore?.c !== clause.c || clauseAfter?.c !== clause.c) return null;
      if (!testsDateNumbers(clause)) return isSameAsJson(clause, clauseBefore) && isSameAsJson(clause, clauseAfter) ? clause : null;
      if (clause.asked.kind !== 'meets' || clauseBefore.asked.kind !== 'meets' || clauseAfter.asked.kind !== 'meets') return null;
      let condition = conditionMovingWithToday(
        [clauseBefore.asked.condition, clause.asked.condition, clauseAfter.asked.condition],
        situation.today,
        noted,
      );
      return condition === null
        ? null
        : {
            c: clause.c,
            asked: {
              kind: 'meets',
              condition: condition,
            },
          };
    });
    if (clausesBefore?.length !== clauses.length || clausesAfter?.length !== clauses.length) return notRead;
    if (clausesMoving.includes(null)) return notRead;
    movingClauses = clausesMoving.flatMap((clause?: Dynamic) => clause ?? []);
  }
  let testsOrNull = movingClauses.map(testOfFilterClause);
  let [firstTest, ...otherTests] = testsOrNull.flatMap((test?: Dynamic) => test ?? []);
  if (firstTest === undefined || otherTests.length + 1 < testsOrNull.length) return notRead;
  let tests = [firstTest, ...otherTests];
  return doubtAboutRule(typed, holds, tests, situation) === null
    ? {
        kind: 'read',
        allOf: tests,
      }
    : notRead;
}
export const MOST_RULE_READINGS = 400;
export const rewriteWords = (words?: Dynamic, from?: Dynamic, to?: Dynamic, rewrites?: Dynamic, isFollowedBySpace?: Dynamic) =>
  words
    .slice(from, to)
    .map((word?: Dynamic, index?: Dynamic) => (index === 0 ? word.gap.replace(/^.*\s/s, '') : word.gap) + (rewrites.get(word) ?? word.said))
    .join('') +
  (words[to - 1]?.tail.replace(/\s.*$/s, '') ?? '') +
  (isFollowedBySpace ? ' ' : '');
export const NO_WORD_REWRITES = new (Map as Dynamic)();
export const CONTAINS_WORDS = new (Set as Dynamic)('contains contain containing includes include including'.split(' '));
export const STARTS_ENDS_WORDS = new (Set as Dynamic)('starts start starting begins begin beginning ends end ending'.split(' '));
export const isTextTestAt = (words?: Dynamic, at?: Dynamic) => {
  let [word, nextWord] = [words[at], words[at + 1]];
  return (
    isUnquotedWord(word) &&
    (CONTAINS_WORDS.has(word.plain) ||
      (STARTS_ENDS_WORDS.has(word.plain) && nextWord?.plain === 'with') ||
      ((word.plain === 'ends' || word.plain === 'ending') && nextWord?.plain === 'in'))
  );
};
export const CLAUSE_JOINERS = new (Set as Dynamic)(['and', 'or', 'but', ',']);
export const IS_ARE_WORDS = new (Set as Dynamic)(['is', 'are']);
export const conditionOfFilterValue = (filterValue?: Dynamic, isNegated?: Dynamic) => {
  if (filterValue === null)
    return {
      kind: isNegated ? 'isNotBlank' : 'isBlank',
    };
  switch (filterValue.kind) {
    case 'text':
      return {
        kind: isNegated ? 'textIsNot' : 'textIs',
        text: filterValue.value,
      };
    case 'number':
      return {
        kind: 'numberIs',
        comparison: isNegated ? 'notEqualTo' : 'equalTo',
        operand: {
          kind: 'number',
          number: filterValue.value,
        },
      };
    case 'boolean':
      return {
        kind: 'booleanIs',
        value: filterValue.value !== isNegated,
      };
    case 'error':
      return null;
  }
};
export const NEGATED_CONDITION_KINDS = new (Set as Dynamic)(['textIsNot', 'textDoesNotContain', 'isNotBlank', 'numberIsNotBetween']);
export const isNegatedTest = ({ condition: condition }: Dynamic) =>
  NEGATED_CONDITION_KINDS.has(condition.kind) ||
  (condition.kind === 'numberIs' && condition.comparison === 'notEqualTo') ||
  (condition.kind === 'booleanIs' && !condition.value);
export const saidNumberPattern = /(?:\b(?:is|are|equals?|equal to|not|isn['’]?t|aren['’]?t)|=|≠|<>)\s*[$€£¥]?-?[\d.]/gi;
export const operandsOfCondition = (condition?: Dynamic) =>
  condition.kind === 'numberIs'
    ? [condition.operand]
    : condition.kind === 'numberIsBetween' || condition.kind === 'numberIsNotBetween'
      ? [condition.oneEnd, condition.otherEnd]
      : [];
export const placeholderValuePattern = /^(?:no|none|nobody|n\/?a|n\.n\.|tbd|tba|tbc|unknown|pending|unassigned|not assigned|[-–—?]+)$/i;
export const TEXT_TEST_KINDS = new (Set as Dynamic)(['textContains', 'textDoesNotContain', 'textStartsWith', 'textEndsWith']);
export const foreignNumberPattern = /[€£¥]|\(\s*[\d.,]+\s*\)|(?<![\d.,])\d{1,3}\.\d{3}(?![\d])/;
export const crossMarkPattern = /[❌❎🚫⛔🛑✗✘✖✕👎🙅⬜◻◽🔲]/u;
export const leaveOutPattern = /\bleav(?:e|es|ing) out\b/i;
export const thousandsRangePattern =
  /\d\s*(?:[-–—]|\b(?:to|and)\b)\s*\$?\d[\d.,]*k\b|\dk\s*(?:[-–—]|\b(?:to|and)\b)\s*\$?[\d.,]*\d(?!\d|k|[.,]\d)/i;
export const monthYearPattern = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*['’‘`-]\s*\d\d\b/i;
export const joinerWordPattern = /\b(?:and|or|plus|with|but|both)\b|\s[&+]|[&+]\s+\S/i;
export const trailingJoinerPattern = /(?:\b(?:and|but|plus)|[,&+])\s*$/i;
export const yearNumberPattern = /\b(?:19|20)\d\d\b|\d{1,2}[/.-]\d{1,2}[/.-]\d\d\b/;
export const MOST_DAYS_FROM_TODAY_UNSAID = 60;
export const hasDoneValues = ({ kind: kind, name: name, values: values, optionsOfDropdown: optionsOfDropdown }: Dynamic) =>
  (kind === 'checkbox'
    ? [name ?? '']
    : [...values.flatMap(({ value: value }: Dynamic) => (value?.kind === 'text' ? [value.value] : [])), ...(optionsOfDropdown ?? [])]
  ).some(isDoneText);
export const hasStatusLikeColumns = ({ columns: columns }: Dynamic) =>
  columns.some(
    (column?: Dynamic) =>
      ['checkbox', 'fewWords', 'percent'].includes(column.kind) || column.optionsOfDropdown !== null || hasDoneValues(column),
  ) || columns.filter(({ kind: kind }: Dynamic) => kind === 'date').length > 1;
export const isDoneText = (text?: Dynamic) => isShortEnoughToRead(text) && isDoneStatus(plainWordsOf(text).join(' '));
export const testsNotDone = ({ c: c, condition: condition }: Dynamic, holds?: Dynamic) =>
  holds.columns.some((column?: Dynamic) => column.c === c && hasDoneValues(column)) &&
  ((condition.kind === 'textIsNot' && isDoneText(condition.text)) ||
    (condition.kind === 'textIs' && !isDoneText(condition.text)) ||
    (condition.kind === 'booleanIs' && !condition.value));
export const isBeforeTodayTest = ({ condition: condition }: Dynamic) =>
  condition.kind === 'numberIs' && condition.comparison === 'lessThan' && condition.operand.kind === 'daysFromToday' && condition.operand.days === 0;
export const onlySelectedColumn = ({ selected: selected, areSeveralCellsSelected: areSeveralCellsSelected }: Dynamic) =>
  areSeveralCellsSelected && selected.length === 1 ? (selected[0] ?? null) : null;
export const hasNumbersAsText = (column?: Dynamic) =>
  column !== undefined &&
  measureOfColumn(column) !== null &&
  column.values.some(({ value: value }: Dynamic) => value?.kind === 'text' && /\d/.test(value.value));
export const recurringDatePattern = /\b(?:birthday|birth|born|dob|anniversary)\b/i;
export const lowerCasedText = (text?: Dynamic) => text.toLowerCase();
export const foldedText = (text?: Dynamic) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export const isSameTextIgnoringCase = (text?: Dynamic, otherText?: Dynamic) =>
  text.trim().toLowerCase() === otherText.trim().toLowerCase();
export const columnHasText = (
  { kind: kind, values: values, areMoreValuesLeftOut: areMoreValuesLeftOut }: Dynamic,
  text?: Dynamic,
) =>
  (areMoreValuesLeftOut && kind === 'text') ||
  values.some(({ value: value }: Dynamic) => value?.kind === 'text' && isSameTextIgnoringCase(value.value, text));
export const numbersInColumn = (column?: Dynamic) =>
  (column?.values ?? []).flatMap(({ value: value }: Dynamic) => (value?.kind === 'number' ? [value.value] : []));
export const areManyNegative = (numbers?: Dynamic) =>
  numbers.filter((number?: Dynamic) => number < 0).length * 4 >= numbers.length;
export const rangeOfNumbers = (numbers?: Dynamic) =>
  numbers.reduce(([least, most]: Dynamic, number?: Dynamic) => [Math.min(least, number), Math.max(most, number)], [1 / 0, -1 / 0]);
export const rankOrCodeNamePattern =
  /\b(?:rank|ranking|position|pos|place|priority|severity|seed|standing|tier|table|room|id|code|zip|year)\b/i;
export const relativePeriodPattern = /\b(?:this|next|last|previous) (?:week|wk|month|quarter|qtr|year)\b/;
export const nextLastDaysPattern = /\b(next|last|previous) (\d+) (days?|weeks?|wks?)\b/g;
export const plainTextOfWords = (text?: Dynamic) => plainWordsOf(text).join(' ');
export const daysFromTodayOf = (operand?: Dynamic) => (operand?.kind === 'daysFromToday' ? operand.days : null);
export const isSameAsJson = (one?: Dynamic, other?: Dynamic) => JSON.stringify(one) === JSON.stringify(other);
export const isoDayPlusDays = (isoDay?: Dynamic, days?: Dynamic) => serialToIsoDate(dateToSerial(isoDay) + days);
export const unfinishedWordsPattern =
  /(?:^|\s)(?:and|or|plus|but|in|of|for|on|to|by|with|than|is|are|the|an?|where|whose|if|when|not|no|columns?|col|&|\+|,)\s*$/i;
export const hasFractionalNumbers = (holds?: Dynamic, c?: Dynamic) =>
  holds.columns
    .find((column?: Dynamic) => column.c === c)
    ?.values.some(({ value: value }: Dynamic) => value?.kind === 'number' && !Number.isInteger(value.value)) === true;
export const singleClausesOf = ({ asked: asked }: Dynamic) =>
  asked.filter === null || asked.sortBy.length > 0 || asked.filter.allOf.some(({ anyOf: anyOf }: Dynamic) => anyOf.length > 1)
    ? null
    : asked.filter.allOf.map(({ anyOf: [clause] }: Dynamic) => clause);
export { RULE_WORD_REWRITES, UNCHECKED_RULE_WORDS } from './rule-tests-values.ts';
