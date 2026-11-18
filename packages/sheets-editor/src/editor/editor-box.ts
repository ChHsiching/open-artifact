import type { Dynamic } from '../dynamic.ts';
import { clipSpanToShown, NO_EDITOR_LAYOUT } from '../grid/view-boxes.ts';
import { fontPointsToPixels, rowHeightForLines } from '../grid/cell-metrics-values.ts';
import { unzoomedEditorWidth, placeZoomedEditor, zoomedEditorMargin, compactOneLineRowHeight, lineCountWithListGaps } from '../grid/cell-metrics.ts';
import { isOneLineEditor } from '../state/transitions.ts';
import { wrapsWithinWidth, lineCountOfEntry } from './entry-lines.ts';
import { entryListsOf } from './entry-looks.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
export function editorBoxOf(
  cellBox?: Dynamic,
  pageSize?: Dynamic,
  fontSize?: Dynamic,
  padding?: Dynamic,
  lineCount?: Dynamic,
  scale: Dynamic = 1,
) {
  let { showsIn: showsIn } = cellBox;
  let shownRight = Math.min(showsIn.left + showsIn.width, pageSize.width);
  let [left, width] = clipSpanToShown(cellBox.left, cellBox.width, showsIn.left, shownRight);
  let isZoomed = scale > 1;
  let editorWidth = isZoomed
    ? Math.max(fontPointsToPixels(fontSize), Math.min(width, unzoomedEditorWidth(pageSize.width - showsIn.left, scale, 'along')))
    : width;
  let editorLeft = isZoomed
    ? placeZoomedEditor(
        {
          ofCell: left,
          size: editorWidth,
          scale: scale,
        },
        [showsIn.left, pageSize.width],
        'along',
      )
    : left;
  let [top, height] = clipSpanToShown(cellBox.top, cellBox.height, showsIn.top, Math.min(showsIn.top + showsIn.height, pageSize.height));
  let fitsAbovePageFoot = cellBox.top + cellBox.height <= pageSize.height;
  let roomBelow = unzoomedEditorWidth(pageSize.height - (fitsAbovePageFoot ? showsIn.top : top), scale, 'down');
  let marginsDown = 2 * zoomedEditorMargin(scale, 'down');
  let minHeight = Math.max(isZoomed ? Math.min(height / scale, roomBelow) : height, compactOneLineRowHeight(fontSize) - marginsDown);
  let linesHeight = rowHeightForLines(lineCount, fontSize, padding) - (lineCount === 1 ? marginsDown : 0);
  let editorHeight = Math.max(minHeight, Math.min(linesHeight, roomBelow));
  return {
    left: editorLeft,
    top: !fitsAbovePageFoot
      ? top
      : isZoomed
        ? placeZoomedEditor(
            {
              ofCell: top,
              size: editorHeight,
              scale: scale,
            },
            [showsIn.top, pageSize.height],
            'down',
          )
        : Math.min(top, pageSize.height - editorHeight),
    width: editorWidth,
    height: editorHeight,
    showsIn: showsIn,
  };
}
export function editorLayoutOf(
  editor?: Dynamic,
  cellBox?: Dynamic,
  pageSize?: Dynamic,
  format?: Dynamic,
  padding?: Dynamic,
  measure?: Dynamic,
  isFullWidth: Dynamic = false,
  scale: Dynamic = 1,
  isFormulaBarKeptToOneLine: Dynamic = false,
  extraWidth: Dynamic = 0,
  otherTexts: Dynamic = [],
) {
  let firstBox = editorBoxOf(cellBox, pageSize, format.font.size, padding, 1, scale);
  if (isOneLineEditor(editor))
    return {
      ...NO_EDITOR_LAYOUT,
      editorBox: firstBox,
    };
  let { text: text } = editor;
  let { left: left, width: width } = firstBox;
  let widthToPageEdge = Math.max(width, unzoomedEditorWidth(pageSize.width - left + zoomedEditorMargin(scale, 'along'), scale, 'along'));
  let maxWidth = EDITOR_MAX_WIDTH_IN_FONT_SIZES * fontPointsToPixels(format.font.size);
  let foldWidth = isFullWidth
    ? widthToPageEdge
    : wrapsWithinWidth(width, format)
      ? width
      : Math.max(width, Math.min(maxWidth, widthToPageEdge));
  let foldsAtWidth = Math.min(foldWidth + extraWidth, widthToPageEdge);
  let textWidth = Math.max(0, foldsAtWidth - padding.left - padding.right);
  let lists = entryListsOf(editor);
  let lineCount = Math.max(
    lineCountOfEntry(text, format.font, textWidth, measure, lists),
    ...otherTexts.map((otherText?: Dynamic) => lineCountOfEntry(otherText, format.font, textWidth, measure)),
  );
  let editorLineCount = lineCountWithListGaps(lineCount, lists?.length ?? 1, format.font.size);
  let isOneLine = isFormulaBarKeptToOneLine && editor.typingIn === 'formulaBar' && !isFormulaText(text);
  let box = editorBoxOf(cellBox, pageSize, format.font.size, padding, isOneLine ? 1 : editorLineCount, scale);
  return {
    editorBox: {
      ...box,
      width: Math.min(box.width + extraWidth, widthToPageEdge),
    },
    editorLineCount: editorLineCount,
    editorFoldsAt: {
      width: foldsAtWidth,
      isLineFolded:
        lineCount >
        text.split(`
`).length,
    },
  };
}
export const EDITOR_MAX_WIDTH_IN_FONT_SIZES = 24;
