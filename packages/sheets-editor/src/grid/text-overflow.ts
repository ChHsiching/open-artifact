import type { Dynamic } from '../dynamic.ts';
import { listHeightForLines, textRoomInWidth } from './cell-metrics.ts';
import { colorsEqual } from '../model/colors.ts';
import { strongerBorder } from './borders.ts';
export function flattenLineBreaksAcrossParts(texts?: Dynamic) {
  let lineBreaks = [...texts.join('').matchAll(LINE_BREAK_RUN_PATTERN)];
  let position: Dynamic = 0;
  return texts.map((text?: Dynamic) => {
    let [start, end] = [position, position + text.length];
    position = end;
    let [flattened, copiedTo]: Dynamic = ['', start];
    for (let { 0: lineBreak, index: breakAt } of lineBreaks as Dynamic) {
      let breakEnd = breakAt + lineBreak.length;
      if (breakEnd <= start || breakAt >= end) continue;
      flattened += text.slice(copiedTo - start, Math.max(breakAt, start) - start) + (breakAt >= start ? ' ' : '');
      copiedTo = Math.min(breakEnd, end);
    }
    return flattened + text.slice(copiedTo - start);
  });
}
export function textOverflowAround(layout?: Dynamic, alignment?: Dynamic, text?: Dynamic, cellWidth?: Dynamic, fontSize?: Dynamic) {
  switch (layout) {
    case 'clip':
    case 'wrap':
      return NO_TEXT_OVERFLOW;
    case 'overflow': {
      let spare = listHeightForLines(text, fontSize) - cellWidth;
      if (spare <= 0) return NO_TEXT_OVERFLOW;
      if (alignment === 'center')
        return {
          toLeft: spare / 2,
          toRight: spare / 2,
        };
      return alignment === 'left'
        ? {
            toLeft: 0,
            toRight: spare,
          }
        : {
            toLeft: spare,
            toRight: 0,
          };
    }
  }
}
export function shareOverflowWidth(available?: Dynamic, ownWidth?: Dynamic, otherWidth?: Dynamic) {
  let total = ownWidth + otherWidth;
  return total <= available || otherWidth === 0
    ? {
        width: ownWidth,
        isShared: false,
      }
    : {
        width: (available * ownWidth) / total,
        isShared: true,
      };
}
export function canTextFadeInCell(cellText?: Dynamic) {
  let hasChip = cellText.pill !== null || cellText.opensDropdownList;
  let isLinkAddress = cellText.linkDrawnAs !== null && cellText.linkDrawnAs !== 'words';
  let isMerged = cellText.mergedColumnCount !== null;
  return !(cellText.isTextWrapped || cellText.isPerson || hasChip || isLinkAddress || isMerged);
}
export function mayTextFade(cellText?: Dynamic, measurer?: Dynamic) {
  let { text: text, format: format } = cellText;
  if (!canTextFadeInCell(cellText)) return false;
  let room = cellText.textWidth - Math.abs(cellText.indentToCenter) - cellText.takenAtRight;
  if (listHeightForLines(text, format.font.size) <= room) return false;
  let maxCharacters = textRoomInWidth(room);
  return (
    text.length > maxCharacters ||
    UNMEASURED_SCRIPT_PATTERN.test(text) ||
    measurer.widthOfCharacters(flattenLineBreaks(text), format.font) * TEXT_WIDTH_SAFETY_FACTOR > maxCharacters
  );
}
export const cellTextLayout = (
  value: Dynamic,
  {
    isMerged: isMerged,
    isTypedIn: isTypedIn,
    isOfDropdown: isOfDropdown,
    hasFilterButton: hasFilterButton,
    isPerson: isPerson,
    linkDrawnAs: linkDrawnAs,
    isFormulaShown: isFormulaShown,
    isWrappedByFormat: isWrappedByFormat,
    holdsList: holdsList,
    hasRoomToWrap: hasRoomToWrap,
  }: Dynamic,
) => {
  if (value?.kind !== 'text' || isMerged || isTypedIn || isOfDropdown || isPerson || (linkDrawnAs !== null && linkDrawnAs !== 'words')) return 'clip';
  if ((!isWrappedByFormat && !holdsList) || isFormulaShown) return linkDrawnAs === null && !hasFilterButton ? 'overflow' : 'clip';
  return hasRoomToWrap ? 'wrap' : 'clip';
};
export const LINE_BREAK_RUN_PATTERN = /(?<![ \t])[ \t]*[\r\n][ \t\r\n]*/g;
export const flattenLineBreaks = (text?: Dynamic) => text.replaceAll(LINE_BREAK_RUN_PATTERN, ' ');
export const NO_TEXT_OVERFLOW = {
  toLeft: 0,
  toRight: 0,
};
export const cellsJoinForOverflow = (format?: Dynamic, nextFormat?: Dynamic, checksDropdowns?: Dynamic) =>
  colorsEqual(format.fillColor, nextFormat.fillColor) &&
  strongerBorder(format.border.right, nextFormat.border.left) === null &&
  !(checksDropdowns && [format, nextFormat].some((input?: Dynamic) => input.cellControl.kind === 'dropdown'));
export const UNMEASURED_SCRIPT_PATTERN = /[^ -\u052f\u2000-\u206f]/;
export const TEXT_WIDTH_SAFETY_FACTOR = 1.1;
export const mayCellTextFade = (cellText?: Dynamic, measurer?: Dynamic) =>
  cellText.textCutByViewAt === null ? mayTextFade(cellText, measurer) : cellText.text !== '' && canTextFadeInCell(cellText);
