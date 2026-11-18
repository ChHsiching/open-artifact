import type { Dynamic } from '../dynamic.ts';
import { filterEntry, filterOfEntries } from '../tables/filter-model.ts';
import { NO_WORD_TOKEN, wordsMatchAt, splitIntoWords, isWordOrItsPlural, plainWordsOf } from './tokens.ts';
import {
  ON_TOP_PHRASES,
  SUPERLATIVE_DIRECTIONS,
  SORT_KEY_JOINERS,
  TEXT_TEST_WORDS,
  NUMBER_CONDITION_WORDS,
  DATE_CONDITION_WORDS,
  MOST_CHARACTERS_OF_WORDS,
  HIDING_WORDS,
  SORT_BY_PHRASES,
  EQUALS_WORDS,
  LIST_JOINERS,
  NEGATING_WORDS,
  FIRST_PERSON_WORDS,
  LARGEST_SMALLEST_WORDS,
  COMMAND_WORDS,
  BLANK_WORDS,
  FILLED_WORDS,
  TASK_NOUNS,
  SET_STATE_WORDS,
  ALL_WORDS,
  EMPTY_WORDS,
  FILTER_FILLER_WORDS,
  NOT_VERBS,
  CHECKED_RULE_WORDS,
  UNCHECKED_WORDS,
  NON_COLUMN_SUPERLATIVES,
  AGE_SUPERLATIVES,
  DATE_SUPERLATIVES,
  MOST_DAYS_FROM_TODAY_FOR_DATES,
  RECORD_NOUNS,
  TABLE_SUBJECT_NOUNS,
  LINKING_VERBS,
  NO_WITHOUT_WORDS,
  SORT_VERBS,
  SHOW_VERBS,
  ANYONE_WORDS,
  IS_HAS_WORDS,
  POSSESSIVE_ONES_WORDS,
  EXCLUDE_VERBS,
  HAVING_WORDS,
  QUESTION_FILLER_WORDS,
  YET_WORD,
  WORDS_NOT_TAKEN_AS_VALUES,
  DUE_WORDS,
  RANK_WORDS,
  SORT_DIRECTION_PHRASES,
  RANGE_DIRECTION_PHRASES,
} from './vocabulary.ts';
import {
  columnNamedAt,
  PLAINLY_TYPED_PATTERN,
  NUMBER_SIGN_OR_HYPHEN_PATTERN,
  valueNamedAt,
  columnNamesOf,
  isColumnOfFewValues,
  valueLabelsOf,
  valuesNamedAt,
  unassignedPhraseLengthAt,
  hasZeroValues,
  isOnlyTextColumn,
  looksLikeDateColumn,
  leadingNameWordsOf,
  nameMatchesAt,
  isWordBreakAt,
  isSingleWordValueOf,
  emojiInColumn,
  emojiInText,
  CROSS_MARK_EMOJI,
} from './column-names.ts';
import { measureOfColumn, isPeopleColumn, valuesOfUserInColumn } from './column-holds.ts';
import {
  testPhraseWordCountAt,
  columnComparisonAt,
  startsNumberComparisonAt,
  readTextCondition,
  readCellTestCondition,
  readMeasureCondition,
  readEqualsNumberCondition,
} from './conditions.ts';
import { saysOverdueAt, isMonthName } from './dates.ts';
import { dateToSerial } from '../model/date-serials.ts';
import { columnNameWords } from './numbers.ts';
export function filterClausesOfAsks(asksByColumn?: Dynamic) {
  let clauses: Dynamic = [];
  for (let [
    c,
    {
      oneOf: oneOf,
      noneOf: noneOf,
      meets: [condition],
    },
  ] of asksByColumn as Dynamic) {
    let [kind, [firstValue, ...otherValues]] = oneOf.length > 0 ? ['isOneOf', oneOf] : ['isNoneOf', noneOf];
    if (condition !== undefined)
      clauses.push(
        filterEntry(c, {
          kind: 'meets',
          condition: condition,
        }),
      );
    else if (firstValue !== undefined)
      clauses.push(
        filterEntry(c, {
          kind: kind,
          values: [firstValue, ...otherValues],
        }),
      );
  }
  return clauses;
}
export function readSortKeys(holds?: Dynamic, words?: Dynamic, from?: Dynamic, notPlace?: Dynamic, isDirectionOnly: Dynamic = false) {
  let keys: Dynamic = [];
  let lastColumn: Dynamic = null;
  let joiner: Dynamic = isDirectionOnly ? NO_WORD_TOKEN : (words[from - 1] ?? null);
  let at2: Dynamic = from;
  while (at2 < words.length) {
    let word = words[at2] ?? NO_WORD_TOKEN;
    let lastKey = joiner === null || joiner.plain === ',' ? keys.at(-1) : undefined;
    let direction = sortDirectionAt(words, at2, lastColumn);
    let onTopPhrase = ON_TOP_PHRASES.find((phrase?: Dynamic) => wordsMatchAt(words, at2 + 1, phrase));
    let superlativeDirection = onTopPhrase === undefined ? undefined : SUPERLATIVE_DIRECTIONS.get(word.plain);
    let named = joiner === null ? null : columnNamedAt(holds, words, at2, true, true);
    if (lastKey !== undefined && direction !== undefined) {
      keys[keys.length - 1] = {
        ...lastKey,
        direction: direction[1],
      };
      joiner = null;
      at2 += direction[0].length;
    } else if (lastKey !== undefined && superlativeDirection !== undefined && lastColumn !== null && isSuperlativeFor(lastColumn, word.plain)) {
      keys[keys.length - 1] = {
        ...lastKey,
        direction: superlativeDirection,
      };
      joiner = null;
      at2 += 1 + (onTopPhrase?.length ?? 0);
    } else if (named !== null && keys.every(({ c: c }: Dynamic) => c !== named.column.c)) {
      keys.push({
        c: named.column.c,
        direction: 'ascending',
      });
      [lastColumn, joiner] = [named.column, null];
      at2 += named.wordCount;
    } else {
      let isColumnWord = word.plain === 'column' || (word.plain === 'date' && lastColumn?.kind === 'date');
      if (joiner === null && SORT_KEY_JOINERS.has(word.plain)) joiner = word;
      else if (!(joiner === null ? isColumnWord : SORT_LIST_WORDS.has(word.plain))) break;
      at2 += 1;
    }
  }
  let endsWithAnd = keys.length > 0 && at2 < words.length && joiner?.plain === 'and';
  if (joiner !== null && joiner.plain !== ',' && !endsWithAnd) notPlace(joiner);
  return {
    keys: keys,
    last: lastColumn,
    next: at2,
  };
}
export function knownWordsForColumn(column?: Dynamic, today2?: Dynamic) {
  if (column === null || column.kind === 'checkbox') return null;
  let measure = measureOfColumn(column);
  if (measure === null) return TEXT_TEST_WORDS;
  if (measure === 'numbers') return NUMBER_CONDITION_WORDS;
  return today2 === null ? null : DATE_CONDITION_WORDS;
}
export function readWordsAsFilter(
  typed?: Dynamic,
  holds?: Dynamic,
  viewerId?: Dynamic,
  { only: onlyC, today: today2 = null, needsHeaders = false, signsOfNumbers: signsOfNumbers, isMonthFirst = true }: Dynamic = {},
) {
  if (typed.length > MOST_CHARACTERS_OF_WORDS) return FILTER_WORDS_NOT_READ;
  let isTypedPlainly = (PLAINLY_TYPED_PATTERN as Dynamic).test(typed.replace(NUMBER_SIGN_OR_HYPHEN_PATTERN, ''));
  let onlyColumn = onlyC === undefined ? null : (holds.columns.find(({ c: c }: Dynamic) => c === onlyC) ?? null);
  if (onlyC !== undefined && onlyColumn === null) return FILTER_WORDS_NOT_READ;
  let words = splitIntoWords(typed, onlyColumn === null, signsOfNumbers);
  let wordsNotPlacedSet = new (Set as Dynamic)();
  let notPlaced = {
    push: (...words2: Dynamic[]) => words2.forEach((word?: Dynamic) => wordsNotPlacedSet.add(word)),
  };
  let isDecimalComma = signsOfNumbers?.decimalSign === 'comma';
  let isGroupNotPoint = isDecimalComma && signsOfNumbers.groupSign !== 'point';
  let isGroupSpace = isDecimalComma && signsOfNumbers.groupSign.endsWith('Space');
  let numberWordsInDoubt = new (Set as Dynamic)();
  let doubtNumberWords = (...doubted: Dynamic[]) => {
    doubted.forEach((word?: Dynamic) => numberWordsInDoubt.add(word));
    notPlaced.push(...doubted);
  };
  for (let [at, word] of words.entries() as Dynamic) {
    let [wordBefore, wordAfter] = [words[at - 1] ?? NO_WORD_TOKEN, words[at + 1] ?? NO_WORD_TOKEN];
    if (isGroupNotPoint && /^-?(?!0)\d{1,3}(?:\.\d{3})+$/.test(word.said)) doubtNumberWords(word);
    let isDigitJustAfter = !wordAfter.isAfterBlank && /^\d/.test(wordAfter.said);
    let isNumberJustBefore = !word.isAfterBlank && isNumberSaid(wordBefore);
    if (isDecimalComma && word.said === ',' && isDigitJustAfter && isNumberJustBefore && (isNumberSaid(wordAfter) || /[.,]/.test(wordBefore.said)))
      doubtNumberWords(wordBefore, word, wordAfter);
    else if (isDecimalComma && word.said === ',' && isDigitJustAfter && isNumberSaid(wordAfter)) notPlaced.push(word, wordAfter);
    let isShortNumberLast =
      !isGroupNotPoint &&
      wordAfter === words.at(-1) &&
      wordAfter.tail === '' &&
      /^\d{1,2}$/.test(wordAfter.said) &&
      /^-?[1-9]\d{0,2}(?:\.\d{3})*$/.test(word.said);
    let isPointBetweenNumbers =
      isDecimalComma &&
      wordAfter.gap === '.' &&
      isNumberSaid(word) &&
      (isNumberSaid(wordAfter) || (/[.,]/.test(word.said) && /^\d/.test(wordAfter.said)));
    if (isPointBetweenNumbers && isShortNumberLast) notPlaced.push(wordAfter);
    else if (isPointBetweenNumbers) doubtNumberWords(word, wordAfter);
    if (isGroupSpace && /^\d{1,3}$/.test(word.said) && /^\s+$/.test(wordAfter.gap) && /^\d{3},\d+$/.test(wordAfter.said))
      doubtNumberWords(word, wordAfter);
    let isNumberAfter = !wordAfter.isAfterBlank && /^\d+$/.test(wordAfter.plain);
    let isNumberBefore = !word.isAfterBlank && /^\d+$/.test(wordBefore.plain);
    if (!isMonthFirst && word.said === '/' && isNumberBefore && isNumberAfter) notPlaced.push(word);
  }
  let asksByColumn = new (Map as Dynamic)();
  let sortBy: Dynamic = [];
  let pendingSortVerb: Dynamic = null;
  let asksForAll: Dynamic = false;
  let negation: Dynamic = null;
  let havingWord: Dynamic = null;
  let pendingJoiner: Dynamic = null;
  let hidingWord: Dynamic = null;
  let wasColumnTouched: Dynamic = false;
  let noteColumnTouched = (column?: Dynamic) => {
    wasColumnTouched = true;
    if (hidingWord !== null && hidingWord.of !== null && hidingWord.of !== column) notPlaced.push(hidingWord.word);
    if (hidingWord !== null)
      hidingWord = {
        ...hidingWord,
        of: column,
      };
  };
  let yetWord: Dynamic = null;
  let lastColumn: Dynamic = null;
  let currentColumn: Dynamic = null;
  let columnOfLastTest: Dynamic = null;
  let addValuesFor = (column?: Dynamic, values?: Dynamic, asNoneOf?: Dynamic) => {
    noteColumnTouched(column);
    if (column !== columnOfLastTest) columnOfLastTest = null;
    if (pendingJoiner !== null && pendingJoiner.after !== null && pendingJoiner.after !== column) notPlaced.push(pendingJoiner.word);
    if (negation !== null && negation.of !== null && negation.of !== column) negation = null;
    let asks = asksByColumn.get(column.c) ?? {
      oneOf: [],
      noneOf: [],
      meets: [],
    };
    asksByColumn.set(column.c, asks);
    let list = (asNoneOf ?? negation !== null) ? asks.noneOf : asks.oneOf;
    let keys = new (Set as Dynamic)(list.map(filterValueKey));
    for (let value of values as Dynamic) {
      if (!keys.has(filterValueKey(value))) list.push(value);
      keys.add(filterValueKey(value));
    }
    if (negation !== null)
      negation = {
        ...negation,
        of: column,
      };
    [havingWord, pendingJoiner, lastColumn, currentColumn] = [null, null, column, column];
  };
  let resetCurrentColumn = () => {
    [currentColumn, columnOfLastTest] = [null, null];
    if (negation !== null && negation.of !== null) negation = null;
  };
  let noteNegation = (word?: Dynamic) => {
    if (negation !== null && negation.of === null) notPlaced.push(negation.word);
    negation = {
      word: word,
      of: null,
    };
    currentColumn = null;
    if (hidingWord !== null && word.plain === 'except') notPlaced.push(word);
    if (HIDING_WORDS.has(word.plain))
      hidingWord ??= {
        word: word,
        of: null,
      };
  };
  let isNegated = (column?: Dynamic) => negation !== null && negation.of === column;
  let noteJoiner = (word?: Dynamic) => {
    if (negation !== null && negation.of === null) notPlaced.push(negation.word);
    if (word.said === '/' && /\/\s*\d/.test(lastColumn?.name ?? '')) notPlaced.push(word);
    if (word.plain === 'or')
      pendingJoiner = {
        word: word,
        after: lastColumn,
      };
    if (word.plain === 'or' && lastColumn === null) notPlaced.push(word);
  };
  let addCondition = (column?: Dynamic, condition?: Dynamic) => {
    noteColumnTouched(column);
    if (pendingJoiner !== null) notPlaced.push(pendingJoiner.word);
    let negationWord = negation !== null && negation.of === null ? negation.word : null;
    let negatedCondition =
      condition.kind === 'numberIs' && condition.comparison === 'equalTo'
        ? {
            ...condition,
            comparison: 'notEqualTo',
          }
        : condition.kind === 'textContains'
          ? {
              ...condition,
              kind: 'textDoesNotContain',
            }
          : condition.kind === 'textIs'
            ? {
                ...condition,
                kind: 'textIsNot',
              }
            : null;
    if (negationWord !== null && negatedCondition === null) notPlaced.push(negationWord);
    let asks = asksByColumn.get(column.c) ?? {
      oneOf: [],
      noneOf: [],
      meets: [],
    };
    asksByColumn.set(column.c, asks);
    asks.meets.push(negationWord !== null && negatedCondition !== null ? negatedCondition : condition);
    [negation, havingWord, pendingJoiner, lastColumn, currentColumn] = [null, null, null, column, null];
  };
  let endClause = () => {
    if (negation !== null && negation.of === null) notPlaced.push(negation.word);
    if (havingWord !== null) notPlaced.push(havingWord);
    if (pendingJoiner !== null) notPlaced.push(pendingJoiner.word);
    [negation, havingWord, pendingJoiner, lastColumn, currentColumn, columnOfLastTest] = [null, null, null, null, null, null];
  };
  let addSortKeys = (keys?: Dynamic, from?: Dynamic, to?: Dynamic) => {
    endClause();
    if (sortBy.length > 0) notPlaced.push(...words.slice(from, to));
    sortBy = [...sortBy, ...keys];
  };
  let startsSortByAt = (at?: Dynamic) => {
    let phrase = SORT_BY_PHRASES.find((phrase2?: Dynamic) => wordsMatchAt(words, at, phrase2));
    return phrase !== undefined && columnNamedAt(holds, words, at + phrase.length, true, true) !== null;
  };
  let startsColumnTestAt = (at?: Dynamic) => {
    let named = columnNamedAt(holds, words, at, true);
    if (named === null) return false;
    let testAt: Dynamic = at + named.wordCount;
    while (EQUALS_WORDS.has(words[testAt]?.plain ?? '')) testAt += 1;
    return (
      testPhraseWordCountAt(words, testAt) > 0 ||
      columnComparisonAt(words, testAt, named.column) !== null ||
      sortDirectionAt(words, testAt, named.column) !== undefined ||
      (columnNamedAt(holds, words, at) !== null && readTestFor(named.column, testAt) !== null)
    );
  };
  let endsTextAt = (at?: Dynamic) => {
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    if (plain === ',' || startsColumnTestAt(at)) return true;
    let nextAt = at + 1;
    return (
      LIST_JOINERS.has(plain) &&
      (startsColumnTestAt(nextAt) ||
        valueNamedAt(holds, words, nextAt, {
          only: null,
          rather: null,
          wholeLabelsOnly: true,
        }) !== null)
    );
  };
  let mayBeUnfinishedNameAt = (at?: Dynamic) => {
    let plainWords = words.slice(at).map(({ plain: plain }: Dynamic) => plain);
    let lastPlain = plainWords.at(-1);
    if (lastPlain === undefined) return true;
    return [
      ...columnNamesOf(holds.columns).map(({ name: name }: Dynamic) => name),
      ...holds.columns
        .filter(isColumnOfFewValues)
        .flatMap((column?: Dynamic) => valueLabelsOf(column).map((label?: Dynamic) => label.words)),
    ].some(
      (nameWords?: Dynamic) =>
        nameWords.length >= plainWords.length &&
        plainWords.slice(0, -1).every((plain?: Dynamic, index?: Dynamic) => plain === nameWords[index]) &&
        nameWords[plainWords.length - 1]?.startsWith(lastPlain) === true,
    );
  };
  let stopsTextAt = (at?: Dynamic, isQuoted?: Dynamic) => {
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    if (plain === 'or' || plain === 'but' || NEGATING_WORDS.has(plain) || FIRST_PERSON_WORDS.has(plain)) return true;
    if (startsNumberComparisonAt(words, at) || startsSortByAt(at)) return true;
    if (LARGEST_SMALLEST_WORDS.has(plain) && /^\d/.test(words[at + 1]?.plain ?? '')) return true;
    if (LIST_JOINERS.has(plain) && (columnNamedAt(holds, words, at + 1, true) !== null || mayBeUnfinishedNameAt(at + 1))) return true;
    return at === words.length - 1 && !/\s$/.test(typed) && !isQuoted && 'and'.startsWith(plain);
  };
  let readTextOrColumnTest = (column?: Dynamic, at?: Dynamic) => {
    if (column.kind === 'checkbox') return null;
    let comparison = columnComparisonAt(words, at, column);
    let testWordCount = Math.max(testPhraseWordCountAt(words, at), comparison?.wordCount ?? 0);
    for (let wordAt: Dynamic = at; wordAt < at + testWordCount; wordAt += 1)
      if (
        columnNamedAt(holds, words, wordAt) !== null ||
        valuesNamedAt(holds, words, wordAt, {
          only: onlyColumn,
          rather: null,
          wholeLabelsOnly: true,
        }).length > 0
      )
        return null;
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    let isNotText =
      testWordCount === 0 &&
      (!/^\p{L}/u.test(plain) ||
        [COMMAND_WORDS, BLANK_WORDS, FILLED_WORDS, TASK_NOUNS, NUMBER_CONDITION_WORDS, DATE_CONDITION_WORDS].some(
          (wordSet?: Dynamic) => wordSet.has(plain) && !SET_STATE_WORDS.has(plain),
        ) ||
        columnNamedAt(holds, words, at, true)?.isPart === false ||
        valuesNamedAt(holds, words, at, {
          only: onlyColumn,
          rather: null,
          wholeLabelsOnly: true,
        }).length > 0);
    let test =
      (measureOfColumn(column) !== null || isNotText ? null : readTextCondition(words, at, endsTextAt, stopsTextAt)) ??
      readCellTestCondition(words, at);
    if (test !== null) return test;
    let otherColumn = comparison === null ? null : columnNamedAt(holds, words, at + comparison.wordCount, true, true);
    if (comparison === null || otherColumn === null || otherColumn.column === column) return null;
    if (measureOfColumn(otherColumn.column) !== measureOfColumn(column)) return null;
    return {
      condition: {
        kind: 'numberIs',
        comparison: comparison.meant,
        operand: {
          kind: 'sameRowInColumn',
          c: otherColumn.column.c,
        },
      },
      wordCount: comparison.wordCount + otherColumn.wordCount,
    };
  };
  let readTestFor = (column?: Dynamic, at?: Dynamic) => {
    let condition = readMeasureCondition(words, at, column, today2);
    if (condition !== null)
      return {
        kind: 'condition',
        ...condition,
      };
    let valueNamed = valueNamedAt(holds, words, at, {
      only: column,
      rather: null,
    });
    if (valueNamed !== null)
      return {
        kind: 'values',
        values: valueNamed.values,
        wordCount: valueNamed.wordCount,
      };
    if (onlyColumn === null && wordsMatchAt(words, at, ['set', 'to']) && words[at]?.isInQuotes !== true) {
      let setToTest = readTestFor(column, at + 2);
      if (setToTest !== null)
        return {
          ...setToTest,
          wordCount: setToTest.wordCount + 2,
        };
      let setToValue = valueNamedAt(holds, words, at + 1, {
        only: column,
        rather: null,
      });
      if (setToValue !== null)
        return {
          kind: 'values',
          values: setToValue.values,
          wordCount: setToValue.wordCount + 1,
        };
      let isNegatedOrAll =
        [NEGATING_WORDS, ALL_WORDS].some((wordSet?: Dynamic) => wordSet.has(words[at + 2]?.plain ?? '')) ||
        words[at + 2]?.plain === 'anything';
      if (!namesSomethingAt(at + 1) && !isNegatedOrAll) return null;
    }
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    if (FIRST_PERSON_WORDS.has(plain) && isPeopleColumn(column))
      return {
        kind: 'viewer',
        wordCount: 1,
      };
    let unassignedLength = isPeopleColumn(column) ? unassignedPhraseLengthAt(words, at) : 0;
    if (unassignedLength > 0)
      return {
        kind: 'values',
        values: [null],
        wordCount: unassignedLength,
      };
    let isSetState = SET_STATE_WORDS.has(plain) && (onlyColumn !== null || words[at]?.isInQuotes === true);
    let isAnythingBut = plain === 'anything' && words[at + 1]?.plain === 'but';
    let isBlankOrFilled = column.kind !== 'checkbox' && !isSetState && !isAnythingBut;
    if (isBlankOrFilled && BLANK_WORDS.has(plain))
      return {
        kind: 'values',
        values: [null],
        wordCount: 1,
      };
    if (isBlankOrFilled && FILLED_WORDS.has(plain))
      return {
        kind: 'values',
        values: [null],
        wordCount: 1,
        isNot: true,
      };
    let equalsNumber = readEqualsNumberCondition(words, at, column);
    return equalsNumber === null
      ? null
      : {
          kind: 'condition',
          ...equalsNumber,
        };
  };
  let readAnyTestFor = (column?: Dynamic, at?: Dynamic) => {
    let test = readTestFor(column, at);
    if (test !== null || onlyColumn !== null) return test;
    let textTest = readTextOrColumnTest(column, at);
    return textTest === null
      ? null
      : {
          kind: 'condition',
          ...textTest,
        };
  };
  let unreadConditionWord: Dynamic = NO_WORD_TOKEN;
  let placeTest = (column?: Dynamic, test?: Dynamic, at?: Dynamic) => {
    let values = test.kind === 'viewer' ? valuesOfUserInColumn(column, viewerId) : test.kind === 'values' ? test.values : [];
    let includesBlank = test.kind === 'values' && test.isNot !== true && values.includes(null) && !EMPTY_WORDS.has(words[at]?.plain ?? '');
    if (onlyColumn === null && includesBlank && hasZeroValues(column)) notPlaced.push(...words.slice(at, at + 1));
    if (test.kind === 'condition' && test.condition !== null) addCondition(column, test.condition);
    else if (test.kind === 'condition') {
      unreadConditionWord = words[at + test.wordCount - 1] ?? NO_WORD_TOKEN;
      notPlaced.push(unreadConditionWord);
    } else if (values.length === 0) notPlaced.push(...words.slice(at + test.wordCount - 1, at + test.wordCount));
    else if (test.kind === 'values' && test.isNot === true) {
      if (negation !== null && negation.of === column) notPlaced.push(...words.slice(at, at + 1));
      let isNegatedHere = negation !== null && negation.of === null;
      negation = null;
      addValuesFor(column, values, !isNegatedHere);
    } else addValuesFor(column, values);
    return at + test.wordCount;
  };
  let columnNameWords2 = new (Set as Dynamic)();
  let partialValueWords = new (Set as Dynamic)();
  let columnForKnownWords: Dynamic = onlyColumn;
  let stopsReading: Dynamic = false;
  let notPlace = (word?: Dynamic) => {
    notPlaced.push(word);
    if (NUMBER_CONDITION_WORDS.has(word.plain) || DATE_CONDITION_WORDS.has(word.plain)) stopsReading = true;
  };
  let isLongerDateReading = (column?: Dynamic, at?: Dynamic, test?: Dynamic) => {
    if (test?.kind !== 'condition') return false;
    let longerTest = readMeasureCondition(words, at, column, today2);
    return longerTest?.wordCount === test.wordCount + 1 && JSON.stringify(longerTest.condition) !== JSON.stringify(test.condition);
  };
  let readForColumn = (column?: Dynamic, at?: Dynamic) => {
    let word = words[at] ?? NO_WORD_TOKEN;
    let test = readAnyTestFor(column, at);
    let named = columnNamedAt(holds, words, at);
    if (named !== null && (test === null || test.wordCount < named.wordCount)) {
      let afterName = at + named.wordCount;
      if (named.column !== column || isLongerDateReading(column, afterName - 1, readAnyTestFor(column, afterName)))
        notPlaced.push(...words.slice(at, afterName));
      return afterName;
    }
    if (word.isAfterHyphen) notPlaced.push(word);
    if (test !== null) return placeTest(column, test, at);
    if (NEGATING_WORDS.has(word.plain)) noteNegation(word);
    else if (LIST_JOINERS.has(word.plain)) noteJoiner(word);
    else {
      if (ALL_WORDS.has(word.plain)) asksForAll = true;
      else if (!FILTER_FILLER_WORDS.has(word.plain) || isRangeWordFor(word, column)) notPlace(word);
      resetCurrentColumn();
    }
    return at + 1;
  };
  let readLargestBy = (at?: Dynamic) => {
    for (let column of holds.columns as Dynamic) {
      let largest = measureOfColumn(column) === 'numbers' ? readMeasureCondition(words, at, column, today2) : null;
      let kind = largest?.condition?.kind;
      if (largest === null || (kind !== 'isAmongTheLargest' && kind !== 'isAmongTheSmallest')) continue;
      let afterLargest = at + largest.wordCount;
      let byColumn = words[afterLargest]?.plain === 'by' ? columnNamedAt(holds, words, afterLargest + 1) : null;
      let wordAfter = words[afterLargest + 1 + (byColumn?.wordCount ?? 0)]?.plain;
      if (byColumn?.column === column && (wordAfter === undefined || LIST_JOINERS.has(wordAfter)))
        return {
          ...largest,
          column: column,
          wordCount: largest.wordCount + 1 + byColumn.wordCount,
        };
    }
    return null;
  };
  let columnTestAt = (at?: Dynamic) => {
    let named = columnNamedAt(holds, words, at, true, true);
    if (named === null) return null;
    let testAt: Dynamic = at + named.wordCount;
    if (sortDirectionAt(words, testAt, named.column) !== undefined) return named;
    while (EQUALS_WORDS.has(words[testAt]?.plain ?? '')) testAt += 1;
    if (NEGATING_WORDS.has(words[testAt]?.plain ?? '') && readTextOrColumnTest(named.column, testAt) === null) testAt += 1;
    return readTextOrColumnTest(named.column, testAt) !== null || (named.isPart && readMeasureCondition(words, testAt, named.column, today2) !== null)
      ? named
      : null;
  };
  let valuesNamedHere = (at?: Dynamic) =>
    valuesNamedAt(holds, words, at, {
      only: null,
      rather: null,
    });
  let namesSomethingAt = (at?: Dynamic) => columnNamedAt(holds, words, at, true) !== null || valuesNamedHere(at).length > 0;
  let namesPersonAt = (at?: Dynamic) => {
    let nameAt = words[at]?.plain === 'to' ? at + 1 : at;
    let valueNamed = valueNamedAt(holds, words, nameAt, {
      only: null,
      rather: null,
    });
    return (
      FIRST_PERSON_WORDS.has(words[nameAt]?.plain ?? '') ||
      unassignedPhraseLengthAt(words, nameAt) > 0 ||
      (valueNamed !== null && isPeopleColumn(valueNamed.column))
    );
  };
  let columnToTestAt = (at?: Dynamic) => {
    let named = columnNamedAt(holds, words, at);
    if (named === null || named.column.kind === 'checkbox' || isOnlyTextColumn(holds, named.column)) return null;
    let saysDate = named.column.kind === 'date' && words[at + named.wordCount]?.plain === 'date';
    return startsColumnTestAt(at)
      ? null
      : {
          ...named,
          wordCount: named.wordCount + Number(saysDate),
        };
  };
  let readCheckboxWords = (at?: Dynamic) => {
    let next: Dynamic = at;
    while (EQUALS_WORDS.has(words[next]?.plain ?? '')) next += 1;
    let hadEqualsWord = next > at;
    let notBefore =
      NOT_VERBS.has(words[next]?.plain ?? '') &&
      (CHECKED_RULE_WORDS.has(words[next + 1]?.plain ?? '') || UNCHECKED_WORDS.has(words[next + 1]?.plain ?? ''))
        ? words[next]
        : undefined;
    if (notBefore !== undefined) next += 1;
    let said =
      columnNamedAt(holds, words, next) !== null || valuesNamedHere(next).some(({ wordCount: wordCount }: Dynamic) => wordCount > 1)
        ? NO_WORD_TOKEN
        : (words[next] ?? NO_WORD_TOKEN);
    let endsHere =
      words[next + 1] === undefined ||
      LIST_JOINERS.has(words[next + 1]?.plain ?? '') ||
      SORT_BY_PHRASES.some((phrase?: Dynamic) => wordsMatchAt(words, next + 1, phrase));
    let isUnassigned = unassignedPhraseLengthAt(words, next) > 0 && !namesSomethingAt(next + 1);
    let nextColumn = columnNamedAt(holds, words, next + 1);
    let isSetCheckbox =
      nextColumn !== null &&
      words[next + 1 + nextColumn.wordCount]?.plain === 'set' &&
      readAnyTestFor(nextColumn.column, next + 1 + nextColumn.wordCount)?.wordCount === 1;
    let isNoBeforeName = said.plain === 'no' && !hadEqualsWord && (columnToTestAt(next + 1) !== null || isSetCheckbox || isUnassigned);
    let isNoOfEither = said.plain === 'no' && !hadEqualsWord && !endsHere && !isNoBeforeName;
    let isOfBoxes = CHECKED_RULE_WORDS.has(said.plain) || (UNCHECKED_WORDS.has(said.plain) && !isNoBeforeName);
    return {
      next: next,
      notBefore: notBefore,
      said: said,
      isOfBoxes: isOfBoxes,
      isNoOfEither: isNoOfEither,
    };
  };
  let saysBoxesAt = (at?: Dynamic) => {
    let { next: next, isOfBoxes: isOfBoxes } = readCheckboxWords(at);
    return isOfBoxes && !namesSomethingAt(next);
  };
  let readSortAt = (at?: Dynamic, isDirectionOnly: Dynamic = false) => {
    let {
      keys: keys,
      last: lastColumn2,
      next: next,
    } = readSortKeys(holds, words, at, (word?: Dynamic) => notPlaced.push(word), isDirectionOnly);
    if (isDirectionOnly && next === at) notPlaced.push(...words.slice(at, at + 1));
    addSortKeys(keys, at, next);
    let wordAfter = words[next];
    if (
      wordAfter !== undefined &&
      lastColumn2 !== null &&
      !LIST_JOINERS.has(words[next - 1]?.plain ?? '') &&
      (readAnyTestFor(lastColumn2, next) !== null || isFillerWord(wordAfter))
    )
      notPlaced.push(wordAfter);
    return isDirectionOnly ? Math.max(next, at + 1) : next;
  };
  let readSuperlativeAt = (at?: Dynamic) => {
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    let direction = SUPERLATIVE_DIRECTIONS.get(plain);
    if (direction === undefined) return null;
    let named = columnNamedAt(holds, words, at + 1, true, true);
    let saysDate = named?.column.kind === 'date' && words[at + 1 + named.wordCount]?.plain === 'date';
    let wordCount = 1 + (named?.wordCount ?? 0) + Number(saysDate);
    let onTopPhrase = ON_TOP_PHRASES.find((phrase?: Dynamic) => wordsMatchAt(words, at + wordCount, phrase));
    let [column, ...otherColumns] = holds.columns.filter((column2?: Dynamic) => isSuperlativeFor(column2, plain));
    let isTested = (asksByColumn.get(column?.c ?? '')?.meets.length ?? 0) > 0;
    let fitsAlone =
      otherColumns.length === 0 &&
      !NON_COLUMN_SUPERLATIVES.has(plain) &&
      (isTested || !AGE_SUPERLATIVES.has(plain)) &&
      !holds.columns.some(isRankColumn) &&
      !(DATE_SUPERLATIVES.has(plain) && holds.columns.some(looksLikeDateColumn));
    let sortColumn = named === null ? (fitsAlone ? column : undefined) : named.column;
    let isAlsoNamedValue = named !== null && valuesNamedHere(at + 1).length > 0;
    if (onTopPhrase === undefined || sortColumn === undefined || !isSuperlativeFor(sortColumn, plain) || isAlsoNamedValue) return null;
    return {
      key: {
        c: sortColumn.c,
        direction: direction,
      },
      wordCount: wordCount + onTopPhrase.length,
    };
  };
  let bareConditionAt = (at?: Dynamic) => {
    let { plain: plain } = words[at] ?? NO_WORD_TOKEN;
    if (!/^[\d.<>≤≥$€£¥]/.test(plain) && !NUMBER_CONDITION_WORDS.has(plain) && !DATE_CONDITION_WORDS.has(plain)) return null;
    let saysOverdue = saysOverdueAt(words, at);
    let readings: Dynamic = [];
    for (let column of holds.columns as Dynamic) {
      if (saysOverdue && !isDueColumn(column)) continue;
      let reading = readMeasureCondition(words, at, column, today2);
      if (reading?.condition?.kind === 'isAmongTheLargest' || reading?.condition?.kind === 'isAmongTheSmallest') continue;
      if (reading === null || reading.wordCount < (readings[0]?.wordCount ?? 0)) continue;
      readings =
        reading.wordCount === readings[0]?.wordCount
          ? [
              ...readings,
              {
                ...reading,
                column: column,
              },
            ]
          : [
              {
                ...reading,
                column: column,
              },
            ];
    }
    let [only, ...others] = readings;
    if (only === undefined || others.length > 0) return null;
    let slice = words.slice(at, at + only.wordCount);
    let [lastWord, wordAfter] = [slice.at(-1) ?? NO_WORD_TOKEN, words[at + only.wordCount] ?? NO_WORD_TOKEN];
    if (
      slice.some(
        (word?: Dynamic) =>
          valuesNamedHere(word.at).length > 0 ||
          holds.columns.some((column?: Dynamic) => isPeopleColumn(column) && leadingNameWordsOf(column).has(word.plain)) ||
          (word.plain.length > 2 &&
            columnNamesOf(holds.columns).some(
              ({ column: column, name: name }: Dynamic) => column !== only.column && name.includes(word.plain),
            )),
      )
    )
      return null;
    if (only.column.kind === 'date') {
      if (lastWord === words.at(-1) && !/\s$/.test(typed) && /^\p{L}/u.test(lastWord.plain) && mayBeUnfinishedNameAt(lastWord.at)) return null;
      let column =
        slice.some((word?: Dynamic) => isMonthName(word.plain) || word.said === '/') &&
        !slice.some((word?: Dynamic) => /^\d{4}$/.test(word.plain));
      let reading =
        today2 !== null &&
        numbersOfCondition(only.condition).some(
          (dayNumber?: Dynamic) => Math.abs(dayNumber - dateToSerial(today2)) <= MOST_DAYS_FROM_TODAY_FOR_DATES,
        );
      let isNearDates =
        only.column.areMoreValuesLeftOut ||
        (today2 !== null &&
          only.column.values.some(
            ({ value: value }: Dynamic) => value?.kind === 'number' && Math.abs(value.value - dateToSerial(today2)) <= 366,
          ));
      return (column && !reading) || plain === 'starting' || !isNearDates || holds.columns.some(looksLikeDateColumn) ? null : only;
    }
    let letterWords = slice.filter((word?: Dynamic) => /^\p{L}/u.test(word.plain) && !NUMBER_CONDITION_WORDS.has(word.plain));
    let named = columnNamedAt(holds, words, letterWords[0]?.at ?? -1, true, true);
    let namesOtherColumn = letterWords.length > 0 && (named?.column !== only.column || named.wordCount !== letterWords.length);
    let isFollowedByNoun =
      [RECORD_NOUNS, TABLE_SUBJECT_NOUNS, TASK_NOUNS, FIRST_PERSON_WORDS].some((wordSet?: Dynamic) => wordSet.has(wordAfter.plain)) ||
      namesSomethingAt(wordAfter.at);
    let isOverdueNear = [wordAfter.at, at - 1, at - 2].some((at2?: Dynamic) => saysOverdueAt(words, at2));
    let isOtherCurrency =
      letterWords.length === 0 &&
      only.column.kind !== 'currency' &&
      slice.some((word?: Dynamic) => /^[$€£¥]$/.test(word.plain)) &&
      holds.columns.some((column?: Dynamic) => column !== only.column && measureOfColumn(column) === 'numbers');
    return namesOtherColumn || isFollowedByNoun || isOverdueNear || isOtherCurrency ? null : only;
  };
  let checkboxColumnNames = columnNamesOf(holds.columns).filter(
    ({ column: column, name: name }: Dynamic) => column.kind === 'checkbox' && name.length > 1,
  );
  let checkboxPhraseAt = (at?: Dynamic) => {
    for (let { column: column, name: name } of checkboxColumnNames as Dynamic)
      for (let count: Dynamic = 1; count < name.length; count += 1) {
        let end: Dynamic = at + count;
        while (LINKING_VERBS.has(words[end]?.plain ?? '') || NOT_VERBS.has(words[end]?.plain ?? '')) end += 1;
        let [denied, ...moreDenied] = words.slice(at + count, end).filter(({ plain: plain }: Dynamic) => NOT_VERBS.has(plain));
        if (
          end > at + count &&
          moreDenied.length === 0 &&
          nameMatchesAt(words, at, name.slice(0, count)) &&
          wordsMatchAt(words, end, name.slice(count))
        )
          return {
            column: column,
            wordCount: end + name.length - count - at,
            denied: denied,
          };
      }
    return null;
  };
  let atAfterColumn: Dynamic = -1;
  for (let at: Dynamic = 0; at < words.length; ) {
    if (wasColumnTouched) [wasColumnTouched, atAfterColumn] = [false, at];
    if (stopsReading) {
      notPlaced.push(...words.slice(at));
      break;
    }
    if (onlyColumn !== null) {
      at = readForColumn(onlyColumn, at);
      continue;
    }
    let word = words[at] ?? NO_WORD_TOKEN;
    if (word.isAfterHyphen) notPlaced.push(word);
    let checkboxPhrase = checkboxPhraseAt(at);
    if (checkboxPhrase !== null) {
      if (checkboxPhrase.denied !== undefined) noteNegation(checkboxPhrase.denied);
      addValuesFor(checkboxPhrase.column, [CHECKED_BOOLEAN_VALUE]);
      resetCurrentColumn();
      at += checkboxPhrase.wordCount;
      continue;
    }
    let valueNamed = valueNamedAt(holds, words, at, {
      only: null,
      rather: currentColumn,
    });
    if (/[–—]/.test(word.gap) && currentColumn !== null && valueNamed?.column === currentColumn) notPlaced.push(word);
    let valueNamedHere =
      valueNamed?.wordCount === 1 && NEGATING_WORDS.has(word.plain) && (namesSomethingAt(at + 1) || namesPersonAt(at + 1)) ? null : valueNamed;
    let columnNamed = columnNamedAt(holds, words, at) ?? columnTestAt(at);
    let valueNamedSure = valueNamedHere?.isFirstName === true && columnNamed !== null ? null : valueNamedHere;
    let [testAt, negatingWord]: Dynamic = [at + (columnNamed?.wordCount ?? 0), null];
    if (columnNamed?.column.kind === 'date' && words[testAt]?.plain === 'date') testAt += 1;
    let afterColumn = testAt;
    while (EQUALS_WORDS.has(words[testAt]?.plain ?? '')) testAt += 1;
    let testForColumnAt = (at2?: Dynamic) => {
      if (columnNamed === null) return null;
      if (!isOnlyTextColumn(holds, columnNamed.column)) return readAnyTestFor(columnNamed.column, at2);
      let textTest = readTextOrColumnTest(columnNamed.column, at2);
      return textTest === null
        ? null
        : {
            kind: 'condition',
            ...textTest,
          };
    };
    if (
      columnNamed !== null &&
      words[testAt]?.plain === 'in' &&
      testForColumnAt(testAt) === null &&
      valueNamedAt(holds, words, testAt + 1, {
        only: columnNamed.column,
        rather: null,
      }) !== null
    )
      testAt += 1;
    if (testForColumnAt(testAt) === null && NEGATING_WORDS.has(words[testAt]?.plain ?? '') && testForColumnAt(testAt + 1) !== null) {
      negatingWord = words[testAt] ?? null;
      testAt += 1;
    }
    let testRead = testForColumnAt(testAt);
    let test = columnNamed?.isPart === true && saysOverdueAt(words, testAt) && !isDueColumn(columnNamed.column) ? null : testRead;
    let isCheckboxNameEnd =
      columnNamed?.column.kind === 'checkbox' &&
      isWordOrItsPlural(words[afterColumn - 1]?.plain ?? '', plainWordsOf(columnNamed.column.name ?? '').at(-1) ?? '');
    let hasTest = test !== null || (isCheckboxNameEnd && saysBoxesAt(afterColumn));
    let isValueAsLongAsColumn = valueNamedSure !== null && columnNamed !== null && valueNamedSure.wordCount === columnNamed.wordCount;
    let isValueNameLonger =
      valueNamedHere === null &&
      columnNamed !== null &&
      (valuesNamedAt(holds, words, at, {
        only: null,
        rather: currentColumn,
      })[0]?.wordCount ?? 0) >= columnNamed.wordCount;
    let prefersColumn =
      columnNamed !== null &&
      (isValueNameLonger
        ? hasTest
        : valueNamedSure === null ||
          valueNamedSure.wordCount < columnNamed.wordCount ||
          (isValueAsLongAsColumn && (valueNamedSure.column === columnNamed.column || hasTest)));
    let sortByPhrase = SORT_BY_PHRASES.find((phrase?: Dynamic) => wordsMatchAt(words, at, phrase));
    let largestBy = LARGEST_SMALLEST_WORDS.has(word.plain) ? readLargestBy(at) : null;
    let namesNothing = columnNamed === null && valueNamedSure === null;
    let superlative = namesNothing ? readSuperlativeAt(at) : null;
    let bareCondition = namesNothing && !needsHeaders ? bareConditionAt(at) : null;
    let sortDirectionAfter =
      lastColumn !== null && measureOfColumn(lastColumn) !== null && (asksByColumn.get(lastColumn.c)?.meets.length ?? 0) > 0 && word.plain.length > 1
        ? sortDirectionAt(words, at, lastColumn)
        : undefined;
    if (columnNamed !== null && prefersColumn) {
      let { column: column } = columnNamed;
      if (test !== null && isLongerDateReading(column, at + columnNamed.wordCount - 1, test)) {
        (notPlaced.push as Dynamic)(...words.slice(at, testAt + test.wordCount));
        at = testAt + test.wordCount;
        continue;
      }
      let noWord = negation !== null && negation.of === null && NO_WITHOUT_WORDS.has(negation.word.plain) ? negation.word : null;
      if (
        test !== null &&
        noWord !== null &&
        isPeopleColumn(column) &&
        testAt === afterColumn &&
        (test.kind === 'viewer' || (test.kind === 'values' && test.isNot !== true))
      ) {
        (notPlaced.push as Dynamic)(...words.slice(noWord.at, testAt + test.wordCount));
        negation = null;
        at = testAt + test.wordCount;
        continue;
      }
      if (test !== null) {
        if (wordsMatchAt(words, testAt, ['set', 'to'])) resetCurrentColumn();
        if (negatingWord !== null) noteNegation(negatingWord);
        at = placeTest(column, test, testAt);
        columnOfLastTest = currentColumn;
        continue;
      }
      let isSortFirst =
        measureOfColumn(column) !== null && words[afterColumn + 1]?.plain === 'first' && SUPERLATIVE_DIRECTIONS.has(words[afterColumn]?.plain ?? '');
      if (negation === null && havingWord === null && (isSortFirst || sortDirectionAt(words, afterColumn, column) !== undefined)) {
        at = readSortAt(at, true);
        continue;
      }
      at = afterColumn;
      let negationWord = negation !== null && negation.of === null ? negation.word : null;
      let saysNoOrWithout = negationWord !== null && NO_WITHOUT_WORDS.has(negationWord.plain);
      let isSameColumn = currentColumn === column && !LIST_JOINERS.has(words[word.at - 1]?.plain ?? '');
      if (column.kind === 'checkbox') {
        let {
          next: nextWord,
          notBefore: notBefore,
          said: saidWord,
          isOfBoxes: isOfBoxes,
          isNoOfEither: isNoOfEither,
        } = readCheckboxWords(afterColumn);
        if ((columnNamed.isPart && !isOfBoxes) || (words[word.at - 1]?.plain === 'to' && !isCheckboxNameEnd))
          notPlaced.push(...words.slice(word.at, afterColumn));
        if (isNoOfEither) {
          let [found] = valuesNamedHere(nextWord + 1);
          notPlaced.push(...words.slice(nextWord, nextWord + 1 + (found?.wordCount ?? 1)));
        }
        if (isOfBoxes) {
          at = nextWord + 1;
          let found = [negationWord, notBefore, CHECKED_RULE_WORDS.has(saidWord.plain) ? undefined : saidWord].filter(
            (word2?: Dynamic) => word2 !== null && word2 !== undefined,
          );
          if (found.length > 1) notPlaced.push(saidWord);
          else if (negationWord === null && found[0] !== undefined) noteNegation(found[0]);
        }
        addValuesFor(column, [CHECKED_BOOLEAN_VALUE]);
      } else if (isOnlyTextColumn(holds, column)) {
        if (negationWord !== null && saysNoOrWithout) notPlaced.push(negationWord);
        let nextWord = words.slice(testAt).find(({ plain: plain }: Dynamic) => !NEGATING_WORDS.has(plain)) ?? NO_WORD_TOKEN;
        if (
          words
            .slice(afterColumn, nextWord.at + 1)
            .some((word2?: Dynamic) => isWordBreakAt(words, word2.at) && word2.said !== '-' && word2.said !== '!') &&
          isSingleWordValueOf(column, nextWord.plain) &&
          namesSomethingAt(nextWord.at)
        )
          notPlaced.push(...words.slice(word.at, nextWord.at + 1));
        columnForKnownWords = column;
        resetCurrentColumn();
        continue;
      } else if (havingWord !== null && (negationWord === null || negationWord.at < havingWord.at)) {
        if (hasZeroValues(column)) notPlaced.push(havingWord);
        negation = null;
        addValuesFor(column, [null], negationWord === null);
      } else if (havingWord === null && saysNoOrWithout) {
        if (hasZeroValues(column)) notPlaced.push(negationWord);
        negation = null;
        addValuesFor(column, [null]);
      } else if (!isSameColumn) {
        notPlaced.push(...words.slice(word.at, afterColumn));
        for (let nextWord of words.slice(word.at, afterColumn) as Dynamic) columnNameWords2.add(nextWord);
        columnForKnownWords = column;
      }
      resetCurrentColumn();
    } else if (
      valueNamedSure !== null &&
      !isValueAsLongAsColumn &&
      (valueNamedSure.mayMeanMore === false ||
        (valueNamedSure.mayMeanMore === 'unlessTypedPlainly' && isTypedPlainly && valueNamedSure.isExact && negation === null) ||
        columnOfLastTest === valueNamedSure.column ||
        columnNamedAt(holds, words, at + valueNamedSure.wordCount)?.column === valueNamedSure.column)
    ) {
      addValuesFor(valueNamedSure.column, valueNamedSure.values);
      at += valueNamedSure.wordCount;
    } else if (valueNamedSure !== null) {
      (notPlaced.push as Dynamic)(...words.slice(at, at + valueNamedSure.wordCount));
      resetCurrentColumn();
      at += valueNamedSure.wordCount;
    } else if (sortByPhrase !== undefined && startsSortByAt(at)) at = readSortAt(at + sortByPhrase.length);
    else if (superlative !== null) {
      addSortKeys([superlative.key], at, at + superlative.wordCount);
      at += superlative.wordCount;
    } else if (largestBy !== null && largestBy.condition !== null) {
      addCondition(largestBy.column, largestBy.condition);
      at += largestBy.wordCount;
    } else if (bareCondition !== null) {
      let column = atAfterColumn === at && lastColumn !== null && !isPeopleColumn(lastColumn);
      if (bareCondition.column.kind === 'date' && column) notPlaced.push(word);
      at = placeTest(
        bareCondition.column,
        {
          kind: 'condition',
          ...bareCondition,
        },
        at,
      );
    } else if (sortByPhrase !== undefined) at = readSortAt(at + sortByPhrase.length);
    else if (SORT_VERBS.has(word.plain)) {
      if (columnNamedAt(holds, words, at + 1, true, true) !== null) at = readSortAt(at + 1);
      else {
        pendingSortVerb = word;
        resetCurrentColumn();
        at += 1;
      }
    } else if (sortDirectionAfter !== undefined && lastColumn !== null) {
      let column = {
        c: lastColumn.c,
        direction: sortDirectionAfter[1],
      };
      addSortKeys([column], at, at + sortDirectionAfter[0].length);
      at += sortDirectionAfter[0].length;
    } else {
      let [column] = valuesNamedAt(holds, words, at, {
        only: null,
        rather: currentColumn,
      });
      for (let found of words.slice(at, at + (column?.wordCount ?? 0)) as Dynamic) partialValueWords.add(found);
      let noWord = word.plain === 'me' && SHOW_VERBS.has(words[at - 1]?.plain ?? '');
      let isSortFirst = words[at + 1]?.plain === 'but';
      let negationWord = ALL_WORDS.has(words[at - 1]?.plain ?? '') || ANYONE_WORDS.has(words[at - 1]?.plain ?? '');
      let isSameColumn = !(word.plain.startsWith('un') && word.plain.length > 5)
        ? undefined
        : holds.columns.find(
            ({ kind: kind, name: name }: Dynamic) => kind === 'checkbox' && plainWordsOf(name ?? '').join(' ') === word.plain.slice(2),
          );
      if (word.plain === 'assigned') {
        let found = words[at - 1]?.plain === 'date' ? at - 1 : at;
        let others = [1, 2, 3].some(
          (wordCount?: Dynamic) =>
            [at, found].some((end?: Dynamic) => {
              let value = columnNamedAt(holds, words, end - wordCount, true);
              return value?.wordCount === wordCount && asksByColumn.get(value.column.c)?.oneOf.includes(null) === true;
            }),
        );
        let peopleColumn = currentColumn !== null && isPeopleColumn(currentColumn) && !LIST_JOINERS.has(words[at - 1]?.plain ?? '');
        let wordAfterPhrase = namesPersonAt(at + 1);
        if (!wordAfterPhrase && !peopleColumn && !others) {
          notPlace(word);
          resetCurrentColumn();
        }
        if (wordAfterPhrase) resetCurrentColumn();
        at += wordAfterPhrase && words[at + 1]?.plain === 'to' ? 2 : 1;
        continue;
      }
      if (isSameColumn !== undefined && negation === null) {
        noteNegation(word);
        addValuesFor(isSameColumn, [CHECKED_BOOLEAN_VALUE]);
        resetCurrentColumn();
        at += 1;
        continue;
      }
      let nextWord = (word.plain === 'no' || word.plain === 'not') && namesSomethingAt(at + 1);
      let notBefore = word.plain === 'not' && words[at + 1]?.plain === 'assigned' && namesPersonAt(at + 2);
      let saidWord = nextWord || notBefore ? 0 : unassignedPhraseLengthAt(words, at);
      let isOfBoxes = EMPTY_WORDS.has(word.plain) ? columnToTestAt(at + 1) : null;
      if (saidWord > 0) {
        let [found, ...others] = holds.columns.filter(isPeopleColumn);
        let peopleColumn = currentColumn !== null && isPeopleColumn(currentColumn) ? currentColumn : others.length === 0 ? found : undefined;
        let wordAfterPhrase = words[at + saidWord];
        let endsPhrase = wordAfterPhrase === undefined || isFillerWord(wordAfterPhrase) || TASK_NOUNS.has(wordAfterPhrase.plain);
        let isFollowedByIsHas =
          IS_HAS_WORDS.has(wordAfterPhrase?.plain ?? '') || (POSSESSIVE_ONES_WORDS.has(words[at + saidWord - 1]?.plain ?? '') && !endsPhrase);
        if (peopleColumn === undefined || isFollowedByIsHas || isNegated(peopleColumn)) {
          (notPlaced.push as Dynamic)(...words.slice(at, at + saidWord));
          resetCurrentColumn();
        } else addValuesFor(peopleColumn, [null]);
        at += saidWord;
        continue;
      }
      if (isOfBoxes !== null) {
        if (isNegated(isOfBoxes.column)) {
          (notPlaced.push as Dynamic)(...words.slice(at, at + 1 + isOfBoxes.wordCount));
          resetCurrentColumn();
        } else addValuesFor(isOfBoxes.column, [null]);
        at += 1 + isOfBoxes.wordCount;
        continue;
      }
      let isNoOfEither = words[at - 1]?.plain === 'or' && currentColumn?.kind !== 'checkbox';
      if (currentColumn !== null && isNoOfEither && !isNegated(currentColumn) && BLANK_WORDS.has(word.plain)) {
        addValuesFor(currentColumn, [null]);
        at += 1;
        continue;
      }
      if (FIRST_PERSON_WORDS.has(word.plain) && !noWord) {
        let [found, ...others] = holds.columns.filter((column2?: Dynamic) => valuesOfUserInColumn(column2, viewerId).length > 0);
        if (found === undefined || others.length > 0) notPlaced.push(word);
        else addValuesFor(found, valuesOfUserInColumn(found, viewerId));
      } else if (NEGATING_WORDS.has(word.plain) || EXCLUDE_VERBS.has(word.plain) || (word.plain === 'but' && negationWord)) noteNegation(word);
      else if (wordsMatchAt(words, at, ['leave', 'out'])) {
        noteNegation(word);
        at += 1;
      } else if (LIST_JOINERS.has(word.plain)) noteJoiner(word);
      else {
        let found =
          NEGATING_WORDS.has(words[at + 1]?.plain ?? '') &&
          (word.plain === 'but' || HAVING_WORDS.has(word.plain)) &&
          columnNamedAt(holds, words, at + 1) === null;
        let others =
          QUESTION_FILLER_WORDS.has(word.plain) && holds.columns.some((column2?: Dynamic) => isSingleWordValueOf(column2, word.plain));
        let peopleColumn = word.plain === 'but' && lastColumn !== null && !asksForAll && columnNamedAt(holds, words, at + 1) !== null;
        let wordAfterPhrase = !others && (isFillerWord(word) || TASK_NOUNS.has(word.plain) || noWord || found || peopleColumn);
        let endsPhrase =
          word.plain === 'to' &&
          currentColumn !== null &&
          valueNamedAt(holds, words, at + 1, {
            only: currentColumn,
            rather: null,
          }) !== null;
        columnForKnownWords = columnNamedAt(holds, words, at, true)?.column ?? columnForKnownWords;
        if (found) resetCurrentColumn();
        else if (HAVING_WORDS.has(word.plain)) havingWord = word;
        else if (ALL_WORDS.has(word.plain) || (ANYONE_WORDS.has(word.plain) && (isSortFirst || !LIST_JOINERS.has(words[at - 1]?.plain ?? ''))))
          asksForAll = true;
        else if (!wordAfterPhrase || isRangeWordFor(word, lastColumn) || endsPhrase) notPlace(word);
        if (isRangeWordFor(word, lastColumn)) columnForKnownWords = lastColumn;
        if (word.plain === YET_WORD || (word.plain === 'still' && NEGATING_WORDS.has(words[at + 1]?.plain ?? ''))) yetWord ??= word;
        resetCurrentColumn();
      }
      at += 1;
    }
  }
  endClause();
  if (pendingSortVerb !== null && sortBy.length === 0) notPlaced.push(pendingSortVerb);
  let excludesLastOption = ({ c: c, optionsOfDropdown: optionsOfDropdown }: Dynamic) => {
    let excludedTexts = (asksByColumn.get(c)?.noneOf ?? []).filter((value?: Dynamic) => value?.kind === 'text');
    return excludedTexts.length === 0 || excludedTexts.some((value?: Dynamic) => value.value === optionsOfDropdown?.at(-1));
  };
  if (yetWord !== null && !holds.columns.every((column?: Dynamic) => isPeopleColumn(column) || excludesLastOption(column)))
    notPlaced.push(yetWord);
  let hasSeveralAsksInColumn = [...asksByColumn.values()].some(
    ({ oneOf: oneOf, noneOf: noneOf, meets: meets }: Dynamic) => Number(oneOf.length > 0) + Number(noneOf.length > 0) + meets.length > 1,
  );
  let isEmojiOfFewValues = (emoji?: Dynamic) =>
    holds.columns.some((column?: Dynamic) => isColumnOfFewValues(column) && emojiInColumn(column).has(emoji));
  let emojiSaid = [...new (Set as Dynamic)(onlyColumn === null ? emojiInText(typed) : [])].filter(
    (emoji?: Dynamic) => CROSS_MARK_EMOJI.has(emoji) || isEmojiOfFewValues(emoji),
  );
  let textsOfAsks = (emojiSaid.length === 0 ? [] : holds.columns).flatMap(({ c: c, name: name }: Dynamic) => {
    let { oneOf = [], noneOf = [], meets = [] } = asksByColumn.get(c) ?? {};
    let isAsked = asksByColumn.has(c) || sortBy.some((key?: Dynamic) => key.c === c);
    return oneOf
      .concat(noneOf)
      .map((value?: Dynamic) => String(value?.value ?? ''))
      .concat(
        meets.map((condition?: Dynamic) => ('text' in condition ? condition.text : '')),
        isAsked ? (name ?? '') : '',
      );
  });
  let emojiNotPlaced = emojiSaid.filter((emoji?: Dynamic) => !textsOfAsks.some((text?: Dynamic) => text.includes(emoji)));
  if (wordsNotPlacedSet.size > 0 || hasSeveralAsksInColumn || emojiNotPlaced.length > 0) {
    let at = [...wordsNotPlacedSet];
    at.sort((word2?: Dynamic, other?: Dynamic) => word2.at - other.at);
    let word = (word2?: Dynamic) => COMMAND_WORDS.has(word2.plain) || word2 !== words.at(-1) || /\s$/.test(typed);
    let checkboxPhrase = knownWordsForColumn(columnForKnownWords, today2);
    let valueNamed = onlyColumn !== null && checkboxPhrase === TEXT_TEST_WORDS ? null : checkboxPhrase;
    let valueNamedHere = (onlyColumn === null ? holds.columns : [onlyColumn]).map(leadingNameWordsOf);
    let columnNamed = (word2?: Dynamic) =>
      COMMAND_WORDS.has(word2.plain) ||
      (onlyColumn === null && WORDS_NOT_TAKEN_AS_VALUES.has(word2.plain)) ||
      columnNameWords2.has(word2) ||
      valueNamedHere.some((leadingWords?: Dynamic) => leadingWords.has(word2.plain)) ||
      partialValueWords.has(word2) ||
      (EMPTY_WORDS.has(word2.plain) && word2 !== words.at(-1) && mayBeUnfinishedNameAt(word2.at + 1)) ||
      (valueNamed !== null &&
        word2 !== unreadConditionWord &&
        (valueNamed.has(word2.plain) || (valueNamed !== TEXT_TEST_WORDS && /^-?[\d.]/.test(word2.plain))));
    let [valueNamedSure, testAt]: Dynamic = [0, words.length - 1];
    for (; testAt >= 0 && valueNamedSure < at.length; testAt -= 1) {
      let { plain: plain } = words[testAt] ?? NO_WORD_TOKEN;
      if (wordsNotPlacedSet.has(words[testAt] ?? NO_WORD_TOKEN)) valueNamedSure += 1;
      else if (!FILTER_FILLER_WORDS.has(plain) && !LIST_JOINERS.has(plain)) break;
    }
    let isOnItsWay =
      numberWordsInDoubt.size === 0 &&
      !(isDecimalComma && at.some(({ said: said }: Dynamic) => /^-?\d*,\d+$/.test(said))) &&
      (at.length > 0 || (emojiNotPlaced.length > 0 && !hasSeveralAsksInColumn)) &&
      emojiNotPlaced.every(isEmojiOfFewValues) &&
      valueNamedSure === at.length &&
      at.every((wordNotPlaced?: Dynamic) => columnNamed(wordNotPlaced) || !word(wordNotPlaced));
    let afterColumn: Dynamic = [];
    for (let plain of at as Dynamic)
      if (afterColumn.at(-1)?.at(-1)?.at === plain.at - 1) afterColumn.at(-1)?.push(plain);
      else afterColumn.push([plain]);
    let testForColumnAt = (word2?: Dynamic) =>
      !word2.isInQuotes &&
      (COMMAND_WORDS.has(word2.plain) ||
        columnNameWords2.has(word2) ||
        BLANK_WORDS.has(word2.plain) ||
        FILLED_WORDS.has(word2.plain) ||
        word2.plain === 'but' ||
        EXCLUDE_VERBS.has(word2.plain) ||
        word2.plain === 'assigned');
    let testRead = (texts?: Dynamic) => [
      ...texts,
      ...emojiNotPlaced.filter((emoji?: Dynamic) => !texts.some((text?: Dynamic) => text.includes(emoji))),
    ];
    return {
      kind: 'notRead',
      wordsNotPlaced: testRead(afterColumn.map(textOfWords)),
      wordsNotKnown: testRead(afterColumn.filter((group?: Dynamic) => !group.every(testForColumnAt)).map(textOfWords)),
      isOnItsWay: isOnItsWay,
    };
  }
  let filter = filterOfEntries(filterClausesOfAsks(asksByColumn));
  if (filter === null && sortBy.length === 0 && !asksForAll) return FILTER_WORDS_NOT_READ;
  return {
    kind: 'read',
    asked: {
      filter: filter,
      sortBy: sortBy,
    },
  };
}
export const CHECKED_BOOLEAN_VALUE = {
  kind: 'boolean',
  value: true,
};
export const filterValueKey = (filterValue?: Dynamic) => (filterValue === null ? '' : `${filterValue.kind} ${filterValue.value}`);
export const isDueColumn = (column?: Dynamic) => columnNameWords(column).some((word?: Dynamic) => DUE_WORDS.has(word));
export const numbersOfCondition = (condition?: Dynamic) =>
  (condition?.kind === 'numberIs'
    ? [condition.operand]
    : condition?.kind === 'numberIsBetween'
      ? [condition.oneEnd, condition.otherEnd]
      : []
  ).flatMap((operand?: Dynamic) => (operand.kind === 'number' ? [operand.number] : []));
export const isRankColumn = (column?: Dynamic) => columnNameWords(column).some((word?: Dynamic) => RANK_WORDS.has(word));
export const isSuperlativeFor = (column?: Dynamic, superlative?: Dynamic) =>
  measureOfColumn(column) === (DATE_SUPERLATIVES.has(superlative) ? 'days' : 'numbers') && !isRankColumn(column);
export const sortDirectionAt = (words?: Dynamic, at?: Dynamic, column?: Dynamic) =>
  [...SORT_DIRECTION_PHRASES, ...(column !== null && measureOfColumn(column) !== null && !isRankColumn(column) ? RANGE_DIRECTION_PHRASES : [])].find(
    ([phrase]: Dynamic) => wordsMatchAt(words, at, phrase),
  );
export const isFillerWord = ({ plain: plain }: Dynamic) => FILTER_FILLER_WORDS.has(plain) || QUESTION_FILLER_WORDS.has(plain);
export const SORT_LIST_WORDS = new (Set as Dynamic)([...SORT_KEY_JOINERS, 'by', 'the']);
export const isRangeWordFor = (word?: Dynamic, column?: Dynamic) =>
  (word.plain === 'to' || word.isAfterHyphen) && column !== null && measureOfColumn(column) !== null;
export const textOfWords = (words?: Dynamic) =>
  words.map(({ said: said, gap: gap }: Dynamic, index?: Dynamic) => (index === 0 ? said : gap + said)).join('');
export const FILTER_WORDS_NOT_READ = {
  kind: 'notRead',
  wordsNotPlaced: [],
  wordsNotKnown: [],
  isOnItsWay: false,
};
export const isNumberSaid = ({ said: said }: Dynamic) => /^-?[\d.,]*\d$/.test(said);
