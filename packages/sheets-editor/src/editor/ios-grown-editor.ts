import type { Dynamic } from '../dynamic.ts';
import { fontPointsToPixels, nextLineHeight } from '../grid/cell-metrics-values.ts';
import { entryFontStyle } from '../grid/cell-drawing.ts';
export function entryEditorStyle(
  { left: boxLeft, top: boxTop, lineHeightInPixels: lineHeightInPixels, ...box }: Dynamic,
  format?: Dynamic,
  isFormula?: Dynamic,
) {
  let fontPixels = fontPointsToPixels(format.size);
  let lineHeight = lineHeightInPixels ?? nextLineHeight(format.size);
  let iosGrowth = IOS_UNZOOMED_FONT_SIZE / fontPixels;
  if (iosGrowth <= 1)
    return {
      left: boxLeft,
      top: boxTop,
      ...box,
      ...entryFontStyle(format, isFormula),
      lineHeight: `${lineHeight}px`,
    };
  return {
    left: boxLeft,
    top: boxTop,
    ...entryFontStyle(format, isFormula),
    height: grownEditorPixels(box.height),
    minWidth: grownEditorPixels(box.minWidth),
    maxWidth: grownEditorPixels(box.maxWidth),
    paddingTop: grownEditorPixels(box.paddingTop),
    paddingBottom: grownEditorPixels(box.paddingBottom),
    clipPath: box.clipPath?.replace(PIXEL_LENGTH_PATTERN, (match?: Dynamic, pixels?: Dynamic) => grownEditorPixels(Number(pixels)) ?? ''),
    fontSize: grownEditorPixels(fontPixels),
    lineHeight: grownEditorPixels(lineHeight),
    '--sheet-editor-grown-on-ios': String(iosGrowth),
    ...(box['--sheet-clear-left-of-text'] !== undefined && {
      '--sheet-clear-left-of-text': box['--sheet-clear-left-of-text'],
    }),
    ...(box['--sheet-clear-right-of-text'] !== undefined && {
      '--sheet-clear-right-of-text': box['--sheet-clear-right-of-text'],
    }),
    ...(box['--sheet-entry-scale'] !== undefined && {
      '--sheet-entry-scale': box['--sheet-entry-scale'],
    }),
  };
}
export function entryEditorLineStyle(lineHeight?: Dynamic, format?: Dynamic) {
  let {
    left: droppedLeft,
    top: droppedTop,
    ...lineStyle
  } = entryEditorStyle(
    {
      left: 0,
      top: 0,
      height: lineHeight,
      lineHeightInPixels: lineHeight,
    },
    format,
    false,
  );
  return lineStyle;
}
export const IOS_UNZOOMED_FONT_SIZE = 16;
export const grownEditorPixels = (pixels?: Dynamic) =>
  pixels === undefined ? undefined : `calc(${pixels}px * var(--sheet-editor-grown, 1))`;
export const PIXEL_LENGTH_PATTERN = /(-?[\d.]+)px/g;
