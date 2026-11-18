import type { Dynamic } from '../dynamic.ts';
export function copiedChartNodesOfEdit(edit?: Dynamic) {
  if (edit.kind === 'copyPlacedView') return edit.copiedWidgetNodes;
  return edit.kind === 'duplicateSheet' && edit.placedViews?.kind === 'copied' ? edit.placedViews.copiedWidgetNodes : [];
}
export const discardCopiedChartNodes = (edit?: Dynamic) => {
  let copies = copiedChartNodesOfEdit(edit);
  return copies.length === 0
    ? []
    : [
        {
          kind: 'discardChartNodes',
          copies: copies,
        },
      ];
};
