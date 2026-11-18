import type { Dynamic } from '../dynamic.ts';
import { mergedAreaOrCellOf } from '../selection/model.ts';
import { charsThatFitWidth } from '../grid/cell-metrics.ts';
import { shownCellText } from './shown-text.ts';
import { isGeneralPattern } from '../model/cell-format.ts';
import { withDecimalPlaces, decimalPlacesOfPattern, MAX_DECIMAL_PLACES, sampleValueOfFormatKind } from './number-format-choices.ts';
import { numberFormatOfCell } from '../model/workbook.ts';
import { cellValueOf } from '../model/cell-values.ts';
import { NUMBER_FORMAT_CHOICE_PATTERNS } from './number-format-choices-values.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function numberFormatsBroughtIn(reads: WorkbookReads, { sheetId: sheetId, ranges: ranges }: Dynamic) {
  let patterns = new (Set as Dynamic)();
  for (let range of ranges as Dynamic)
    for (let cellId of reads.cellsOnShowIn(sheetId, range) as Dynamic) {
      let pattern = reads.cellOnShowIn(cellId)?.numberFormatBrought?.pattern;
      if (pattern !== undefined && isNumberShownIn(reads, cellId)) patterns.add(pattern);
    }
  return [...patterns];
}
export function firstNumberCellOf(reads: WorkbookReads, cellIds?: Dynamic) {
  let [first, firstRowIndex, firstColumnIndex]: Dynamic = [null, 0, 0];
  for (let cellId of cellIds as Dynamic) {
    let position = isNumberShownIn(reads, cellId) ? reads.positionOfCell(cellId) : null;
    if (position === null) continue;
    if (first === null || position.rowIndex < firstRowIndex || (position.rowIndex === firstRowIndex && position.columnIndex < firstColumnIndex))
      [first, firstRowIndex, firstColumnIndex] = [cellId, position.rowIndex, position.columnIndex];
  }
  return first;
}
export function firstNumberCellInArea(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  for (let rowLimit: Dynamic = 32; ; rowLimit *= 8) {
    let topArea = {
      ...area,
      rowCount: Math.min(rowLimit, area.rowCount),
    };
    let found = firstNumberCellOf(reads, reads.cellsOnShowIn(sheetId, topArea));
    if (found !== null || rowLimit >= area.rowCount) return found;
  }
}
export function firstNumberCellInRanges(reads: WorkbookReads, { sheetId: sheetId, ranges: ranges }: Dynamic) {
  for (let index: Dynamic = ranges.length - 1; index >= 0; index -= 1) {
    let range = ranges[index];
    let found = range === undefined ? null : firstNumberCellInArea(reads, sheetId, range);
    if (found !== null) return found;
  }
  return null;
}
export function decimalPlacesShownInWidth(reads: WorkbookReads, sheetId?: Dynamic, cellId?: Dynamic) {
  let area = mergedAreaOrCellOf(reads, cellId);
  let columnEdges = reads.listSheets().find((sheet?: Dynamic) => sheet.sheetId === sheetId)?.columnEdges;
  if (area === null || columnEdges === undefined) return null;
  let rightColumnIndex = area.leftColumnIndex + area.columnCount;
  let width = columnEdges.startOf(rightColumnIndex) - columnEdges.startOf(area.leftColumnIndex);
  let charsThatFit = charsThatFitWidth(width, reads.formatOf(cellId).font);
  let decimalsShownWith = (maxChars?: Dynamic) =>
    /^-?\d+(?:[.,](?<places>\d+))?$/.exec(shownCellText(reads.cellOnShowIn(cellId), maxChars, reads.decimalSign).text);
  let match = decimalsShownWith(1 / 0) === null ? null : decimalsShownWith(charsThatFit);
  return match === null ? null : (match.groups?.places?.length ?? 0);
}
export function decimalPatternOfSelection(reads: WorkbookReads, selection?: Dynamic) {
  let { sheetId: sheetId, ranges: ranges, activeCell: activeCell, shared: shared } = selection;
  let isFormatShared = shared !== null && shared.numberFormat !== null && !isGeneralPattern(shared.numberFormat.pattern);
  let patterns = [
    ...new (Set as Dynamic)([
      ...ranges.flatMap((range?: Dynamic) => reads.numberFormatPatternsIn(sheetId, range)),
      ...(isFormatShared ? [] : numberFormatsBroughtIn(reads, selection)),
    ]),
  ];
  if (patterns.length === 0) {
    let numberCell = isNumberShownIn(reads, activeCell) ? activeCell : firstNumberCellInRanges(reads, selection);
    if (numberCell === null)
      return {
        why: 'noNumbers',
      };
    let shownPlaces = decimalPlacesShownInWidth(reads, sheetId, numberCell);
    return shownPlaces === null
      ? {
          why: 'formatHasNone',
        }
      : {
          pattern: withDecimalPlaces(INTEGER_PATTERN, shownPlaces),
        };
  }
  let [basePattern, ...otherBasePatterns] = new (Set as Dynamic)(
    patterns.map((pattern?: Dynamic) => withDecimalPlaces(pattern, 0)),
  );
  if (otherBasePatterns.length > 0)
    return {
      why: 'formatsDiffer',
    };
  if (
    !WHOLE_NUMBER_PATTERNS.has(basePattern) &&
    !isFormatShared &&
    ranges.some(
      (range?: Dynamic) => reads.cellsOnShowIn(sheetId, range).some((cellId?: Dynamic) => isGeneralNumberCell(reads, cellId)),
    )
  )
    return {
      why: 'formatsDiffer',
    };
  let mostPlacesPattern = patterns.reduce(
    (best?: Dynamic, pattern?: Dynamic) => ((decimalPlacesOfPattern(pattern) ?? 0) > (decimalPlacesOfPattern(best) ?? 0) ? pattern : best),
  );
  let isGeneral = isGeneralNumberCell(reads, activeCell);
  let patternPlaces = isNumberShownIn(reads, activeCell) ? decimalPlacesOfPattern(numberFormatOfCell(reads, activeCell).pattern) : null;
  let places = isGeneral ? decimalPlacesShownInWidth(reads, sheetId, activeCell) : patternPlaces;
  if (isGeneral && places === null)
    return {
      why: 'formatHasNone',
    };
  return {
    pattern: places === null ? mostPlacesPattern : withDecimalPlaces(mostPlacesPattern, places),
  };
}
export function decimalPlaceChanges(reads: WorkbookReads, selection?: Dynamic) {
  if (selection.shared === null) return noDecimalPlaceChanges(null);
  if (selection.shared.cellControl?.kind !== 'none') return noDecimalPlaceChanges('dropdownOrCheckbox');
  let found = decimalPatternOfSelection(reads, selection);
  if ('why' in found) return noDecimalPlaceChanges(found.why);
  let pattern = found.pattern;
  let places = decimalPlacesOfPattern(pattern);
  if (places === null) {
    let parts: Dynamic = [];
    reads.patternRead(pattern, (part?: Dynamic) => parts.push(part));
    return noDecimalPlaceChanges(NOT_DECIMAL_PATTERN_KINDS.has(parts[0]) ? 'noNumbers' : 'formatHasNone');
  }
  let stepTo = (count?: Dynamic) => {
    if (count < 0 || (count > MAX_DECIMAL_PLACES && count > places)) return null;
    let steppedPattern = withDecimalPlaces(pattern, count);
    let read = reads.patternRead(steppedPattern, sampleValueOfFormatKind);
    return read?.kind === 'numberFormat' && read.shown.kind === 'text'
      ? {
          count: count,
          pattern: steppedPattern,
        }
      : null;
  };
  return {
    more: stepTo(places + 1),
    fewer: stepTo(places - 1),
    whyNeither: null,
  };
}
export const DECIMAL_PLACE_CHANGES = ['fewer', 'more'];
export const noDecimalPlaceChanges = (why?: Dynamic) => ({
  more: null,
  fewer: null,
  whyNeither: why,
});
export const NO_NUMBERS_DECIMAL_CHANGES = noDecimalPlaceChanges('noNumbers');
export const isNumberShownIn = (reads: WorkbookReads, cellId?: Dynamic) => cellValueOf(reads.cellOnShowIn(cellId))?.kind === 'number';
export const isGeneralNumberCell = (reads: WorkbookReads, cellId?: Dynamic) =>
  isNumberShownIn(reads, cellId) && isGeneralPattern(numberFormatOfCell(reads, cellId).pattern);
export const INTEGER_PATTERN = '0';
export const WHOLE_NUMBER_PATTERNS = new (Set as Dynamic)([
  INTEGER_PATTERN,
  withDecimalPlaces(NUMBER_FORMAT_CHOICE_PATTERNS.number.pattern, 0),
]);
export const NOT_DECIMAL_PATTERN_KINDS = new (Set as Dynamic)(['date', 'time', 'dateAndTime', 'duration', 'text']);
