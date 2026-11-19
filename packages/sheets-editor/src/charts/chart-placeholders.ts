import { Skeleton } from '../kit/skeleton.tsx';
import type { Dynamic } from '../dynamic.ts';
import { chartCellsProblem } from './change-offers.ts';
export { chartCellsProblem };
import * as React from 'react';
import { useChartNotice } from './chart-notices.ts';
import { chartCellsProblemWords } from '../messages/charts.ts';
import { jsxs, jsx } from 'react/jsx-runtime';
import { DangerWarningIcon } from '../ui/warning-icon.ts';
export function ChartCellsProblemNotice({ why: why, name: name }: Dynamic) {
  let isError = why === 'cellsHaveErrors';
  useChartNotice(chartCellsProblemWords(why));
  return jsxs('div', {
    className: 'flex size-full flex-col gap-md p-lg',
    children: [
      jsxs('div', {
        className: 'flex min-h-0 flex-col gap-xs overflow-hidden',
        children: [
          jsx('p', {
            'aria-hidden': true,
            title: name,
            className: 'flex-none truncate text-heading font-medium text-primary',
            children: name,
          }),
          jsxs('p', {
            className: `flex flex-none items-start gap-xs text-body text-pretty ${isError ? 'text-danger' : 'text-secondary'}`,
            children: [
              isError &&
                jsx('span', {
                  className: 'flex h-[1lh] flex-none items-center',
                  children: jsx(DangerWarningIcon, {}),
                }),
              chartCellsProblemWords(why),
            ],
          }),
        ],
      }),
      jsx(ChartSkeleton, {}),
    ],
  });
}
export function ChartOnItsWay(props?: Dynamic) {
  let [comesAtOnce] = React.useState(props.comesAtOnce);
  return jsxs('div', {
    'aria-hidden': true,
    className: 'sheet-chart-on-its-way',
    'data-comes-at-once': comesAtOnce,
    children: [
      jsx(Skeleton, {
        decorative: true,
        width: '45%',
        className: 'flex-none text-heading',
      }),
      jsx('div', {
        className: 'sheet-plot-of-chart-on-its-way',
        children: CHART_ON_ITS_WAY_LINES.map(
          (line?: Dynamic) =>
            jsx(
              'div',
              {
                style: styleOfChartLineOnItsWay(line),
              },
              line,
            ),
        ),
      }),
    ],
  });
}
export const CHART_SKELETON_BAR_HEIGHTS = [38, 52, 44, 66, 58, 80, 72, 92];
export const ChartSkeleton = () =>
  jsx('div', {
    'aria-hidden': true,
    className: 'sheet-room-of-chart-skeleton',
    children: jsx('div', {
      className: 'sheet-chart-skeleton',
      children: CHART_SKELETON_BAR_HEIGHTS.map(
        (height?: Dynamic) =>
          jsx(
            'div',
            {
              style: {
                height: `${height}%`,
              },
            },
            height,
          ),
      ),
    }),
  });
export const CHART_ON_ITS_WAY_LINES = [4, 28, 52, 76, 100];
export const styleOfChartLineOnItsWay = (line?: Dynamic) => ({
  '--sheet-line-from-top': `${String(line)}%`,
});
