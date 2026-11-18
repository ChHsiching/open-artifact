import type { Dynamic } from '../../dynamic.ts';
import { columnLetters } from '../../model/a1-references.ts';
export function trimWordQuotes(word?: Dynamic) {
  let [start, end]: Dynamic = [0, word.length];
  while (word[start] === "'") start += 1;
  while (end > start && word[end - 1] === "'") end -= 1;
  return word.slice(start, end);
}
export function dropStrayApostrophes(text?: Dynamic) {
  let [result, index]: Dynamic = ['', 0];
  while (index < text.length) {
    let next: Dynamic = index;
    while (text[next] === "'") next += 1;
    if (next === index) next += 1;
    else if (!isSearchWordChar(text[index - 1]) || !isSearchWordChar(text[next])) index = next;
    result += text.slice(index, next);
    index = next;
  }
  return result.trim();
}
export function searchFormOf(label?: Dynamic) {
  let cached = SEARCH_FORM_CACHE.get(label);
  if (cached !== undefined) return cached;
  if (SEARCH_FORM_CACHE.size >= SEARCH_FORM_CACHE_LIMIT) SEARCH_FORM_CACHE.clear();
  let compared = normalizeSearchText(label);
  let entry = {
    compared: compared,
    words: splitSearchWords(compared),
  };
  SEARCH_FORM_CACHE.set(label, entry);
  return entry;
}
export function queryWordsBeyondIgnored(query?: Dynamic, ignoredWords?: Dynamic) {
  let words = splitSearchWords(query);
  return hasQueryWordsBeyondIgnored(query, ignoredWords) ? words.filter((input?: Dynamic) => !ignoredWords.has(input)) : words;
}
export function rankCommandMatch({ label: label, otherWords = [] }: Dynamic, query?: Dynamic, ignoredWords?: Dynamic) {
  let [{ compared: compared, words: labelWords2 }, queryWords] = [searchFormOf(label), queryWordsBeyondIgnored(query, ignoredWords)];
  if (queryWords.length === 0) return null;
  if (compared === query) return MATCH_RANK_EXACT;
  let isOtherWordWhole =
    splitSearchWords(query).length > 1 && otherWords.some((input?: Dynamic) => searchFormOf(input).compared === query);
  if (compared.startsWith(query) || isOtherWordWhole) return MATCH_RANK_PREFIX;
  let allQueryWordsIn = (input?: Dynamic) =>
    queryWords.every((input2?: Dynamic) => input.some((input3?: Dynamic) => searchWordMatches(input2, input3)));
  if (allQueryWordsIn(labelWords2)) return 2;
  let otherWordsToTry =
    queryWords.length === 1 && queryWords.join('').length <= 2 && splitSearchWords(query).length > 1
      ? otherWords.filter((input?: Dynamic) => searchFormOf(input).words.length === 1)
      : otherWords;
  if (allQueryWordsIn([label, ...otherWordsToTry].flatMap((input?: Dynamic) => searchFormOf(input).words))) return 3;
  return compared.includes(query) ? MATCH_RANK_SUBSTRING : null;
}
export function wordsWithout(words?: Dynamic, removed?: Dynamic) {
  let remaining = [...words];
  for (let word of removed as Dynamic) {
    let index = remaining.indexOf(word);
    if (index !== -1) remaining.splice(index, 1);
  }
  return remaining;
}
export function distinctiveWordsOfCommands(commands?: Dynamic) {
  let wordsByStem = new (Map as Dynamic)();
  for (let command of commands as Dynamic) {
    let [stem, words] = [commandIdStem(command.id), commandWordsOf(command)];
    let known = wordsByStem.get(stem);
    wordsByStem.set(stem, {
      words: known === undefined ? words : sharedWords(words, known.words),
      count: (known?.count ?? 0) + 1,
    });
  }
  return (command?: Dynamic) => {
    let known = wordsByStem.get(commandIdStem(command.id));
    return command.id !== commandIdStem(command.id) && (known?.count ?? 0) > 1
      ? wordsWithout(commandWordsOf(command), known?.words ?? [])
      : commandWordsOf(command);
  };
}
export function commandPlaceRank(command?: Dynamic, distance?: Dynamic, queryWords?: Dynamic, query?: Dynamic) {
  let { label: label } = command;
  let adjustedDistance =
    commandActsOnCells(command) &&
    command.isWeighty !== true &&
    !isTickedVariant(command) &&
    label.includes(':') &&
    normalizeSearchText(label.slice(label.indexOf(':') + 1)) === query
      ? Math.min(distance, MATCH_RANK_PREFIX)
      : distance;
  let tier =
    adjustedDistance <= MATCH_RANK_PREFIX || everyWordInCommand(command, queryWords)
      ? 0
      : commandActsOnCells(command) || command.home === 'toolbar'
        ? 1
        : 2;
  let hasAllWords = queryWords.every((word?: Dynamic) => commandWordsOf(command).includes(word));
  return (command.whyNot === null ? 0 : 1000) + tier * 100 + adjustedDistance * 10 + (hasAllWords ? 0 : 1);
}
export function keepVariantsTogether(ranked?: Dynamic) {
  let samePlace = ranked.filter(({ place: place }: Dynamic) => place === ranked[0]?.place);
  let firstPlain = samePlace.find(({ command: command }: Dynamic) => !isTickedVariant(command));
  if (firstPlain === undefined) return ranked;
  let tickedBefore = samePlace.slice(0, samePlace.indexOf(firstPlain));
  let isSameStemVariant = ({ command: { id: otherId, label: otherLabel } }: Dynamic) =>
    commandIdStem(otherId) === commandIdStem(firstPlain.command.id) &&
    wordsWithout(searchFormOf(otherLabel).words, searchFormOf(firstPlain.command.label).words).length === 0;
  let kept = [...tickedBefore.filter(isSameStemVariant), ...samePlace.slice(tickedBefore.length)];
  for (let moved of tickedBefore.filter((word?: Dynamic) => !isSameStemVariant(word)) as Dynamic) {
    let insertAt = kept
      .map(({ command: command }: Dynamic) => commandIdStem(command.id))
      .lastIndexOf(commandIdStem(moved.command.id));
    kept.splice(insertAt === -1 ? kept.length : insertAt + 1, 0, moved);
  }
  return [...kept, ...ranked.slice(samePlace.length)];
}
export function commandsForQueryPrefix(commands?: Dynamic, query?: Dynamic) {
  if (query.startsWith('=')) return [];
  return query.startsWith('#') ? commands.filter(({ id: id }: Dynamic) => id.includes('#')) : commands;
}
export function searchCommands(commands?: Dynamic, query?: Dynamic, limit?: Dynamic, vocabulary: Dynamic = NO_IGNORED_SEARCH_WORDS) {
  let normalized = dropStrayApostrophes(normalizeSearchText(query));
  let queryWords = queryWordsBeyondIgnored(normalized, vocabulary);
  let seen = new (Set as Dynamic)();
  let found = commandsForQueryPrefix(commands, normalized).flatMap((command?: Dynamic) => {
    let distance = seen.has(command.id) || seen.has(command.label) ? null : rankCommandMatch(command, normalized, vocabulary);
    seen.add(command.id).add(command.label);
    return distance === null
      ? []
      : [
          {
            command: command,
            place: commandPlaceRank(command, distance, queryWords, normalized),
          },
        ];
  });
  let stems = new (Set as Dynamic)(commands.map(({ id: id }: Dynamic) => commandIdStem(id)));
  let stemsFound = new (Set as Dynamic)(
    found.flatMap(({ command: { id: id, whyNot: whyNot } }: Dynamic) => (stems.has(id) && whyNot === null ? [id] : [])),
  );
  let distinctiveWordsOf = distinctiveWordsOfCommands(commands);
  let matches = found.filter(
    ({ command: command }: Dynamic) =>
      command.id === commandIdStem(command.id) ||
      !stemsFound.has(commandIdStem(command.id)) ||
      anyWordMatches(queryWords, distinctiveWordsOf(command)),
  );
  matches.sort((first?: Dynamic, second?: Dynamic) => first.place - second.place);
  let ordered = keepVariantsTogether(matches);
  let topStem = ordered[0] === undefined ? null : commandIdStem(ordered[0].command.id);
  return ordered
    .filter(({ command: { id: id } }: Dynamic, index?: Dynamic) => index < limit || commandIdStem(id) === topStem)
    .map(({ command: command }: Dynamic) => command);
}
export function wordEditDistance(first?: Dynamic, second?: Dynamic) {
  let [rowBeforeLast, lastRow]: Dynamic = [
    [],
    Array.from<Dynamic, Dynamic>(
      {
        length: second.length + 1,
      },
      (row?: Dynamic, index?: Dynamic) => index,
    ),
  ];
  for (let i: Dynamic = 1; i <= first.length; i += 1) {
    let row = [i];
    for (let j: Dynamic = 1; j <= second.length; j += 1) {
      let isSwap = first[i - 1] === second[j - 2] && first[i - 2] === second[j - 1];
      row.push(
        Math.min(
          (lastRow[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + 1,
          (lastRow[j - 1] ?? 0) + (first[i - 1] === second[j - 1] ? 0 : 2),
          isSwap ? (rowBeforeLast[j - 2] ?? 0) + 1 : Number.POSITIVE_INFINITY,
        ),
      );
    }
    [rowBeforeLast, lastRow] = [lastRow, row];
  }
  return lastRow[second.length] ?? 0;
}
export function correctedCommandQuery(commands?: Dynamic, query?: Dynamic, vocabulary: Dynamic = NO_IGNORED_SEARCH_WORDS) {
  let queryWords = splitSearchWords(dropStrayApostrophes(normalizeSearchText(query)));
  if (queryWords.length > MAX_WORDS_TO_CORRECT || /^[#=]/.test(query.trim())) return null;
  let labelWords2 = new (Set as Dynamic)(commands.flatMap(({ label: label }: Dynamic) => searchFormOf(label).words));
  let knownWords = [...new (Set as Dynamic)([...labelWords2, ...commands.flatMap(commandWordsOf)])].filter(
    (word?: Dynamic) => !vocabulary.has(word),
  );
  let corrected = queryWords.map((word?: Dynamic) => {
    if (word.length < MIN_WORD_LENGTH_TO_CORRECT || vocabulary.has(word)) return word;
    if (knownWords.some((knownWord?: Dynamic) => searchWordMatchesStrictly(word, knownWord))) return word;
    let maxSlips = word.length >= LONG_WORD_LENGTH ? 2 : 1;
    let nearWords = knownWords
      .filter((knownWord?: Dynamic) => knownWord[0] === word[0] && Math.abs(knownWord.length - word.length) <= maxSlips)
      .map(
        (knownWord?: Dynamic) => ({
          each: knownWord,
          slips: wordEditDistance(word, knownWord),
        }),
      )
      .filter(({ slips: slips }: Dynamic) => slips <= maxSlips);
    nearWords.sort((first?: Dynamic, second?: Dynamic) => first.slips - second.slips);
    return nearWords[0]?.each ?? word;
  });
  return corrected.join(' ') === queryWords.join(' ') ? null : corrected.join(' ');
}
export function commandsSharingWords(commands?: Dynamic, query?: Dynamic, vocabulary?: Dynamic) {
  let normalized = dropStrayApostrophes(normalizeSearchText(query));
  let queryWords = meaningfulQueryWords(normalized, vocabulary);
  if (splitSearchWords(normalized).length < 2) return [];
  let seenLabels = new (Set as Dynamic)();
  let scored = commandsForQueryPrefix(commands, normalized)
    .filter(({ label: label }: Dynamic) => !seenLabels.has(label) && seenLabels.add(label).size > 0)
    .map(
      (command?: Dynamic) => ({
        command: command,
        inLabel: queryWords.filter((word?: Dynamic) => wordsHaveForm(searchFormOf(command.label).words, word)),
        anywhere: queryWords.filter((word?: Dynamic) => wordsHaveForm(commandWordsOf(command), word)),
      }),
    );
  let isDistinctive = (word?: Dynamic) =>
    !isNumberWord(word) && scored.filter(({ inLabel: inLabel }: Dynamic) => inLabel.includes(word)).length <= MAX_LABELS_PER_DISTINCT_WORD;
  let distinctiveWords = new (Set as Dynamic)(queryWords.filter(isDistinctive));
  let matches = scored.filter(
    ({ inLabel: inLabel, anywhere: anywhere }: Dynamic) =>
      inLabel.some((word?: Dynamic) => distinctiveWords.has(word)) || (anywhere.length >= 2 && anywhere.length * 2 >= queryWords.length),
  );
  matches.sort(
    (first?: Dynamic, second?: Dynamic) =>
      second.anywhere.length === first.anywhere.length
        ? second.inLabel.length - first.inLabel.length
        : second.anywhere.length - first.anywhere.length,
  );
  return matches.map(({ command: command }: Dynamic) => command);
}
export function commandMatchesDistinctWord(commands?: Dynamic, query?: Dynamic, vocabulary?: Dynamic) {
  let queryWords = meaningfulQueryWords(dropStrayApostrophes(normalizeSearchText(query)), vocabulary);
  let sharedWordsByStem = new (Map as Dynamic)();
  let sharedWordsOfStem = (stem?: Dynamic) => {
    let known = sharedWordsByStem.get(stem);
    if (known !== undefined) return known;
    let variants = commands.filter(({ id: id }: Dynamic) => id !== stem && commandIdStem(id) === stem);
    let shared = new (Set as Dynamic)(
      variants.length < 2
        ? []
        : queryWords.filter((command?: Dynamic) => variants.every((word?: Dynamic) => commandHasWord(command, word))),
    );
    sharedWordsByStem.set(stem, shared);
    return shared;
  };
  return (command?: Dynamic) =>
    queryWords.some((word?: Dynamic) => !sharedWordsOfStem(commandIdStem(command.id)).has(word) && commandHasWord(word, command));
}
export function commandsFoundByWords(commands?: Dynamic, query?: Dynamic, vocabulary?: Dynamic, limit?: Dynamic) {
  let queryWords = splitSearchWords(normalizeSearchText(query)).filter((word?: Dynamic) => !vocabulary.has(word));
  let found = commands.flatMap((command?: Dynamic) => {
    let commandWords = [command.label, ...(command.otherWords ?? [])].flatMap((label?: Dynamic) => searchFormOf(label).words);
    let count = queryWords.filter(
      (word?: Dynamic) => commandWords.some((queryWord?: Dynamic) => wordsOverlap(queryWord, word)),
    ).length;
    return count === 0 || command.whyNot !== null
      ? []
      : [
          {
            command: command,
            count: count,
          },
        ];
  });
  found.sort((first?: Dynamic, second?: Dynamic) => second.count - first.count);
  return found.slice(0, limit).map(({ command: command }: Dynamic) => command);
}
export function everyWordInCommand(
  { label: label, otherWords = [] }: Dynamic,
  words?: Dynamic,
  labelWordMatches: Dynamic = isSameWordStem,
  otherWordMatches: Dynamic = isSameWordStem,
) {
  let isInOtherWords = (word?: Dynamic) =>
    otherWords.some((otherWord?: Dynamic) => {
      let [onlyWord, ...moreWords] = searchFormOf(otherWord).words;
      return moreWords.length === 0 && onlyWord !== undefined && otherWordMatches(word, onlyWord);
    });
  return words.every(
    (word?: Dynamic) =>
      searchFormOf(label).words.some((labelWord?: Dynamic) => labelWordMatches(word, labelWord)) || isInOtherWords(word),
  );
}
export function hasOtherNumberWord(id?: Dynamic, words?: Dynamic) {
  let [kind = '', index = ''] = id.split('.').slice(2);
  let ownNumbers = new (Set as Dynamic)([index, ...(kind === 'columns' ? [columnLetters(Number(index) - 1).toLowerCase()] : [])]);
  return words.some((word?: Dynamic) => (/^\p{N}+$/u.test(word) || (kind === 'columns' && /^[a-z]$/.test(word))) && !ownNumbers.has(word));
}
export function isCommandNamedFully(command?: Dynamic, query?: Dynamic, queryWords?: Dynamic) {
  let { id: id, label: label, otherWords = [], actsOn: actsOn, isTicked: isTicked } = command;
  let labelAfterColon = splitSearchWords(normalizeSearchText(label.slice(label.indexOf(':') + 1))).join(' ');
  if (queryWords.every((word?: Dynamic) => /^\p{N}+$/u.test(word)))
    return id !== commandIdStem(id) && label.includes(':') && labelAfterColon === queryWords.join(' ');
  let [firstWord = '', ...restWords] = searchFormOf(label).words;
  let isLabelWord = (word?: Dynamic) =>
    [firstWord, ...restWords].some((labelWord?: Dynamic) => searchWordMatchesStrictly(word, labelWord));
  if (
    splitSearchWords(query)
      .filter((word?: Dynamic) => queryWords.includes(word) || isLabelWord(word))
      .join('').length < MATCH_RANK_OTHER_WORDS
  )
    return false;
  let labelStartsWithQuery = [firstWord, ...restWords].join(' ').startsWith(splitSearchWords(query).join(' '));
  let actsOnSheetOrFile = actsOn === 'sheet' || actsOn === 'file';
  let isNamed = actsOnSheetOrFile
    ? labelStartsWithQuery ||
      (queryWords.some((word?: Dynamic) => searchWordMatchesStrictly(word, firstWord)) &&
        queryWords.every(
          (word?: Dynamic) =>
            searchWordMatchesStrictly(word, firstWord) || restWords.some((restWord?: Dynamic) => isInflectionOf(word, restWord)),
        ))
    : queryWords.every(isLabelWord);
  if (isTicked !== undefined && id === commandIdStem(id)) return isNamed;
  let isFreezeCount = id.startsWith('menu.freeze.') && !id.endsWith('.0');
  if (id.startsWith('menu.freeze.') && !isFreezeCount && everyWordInCommand(command, queryWords, searchWordMatchesStrictly, isInflectionOf))
    return true;
  if (!isFreezeCount && otherWords.some((label2?: Dynamic) => searchFormOf(label2).compared === query)) return true;
  let labelIsQuery = [firstWord, ...restWords].join(' ') === splitSearchWords(query).join(' ');
  if (isFreezeCount && !labelIsQuery && hasOtherNumberWord(id, splitSearchWords(query))) return false;
  if (actsOnSheetOrFile) return isNamed;
  if (labelStartsWithQuery) return true;
  return everyWordInCommand(command, queryWords, commandActsOnCells(command) ? searchWordMatchesStrictly : isInflectionOf, isInflectionOf);
}
export function isClearTopCommand(found?: Dynamic, query?: Dynamic, commands?: Dynamic, vocabulary?: Dynamic) {
  let [top, ...rest] = found;
  let normalized = dropStrayApostrophes(normalizeSearchText(query));
  let topDistance = top === undefined ? null : rankCommandMatch(top, normalized, vocabulary);
  if (top === undefined || topDistance === null || topDistance === MATCH_RANK_SUBSTRING) return false;
  if (topDistance === MATCH_RANK_EXACT) return true;
  if (!hasQueryWordsBeyondIgnored(normalized, vocabulary)) return false;
  if (!isCommandNamedFully(top, normalized, queryWordsBeyondIgnored(normalized, vocabulary))) return false;
  let [queryWords, distinctiveWordsOf] = [queryWordsBeyondIgnored(normalized, vocabulary), distinctiveWordsOfCommands(commands)];
  let topWords = distinctiveWordsOf(top);
  let lastWordInLabel = searchFormOf(top.label).words.includes(splitSearchWords(normalized).at(-1) ?? '');
  let isOtherOpenCandidate = (command?: Dynamic) =>
    command.whyNot === null && !isOpeningCommand(command) && normalizeSearchText(command.label).startsWith(normalized);
  let isTopUnrivalled = lastWordInLabel || !rest.some(isOtherOpenCandidate);
  if (isOpeningCommand(top) && !top.label.includes(':') && isTopUnrivalled) return true;
  let rivalsTop = (other?: Dynamic) => {
    let distance = other.whyNot === null ? rankCommandMatch(other, normalized, vocabulary) : null;
    if (distance === null) return false;
    if (commandIdStem(other.id) !== commandIdStem(top.id)) {
      let otherLabelWords = searchFormOf(other.label).words;
      let isSameValueKind =
        commandActsOnCells(top) &&
        commandActsOnCells(other) &&
        other.label.includes(':') &&
        normalizeSearchText(other.label.slice(other.label.indexOf(':') + 1)).startsWith(normalized);
      return distance <= topDistance || isSameValueKind || queryWords.every((word?: Dynamic) => otherLabelWords.includes(word));
    }
    if (distance !== topDistance) return false;
    let [otherWords, topWordsOfOther] = [searchFormOf(other.label).words, searchFormOf(top.label).words];
    let coversTop = wordsWithout(topWordsOfOther, otherWords).length === 0;
    return (isTickedVariant(other) || anyWordMatches(queryWords, distinctiveWordsOf(other))) && !coversTop;
  };
  return anyWordMatches(queryWords, topWords) && !rest.some(rivalsTop);
}
export function labelMatchesWordsExactly({ label: label }: Dynamic, query?: Dynamic, vocabulary?: Dynamic) {
  let queryWords = queryWordsBeyondIgnored(dropStrayApostrophes(normalizeSearchText(query)), vocabulary);
  let meaningfulWordsOf = (label2?: Dynamic) =>
    searchFormOf(label2).words.filter((word?: Dynamic) => !vocabulary.has(word));
  let isSameWords = (words?: Dynamic) =>
    words.length === queryWords.length &&
    words.every((word?: Dynamic, index?: Dynamic) => isSameWordOrPlural(queryWords[index] ?? '', word));
  let colonAt = label.indexOf(':');
  let [beforeColon, afterColon] = [meaningfulWordsOf(label.slice(0, Math.max(colonAt, 0))), meaningfulWordsOf(label.slice(colonAt + 1))];
  return isSameWords([...beforeColon, ...afterColon]) || (beforeColon.length > 0 && isSameWords([...afterColon, ...beforeColon]));
}
export function labelMatchesWordsInOrder({ label: label }: Dynamic, query?: Dynamic, vocabulary?: Dynamic) {
  if (QUESTION_MARKS.test(query) && !QUESTION_MARKS.test(label)) return false;
  let queryWords = splitSearchWords(dropStrayApostrophes(normalizeSearchText(query)));
  if (queryWords.every((word?: Dynamic) => vocabulary.has(word))) return false;
  let isQueryWord = (word?: Dynamic, queryWord: Dynamic = '') =>
    queryWord === word || (isSameWordOrPlural(queryWord, word) && (!vocabulary.has(word) || vocabulary.has(queryWord)));
  let hasQueryWordsInOrder = (words?: Dynamic) => {
    let matched: Dynamic = 0;
    for (let word of words as Dynamic)
      if (isQueryWord(word, queryWords[matched])) matched += 1;
      else if (!vocabulary.has(word)) return false;
    return matched === queryWords.length;
  };
  let colonAt = label.indexOf(':');
  let [beforeColon, afterColon] = [searchFormOf(label.slice(0, Math.max(colonAt, 0))).words, searchFormOf(label.slice(colonAt + 1)).words];
  return hasQueryWordsInOrder([...beforeColon, ...afterColon]) || (beforeColon.length > 0 && hasQueryWordsInOrder([...afterColon, ...beforeColon]));
}
export const COMMANDS_TO_CONFIRM = new Set([
  'menu.deleteRows',
  'menu.deleteColumns',
  'sheet.tab.delete',
  'menu.clearContents',
  'menu.clearFormatting',
  'menu.mergeCells',
  'bar.mergeCells',
  'menu.paste',
  'menu.pasteValuesOnly',
]);
export const isCommandToConfirm = ({ id: id }: Dynamic) => COMMANDS_TO_CONFIRM.has(id);
export const commandActsOnCells = ({ actsOn: actsOn }: Dynamic) => actsOn === 'cells' || actsOn === 'activeCell';
export const normalizeSearchText = (text?: Dynamic) =>
  text.normalize('NFD').replaceAll(/\p{M}/gu, '').toLowerCase().replaceAll('’', "'").trim();
export const isSearchWordChar = (char?: Dynamic) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
export const splitSearchWords = (text?: Dynamic) =>
  text
    .split(/[^\p{L}\p{N}']+/u)
    .map(trimWordQuotes)
    .filter((input?: Dynamic) => input !== '');
export const SEARCH_FORM_CACHE = new (Map as Dynamic)();
export const SEARCH_FORM_CACHE_LIMIT = 8000;
export const hasSearchWords = (query?: Dynamic) => splitSearchWords(normalizeSearchText(query)).length > 0;
export const MATCH_RANK_EXACT = 0;
export const MATCH_RANK_PREFIX = 1;
export const MATCH_RANK_SUBSTRING = 4;
export const MATCH_RANK_OTHER_WORDS = 3;
export const searchWordMatches = (queryWord?: Dynamic, labelWord?: Dynamic) =>
  labelWord.startsWith(queryWord) || isSameWordStem(queryWord, labelWord);
export const isSameWordStem = (word?: Dynamic, stem?: Dynamic) =>
  word === stem || (stem.length > 3 && word.startsWith(stem) && word.length - stem.length <= 3) || (stem.length === 3 && word === `${stem}s`);
export const INFLECTION_ENDINGS = new (Set as Dynamic)(['s', 'es', "'s", 'd', 'ed', 'ing']);
export const isInflectionOf = (word?: Dynamic, stem?: Dynamic) =>
  isSameWordStem(word, stem) && (word === stem || INFLECTION_ENDINGS.has(word.slice(stem.length)));
export const searchWordMatchesStrictly = (queryWord?: Dynamic, labelWord?: Dynamic) =>
  labelWord.startsWith(queryWord) || isInflectionOf(queryWord, labelWord);
export const NO_IGNORED_SEARCH_WORDS = new (Set as Dynamic)();
export const hasQueryWordsBeyondIgnored = (query?: Dynamic, ignoredWords?: Dynamic) =>
  splitSearchWords(query).some((items?: Dynamic) => items.length > 1 && !ignoredWords.has(items));
export const commandIdStem = (id?: Dynamic) => {
  let parts = id.split('.');
  return parts.length > 2 ? parts.slice(0, -1).join('.') : id;
};
export const sharedWords = (words?: Dynamic, otherWords?: Dynamic) => wordsWithout(words, wordsWithout(words, otherWords));
export const commandWordsOf = ({ label: label, otherWords = [] }: Dynamic) =>
  [label, ...otherWords].flatMap((text?: Dynamic) => searchFormOf(text).words);
export const anyWordMatches = (words?: Dynamic, otherWords?: Dynamic) =>
  words.some((otherWord?: Dynamic) => otherWords.some((queryWord?: Dynamic) => searchWordMatches(otherWord, queryWord)));
export const queryMatchesOtherWords = ({ otherWords = [] }: Dynamic, query?: Dynamic) =>
  anyWordMatches(
    splitSearchWords(normalizeSearchText(query)),
    otherWords.flatMap((text?: Dynamic) => searchFormOf(text).words),
  );
export const isTickedVariant = ({ id: id, isTicked: isTicked }: Dynamic) => isTicked === true && id !== commandIdStem(id);
export const MIN_WORD_LENGTH_TO_CORRECT = 5;
export const LONG_WORD_LENGTH = 9;
export const MAX_WORDS_TO_CORRECT = 5;
export const oneCommandPerStem = (commands?: Dynamic) =>
  commands.filter(
    ({ id: id }: Dynamic, index?: Dynamic) =>
      commands.findIndex((other?: Dynamic) => commandIdStem(other.id) === commandIdStem(id)) === index,
  );
export const MAX_LABELS_PER_DISTINCT_WORD = 3;
export const isNumberWord = (word?: Dynamic) => /^\p{N}+$/u.test(word);
export const wordsHaveForm = (words?: Dynamic, word?: Dynamic) =>
  words.some((otherWord?: Dynamic) => isInflectionOf(word, otherWord));
export const MAX_QUERY_WORDS = 12;
export const meaningfulQueryWords = (query?: Dynamic, vocabulary?: Dynamic) =>
  [...new (Set as Dynamic)(queryWordsBeyondIgnored(query, vocabulary))]
    .filter((word?: Dynamic) => word.length > 2 || isNumberWord(word))
    .slice(0, MAX_QUERY_WORDS);
export const commandHasWord = (word?: Dynamic, command?: Dynamic) =>
  commandWordsOf(command).some((otherWord?: Dynamic) => (isNumberWord(word) ? otherWord === word : searchWordMatches(word, otherWord)));
export const wordsOverlap = (word?: Dynamic, otherWord?: Dynamic) =>
  word === otherWord || (Math.min(word.length, otherWord.length) > 3 && (word.startsWith(otherWord) || otherWord.startsWith(word)));
export const isOpeningCommand = ({ actsOn: actsOn, id: id, isWeighty: isWeighty }: Dynamic) =>
  isWeighty !== true && (actsOn === 'opens' || actsOn === 'goesTo' || (actsOn === 'view' && !id.startsWith('menu.')));
export const isSameWordOrPlural = (word?: Dynamic, otherWord?: Dynamic) =>
  word === otherWord || word === `${otherWord}s` || `${word}s` === otherWord;
export const QUESTION_MARKS = /[?;\u00bf\u037e\u055e\u061f\u203d\u2047-\u2049\u2753\u2754\u2e2e\ufe56\uff1f]/u;
export const commandToRunForQuery = (
  found?: Dynamic,
  query?: Dynamic,
  commands: Dynamic = found,
  vocabulary: Dynamic = NO_IGNORED_SEARCH_WORDS,
) => {
  let [top] = found;
  return top === undefined ||
    top.whyNot !== null ||
    (top.isWeighty === true && (query === null || !labelMatchesWordsExactly(top, query, vocabulary))) ||
    (query !== null && !isClearTopCommand(found, query, commands, vocabulary))
    ? null
    : top;
};
export const isRememberedCommandOutOfUse = (remembered?: Dynamic, words?: Dynamic, commands?: Dynamic) =>
  remembered?.words === words && commands.some(({ id: id, whyNot: whyNot }: Dynamic) => id === remembered.id && whyNot !== null);
