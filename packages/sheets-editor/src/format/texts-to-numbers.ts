import type { Dynamic } from '../dynamic.ts';
import { areasOfAllRanges } from '../selection/several-ranges.ts';
import { makeIsCellFilteredOut } from '../tables/filtered-rows.ts';
import { cellRefOf, areaRefBetween } from '../model/workbook.ts';
import { withNoEffects } from '../state/transitions.ts';
import { isInSpan } from '../grid/geometry.ts';
import { shownCellBlockOfCorners } from '../model/cell-blocks.ts';
import { queueEdits, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function isConvertibleText(reads: WorkbookReads, cellId?: Dynamic) {
  let cell = reads.cellOf(cellId);
  if (cell?.input.kind !== 'text' || cell.textIsEditedAfterTheMark !== true) return false;
  let { value: text } = cell.input;
  let { cellControl: cellControl, numberFormat: numberFormat } = reads.formatOf(cellId);
  let fitsPercent = numberFormat.kind !== 'percent' || text.includes('%');
  let isCustomTextFormat = numberFormat.kind === 'text' && numberFormat.pattern !== '@';
  let digitCount = text.replaceAll(/\D/gu, '').length;
  let exponent = /\d\.?e([+-]?\d+)/iu.exec(text)?.[1];
  let isExponentTooLarge = exponent !== undefined && Math.abs(Number(exponent)) > MAX_CONVERTIBLE_EXPONENT;
  return (
    !text.includes('=') &&
    !/^\s*'/u.test(text) &&
    digitCount > 0 &&
    digitCount <= MAX_DIGITS_OF_CONVERTIBLE_TEXT &&
    !isExponentTooLarge &&
    cellControl.kind === 'none' &&
    fitsPercent &&
    !isCustomTextFormat
  );
}
export function* convertibleTextCells(state: PageState, reads: WorkbookReads): Generator<Dynamic, Dynamic, Dynamic> {
  let areas = areasOfAllRanges(state, reads);
  let seen = areas.length > 1 ? new (Set as Dynamic)() : null;
  for (let area of areas as Dynamic)
    for (let cellId of reads.filledCellsIn(state.sheetId, area) as Dynamic) {
      let key = seen === null ? '' : `${cellId.rowId} ${cellId.columnId}`;
      if (seen?.has(key) === true || !isConvertibleText(reads, cellId)) continue;
      seen?.add(key);
      yield cellId;
    }
}
export function hasConvertibleTexts(state: PageState, reads: WorkbookReads) {
  let isFilteredOut = makeIsCellFilteredOut(state, reads);
  for (let cellId of convertibleTextCells(state, reads) as Dynamic) if (!isFilteredOut(cellId)) return true;
  return false;
}
export function columnRunsOfCells(reads: WorkbookReads, cellIds?: Dynamic, canJoin?: Dynamic) {
  let cells = cellIds.flatMap((cellId?: Dynamic) => {
    let position = reads.positionOfCell(cellId);
    return position === null
      ? []
      : [
          {
            cellId: cellId,
            ...position,
          },
        ];
  });
  cells.sort(
    (one?: Dynamic, other?: Dynamic) =>
      one.columnIndex === other.columnIndex ? one.rowIndex - other.rowIndex : one.columnIndex - other.columnIndex,
  );
  let runs: Dynamic = [];
  let previous: Dynamic;
  for (let entry of cells as Dynamic) {
    let lastRun = runs.at(-1);
    let joins: Dynamic = lastRun !== undefined && previous?.columnIndex === entry.columnIndex;
    for (let rowIndex: Dynamic = (previous?.rowIndex ?? 0) + 1; joins && rowIndex < entry.rowIndex; rowIndex += 1) {
      let between = reads.cellIdAt(entry.cellId.sheetId, rowIndex, entry.columnIndex);
      joins =
        between !== null &&
        canJoin(between, {
          rowIndex: rowIndex,
          columnIndex: entry.columnIndex,
        });
    }
    if (lastRun !== undefined && joins) lastRun[1] = entry.cellId;
    else runs.push([entry.cellId, entry.cellId]);
    previous = entry;
  }
  return runs;
}
export function convertTextsToNumbers(state: PageState, reads: WorkbookReads) {
  let isFilteredOut = makeIsCellFilteredOut(state, reads);
  let texts: Dynamic = [];
  let textFormatCells: Dynamic = [];
  let filteredOutCount: Dynamic = 0;
  for (let cellId of convertibleTextCells(state, reads) as Dynamic) {
    let cell = reads.cellOf(cellId);
    if (cell?.input.kind !== 'text') continue;
    if (isFilteredOut(cellId)) {
      filteredOutCount += 1;
      continue;
    }
    texts.push({
      ...cellRefOf(cellId),
      text: cell.input.value,
    });
    if (reads.formatOf(cellId).numberFormat.kind === 'text') textFormatCells.push(cellId);
    if (texts.length > MAX_TEXTS_CONVERTED)
      return withNoEffects({
        ...state,
        notice: TOO_LARGE_TO_CONVERT_NOTICE,
      });
  }
  if (texts.length === 0) return withNoEffects(state);
  let areas = areasOfAllRanges(state, reads);
  let runs = columnRunsOfCells(
    reads,
    textFormatCells,
    (cellId: Dynamic, { rowIndex: rowIndex, columnIndex: columnIndex }: Dynamic) => {
      let { numberFormat: numberFormat, cellControl: cellControl } = reads.formatOf(cellId);
      return (
        areas.some(
          (area?: Dynamic) =>
            isInSpan(rowIndex, area.topRowIndex, area.rowCount) && isInSpan(columnIndex, area.leftColumnIndex, area.columnCount),
        ) &&
        numberFormat.pattern === '@' &&
        cellControl.kind === 'none'
      );
    },
  );
  if (runs.length >= reads.mostEditsInAStep())
    return withNoEffects({
      ...state,
      notice: TOO_LARGE_TO_CONVERT_NOTICE,
    });
  let pasteEdit = {
    kind: 'pasteTexts',
    sheetId: state.sheetId,
    cells: texts,
    pastedTextIs: 'asTyped',
    localeOfTexts: reads.locale,
  };
  let formatEdits = runs.flatMap(([first, last]: Dynamic) => {
    let cells = shownCellBlockOfCorners(state, reads, areaRefBetween(first, last));
    return cells === null
      ? []
      : [
          {
            kind: 'formatCells',
            cells: cells,
            format: {
              numberFormat: {
                pattern: 'General',
              },
            },
          },
        ];
  });
  return queueEdits(
    {
      ...state,
      lastDone: null,
    },
    [...formatEdits, pasteEdit],
    {
      ...IF_QUEUED_DEFAULTS,
      select: null,
      done: null,
      undoOffer: {
        kind: 'textsConverted',
        count: texts.length,
        leftCount: filteredOutCount,
      },
    },
    {
      isEachPointedAt: false,
    },
  );
}
export function textsConvertedOfferAfterEdit(offer: Dynamic, edit: Dynamic, reads: WorkbookReads) {
  if (offer?.kind !== 'textsConverted') return offer;
  if (edit.kind !== 'pasteTexts') return null;
  let { sheetId: sheetId } = edit;
  let count = edit.cells.filter(
    ({ r: rowId, c: columnId }: Dynamic) =>
      reads.cellOf({
        sheetId: sheetId,
        rowId: rowId,
        columnId: columnId,
      })?.input.kind !== 'text',
  ).length;
  return count === 0
    ? null
    : {
        ...offer,
        count: count,
      };
}
export const MAX_TEXTS_CONVERTED = 3000;
export const MAX_DIGITS_OF_CONVERTIBLE_TEXT = 15;
export const MAX_CONVERTIBLE_EXPONENT = 300;
export const TOO_LARGE_TO_CONVERT_NOTICE = {
  kind: 'editRefused',
  why: 'tooLargeForOneEdit',
  asked: 'otherEdit',
};
