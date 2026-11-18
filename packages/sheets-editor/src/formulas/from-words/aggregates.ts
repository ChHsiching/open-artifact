import type { Dynamic } from '../../dynamic.ts';
import { parseA1Area } from '../../model/a1-references.ts';
import {
  NOTHING_SAID,
  quoteForFormula,
  AMBIGUOUS_READING,
  isWithinAHeading,
  namesAnyHeading,
  slotReadingsAt,
  SLOT_READERS,
  typedTextOfPieces,
} from './reading.ts';
export function looksLikeIdentifiers(cells?: Dynamic, where?: Dynamic) {
  if (where.isAnyRepeatedIn(cells)) return false;
  let cellCount = cells.rowCount * cells.columnCount;
  let [smallest = 0, largest = 0] = where.numbersLieIn(cells) ?? [];
  let isSerial =
    where.isEveryNumberWholeIn(cells) &&
    where.risesOrFallsThroughoutIn(cells) &&
    smallest >= MIN_SERIAL_NUMBER &&
    largest - smallest <= cellCount * SERIAL_SPREAD_PER_CELL;
  if (cellCount >= MIN_SERIAL_CELLS - 1 && isSerial) return true;
  if (where.isAnyBlankIn(cells)) return false;
  if (where.firstColumnIndexOfTable === cells.leftColumnIndex) return true;
  return cellCount >= MIN_SERIAL_CELLS && Number.isInteger(smallest) && largest - smallest === cellCount - 1;
}
export function holdsNumbersToAggregate({ cells: cells, isByHeading: isByHeading }: Dynamic, where?: Dynamic) {
  if (cells === null) return false;
  if (isByHeading !== true) return where.holdsNumbersAlone(cells);
  let kinds = where.kindsHeldIn(cells);
  return !looksLikeIdentifiers(cells, where) && (kinds.size === 0 || isNumbersOnlyKind(kinds));
}
export function looksLikeRatios(cells?: Dynamic, where?: Dynamic) {
  let [smallest = 0, largest = 0] = where.numbersLieIn(cells) ?? [];
  let isFractional = smallest >= -1 && largest <= 1 && !where.isEveryNumberWholeIn(cells);
  return where.kindsHeldIn(cells).has('percent') || isFractional;
}
export function isAggregateSensible(aggregate?: Dynamic, said?: Dynamic, where?: Dynamic) {
  if (said.cells === null || !holdsNumbersToAggregate(said, where)) return false;
  if (!(aggregate in AGGREGATE_FUNCTION_ALIASES) || said.isByHeading !== true) return true;
  let heading = where.columns.find(({ cells: cells }: Dynamic) => cells === said.written)?.heading ?? '';
  let headingOrTypedMatches = (pattern?: Dynamic) => pattern.test(heading) || pattern.test(said.typed);
  if (aggregate === 'TOTAL')
    return !(
      looksLikeRatios(said.cells, where) ||
      headingOrTypedMatches(NOT_ADDABLE_HEADING_PATTERN) ||
      where.runsOnFromRowToRow(said.cells) ||
      (where.areRecordsPeriods && headingOrTypedMatches(LEVEL_HEADING_PATTERN))
    );
  if (headingOrTypedMatches(RANK_HEADING_PATTERN)) return false;
  let [smallest = 0, largest = 0] = where.numbersLieIn(said.cells) ?? [];
  return smallest >= 0 || (largest > 0 && (aggregate === 'LOWEST' || aggregate === 'HIGHEST'));
}
export function countFormulaFromWords(aggregate: Dynamic, said: Dynamic, { where: where, call: call }: Dynamic) {
  let kinds = said.cells === null ? null : where.kindsHeldIn(said.cells);
  if (kinds === null || kinds.size === 0 || kinds.has('error')) return null;
  if (!isCleanCellsSaid(said, where)) return null;
  let mayCountNumbers = aggregate === 'COUNT' && said.isByHeading !== true;
  if (!hasAnyOf(kinds, 'text', 'trueOrFalse')) return mayCountNumbers ? call('COUNT', said) : null;
  return kinds.size === 1 && kinds.has('text') && !where.isAnyRepeatedIn(said.cells ?? EMPTY_SAID_AREA) ? call('COUNTA', said) : null;
}
export function phraseList(phrasesByKey?: Dynamic) {
  let list = Object.entries(phrasesByKey).flatMap(
    ([key, phrases]: Dynamic) => phrases.split(', ').map((phrase?: Dynamic) => [key, phrase.split(' ')]),
  );
  list.sort(([, words]: Dynamic, [, otherWords]: Dynamic) => otherWords.length - words.length);
  return list;
}
export function phraseAt({ pieces: pieces }: Dynamic, start?: Dynamic, phrases?: Dynamic) {
  for (let [key, words] of phrases as Dynamic)
    if (
      words.every((word?: Dynamic, offset?: Dynamic) => pieces[start + offset]?.typed === word && pieces[start + offset]?.kind !== 'quoted')
    )
      return [key, start + words.length];
  return null;
}
export function* readConditions(reading?: Dynamic, start?: Dynamic, isAfterAnd?: Dynamic): Generator<Dynamic, Dynamic, Dynamic> {
  let opening = phraseAt(reading, start, CONDITION_OPENING_PHRASES);
  let isMarkedAsCondition = isAfterAnd || opening !== null;
  let afterOpening = opening?.[1] ?? start;
  let judgedOptions = [[null, afterOpening], ...(isMarkedAsCondition ? readSlot('cells', reading, afterOpening) : [])];
  for (let [judged, judgedEnd] of judgedOptions as Dynamic) {
    let at: Dynamic = judgedEnd;
    for (let firstFound: Dynamic = phraseAt(reading, at, IS_PHRASES); firstFound !== null; firstFound = phraseAt(reading, at, IS_PHRASES))
      at = firstFound[1];
    let isMarked = isMarkedAsCondition || at > judgedEnd;
    if (reading.pieces[at]?.typed === 'between') {
      for (let [firstFound, next] of readSlot('number', reading, at + 1) as Dynamic)
        for (let [secondFound, end] of (reading.pieces[next]?.typed === 'and' ? readSlot('number', reading, next + 1) : []) as Dynamic)
          if ((firstFound.number ?? 0) <= (secondFound.number ?? 0))
            yield [
              [
                {
                  judged: judged,
                  comparison: '>=',
                  value: firstFound,
                  isMarked: true,
                },
                {
                  judged: judged,
                  comparison: '<=',
                  value: secondFound,
                  isMarked: true,
                },
              ],
              end,
            ];
    }
    if (judged === null && isMarkedAsCondition)
      for (let [firstFound, next] of readSlot('words', reading, reading.pieces[at]?.typed === 'the' ? at + 1 : at) as Dynamic)
        for (let [secondFound, end] of readSlot('cells', reading, next) as Dynamic)
          yield [
            [
              {
                judged: secondFound,
                comparison: '',
                value: firstFound,
                isMarked: true,
              },
            ],
            end,
          ];
    let comparisonFound = phraseAt(reading, at, COMPARISON_PHRASES);
    for (let [firstFound, next] of [...(comparisonFound === null ? [] : [comparisonFound]), ['', at]] as Dynamic)
      for (let [secondFound, end] of [...readSlot('number', reading, next), ...readSlot('words', reading, next)] as Dynamic)
        yield [
          [
            {
              judged: judged,
              comparison: firstFound,
              value: secondFound,
              isMarked: isMarked || firstFound !== '',
              isBegunLoosely: opening?.[0] === 'loosely' && at === judgedEnd,
            },
          ],
          end,
        ];
  }
}
export function conditionReadingsAt(reading?: Dynamic, start?: Dynamic, isAfterAnd?: Dynamic) {
  let byKey: Dynamic = conditionReadingsCache.get(reading.pieces);
  if (byKey === undefined) conditionReadingsCache.set(reading.pieces, (byKey = new (Map as Dynamic)()));
  let key = [start, isAfterAnd].join();
  let readings: Dynamic = byKey.get(key);
  if (readings === undefined) byKey.set(key, (readings = Array.from<Dynamic>(readConditions(reading, start, isAfterAnd))));
  return readings;
}
export function conditionListsAt(reading?: Dynamic, start?: Dynamic, isAfterAnd?: Dynamic, conditionsLeft: Dynamic = MAX_CONDITIONS) {
  if (conditionsLeft === 0) return TOO_MANY_READINGS;
  let byKey: Dynamic = conditionListsCache.get(reading.pieces);
  if (byKey === undefined) conditionListsCache.set(reading.pieces, (byKey = new (Map as Dynamic)()));
  let key = [start, isAfterAnd, conditionsLeft].join();
  let cached = byKey.get(key);
  if (cached !== undefined) return cached;
  let lists: Dynamic = [];
  let isTooMany: Dynamic = false;
  for (let [conditions, end] of conditionReadingsAt(reading, start, isAfterAnd) as Dynamic) {
    if (end === reading.pieces.length) lists.push(conditions);
    else if (reading.pieces[end]?.typed === 'and') {
      let rest = conditionListsAt(reading, end + 1, true, conditionsLeft - 1);
      isTooMany ||= rest === TOO_MANY_READINGS;
      for (let restConditions of rest as Dynamic) lists.push([...conditions, ...restConditions]);
    }
    isTooMany ||= lists.length > MAX_CONDITION_LISTS;
    if (isTooMany) break;
  }
  let result = isTooMany ? TOO_MANY_READINGS : lists;
  byKey.set(key, result);
  return result;
}
export function everyHeadedColumnSaid(where?: Dynamic) {
  let said: Dynamic = headedColumnsSaidCache.get(where);
  if (said === undefined) {
    said = where.columns.flatMap(({ cells: cellsWritten }: Dynamic) => {
      let cells = parseA1Area(cellsWritten, where);
      return cells === null
        ? []
        : [
            {
              ...NOTHING_SAID,
              written: cellsWritten,
              cells: cells,
              isByHeading: true,
            },
          ];
    });
    headedColumnsSaidCache.set(where, said);
  }
  return said;
}
export function canAddUpTextVariants(text?: Dynamic, otherSpellings?: Dynamic, cells?: Dynamic, where?: Dynamic) {
  return (
    otherSpellings.length <= 2 &&
    !otherSpellings.some((spelling?: Dynamic) => CRITERIA_SYNTAX_PATTERN.test(spelling) || IGNORABLE_CHARACTER_PATTERN.test(spelling)) &&
    (otherSpellings.length === 0 ||
      where.canBeAddedUpIn(
        cells,
        text,
        otherSpellings.map((spelling?: Dynamic) => spelling.toLowerCase()),
      ))
  );
}
export function criterionOfCondition(
  { judged: judged, comparison: comparison, value: value, isMarked: isMarked, isBegunLoosely: isBegunLoosely }: Dynamic,
  aggregate?: Dynamic,
  said?: Dynamic,
  where?: Dynamic,
) {
  if (said.cells === null) return null;
  let { cells: cells } = said;
  let otherColumns = everyHeadedColumnSaid(where).filter(({ written: written }: Dynamic) => written !== said.written);
  if (value.number !== null) {
    if (!isMarked) return null;
    if (comparison === '' && judged === null && (isBegunLoosely === true || !isCountAggregate(aggregate))) return null;
    if (judged === null && YEAR_NUMBER_PATTERN.test(value.written)) return null;
    let judgedSaid = judged ?? said;
    let kinds = judgedSaid.cells === null ? null : where.kindsHeldIn(judgedSaid.cells);
    if (
      judgedSaid.cells === null ||
      kinds === null ||
      !areasLineUp(judgedSaid.cells, cells) ||
      !hasAnyOf(kinds, 'number', 'percent') ||
      kinds.has('text') ||
      (judgedSaid.isByHeading === true && !isNumbersOnlyKind(kinds))
    )
      return null;
    if (judged === null && judgedSaid.isByHeading === true && !isCountAggregate(aggregate)) return null;
    let isFarFromZero =
      (comparison === '>' && value.number >= 0) || (comparison === '>=' && value.number > 0) || (comparison === '' && value.number !== 0);
    if (judgedSaid.isByHeading === true && where.isAnyBlankIn(judgedSaid.cells) && !isFarFromZero) return null;
    let isRatio = looksLikeRatios(judgedSaid.cells, where);
    if (isRatio && !value.written.endsWith('%') && Math.abs(value.number) >= 1) return null;
    let [smallest = 0, largest = 0] = where.numbersLieIn(judgedSaid.cells) ?? [];
    if (smallest >= -1 && largest <= 1 && Math.abs(value.number) > 1) return null;
    if (!isRatio && value.written.endsWith('%')) return null;
    if (judgedSaid.isByHeading === true && isNumberOffScale([smallest, largest], value.number)) return null;
    if (judgedSaid.isByHeading === true && largest <= 0 && smallest < 0 && value.number > 0) return null;
    let numberText = String(Number(value.number.toPrecision(15)));
    return numberText.includes('.') && where.decimalSign === 'comma' ? null : [judgedSaid, quoteForFormula(comparison + numberText)];
  }
  if (comparison !== '' && comparison !== '<>') return null;
  let text = value.typed.toLowerCase();
  if (/^all\b/.test(text)) return AMBIGUOUS_READING;
  let candidates = judged === null ? [...(isCountAggregate(aggregate) ? [said] : []), ...(isMarked ? otherColumns : [])] : [judged];
  let alignedCandidates = candidates.filter(
    ({ cells: candidateCells }: Dynamic) => candidateCells !== null && areasLineUp(candidateCells, cells),
  );
  let textMatches = alignedCandidates.flatMap((candidate?: Dynamic) => {
    let textHeld = where.textHeldIn(candidate.cells ?? cells, text);
    return textHeld === null ? [] : [[candidate, textHeld]];
  });
  let criteria = textMatches.map(
    ([candidate, textHeld]: Dynamic) => [
      candidate,
      quoteForFormula(comparison + textHeld),
      where.textsWrittenOtherwiseIn(candidate.cells ?? cells, text),
    ],
  );
  if (
    textMatches.some(([, textHeld]: Dynamic) => CRITERIA_SYNTAX_PATTERN.test(textHeld)) ||
    (textMatches.length === 0 &&
      (/^[<>=]/.test(text) ? [judged ?? said] : [judged ?? said, ...alignedCandidates]).some(
        (candidate?: Dynamic) => where.mayTextBeHeldIn(candidate.cells ?? cells, text),
      ))
  )
    return AMBIGUOUS_READING;
  if (textMatches.some(([candidate]: Dynamic) => where.isTextPartOfALongerOneIn(candidate.cells ?? cells, text))) return AMBIGUOUS_READING;
  if (textMatches.some(([candidate]: Dynamic) => isPeriodInDateCells(text, candidate.cells ?? cells, where))) return AMBIGUOUS_READING;
  if (
    criteria.some(
      ([candidate, , otherSpellings = []]: Dynamic) => !canAddUpTextVariants(text, otherSpellings, candidate.cells ?? cells, where),
    )
  )
    return AMBIGUOUS_READING;
  if (comparison === '<>' && alignedCandidates.some((candidate?: Dynamic) => where.mayTextBeHeldIn(candidate.cells ?? cells, 'not ' + text)))
    return AMBIGUOUS_READING;
  let mayNameAHeading =
    (judged === null && isWithinAHeading(text, where)) || (MONTH_NAME_PATTERN.test(text) && namesAnyHeading('year', where));
  if (textMatches.length > 0 && mayNameAHeading) return AMBIGUOUS_READING;
  if (judged === null && textMatches.length === 1 && where.countOfColumnsThatHold(text) > 1) return AMBIGUOUS_READING;
  if (criteria.length > 0 || !BLANK_WORD_PATTERN.test(text) || !isMarked) return criteria.length === 1 ? (criteria[0] ?? null) : null;
  let [blankJudged] = judged === null && !isCountAggregate(aggregate) ? [] : candidates;
  let blankCells = blankJudged?.cells ?? null;
  return blankJudged === undefined || blankCells === null || !areasLineUp(blankCells, cells) ? null : [blankJudged, quoteForFormula(comparison)];
}
export function conditionalAggregateFormula(aggregate?: Dynamic, said?: Dynamic, conditionsSaid?: Dynamic, builder?: Dynamic) {
  let { where: where } = builder;
  let conditions = conditionsOfSaid.get(conditionsSaid);
  if (conditions === undefined) return AMBIGUOUS_READING;
  if (conditions.some(isUnjudgedNumberCondition) && conditions.some(({ judged: judged }: Dynamic) => judged !== null)) return null;
  let criteria = conditions.map((condition?: Dynamic) => criterionOfCondition(condition, aggregate, said, where));
  if (criteria.includes(AMBIGUOUS_READING)) return AMBIGUOUS_READING;
  let readCriteria = criteria.flatMap(
    (criterion?: Dynamic) => (criterion === null || criterion === AMBIGUOUS_READING ? [] : [criterion]),
  );
  if (readCriteria.length < criteria.length) return null;
  let formula = conditionalAggregateCall(aggregate, said, conditions, readCriteria, builder);
  let hasOtherSpellings = readCriteria.some(([, , otherSpellings = []]: Dynamic) => otherSpellings.length > 0);
  return formula === null && hasOtherSpellings ? AMBIGUOUS_READING : formula;
}
export function conditionalAggregateCall(
  aggregate: Dynamic,
  said: Dynamic,
  conditions: Dynamic,
  criteria: Dynamic,
  { where: where, call: call }: Dynamic,
) {
  let [singleFunction, multiFunction] = CONDITIONAL_AGGREGATE_FUNCTIONS[aggregate] ?? [];
  let pairs = criteria.map(([said2, criterion]: Dynamic) => [said2, criterion]);
  if (multiFunction === undefined || pairs.length === 0 || said.cells === null) return null;
  if (conditions.filter(({ judged: judged, value: value }: Dynamic) => judged === null && value.number === null).length > 1)
    return AMBIGUOUS_READING;
  let judgesOtherCells = pairs.some(([said2]: Dynamic) => said2.written !== said.written);
  let holdsSeveralPeople = ({ cells: cells }: Dynamic) => cells !== null && where.kindsHeldIn(cells).has('severalPeople');
  if (pairs.some(([said2]: Dynamic) => holdsSeveralPeople(said2))) return null;
  let equalityColumns = pairs
    .filter(([, criterion]: Dynamic) => /^"[^<>]/.test(criterion))
    .map(([said2]: Dynamic) => said2.written);
  if (new (Set as Dynamic)(equalityColumns).size < equalityColumns.length) return null;
  let notEqualColumns = new (Set as Dynamic)(
    pairs.filter(([, criterion]: Dynamic) => criterion.startsWith('"<>')).map(([said2]: Dynamic) => said2.written),
  );
  if (equalityColumns.some((written?: Dynamic) => notEqualColumns.has(written))) return AMBIGUOUS_READING;
  let isBlankInHeadedColumn = ([said2, criterion]: Dynamic) =>
    said2.isByHeading === true && said2.cells !== null && !/^"(?:[<>]=?|<>)?-?\d[\d.]*"$/.test(criterion) && where.isAnyBlankIn(said2.cells);
  if (pairs.some(isBlankInHeadedColumn)) return null;
  if (isCountAggregate(aggregate)) {
    if (
      pairs.some(
        ([said2, criterion]: Dynamic) =>
          criterion.startsWith('"<>') &&
          said2.cells !== null &&
          (where.isAnyBlankIn(said2.cells) || (said2.isByHeading !== true && where.mayStartWithAHeading(said2.cells))),
      )
    )
      return null;
    let kinds = where.kindsHeldIn(said.cells);
    let value = hasAnyOf(kinds, 'number', 'percent');
    if (aggregate === 'HOW_MANY' && value) return null;
    if (said.isByHeading === true && value && looksLikeIdentifiers(said.cells, where)) return null;
    if (judgesOtherCells && kinds.has('trueOrFalse')) return null;
    if (judgesOtherCells && where.isAnyRepeatedIn(said.cells)) return null;
    if (judgesOtherCells && (where.isAnyBlankIn(said.cells) || value)) return null;
  } else if (!isAggregateSensible(aggregate, said, where)) return null;
  let callWith = (pairs2?: Dynamic) => {
    if (isCountAggregate(aggregate)) return (call as Dynamic)(pairs2.length === 1 ? 'COUNTIF' : multiFunction, ...pairs2.flat());
    return pairs2.length === 1 && singleFunction !== null && singleFunction !== undefined
      ? (call as Dynamic)(singleFunction, ...pairs2.flat(), ...(judgesOtherCells ? [said] : []))
      : (call as Dynamic)(multiFunction, said, ...pairs2.flat());
  };
  let formula = callWith(pairs);
  let spelledOtherwise = criteria.flatMap(
    ([said2, criterion, otherSpellings = []]: Dynamic, index?: Dynamic) =>
      otherSpellings.length > 0
        ? [
            {
              on: said2,
              condition: criterion,
              others: otherSpellings,
              at: index,
            },
          ]
        : [],
  );
  let [firstSpelledOtherwise] = spelledOtherwise;
  if (firstSpelledOtherwise !== undefined) {
    if (
      !(
        spelledOtherwise.length === 1 &&
        !firstSpelledOtherwise.condition.startsWith('"<>') &&
        (isCountAggregate(aggregate) || aggregate === 'SUM' || aggregate === 'TOTAL')
      )
    )
      return AMBIGUOUS_READING;
    let mapped = firstSpelledOtherwise.others.map(
      (spelling?: Dynamic) =>
        callWith(
          pairs.map(
            (pair?: Dynamic, index?: Dynamic) =>
              index === firstSpelledOtherwise.at ? [firstSpelledOtherwise.on, quoteForFormula(spelling)] : pair,
          ),
        ),
    );
    return [formula, [formula, ...mapped].join('+'), 'onlyBeside'];
  }
  return mayAverageLeaveOutZeros(aggregate, said, where)
    ? [formula, (call as Dynamic)(multiFunction, said, ...pairs.flat(), said, '"<>0"'), 'alone']
    : formula;
}
export function aggregateFormula(aggregate?: Dynamic, said?: Dynamic, builder?: Dynamic) {
  if (isCountAggregate(aggregate)) return countFormulaFromWords(aggregate, said, builder);
  if (!isAggregateSensible(aggregate, said, builder.where)) return null;
  let formula = builder.call(AGGREGATE_FUNCTION_ALIASES[aggregate] ?? aggregate, said);
  return mayAverageLeaveOutZeros(aggregate, said, builder.where) ? [formula, builder.call('AVERAGEIF', said, '"<>0"'), 'alone'] : formula;
}
export const AGGREGATE_WORDS = {
  SUM: 'sum/sum_up',
  TOTAL: 'total/add_up',
  AVERAGE: 'average/avg/mean',
  COUNT: 'count',
  HOW_MANY: 'how_many/number_of/count_of',
  MIN: 'min/minimum',
  MAX: 'max/maximum',
  LOWEST: 'lowest',
  HIGHEST: 'highest',
  SMALLEST: 'smallest/least',
  LARGEST: 'largest/biggest',
  MEDIAN: 'median',
  MODE: 'mode/most_common_number/most_frequent_number',
  STDEV: 'stdev/standard_deviation/std_dev',
  VAR: 'var',
  STDEVP: 'stdevp/population_standard_deviation',
  VARP: 'varp',
};
export const isCountAggregate = (aggregate?: Dynamic) => aggregate === 'COUNT' || aggregate === 'HOW_MANY';
export const AGGREGATE_FUNCTION_ALIASES = {
  TOTAL: 'SUM',
  LOWEST: 'MIN',
  HIGHEST: 'MAX',
  SMALLEST: 'MIN',
  LARGEST: 'MAX',
};
export const OF_RANGE_TEMPLATE = '[of/in/for/from] [all] [range] [of/in/from]';
export const OF_VALUES_TEMPLATE = '[of/in/for/from] [all] value/values [of/in/from]';
export const CONDITIONAL_AGGREGATE_FUNCTIONS = {
  SUM: ['SUMIF', 'SUMIFS'],
  TOTAL: ['SUMIF', 'SUMIFS'],
  AVERAGE: ['AVERAGEIF', 'AVERAGEIFS'],
  COUNT: ['COUNTIF', 'COUNTIFS'],
  HOW_MANY: ['COUNTIF', 'COUNTIFS'],
  MIN: [null, 'MINIFS'],
  MAX: [null, 'MAXIFS'],
  LOWEST: [null, 'MINIFS'],
  HIGHEST: [null, 'MAXIFS'],
  SMALLEST: [null, 'MINIFS'],
  LARGEST: [null, 'MAXIFS'],
};
export const EMPTY_SAID_AREA = {
  topRowIndex: 0,
  leftColumnIndex: 0,
  rowCount: 0,
  columnCount: 0,
};
export const hasAnyOf = (values?: Dynamic, ...items: Dynamic[]) => items.some((item?: Dynamic) => values.has(item));
export const MIN_SERIAL_CELLS = 5;
export const SERIAL_SPREAD_PER_CELL = 10;
export const MIN_SERIAL_NUMBER = 1000;
export const isNumbersOnlyKind = (kinds?: Dynamic) => kinds.size === 1 && hasAnyOf(kinds, 'number', 'percent');
export const NOT_ADDABLE_HEADING_PATTERN =
  /\b(?:ytd|mtd|qtd|cum|cumulative|accumulated|running|to date|price|msrp|retail|wholesale|rate|rating|stars|ratio|margin|percent|pct|probability|avg|average|per|unit|each|age|year|rank|id|no|code|zip|phone|cac|arpu|aov|nps|ctr|cpa|cpc|latency|uptime|temperature|pace|speed)\b|[%#]/i;
export const LEVEL_HEADING_PATTERN =
  /\b(?:headcount|employees|staff|team size|ftes?|stock|inventory|on hand|users|mau|dau|subscribers|followers|fans|readers|listeners|members|customers|clients|tenants|donors|volunteers|students|enrolled|enrollment|accounts|seats|licenses|stores|mrr|arr|pipeline|backlog|waitlist|vacancies|open|opening|closing|balance|remaining|outstanding|owed|debt|loan|cash|savings|reserves|net worth|portfolio|odometer|population|active)\b/i;
export const RANK_HEADING_PATTERN = /\b(?:rank|ranking|priority|place|position|seed|tier|level|grade)\b/i;
export const isCleanCellsSaid = ({ cells: cells, isByHeading: isByHeading }: Dynamic, where?: Dynamic) =>
  cells !== null && !where.isAnyFilledAndBlankIn(cells) && (isByHeading === true || !where.mayStartWithAHeading(cells));
export const COMPARISON_PHRASES = phraseList({
  '>': 'over, above, more than, greater than, bigger than, larger than, higher than, >',
  '<': 'under, below, less than, smaller than, lower than, fewer than, <',
  '>=': 'at least, >=',
  '<=': 'at most, <=',
  '<>': "not, not equal to, isn't, <>",
});
export const CONDITION_OPENING_PHRASES = phraseList({
  if: 'if, where, when, whose, that are, that is, which are, that have',
  loosely: 'for, of, in, with',
});
export const IS_PHRASES = phraseList({
  is: 'is, are, equals, equal to, =',
});
export const readSlot = (slot?: Dynamic, reading?: Dynamic, start?: Dynamic) => slotReadingsAt(SLOT_READERS[slot], reading, start);
export const conditionReadingsCache = new (WeakMap as Dynamic)();
export const MAX_CONDITIONS = 4;
export const MAX_CONDITION_LISTS = 200;
export const TOO_MANY_READINGS: Dynamic = [];
export const conditionListsCache = new (WeakMap as Dynamic)();
export const conditionsOfSaid = new (WeakMap as Dynamic)();
export const conditionsSlotReader =
  (isBegun?: Dynamic) =>
  (reading?: Dynamic, start?: Dynamic) =>
    (conditionListsAt(reading, start, isBegun) === TOO_MANY_READINGS ? [null] : conditionListsAt(reading, start, isBegun)).map(
      (conditions?: Dynamic) => {
        let said = {
          ...NOTHING_SAID,
          typed: typedTextOfPieces(reading, start, reading.pieces.length),
        };
        if (conditions !== null) conditionsOfSaid.set(said, conditions);
        return [said, reading.pieces.length];
      },
    );
export const areasLineUp = (area?: Dynamic, otherArea?: Dynamic) =>
  area.rowCount === otherArea.rowCount &&
  area.columnCount === otherArea.columnCount &&
  (area.rowCount > 1 || area.columnCount === 1 ? area.topRowIndex === otherArea.topRowIndex : area.leftColumnIndex === otherArea.leftColumnIndex);
export const BLANK_WORD_PATTERN = /^(?:blank|empty)$/;
export const CRITERIA_SYNTAX_PATTERN = /^[<>=]|[*?~]/;
export const IGNORABLE_CHARACTER_PATTERN = /\p{Default_Ignorable_Code_Point}/u;
export const MONTH_NAME_PATTERN =
  /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;
export const YEAR_NUMBER_PATTERN = /^(?:19|20)\d\d$/;
export const PERIOD_WORD_PATTERN =
  /^(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|q[1-4]|[1-4]q\d*|h[12]|[12]h\d*|fy\d*|w(?:ee)?ks?\d*|c?w\d+|months?|quarters?|years?|spring|summer|fall|autumn|winter|today|yesterday|tomorrow|(?:19|20)\d\d)$/;
export const headedColumnsSaidCache = new (WeakMap as Dynamic)();
export const isNumberOffScale = ([smallest, largest]: Dynamic, number?: Dynamic) =>
  number !== 0 && smallest > 0 && (Math.abs(number) * 10 <= smallest || Math.abs(number) >= largest * 10);
export const namesAPeriod = (text?: Dynamic) =>
  text.split(/[^\p{L}\p{N}]+/u).some((word?: Dynamic) => MONTH_NAME_PATTERN.test(word) || PERIOD_WORD_PATTERN.test(word));
export const isPeriodInDateCells = (text?: Dynamic, cells?: Dynamic, where?: Dynamic) =>
  namesAPeriod(text) && hasAnyOf(where.kindsHeldIn(cells), 'date', 'dateAndTime');
export const mayAverageLeaveOutZeros = (aggregate: Dynamic, { cells: cells, isByHeading: isByHeading }: Dynamic, where?: Dynamic) =>
  aggregate === 'AVERAGE' && isByHeading === true && cells !== null && where.areRecordsPeriods && where.endsInZerosAloneIn(cells);
export const isUnjudgedNumberCondition = ({ judged: judged, value: value }: Dynamic) => judged === null && value.number !== null;
