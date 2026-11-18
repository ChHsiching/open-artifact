import type { Dynamic } from '../dynamic.ts';
import { isUnknownCurrencyCode, importColumnTexts, dataLineNumbers, trueOrFalseFit, decimalSignOfReading } from './column-readings.ts';
import { truncateToCleanText } from './import-basics.ts';
export function currencySymbolOfText(text?: Dynamic) {
  let match = LEADING_CURRENCY_PATTERN.exec(text) ?? TRAILING_CURRENCY_PATTERN.exec(text);
  let symbol = match?.[1] ?? match?.[2] ?? null;
  return symbol === null || isUnknownCurrencyCode(symbol) ? null : symbol;
}
export function currencyReadingsOf(differentTexts?: Dynamic) {
  let countsBySymbol = new (Map as Dynamic)();
  for (let { text: text, count: count } of differentTexts as Dynamic) {
    let symbol = currencySymbolOfText(text);
    if (symbol !== null) countsBySymbol.set(symbol, (countsBySymbol.get(symbol) ?? 0) + count);
  }
  let [[mostCommonSymbol] = []] = [...countsBySymbol].toSorted(([, countA]: Dynamic, [, countB]: Dynamic) => countB - countA);
  if (mostCommonSymbol === undefined) return [];
  return READING_DECIMAL_SIGNS.map(
    (decimalSign?: Dynamic) => ({
      kind: 'currency',
      decimalSign: decimalSign,
      decimalPlaces: 2,
      symbol: mostCommonSymbol,
    }),
  );
}
export function countDifferentTexts(texts?: Dynamic) {
  let counts = new (Map as Dynamic)();
  for (let text of texts as Dynamic) {
    let trimmed = text.trim();
    if (trimmed !== '') counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  let different = [...counts].map(
    ([text, count]: Dynamic) => ({
      text: text,
      count: count,
    }),
  );
  different.sort((a?: Dynamic, b2?: Dynamic) => b2.count - a.count);
  return different;
}
export function filledCellCountOfLine(cells?: Dynamic) {
  let length: Dynamic = cells.length;
  while (length > 0 && !isFilledText(cells[length - 1] ?? '')) length--;
  return length;
}
export function guessHeaderLine(file?: Dynamic) {
  let lineCountByLength = new (Map as Dynamic)();
  for (let lineOrLength of file.lines as Dynamic) {
    let count = filledCellCountOfLine(lineOrLength);
    if (count > 0) lineCountByLength.set(count, (lineCountByLength.get(count) ?? 0) + 1);
  }
  let usualLength: Dynamic = 0;
  for (let [lineOrLength, count] of lineCountByLength as Dynamic) {
    let usualCount = lineCountByLength.get(usualLength) ?? 0;
    if (count > usualCount || (count === usualCount && lineOrLength > usualLength)) usualLength = lineOrLength;
  }
  let headerIndex = file.lines.findIndex((line?: Dynamic) => line.filter(isFilledText).length * 2 > usualLength);
  return headerIndex < 0 ? 1 : headerIndex + 1;
}
export function profileImportColumn(file?: Dynamic, records?: Dynamic, columnIndex?: Dynamic, core?: Dynamic) {
  let texts = importColumnTexts(file, records, columnIndex);
  let different = countDifferentTexts(texts);
  let readings = [...BASIC_COLUMN_READINGS, ...currencyReadingsOf(different)];
  return {
    texts: texts,
    different: different,
    readings: readings,
    fits: core.fitOfColumnReadings(readings, texts) ?? [],
  };
}
export function profileImportFile(
  file?: Dynamic,
  core?: Dynamic,
  lineChoice: Dynamic = {
    headerLine: guessHeaderLine(file),
    linesLeftOut: [],
  },
) {
  let records = dataLineNumbers(file, lineChoice);
  return {
    ...lineChoice,
    records: records,
    columns: Array.from<Dynamic, Dynamic>(
      {
        length: file.columnCount,
      },
      (input?: Dynamic, columnIndex?: Dynamic) => profileImportColumn(file, records, columnIndex, core),
    ),
  };
}
export function profileLineNumbers(file?: Dynamic) {
  let lineCount = file.lines.length;
  let headerLine = guessHeaderLine(file);
  return Array.from<Dynamic, Dynamic>(
    {
      length: lineCount,
    },
    (input?: Dynamic, index?: Dynamic) => index + 1,
  ).filter(
    (line?: Dynamic) =>
      line <= PROFILE_FIRST_LINES || line > lineCount - PROFILE_LAST_LINES || (line >= headerLine && line <= headerLine + PROFILE_LINES_AFTER_HEADER),
  );
}
export function shortenProfileCell(text?: Dynamic) {
  let shortened = truncateToCleanText(text, PROFILE_CELL_MAX_LENGTH);
  return shortened === truncateToCleanText(text, text.length) ? shortened : `${shortened}${IMPORT_ELLIPSIS}`;
}
export function cellsThatDoNotFit(
  { texts: texts, different: different, readings: readings, fits: fits }: Dynamic,
  fitAsTrueOrFalse?: Dynamic,
  core?: Dynamic,
) {
  let areFitsWhole = fits.every((fit?: Dynamic) => !isMostlyFitting(fit) || fit.firstNotFitting.length === fit.notFitting);
  let differentTexts = different.map(({ text: text }: Dynamic) => text);
  let textsToRead = areFitsWhole ? texts : differentTexts;
  let fitsToUse = areFitsWhole ? fits : (core.fitOfColumnReadings([...readings], textsToRead) ?? []);
  let groups = new (Map as Dynamic)();
  let addGroup = (reading?: Dynamic, indexes?: Dynamic, texts2?: Dynamic) => {
    let cells = [...new (Set as Dynamic)(indexes.map((index?: Dynamic) => (texts2[index] ?? '').trim()))]
      .map(shortenProfileCell)
      .filter((cell?: Dynamic) => cell !== '');
    if (cells.length === 0) return;
    let group = groups.get(JSON.stringify(cells));
    if (group === undefined)
      groups.set(JSON.stringify(cells), {
        under: [describeReadingWithSymbol(reading)],
        cells: cells,
      });
    else group.under.push(describeReadingWithSymbol(reading));
  };
  fits.forEach((fit?: Dynamic, index?: Dynamic) => {
    let reading = readings[index];
    if (reading !== undefined && isMostlyFitting(fit)) addGroup(reading, fitsToUse[index]?.firstNotFitting ?? [], textsToRead);
  });
  if (isMostlyFitting(fitAsTrueOrFalse))
    addGroup(
      {
        kind: 'trueOrFalse',
      },
      trueOrFalseFit(differentTexts).firstNotFitting,
      differentTexts,
    );
  return [...groups.values()];
}
export function fileProfileForAgent(file?: Dynamic, profile?: Dynamic, core?: Dynamic) {
  let headerLine = profile.headerLine ?? 0;
  let budget: Dynamic = DO_NOT_FIT_BUDGET;
  return {
    fileName: shortenWithEllipsis(file.fileName, 80),
    lines: file.lines.length,
    columns: file.columnCount,
    countsAreOverTheLinesAfter: headerLine,
    someLines: profileLineNumbers(file).map(
      (line?: Dynamic) => ({
        line: line,
        cells: (file.lines[line - 1] ?? []).map((cell?: Dynamic) => shortenWithEllipsis(cell, 40)),
      }),
    ),
    profileOfEachColumn: profile.columns.map((columnProfile?: Dynamic, columnIndex?: Dynamic) => {
      let { texts: texts, different: different, readings: readings, fits: fits } = columnProfile;
      let filled = different.reduce((sum: Dynamic, { count: count }: Dynamic) => sum + count, 0);
      let fitsByLabel: Dynamic = {};
      let noteFit = (reading?: Dynamic, fit?: Dynamic) => {
        if (reading === undefined || fit.fitting === 0) return;
        fitsByLabel[describeReadingWithSymbol(reading)] = fit.notFitting === 0 ? 'all' : `${fit.fitting} of ${filled}`;
      };
      fits.forEach((fit?: Dynamic, index?: Dynamic) => {
        noteFit(readings[index], fit);
      });
      let fitAsTrueOrFalse = trueOrFalseFit(texts);
      noteFit(
        {
          kind: 'trueOrFalse',
        },
        fitAsTrueOrFalse,
      );
      let doNotFit = budget < 0 ? [] : cellsThatDoNotFit(columnProfile, fitAsTrueOrFalse, core);
      if (doNotFit.length > 0) budget -= JSON.stringify(doNotFit).length;
      let isDoNotFitShown = doNotFit.length > 0 && budget >= 0;
      return {
        column: columnIndex + 1,
        headerSays: shortenWithEllipsis(file.lines[headerLine - 1]?.[columnIndex] ?? '', 60),
        filled: filled,
        blank: texts.length - filled,
        different: different.length,
        mostCommon: different.slice(0, PROFILE_MOST_COMMON_COUNT).map(
          ({ text: text, count: count }: Dynamic) => ({
            text: shortenWithEllipsis(text, 60),
            count: count,
          }),
        ),
        longest: different.reduce((longest: Dynamic, { text: text }: Dynamic) => Math.max(longest, text.length), 0),
        digitsThatStartWithZero: different
          .filter(({ text: text }: Dynamic) => /^0\d+$/.test(text))
          .reduce((sum: Dynamic, { count: count }: Dynamic) => sum + count, 0),
        fits: fitsByLabel,
        ...(isDoNotFitShown && {
          doNotFit: doNotFit,
        }),
      };
    }),
  };
}
export const READING_DECIMAL_SIGNS = ['point', 'comma'];
export const READING_DATE_ORDERS = ['yearMonthDay', 'dayMonthYear', 'monthDayYear'];
export const BASIC_COLUMN_READINGS = [
  ...READING_DECIMAL_SIGNS.map(
    (decimalSign?: Dynamic) => ({
      kind: 'number',
      decimalSign: decimalSign,
      decimalPlaces: 0,
      groupsThousands: false,
    }),
  ),
  ...READING_DECIMAL_SIGNS.map(
    (decimalSign?: Dynamic) => ({
      kind: 'percent',
      decimalSign: decimalSign,
      decimalPlaces: 0,
      numberAloneIs: 'percents',
    }),
  ),
  ...READING_DATE_ORDERS.map(
    (order?: Dynamic) => ({
      kind: 'date',
      order: order,
      shownAs: 'yearMonthDay',
    }),
  ),
  ...READING_DATE_ORDERS.map(
    (order?: Dynamic) => ({
      kind: 'dateAndTime',
      order: order,
      shownAs: 'yearMonthDay',
    }),
  ),
  {
    kind: 'timeOfDay',
  },
];
export const CURRENCY_SIGN_SOURCE = String.raw`(?:[A-Za-z]{0,3}\p{Sc})`;
export const CURRENCY_CODE_SOURCE = '[A-Z]{3}';
export const LEADING_CURRENCY_PATTERN = new (RegExp as Dynamic)(
  String.raw`^[-+(\s]*(?:(${CURRENCY_SIGN_SOURCE})\s*|(${CURRENCY_CODE_SOURCE})\s+)[-+]?[\d.,]`,
  'u',
);
export const TRAILING_CURRENCY_PATTERN = new (RegExp as Dynamic)(
  String.raw`\d[.-]?(?:\s*(${CURRENCY_SIGN_SOURCE})|\s+(${CURRENCY_CODE_SOURCE}))\s*\)?$`,
  'u',
);
export const describeReading = (reading?: Dynamic) =>
  [reading.kind, decimalSignOfReading(reading), 'order' in reading ? reading.order : null]
    .filter((part?: Dynamic) => part !== null)
    .join(' ');
export const describeReadingWithSymbol = (reading?: Dynamic) =>
  'symbol' in reading ? `${describeReading(reading)} ${reading.symbol}` : describeReading(reading);
export const IMPORT_ELLIPSIS = '…';
export const shortenWithEllipsis = (text?: Dynamic, maxLength?: Dynamic) =>
  text.length > maxLength ? `${text.slice(0, maxLength)}${IMPORT_ELLIPSIS}` : text;
export const isFilledText = (text?: Dynamic) => text.trim() !== '';
export const PROFILE_FIRST_LINES = 12;
export const PROFILE_LAST_LINES = 4;
export const PROFILE_LINES_AFTER_HEADER = 3;
export const PROFILE_MOST_COMMON_COUNT = 12;
export const PROFILE_CELL_MAX_LENGTH = 30;
export const DO_NOT_FIT_BUDGET = 2000;
export const isMostlyFitting = ({ fitting: fitting, notFitting: notFitting }: Dynamic) => notFitting > 0 && fitting > notFitting;
