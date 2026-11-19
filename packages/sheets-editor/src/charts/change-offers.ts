import type { Dynamic } from '../dynamic.ts';
import { canSwapChartKind, readsRowsAlone } from './chart-kind-fit.ts';
import { STOCK_KINDS } from './stock-programs.ts';

// What "Change chart type" offers for a chart. It lives apart from the layer that draws the menu, so that it can be
// tested without the layer's components.

/** Why the cells a chart reads cannot be drawn: none holds a number, or some hold errors. Null when they can be. */
export function chartCellsProblem(inputs?: Dynamic) {
  let areas = Object.values(inputs);
  if (areas.length === 0) return null;
  let hasErrorCells: Dynamic = false;
  for (let area of areas as Dynamic) {
    let hasManyColumns = area.some((row?: Dynamic) => row.length > 1);
    for (let [rowIndex, row] of area.entries() as Dynamic)
      for (let [columnIndex, { value: value, text: text }] of row.entries() as Dynamic) {
        let isLabelCell = (rowIndex === 0 && area.length > 1) || (columnIndex === 0 && hasManyColumns);
        if (typeof value === 'number' || (value !== null && !isLabelCell)) return null;
        hasErrorCells ||= value === null && text !== '';
      }
  }
  return hasErrorCells ? 'cellsHaveErrors' : 'cellsHaveNoNumbers';
}
/** Whether this chart can be changed here: by a kind swap the page makes alone, or by the agent. */
export const canAskChartChange = (changes?: Dynamic, chart?: Dynamic, canAgentWrite: Dynamic = false) =>
  changes !== null &&
  chart.kind !== 'none' &&
  chartCellsProblem(chart.inputs) === null &&
  (canAgentWrite || STOCK_KINDS.some((kind?: Dynamic) => canSwapChartKind(chart.inputs, kind)));
/**
 * The kinds offered under "Change chart type": each kind the page can swap this chart to by itself, leaving out the
 * kind it is now. A chart the page cannot swap (one that reads inputs other than `rows`) is offered the first four
 * kinds, for the agent to write, and none when no agent can.
 */
export function chartChangeOffers(chart: Dynamic, kindNow: Dynamic, canAgentWrite: Dynamic) {
  if (chart.kind === 'none') return [];
  let offerOf = (kind?: Dynamic, isSwap?: Dynamic) => ({
    ...CHART_CHANGE_OFFERS.find((offer?: Dynamic) => offer.kind === kind),
    isSwap: isSwap,
  });
  if (!readsRowsAlone(chart.inputs)) return canAgentWrite ? AGENT_CHANGE_KINDS.map((kind?: Dynamic) => offerOf(kind, false)) : [];
  return CHART_CHANGE_OFFERS.filter(({ kind: kind }: Dynamic) => kind !== kindNow && canSwapChartKind(chart.inputs, kind)).map(
    ({ kind: kind }: Dynamic) => offerOf(kind, true),
  );
}
export const AGENT_CHANGE_KINDS = ['bar', 'stackedBar', 'line', 'pie'];
export const CHART_CHANGE_OFFERS = [
  {
    kind: 'bar',
    series: [
      [3, 5, 4, 7],
      [2, 3, 5, 4],
    ],
  },
  {
    kind: 'horizontalBar',
    series: [
      [7, 5, 4],
      [4, 6, 2],
    ],
  },
  {
    kind: 'stackedBar',
    series: [
      [3, 4, 3, 5, 4],
      [2, 2, 3, 2, 4],
      [1, 2, 1, 2, 2],
    ],
  },
  {
    kind: 'line',
    series: [
      [2, 4, 3, 6, 5, 8],
      [1, 2, 4, 3, 5, 4],
    ],
  },
  {
    kind: 'area',
    series: [
      [2, 4, 3, 6, 5, 8],
      [1, 2, 3, 2, 4, 3],
    ],
  },
  {
    kind: 'pie',
    series: [[5, 3, 2, 1]],
  },
  {
    kind: 'scatter',
    series: [
      [1, 2, 3, 4, 5, 6, 7],
      [2, 5, 3, 6, 4, 8, 7],
    ],
  },
];
