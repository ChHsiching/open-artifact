import type { Dynamic } from '../dynamic.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { dateToSerial } from '../model/date-serials.ts';
import { generalValueText, isNegativeShownByColorAlone, toPrecisionText } from '../format/shown-text.ts';
import { withDecimalSign } from '../format/number-signs.ts';
import { MAX_SIGNIFICANT_DIGITS } from '../format/shown-text-values.ts';
import { sanitizeCellText, TEXT_PREFIX_QUOTE } from '../model/cell-text.ts';
export function fullDateBehindMonthDayTime(cell?: Dynamic, getPattern?: Dynamic) {
  let editedAs = cell !== null && 'input' in cell && cell.input.kind === 'number' ? cell.numberIsEditedAs : undefined;
  return editedAs !== undefined &&
    FULL_DATE_TEXT_PATTERN.test(editedAs) &&
    cell?.shown?.kind === 'text' &&
    MONTH_DAY_TIME_TEXT_PATTERN.test(cell.shown.text) &&
    getPattern() === MONTH_DAY_TIME_FORMAT
    ? editedAs
    : null;
}
export function copiedDateMissesDay(cell?: Dynamic, text?: Dynamic, dayTypedAs?: Dynamic) {
  let value = cellValueOf(cell);
  let [, dateText] = DATE_TIME_TEXT_PATTERN.exec(text) ?? [];
  let isoDate = dateText === undefined ? null : dayTypedAs(dateText);
  return isoDate !== null && value?.kind === 'number' && dateToSerial(isoDate) !== Math.floor(value.value);
}
export function cellTextToCopy(cell?: Dynamic, shownText?: Dynamic, decimalSign?: Dynamic) {
  let value = cellValueOf(cell);
  if (value?.kind === 'text') return escapeClipboardCellText(shownText ?? value.value);
  if (value?.kind !== 'number') return generalValueText(value, 1 / 0, decimalSign);
  if (shownText === null || isNegativeShownByColorAlone(cell)) return withDecimalSign(String(value.value).toUpperCase(), decimalSign);
  return isSafeClipboardText(shownText) ? shownText : escapeClipboardCellText(shownText);
}
export function cellTextForCsv(cell?: Dynamic, shownText?: Dynamic, decimalSign?: Dynamic) {
  let value = cellValueOf(cell);
  if (value?.kind === 'text') return escapeCsvCellText(shownText ?? value.value);
  if (value?.kind !== 'number') return generalValueText(value, 1 / 0, decimalSign);
  if (shownText === null || isNegativeShownByColorAlone(cell))
    return Number.isSafeInteger(value.value)
      ? String(value.value)
      : withDecimalSign(toPrecisionText(value.value, MAX_SIGNIFICANT_DIGITS), decimalSign);
  return SIGNED_NUMBER_TEXT_PATTERN.test(shownText) ? shownText : escapeCsvCellText(shownText);
}
export const cellShownText = (cell?: Dynamic, decimalSign?: Dynamic) =>
  cell?.shown?.kind === 'text' && !isNegativeShownByColorAlone(cell) ? cell.shown.text : generalValueText(cellValueOf(cell), 1 / 0, decimalSign);
export const CLIPBOARD_ESCAPE_PATTERN =
  /^(?=[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])|[\t\n\r](?='*[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/g;
export const UNUSUAL_LINE_BREAK_PATTERN = /[\v\f\x85\u2028\u2029]/g;
export const normalizeExportedText = (input?: Dynamic) =>
  sanitizeCellText(
    input.replaceAll(
      UNUSUAL_LINE_BREAK_PATTERN,
      `
`,
    ),
  );
export const escapeClipboardCellText = (input?: Dynamic) =>
  normalizeExportedText(input).replaceAll(CLIPBOARD_ESCAPE_PATTERN, (input2?: Dynamic) => input2 + TEXT_PREFIX_QUOTE);
export const CLIPBOARD_UNESCAPE_PATTERN = /(?<=[\t\n])'(?='*[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/g;
export const unescapeClipboardText = (input?: Dynamic) =>
  input.startsWith('=') ? input : input.replaceAll(CLIPBOARD_UNESCAPE_PATTERN, '');
export const SIGNED_NUMBER_TEXT_PATTERN = /^ *[+-](?:[\p{Sc} %]*[\d.,\u00a0\u202f']+(?:(?<=\d)E[+-]?\d+)?)?[\p{Sc} %]*$/u;
export const MONTH_DAY_TIME_FORMAT = 'm/d h:mm';
export const MONTH_DAY_TIME_TEXT_PATTERN = /^\d{1,2}[/.-]\d{1,2} \d{1,2}:\d{2}$/;
export const FULL_DATE_TEXT_PATTERN = /^\d+[/.-]\d+[/.-]\d+/;
export const DATE_TIME_TEXT_PATTERN = /^(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4})(?: \d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?)?$/i;
export const isSafeClipboardText = (text?: Dynamic) =>
  SIGNED_NUMBER_TEXT_PATTERN.test(text) || escapeClipboardCellText(text) === text;
export const CSV_ESCAPE_PATTERN =
  /^(?='*[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])|[;\t\n\r](?='*(?:[^\S\t\n\r]|")*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/g;
export const CSV_UNESCAPE_PATTERN =
  /^'(?='*[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])|(?<=[;\t\n\r])'(?='*(?:[^\S\t\n\r]|")*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/g;
export const unescapeCsvCellText = (input?: Dynamic) => input.replaceAll(CSV_UNESCAPE_PATTERN, '');
export const unescapeLoneCellText = (input?: Dynamic) =>
  /^'[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(input) ? input.slice(TEXT_PREFIX_QUOTE.length) : input;
export const escapeCsvCellText = (input?: Dynamic) =>
  normalizeExportedText(input).replaceAll(CSV_ESCAPE_PATTERN, (input2?: Dynamic) => input2 + TEXT_PREFIX_QUOTE);
export const CSV_FIRST_CELL_ESCAPE_PATTERN =
  /(?:,|[;\t\n\r](?!'+(?:[^\S\t\n\r]|")*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]))(?='*[^\S\t\n\r]*(?:["=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|$))/g;
export const escapeFirstCsvCellText = (input?: Dynamic) =>
  input.replaceAll(CSV_FIRST_CELL_ESCAPE_PATTERN, (input2?: Dynamic) => input2 + TEXT_PREFIX_QUOTE);
export const CSV_FIRST_CELL_UNESCAPE_PATTERN =
  /^'(?='*[^\S\t\n\r]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])|(?<=[,;\t\n\r])'(?='*[^\S\t\n\r]*(?:["=+\-@\uFF1D\uFF0B\uFF0D\uFF20]|$))/g;
export const unescapeFirstCsvCellText = (input?: Dynamic) => input.replaceAll(CSV_FIRST_CELL_UNESCAPE_PATTERN, '');
export const toFixedText = (number?: Dynamic, digits?: Dynamic) => String(Number(number.toFixed(digits))).toUpperCase();
export const generalNumberFormatter = new (Intl.NumberFormat as Dynamic)('en-US', {
  useGrouping: false,
  maximumSignificantDigits: MAX_SIGNIFICANT_DIGITS,
});
