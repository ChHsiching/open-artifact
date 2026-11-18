import type { Dynamic } from '../../dynamic.ts';
import { rowSpansIn, mergedSpans, ownRowOrderOfSheet, rowIndexIn } from '../../model/line-ids.ts';
import { rowSpanOfArea, areaToA1, areaWithRowSpan, parseA1AreaAsSeen } from '../../model/a1-references.ts';
import { readsAsStored } from '../../model/workbook.ts';
import { holdsOfArea, squeezeSpaces, areAllNumbersIn } from './area-holds.ts';
import { headedColumnsOfPlainTable } from './plain-table.ts';
import { isAddressWordInSheet } from '../column-headings.ts';
import { cellValueOf } from '../../model/cell-values.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export let lastLabelWords: Dynamic;
export function areaToA1AsStored(area?: Dynamic, ownRowOrder?: Dynamic) {
  let runs = rowSpansIn('stored', ownRowOrder, rowSpanOfArea(area));
  return [
    ...runs.slice(0, ROW_RUNS_SHOWN_IN_A1).map((run?: Dynamic) => areaToA1(areaWithRowSpan(area, run))),
    ...(runs.length > ROW_RUNS_SHOWN_IN_A1 ? ['…'] : []),
  ].join(', ');
}
export function areasToA1AsStored(areas?: Dynamic, ownRowOrder?: Dynamic) {
  if (ownRowOrder === null) return areas.map(areaToA1).join(', ');
  let [firstArea] = areas;
  if (firstArea !== undefined && areas.length === 1) return areaToA1AsStored(firstArea, ownRowOrder);
  let byColumns = new (Map as Dynamic)();
  for (let area of areas) {
    let key = `${area.leftColumnIndex} ${area.columnCount}`;
    let entry = byColumns.get(key) ?? {
      like: area,
      rows: [],
    };
    byColumns.set(key, entry);
    for (let run of rowSpansIn('stored', ownRowOrder, rowSpanOfArea(area))) entry.rows.push(run);
  }
  let storedAreas = [...byColumns.values()].flatMap(
    ({ like: like, rows: rows }: Dynamic) => mergedSpans(rows).map((run?: Dynamic) => areaWithRowSpan(like, run)),
  );
  let shownCount = Math.max(areas.length, ROW_RUNS_SHOWN_IN_A1);
  return [...storedAreas.slice(0, shownCount).map(areaToA1), ...(storedAreas.length > shownCount ? ['…'] : [])].join(', ');
}
export function areaPastHeading(area?: Dynamic) {
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  if (rowCount > 1)
    return {
      ...area,
      topRowIndex: topRowIndex + 1,
      rowCount: rowCount - 1,
    };
  return {
    ...area,
    leftColumnIndex: leftColumnIndex + 1,
    columnCount: columnCount - 1,
  };
}
export function headingSpotBefore(area?: Dynamic) {
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount } = area;
  if (rowCount > 1)
    return topRowIndex === 0
      ? null
      : {
          ...area,
          topRowIndex: topRowIndex - 1,
          rowCount: 1,
        };
  return leftColumnIndex === 0
    ? null
    : {
        ...area,
        leftColumnIndex: leftColumnIndex - 1,
        columnCount: 1,
      };
}
export function holdsPeriods(holds?: Dynamic) {
  if (holds === null || holds.filledCount === 0) return false;
  if (holds.kinds.size === 1 && holds.kinds.has('date')) return true;
  let [lowest = 0, highest = 0] = holds.numbersLieIn ?? [];
  if (holds.numberCount === holds.filledCount && holds.isEveryNumberWhole && lowest >= 1900 && highest <= 2100) return true;
  return (
    holds.textCount === holds.filledCount &&
    Array.from<Dynamic>(holds.spelled.keys()).every((text?: Dynamic) => PERIOD_TEXT_PATTERN.test(text.trim()))
  );
}
export function isRunningTotalOfColumns(totals?: Dynamic, columns?: Dynamic) {
  let steps = totals.slice(1).map((total?: Dynamic, index?: Dynamic) => total - (totals[index] ?? 0));
  let stepsFollow = (stepAt?: Dynamic) =>
    steps.every((step?: Dynamic, index?: Dynamic) => Math.abs(step - stepAt(index + 1)) < 0.000001);
  if (steps.length < MIN_STEPS_FOR_RUNNING_TOTAL || steps.every((step?: Dynamic) => step === 0)) return false;
  return columns.some(
    (column?: Dynamic) =>
      stepsFollow((index?: Dynamic) => column[index] ?? 0) ||
      stepsFollow((index?: Dynamic) => -(column[index] ?? 0)) ||
      columns.some(
        (otherColumn?: Dynamic) =>
          otherColumn !== column && stepsFollow((index?: Dynamic) => (column[index] ?? 0) - (otherColumn[index] ?? 0)),
      ),
  );
}
export function holdsWholeWord(text?: Dynamic, word?: Dynamic) {
  if (text.length <= word.length || (/^(?:not|non|no|never)[\s-]+$/.test(text.slice(0, -word.length)) && text.endsWith(word))) return false;
  for (let at: Dynamic = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1))
    if (!isLetterOrDigit(text[at - 1]) && !isLetterOrDigit(text[at + word.length])) return true;
  return false;
}
export function endsInZerosAlone(numbers?: Dynamic) {
  let firstZeroAt = numbers.indexOf(0);
  return (
    firstZeroAt > 0 &&
    numbers.slice(firstZeroAt).every((number?: Dynamic) => number === 0) &&
    numbers.slice(0, firstZeroAt).every((number?: Dynamic) => number > 0)
  );
}
export function isSubsequenceOf(short?: Dynamic, long?: Dynamic) {
  let matched: Dynamic = 0;
  for (let character of long as Dynamic) if (character === short[matched]) matched += 1;
  return matched === short.length;
}
export function isInflectedForm(stem?: Dynamic, word?: Dynamic) {
  let ending = word.slice(stem.length);
  return /^\p{L}?(?:ing|ed)$/u.test(ending) || /^(?:est|ern)$/.test(ending.startsWith(stem.at(-1) ?? '') ? ending.slice(1) : ending);
}
export function isLabelAbbreviationOf(label?: Dynamic, word?: Dynamic, isOneOfSeveralWords?: Dynamic) {
  let stem = withoutTrailingDot(label);
  if (/\P{L}/u.test(stem + word)) return false;
  if (stem.length === 1) return word.startsWith(stem) && (word.length > 3 || !isOneOfSeveralWords);
  if (word.length < stem.length + 2) return false;
  let isShort = stem.length <= MAX_SHORT_ABBREVIATION_LENGTH;
  if (!word.startsWith(stem))
    return isShort && !/[aeiou]/.test(stem.slice(1)) && stem[0] === word[0] && stem.at(-1) === word.at(-1) && isSubsequenceOf(stem, word);
  if (isOneOfSeveralWords || label.endsWith('.')) return true;
  return isShort && word.length > stem.length + 2 && !isInflectedForm(stem, word);
}
export function isConsonantAbbreviationOf(label?: Dynamic, word?: Dynamic) {
  let stem = withoutTrailingDot(label);
  return (
    /^\p{L}{2,4}$/u.test(stem) && !/[aeiou]/.test(stem.slice(1)) && stem[0] === word[0] && stem.length < word.length && isSubsequenceOf(stem, word)
  );
}
export function isLikelyTypoOf(word?: Dynamic, otherWord?: Dynamic) {
  if (Math.min(word.length, otherWord.length) < MIN_TYPO_WORD_LENGTH || Math.abs(word.length - otherWord.length) > 1) return false;
  if (word[0] !== otherWord[0] || word.at(-1) !== otherWord.at(-1) || /\P{L}/u.test(word + otherWord)) return false;
  let sameUpTo: Dynamic = 0;
  while (sameUpTo < word.length && word[sameUpTo] === otherWord[sameUpTo]) sameUpTo += 1;
  let [rest, otherRest] = [word.slice(sameUpTo), otherWord.slice(sameUpTo)];
  return (
    rest.slice(1) === otherRest.slice(1) ||
    rest.slice(1) === otherRest ||
    rest === otherRest.slice(1) ||
    (rest[0] === otherRest[1] && rest[1] === otherRest[0] && rest.slice(2) === otherRest.slice(2))
  );
}
export function wordListsDifferByOneVariant(words?: Dynamic, otherWords?: Dynamic) {
  let differences = words.flatMap((word2?: Dynamic, index?: Dynamic) => {
    let otherWord2 = otherWords[index] ?? '';
    return withoutTrailingDot(word2) === withoutTrailingDot(otherWord2) ? [] : [[word2, otherWord2]];
  });
  let [[word, otherWord] = ['', '']] = differences;
  if (words.length !== otherWords.length || differences.length !== 1) return false;
  let isWordShorter = withoutTrailingDot(word).length <= withoutTrailingDot(otherWord).length;
  let [shorter, longer] = isWordShorter ? [word, otherWord] : [otherWord, word];
  let [shorterStem, longerStem] = [withoutTrailingDot(shorter), withoutTrailingDot(longer)];
  return (
    longerStem === shorterStem + 's' ||
    longerStem === shorterStem + 'es' ||
    isLabelAbbreviationOf(shorter, longerStem, words.length > 1) ||
    isLikelyTypoOf(shorterStem, longerStem)
  );
}
export function isInitialsOf(text?: Dynamic, words?: Dynamic) {
  let initials = words.map((word?: Dynamic) => (/^\p{N}/u.test(word) ? word : word.slice(0, 1))).join('');
  return words.length > 1 && text.startsWith(initials) && text.length <= initials.length + 1;
}
export function isWrittenOtherwise(label?: Dynamic, words?: Dynamic) {
  if (label === words) return false;
  let [labelCompacted, wordsCompacted] = [compactLabel(label), compactLabel(words)];
  let [shorter, longer] =
    labelCompacted.length <= wordsCompacted.length ? [labelCompacted, wordsCompacted] : [wordsCompacted, labelCompacted];
  if (shorter === '') return false;
  if (
    longer === shorter ||
    longer === shorter + 's' ||
    longer === shorter + 'es' ||
    (shorter.endsWith('y') && longer === shorter.slice(0, -1) + 'ies')
  )
    return true;
  if (shorter[0] !== longer[0] || shorter.replaceAll(/\P{N}/gu, '') !== longer.replaceAll(/\P{N}/gu, '')) return false;
  if (lastLabelWords.text !== words)
    lastLabelWords = {
      text: words,
      words: labelWords(words),
    };
  let [labelWordList, wordList] = [labelWords(label), lastLabelWords.words];
  let [fewerWords, moreWords] = labelWordList.length <= wordList.length ? [labelWordList, wordList] : [wordList, labelWordList];
  if (fewerWords.length === moreWords.length) return wordListsDifferByOneVariant(labelWordList, wordList);
  return (
    (fewerWords.length > 0 &&
      fewerWords.every((word?: Dynamic, index?: Dynamic) => withoutTrailingDot(word) === withoutTrailingDot(moreWords[index] ?? ''))) ||
    (fewerWords.length === 1 && isInitialsOf(withoutTrailingDot(fewerWords[0] ?? ''), moreWords))
  );
}
export function hasInflectedWordOf(label?: Dynamic, words?: Dynamic) {
  let wordList = labelWords(words);
  return labelWords(label).some((labelWord?: Dynamic, index?: Dynamic) => {
    let word = wordList[index] ?? '';
    let [shorter, longer] = labelWord.length <= word.length ? [labelWord, word] : [word, labelWord];
    return shorter !== '' && shorter !== longer && longer.startsWith(shorter) && isInflectedForm(shorter, longer);
  });
}
export function startsWithWordsOf(text?: Dynamic, start?: Dynamic) {
  let [textWords, startWords] = [labelWords(text), labelWords(start)];
  return (
    textWords.length > startWords.length &&
    startWords.every((word?: Dynamic, index?: Dynamic) => withoutTrailingDot(word) === withoutTrailingDot(textWords[index] ?? ''))
  );
}
export function canBeAddedUpWith(label?: Dynamic, otherLabels?: Dynamic, labelsInColumn?: Dynamic) {
  let labels = [label, ...otherLabels];
  let othersInColumn = labelsInColumn.filter((heldLabel?: Dynamic) => !labels.includes(heldLabel));
  let longerLabels = otherLabels.filter((otherLabel?: Dynamic) => compactLabel(otherLabel).length > compactLabel(label).length);
  return (
    !otherLabels.some(
      (otherLabel?: Dynamic) =>
        startsWithWordsOf(otherLabel, label) ||
        startsWithWordsOf(label, otherLabel) ||
        hasInflectedWordOf(otherLabel, label) ||
        trailingSigns(otherLabel) !== trailingSigns(label) ||
        numbersInText(otherLabel) !== numbersInText(label),
    ) &&
    longerLabels.every(
      (longerLabel?: Dynamic) =>
        longerLabels.every(
          (otherLongerLabel?: Dynamic) => otherLongerLabel === longerLabel || isWrittenOtherwise(otherLongerLabel, longerLabel),
        ),
    ) &&
    !labels.some(
      (ownLabel?: Dynamic) =>
        othersInColumn.some(
          (otherInColumn?: Dynamic) =>
            holdsWholeWord(otherInColumn, ownLabel) ||
            isConsonantAbbreviationOf(otherInColumn, ownLabel) ||
            isWrittenOtherwise(otherInColumn, ownLabel),
        ),
    )
  );
}
export function formulaFromWordsWhereAt(reads: WorkbookReads, cellId?: Dynamic, isRowShown?: Dynamic, isTableLooked: Dynamic = true) {
  let workbook = readsAsStored(reads);
  let { sheetId: sheetId } = cellId;
  let position = workbook.positionOfCell(cellId);
  let sheet = workbook.listSheets().find((sheet2?: Dynamic) => sheet2.sheetId === sheetId);
  if (position === null || sheet === undefined) return null;
  let ownRowOrder = ownRowOrderOfSheet(reads, sheetId);
  let holdsOf = (area?: Dynamic) => holdsOfArea(workbook, sheetId, area);
  let columns = isTableLooked
    ? headedColumnsOfPlainTable(workbook, cellId, (rowIndex?: Dynamic) => isRowShown(rowIndexIn('seen', ownRowOrder, rowIndex)))
    : [];
  let sheetAsItStands = workbook.sheetAsItStands(sheetId);
  let cached = sheetAsItStands === null ? undefined : formulaFromWordsWhereCache.get(sheetAsItStands);
  let isCacheFresh =
    cached?.cellId.rowId === cellId.rowId &&
    cached.cellId.columnId === cellId.columnId &&
    cached.where.decimalSign === workbook.decimalSign &&
    cached.where.columns.length === columns.length;
  if (cached !== undefined && isCacheFresh) return cached.where;
  let firstColumnArea = parseA1AreaAsSeen(columns[0]?.cells ?? '', sheet);
  let firstColumnIndex = (Math.min as Dynamic)(...workbook.columnIndexesOnShowIn(sheetId, 0));
  let recordsArea =
    firstColumnArea === null
      ? null
      : {
          ...firstColumnArea,
          leftColumnIndex: firstColumnIndex,
        };
  let columnAreas =
    firstColumnArea === null
      ? []
      : workbook.columnIndexesOnShowIn(sheetId, 0).map(
          (columnIndex?: Dynamic) => ({
            topRowIndex: firstColumnArea.topRowIndex,
            rowCount: firstColumnArea.rowCount,
            leftColumnIndex: columnIndex,
            columnCount: 1,
          }),
        );
  let runsOnCache = new (Map as Dynamic)();
  let risesOrFallsCache = new (Map as Dynamic)();
  let where = {
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    ownRowOrder: null,
    ...position,
    decimalSign: workbook.decimalSign,
    columns: columns,
    firstColumnIndexOfTable: recordsArea === null ? null : firstColumnIndex,
    areRecordsPeriods: holdsPeriods(recordsArea === null ? null : holdsOf(recordsArea)),
    isWordOfAHeading: (word?: Dynamic) => isAddressWordInSheet(word, sheetId, workbook),
    headings: columnAreas.flatMap(({ leftColumnIndex: leftColumnIndex }: Dynamic) => {
      let cellId2 = workbook.cellIdAt(sheetId, 0, leftColumnIndex);
      let value = cellId2 === null ? null : cellValueOf(workbook.cellOnShowIn(cellId2));
      return value?.kind === 'text' ? [value.value] : [];
    }),
    countOfColumnsThatHold: (text?: Dynamic) =>
      columnAreas.filter((columnArea?: Dynamic) => holdsOf(columnArea).squeezed.has(squeezeSpaces(text))).length,
    textHeldIn: (area?: Dynamic, text?: Dynamic) =>
      holdsOf(area).squeezed.get(squeezeSpaces(text)) === text ? (holdsOf(area).spelled.get(text) ?? null) : null,
    isTextPartOfALongerOneIn: (area?: Dynamic, text?: Dynamic) =>
      Array.from<Dynamic>(holdsOf(area).spelled.keys()).some((heldText?: Dynamic) => holdsWholeWord(heldText, text)),
    textsWrittenOtherwiseIn: (area?: Dynamic, text?: Dynamic) =>
      Array.from<Dynamic>(holdsOf(area).spelled).flatMap(
        ([lowered, spelled]: Dynamic) => (isWrittenOtherwise(lowered, text) ? [spelled] : []),
      ),
    canBeAddedUpIn: (area?: Dynamic, label?: Dynamic, otherLabels?: Dynamic) =>
      canBeAddedUpWith(label, otherLabels, Array.from<Dynamic>(holdsOf(area).spelled.keys())),
    endsInZerosAloneIn(area?: Dynamic) {
      if (area.columnCount !== 1) return false;
      return endsInZerosAlone(
        Array.from<Dynamic, Dynamic>(
          {
            length: area.rowCount,
          },
          (input?: Dynamic, rowOffset?: Dynamic) => {
            let cellId2 = workbook.cellIdAt(sheetId, area.topRowIndex + rowOffset, area.leftColumnIndex);
            return cellId2 === null ? undefined : holdsOf(area).byRow.get(cellId2.rowId);
          },
        ).flatMap((value?: Dynamic) => (typeof value === 'number' ? [value] : [])),
      );
    },
    mayTextBeHeldIn: (area?: Dynamic, text?: Dynamic) => holdsOf(area).isTooMany || holdsOf(area).squeezed.has(squeezeSpaces(text)),
    kindsHeldIn: (area?: Dynamic) => holdsOf(area).kinds,
    mayStartWithAHeading(area?: Dynamic) {
      let headingSpot = headingSpotBefore(area);
      if (headingSpot !== null && holdsOf(headingSpot).filledCount > 0) return false;
      let firstLine =
        area.rowCount > 1
          ? {
              ...area,
              rowCount: 1,
            }
          : {
              ...area,
              columnCount: 1,
            };
      return holdsOf(firstLine).isTooMany || holdsOf(firstLine).textCount > 0;
    },
    areTooManyToKnow: (area?: Dynamic) => holdsOf(area).isTooMany,
    holdsTextsApartBySpacesAlone: (area?: Dynamic) => Array.from<Dynamic>(holdsOf(area).squeezed.values()).includes(null),
    holdsNumbersAlone(area?: Dynamic) {
      let headingSpot = headingSpotBefore(area);
      let body = headingSpot === null || holdsOf(headingSpot).filledCount === 0 ? areaPastHeading(area) : area;
      let [holds, bodyHolds] = [holdsOf(area), holdsOf(body)];
      if (holds.isTooMany) return areAllNumbersIn(workbook, sheetId, body);
      return holds.numberCount > 0 && bodyHolds.numberCount === bodyHolds.filledCount;
    },
    isAnyBlankIn: (area?: Dynamic) => holdsOf(area).filledCount < area.rowCount * area.columnCount,
    isAnyFilledAndBlankIn: (area?: Dynamic) => holdsOf(area).isAnyFilledAndBlank,
    isEveryNumberWholeIn: (area?: Dynamic) => holdsOf(area).isEveryNumberWhole,
    risesOrFallsThroughoutIn(area?: Dynamic) {
      if (area.columnCount !== 1) return false;
      let cacheKey = [area.leftColumnIndex, area.topRowIndex, area.rowCount].join();
      let risesOrFalls: Dynamic = risesOrFallsCache.get(cacheKey);
      if (risesOrFalls !== undefined) return risesOrFalls;
      risesOrFalls = risesOrFallsThroughout(
        Array.from<Dynamic, Dynamic>(
          {
            length: area.rowCount,
          },
          (input?: Dynamic, rowOffset?: Dynamic) => {
            let cellId2 = workbook.cellIdAt(sheetId, area.topRowIndex + rowOffset, area.leftColumnIndex);
            return cellId2 === null ? undefined : holdsOf(area).byRow.get(cellId2.rowId);
          },
        ).flatMap((value?: Dynamic) => (typeof value === 'number' ? [value] : [])),
      );
      risesOrFallsCache.set(cacheKey, risesOrFalls);
      return risesOrFalls;
    },
    isAnyRepeatedIn: (area?: Dynamic) => holdsOf(area).isAnyRepeated,
    numbersLieIn: (area?: Dynamic) => holdsOf(area).numbersLieIn,
    runsOnFromRowToRow(area?: Dynamic) {
      let runsOn = runsOnCache.get(area.leftColumnIndex);
      if (runsOn !== undefined) return runsOn;
      let rowIds = Array.from<Dynamic, Dynamic>(
        {
          length: area.rowCount,
        },
        (input?: Dynamic, rowOffset?: Dynamic) => workbook.cellIdAt(sheetId, area.topRowIndex + rowOffset, area.leftColumnIndex),
      ).flatMap((cellId2?: Dynamic) => (cellId2 === null ? [] : [cellId2.rowId]));
      let numbersByRow = ({ byRow: byRow }: Dynamic) => rowIds.map((rowId?: Dynamic) => byRow.get(rowId) ?? 0);
      let otherColumns = columns.flatMap((column?: Dynamic) => {
        let columnArea = parseA1AreaAsSeen(column.cells, sheet);
        return columnArea !== null && columnArea.leftColumnIndex !== area.leftColumnIndex && holdsOf(columnArea).numberCount > 0
          ? [numbersByRow(holdsOf(columnArea))]
          : [];
      });
      let isRunningTotal = holdsOf(area).numberCount === rowIds.length && isRunningTotalOfColumns(numbersByRow(holdsOf(area)), otherColumns);
      runsOnCache.set(area.leftColumnIndex, isRunningTotal);
      return isRunningTotal;
    },
  };
  if (sheetAsItStands !== null)
    formulaFromWordsWhereCache.set(sheetAsItStands, {
      cellId: cellId,
      where: where,
    });
  return where;
}
export const ROW_RUNS_SHOWN_IN_A1 = 3;
export const PERIOD_TEXT_PATTERN =
  /^(?:jan|feb|m[aä]r|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|h[12]|[1-4]q\d|[12]h\d|(?:cw|[wpmy])\d|fy|w(?:ee)?k|week|month|day|mon|tue|wed|thu|fri|sat|sun|(?:year|quarter|period|sprint|season|term|semester|spring|summer|fall|autumn|winter)(?![a-z])|(?:19|20)\d\d)/;
export const MIN_STEPS_FOR_RUNNING_TOTAL = 3;
export const formulaFromWordsWhereCache = new (WeakMap as Dynamic)();
export const isLetterOrDigit = (character?: Dynamic) => character !== undefined && /[\p{L}\p{N}]/u.test(character);
export const risesOrFallsThroughout = (numbers?: Dynamic) =>
  numbers.length > 2 &&
  (numbers.every((number?: Dynamic, index?: Dynamic) => index === 0 || number > (numbers[index - 1] ?? number)) ||
    numbers.every((number?: Dynamic, index?: Dynamic) => index === 0 || number < (numbers[index - 1] ?? number)));
export const compactLabel = (label?: Dynamic) =>
  label
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(/[^\p{L}\p{N}]+/gu, '');
export const labelWords = (text?: Dynamic) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(/[\p{M}'’]+|\.(?=[\p{L}\p{N}.])/gu, '')
    .split(/[^\p{L}\p{N}.]+/u)
    .filter((word?: Dynamic) => word !== '' && word !== '.');
export const withoutTrailingDot = (word?: Dynamic) => (word.endsWith('.') ? word.slice(0, -1) : word);
export const MAX_SHORT_ABBREVIATION_LENGTH = 4;
export const MIN_TYPO_WORD_LENGTH = 6;
lastLabelWords = {
  text: '',
  words: [],
};
export const trailingSigns = (label?: Dynamic) => /[+\-#]+$/.exec(label.trim())?.[0] ?? '';
export const numbersInText = (label?: Dynamic) => (label.match(/\p{N}+/gu) ?? []).join(' ');
