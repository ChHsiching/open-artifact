import { PIE_MAX_SLICES, BAR_CHART_MAX_POINTS } from './chart-kind-fit.ts';
export { PIE_MAX_SLICES, BAR_CHART_MAX_POINTS };
import type { Dynamic } from '../dynamic.ts';
import { nonEmptyValueOfCell, DATE_TIME_FORMAT_KINDS, isYearCell } from '../selection/figures.ts';
import { numberFormatOfCell } from '../model/workbook.ts';
import { MAX_CHART_SOURCE_ROWS } from './placement.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export let CHART_OFFER_MAX_ROWS: Dynamic;
export let CHART_OFFER_MAX_COLUMNS: Dynamic;
export function chartCellKind(reads: WorkbookReads, sheetId?: Dynamic, rowIndex?: Dynamic, columnIndex?: Dynamic) {
  let cellId = reads.cellIdAt(sheetId, rowIndex, columnIndex);
  let value = nonEmptyValueOfCell(reads, cellId);
  if (cellId === null || value === null) return null;
  if (value.kind !== 'number')
    return {
      is: 'text',
      value: String(value.value).trim().toLowerCase(),
    };
  if (DATE_TIME_FORMAT_KINDS.has(numberFormatOfCell(reads, cellId).kind))
    return {
      is: 'time',
      value: value.value,
    };
  return {
    is: isYearCell(reads, sheetId, {
      rowIndex: rowIndex,
      columnIndex: columnIndex,
    })
      ? 'year'
      : 'amount',
    value: value.value,
  };
}
export function hasRepeatedLabels(cells?: Dynamic) {
  let labels = cells.flatMap((cell?: Dynamic) => (cell === null || cell.value === '' ? [] : [cell.value]));
  return new (Set as Dynamic)(labels).size < labels.length;
}
export function isRepeatingCycle(labels?: Dynamic) {
  let cycleLength = labels.indexOf(labels[0], 1);
  return (
    cycleLength > 1 &&
    new (Set as Dynamic)(labels.slice(0, cycleLength)).size === cycleLength &&
    labels.every((label?: Dynamic, index?: Dynamic) => label === labels[index % cycleLength])
  );
}
export function looksLikeAxisLabels(cells?: Dynamic) {
  let numbers = cells.filter(isChartNumber).map(({ value: value }: Dynamic) => value);
  let steps = numbers.slice(1).map((number?: Dynamic, index?: Dynamic) => number - (numbers[index] ?? 0));
  let isMonotonic =
    steps.some((input?: Dynamic) => input !== 0) &&
    (steps.every((input?: Dynamic) => input >= 0) || steps.every((input?: Dynamic) => input <= 0));
  return !cells.some(isChartAmount) && cells.some((input?: Dynamic) => input !== null) && (numbers.length < 2 || isMonotonic);
}
export function sampleChartPointsEvenly(points?: Dynamic, count?: Dynamic) {
  if (points.length <= count) return points;
  let keptIndexes = new (Set as Dynamic)(
    Array.from<Dynamic, Dynamic>(
      {
        length: count,
      },
      (input?: Dynamic, index?: Dynamic) => Math.round((index * (points.length - 1)) / (count - 1)),
    ),
  );
  return points.filter((input?: Dynamic, index?: Dynamic) => keptIndexes.has(index));
}
export function chartKindsOfferedForCells(reads: WorkbookReads, sheetId?: Dynamic, area?: Dynamic) {
  let { topRowIndex: topRowIndex, leftColumnIndex: leftColumnIndex, rowCount: rowCount, columnCount: columnCount } = area;
  let grid = Array.from<Dynamic, Dynamic>(
    {
      length: Math.min(rowCount, CHART_OFFER_MAX_ROWS),
    },
    (input?: Dynamic, rowOffset?: Dynamic) =>
      Array.from<Dynamic, Dynamic>(
        {
          length: Math.min(columnCount, CHART_OFFER_MAX_COLUMNS),
        },
        (input2?: Dynamic, columnOffset?: Dynamic) => chartCellKind(reads, sheetId, topRowIndex + rowOffset, leftColumnIndex + columnOffset),
      ),
  );
  let filledRows = grid.filter((input?: Dynamic) => input.some((input2?: Dynamic) => input2 !== null));
  let isLabelRow = (row?: Dynamic, rowIndex?: Dynamic) =>
    rowIndex < filledRows.length - 1 &&
    looksLikeAxisLabels(row) &&
    !row.some(
      (input?: Dynamic, options?: Dynamic) => isChartNumber(input) && isChartTimeOrYear(filledRows[rowIndex + 1]?.[options] ?? null),
    );
  let rows = filledRows.slice(
    Math.max(
      0,
      filledRows.findIndex((input?: Dynamic, options?: Dynamic) => !isLabelRow(input, options)),
    ),
  );
  let firstColumn = rows.map((input?: Dynamic) => input[0] ?? null);
  let hasLabelColumn = (rows[0]?.length ?? 0) > 1 && looksLikeAxisLabels(firstColumn);
  let columns = (rows[0] ?? [])
    .map((input?: Dynamic, columnIndex?: Dynamic) => rows.map((input2?: Dynamic) => input2[columnIndex] ?? null))
    .slice(hasLabelColumn ? 1 : 0);
  let series = rows.length === 1 ? [columns.flat()] : columns;
  let hasAmounts = series.some((input?: Dynamic) => input.some(isChartAmount));
  let numberSeries = series
    .filter((input?: Dynamic) => input.filter(isChartNumber).length >= 2 && !(hasAmounts && looksLikeAxisLabels(input)))
    .map((input?: Dynamic) => input.map((input2?: Dynamic) => (isChartNumber(input2) ? input2.value : 0)));
  let skippedRows = filledRows.length - rows.length;
  let isYear = (cell?: Dynamic) => isChartNumber(cell) && Number.isInteger(cell.value) && cell.value > 1800 && cell.value < 2200;
  let isTableShaped =
    columnCount <= CHART_OFFER_MAX_COLUMNS &&
    rows.length > 1 &&
    skippedRows <= 1 &&
    (filledRows[0] ?? []).some(isChartNumber) === (skippedRows === 0) &&
    hasLabelColumn === ((rows[0]?.length ?? 0) > 1 && (!firstColumn.some(isChartNumber) || firstColumn.every(isYear))) &&
    !(hasLabelColumn && firstColumn.includes(null)) &&
    series.filter((input?: Dynamic) => input.some(isChartNumber)).length === numberSeries.length;
  let pointCount = numberSeries[0]?.length ?? 0;
  let allNumbers = numberSeries.flat();
  if (pointCount === 0 || !Number.isFinite(sumOfNumbers(allNumbers.map(Math.abs)))) return [];
  let positives = allNumbers.filter((input?: Dynamic) => input > 0);
  let isAllPositive = allNumbers.every((input?: Dynamic) => input >= 0) && positives.length > 0;
  let isOverTime = hasLabelColumn && firstColumn.some(isChartTimeOrYear);
  let prefersLine = isOverTime || pointCount > LINE_CHART_MIN_POINTS;
  let sourceArea = {
    ...area,
    rowCount: Math.min(rowCount, MAX_CHART_SOURCE_ROWS + 1),
  };
  let shownArea = rowCount > grid.length ? reads.areaOnShowIn(sheetId, sourceArea) : null;
  let rowsBeyond = shownArea === null ? 0 : Math.max(0, shownArea.topRowIndex + shownArea.rowCount - topRowIndex - grid.length);
  let isBarOffered = pointCount + rowsBeyond <= BAR_CHART_MAX_POINTS;
  let isForPage = isTableShaped && grid.length + rowsBeyond <= MAX_CHART_SOURCE_ROWS;
  let isCycle = isRepeatingCycle(firstColumn.map((input?: Dynamic) => input?.value)) && series.length === numberSeries.length;
  let isLabelsRepeated = hasLabelColumn && hasRepeatedLabels(firstColumn) && !isCycle;
  let isTooBigForPage =
    !isOverTime &&
    (hasLabelColumn ? 1 : 0) +
      series.filter((input?: Dynamic) => input.some((input2?: Dynamic) => input2 !== null && input2.value !== '')).length >
      1 &&
    pointCount + rowsBeyond > LEFT_TO_AGENT_MIN_POINTS;
  let isBestLeftToAgent = isLabelsRepeated || isTooBigForPage;
  // Numbers in the first column that are amounts, not labels, with more numbers beside them: points of a scatter.
  let isScatterShaped =
    !hasLabelColumn && rows.length > 2 && firstColumn.every(isChartAmount) && numberSeries.length > 1 && series[0] !== undefined;
  // Labels too long to sit under bars read better down the side of a horizontal bar chart.
  let hasLongLabels =
    hasLabelColumn && firstColumn.some((cell?: Dynamic) => cell?.is === 'text' && String(cell.value).length > LONG_LABEL_LENGTH);
  return [
    isScatterShaped && 'scatter',
    prefersLine && 'line',
    isBarOffered && hasLongLabels && 'horizontalBar',
    isBarOffered && 'bar',
    !prefersLine && 'line',
    // A stack adds up its series; with numbers down the first column, that column would be stacked as one of them.
    isBarOffered && !isScatterShaped && numberSeries.length > 1 && isAllPositive && 'stackedBar',
    numberSeries.length === 1 && isAllPositive && pointCount <= PIE_MAX_SLICES && positives.length > 1 && 'pie',
    isOverTime && isAllPositive && 'area',
    isBarOffered && !hasLongLabels && 'horizontalBar',
  ]
    .flatMap((input?: Dynamic) => (input === false ? [] : [input]))
    .slice(0, MAX_CHART_OFFERS)
    .map(
      (kind?: Dynamic) => ({
        kind: kind,
        isForPage: isForPage,
        isBestLeftToAgent: isBestLeftToAgent,
        series: numberSeries
          .slice(0, CHART_PREVIEW_SAMPLE_SIZES[kind].series)
          .map((input?: Dynamic) => sampleChartPointsEvenly(input, CHART_PREVIEW_SAMPLE_SIZES[kind].points)),
      }),
    );
}
export const INSERT_CHART_LABEL = 'Insert chart';
export const chartAskPayload = (chartKind?: Dynamic, request?: Dynamic) => ({
  chartKind: chartKind,
  ...(request !== '' && {
    request: request,
  }),
});
export const IS_CHART_OFFER_AT_SELECTION_ON = false;
[CHART_OFFER_MAX_ROWS, CHART_OFFER_MAX_COLUMNS] = [100, 8];
export const MAX_CHART_OFFERS = 4;
export const LONG_LABEL_LENGTH = 12;
export const CHART_PREVIEW_SAMPLE_SIZES = {
  bar: {
    series: 2,
    points: 4,
  },
  stackedBar: {
    series: 3,
    points: 5,
  },
  line: {
    series: 3,
    points: 12,
  },
  pie: {
    series: 1,
    points: 6,
  },
  area: {
    series: 2,
    points: 12,
  },
  horizontalBar: {
    series: 2,
    points: 4,
  },
  scatter: {
    series: 3,
    points: 12,
  },
};
export const LINE_CHART_MIN_POINTS = 8;
export const LEFT_TO_AGENT_MIN_POINTS = 24;
export const isChartNumber = (role?: Dynamic) => role?.is === 'amount' || role?.is === 'year';
export const isChartAmount = (role?: Dynamic) => role?.is === 'amount';
export const isChartTimeOrYear = (role?: Dynamic) => role?.is === 'time' || role?.is === 'year';
export const sumOfNumbers = (numbers?: Dynamic) =>
  numbers.reduce((total?: Dynamic, number?: Dynamic) => total + number, 0);
export const isChartMadeByPage = (offer?: Dynamic, canLeaveToAgent?: Dynamic) =>
  offer?.isForPage === true && !(offer.isBestLeftToAgent && canLeaveToAgent);
export const NO_CHART_OFFERS: Dynamic = [];
export const chartOffersForPage = (offers?: Dynamic, canLeaveToAgent?: Dynamic) =>
  isChartMadeByPage(offers[0], canLeaveToAgent) ? offers : NO_CHART_OFFERS;
export const chartOfferAtSelection = (offers?: Dynamic, isOn: Dynamic = IS_CHART_OFFER_AT_SELECTION_ON) =>
  isOn ? offers[0] : undefined;
