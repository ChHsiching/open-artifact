import type { Dynamic } from '../dynamic.ts';
import { isCellEntryBlank } from '../grid/entry-hints.ts';
import { cellEditorHint, cellEditorShortHint } from '../i18n/grid-action-labels.ts';
import { entryFontStyle } from '../grid/cell-drawing.ts';
import { entryGridlineOverlap, cellEntryBoxStyle } from '../grid/grid-drawing.ts';
import { jsx } from 'react/jsx-runtime';
import { zoomedEditorMargin } from '../grid/cell-metrics.ts';
export function formulaBarPlaceholder({
  formulaBarText: formulaBarText,
  mode: mode,
  openUnderCell: openUnderCell,
  calendar: calendar,
  viewOnlyBecause: viewOnlyBecause,
}: Dynamic) {
  return formulaBarText === '' && !isCellEntryBlank(mode) && openUnderCell === null && calendar === null && viewOnlyBecause === null
    ? cellEditorHint()
    : undefined;
}
export function CellEntryHint({
  grid: {
    body: body,
    editorKeepsClear: editorKeepsClear,
    editorBox: editorBox,
    editorScale: editorScale,
    editorFormat: editorFormat,
    entryHintRoom: entryHintRoom,
  },
}: Dynamic) {
  if (editorBox === null || entryHintRoom === null) return null;
  let { fontFamily: fontFamily, fontSize: fontSize, lineHeight: lineHeight } = entryFontStyle(editorFormat.font, false);
  let editorOrigin = entryGridlineOverlap(editorBox, editorScale);
  return jsx('span', {
    'aria-hidden': true,
    className: 'sheet-entry-hint',
    'data-starts-on-line-at-left': editorOrigin.x > 0 || undefined,
    style: {
      ...cellEntryBoxStyle(editorBox, body, editorFormat, editorKeepsClear, {
        lineCount: 1,
        foldsAt: null,
        scale: editorScale,
      }),
      maxWidth: entryHintRoom + editorOrigin.x + 2 * zoomedEditorMargin(editorScale, 'along'),
      fontFamily: fontFamily,
      fontSize: fontSize,
      lineHeight: lineHeight,
    },
    children: cellEditorShortHint(),
  });
}
