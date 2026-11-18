import type { DecimalSignName } from '@open-artifact/sheets-core';
import { parsePlainNumber } from '../format/number-signs.ts';
export const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const REPLACEMENT_CHARACTER = String.fromCharCode(65533);
export const CONTROL_CHARACTER_PATTERN = /[^\P{Cc}\t\n\r]/gu;
export const sanitizeCellText = (text: string): string =>
  text.replaceAll(CONTROL_CHARACTER_PATTERN, '').replaceAll(LONE_SURROGATE_PATTERN, REPLACEMENT_CHARACTER);
export const TEXT_PREFIX_QUOTE = "'";
export const hasLongerPrefix = (text: string, prefix: string): boolean => text.length > prefix.length && text.startsWith(prefix);
export const parseBooleanText = (text: string): boolean | null => {
  let match = /^(?:(true)|false)$/i.exec(text);
  return match === null ? null : match[1] !== undefined;
};
export const isPlainTextInput = (text: string, decimalSign: DecimalSignName): boolean =>
  parsePlainNumber(text, decimalSign) === null &&
  parseBooleanText(text) === null &&
  !hasLongerPrefix(text, TEXT_PREFIX_QUOTE) &&
  !hasLongerPrefix(text, '=');
export const booleanText = (isTrue: boolean): 'TRUE' | 'FALSE' => (isTrue ? 'TRUE' : 'FALSE');
export const stripTextPrefixQuote = (text: string): string =>
  text.startsWith(TEXT_PREFIX_QUOTE) ? text.slice(TEXT_PREFIX_QUOTE.length) : text;
export const addTextPrefixQuote = (text: string): string => TEXT_PREFIX_QUOTE + text;
export const FORMULA_START_PATTERN = /^\s*[=\uFF1D]/u;
export const sanitizeTypedCellInput = (text: string): string => {
  let sanitized = sanitizeCellText(text);
  let [formulaStart] = FORMULA_START_PATTERN.exec(sanitized) ?? [];
  return formulaStart !== undefined && !text.startsWith(formulaStart) ? addTextPrefixQuote(sanitized) : sanitized;
};
export const textAsTypedInput = (text: string, decimalSign: DecimalSignName): string =>
  isPlainTextInput(text, decimalSign) ? text : TEXT_PREFIX_QUOTE + text;
