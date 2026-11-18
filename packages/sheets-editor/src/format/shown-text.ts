import type { Dynamic } from '../dynamic.ts';
import { booleanText, sanitizeTypedCellInput } from '../model/cell-text.ts';
import { withDecimalSign } from './number-signs.ts';
import { generalNumberText } from './general-numbers.ts';
import { cellValueOf } from '../model/cell-values.ts';
export function trimTrailingNewlines(text?: Dynamic) {
  let end: Dynamic = text.length;
  while (
    text[end - 1] ===
    `
`
  )
    end -= 1;
  return text.slice(0, end);
}
export function toPrecisionText(number?: Dynamic, precision?: Dynamic) {
  let rounded = Number(number.toPrecision(precision));
  return String(Number.isFinite(rounded) ? rounded : number).toUpperCase();
}
export function generalValueText(value?: Dynamic, maxChars?: Dynamic, decimalSign?: Dynamic) {
  switch (value?.kind) {
    case undefined:
      return '';
    case 'text':
    case 'error':
      return value.value;
    case 'boolean':
      return booleanText(value.value);
    case 'number':
      return withDecimalSign(generalNumberText(value.value, Math.min(maxChars, GENERAL_FORMAT_MAX_CHARS)), decimalSign);
  }
}
export function shownCellText(cell?: Dynamic, maxChars?: Dynamic, decimalSign?: Dynamic, overflows: Dynamic = () => false) {
  let shown = cell?.shown;
  if (shown?.kind === 'text')
    return {
      text: shown.text,
      textColor: shown.textColor,
    };
  let charLimit: Dynamic = Math.floor(maxChars);
  if (shown !== undefined && shown.reason !== 'notPrintedYet') {
    let fillCount = Math.max(1, Math.min(charLimit, GENERAL_FORMAT_MAX_CHARS));
    return {
      text: OVERFLOW_FILL_CHAR.repeat(fillCount),
      textColor: null,
    };
  }
  let value = cellValueOf(cell);
  let text: Dynamic = generalValueText(value, charLimit, decimalSign);
  if (value?.kind !== 'number')
    return {
      text: text,
      textColor: null,
    };
  while (text.length <= charLimit && overflows(text)) {
    charLimit = text.length - 1;
    text = generalValueText(value, charLimit, decimalSign);
  }
  return {
    text: text,
    textColor: null,
  };
}
export function isNegativeShownByColorAlone(cell?: Dynamic) {
  let value = cellValueOf(cell);
  let shown = cell?.shown;
  return (
    shown?.kind === 'text' &&
    shown.textColor !== null &&
    value?.kind === 'number' &&
    value.value < 0 &&
    /\d/.test(shown.text) &&
    !NEGATIVE_SIGN_PATTERN.test(shown.text)
  );
}
export const normalizeLineBreaks = (input?: Dynamic) =>
  input.replaceAll(
    /\r\n?/g,
    `
`,
  );
export const cleanEnteredCellText = (input?: Dynamic) => sanitizeTypedCellInput(trimTrailingNewlines(input));
export const flattenEnteredText = (input?: Dynamic) =>
  trimTrailingNewlines(input).replaceAll(
    `
`,
    ' ',
  );
export const toExponentialText = (input?: Dynamic, options?: Dynamic) =>
  input
    .toExponential(options)
    .toUpperCase()
    .replace(/\.?0*E/, 'E');
export const GENERAL_FORMAT_MAX_CHARS = 11;
export const MAX_EXPONENT_FRACTION_DIGITS = 5;
export const OVERFLOW_FILL_CHAR = '#';
export const isCellShownBlank = (cell?: Dynamic) => shownCellText(cell, 1 / 0, 'point').text.trim() === '';
export const NEGATIVE_SIGN_PATTERN = /(?:^|[^Ee])[-\u2212(]/;
export { MAX_SIGNIFICANT_DIGITS } from './shown-text-values.ts';
