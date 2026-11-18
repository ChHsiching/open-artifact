import type { Dynamic } from '../dynamic.ts';
import { wordsMatchAt, plainWordsOf, splitIntoWords } from './tokens.ts';
import { columnNamedAt, isColumnOfFewValues } from './column-names.ts';
import { measureOfColumn } from './column-holds.ts';
import {
  hasNumbersAsText,
  isRankLikeColumn,
  readWordsAsTests,
  rewriteWords,
  NO_WORD_REWRITES,
  columnHasText,
  isSameAsJson,
  isAfterTextTest,
  onlySelectedColumn,
  TEXT_TEST_KINDS,
  plainTextOfWords,
  foreignNumberPattern,
  crossMarkPattern,
  leaveOutPattern,
  thousandsRangePattern,
  monthYearPattern,
  IS_ARE_WORDS,
  isSameTextIgnoringCase,
  STARTS_ENDS_WORDS,
  isTextTestAt,
  ruleWordRewrites,
  columnAfterWord,
  MOST_RULE_READINGS,
  isBeforeTodayTest,
  hasStatusLikeColumns,
  testsNotDone,
  operandsOfCondition,
} from './rule-tests.ts';
import {
  isUnquotedWord,
  RELATIVE_PRONOUNS,
  HUE_WORDS,
  FORMAT_PARTS_NOT_READ,
  RECORD_KIND_NOUNS,
  CELL_NOUNS,
  WHOLE_WORDS,
  formatPartsAtStart,
  formatPartsAtEnd,
  formatPartsInMiddle,
  formatOfParts,
  FONT_STYLE_PHRASES,
  TEXT_COLOR_WORDS,
  FILL_WORDS,
  PALE_WORDS,
  FORMAT_VERBS,
  FORMAT_VERB_PHRASES,
  FORMAT_LEAD_INS,
} from './rule-formats.ts';
import {
  MOST_CHARACTERS_OF_WORDS,
  NUMBER_CONDITION_WORDS,
  VAGUE_NOUNS,
  NO_WITHOUT_WORDS,
  ROW_NOUNS,
  TEXT_TEST_WORDS,
  CHECKED_RULE_WORDS,
  DATE_CONDITION_WORDS,
} from './vocabulary.ts';
import { RULE_WORD_REWRITES, UNCHECKED_RULE_WORDS } from './rule-tests-values.ts';
export function readColorScaleRule(words: Dynamic, holds: Dynamic, { selected: selected }: Dynamic) {
  let start: Dynamic = 0;
  while (SCALE_LEAD_WORDS.has(words[start]?.plain ?? '')) start += 1;
  let scalePhraseLength = (at?: Dynamic) =>
    COLOR_SCALE_PHRASES.find((phrase?: Dynamic) => wordsMatchAt(words, at, phrase))?.length ?? 0;
  let columnNamedFrom = (at?: Dynamic) => columnNamedAt(holds, words, at, true);
  let colorScaleRule = (c?: Dynamic, isAboutSelected?: Dynamic) => {
    let column = holds.columns.find((column2?: Dynamic) => column2.c === c);
    return column === undefined || measureOfColumn(column) === null || hasNumbersAsText(column) || isRankLikeColumn(column)
      ? null
      : {
          kind: 'read',
          c: column.c,
          isForRows: false,
          isAboutSelected: isAboutSelected,
          rule: {
            kind: 'colorScale',
          },
        };
  };
  if (scalePhraseLength(start) > 0) {
    let at: Dynamic = start + scalePhraseLength(start);
    if (at === words.length) return selected.length === 1 ? colorScaleRule(selected[0] ?? null, true) : null;
    if (SCALE_PREPOSITIONS.has(words[at]?.plain ?? '')) at += 1;
    if (words[at]?.plain === 'the') at += 1;
    let named = columnNamedFrom(at);
    return named !== null && at + named.wordCount === words.length ? colorScaleRule(named.column.c, false) : null;
  }
  let firstNamed = columnNamedFrom(start);
  if (firstNamed === null) return null;
  let afterName = start + firstNamed.wordCount;
  return scalePhraseLength(afterName) > 0 && afterName + scalePhraseLength(afterName) === words.length
    ? colorScaleRule(firstNamed.column.c, false)
    : null;
}
export function valueWordsOfTable(holds?: Dynamic) {
  let cached = valueWordsCache.get(holds);
  if (cached !== undefined) return cached;
  let wordLists = holds.columns.flatMap(
    (column?: Dynamic) => [
      ...(isShortEnoughToRead(column.name ?? '') ? plainWordsOf(column.name ?? '') : []).map((word?: Dynamic) => [word]),
      ...(isColumnOfFewValues(column)
        ? [
            ...column.values.flatMap(
              ({ value: value, userIds: userIds }: Dynamic) =>
                value?.kind !== 'text' ? [] : [value.value, ...(userIds.length > 0 ? plainWordsOf(value.value).slice(0, 1) : [])],
            ),
            ...(column.optionsOfDropdown ?? []),
          ]
            .filter(isShortEnoughToRead)
            .map(plainWordsOf)
        : []),
    ],
  );
  let byWord = new (Map as Dynamic)();
  for (let wordList of wordLists as Dynamic)
    for (let word of new (Set as Dynamic)(wordList) as Dynamic) {
      let lists = byWord.get(word);
      if (lists === undefined) byWord.set(word, [wordList]);
      else lists.push(wordList);
    }
  valueWordsCache.set(holds, byWord);
  return byWord;
}
export function columnsNamedIn(words?: Dynamic, holds?: Dynamic) {
  let named: Dynamic = [];
  for (let at: Dynamic = 0; at < words.length; ) {
    let found = isUnquotedWord(words[at]) ? columnNamedAt(holds, words, at, true) : null;
    if (found !== null)
      named.push({
        c: found.column.c,
        from: at,
        to: at + found.wordCount,
      });
    at += found?.wordCount ?? 1;
  }
  return named;
}
export function readTestsForRule(typed?: Dynamic, holds?: Dynamic, viewerId?: Dynamic, situation?: Dynamic, takesSelectionAsIs?: Dynamic) {
  let words = splitIntoWords(typed);
  let columnsNamed = columnsNamedIn(words, holds);
  let [firstNamed] = columnsNamed;
  let isNameThenWhere = firstNamed !== undefined && firstNamed.from === 0 && RELATIVE_PRONOUNS.has(words[firstNamed.to]?.plain ?? '');
  let read = readWordsAsTests(typed, holds, viewerId, situation);
  if (isNameThenWhere) {
    let restRead =
      firstNamed.to + 1 >= words.length
        ? null
        : readWordsAsTests(rewriteWords(words, firstNamed.to + 1, words.length, NO_WORD_REWRITES, /\s$/.test(typed)), holds, viewerId, situation);
    if (
      restRead?.kind === 'read' &&
      columnsNamed.slice(1).every(({ c: c }: Dynamic) => restRead.allOf.flatMap(columnsOfConditionClause).includes(c))
    )
      return {
        ...restRead,
        c: firstNamed.c,
        isPaintNamed: true,
      };
  }
  if (read.kind === 'read') {
    let restRead = new (Set as Dynamic)(read.allOf.flatMap(columnsOfConditionClause));
    let other = columnsNamed.filter(({ c: c2 }: Dynamic) => !restRead.has(c2));
    let [onlyUntested, ...moreUntested] = other;
    let isFirstColumnAtEnd =
      onlyUntested !== undefined &&
      moreUntested.length === 0 &&
      onlyUntested.c === holds.columns[0]?.c &&
      onlyUntested.to === words.length &&
      onlyUntested.from > 0 &&
      !SCALE_PREPOSITIONS.has(words[onlyUntested.from - 1]?.plain ?? '');
    if (other.length > 0 && !isFirstColumnAtEnd)
      return {
        kind: 'notRead',
        isOnItsWay: false,
      };
    if (isFirstColumnAtEnd)
      return {
        ...read,
        c: onlyUntested.c,
        isPaintNamed: true,
      };
    let clauseOfNamed = read.allOf.find(({ c: c2 }: Dynamic) => columnsNamed.some((named?: Dynamic) => named.c === c2));
    let { c: c } = clauseOfNamed ?? read.allOf[0];
    if (!situation.areSeveralCellsSelected || columnsNamed.length > 0)
      return {
        ...read,
        c: c,
      };
    if (!situation.selected.includes(c))
      return {
        kind: 'notRead',
        isOnItsWay: false,
      };
    return [1, holds.columns.length].includes(situation.selected.length) || takesSelectionAsIs
      ? {
          ...read,
          c: c,
        }
      : {
          kind: 'notRead',
          isOnItsWay: false,
        };
  }
  let [onlyNamed, ...moreNamed] = columnsNamed;
  if (onlyNamed !== undefined && moreNamed.length === 0 && onlyNamed.from > 0 && onlyNamed.to === words.length) {
    let restRead = ['in', 'of', 'for', 'on'].includes(words[onlyNamed.from - 1]?.plain ?? '') ? onlyNamed.from - 1 : onlyNamed.from;
    let other = readWordsAsTests(
      rewriteWords(words, onlyNamed.from, onlyNamed.to, NO_WORD_REWRITES, true) + rewriteWords(words, 0, restRead, NO_WORD_REWRITES, true),
      holds,
      viewerId,
      situation,
    );
    if (other.kind === 'read' && other.allOf.every(({ c: c }: Dynamic) => c === onlyNamed.c))
      return {
        ...other,
        c: onlyNamed.c,
      };
  }
  if (columnsNamed.length > 0 || situation.selected.length > MOST_SELECTED_COLUMNS) return read;
  if (!isUnplaceableStart(read.firstNotPlaced ?? '')) return read;
  let readWithName = (c?: Dynamic) => {
    let name = holds.columns.find((column?: Dynamic) => column.c === c)?.name ?? null;
    let read2 =
      name === null || name.length > MOST_CHARACTERS_OF_WORDS ? null : readWordsAsTests(name + ' ' + typed, holds, viewerId, situation);
    return read2?.kind === 'read' && read2.allOf[0].c === c ? read2.allOf : [];
  };
  let readsOfSelected = situation.selected
    .map(readWithName)
    .map((clauses?: Dynamic) => (clauses.length === 1 || situation.selected.length === 1 ? clauses : []));
  let [[firstClause, ...moreClauses] = [], ...otherReads] = readsOfSelected;
  let selectedKinds = new (Set as Dynamic)(
    situation.selected.map((c?: Dynamic) => holds.columns.find((column?: Dynamic) => column.c === c)?.kind),
  );
  let saysLateWithSeveralDates =
    words.some(({ plain: plain }: Dynamic) => LATE_WORDS.has(plain)) &&
    holds.columns.filter(({ kind: kind }: Dynamic) => kind === 'date').length > 1;
  let valueStandsElsewhere =
    firstClause?.condition.kind === 'textIs' &&
    !situation.areSeveralCellsSelected &&
    holds.columns.some(
      (column?: Dynamic) =>
        column.c !== firstClause.c && 'text' in firstClause.condition && columnHasText(column, firstClause.condition.text),
    );
  return firstClause !== undefined &&
    !saysLateWithSeveralDates &&
    !valueStandsElsewhere &&
    selectedKinds.size === 1 &&
    otherReads.every(([clause]: Dynamic) => clause !== undefined && isSameAsJson(clause.condition, firstClause.condition)) &&
    (situation.areSeveralCellsSelected || !CELL_TEST_KINDS.has(firstClause.condition.kind))
    ? {
        kind: 'read',
        allOf: [firstClause, ...moreClauses],
        c: firstClause.c,
        isAboutSelected: true,
      }
    : read;
}
export function wordsWithDateNamed(typed?: Dynamic, holds?: Dynamic, situation?: Dynamic) {
  let words = splitIntoWords(typed);
  let nameSaysDate = (c?: Dynamic) =>
    plainWordsOf(holds.columns.find((column?: Dynamic) => column.c === c)?.name ?? '').some(
      (word?: Dynamic) => word.startsWith('date'),
    );
  let columnsNamed = columnsNamedIn(words, holds).filter(
    ({ c: c, from: from, to: to }: Dynamic) => to - from > 1 || !dateWordPattern.test(words[from]?.plain ?? '') || nameSaysDate(c),
  );
  let saysColumnLetter = words.some(
    (word?: Dynamic, index?: Dynamic) =>
      (word.plain === 'column' || word.plain === 'col') && situation.columnLettered(words[index + 1]?.plain ?? '') !== null,
  );
  let dateWord = words.find(
    (word?: Dynamic, index?: Dynamic) =>
      isUnquotedWord(word) &&
      dateWordPattern.test(word.plain) &&
      !isAfterTextTest(words, index) &&
      !columnsNamed.some(({ from: from, to: to }: Dynamic) => from <= index && index < to),
  );
  let selectedDateColumn = holds.columns.find(
    ({ c: c, kind: kind }: Dynamic) => kind === 'date' && situation.selected.length === 1 && situation.selected[0] === c,
  );
  if (dateWord !== undefined && selectedDateColumn === undefined && columnsNamed.length === 0 && !saysColumnLetter) return null;
  if (dateWord === undefined || selectedDateColumn === undefined || columnsNamed.some(({ c: c }: Dynamic) => c !== selectedDateColumn.c))
    return typed;
  let isNamedAlready = selectedDateColumn.c === onlySelectedColumn(situation) || columnsNamed.length > 0;
  let rewrites = new (Map as Dynamic)([[dateWord, isNamedAlready ? '' : (selectedDateColumn.name ?? '')]]);
  return rewriteWords(words, 0, words.length, rewrites, /\s$/.test(typed));
}
export function isColorPartOfValue(words: Dynamic, clause: Dynamic, { columns: columns }: Dynamic) {
  let hueWords = words.filter(({ plain: plain }: Dynamic) => HUE_WORDS.has(plain));
  if (hueWords.length === 0 || clause === undefined || !TEXT_TEST_KINDS.has(clause.condition.kind)) return false;
  let text = 'text' in clause.condition ? clause.condition.text : '';
  return (
    SHADE_WORDS.has(plainWordsOf(text).at(-1) ?? '') ||
    columns.some(
      ({ c: c, values: values }: Dynamic) =>
        c === clause.c &&
        values.some(
          ({ value: value }: Dynamic) =>
            value?.kind === 'text' &&
            isShortEnoughToRead(value.value) &&
            hueWords.some(({ plain: plain }: Dynamic) => plainTextOfWords(value.value).includes(plainTextOfWords(text) + ' ' + plain)),
        ),
    )
  );
}
export function readRuleFromWords(typed?: Dynamic, holds?: Dynamic, viewerId?: Dynamic, situation?: Dynamic) {
  let read = readRuleWords(typed, holds, viewerId, situation);
  let withDateNamed = wordsWithDateNamed(typed, holds, situation);
  let wordsRead = read.kind === 'read' ? typed : (withDateNamed ?? typed);
  let readOfWords = wordsRead === typed ? read : readRuleWords(wordsRead, holds, viewerId, situation);
  if (readOfWords.kind === 'notRead') return read;
  let testedCs = readOfWords.rule.kind === 'formatWhere' ? readOfWords.rule.allOf.map(({ c: c }: Dynamic) => c) : [readOfWords.c];
  if (withDateNamed === null && holds.columns.some(({ c: c, kind: kind }: Dynamic) => kind === 'date' && testedCs.includes(c)))
    return FORMAT_PARTS_NOT_READ;
  let words = splitIntoWords(wordsRead);
  let textWithout = (dropped?: Dynamic) =>
    words.map((word?: Dynamic) => word.gap + (word === dropped ? ' ' : word.said)).join('') + (words.at(-1)?.tail ?? '');
  return words.some(
    (word?: Dynamic) =>
      isUnquotedWord(word) &&
      RECORD_KIND_NOUNS.has(word.plain) &&
      columnNamedAt(holds, words, word.at, true) === null &&
      isSameAsJson(readOfWords, readRuleWords(textWithout(word), holds, viewerId, situation)),
  )
    ? FORMAT_PARTS_NOT_READ
    : readOfWords;
}
export function readRuleWords(typed?: Dynamic, holds?: Dynamic, viewerId?: Dynamic, situation?: Dynamic) {
  if (typed.length > MOST_CHARACTERS_OF_WORDS) return FORMAT_PARTS_NOT_READ;
  let countOf = (mark?: Dynamic) => typed.split(mark).length - 1;
  if (countOf('"') % 2 === 1 || countOf('“') !== countOf('”'))
    return {
      kind: 'notRead',
      isOnItsWay: true,
    };
  if (
    [foreignNumberPattern, crossMarkPattern, leaveOutPattern, thousandsRangePattern, monthYearPattern].some(
      (pattern?: Dynamic) => pattern.test(typed),
    )
  )
    return FORMAT_PARTS_NOT_READ;
  let words = splitIntoWords(expandThousands(typed, situation));
  let isInColumnNameAt = (at?: Dynamic, words2?: Dynamic) =>
    columnsNamedIn(words2, holds).some(
      ({ c: c, from: from, to: to }: Dynamic) =>
        from <= at &&
        at < to &&
        (to - from > 1 ||
          (!FORMAT_WORDS.has(words2[at]?.plain ?? '') &&
            !STATE_WORDS.has(words2[at]?.plain ?? '') &&
            (!situation.areSeveralCellsSelected || onlySelectedColumn(situation) === c) &&
            !WORDS_AFTER_DATE_NAME.has(words2[to]?.plain ?? '') &&
            [NUMBER_CONDITION_WORDS, IS_ARE_WORDS].some((wordSet?: Dynamic) => wordSet.has(words2[to]?.plain ?? '')))),
    );
  if (
    words.some(
      (word?: Dynamic, at?: Dynamic) =>
        isUnquotedWord(word) && (FILTER_VERBS.has(word.plain) || VAGUE_NOUNS.has(word.plain)) && !isInColumnNameAt(at, words),
    )
  )
    return FORMAT_PARTS_NOT_READ;
  let isValueTextAt = (word?: Dynamic, at?: Dynamic, words2?: Dynamic) => {
    let nameEnd = words2[at - 1]?.plain === 'not' ? at - 2 : at - 1;
    return (
      !STATE_WORDS.has(word.plain) &&
      IS_ARE_WORDS.has(words2[nameEnd]?.plain ?? '') &&
      columnsNamedIn(words2, holds).some(
        ({ c: c, to: to }: Dynamic) =>
          to === nameEnd &&
          holds.columns.some(
            (column?: Dynamic) =>
              column.c === c &&
              column.values.some(({ value: value }: Dynamic) => value?.kind === 'text' && isSameTextIgnoringCase(value.value, word.plain)),
          ),
      )
    );
  };
  let isKnownValueWord = (word?: Dynamic, at?: Dynamic, words2?: Dynamic) =>
    isUnquotedWord(word) &&
    RULE_KNOWN_WORDS.has(word.plain) &&
    !isValueTextAt(word, at, words2) &&
    !isInColumnNameAt(at, words2) &&
    (!STARTS_ENDS_WORDS.has(word.plain) || isTextTestAt(words2, at)) &&
    wordForms(word.plain)
      .flatMap((form?: Dynamic) => valueWordsOfTable(holds).get(form) ?? [])
      .some(
        (valueWords?: Dynamic) =>
          valueWords.every(
            (valueWord?: Dynamic) => words2.some(({ plain: plain }: Dynamic) => wordForms(plain).includes(valueWord)),
          ),
      );
  if (words.some(isKnownValueWord)) return FORMAT_PARTS_NOT_READ;
  let rewritten = rewriteWords(words, 0, words.length, ruleWordRewrites(words, holds, situation), /\s$/.test(typed));
  if (rewritten.length > MOST_CHARACTERS_OF_WORDS) return FORMAT_PARTS_NOT_READ;
  let rewrittenWords = splitIntoWords(rewritten);
  if (rewrittenWords.some(isKnownValueWord)) return FORMAT_PARTS_NOT_READ;
  let plainWords = rewrittenWords.filter(isUnquotedWord);
  if (
    plainWords.some((word?: Dynamic) => {
      if (!NO_WITHOUT_WORDS.has(word.plain)) return false;
      let named = columnAfterWord(holds, rewrittenWords, word);
      return named === null || IS_ARE_WORDS.has(rewrittenWords[named.end]?.plain ?? '');
    })
  )
    return FORMAT_PARTS_NOT_READ;
  let colorScale = plainWords.length < rewrittenWords.length ? null : readColorScaleRule(rewrittenWords, holds, situation);
  if (colorScale !== null) return colorScale;
  let wordsOf = (nouns?: Dynamic) =>
    plainWords.filter((word?: Dynamic) => nouns.has(word.plain) && !isInColumnNameAt(word.at, rewrittenWords));
  let [rowWords, cellWords] = [wordsOf(ROW_NOUNS), wordsOf(CELL_NOUNS)];
  if (rowWords.length > 0 && cellWords.length > 0) return FORMAT_PARTS_NOT_READ;
  let dropped = new (Map as Dynamic)(
    [
      ...cellWords,
      ...rowWords.flatMap(
        ({ at: at }: Dynamic) =>
          rewrittenWords.slice(Math.max(at - 1, 0), at).filter((word?: Dynamic) => WHOLE_WORDS.has(word.plain)),
      ),
    ].map((word?: Dynamic) => [word, ' ']),
  );
  let ruleWords = rewrittenWords.filter((word?: Dynamic) => !dropped.has(word) && !rowWords.includes(word));
  let endsWithSpace = /\s$/.test(typed);
  let readings = new (Map as Dynamic)();
  let testsByText = new (Map as Dynamic)();
  let isOnItsWay: Dynamic = false;
  let [starts, ends, middles] = [formatPartsAtStart(ruleWords), formatPartsAtEnd(ruleWords), formatPartsInMiddle(ruleWords)];
  if (starts.length * ends.length * middles.length > MOST_RULE_READINGS) return FORMAT_PARTS_NOT_READ;
  for (let start of starts as Dynamic)
    for (let end of ends as Dynamic)
      for (let middle of middles as Dynamic) {
        if (start.from >= end.to) continue;
        let [middleFirst, middleLast] = [middle.words[0], middle.words.at(-1)];
        let indexOf = (word?: Dynamic) => ruleWords.indexOf(word);
        if (middleFirst !== undefined && middleLast !== undefined && (indexOf(middleFirst) <= start.from || indexOf(middleLast) >= end.to - 1))
          continue;
        let saysFill = ruleWords.slice(0, start.from).some((word?: Dynamic) => word.plain === 'fill');
        let parts = [...start.parts, ...middle.parts, ...end.parts].map(
          (part?: Dynamic) =>
            saysFill && part.kind === 'tint'
              ? {
                  kind: 'fill',
                  hue: part.hue,
                }
              : part,
        );
        let format = parts.length === 0 ? null : formatOfParts(parts);
        if (parts.length > 0 && format === null) continue;
        let [firstWord, lastWord] = [ruleWords[start.from], ruleWords[end.to - 1]];
        if (firstWord === undefined || lastWord === undefined) continue;
        if (parts.length === 0 && plainWords.some((word?: Dynamic) => word.plain === SHOW_WORD)) continue;
        let rewrites = new (Map as Dynamic)([...dropped, ...middle.words.map((word?: Dynamic) => [word, ' '])]);
        let testText = rewriteWords(
          rewrittenWords,
          firstWord.at,
          lastWord.at + 1,
          rewrites,
          endsWithSpace || lastWord !== rewrittenWords.at(-1),
        );
        let tests = testsByText.get(testText) ?? readTestsForRule(testText, holds, viewerId, situation, rowWords.length > 0);
        testsByText.set(testText, tests);
        if (tests.kind === 'notRead') {
          isOnItsWay ||= tests.isOnItsWay && parts.length === 0 && end.to === ruleWords.length;
          continue;
        }
        if (isColorPartOfValue(ruleWords.slice(end.to), tests.allOf.at(-1), holds)) return FORMAT_PARTS_NOT_READ;
        if (rowWords.length > 0 && tests.isPaintNamed === true) continue;
        let reading = {
          kind: 'read',
          c: tests.c ?? tests.allOf[0].c,
          isForRows: rowWords.length > 0,
          isAboutSelected: tests.isAboutSelected === true,
          rule: {
            kind: 'formatWhere',
            allOf: tests.allOf,
            format: format,
          },
        };
        readings.set(JSON.stringify(reading), reading);
      }
  let [onlyReading, ...otherReadings] = readings.values();
  if (onlyReading === undefined || otherReadings.length > 0)
    return {
      kind: 'notRead',
      isOnItsWay: readings.size === 0 && isOnItsWay,
    };
  let clauses = onlyReading.rule.kind === 'formatWhere' ? onlyReading.rule.allOf : [];
  return clauses.some(isBeforeTodayTest) &&
    !words.some((word?: Dynamic, at?: Dynamic) => isUnquotedWord(word) && word.plain === 'today' && !isAfterTextTest(words, at)) &&
    hasStatusLikeColumns(holds) &&
    !clauses.some((clause?: Dynamic) => testsNotDone(clause, holds))
    ? FORMAT_PARTS_NOT_READ
    : onlyReading;
}
export const COLOR_SCALE_PHRASES = ['color scale', 'colour scale', 'color gradient', 'heat map', 'heatmap', 'gradient'].map(
  (phrase?: Dynamic) => phrase.split(' '),
);
export const SCALE_LEAD_WORDS = new (Set as Dynamic)('add apply put make show a an the'.split(' '));
export const SCALE_PREPOSITIONS = new (Set as Dynamic)('on of for to in over across'.split(' '));
export const FILTER_VERBS = new (Set as Dynamic)(
  'hide filter filtered only keep find list display see sort sorted order ordered remove delete clear except exclude excluding skip ignore omit'.split(
    ' ',
  ),
);
export const SHOW_WORD = 'show';
export const monthOrWeekdayPattern = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon(?!th)|tue|wed|thu|fri|sat|sun)/;
export const FORMAT_WORDS = new (Set as Dynamic)([
  ...HUE_WORDS.keys(),
  ...FONT_STYLE_PHRASES.map(([phrase]: Dynamic) => phrase.replace(/ .*/, '')),
  ...TEXT_COLOR_WORDS,
  ...FILL_WORDS,
  ...PALE_WORDS,
  ...FORMAT_VERBS,
  ...FORMAT_VERB_PHRASES.map(([[firstWord = '']]: Dynamic) => firstWord),
]);
export const RULE_KNOWN_WORDS = new (Set as Dynamic)([
  ...HUE_WORDS.keys(),
  ...FONT_STYLE_PHRASES.flatMap(([phrase]: Dynamic) => phrase.split(' ')),
  ...TEXT_COLOR_WORDS,
  ...FILL_WORDS,
  ...PALE_WORDS,
  ...FORMAT_VERBS,
  ...FORMAT_VERB_PHRASES.flatMap(([words]: Dynamic) => words),
  ...FORMAT_LEAD_INS.flat().filter((word?: Dynamic) => word.length > 5),
  ...ROW_NOUNS,
  ...CELL_NOUNS,
  ...WHOLE_WORDS,
  ...[...NUMBER_CONDITION_WORDS, ...TEXT_TEST_WORDS].filter(
    (word?: Dynamic) => /^\p{L}{3,}$/u.test(word) && !['than', 'from', 'with', 'not', 'does', 'more', 'and'].includes(word),
  ),
  ...RULE_WORD_REWRITES.flatMap(
    ([phraseWords]: Dynamic) => phraseWords.filter((word?: Dynamic) => word.length > 4 || word === 'zero' || word === 'past'),
  ),
  ...CHECKED_RULE_WORDS,
  ...UNCHECKED_RULE_WORDS,
  ...'blank blanks empty none nothing filled any anything overdue late past today tomorrow yesterday scale gradient heatmap heat'.split(' '),
  ...'max min maximum minimum average mean median unique weekend weekends weekday weekdays people person everyone staff'.split(' '),
  ...[...DATE_CONDITION_WORDS].filter((word?: Dynamic) => monthOrWeekdayPattern.test(word)),
]);
export const wordForms = (word?: Dynamic) => [word, word + 's', word.replace(/s$/, '')];
export const isShortEnoughToRead = (words?: Dynamic) => words.length <= MOST_CHARACTERS_OF_WORDS;
export const valueWordsCache = new (WeakMap as Dynamic)();
export const namesAColumn = (text?: Dynamic, holds?: Dynamic) => columnsNamedIn(splitIntoWords(text), holds).length > 0;
export const MOST_SELECTED_COLUMNS = 24;
export const LATE_WORDS = new (Set as Dynamic)(['overdue', 'late']);
export const CELL_TEST_KINDS = new (Set as Dynamic)(['appearsMoreThanOnce', 'isAnError', 'isBlank', 'isNotBlank']);
export const BLANK_FILLED_WORDS = new (Set as Dynamic)('blank blanks empty none nothing filled any anything'.split(' '));
export const STATE_WORDS = new (Set as Dynamic)([
  ...BLANK_FILLED_WORDS,
  ...'missing checked ticked unchecked unticked overdue late past today tomorrow yesterday'.split(' '),
]);
export const isUnplaceableStart = (text?: Dynamic) => {
  let [firstWord = ''] = plainWordsOf(text);
  return (
    !/^\p{L}/u.test(firstWord) ||
    [NUMBER_CONDITION_WORDS, DATE_CONDITION_WORDS, TEXT_TEST_WORDS, BLANK_FILLED_WORDS, IS_ARE_WORDS].some(
      (wordSet?: Dynamic) => wordSet.has(firstWord),
    ) ||
    firstWord === 'not'
  );
};
export const columnsOfConditionClause = ({ c: c, condition: condition }: Dynamic) => [
  c,
  ...operandsOfCondition(condition).flatMap((operand?: Dynamic) => (operand.kind === 'sameRowInColumn' ? [operand.c] : [])),
];
export const thousandsSuffixPattern = /(?<![\p{L}\p{N}.,])(\d{1,6}(?:\.\d{1,3})?)k(?![\p{L}\p{N}])/giu;
export const expandThousands = (typed: Dynamic, { signsOfNumbers: signsOfNumbers }: Dynamic) =>
  /["“”]/.test(typed) ||
  splitIntoWords(typed).some((word?: Dynamic, at?: Dynamic, words?: Dynamic) => isTextTestAt(words, at)) ||
  signsOfNumbers.decimalSign === 'comma'
    ? typed
    : typed.replaceAll(thousandsSuffixPattern, (match?: Dynamic, thousands?: Dynamic) => String(Math.round(Number(thousands) * 1000)));
export const dateWordPattern = /^dates?$/i;
export const WORDS_AFTER_DATE_NAME = new (Set as Dynamic)('and or to from no'.split(' '));
export const SHADE_WORDS = new (Set as Dynamic)('light dark pale navy hot sky bright'.split(' '));
