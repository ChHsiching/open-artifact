import type { Dynamic } from '../dynamic.ts';

// Which kinds of chart suit which cells, and so which kinds the page can swap a chart to by itself, with no agent.
// This module imports nothing of the page, so the tests can load it.

/** The one input that each stock chart program reads. */
export const CHART_ROWS_INPUT = 'rows';
export const PIE_MAX_SLICES = 6;
export const BAR_CHART_MAX_POINTS = 50;
export const isNumberValuedCell = (cell?: Dynamic) => typeof cell?.value === 'number';
export const isYearValuedCell = (cell?: Dynamic) =>
  typeof cell?.value === 'number' && Number.isInteger(cell.value) && cell.value > 1800 && cell.value < 2200;
export function doesChartKindSuitRows(chartKind?: Dynamic, rows?: Dynamic) {
  let rowsWithText = rows.filter((row?: Dynamic) => row.some(({ text: text }: Dynamic) => text !== ''));
  let hasHeaderRow = rowsWithText.length > 1 && rowsWithText[0]?.some(isNumberValuedCell) === false;
  let dataRows = rowsWithText.slice(hasHeaderRow ? 1 : 0);
  let columnCount = dataRows[0]?.length ?? 0;
  let firstColumnIsLabels =
    columnCount > 1 &&
    (!dataRows.some((row?: Dynamic) => isNumberValuedCell(row[0])) || dataRows.every((row?: Dynamic) => isYearValuedCell(row[0])));
  let numberColumns = Array.from<Dynamic, Dynamic>(
    {
      length: columnCount,
    },
    (input?: Dynamic, columnIndex?: Dynamic) => columnIndex,
  ).filter(
    (columnIndex?: Dynamic) =>
      columnIndex >= (firstColumnIsLabels ? 1 : 0) && dataRows.some((row?: Dynamic) => isNumberValuedCell(row[columnIndex])),
  );
  let numbers = dataRows.flatMap(
    (row?: Dynamic) =>
      numberColumns.flatMap((columnIndex?: Dynamic) => (typeof row[columnIndex]?.value === 'number' ? [row[columnIndex].value] : [])),
  );
  let fitsParts =
    numbers.every((number?: Dynamic) => number >= 0) && numbers.filter((number?: Dynamic) => number > 0).length > 1;
  if (chartKind === 'pie') return numberColumns.length === 1 && fitsParts && dataRows.length <= PIE_MAX_SLICES;
  // A stack adds up its columns: numbers down the first column are where scatter points lie, not a part to stack.
  let isScatterShaped = !firstColumnIsLabels && dataRows.length > 1 && dataRows.every((row?: Dynamic) => isNumberValuedCell(row[0]));
  if (chartKind === 'stackedBar')
    return !isScatterShaped && numberColumns.length > 1 && fitsParts && dataRows.length <= BAR_CHART_MAX_POINTS;
  // A scatter places each row by the number in its first column: every row needs one, and another column of numbers.
  if (chartKind === 'scatter')
    return (
      dataRows.length > 1 &&
      dataRows.every((row?: Dynamic) => isNumberValuedCell(row[0])) &&
      numberColumns.some((columnIndex?: Dynamic) => columnIndex > 0)
    );
  // bar, horizontalBar: a bar for each row; line, area: a point for each.
  return chartKind === 'line' || chartKind === 'area' || dataRows.length <= BAR_CHART_MAX_POINTS;
}
/**
 * Whether a chart drawn from these inputs can become a stock chart of this kind by the page alone, with no agent: the
 * stock programs read one input, `rows`, so the chart must read that one input and nothing else, and its rows must suit
 * the kind. Any chart code may be put in place this way, the agent's own included: the change is shown as a preview
 * first, to keep or to discard.
 */
export function canSwapChartKind(inputs: Dynamic, kind: Dynamic): boolean {
  return readsRowsAlone(inputs) && doesChartKindSuitRows(kind, inputs[CHART_ROWS_INPUT]);
}
export const readsRowsAlone = (inputs: Dynamic): boolean =>
  inputs !== null &&
  typeof inputs === 'object' &&
  Array.isArray(inputs[CHART_ROWS_INPUT]) &&
  Object.keys(inputs).length === 1;
