import type { Dynamic } from '../dynamic.ts';
export function groupSeparatorPattern(decimalSign?: Dynamic) {
  let groupChars = Object.values(GROUP_SIGN_CHARS)
    .filter((input?: Dynamic) => input !== DECIMAL_SIGN_CHARS[decimalSign])
    .join('');
  return new (RegExp as Dynamic)(`(?<=\\d)[${groupChars}](?=(?:\\d{2}[${groupChars}])*\\d{3}(?!\\d))`, 'g');
}
export function formatNumberWithSigns(
  number: Dynamic,
  { decimalSign: decimalSign, groupSign: groupSign, sizesOfGroups: sizesOfGroups }: Dynamic,
) {
  let [wholePart = '', fractionPart] = plainNumberFormatter.format(Math.abs(number)).split('.');
  let groupSize = GROUP_SIZES[sizesOfGroups];
  let groups = [wholePart.slice(-3)];
  for (let end: Dynamic = wholePart.length - 3; end > 0; end -= groupSize) groups.unshift(wholePart.slice(Math.max(0, end - groupSize), end));
  let grouped = groups.join(GROUP_SIGN_CHARS[groupSign]);
  let text = fractionPart === undefined ? grouped : `${grouped}${DECIMAL_SIGN_CHARS[decimalSign]}${fractionPart}`;
  return number < 0 ? `-${text}` : text;
}
export function parsePlainNumber(text?: Dynamic, decimalSign?: Dynamic) {
  let start: Dynamic = 0;
  let end: Dynamic = text.length;
  while (start < end && text[start] === ' ') start += 1;
  while (end > start && text[end - 1] === ' ') end -= 1;
  let trimmed = text.slice(start, end);
  if (!PLAIN_NUMBER_PATTERNS[decimalSign].test(trimmed)) return null;
  let number = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(number)) return null;
  return number === 0 ? 0 : number;
}
export const EN_US_LOCALE = 'en-US';
export const formulaArgumentSeparator = (decimalSign?: Dynamic) => (decimalSign === 'comma' ? ';' : ',');
export const arrayColumnSeparator = (decimalSign?: Dynamic) => (decimalSign === 'comma' ? '\\' : ',');
export const DECIMAL_SIGN_CHARS = {
  point: '.',
  comma: ',',
};
export const GROUP_SIGN_CHARS = {
  comma: ',',
  point: '.',
  noBreakSpace: ' ',
  narrowNoBreakSpace: ' ',
  apostrophe: "'",
};
export const GROUP_SIZES = {
  threes: 3,
  threeAndThenTwos: 2,
};
export const withDecimalSign = (text?: Dynamic, decimalSign?: Dynamic) => text.replace('.', DECIMAL_SIGN_CHARS[decimalSign]);
export const GROUP_SEPARATOR_PATTERNS = {
  point: groupSeparatorPattern('point'),
  comma: groupSeparatorPattern('comma'),
};
export const stripGroupSeparators = (text?: Dynamic, decimalSign?: Dynamic) =>
  text.replaceAll(GROUP_SEPARATOR_PATTERNS[decimalSign], '');
export const normalizeNoBreakSpaces = (input?: Dynamic) => input.replaceAll(/[\u00a0\u202f]/g, ' ');
export const plainNumberFormatter = new (Intl.NumberFormat as Dynamic)('en-US', {
  useGrouping: false,
  maximumSignificantDigits: 15,
});
export const PLAIN_NUMBER_PATTERNS = {
  point: /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/,
  comma: /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/,
};
