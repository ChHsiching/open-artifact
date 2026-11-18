import type { Dynamic } from '../dynamic.ts';
import { levelInList } from '../model/cell-values.ts';
import { isFormulaText } from '../chips/dropdown-pane-edits.ts';
import { hasRoomForText } from '../grid/cell-metrics.ts';
import type { ReadsWithTextMeasurer } from '../state/controller.ts';
export function lineCountOfEntry(text: Dynamic, font: Dynamic, width: Dynamic, workbook: ReadsWithTextMeasurer, lists?: Dynamic) {
  let measured = text.endsWith(`
`)
    ? `${text}.`
    : text;
  let [lineCount = 1] = workbook.lineCountsOfWrappedTexts([
    {
      text: measured,
      font: font,
      widthInPixels: width,
      isStillTyped: true,
      ...(lists !== undefined && {
        levelsInLists: lists.map(levelInList),
      }),
      ...(isFormulaText(text) && {
        isFormulaTyped: true,
      }),
    },
  ]);
  return lineCount;
}
export const withLineBreakAt = (text: Dynamic, { start: start, end: end }: Dynamic) => ({
  text: `${text.slice(0, start)}
${text.slice(end)}`,
  caretAt: start + 1,
});
export const wrapsWithinWidth = (width: Dynamic, { alignment: alignment, font: font }: Dynamic) =>
  alignment.wrap && hasRoomForText(width, font.size);
