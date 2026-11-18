import type { Dynamic } from '../dynamic.ts';
import { isListLevel } from '../editor/text-looks.ts';
export function romanNumeralOf(number?: Dynamic) {
  let [left, text]: Dynamic = [number, ''];
  for (let [value, numeral] of ROMAN_NUMERALS as Dynamic)
    while (left >= value) {
      text += numeral;
      left -= value;
    }
  return text;
}
export function alphabeticNumeralOf(number?: Dynamic) {
  let [left, text]: Dynamic = [number, ''];
  while (left > 0) {
    text = String.fromCodePoint(97 + ((left - 1) % 26)) + text;
    left = Math.floor((left - 1) / 26);
  }
  return text;
}
export function listAttributesOf({ list: list, number: number }: Dynamic) {
  if (list.kind === 'none') return {};
  return {
    [LIST_ATTRIBUTE]: list.kind,
    [LIST_LEVEL_ATTRIBUTE]: String(list.level),
    ...(number !== null && {
      [LIST_NUMBER_ATTRIBUTE]: listNumberText(list.level, number),
    }),
    ...(list.kind === 'checkbox' && {
      [BOX_CHECKED_ATTRIBUTE]: String(list.isChecked),
    }),
  };
}
export function listOfElement(element?: Dynamic) {
  let kind = element.getAttribute(LIST_ATTRIBUTE);
  let level = Number(element.getAttribute(LIST_LEVEL_ATTRIBUTE));
  if (!isListLevel(level))
    return {
      kind: 'none',
    };
  if (kind === 'bullet' || kind === 'numbered')
    return {
      kind: kind,
      level: level,
    };
  return kind === 'checkbox'
    ? {
        kind: kind,
        level: level,
        isChecked: element.getAttribute(BOX_CHECKED_ATTRIBUTE) === 'true',
      }
    : {
        kind: 'none',
      };
}
export function isPressOnListCheckbox(element: Dynamic, { clientX: clientX, clientY: clientY }: Dynamic) {
  let { left: left, right: right, top: top, width: width } = element.getBoundingClientRect();
  let { direction: direction, paddingInlineStart: paddingInlineStart, lineHeight: lineHeight } = getComputedStyle(element);
  let scale = element.offsetWidth === 0 ? 1 : width / element.offsetWidth;
  let markerWidth = scale * Number.parseFloat(paddingInlineStart);
  return (
    !(clientY > top + scale * Number.parseFloat(lineHeight)) && (direction === 'rtl' ? clientX > right - markerWidth : clientX < left + markerWidth)
  );
}
export function listFromValue(value?: Dynamic) {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null;
  if (value.kind === 'none')
    return {
      kind: 'none',
    };
  let level = 'level' in value ? value.level : undefined;
  if (typeof level !== 'number' || !isListLevel(level)) return null;
  if (value.kind === 'bullet' || value.kind === 'numbered')
    return {
      kind: value.kind,
      level: level,
    };
  let isChecked = 'isChecked' in value ? value.isChecked : undefined;
  return value.kind === 'checkbox' && typeof isChecked === 'boolean'
    ? {
        kind: 'checkbox',
        level: level,
        isChecked: isChecked,
      }
    : null;
}
export const LIST_ATTRIBUTE = 'data-list';
export const LIST_LEVEL_ATTRIBUTE = 'data-list-level';
export const LIST_NUMBER_ATTRIBUTE = 'data-list-number';
export const BOX_CHECKED_ATTRIBUTE = 'data-is-box-checked';
export const ROMAN_NUMERALS = [
  [1000, 'm'],
  [900, 'cm'],
  [500, 'd'],
  [400, 'cd'],
  [100, 'c'],
  [90, 'xc'],
  [50, 'l'],
  [40, 'xl'],
  [10, 'x'],
  [9, 'ix'],
  [5, 'v'],
  [4, 'iv'],
  [1, 'i'],
];
export const listNumberText = (level?: Dynamic, number?: Dynamic) =>
  [String, alphabeticNumeralOf, romanNumeralOf][level % 3]?.(number) ?? String(number);
export const listNumberAttributes = (level?: Dynamic, number?: Dynamic) => ({
  [LIST_NUMBER_ATTRIBUTE]: listNumberText(level, number),
});
export const CHECKBOX_LIST_SELECTOR = `[${LIST_ATTRIBUTE}="checkbox"]`;
