import type { Dynamic } from '../dynamic.ts';
import { listLinesOfCell, cellValueOf, usersOfCell, richTextBoldItalic, levelInList, cellPlainText } from '../model/cell-values.ts';
import { cellTextLayout } from './text-overflow.ts';
import { readCellLink } from '../links/cell-links.ts';
import { shownCellText } from '../format/shown-text.ts';
import { cellTextLinks } from '../links/text-links.ts';
import { hasRoomForText, textRoomInWidth, lineCountWithListGaps } from './cell-metrics.ts';
import { isInSpan } from './geometry.ts';
import { rowHeightForLinesAtDensity } from './cell-metrics-values.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function wrappedTextOfCell(cellId?: Dynamic, isMerged?: Dynamic, sheet?: Dynamic) {
  let cell = sheet.cellOf(cellId);
  let shownCell = cell ?? sheet.spilledCellOf(cellId);
  let format = sheet.formatOf(cellId);
  let listLines = listLinesOfCell(cell);
  if (
    cellTextLayout(cellValueOf(shownCell), {
      isMerged: isMerged,
      isTypedIn: false,
      isOfDropdown: format.cellControl.kind === 'dropdown',
      hasFilterButton: false,
      isPerson: usersOfCell(cell).length > 0,
      linkDrawnAs: readCellLink(cell, format)?.drawnAs ?? null,
      isFormulaShown: false,
      isWrappedByFormat: format.alignment.wrap,
      holdsList: listLines.length > 0,
      hasRoomToWrap: true,
    }) !== 'wrap'
  )
    return null;
  let { text: text } = shownCellText(shownCell, 0, 'point');
  let { bold: bold, italic: italic } = richTextBoldItalic(cell);
  let parts =
    bold || italic
      ? cellTextLinks(cell, format, text, null).parts.map(
          ({ text: text2, marks: marks }: Dynamic) => ({
            text: text2,
            bold: marks.includes('bold'),
            italic: marks.includes('italic'),
          }),
        )
      : [];
  return {
    text: text,
    font: format.font,
    ...(parts.length > 0 && {
      parts: parts,
    }),
    ...(listLines.length > 0 && {
      levelsInLists: listLines.map(({ list: list }: Dynamic) => levelInList(list)),
    }),
    ...(!format.alignment.wrap && {
      areLinesCut: true,
    }),
  };
}
export function wrappedTextToMeasure(cellId: Dynamic, { columnEdges: columnEdges }: Dynamic, sheet?: Dynamic) {
  let position = sheet.positionOfCell(cellId);
  if (position === null) return null;
  let isMerged = sheet.mergedAreaAt(cellId.sheetId, position) !== null;
  let wrappedText = wrappedTextOfCell(cellId, isMerged, sheet);
  let columnWidth = columnEdges.sizeOf(position.columnIndex);
  if (wrappedText === null || !hasRoomForText(columnWidth, wrappedText.font.size)) return null;
  return {
    ...wrappedText,
    widthInPixels: textRoomInWidth(columnWidth),
  };
}
export function hasCellSeveralLines(cellId?: Dynamic, layout?: Dynamic, sheet?: Dynamic) {
  if (cellPlainText(sheet.cellOf(cellId))?.includes('\n') === true) return true;
  let measured = wrappedTextToMeasure(cellId, layout, sheet);
  let [lineCount = 1] = measured === null ? [] : sheet.lineCountsOfWrappedTexts([measured]);
  return lineCount > 1;
}
export function areCellLinesCut(cellId?: Dynamic, layout?: Dynamic, sheet?: Dynamic) {
  let measured = wrappedTextToMeasure(cellId, layout, sheet);
  if (measured?.areLinesCut !== true) return false;
  let [lineCount = 1] = sheet.lineCountsOfWrappedTexts([measured]);
  return lineCount > (measured.levelsInLists?.length ?? 1);
}
export function wrappedTextsInRow(rowId?: Dynamic, rowIndex?: Dynamic, wrapAreas?: Dynamic, layout?: Dynamic, sheet?: Dynamic) {
  let listTexts = [...(sheet.cellsWithListsIn(layout.sheetId).get(rowId)?.keys() ?? [])]
    .flatMap(
      (columnId?: Dynamic) =>
        wrappedTextToMeasure(
          {
            sheetId: layout.sheetId,
            rowId: rowId,
            columnId: columnId,
          },
          layout,
          sheet,
        ) ?? [],
    )
    .filter(({ areLinesCut: areLinesCut }: Dynamic) => areLinesCut === true);
  return [
    ...wrapAreas
      .filter(
        ({ rows: rows }: Dynamic) =>
          rows.some(({ firstIndex: firstIndex, count: count }: Dynamic) => isInSpan(rowIndex, firstIndex, count)),
      )
      .flatMap(
        ({ columns: columns }: Dynamic) =>
          columns.flatMap(
            ({ firstIndex: firstIndex, count: count }: Dynamic) =>
              sheet
                .cellsOnShowIn(layout.sheetId, {
                  topRowIndex: rowIndex,
                  rowCount: 1,
                  leftColumnIndex: firstIndex,
                  columnCount: count,
                })
                .flatMap((input?: Dynamic) => wrappedTextToMeasure(input, layout, sheet) ?? []),
          ),
      ),
    ...listTexts,
  ];
}
export function wrappedRowsInSight(sheetId?: Dynamic, wrapAreas?: Dynamic, sheet?: Dynamic) {
  let rows = sheet.rowsAsTheyStand(sheetId);
  let wrapRowRuns = wrapAreas.flatMap(({ rows: rows2 }: Dynamic) => rows2);
  let rowLines = sheet.linesOf(sheetId)?.rows;
  if (rowLines === undefined || wrapRowRuns.reduce((input: Dynamic, { count: count }: Dynamic) => input + count, 0) >= rows.size)
    return rows;
  let rowsInSight = new (Map as Dynamic)();
  for (let { firstIndex: firstIndex, count: count } of wrapRowRuns as Dynamic)
    for (let rowIndex: Dynamic = firstIndex; rowIndex < firstIndex + count; rowIndex += 1) {
      let rowId = rowLines.idAt(rowIndex);
      let row = rowId === null ? undefined : rows.get(rowId);
      if (rowId !== null && row !== undefined) rowsInSight.set(rowId, row);
    }
  for (let rowId of sheet.cellsWithListsIn(sheetId).keys()) {
    let row = rows.get(rowId);
    if (row !== undefined) rowsInSight.set(rowId, row);
  }
  return rowsInSight;
}
export function lineCountsOfTexts(texts?: Dynamic, sheet?: Dynamic) {
  let measured = texts.filter(({ areLinesCut: areLinesCut }: Dynamic) => areLinesCut !== true);
  let counts = (measured.length === 0 ? [] : sheet.lineCountsOfWrappedTexts(measured)).values();
  return texts.map(
    ({ areLinesCut: areLinesCut, levelsInLists: levelsInLists = [] }: Dynamic) =>
      areLinesCut === true ? levelsInLists.length : (counts.next().value ?? 1),
  );
}
export function rowGrowthsOfTexts(texts?: Dynamic, sheet?: Dynamic, density?: Dynamic) {
  let lineCounts = lineCountsOfTexts(texts, sheet);
  return texts.map(({ font: font, levelsInLists: levelsInLists = [null] }: Dynamic, index?: Dynamic) => {
    let lineCount = lineCounts[index] ?? 1;
    let linesWithGaps = lineCountWithListGaps(lineCount, levelsInLists.length, font.size);
    return lineCount === 1 ? 0 : rowHeightForLinesAtDensity(linesWithGaps, font.size, density);
  });
}
export function rowGrowthCacheOf(layout: Dynamic, { lineCountsOfWrappedTexts: lineCountsOfWrappedTexts }: Dynamic, density?: Dynamic) {
  let byLayout: Dynamic = ROW_GROWTH_CACHES[density].get(lineCountsOfWrappedTexts);
  if (byLayout === undefined) {
    byLayout = new (WeakMap as Dynamic)();
    ROW_GROWTH_CACHES[density].set(lineCountsOfWrappedTexts, byLayout);
  }
  let cache: Dynamic = byLayout.get(layout);
  if (cache === undefined) {
    cache = new (WeakMap as Dynamic)();
    byLayout.set(layout, cache);
  }
  return cache;
}
export function measureWrappedRowGrowth(rows?: Dynamic, wrapAreas?: Dynamic, layout?: Dynamic, sheet?: Dynamic, density?: Dynamic) {
  let cache = rowGrowthCacheOf(layout, sheet, density);
  let growths: Dynamic = [];
  let toMeasure: Dynamic = [];
  for (let [value, value2] of rows as Dynamic) {
    let entry = cache.get(value2);
    if (entry !== undefined) {
      growths.push(entry);
      continue;
    }
    let value3 = sheet.rowIndexOf(layout.sheetId, value);
    let value4 = value3 === null ? [] : wrappedTextsInRow(value, value3, wrapAreas, layout, sheet);
    if (value3 === null || value4.length === 0) cache.set(value2, NO_ROW_GROWTH);
    else
      toMeasure.push({
        row: value2,
        rowIndex: value3,
        texts: value4,
      });
  }
  let rowGrowths = rowGrowthsOfTexts(
    toMeasure.flatMap(({ texts: texts }: Dynamic) => texts),
    sheet,
    density,
  );
  let countIndex: Dynamic = 0;
  for (let { row: value, rowIndex: value2, texts: value3 } of toMeasure as Dynamic) {
    let mapped = rowGrowths.slice(countIndex, countIndex + value3.length);
    countIndex += value3.length;
    let value4 = (Math.max as Dynamic)(...mapped);
    let growth =
      value4 === 0
        ? NO_ROW_GROWTH
        : {
            rowIndex: value2,
            heightInPixels: value4,
          };
    cache.set(value, growth);
    growths.push(growth);
  }
  return growths.filter((input?: Dynamic) => input !== NO_ROW_GROWTH);
}
export function wrappedRowHeightsOfSheet(sheet: Dynamic, book: WorkbookReads, density?: Dynamic) {
  if (!mayRowsGrowInSheet(sheet.sheetId, book)) return [];
  let wrapAreas = book.whereTextWraps(sheet.sheetId);
  let rowsInWrapAreas = wrappedRowsInSight(sheet.sheetId, wrapAreas, book);
  let heights = measureWrappedRowGrowth(rowsInWrapAreas, wrapAreas, sheet, book, density);
  heights.sort((a?: Dynamic, b2?: Dynamic) => a.rowIndex - b2.rowIndex);
  return heights;
}
export function wrappedHeightOfRow(rowId: Dynamic, sheet: Dynamic, book: WorkbookReads, density?: Dynamic) {
  if (sheet === undefined) return 0;
  let wrapAreas = book.whereTextWraps(sheet.sheetId);
  let row = book.rowsAsTheyStand(sheet.sheetId).get(rowId);
  if (!mayRowsGrowInSheet(sheet.sheetId, book) || row === undefined) return 0;
  let [measured] = measureWrappedRowGrowth(new (Map as Dynamic)([[rowId, row]]), wrapAreas, sheet, book, density);
  return measured?.heightInPixels ?? 0;
}
export const mayRowsGrowInSheet = (sheetId?: Dynamic, sheet?: Dynamic) =>
  sheet.whereTextWraps(sheetId).length > 0 || sheet.cellsWithListsIn(sheetId).size > 0;
export const NO_ROW_GROWTH = {
  rowIndex: -1,
  heightInPixels: 0,
};
export const ROW_GROWTH_CACHES = {
  comfortable: new (WeakMap as Dynamic)(),
  compact: new (WeakMap as Dynamic)(),
};
