import type { Dynamic } from '../dynamic.ts';
import { parseBooleanText, booleanText } from '../model/cell-text.ts';
import { MAX_IMPORT_QUESTIONS } from './import-basics.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function precisionLossOfDigits(text?: Dynamic, decimalSign?: Dynamic) {
  let trimmed = text.trim();
  if (!DIGITS_TEXT_PATTERN.test(trimmed)) return null;
  if (/^0\d/.test(trimmed)) return 'leadingZeros';
  let [wholePart = ''] = trimmed.split(decimalSign === 'point' ? '.' : ',');
  return wholePart.replaceAll(/\D/g, '').length > MAX_EXACT_DIGITS ? 'lastDigits' : null;
}
export function stripNumberDecorations(reading?: Dynamic, text?: Dynamic) {
  let symbol = reading.kind === 'currency' ? reading.symbol : '%';
  let bare = (reading.kind === 'currency' || reading.kind === 'percent' ? text.replace(symbol, '') : text)
    .replace(/^[-+(\s]+/, '')
    .trimEnd();
  return bare.endsWith(')') || bare.endsWith('-') ? bare.slice(0, -1) : bare;
}
export function isPlainDecimalText(reading?: Dynamic, text?: Dynamic, wholeDigits?: Dynamic, fractionText?: Dynamic) {
  if (wholeDigits.length > MAX_EXACT_DIGITS || !/^\d*$/.test(wholeDigits)) return false;
  let unsigned = text.startsWith('-') ? text.slice(1) : text;
  let bare = reading.kind === 'currency' && unsigned.startsWith(reading.symbol) ? unsigned.slice(reading.symbol.length) : unsigned;
  return bare === `${wholeDigits}${fractionText}` || (reading.kind === 'percent' && bare === `${wholeDigits}${fractionText}%`);
}
export function decimalPlacesRead(reading?: Dynamic, text?: Dynamic) {
  if (!('decimalSign' in reading)) return null;
  let isWithoutPercentSign = reading.kind === 'percent' && !text.includes('%');
  if (isWithoutPercentSign && reading.numberAloneIs === 'noPercentage') return null;
  let decimalChar = reading.decimalSign === 'point' ? '.' : ',';
  let [wholePart = '', fractionPart, ...extraParts] = stripNumberDecorations(reading, text).split(decimalChar);
  if (fractionPart === undefined || extraParts.length > 0 || !/^\d+$/.test(fractionPart)) return null;
  if (!/^[\d\s'.,]*$/.test(wholePart)) return null;
  let isShareOfOne = isWithoutPercentSign && reading.numberAloneIs === 'aShareOfOne';
  let significantLength: Dynamic = fractionPart.length;
  while (fractionPart[significantLength - 1] === '0') significantLength -= 1;
  return {
    places: Math.max(0, significantLength - (isShareOfOne ? 2 : 0)),
    isPlain: isPlainDecimalText(reading, text, wholePart, `${decimalChar}${fractionPart}`),
  };
}
export function readingFittingTexts(reading?: Dynamic, texts?: Dynamic) {
  if (reading.kind === 'trueOrFalse' && !canAllReadAsTrueOrFalse(texts))
    return {
      kind: 'text',
    };
  if (reading.kind === 'percent' && reading.numberAloneIs === 'noPercentage' && !texts.some((text?: Dynamic) => text.includes('%')))
    return {
      ...reading,
      numberAloneIs: 'percents',
    };
  return reading;
}
export function trueOrFalseTextOf(text?: Dynamic) {
  let trimmed = text.trim();
  let booleanValue = parseBooleanText(trimmed);
  if (booleanValue !== null) return booleanText(booleanValue);
  if (trimmed === '') return '';
  return isWordTextWithoutNumbers(text) ? text : null;
}
export function trueOrFalseFit(texts?: Dynamic) {
  let filledIndexes = texts.flatMap((input?: Dynamic, options?: Dynamic) => (input.trim() === '' ? [] : [options]));
  let notFittingIndexes = filledIndexes.filter((input?: Dynamic) => parseBooleanText((texts[input] ?? '').trim()) === null);
  return {
    fitting: filledIndexes.length - notFittingIndexes.length,
    notFitting: notFittingIndexes.length,
    firstNotFitting: notFittingIndexes.slice(0, MAX_NOT_FITTING_EXAMPLES),
    options: null,
    sameAsReading: null,
  };
}
export function notFittingExamples(fit?: Dynamic, texts?: Dynamic) {
  return fit !== undefined && fit.notFitting <= MAX_NOT_FITTING_EXAMPLES && fit.firstNotFitting.length === fit.notFitting
    ? fit.firstNotFitting.map((input?: Dynamic) => texts[input] ?? '')
    : null;
}
export function isFitTooPoor({ fitting: fitting, notFitting: notFitting }: Dynamic, getExamples?: Dynamic) {
  if (fitting === 0) return true;
  if (notFitting <= 1 || notFitting * POOR_FIT_RATIO <= fitting + notFitting) return false;
  if (fitting <= notFitting) return true;
  let examples = getExamples();
  return examples === null || examples.some((input?: Dynamic) => /\p{N}/u.test(input));
}
export function looksLikeTrueOrFalseColumn(texts?: Dynamic) {
  let fit = trueOrFalseFit(texts);
  if (fit.fitting <= fit.notFitting || !canAllReadAsTrueOrFalse(texts)) return false;
  return !isFitTooPoor(fit, () => {
    let items = [...new (Set as Dynamic)(texts.map((input?: Dynamic) => input.trim()))];
    return notFittingExamples(trueOrFalseFit(items), items);
  });
}
export function dataLineNumbers(table: Dynamic, { headerLine: headerLine, linesLeftOut: linesLeftOut }: Dynamic) {
  let leftOut = new (Set as Dynamic)(linesLeftOut);
  let lineNumbers: Dynamic = [];
  for (let lineNumber: Dynamic = (headerLine ?? 0) + 1; lineNumber <= table.lines.length; lineNumber++)
    if (!leftOut.has(lineNumber) && !(table.lines[lineNumber - 1] ?? []).every(isBlankImportText)) lineNumbers.push(lineNumber);
  return lineNumbers;
}
export function lastDataLineNumber(table?: Dynamic, linesLeftOut?: Dynamic) {
  let leftOut = new (Set as Dynamic)(linesLeftOut);
  for (let lineNumber: Dynamic = table.lines.length; lineNumber >= 1; lineNumber--)
    if (!leftOut.has(lineNumber) && !(table.lines[lineNumber - 1] ?? []).every(isBlankImportText)) return lineNumber;
  return null;
}
export function planWithAnswers(plan?: Dynamic, answers?: Dynamic) {
  let columns = [...plan.columns];
  for (let question of plan.questions as Dynamic) {
    let chosenOption = question.options[answers[question.id] ?? question.recommendedIndex];
    for (let { columnIndex: columnIndex, reading: reading } of (chosenOption?.readings ?? []) as Dynamic) {
      let column = columns[columnIndex];
      if (column !== undefined)
        columns[columnIndex] = {
          ...column,
          reading: reading,
        };
    }
  }
  return {
    ...plan,
    columns: columns,
  };
}
export function alignQuestionDecimalSigns(plan?: Dynamic, question?: Dynamic) {
  let answeredColumns = new (Set as Dynamic)(plan.questions.flatMap(questionColumnIndexes));
  let readsDistinctly = (input?: Dynamic) => {
    let mapped = question.options.map(({ readings: readings }: Dynamic) => {
      let match = readings.find((input2?: Dynamic) => input2.columnIndex === input);
      return match === undefined ? null : decimalSignOfReading(match.reading);
    });
    return !mapped.includes(null) && new (Set as Dynamic)(mapped).size === mapped.length;
  };
  let alignableColumns = new (Set as Dynamic)(
    questionColumnIndexes(question).filter((input?: Dynamic) => readsDistinctly(input) && !answeredColumns.has(input)),
  );
  let options = question.options.map(
    ({ label: label, readings: readings }: Dynamic) => ({
      label: label,
      readings: readings.map((input?: Dynamic) => {
        let value = plan.columns[input.columnIndex]?.reading;
        if (value === undefined || !alignableColumns.has(input.columnIndex)) return input;
        if (!('decimalSign' in value) || !('decimalSign' in input.reading)) return input;
        if (value.decimalSign === input.reading.decimalSign)
          return {
            ...input,
            reading: value,
          };
        if (value.kind === input.reading.kind) return input;
        let { decimalSign: reading, decimalPlaces: reading2 } = input.reading;
        return {
          ...input,
          reading: {
            ...value,
            decimalSign: reading,
            decimalPlaces: reading2,
          },
        };
      }),
    }),
  );
  return {
    ...question,
    options: options,
  };
}
export function mergeImportQuestions(plan?: Dynamic, previousAnswers?: Dynamic, newQuestions: Dynamic = []) {
  let readingStands = ({ columnIndex: columnIndex, reading: reading }: Dynamic) =>
    isSameJson(plan.columns[columnIndex]?.reading, reading);
  let keptAnswers = previousAnswers.flatMap(({ question: question, chosenIndex: chosenIndex }: Dynamic, options?: Dynamic) => {
    let value = alignQuestionDecimalSigns(plan, question);
    let value2 = optionsLimitedToColumns(
      value,
      (input?: Dynamic) =>
        value.options.some(
          ({ readings: readings }: Dynamic) =>
            readings.some((input2?: Dynamic) => input2.columnIndex === input && readingStands(input2)),
        ),
    );
    let value3 = value2[chosenIndex]?.readings ?? [];
    if (!doOptionsDiffer(value2)) return [];
    return [
      {
        question: {
          ...value,
          id: `answered-${options + 1}`,
          options: value2,
        },
        chosenIndex: chosenIndex,
        isInDoubt: !value3.every(readingStands),
      },
    ];
  });
  let answeredColumns = new (Set as Dynamic)(
    keptAnswers.flatMap(({ question: question }: Dynamic) => questionColumnIndexes(question)),
  );
  let keptQuestions = plan.questions.flatMap((input?: Dynamic) => {
    let value = optionsLimitedToColumns(input, (input2?: Dynamic) => !answeredColumns.has(input2));
    return doOptionsDiffer(value)
      ? [
          {
            ...input,
            options: value,
          },
        ]
      : [];
  });
  let coveredColumns = new (Set as Dynamic)([...answeredColumns, ...keptQuestions.flatMap(questionColumnIndexes)]);
  let addedQuestions = newQuestions
    .flatMap((input?: Dynamic, options?: Dynamic) => {
      let value = alignQuestionDecimalSigns(plan, input);
      let value2 = value.options[value.recommendedIndex]?.readings.every(readingStands);
      let value3 = questionColumnIndexes(value).some((input2?: Dynamic) => coveredColumns.has(input2));
      return value2 === true && !value3
        ? [
            {
              ...value,
              id: `unanswered-${options + 1}`,
            },
          ]
        : [];
    })
    .slice(0, Math.max(0, MAX_IMPORT_QUESTIONS - keptQuestions.length));
  let newQuestionOrder = (input?: Dynamic) => {
    let matchIndex = newQuestions.findIndex(
      (input2?: Dynamic) => isSameJson(questionColumnIndexes(input2), questionColumnIndexes(input)),
    );
    return matchIndex < 0 ? newQuestions.length : matchIndex;
  };
  let questions = [...addedQuestions, ...keptQuestions].toSorted(
    (input?: Dynamic, options?: Dynamic) => newQuestionOrder(input) - newQuestionOrder(options),
  );
  return {
    plan: {
      ...plan,
      questions: [...questions, ...keptAnswers.map(({ question: question }: Dynamic) => question)],
    },
    answers: Object.fromEntries(keptAnswers.map(({ question: question, chosenIndex: chosenIndex }: Dynamic) => [question.id, chosenIndex])),
    isAnAnswerInDoubt: keptAnswers.some(({ isInDoubt: isInDoubt }: Dynamic) => isInDoubt),
  };
}
export const MAX_NOT_FITTING_EXAMPLES = 3;
export const MAX_EXACT_DIGITS = 15;
export const DIGITS_TEXT_PATTERN = /^\d[\d\s'.,]*$/;
export const isNumericReading = ({ kind: kind }: Dynamic) => kind === 'number' || kind === 'currency' || kind === 'percent';
export const precisionLossOf = (reading?: Dynamic, text?: Dynamic) =>
  'decimalSign' in reading ? precisionLossOfDigits(stripNumberDecorations(reading, text), reading.decimalSign) : null;
export const losesPrecisionInAny = (reading?: Dynamic, texts?: Dynamic) =>
  texts.some((input?: Dynamic) => precisionLossOf(reading, input) !== null);
export const KNOWN_CURRENCY_CODES = new (Set as Dynamic)(Intl.supportedValuesOf('currency'));
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
export const isUnknownCurrencyCode = (code?: Dynamic) => CURRENCY_CODE_PATTERN.test(code) && !KNOWN_CURRENCY_CODES.has(code);
export const isWordTextWithoutNumbers = (text?: Dynamic) => !/\p{N}/u.test(text) && !/^\s*[='\uFF1D]/u.test(text);
export const canAllReadAsTrueOrFalse = (texts?: Dynamic) =>
  texts.every((input?: Dynamic) => trueOrFalseTextOf(input) !== null);
export const fitOfReading = (reading: Dynamic, texts: Dynamic, workbook: WorkbookReads) =>
  reading.kind === 'trueOrFalse' ? trueOrFalseFit(texts) : workbook.fitOfColumnReadings([reading], texts)?.[0];
export const POOR_FIT_RATIO = 10;
export const MISSING_VALUE_TEXT_PATTERN = /^(?:n\/?a|#n\/a|nan|null|none|nil|-+|\?|\.)$/i;
export const isTrueOrFalseColumn = (texts?: Dynamic) =>
  looksLikeTrueOrFalseColumn(texts) &&
  texts.every((input?: Dynamic) => {
    let value = input.trim();
    return value === '' || parseBooleanText(value) !== null || MISSING_VALUE_TEXT_PATTERN.test(value);
  });
export const decimalSignOfReading = (reading?: Dynamic) => ('decimalSign' in reading ? reading.decimalSign : null);
export const dateShownAsForOrder = (order?: Dynamic) => (order === 'yearMonthDay' ? 'yearMonthDay' : 'monthNameDayYear');
export const isBlankImportText = (input?: Dynamic) => input.trim() === '';
export const importTextAt = (table?: Dynamic, lineNumber?: Dynamic, columnIndex?: Dynamic) =>
  table.lines[lineNumber - 1]?.[columnIndex] ?? '';
export const importColumnTexts = (table?: Dynamic, lineNumbers?: Dynamic, columnIndex?: Dynamic) =>
  lineNumbers.map((input?: Dynamic) => importTextAt(table, input, columnIndex));
export const planWithAgentRecommendations = (plan?: Dynamic) =>
  planWithAnswers(
    plan,
    Object.fromEntries(
      plan.questions.flatMap(
        ({ id: id, recommendedByAgentIndex: recommendedByAgentIndex }: Dynamic) =>
          recommendedByAgentIndex === undefined ? [] : [[id, recommendedByAgentIndex]],
      ),
    ),
  );
export const isSameJson = (value?: Dynamic, otherValue?: Dynamic) => JSON.stringify(value) === JSON.stringify(otherValue);
export const chosenAnswersOf = (plan?: Dynamic, answers?: Dynamic) =>
  plan.questions.flatMap((input?: Dynamic) => {
    let value = answers[input.id];
    return value === undefined
      ? []
      : [
          {
            question: input,
            chosenIndex: value,
          },
        ];
  });
export const questionColumnIndexes = ({ options: options }: Dynamic) =>
  (options[0]?.readings ?? []).map(({ columnIndex: columnIndex }: Dynamic) => columnIndex);
export const optionsLimitedToColumns = ({ options: options }: Dynamic, keepColumn?: Dynamic) =>
  options.map(
    ({ label: label, readings: readings }: Dynamic) => ({
      label: label,
      readings: readings.filter(({ columnIndex: columnIndex }: Dynamic) => keepColumn(columnIndex)),
    }),
  );
export const doOptionsDiffer = ([firstOption, ...otherOptions]: Dynamic) =>
  otherOptions.some(({ readings: readings }: Dynamic) => !isSameJson(readings, firstOption?.readings));
