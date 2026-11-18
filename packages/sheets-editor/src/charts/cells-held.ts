import type { Dynamic } from '../dynamic.ts';
import { shownCellText } from '../format/shown-text.ts';
import { MAX_FIND_SHOWN_CHARACTERS } from '../ui/find.ts';
import { pickTellingRowsForAgent } from './chart-code-ask.ts';
import { nonEmptyValueOfCell, DATE_TIME_FORMAT_KINDS } from '../selection/figures.ts';
import { numberFormatOfCell } from '../model/workbook.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function heldAreaOf(
  reads: WorkbookReads,
  sheetId: Dynamic,
  { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount }: Dynamic,
) {
  let lines = reads.linesOf(sheetId);
  if (lines === null) return null;
  let heldRows = heldRunsOfLines(lines.rows, topRowIndex, rowCount);
  let heldColumns = heldRunsOfLines(lines.columns, leftColumnIndex, columnCount);
  return heldRows === null || heldColumns === null
    ? null
    : {
        sheetId: sheetId,
        rows: heldRows,
        columns: heldColumns,
      };
}
export function stretchOfHeldRuns(lines: Dynamic, { runs: runs, count: count }: Dynamic, allowsGaps?: Dynamic) {
  let stretches = runs.flatMap((run?: Dynamic) => lines.stretchesOf(run));
  let firstIndex = stretches.reduce((lowest?: Dynamic, stretch?: Dynamic) => Math.min(lowest, stretch.firstIndex), 1 / 0);
  let endIndex = stretches.reduce(
    (highest?: Dynamic, stretch?: Dynamic) => Math.max(highest, stretch.firstIndex + stretch.count),
    0,
  );
  let isCountMatched = stretches.reduce((total?: Dynamic, stretch?: Dynamic) => total + stretch.count, 0) === count;
  let isWithoutGaps = stretches.every((stretch?: Dynamic, index?: Dynamic) => {
    let previous = stretches[index - 1];
    return previous === undefined || previous.firstIndex + previous.count === stretch.firstIndex;
  });
  return isCountMatched && endIndex - firstIndex === count && (allowsGaps || isWithoutGaps)
    ? {
        firstIndex: firstIndex,
        count: count,
      }
    : null;
}
export function areaOfHeld(reads: WorkbookReads, { sheetId: sheetId, rows: rows, columns: columns }: Dynamic) {
  let lines = reads.linesOf(sheetId);
  let rowStretch = lines === null ? null : stretchOfHeldRuns(lines.rows, rows, true);
  let columnStretch = lines === null ? null : stretchOfHeldRuns(lines.columns, columns, false);
  return rowStretch === null || columnStretch === null
    ? null
    : {
        topRowIndex: rowStretch.firstIndex,
        leftColumnIndex: columnStretch.firstIndex,
        rowCount: rowStretch.count,
        columnCount: columnStretch.count,
      };
}
export function sampleOfAreaForChart(reads: WorkbookReads, sheetId: Dynamic, area: Dynamic, [firstRowsWanted, maxColumns]: Dynamic) {
  let shownArea = reads.areaOnShowIn(sheetId, area);
  if (shownArea === null) return null;
  let rowCount = shownArea.topRowIndex + shownArea.rowCount - area.topRowIndex;
  let columnCount = shownArea.leftColumnIndex + shownArea.columnCount - area.leftColumnIndex;
  let textAt = (rowOffset?: Dynamic, columnOffset?: Dynamic) => {
    let cellId = reads.cellIdAt(sheetId, area.topRowIndex + rowOffset, area.leftColumnIndex + columnOffset);
    let cell = cellId === null ? null : reads.cellOnShowIn(cellId);
    return cell === null ? '' : shownCellText(cell, MAX_FIND_SHOWN_CHARACTERS, reads.decimalSign).text;
  };
  let textsOfRows = (firstRow?: Dynamic, count?: Dynamic) =>
    Array.from<Dynamic, Dynamic>(
      {
        length: count,
      },
      (input?: Dynamic, index?: Dynamic) =>
        Array.from<Dynamic, Dynamic>(
          {
            length: Math.min(columnCount, maxColumns),
          },
          (input2?: Dynamic, columnOffset?: Dynamic) => textAt(firstRow + index, columnOffset),
        ),
    );
  let { last: lastRows, withGaps: rowsWithGaps } = pickTellingRowsForAgent(
    [rowCount, columnCount],
    (rowOffset?: Dynamic, columnOffset?: Dynamic) => {
      let cellId = reads.cellIdAt(sheetId, area.topRowIndex + rowOffset, area.leftColumnIndex + columnOffset);
      let value = nonEmptyValueOfCell(reads, cellId);
      if (cellId === null || value === null) return 'nothing';
      let isPickedFromList = DATE_TIME_FORMAT_KINDS.has(numberFormatOfCell(reads, cellId).kind);
      return value.kind === 'number' && !isPickedFromList ? 'number' : 'somethingElse';
    },
  );
  let rowSample = (rowOffset?: Dynamic) => ({
    row: rowOffset + 1,
    texts: textsOfRows(rowOffset, 1).flat(),
  });
  return {
    rowCount: rowCount,
    firstRows: textsOfRows(0, Math.min(rowCount, firstRowsWanted)),
    lastRows: lastRows.map(rowSample),
    rowsWithGaps: rowsWithGaps.map(rowSample),
  };
}
export const heldRunsOfLines = (lines?: Dynamic, firstIndex?: Dynamic, count?: Dynamic) =>
  firstIndex + count > lines.count
    ? null
    : {
        runs: lines.runsIn({
          firstIndex: firstIndex,
          count: count,
        }),
        count: count,
      };
export const isSingleCellSample = ({ rowCount: rowCount, firstRows: firstRows }: Dynamic) =>
  rowCount === 1 && firstRows[0]?.length === 1;
