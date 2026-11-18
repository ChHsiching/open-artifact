import type { Dynamic } from '../dynamic.ts';
import { NUMBER_FORMAT_CHOICE_PATTERNS } from './number-format-choices-values.ts';
import { EN_US_LOCALE } from './number-signs.ts';
import { isFormulaCell, DEFAULT_LOCALE_PATTERNS } from '../model/workbook.ts';
import { isInSpan, rowPanes, shownRowIndicesInPane, columnPanes, shownColumnIndicesInPane } from '../grid/geometry.ts';
import { isCheckboxFormat } from '../chips/checkboxes.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { readsWithUnansweredEntries } from '../editor/unanswered-entries.ts';
import { layoutOfView } from '../grid/layout.ts';
import { areasOfAllRanges } from '../selection/several-ranges.ts';
import type { WorkbookReads } from '../model/workbook.ts';
import type { PageState } from '../state/initial-state.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function decimalPlacesSpan(section?: Dynamic, isFirst?: Dynamic) {
  let exponentAt = section.search(/e[+-]/i);
  let mantissa = exponentAt === -1 ? section : section.slice(0, exponentAt);
  if (/[a-z@/]/i.test(mantissa)) return null;
  let pointAt = mantissa.indexOf('.');
  if (pointAt !== -1)
    return {
      at: pointAt,
      length: /^\.[0#?]*/.exec(mantissa.slice(pointAt))?.[0].length ?? 1,
    };
  let lastDigitEnd = mantissa.search(/[0#?][^0#?]*$/) + 1;
  return (isFirst ? lastDigitEnd > 0 : /[0#]/.test(mantissa))
    ? {
        at: lastDigitEnd,
        length: 0,
      }
    : null;
}
export function patternSections(pattern?: Dynamic) {
  let offset: Dynamic = 0;
  return blankOutLiterals(pattern)
    .split(';')
    .map((blankedSection?: Dynamic, index?: Dynamic) => {
      let section = pattern.slice(offset, offset + blankedSection.length);
      offset += blankedSection.length + 1;
      return {
        text: section,
        places: decimalPlacesSpan(blankedSection, index === 0),
      };
    });
}
export function decimalPlacesOfPattern(pattern?: Dynamic) {
  let places = patternSections(pattern)[0]?.places ?? null;
  return places === null ? null : Math.max(0, places.length - 1);
}
export function withDecimalPlacesInSection(section: Dynamic, { at: at, length: placesLength }: Dynamic, decimals?: Dynamic) {
  let digit = /^\?+$/.test(section.slice(at + 1, at + placesLength)) ? '?' : '0';
  let leadingZero = /[0#?]/.test(blankOutLiterals(section).slice(0, at)) ? '' : '0';
  return section.slice(0, at) + (decimals === 0 ? leadingZero : `.${digit.repeat(decimals)}`) + section.slice(at + placesLength);
}
export function withDecimalPlaces(pattern?: Dynamic, decimals?: Dynamic) {
  let sections = patternSections(pattern);
  if ((sections[0]?.places ?? null) === null) return pattern;
  return sections
    .map(({ text: text, places: places }: Dynamic) => (places === null ? text : withDecimalPlacesInSection(text, places, decimals)))
    .join(';');
}
export function patternOfChoice(
  choice: Dynamic,
  { patternOfATimeOfDay: patternOfATimeOfDay, patternsOfItsLocale: patternsOfItsLocale }: Dynamic,
) {
  if (choice === 'time') return patternOfATimeOfDay;
  if (choice === 'dateAndTime') return `${NUMBER_FORMAT_CHOICE_PATTERNS.date.pattern} ${patternOfATimeOfDay}`;
  return isLocaleDependentChoice(choice) ? patternsOfItsLocale[choice] : NUMBER_FORMAT_CHOICE_PATTERNS[choice].pattern;
}
export function sampleValueOfFormatKind(formatKind?: Dynamic) {
  switch (formatKind) {
    case 'percent':
      return 0.125;
    case 'date':
    case 'time':
    case 'dateAndTime':
      return SAMPLE_DATE_TIME_SERIAL;
    case 'duration':
      return 1.0423958333333334;
    case 'general':
    case 'number':
    case 'currency':
    case 'scientific':
    case 'fraction':
    case 'text':
      return 1234.5;
  }
}
export function numberFormatExamples(sheet?: Dynamic) {
  let { locale: locale } = sheet;
  if (locale === EN_US_LOCALE)
    return {
      locale: locale,
      byChoice: new (Map as Dynamic)(),
    };
  let examples = NUMBER_FORMAT_CHOICES.flatMap((choice?: Dynamic) => {
    let sign = choice === 'numberInParentheses' ? -1 : 1;
    let read = sheet.patternRead(
      patternOfChoice(choice, sheet),
      (formatKind?: Dynamic) => sign * sampleValueOfFormatKind(formatKind),
    );
    return read?.kind === 'numberFormat' && read.shown.kind === 'text' ? [[choice, read.shown.text]] : [];
  });
  return {
    locale: locale,
    byChoice: new (Map as Dynamic)(examples),
  };
}
export function withNumberFormatExamples(state: PageState, sheet?: Dynamic) {
  return state.examplesOfNumberFormats.locale === sheet.locale
    ? state
    : {
        ...state,
        examplesOfNumberFormats: numberFormatExamples(sheet),
      };
}
export function groupOfChoice(choice?: Dynamic) {
  let hasChoice = (group?: Dynamic) => NUMBER_FORMAT_GROUPS[group].some((member?: Dynamic) => member === choice);
  return NUMBER_FORMAT_GROUP_NAMES.find(hasChoice) ?? choice;
}
export function choicesForCells(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let cells = workbook.cellsOnShowIn(sheetId, area).filter((cell?: Dynamic) => isFormulaCell(workbook, cell));
  return CELL_FORMAT_CHOICES.filter(
    (choice?: Dynamic) =>
      CHOICE_APPLIES_TO[choice] === 'any' || cells.every((cell?: Dynamic) => workbook.formatOf(cell).cellControl.kind === choice),
  );
}
export function hasCellsNotSpilledIn(workbook: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let isInArea = ({ topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex }: Dynamic) =>
    isInSpan(topRowIndex, area.topRowIndex, area.rowCount) && isInSpan(leftColumnIndex, area.leftColumnIndex, area.columnCount);
  return (
    workbook.cellsOnShowIn(sheetId, area).filter((cell?: Dynamic) => {
      let spillArea = workbook.cellOf(cell) === null ? workbook.spillOver(cell)?.area : undefined;
      return spillArea !== undefined && !isInArea(spillArea);
    }).length <
    area.rowCount * area.columnCount
  );
}
export function choiceOfPatternIgnoringDecimals(pattern?: Dynamic, sheet?: Dynamic) {
  let wholePattern = withDecimalPlaces(pattern, 0);
  return NUMBER_FORMAT_CHOICES.find((choice?: Dynamic) => withDecimalPlaces(patternOfChoice(choice, sheet), 0) === wholePattern) ?? null;
}
export function formatChoiceOf(format?: Dynamic, sheet?: Dynamic) {
  let { numberFormat: numberFormat, cellControl: cellControl } = format;
  if (cellControl?.kind === 'dropdown')
    return {
      name: 'dropdown',
      choice: 'dropdown',
    };
  if (isCheckboxFormat(format))
    return {
      name: 'checkbox',
      choice: 'checkbox',
    };
  if (numberFormat === null || cellControl === null) return MIXED_FORMAT_CHOICE;
  let { kind: kind, pattern: pattern } = numberFormat;
  let choice = choiceOfPattern(pattern, sheet) ?? choiceOfPatternIgnoringDecimals(pattern, sheet);
  return {
    name: choice ?? kind,
    choice: choice,
  };
}
export function withShownUnderPattern(cell?: Dynamic, shownByValue?: Dynamic) {
  let value = cellValueOf(cell);
  let shown = value?.kind === 'number' ? shownByValue.get(value.value) : undefined;
  return cell === null || shown === undefined || shown === null
    ? cell
    : {
        ...cell,
        shown: shown,
      };
}
export function numbersInSelection(state: PageState, workbook: ReadsWithTextMeasurer) {
  let numbers = new (Set as Dynamic)();
  let { sheetId: sheetId } = state;
  if (state.activeCell.sheetId !== sheetId) return numbers;
  let sheet = readsWithUnansweredEntries(workbook, state);
  let layout = layoutOfView(state, workbook);
  let shownRows = rowPanes(state, layout, state).flatMap((pane?: Dynamic) => shownRowIndicesInPane(pane, layout));
  let shownColumns = columnPanes(state, layout, state).flatMap((pane?: Dynamic) => shownColumnIndicesInPane(pane, layout));
  let addNumberAt = (rowIndex?: Dynamic, columnIndex?: Dynamic) => {
    let cellId = sheet.cellIdAt(sheetId, rowIndex, columnIndex);
    if (cellId === null) return;
    let cellValue = cellValueOf(sheet.cellOf(cellId) ?? sheet.spilledCellOf(cellId));
    if (cellValue?.kind === 'number') numbers.add(cellValue.value);
  };
  for (let area of areasOfAllRanges(state, sheet) as Dynamic) {
    let rowsInArea = shownRows.filter((rowIndex?: Dynamic) => isInSpan(rowIndex, area.topRowIndex, area.rowCount));
    let columnsInArea = shownColumns.filter(
      (columnIndex?: Dynamic) => isInSpan(columnIndex, area.leftColumnIndex, area.columnCount),
    );
    let [topRow, leftColumn] = [rowsInArea[0], columnsInArea[0]];
    if (topRow === undefined || leftColumn === undefined) continue;
    for (let value of rowsInArea as Dynamic) for (let columnIndex of columnsInArea as Dynamic) addNumberAt(value, columnIndex);
    let shownArea = {
      topRowIndex: topRow,
      leftColumnIndex: leftColumn,
      rowCount: (rowsInArea.at(-1) ?? topRow) - topRow + 1,
      columnCount: (columnsInArea.at(-1) ?? leftColumn) - leftColumn + 1,
    };
    for (let value of sheet.mergedAreasIn(sheetId, shownArea) as Dynamic) addNumberAt(value.topRowIndex, value.leftColumnIndex);
  }
  return numbers;
}
export function refreshShownUnderPattern(before: Dynamic, state: PageState, sheet?: Dynamic) {
  let customNumberFormat = state.customNumberFormat;
  if (customNumberFormat === null || !isAgentWrittenListPattern(state)) return state;
  let shown =
    state.workbookChangeCount === before.workbookChangeCount && state.formulasWorkedOutCount === before.formulasWorkedOutCount
      ? customNumberFormat.shownUnderPattern
      : EMPTY_SHOWN_UNDER_PATTERN;
  let newNumbers = [...numbersInSelection(state, sheet)].filter((number?: Dynamic) => !shown.has(number));
  if (newNumbers.length === 0 && shown === customNumberFormat.shownUnderPattern) return state;
  let shownUnderPattern = new (Map as Dynamic)(shown);
  for (let number of newNumbers as Dynamic) {
    let read = sheet.patternRead(customNumberFormat.pattern, () => number);
    shownUnderPattern.set(number, read?.kind === 'numberFormat' ? read.shown : null);
  }
  return {
    ...state,
    customNumberFormat: {
      ...customNumberFormat,
      shownUnderPattern: shownUnderPattern,
    },
  };
}
export const MAX_DECIMAL_PLACES = 30;
export const ELAPSED_TIME_BRACKET = /^\[[hms]+\]$/i;
export const blankOutLiterals = (pattern?: Dynamic) =>
  pattern.replaceAll(
    /"[^"]*"|[\\_*].|\[[^\]]*\]/gsu,
    (part?: Dynamic) => (ELAPSED_TIME_BRACKET.test(part) ? part : ' '.repeat(part.length)),
  );
export const NUMBER_FORMAT_CHOICES = [
  'general',
  'number',
  'roundedNumber',
  'numberInParentheses',
  'currency',
  'roundedCurrency',
  'percent',
  'scientific',
  'date',
  'mediumDate',
  'longDate',
  'monthAndDay',
  'monthAndYear',
  'time',
  'dateAndTime',
  'duration',
];
export const isLocaleDependentChoice = (choice?: Dynamic) => choice in DEFAULT_LOCALE_PATTERNS;
export const PHONE_NUMBER_FORMAT = {
  pattern: '[<=9999999]###-####;(###) ###-####',
  example: '(555) 555-1234',
};
export const isNorthAmericanLocale = (locale?: Dynamic) => /-(?:US|CA)$/.test(locale);
export const SAMPLE_DATE_TIME_SERIAL = 46096.604166666664;
export const exampleOfChoice = ({ byChoice: byChoice }: Dynamic, choice?: Dynamic) =>
  byChoice.get(choice) ?? NUMBER_FORMAT_CHOICE_PATTERNS[choice].example;
export const numberFormatOfChoice = (choice?: Dynamic, sheet?: Dynamic) => ({
  pattern: patternOfChoice(choice, sheet),
});
export const CELL_FORMAT_CHOICES = [...NUMBER_FORMAT_CHOICES, 'dropdown', 'checkbox'];
export const NUMBER_FORMAT_GROUPS = {
  numbers: ['number', 'roundedNumber', 'numberInParentheses', 'percent', 'scientific'],
  currencies: ['currency', 'roundedCurrency'],
  datesAndTimes: ['date', 'mediumDate', 'longDate', 'monthAndDay', 'monthAndYear', 'time', 'dateAndTime', 'duration'],
};
export const NUMBER_FORMAT_GROUP_NAMES = ['numbers', 'currencies', 'datesAndTimes'];
export const NUMBER_FORMAT_MENU_SECTIONS = [['general'], NUMBER_FORMAT_GROUP_NAMES, ['customFormat']];
export const NUMBER_FORMAT_MENU_CHOICES = [...NUMBER_FORMAT_CHOICES, 'customFormat'];
export const CHOICE_APPLIES_TO = {
  general: 'any',
  number: 'any',
  roundedNumber: 'any',
  numberInParentheses: 'any',
  currency: 'any',
  roundedCurrency: 'any',
  percent: 'any',
  scientific: 'any',
  date: 'any',
  mediumDate: 'any',
  longDate: 'any',
  monthAndDay: 'any',
  monthAndYear: 'any',
  time: 'any',
  dateAndTime: 'any',
  duration: 'any',
  dropdown: 'withoutFormula',
  checkbox: 'any',
};
export const choiceOfPattern = (pattern?: Dynamic, sheet?: Dynamic) =>
  NUMBER_FORMAT_CHOICES.find((choice?: Dynamic) => patternOfChoice(choice, sheet) === pattern) ?? null;
export const MIXED_FORMAT_CHOICE = {
  name: 'mixed',
  choice: null,
};
export const EMPTY_SHOWN_UNDER_PATTERN = new (Map as Dynamic)();
export const isAgentWrittenListPattern = ({ customNumberFormat: customNumberFormat }: Dynamic) =>
  customNumberFormat?.typedIn === 'list' && customNumberFormat.agent?.kind === 'wrote' && customNumberFormat.reading.kind === 'numberFormat';
export const shownUnderPatternOf = (state: PageState) =>
  isAgentWrittenListPattern(state) ? (state.customNumberFormat?.shownUnderPattern ?? null) : null;
export const CUSTOM_FORMAT_PLACEHOLDERS = {
  withDecimals: '#,##0.00',
  withUnit: '0.0 "kg"',
  withUnitAndDecimals: '0.00 "kg"',
};
export const UNREADABLE_PATTERN_REFUSALS = new (Set as Dynamic)([
  'patternTooLong',
  'patternHoldsControlCharacter',
  'quoteNotClosed',
  'nothingAfterEscape',
  'bracketNotClosed',
  'bracketNotKnown',
  'tooManySections',
  'textSectionNotLast',
  'fourthSectionNotForText',
  'colorOutOfPlace',
  'conditionOutOfPlace',
  'currencyOrLanguageNamedTwice',
  'sectionMixesKinds',
  'secondDecimalPoint',
  'commaOutOfPlace',
  'exponentNotWellFormed',
  'fractionNotWellFormed',
  'textPlacedTwice',
  'secondFill',
  'elapsedTimeNotWellFormed',
  'tooManyDecimalsOfASecond',
]);
export { NUMBER_FORMAT_CHOICE_PATTERNS } from './number-format-choices-values.ts';
