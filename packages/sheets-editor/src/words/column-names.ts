import type { Dynamic } from '../dynamic.ts';
import { splitIntoWords, plainWordsOf, wordsMatchAt, NO_WORD_TOKEN, isSymbolForNotOrIs, isWordOrItsPlural } from './tokens.ts';
import {
  COMMAND_WORDS,
  FILTER_FILLER_WORDS,
  EQUALS_WORDS,
  SHOW_VERBS,
  NEGATING_WORDS,
  BLANK_WORDS,
  QUESTION_FILLER_WORDS,
  LIST_JOINERS,
  TASK_NOUNS,
  WORDS_AFTER_COLUMN_NAME,
  UNASSIGNED_PHRASES,
  FILLED_WORDS,
  DATE_CONDITION_WORDS,
  NUMBER_CONDITION_WORDS,
  TEXT_TEST_WORDS,
  LARGEST_SMALLEST_WORDS,
  CHECKED_RULE_WORDS,
  UNCHECKED_WORDS,
  WORDS_NOT_TAKEN_AS_VALUES,
} from './vocabulary.ts';
import { valuesOfUserInColumn, isPeopleColumn, measureOfColumn } from './column-holds.ts';
import { columnNameWords } from './numbers.ts';
export function nameWordsWithBreaks(name?: Dynamic) {
  let words = splitIntoWords(name);
  let plainWords = words.map(({ plain: plain }: Dynamic) => plain);
  if (/[-!=:<>≠'’"“”([….]/.test(name))
    breaksAllowedInNameCache.set(
      plainWords,
      new (Set as Dynamic)(words.flatMap(({ at: at }: Dynamic) => (isWordBreakAt(words, at, at === 0) ? [at] : []))),
    );
  return plainWords;
}
export function columnNamesOf(columns?: Dynamic) {
  let cached = columnNamesCache.get(columns);
  if (cached !== undefined) return cached;
  let names = columns.flatMap((column?: Dynamic) => {
    let nameWords = nameWordsWithBreaks(column.name ?? '');
    let [firstWord, ...otherWords] = nameWords;
    let isAWord = firstWord !== undefined && otherWords.length === 0 && COMMAND_WORDS.has(firstWord);
    let isPassedOver = isAWord && FILTER_FILLER_WORDS.has(firstWord) && !EQUALS_WORDS.has(firstWord) && !SHOW_VERBS.has(firstWord);
    return firstWord === undefined
      ? []
      : [
          {
            column: column,
            name: nameWords,
            wordCount: nameWords.length,
            isPart: false,
            isUnsure: false,
            isAWord: isAWord,
            isPassedOver: isPassedOver,
          },
        ];
  });
  columnNamesCache.set(columns, names);
  return names;
}
export function isAbbreviationOf(short?: Dynamic, long?: Dynamic) {
  if (short.length < 2 || short.length >= long.length || short[0] !== long[0]) return false;
  let matched: Dynamic = 0;
  for (let letter of long as Dynamic) if (letter === short[matched]) matched += 1;
  return matched === short.length;
}
export function columnNamePartsOf(columns?: Dynamic) {
  let cached = columnNamePartsCache.get(columns);
  if (cached !== undefined) return cached;
  let parts = new (Map as Dynamic)();
  let valueWords = new (Set as Dynamic)(
    columns
      .filter(isColumnOfFewValues)
      .flatMap((column?: Dynamic) => valueLabelsOf(column).flatMap(({ words: words }: Dynamic) => words)),
  );
  for (let nameEntry of columnNamesOf(columns) as Dynamic) {
    if (nameEntry.name.length > MOST_NAME_WORDS) continue;
    if (nameEntry.name.some((word?: Dynamic) => NEGATING_WORDS.has(word) || NEGATING_PREFIXES.has(word) || BLANK_WORDS.has(word))) continue;
    let bracketWordsOrPart = new (Set as Dynamic)(((nameEntry.column.name ?? '').match(/\([^()]*\)/g) ?? []).flatMap(plainWordsOf));
    let tellingWords = nameEntry.name.filter(
      (word?: Dynamic) => isTellingNameWord(word) && !bracketWordsOrPart.has(word) && !ESTIMATE_WORDS.has(word),
    );
    let partTexts = new (Set as Dynamic)();
    for (let part: Dynamic = 0; part < nameEntry.name.length; part += 1)
      for (let partWords: Dynamic = part + 1; partWords <= nameEntry.name.length; partWords += 1) {
        let slice = nameEntry.name.slice(part, partWords);
        if (!isTellingNameWord(slice[0] ?? '') || !isTellingNameWord(slice.at(-1) ?? '')) continue;
        if (tellingWords.every((word?: Dynamic) => slice.includes(word))) partTexts.add(slice.join(' '));
      }
    for (let part of partTexts as Dynamic) {
      let partWords = part.split(' ');
      let slice =
        (partWords.length === 1 && QUESTION_FILLER_WORDS.has(part)) || partWords.some((word?: Dynamic) => valueWords.has(word));
      let partEntry = {
        ...nameEntry,
        name: partWords,
        wordCount: partWords.length,
        isPart: true,
        isUnsure: slice,
      };
      parts.set(part, parts.has(part) ? null : partEntry);
    }
  }
  for (let [nameEntry, bracketWordsOrPart] of parts as Dynamic)
    if (
      bracketWordsOrPart !== null &&
      columnNamesOf(columns).some(
        ({ column: column, name: name }: Dynamic) =>
          column !== bracketWordsOrPart.column && bracketWordsOrPart.name.every((word?: Dynamic) => isNameAlike(name, word)),
      )
    )
      parts.set(nameEntry, null);
  let [dateName, ...otherDateNames] = columnNamesOf(columns).filter(({ column: column }: Dynamic) => column.kind === 'date');
  if (dateName !== undefined && otherDateNames.length === 0 && !columns.some(looksLikeDateColumn))
    parts.set('date', {
      ...dateName,
      name: ['date'],
      wordCount: 1,
      isPart: true,
      isUnsure: false,
    });
  let found = [...parts.values()].filter((input?: Dynamic) => input !== null);
  columnNamePartsCache.set(columns, found);
  return found;
}
export function columnNamesByStart(columns?: Dynamic) {
  let cached = columnNamesByStartCache.get(columns);
  if (cached !== undefined) return cached;
  let byStart = new (Map as Dynamic)();
  for (let columnName of [...columnNamesOf(columns), ...columnNamePartsOf(columns)] as Dynamic) {
    let start = (columnName.name[0] ?? '').slice(0, 2);
    let sameStart = byStart.get(start);
    if (sameStart === undefined) byStart.set(start, [columnName]);
    else sameStart.push(columnName);
  }
  columnNamesByStartCache.set(columns, byStart);
  return byStart;
}
export function columnNamedAt(
  { columns: columns }: Dynamic,
  words?: Dynamic,
  at2?: Dynamic,
  allowWords: Dynamic = false,
  allowUnsure: Dynamic = false,
) {
  let sameStart = (columnNamesByStart(columns).get((words[at2]?.plain ?? '').slice(0, 2)) ?? []).filter(
    ({ isAWord: isAWord, isPassedOver: isPassedOver, isUnsure: isUnsure }: Dynamic) =>
      (!isAWord || (allowWords && isPassedOver)) && (!isUnsure || allowUnsure),
  );
  if (sameStart.length === 0) return null;
  let [wholeNames, partNames] = [
    sameStart.filter(({ isPart: isPart }: Dynamic) => !isPart),
    sameStart.filter(({ isPart: isPart }: Dynamic) => isPart),
  ];
  let pickLongest = (named?: Dynamic) => {
    let mostWords = (Math.max as Dynamic)(...named.map(({ wordCount: wordCount }: Dynamic) => wordCount));
    let [longest, ...othersAsLong] = named.filter(({ wordCount: wordCount }: Dynamic) => wordCount === mostWords);
    return othersAsLong.length === 0 ? (longest ?? null) : null;
  };
  let matchingWholeNames = wholeNames.filter(({ name: name }: Dynamic) => nameMatchesAt(words, at2, name));
  if (matchingWholeNames.length > 0) return pickLongest(matchingWholeNames);
  let isUnbrokenName = ({ name: name }: Dynamic) => {
    let lastPlain = words[at2 + name.length - 1]?.plain ?? '';
    return (
      wordsMatchAt(words, at2, name.slice(0, -1)) &&
      lastPlain.length >= LEAST_LETTERS_TO_COMPLETE_NAME &&
      !COMMAND_WORDS.has(lastPlain) &&
      name.at(-1)?.startsWith(lastPlain) === true &&
      isUnbrokenAt(words, at2, name)
    );
  };
  let candidates = [
    ...wholeNames.filter(isUnbrokenName),
    ...partNames.filter(({ name: name }: Dynamic) => nameMatchesAt(words, at2, name)),
  ];
  if (candidates.length > 0) return pickLongest(candidates);
  return pickLongest(partNames.filter(isUnbrokenName));
}
export function cachedPerObject(compute?: Dynamic) {
  let cache = new (WeakMap as Dynamic)();
  return (key?: Dynamic) => {
    let value = cache.get(key) ?? compute(key);
    if (!cache.has(key)) cache.set(key, value);
    return value;
  };
}
export function isSingleWordValueOf(column?: Dynamic, word?: Dynamic) {
  let singleWords2 = singleWordValuesOf(column);
  return singleWords2.has(word) || singleWords2.has(`${word}s`) || (word.endsWith('s') && singleWords2.has(word.slice(0, -1)));
}
export function valueLabelsOf(column?: Dynamic) {
  let cached = valueLabelsCache.get(column);
  if (cached !== undefined) return cached;
  let valueLabels = column.values.flatMap(({ value: value, userIds: [userId, ...moreUserIds] }: Dynamic) => {
    if (value === null || value.kind === 'error' || value.kind === 'boolean') return [];
    if (moreUserIds.length > 0) return [];
    let values = userId === undefined ? [value] : valuesOfUserInColumn(column, userId);
    return [
      {
        words: nameWordsWithBreaks(String(value.value)),
        values: values,
        userId: userId,
      },
    ];
  });
  let valueTexts = new (Set as Dynamic)(valueLabels.map(({ words: words }: Dynamic) => words.join(' ')));
  let dropdownLabels = (column.optionsOfDropdown ?? []).flatMap((option?: Dynamic) => {
    let words = nameWordsWithBreaks(option);
    let optionValue = {
      kind: 'text',
      value: option,
    };
    return valueTexts.has(words.join(' '))
      ? []
      : [
          {
            words: words,
            values: [optionValue],
          },
        ];
  });
  let wordCounts = new (Map as Dynamic)();
  for (let { words: words } of [...valueLabels, ...dropdownLabels] as Dynamic)
    for (let word of words as Dynamic) wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
  let sharedValues = column.values.flatMap(
    ({ value: value, userIds: userIds }: Dynamic) =>
      value === null || userIds.length < 2
        ? []
        : [
            {
              words: plainWordsOf(String(value.value)),
              userIds: userIds,
            },
          ],
  );
  let firstNameLabels = valueLabels.flatMap(
    ({ words: [firstWord = '', ...moreWords], values: values, userId: userId }: Dynamic) => {
      if (userId === undefined || moreWords.length === 0 || !/^\p{L}{2,}$/u.test(firstWord)) return [];
      let forms = pluralFormsOf(firstWord);
      return !forms.some((form?: Dynamic) => COMMAND_WORD_SETS.some((wordSet?: Dynamic) => wordSet.has(form))) &&
        forms.reduce((sum?: Dynamic, form?: Dynamic) => sum + (wordCounts.get(form) ?? 0), 0) === 1 &&
        sharedValues.every(
          ({ words: words, userIds: userIds }: Dynamic) =>
            words.filter((word?: Dynamic) => forms.includes(word)).length <= Number(userIds.includes(userId)),
        )
        ? [
            {
              words: [firstWord],
              values: values,
              isFirstName: true,
            },
          ]
        : [];
    },
  );
  let isPlainText = column.kind === 'text' && !isColumnOfFewValues(column);
  let allLabels = [...valueLabels, ...dropdownLabels, ...firstNameLabels];
  let innerPhrases = new (Set as Dynamic)();
  let phrasesBeforeSignedEnd = new (Set as Dynamic)();
  for (let { words: words, values: values } of (isPeopleColumn(column) || measureOfColumn(column) !== null ? [] : allLabels) as Dynamic) {
    let endsInSignedNumber = /\d[-+−]+$/.test(String(values[0]?.value ?? ''));
    if (words.length < 2 || words.length > MOST_NAME_WORDS || NEGATING_WORDS.has(words[0] ?? '') || words.includes(',')) continue;
    for (let word: Dynamic = 0; word < words.length; word += 1)
      for (let to: Dynamic = word + 1; to <= words.length && to - word < words.length; to += 1)
        (endsInSignedNumber && word === 0 && to === words.length - 1 ? phrasesBeforeSignedEnd : innerPhrases).add(words.slice(word, to).join(' '));
  }
  let isLabelText = (text?: Dynamic) =>
    valueTexts.has(text) || dropdownLabels.some(({ words: words }: Dynamic) => words.join(' ') === text);
  let isListOfLabels = (words?: Dynamic) =>
    words.some((word?: Dynamic) => LIST_JOINERS.has(word)) &&
    words
      .map((word?: Dynamic) => (LIST_JOINERS.has(word) ? '|' : word))
      .join(' ')
      .split(' | ')
      .every(isLabelText);
  let labels = (isPlainText ? [] : allLabels).flatMap(({ words: words, values: values, isFirstName = false }: Dynamic) => {
    let [firstWord, ...otherWords] = words;
    if (firstWord === undefined || values.length === 0 || words.includes(',') || (otherWords.length > 1 && isListOfLabels(words))) return [];
    let needsHeaderIfAlone =
      firstWord.length === 1 || COMMAND_WORDS.has(firstWord) || TASK_NOUNS.has(firstWord) || /^-?[\d.]+$/.test(firstWord);
    let mayMeanMore =
      (otherWords.length > 1 && words.some((word?: Dynamic) => LIST_JOINERS.has(word))) ||
      (innerPhrases.size > 0 && innerPhrases.has(words.join(' '))) ||
      (phrasesBeforeSignedEnd.has(words.join(' ')) && 'unlessTypedPlainly');
    return [
      {
        words: words,
        values: values,
        needsHeader: otherWords.length === 0 && needsHeaderIfAlone,
        isFirstName: isFirstName,
        mayMeanMore: mayMeanMore,
      },
    ];
  });
  valueLabelsCache.set(column, labels);
  return labels;
}
export function valuesNamedAt(holds?: Dynamic, words?: Dynamic, at2?: Dynamic, options?: Dynamic) {
  let byWords = valuesNamedCache.get(holds) ?? new (WeakMap as Dynamic)();
  valuesNamedCache.set(holds, byWords);
  let byKey = byWords.get(words) ?? new (Map as Dynamic)();
  byWords.set(words, byKey);
  let key = [at2, options.only?.c, options.rather?.c, options.wholeLabelsOnly === true].join('|');
  let found = byKey.get(key) ?? findValuesNamedAt(holds, words, at2, options);
  byKey.set(key, found);
  return found;
}
export function findValuesNamedAt(
  holds: Dynamic,
  words: Dynamic,
  at2: Dynamic,
  { only: only, rather: rather, wholeLabelsOnly: wholeLabelsOnly }: Dynamic,
) {
  let longest: Dynamic = [];
  let columns =
    only === null ? holds.columns.filter((column?: Dynamic) => isColumnOfFewValues(column) || column === rather) : [only];
  for (let column of columns as Dynamic)
    for (let { words: labelWords2, values: values, needsHeader: needsHeader, isFirstName: isFirstName, mayMeanMore: mayMeanMore } of valueLabelsOf(
      column,
    ) as Dynamic) {
      if ((needsHeader && column !== only && column !== rather) || !nameMatchesAt(words, at2, labelWords2)) continue;
      if (isFirstName && (wholeLabelsOnly === true || words[at2]?.isInQuotes === true)) continue;
      let longestWordCount = longest[0]?.wordCount ?? 0;
      let found = {
        column: column,
        values: values,
        wordCount: labelWords2.length,
        isFirstName: isFirstName,
        mayMeanMore: mayMeanMore,
        isExact: words[at2 + labelWords2.length - 1]?.plain === labelWords2.at(-1),
      };
      if (labelWords2.length > longestWordCount) longest = [found];
      else if (labelWords2.length === longestWordCount) longest = [...longest, found];
    }
  let notFirstNames = longest.filter(({ isFirstName: isFirstName }: Dynamic) => !isFirstName);
  let preferred = notFirstNames.length > 0 ? notFirstNames : longest;
  return preferred.filter(
    (found?: Dynamic) => found.isExact || !preferred.some((other?: Dynamic) => other.isExact && other.column === found.column),
  );
}
export function valueNamedAt(holds?: Dynamic, words?: Dynamic, at2?: Dynamic, options?: Dynamic) {
  let found = valuesNamedAt(holds, words, at2, options);
  let [first, ...others] = found;
  if (first === undefined || others.length === 0) return first ?? null;
  let columnNamedAfter = columnNamedBeforeValueAt(holds, words, at2 + first.wordCount);
  let foundInRather = found.find(({ column: column }: Dynamic) => column === options.rather);
  let isRatherInexact = foundInRather?.isExact === false && found.some(({ isExact: isExact }: Dynamic) => isExact);
  return found.find(({ column: column }: Dynamic) => column === columnNamedAfter) ?? (isRatherInexact ? null : (foundInRather ?? null));
}
export function columnNamedBeforeValueAt(holds?: Dynamic, words?: Dynamic, at2?: Dynamic) {
  let named = columnNamedAt(holds, words, at2);
  if (named === null || isOnlyTextColumn(holds, named.column)) return null;
  let [firstNameWord, ...otherNameWords] = plainWordsOf(named.column.name ?? '');
  if (otherNameWords.length === 0 && TASK_NOUNS.has(firstNameWord ?? '')) return null;
  let afterName = at2 + named.wordCount;
  return WORDS_AFTER_COLUMN_NAME.has(words[afterName]?.plain ?? '') ||
    (isPeopleColumn(named.column) && unassignedPhraseLengthAt(words, afterName) > 0) ||
    valueNamedAt(holds, words, afterName, {
      only: named.column,
      rather: null,
    }) !== null
    ? null
    : named.column;
}
export const LEAST_LETTERS_TO_COMPLETE_NAME = 3;
export const isWordBreakAt = (words?: Dynamic, at?: Dynamic, isFirst: Dynamic = false) => {
  let word = words[at] ?? NO_WORD_TOKEN;
  let isSetApart = word.isInQuotes !== (words[at - 1]?.isInQuotes ?? false) || /^['’]\D/.test(word.said) || /[([…]|\.\.\./.test(word.gap);
  return isSymbolForNotOrIs(word) || (!isFirst && isSetApart);
};
export const breaksAllowedInNameCache = new (WeakMap as Dynamic)();
export const isUnbrokenAt = (words?: Dynamic, at?: Dynamic, name?: Dynamic) =>
  name.every(
    (nameWord?: Dynamic, offset?: Dynamic) =>
      !isWordBreakAt(words, at + offset, offset === 0) || breaksAllowedInNameCache.get(name)?.has(offset) === true,
  );
export const nameMatchesAt = (words?: Dynamic, at?: Dynamic, name?: Dynamic) =>
  wordsMatchAt(words, at, name.slice(0, -1)) &&
  isWordOrItsPlural(words[at + name.length - 1]?.plain ?? '', name.at(-1) ?? '') &&
  isUnbrokenAt(words, at, name);
export const columnNamesCache = new (WeakMap as Dynamic)();
export const ESTIMATE_WORDS = new (Set as Dynamic)(['est', 'estimated', 'approx']);
export const NEGATING_PREFIXES = new (Set as Dynamic)(['non', 'un', 'ex', 'never', 'dont']);
export const isNameAlike = (nameWords?: Dynamic, word?: Dynamic) =>
  nameWords.some((nameWord?: Dynamic) => nameWord === word || isAbbreviationOf(nameWord, word) || isAbbreviationOf(word, nameWord));
export const MOST_NAME_WORDS = 8;
export const columnNamePartsCache = new (WeakMap as Dynamic)();
export const isTellingNameWord = (word?: Dynamic) =>
  /^\p{L}{2}/u.test(word) && word !== 'date' && !NON_NAME_WORD_SETS.some((wordSet?: Dynamic) => wordSet.has(word));
export const columnNamesByStartCache = new (WeakMap as Dynamic)();
export const hasZeroValues = cachedPerObject(
  (column?: Dynamic) =>
    measureOfColumn(column) === 'numbers' && column.values.some(({ value: value }: Dynamic) => value?.value === 0),
);
export const dateLikeTextPattern =
  /^\d{1,4}([-/.])\d{1,2}\1\d{1,4}(?:[ T]\d{1,2}:\d{2}.*)?$|^\d{1,2}\/\d{1,2}$|^(?=.*\d)(?:\d{1,2} )?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? ?\d{0,2}(?:,? ?\d{4})?$/i;
export const looksLikeDateColumn = cachedPerObject(
  (column?: Dynamic) =>
    measureOfColumn(column) === null &&
    column.kind !== 'checkbox' &&
    (columnNameWords(column).some((word?: Dynamic) => /^(?:dates?|day|due|deadline|eta)$/.test(word)) ||
      column.values
        .slice(0, 50)
        .some(({ value: value }: Dynamic) => value?.kind === 'text' && dateLikeTextPattern.test(value.value.slice(0, 20)))),
);
export const CROSS_MARK_EMOJI = new (Set as Dynamic)([
  '❌',
  '❎',
  '\uD83D\uDEAB',
  '⛔',
  '\uD83D\uDED1',
  '✖',
  '➖',
  '\uD83D\uDC4E',
  '\uD83D\uDE45',
]);
export const emojiInText = (text?: Dynamic) => text.match(/\p{Extended_Pictographic}/gu) ?? [];
export const emojiInColumn = cachedPerObject(
  ({ values: values, optionsOfDropdown: optionsOfDropdown }: Dynamic) =>
    new (Set as Dynamic)(
      [...values.map(({ value: value }: Dynamic) => String(value?.value ?? '')), ...(optionsOfDropdown ?? [])].flatMap(emojiInText),
    ),
);
export const singleWordValuesOf = cachedPerObject(
  ({ values: values }: Dynamic) =>
    new (Set as Dynamic)(
      values.flatMap(({ value: value }: Dynamic) => {
        if (value?.kind !== 'text' || value.value.trim().split(/\s+/, 3).length > 2) return [];
        let [onlyWord, ...moreWords] = plainWordsOf(value.value);
        return onlyWord === undefined || moreWords.length > 0 ? [] : [onlyWord];
      }),
    ),
);
export const unassignedPhraseLengthAt = (words?: Dynamic, at?: Dynamic) => {
  let length = UNASSIGNED_PHRASES.find((phrase?: Dynamic) => wordsMatchAt(words, at, phrase))?.length ?? 0;
  return words[at + length - 1]?.plain === 'assigned' && words[at + length]?.plain === 'to' ? 0 : length;
};
export const isOnlyTextColumn = ({ columns: [onlyColumn] }: Dynamic, column?: Dynamic) =>
  column === onlyColumn && column.kind === 'text' && !isPeopleColumn(column);
export const MOST_LISTED_VALUES = 12;
export const isColumnOfFewValues = (column?: Dynamic) =>
  column.optionsOfDropdown !== null ||
  column.kind === 'fewWords' ||
  isPeopleColumn(column) ||
  (column.kind === 'text' &&
    !column.areMoreValuesLeftOut &&
    column.values.length <= MOST_LISTED_VALUES &&
    column.values.some(({ value: value, records: records }: Dynamic) => value !== null && records > 1));
export const NUMBER_SIGN_OR_HYPHEN_PATTERN = /(?<=\d)[-+−]+(?!\S)|(?<=[\p{L}\p{N}])-(?=[\p{L}\p{N}])/gu;
export const PLAINLY_TYPED_PATTERN = /^(?!.*(?:\.\.|\b(?:plus|minus)\b))[\p{L}\p{N}\s,/&'’"“”()?!.]*$/isu;
export const valueLabelsCache = new (WeakMap as Dynamic)();
export const COMMAND_WORD_SETS = [
  COMMAND_WORDS,
  TASK_NOUNS,
  BLANK_WORDS,
  FILLED_WORDS,
  QUESTION_FILLER_WORDS,
  DATE_CONDITION_WORDS,
  NUMBER_CONDITION_WORDS,
  TEXT_TEST_WORDS,
  LARGEST_SMALLEST_WORDS,
];
export const NON_NAME_WORD_SETS = [
  ...COMMAND_WORD_SETS.filter((wordSet?: Dynamic) => wordSet !== QUESTION_FILLER_WORDS),
  CHECKED_RULE_WORDS,
  UNCHECKED_WORDS,
  WORDS_NOT_TAKEN_AS_VALUES,
  new (Set as Dynamic)(UNASSIGNED_PHRASES.flat()),
];
export const pluralFormsOf = (word?: Dynamic) =>
  [word, `${word}s`, `${word}es`].concat(word.endsWith('y') ? `${word.slice(0, -1)}ies` : []);
export const leadingNameWordsOf = cachedPerObject(
  (column?: Dynamic) =>
    new (Set as Dynamic)(
      [plainWordsOf(column.name ?? ''), ...valueLabelsOf(column).map((label?: Dynamic) => label.words)].flatMap(
        (words?: Dynamic) => words.slice(0, -1),
      ),
    ),
);
export const valuesNamedCache = new (WeakMap as Dynamic)();
