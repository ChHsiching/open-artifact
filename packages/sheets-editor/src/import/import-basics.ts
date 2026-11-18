import type { Dynamic } from '../dynamic.ts';
import { sanitizeCellText } from '../model/cell-text.ts';
export function truncateToCleanText(text?: Dynamic, maxChars?: Dynamic) {
  let cleaned = sanitizeCellText(text.slice(0, maxChars * 4).replace(/[\uD800-\uDBFF]$/, ''))
    .replaceAll(/\s+/g, ' ')
    .replaceAll(INVISIBLE_CHARACTER_PATTERN, '')
    .trim();
  return Array.from<Dynamic>(cleaned).slice(0, maxChars).join('').trim();
}
export const dayMonthOrderOf = ({ dayTypedAs: dayTypedAs }: Dynamic) =>
  dayTypedAs('1/2/2000') === '2000-02-01' ? 'dayMonthYear' : 'monthDayYear';
export const MAX_BROUGHT_DOWN_DECIMAL_PLACES = 6;
export const MAX_IMPORT_QUESTIONS = 3;
export const NEW_SHEET_DESTINATION = {
  kind: 'newSheet',
};
export const INVISIBLE_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/gu;
