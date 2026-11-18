import type { Dynamic } from '../../dynamic.ts';
import { createGivenFormatsLookup } from '../../model/cell-format.ts';
import { areasOfRuleRanges } from './descriptions.ts';
import { isInSpan } from '../../grid/geometry.ts';
import { cellValueOf } from '../../model/cell-values.ts';
import { cellColorsOfFormat, colorScaleCellColors, colorScaleStepAt } from '../cell-colors.ts';
import type { WorkbookReads } from '../../model/workbook.ts';
export function givenFormatsLookupOf(conditionalFormats?: Dynamic) {
  let cached = givenFormatsLookupCache.get(conditionalFormats);
  if (cached !== undefined) return cached;
  let lookup = createGivenFormatsLookup(conditionalFormats.formats);
  givenFormatsLookupCache.set(conditionalFormats, lookup);
  return lookup;
}
export function drawnFormatsOf(reads: WorkbookReads, sheetId?: Dynamic, conditionalFormats?: Dynamic) {
  let givenFormats = givenFormatsLookupOf(conditionalFormats);
  let scales = conditionalFormats.colorScales.flatMap(
    ({ ranges: ranges, stops: [firstStop, ...otherStops] }: Dynamic) =>
      firstStop === undefined
        ? []
        : [
            {
              stops: [firstStop, ...otherStops],
              areas: areasOfRuleRanges(reads, sheetId, ranges),
            },
          ],
  );
  let formatOver = (format: Dynamic, { rowId: rowId, columnId: columnId }: Dynamic) =>
    givenFormats.formatDrawnOf(format, rowId, columnId);
  let formatOf = (cellId?: Dynamic) => formatOver(reads.formatOf(cellId), cellId);
  return {
    formatOf: formatOf,
    formatOver: formatOver,
    lookOf(cellId: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) {
      let format = formatOf(cellId);
      let ruleLook = givenFormats.lookGivenTo(cellId.rowId, cellId.columnId);
      let scale =
        ruleLook?.fillColor !== undefined
          ? undefined
          : scales.find(
              ({ areas: areas }: Dynamic) =>
                areas.some(
                  (area?: Dynamic) =>
                    isInSpan(rowIndex, area.topRowIndex, area.rowCount) && isInSpan(columnIndex, area.leftColumnIndex, area.columnCount),
                ),
            );
      let value = scale === undefined ? null : cellValueOf(reads.cellOnShowIn(cellId));
      return {
        format: format,
        paints:
          scale === undefined || value?.kind !== 'number'
            ? cellColorsOfFormat(format)
            : colorScaleCellColors(colorScaleStepAt(scale.stops, value.value), format.font.color),
        isTextColorFromRule: ruleLook?.font?.color !== undefined,
        isFillFromRule: ruleLook?.fillColor !== undefined,
      };
    },
  };
}
export const givenFormatsLookupCache = new (WeakMap as Dynamic)();
